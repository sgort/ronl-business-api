/**
 * Unit tests for eu.client — parseRssFeed (pure function, no network).
 * Covers: title extraction, Dutch type labels, ref extraction, date parsing,
 * Dutch term expansion via EU_TO_NL_TERMS, and agenda-item filtering.
 */

jest.mock('@utils/config', () => ({
  config: { pa: { euApiBase: '', cacheTtlTk: 900 }, redis: { url: '' } },
}));
jest.mock('@utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));
jest.mock('../pa-cache', () => ({
  cacheGet: jest.fn().mockResolvedValue(null),
  cacheSet: jest.fn().mockResolvedValue(undefined),
}));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseRssFeed, fetchEuFeed, inferType, parseRssFile } from './eu.client';
import { cacheGet } from '../pa-cache';

const FIXTURE_PATH = join(__dirname, '__fixtures__', 'ep-plenary.rss.xml');
const FIXTURE = readFileSync(FIXTURE_PATH, 'utf-8');

const mockFetch = jest.fn();
(global as unknown as { fetch: jest.Mock }).fetch = mockFetch;
const mockCacheGet = cacheGet as jest.Mock;

describe('parseRssFeed (fixture: ep-plenary.rss.xml)', () => {
  let items: ReturnType<typeof parseRssFeed>;

  beforeAll(() => {
    items = parseRssFeed(FIXTURE);
  });

  it('returns at least one FeedItem', () => {
    expect(items.length).toBeGreaterThan(0);
  });

  it('every item has a non-empty title', () => {
    items.forEach((item) => {
      expect(item.title).toBeTruthy();
      expect(item.title.length).toBeGreaterThan(0);
    });
  });

  it('source is always "eu"', () => {
    items.forEach((item) => expect(item.source).toBe('eu'));
  });

  it('extracts the normalised EP ref as id (e.g. A-10-2026-0099)', () => {
    const natRestItem = items.find((i) => i.id === 'A-10-2026-0099');
    expect(natRestItem).toBeDefined();
  });

  it('derives the doceo NL URL from the ref', () => {
    const item = items.find((i) => i.id === 'A-10-2026-0099');
    expect(item?.url).toBe('https://www.europarl.europa.eu/doceo/document/A-10-2026-0099_NL.html');
  });

  it('parses pubDate to ISO date string', () => {
    const item = items.find((i) => i.id === 'A-10-2026-0099');
    expect(item?.date).toBe('2026-06-20');
  });

  it('preserves Dutch document-type labels from RSS category', () => {
    const verslag = items.find((i) => i.id === 'A-10-2026-0099');
    expect(verslag?.type).toBe('Verslag');

    const motie = items.find((i) => i.id === 'B-10-2026-0042');
    expect(motie?.type).toBe('Motie');
  });

  it('adds Dutch terms stikstof + natuurherstelverordening to nature-restoration item description', () => {
    const item = items.find((i) => i.id === 'A-10-2026-0099');
    expect(item?.description).toContain('stikstof');
    expect(item?.description).toContain('natuurherstelverordening');
  });

  it('adds Dutch terms netcapaciteit + netbeheerder to electricity-grid item description', () => {
    const item = items.find((i) => i.id === 'A-10-2026-0100');
    expect(item?.description).toContain('netcapaciteit');
    expect(item?.description).toContain('netbeheerder');
  });

  it('does not add Dutch terms to an unrelated item (Morocco aviation)', () => {
    const item = items.find((i) => i.id === 'A-10-2026-0177');
    // Description should just be the stripped English text, no Dutch expansion bracket
    expect(item?.description).not.toContain('stikstof');
    expect(item?.description).not.toContain('netcapaciteit');
  });

  it('filters out agenda items that have no valid EP document ref', () => {
    // Fixture contains "Ontwerpagenda" with guid OJPL_OJQ-... which has no A-/B-/TA- ref
    const agendaItem = items.find((i) => i.title?.startsWith('Ontwerpagenda'));
    expect(agendaItem).toBeUndefined();
  });

  it('returns an empty array for invalid XML', () => {
    expect(parseRssFeed('not xml at all')).toEqual([]);
    expect(parseRssFeed('')).toEqual([]);
  });
});

describe('inferType', () => {
  it.each([
    ['A-10-2026-0099', 'Verslag'],
    ['B-10-2026-0042', 'Motie'],
    ['RC-10-2026-0001', 'Gezamenlijke motie'],
    ['TA-10-2026-0005', 'Aangenomen tekst'],
    ['E-000123/2026', 'Schriftelijke vraag'],
    ['O-000045/2026', 'Mondelinge vraag'],
  ])('maps %s → %s by prefix', (ref, label) => {
    expect(inferType(ref)).toBe(label);
  });

  it('returns null for an unknown prefix', () => {
    expect(inferType('Z-10-2026-0001')).toBeNull();
  });
});

describe('parseRssFile', () => {
  it('parses a local RSS file into FeedItems', () => {
    expect(parseRssFile(FIXTURE_PATH).length).toBeGreaterThan(0);
  });

  it('returns [] when the file cannot be read', () => {
    expect(parseRssFile(join(__dirname, '__fixtures__', 'does-not-exist.xml'))).toEqual([]);
  });
});

describe('fetchEuFeed', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
  });

  const okResponse = (xml: string) => ({ ok: true, status: 200, text: async () => xml });

  it('fetches both feeds, dedupes by ref, and returns a page + total', async () => {
    // Both the plenary and press-release feeds return the same fixture → dedup collapses them.
    mockFetch.mockResolvedValue(okResponse(FIXTURE));
    const unique = parseRssFeed(FIXTURE).length;

    const res = await fetchEuFeed(null, [], 0, 20);

    expect(mockFetch).toHaveBeenCalledTimes(2); // plenary + press-releases
    expect(res.total).toBe(unique);
    expect(res.items.length).toBe(Math.min(unique, 20));
    // no duplicate ids survive the merge
    expect(new Set(res.items.map((i) => i.id)).size).toBe(res.items.length);
  });

  it('applies skip/top paging over the merged, date-sorted set', async () => {
    mockFetch.mockResolvedValue(okResponse(FIXTURE));
    const res = await fetchEuFeed(null, [], 1, 2);
    expect(res.skip).toBe(1);
    expect(res.top).toBe(2);
    expect(res.items.length).toBeLessThanOrEqual(2);
  });

  it('serves a cached feed without hitting the network', async () => {
    mockCacheGet.mockResolvedValue([{ id: 'A-10-2026-0099' }]); // both feeds hit cache
    const res = await fetchEuFeed();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(res.total).toBe(1); // deduped across both cached feeds
  });

  it('falls through to [] for a feed that returns a non-ok status', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 503, text: async () => '' });
    const res = await fetchEuFeed();
    expect(res.items).toEqual([]);
    expect(res.total).toBe(0);
  });

  it('falls through to [] for a feed that throws', async () => {
    mockFetch.mockRejectedValue(new Error('network down'));
    const res = await fetchEuFeed();
    expect(res.items).toEqual([]);
  });
});

describe('parseRssFeed — item shapes the plenary fixture does not contain', () => {
  const rss = (items: string) =>
    `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel>${items}</channel></rss>`;

  it('takes the ref straight from the guid, underscores and all', () => {
    // The real feed's guids wrap the ref in underscores. This used to fail: the
    // pattern was \b-anchored and _ is a word character, so no boundary existed
    // between "RR_" and "A-10-…", leaving every ref to the title fallback.
    const items = parseRssFeed(
      rss(`<item>
        <title>Verslag zonder ref in de titel</title>
        <guid isPermaLink="false">RR_A-10-2026-0181_v02-00_EN</guid>
      </item>`)
    );
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('A-10-2026-0181');
  });

  it.each([
    ['RC_RC-10-2026-0345_REV1_NL', 'RC-10-2026-0345'],
    ['RE_B-10-2026-0338_REV1_NL', 'B-10-2026-0338'],
    ['TA_TA-10-2026-0270_FINAL_NL', 'TA-10-2026-0270'],
    ['RR_A-10-2026-0099_v01-00_EN', 'A-10-2026-0099'],
  ])('recovers the ref from the real guid shape %s', (guid, expected) => {
    // Guid shapes taken verbatim from the live plenary feed. All four carry
    // Dutch prose titles with no "A10-0099/2026" suffix, so before this fix the
    // title fallback could not help and the items were dropped — half the feed.
    const [item] = parseRssFeed(
      rss(`<item>
        <title>Gezamenlijke ontwerpresolutie over een onderwerp</title>
        <guid isPermaLink="false">${guid}</guid>
      </item>`)
    );
    expect(item.id).toBe(expected);
  });

  it('does not truncate a longer digit run into a false ref', () => {
    // What the trailing (?!\d) guards: without it "…-04567" matches as "…-0456".
    expect(
      parseRssFeed(
        rss(`<item>
          <title>Iets zonder ref in de titel</title>
          <guid isPermaLink="false">RR_A-10-2026-04567_v01_EN</guid>
        </item>`)
      )
    ).toHaveLength(0);
  });

  it('drops an item that has no title at all', () => {
    expect(parseRssFeed(rss('<item><guid>RR A-10-2026-0181 v02</guid></item>'))).toHaveLength(0);
  });

  it('reads a single non-repeated category element', () => {
    const [item] = parseRssFeed(
      rss(`<item>
        <title>Verslag A10-0181/2026</title>
        <category domain="type">Verslag</category>
      </item>`)
    );
    expect(item.type).toBe('Verslag');
  });

  it('infers the type from the ref prefix when no type category is present', () => {
    const [item] = parseRssFeed(
      rss(`<item>
        <title>Iets A10-0182/2026</title>
        <category domain="body">ENVI</category>
      </item>`)
    );
    expect(item.type).not.toBe('');
  });

  it('tolerates an item with neither a description nor a pubDate', () => {
    const [item] = parseRssFeed(rss('<item><title>Iets A10-0183/2026</title></item>'));
    expect(item.date).toBeNull();
    expect(typeof item.title).toBe('string');
  });
});

describe('fetchEuFeed — degraded upstreams', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
  });

  it('returns an empty feed when the fetch rejects with a non-Error', async () => {
    mockFetch.mockRejectedValue('socket hang up');
    const res = await fetchEuFeed(null, [], 0, 20);
    expect(res.items).toEqual([]);
    expect(res.total).toBe(0);
  });

  it('sorts date-less items without crashing on the comparison', async () => {
    const undated =
      '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel>' +
      '<item><title>Eerste A10-0191/2026</title></item>' +
      '<item><title>Tweede A10-0192/2026</title></item>' +
      '</channel></rss>';
    mockFetch.mockResolvedValue({ ok: true, status: 200, text: async () => undated });
    const res = await fetchEuFeed(null, [], 0, 20);
    expect(res.items.map((i) => i.id).sort()).toEqual(['A-10-2026-0191', 'A-10-2026-0192']);
  });
});

describe('parseRssFeed — press releases', () => {
  const rss = (items: string) =>
    `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel>${items}</channel></rss>`;

  // Verbatim from the live press-releases feed.
  const pressItem = (over: { title?: string; link?: string; guid?: string } = {}) => `<item>
      <title>${over.title ?? 'Press release - EU-China relations: Foreign Affairs Committee to visit Beijing'}</title>
      <link>${over.link ?? 'https://www.europarl.europa.eu/news/en/press-room/20260716IPR46531/'}</link>
      <guid isPermaLink="false">${over.guid ?? 'IPR-COM_IPR-2026-07-16-46531_EN'}</guid>
      <category domain="type">Persbericht</category>
      <category domain="body">AFET</category>
      <pubDate>Fri, 17 Jul 2026 07:53:00 GMT</pubDate>
    </item>`;

  it('keeps a press release, identified by the IPR code in its public URL', () => {
    // A press release carries no EP document ref, so before this it was dropped
    // outright — the whole feed contributed nothing.
    const [item] = parseRssFeed(rss(pressItem()));
    expect(item).toMatchObject({
      id: '20260716IPR46531',
      number: '20260716IPR46531',
      source: 'eu',
      subbron: 'ep-persbericht',
      type: 'Persbericht',
      url: 'https://www.europarl.europa.eu/news/en/press-room/20260716IPR46531/',
      date: '2026-07-17',
    });
  });

  it('links to the press-room page, not a doceo document URL', () => {
    // doceoUrl builds .../doceo/document/<ref>_NL.html, which does not exist for
    // a press release; its own <link> is the canonical page.
    const [item] = parseRssFeed(rss(pressItem()));
    expect(item.url).not.toContain('/doceo/');
    expect(item.url).toContain('/press-room/');
  });

  it('takes the id from the link, not the guid, when both carry an IPR code', () => {
    // The guid spells the same identity as IPR-2026-07-16-46531; the link form
    // is the one EP publishes and a human would recognise.
    const [item] = parseRssFeed(rss(pressItem()));
    expect(item.id).toBe('20260716IPR46531');
    expect(item.id).not.toContain('IPR-2026');
  });

  it('keeps a press release whose title is still untranslated', () => {
    // The NL feed serves a mix — recent items arrive in English and are replaced
    // by the Dutch title on a later cycle, since fetchEuFeed re-reads the whole
    // feed and the upsert refreshes the title of a still-candidate signal.
    const [en] = parseRssFeed(rss(pressItem()));
    const [nl] = parseRssFeed(rss(pressItem({ title: 'Persbericht - EU-China-betrekkingen' })));
    expect(en.title).toMatch(/^Press release/);
    expect(nl.title).toMatch(/^Persbericht/);
    expect(en.id).toBe(nl.id);
  });

  it('still drops an item with neither a document ref nor an IPR link', () => {
    const items = parseRssFeed(
      rss(`<item>
        <title>Agenda van de plenaire vergadering</title>
        <link>https://www.europarl.europa.eu/plenary/nl/agendas.html</link>
        <guid isPermaLink="false">AGENDA_2026-07-16_NL</guid>
      </item>`)
    );
    expect(items).toHaveLength(0);
  });

  it('leaves document items on the doceo URL and the ep-rss subbron', () => {
    // Regression guard: adding the press-release path must not reroute documents.
    const [item] = parseRssFeed(
      rss(`<item>
        <title>VERSLAG over een voorstel</title>
        <link>https://www.europarl.europa.eu/news/en/press-room/20260716IPR99999/</link>
        <guid isPermaLink="false">RR_A-10-2026-0209_v01-00_NL</guid>
      </item>`)
    );
    expect(item).toMatchObject({ id: 'A-10-2026-0209', subbron: 'ep-rss' });
    expect(item.url).toContain('/doceo/document/A-10-2026-0209');
  });
});

describe('parseRssFeed — committee codes', () => {
  const rss = (items: string) =>
    `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel>${items}</channel></rss>`;
  const withBodies = (bodies: string[]) =>
    rss(`<item>
      <title>Press release - Iets</title>
      <link>https://www.europarl.europa.eu/news/en/press-room/20260716IPR46531/</link>
      <guid isPermaLink="false">IPR-COM_IPR-2026-07-16-46531_EN</guid>
      <category domain="type">Persbericht</category>
      ${bodies.map((b) => `<category domain="body">${b}</category>`).join('')}
    </item>`);

  it('reports the single responsible committee as-is', () => {
    expect(parseRssFeed(withBodies(['AFET']))[0].commissie).toBe('AFET');
  });

  it('names the responsible committee and counts the co-responsible ones', () => {
    // The cockpit chip reads "Bevoegde commissie", so the lead one leads; the
    // rest are counted rather than dropped or run together.
    expect(parseRssFeed(withBodies(['ITRE', 'SEDE']))[0].commissie).toBe('ITRE +1');
    expect(parseRssFeed(withBodies(['AGRI', 'ECON', 'ENVI']))[0].commissie).toBe('AGRI +2');
  });

  it('reports no committee when the item names none', () => {
    expect(parseRssFeed(withBodies([]))[0].commissie).toBeNull();
  });

  it('populates it for plenary documents too, not just press releases', () => {
    const [item] = parseRssFeed(
      rss(`<item>
        <title>VERSLAG over een voorstel</title>
        <guid isPermaLink="false">RR_A-10-2026-0209_v01-00_NL</guid>
        <category domain="body">ENVI</category>
      </item>`)
    );
    expect(item).toMatchObject({ id: 'A-10-2026-0209', subbron: 'ep-rss', commissie: 'ENVI' });
  });
});
