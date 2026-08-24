/**
 * Unit tests for media-aggregator ingestion: parseFeedXml (RSS + Atom, category
 * filter, malformed skip), toArticle mapping (html-strip, ISO date, id/source),
 * and ingestAll (fetch → map → URL-dedup, per-feed failure fall-through). Real
 * enrich/dedup/sanitize/stable-id helpers are used; net-guard and feeds are mocked.
 */

jest.mock('./net-guard', () => {
  class UnsafeUrlError extends Error {}
  class ResponseTooLargeError extends Error {}
  return { safeFetch: jest.fn(), UnsafeUrlError, ResponseTooLargeError };
});
jest.mock('./feeds', () => ({
  FEEDS: [
    {
      id: 'f1',
      name: 'Feed One',
      type: 'regional',
      homepage: 'https://f1',
      url: 'https://f1/rss',
      params: { rss: 'news' },
    },
  ],
}));
jest.mock('@utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import { parseFeedXml, toArticle, ingestAll } from './ingest';
import { safeFetch, UnsafeUrlError } from './net-guard';
import type { FeedSource, RawItem } from './types';

const mockSafeFetch = safeFetch as jest.Mock;

const source = (over: Partial<FeedSource> = {}): FeedSource =>
  ({
    id: 'f1',
    name: 'Feed One',
    type: 'regional',
    homepage: 'https://f1',
    url: 'https://f1/rss',
    ...over,
  }) as FeedSource;

beforeEach(() => jest.clearAllMocks());

describe('parseFeedXml — RSS', () => {
  const RSS = `<rss><channel>
    <item><title>Title A</title><link>https://a</link><description>Desc A</description><pubDate>Tue, 01 Jul 2026 10:00:00 GMT</pubDate><guid>g1</guid><category>News</category></item>
    <item><title></title><link>https://b</link></item>
    <item><title>Title C</title></item>
  </channel></rss>`;

  it('maps items and skips those missing a title or link', () => {
    const items = parseFeedXml(RSS, source());
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      title: 'Title A',
      link: 'https://a',
      description: 'Desc A',
      guid: 'g1',
      category: 'News',
    });
  });

  it('applies the category filter', () => {
    const other = parseFeedXml(RSS, source({ categoryFilter: 'sport' }));
    expect(other).toHaveLength(0); // 'News' != 'sport'
    const news = parseFeedXml(RSS, source({ categoryFilter: 'news' }));
    expect(news).toHaveLength(1);
  });

  it('returns [] for a document that is neither RSS nor Atom', () => {
    expect(parseFeedXml('<html></html>', source())).toEqual([]);
  });
});

describe('parseFeedXml — Atom', () => {
  const ATOM = `<feed>
    <entry><title>Atom A</title><link href="https://a1" rel="alternate"/><summary>Sum A</summary><updated>2026-07-01T10:00:00Z</updated><id>id1</id></entry>
    <entry><title>Atom B</title><link href="https://b-self" rel="self"/><link href="https://b-alt" rel="alternate"/><content>Content B</content><published>2026-07-02</published><id>id2</id></entry>
  </feed>`;

  it('resolves the alternate link from single and multiple link elements', () => {
    const items = parseFeedXml(ATOM, source());
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ title: 'Atom A', link: 'https://a1', guid: 'id1' });
    expect(items[1].link).toBe('https://b-alt'); // picks rel=alternate from the array
  });
});

describe('toArticle', () => {
  const raw = (over: Partial<RawItem> = {}): RawItem => ({
    title: '<b>Hello</b> Flevoland',
    link: 'https://x',
    description: 'A short summary of the article.',
    pubDate: 'Tue, 01 Jul 2026 10:00:00 GMT',
    guid: 'g',
    source: source(),
    ...over,
  });

  it('strips HTML, converts the date to ISO, and carries the source', () => {
    const art = toArticle(raw());
    expect(art.canonical_url).toBe('https://x');
    expect(art.title).not.toContain('<b>');
    expect(art.published_at).toBe(new Date('Tue, 01 Jul 2026 10:00:00 GMT').toISOString());
    expect(art.id).toBeTruthy();
    expect(art.source).toEqual({ name: 'Feed One', type: 'regional', homepage: 'https://f1' });
  });

  it('keeps an unparseable date string as-is', () => {
    expect(toArticle(raw({ pubDate: 'not a date' })).published_at).toBe('not a date');
  });
});

describe('ingestAll', () => {
  it('fetches, maps, and de-duplicates by URL across the corpus', async () => {
    mockSafeFetch.mockResolvedValue(`<rss><channel>
      <item><title>One</title><link>https://dup</link></item>
      <item><title>One again</title><link>https://dup</link></item>
      <item><title>Two</title><link>https://two</link></item>
    </channel></rss>`);

    const articles = await ingestAll();

    expect(articles.map((a) => a.canonical_url).sort()).toEqual(['https://dup', 'https://two']);
    // params are appended to the feed URL before fetching
    expect(mockSafeFetch).toHaveBeenCalledWith(
      expect.stringContaining('https://f1/rss?rss=news'),
      expect.any(Object)
    );
  });

  it('falls through to [] when a feed is blocked by the security policy', async () => {
    mockSafeFetch.mockRejectedValue(new UnsafeUrlError('unsafe'));
    await expect(ingestAll()).resolves.toEqual([]);
  });

  it('falls through to [] on a generic feed error', async () => {
    mockSafeFetch.mockRejectedValue(new Error('timeout'));
    await expect(ingestAll()).resolves.toEqual([]);
  });
});

describe('parseFeedXml — element shapes the happy-path fixtures do not produce', () => {
  it('reads a CDATA/attribute node that carries its value in #text', () => {
    const xml = `<rss><channel><item>
      <title someattr="x">Kop met attribuut</title>
      <link>https://f1/a</link>
      <guid isPermaLink="false">g-1</guid>
    </item></channel></rss>`;
    const [item] = parseFeedXml(xml, source());
    expect(item).toMatchObject({ title: 'Kop met attribuut', guid: 'g-1' });
  });

  it('coerces a non-string, non-object node to text', () => {
    // fast-xml-parser hands back a number for a purely numeric element.
    const xml = `<rss><channel><item>
      <title>2026</title><link>https://f1/a</link>
    </item></channel></rss>`;
    const [item] = parseFeedXml(xml, source());
    expect(item.title).toBe('2026');
  });

  it('falls back to summary, date and link for feeds that omit the usual elements', () => {
    const xml = `<rss><channel><item>
      <title>Kop</title>
      <link>https://f1/a</link>
      <summary>Uit summary</summary>
      <date>2026-08-01</date>
    </item></channel></rss>`;
    const [item] = parseFeedXml(xml, source());
    expect(item).toMatchObject({
      description: 'Uit summary',
      pubDate: '2026-08-01',
      guid: 'https://f1/a',
    });
  });

  it('treats an RSS channel with no items as an empty feed', () => {
    expect(parseFeedXml('<rss><channel></channel></rss>', source())).toEqual([]);
  });

  it('treats an Atom feed with no entries as an empty feed', () => {
    expect(parseFeedXml('<feed></feed>', source())).toEqual([]);
  });

  it('resolves an Atom link given as a single element rather than a list', () => {
    const xml = `<feed><entry>
      <title>Kop</title>
      <link href="https://f1/atom-a"/>
      <content>Inhoud</content>
      <published>2026-08-01</published>
    </entry></feed>`;
    const [item] = parseFeedXml(xml, source());
    expect(item).toMatchObject({
      link: 'https://f1/atom-a',
      description: 'Inhoud',
      pubDate: '2026-08-01',
      guid: 'https://f1/atom-a',
    });
  });

  it('falls back to the first Atom link when none is marked alternate', () => {
    const xml = `<feed><entry>
      <title>Kop</title>
      <link rel="self" href="https://f1/self"/>
      <link rel="edit" href="https://f1/edit"/>
    </entry></feed>`;
    const [item] = parseFeedXml(xml, source());
    expect(item.link).toBe('https://f1/self');
  });

  it('yields an empty link when the Atom entry has no link at all', () => {
    const xml = '<feed><entry><title>Kop</title></entry></feed>';
    expect(parseFeedXml(xml, source())).toEqual([]);
  });
});

describe('ingestAll — non-Error feed failures', () => {
  it('logs and skips a feed whose fetch rejects with a string', async () => {
    mockSafeFetch.mockRejectedValue('socket hang up');
    await expect(ingestAll()).resolves.toEqual([]);
  });
});
