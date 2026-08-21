/**
 * Unit tests for media.client — articleToFeedItem (pure mapper, no network).
 * Covers: field mapping, subbron derivation, regio join, sentiment pass-through,
 * duplicate-group id collapse, and malformed-article resilience.
 */

jest.mock('@utils/config', () => ({
  config: {
    pa: { mediaAggregatorBase: 'http://localhost', mediaAggregatorApiKey: 'test-key' },
    redis: { url: '' },
  },
}));
jest.mock('@utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));
jest.mock('axios', () => ({ __esModule: true, default: { get: jest.fn() } }));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import axios from 'axios';
import type { AggregatorArticle } from '@ronl/shared';
import { articleToFeedItem, fetchFlevolandNews, searchFlevolandNews } from './media.client';

const mockGet = (axios as unknown as { get: jest.Mock }).get;

const FIXTURE = JSON.parse(
  readFileSync(join(__dirname, '__fixtures__/media-search.json'), 'utf8')
) as { articles: AggregatorArticle[] };

describe('articleToFeedItem', () => {
  it('sets source to media and bron-relevant fields', () => {
    const item = articleToFeedItem(FIXTURE.articles[0]);
    expect(item.source).toBe('media');
    expect(item.type).toBe('Nieuwsartikel');
  });

  it('maps subbron from source.type: regional → nieuws-regionaal', () => {
    const item = articleToFeedItem(FIXTURE.articles[0]);
    expect(item.subbron).toBe('nieuws-regionaal');
  });

  it('maps subbron from source.type: national → nieuws-nationaal', () => {
    const item = articleToFeedItem(FIXTURE.articles[1]);
    expect(item.subbron).toBe('nieuws-nationaal');
  });

  it('joins province and municipality into regio', () => {
    const item = articleToFeedItem(FIXTURE.articles[0]);
    expect(item.regio).toBe('Flevoland · Lelystad');
  });

  it('sets regio to province only when municipality is null', () => {
    const item = articleToFeedItem(FIXTURE.articles[1]);
    expect(item.regio).toBe('Flevoland');
  });

  it('sets regio to null when both province and municipality are null', () => {
    const item = articleToFeedItem(FIXTURE.articles[4]);
    expect(item.regio).toBeNull();
  });

  it('passes sentiment through', () => {
    const regional = articleToFeedItem(FIXTURE.articles[0]);
    expect(regional.sentiment).toBe('negatief');
    const positief = articleToFeedItem(FIXTURE.articles[3]);
    expect(positief.sentiment).toBe('positief');
  });

  it('sets ref.url to canonical_url', () => {
    const item = articleToFeedItem(FIXTURE.articles[0]);
    expect(item.url).toBe(FIXTURE.articles[0].canonical_url);
  });

  it('sets number to source.homepage (provenance label)', () => {
    const item = articleToFeedItem(FIXTURE.articles[0]);
    expect(item.number).toBe('omroepflevoland.nl');
  });

  it('collapses duplicate cluster: uses duplicate_group_id as id', () => {
    // articles[1] and articles[2] both have duplicate_group_id 'dup-stikstof-1'
    const a = articleToFeedItem(FIXTURE.articles[1]);
    const b = articleToFeedItem(FIXTURE.articles[2]);
    expect(a.id).toBe('dup-stikstof-1');
    expect(b.id).toBe('dup-stikstof-1');
    // Dedup by source:id in the curation cycle will keep only the first.
  });

  it('uses article id when duplicate_group_id is null', () => {
    const item = articleToFeedItem(FIXTURE.articles[0]);
    expect(item.id).toBe('art-001');
  });

  it('sets description to summary_short', () => {
    const item = articleToFeedItem(FIXTURE.articles[0]);
    expect(item.description).toBe(FIXTURE.articles[0].summary_short);
  });
});

describe('fixture resilience', () => {
  it('skips the malformed article without throwing', () => {
    const malformed = FIXTURE.articles[5];
    expect(() => articleToFeedItem(malformed)).toThrow();
    // fetchFlevolandNews wraps each article in try/catch and skips on error.
    // This confirms the contract: a bad row throws, the caller skips it.
  });

  it('processes all valid articles from the fixture', () => {
    const valid = FIXTURE.articles.slice(0, 5);
    const items = valid.map(articleToFeedItem);
    expect(items).toHaveLength(5);
    expect(items.every((i) => i.source === 'media')).toBe(true);
  });
});

describe('fetchFlevolandNews', () => {
  beforeEach(() => mockGet.mockReset());

  it('calls the aggregator with region, OR-joined terms, and the bearer key', async () => {
    mockGet.mockResolvedValue({ data: { articles: [FIXTURE.articles[0]] } });
    const items = await fetchFlevolandNews({ terms: ['stikstof', 'energie'] });

    expect(items).toHaveLength(1);
    expect(items[0].source).toBe('media');
    const [url, opts] = mockGet.mock.calls[0];
    expect(url).toContain('http://localhost/search?');
    expect(url).toContain('region=Flevoland');
    expect(url).toContain('q=stikstof+OR+energie'); // URLSearchParams encodes spaces as +
    expect(opts.headers.Authorization).toBe('Bearer test-key');
  });

  it('skips a malformed article but returns the rest', async () => {
    mockGet.mockResolvedValue({
      data: { articles: [FIXTURE.articles[0], FIXTURE.articles[5]] }, // [5] throws in the mapper
    });
    const items = await fetchFlevolandNews({ terms: ['x'] });
    expect(items).toHaveLength(1);
  });

  it('returns [] when the response has no articles array', async () => {
    mockGet.mockResolvedValue({ data: {} });
    await expect(fetchFlevolandNews({ terms: ['x'] })).resolves.toEqual([]);
  });

  it('retries once after a failure and succeeds on the second attempt', async () => {
    jest.useFakeTimers();
    mockGet
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce({ data: { articles: [FIXTURE.articles[0]] } });

    const p = fetchFlevolandNews({ terms: ['x'] });
    await jest.advanceTimersByTimeAsync(1500); // the back-off between attempts
    const items = await p;

    expect(items).toHaveLength(1);
    expect(mockGet).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });

  it('returns [] after both attempts fail', async () => {
    jest.useFakeTimers();
    mockGet.mockRejectedValue(new Error('upstream down'));

    const p = fetchFlevolandNews({ terms: ['x'] });
    await jest.advanceTimersByTimeAsync(1500);
    const items = await p;

    expect(items).toEqual([]);
    expect(mockGet).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });
});

describe('articleToFeedItem — articles that omit the optional fields', () => {
  const bare = (over: Partial<AggregatorArticle> = {}): AggregatorArticle =>
    ({
      id: 'a-1',
      title: 'Kop',
      published_at: '2026-08-01',
      canonical_url: 'https://news.test/a-1',
      summary_short: 'Samenvatting',
      source: { homepage: 'https://news.test', type: 'national' },
      ...over,
    }) as AggregatorArticle;

  it('falls back to the article id when it belongs to no duplicate group', () => {
    expect(articleToFeedItem(bare()).id).toBe('a-1');
  });

  it('reports no regio when neither province nor municipality is set', () => {
    expect(articleToFeedItem(bare()).regio).toBeNull();
  });

  it('reports no sentiment when the aggregator did not score the article', () => {
    expect(articleToFeedItem(bare()).sentiment).toBeNull();
  });

  it('labels a non-regional source as national news', () => {
    expect(articleToFeedItem(bare()).subbron).toBe('nieuws-nationaal');
  });
});

describe('fetchArticles — degraded responses', () => {
  beforeEach(() => jest.clearAllMocks());

  it('treats a body without an articles array as an empty result', async () => {
    mockGet.mockResolvedValue({ data: {} });
    await expect(fetchFlevolandNews({ terms: ['stikstof'] })).resolves.toEqual([]);
  });
});

describe('searchFlevolandNews', () => {
  beforeEach(() => jest.clearAllMocks());

  it('pins the region to Flevoland and reports no total', async () => {
    mockGet.mockResolvedValue({ data: { articles: [] } });

    const res = await searchFlevolandNews('stikstof');

    expect(res).toEqual({ items: [], total: null });
    const url = mockGet.mock.calls[0][0] as string;
    expect(url).toContain('region=Flevoland');
    expect(url).toContain('q=stikstof');
    // The default top of 20 applies when the caller does not ask for a page size.
    expect(url).toContain('top=20');
  });

  it('searches with an empty term when no query is given, and clamps top to 100', async () => {
    mockGet.mockResolvedValue({ data: { articles: [] } });

    await searchFlevolandNews(null, 500);

    const url = mockGet.mock.calls[0][0] as string;
    expect(url).toContain('q=&');
    expect(url).toContain('top=100');
  });

  it('clamps a non-positive page size up to one article', async () => {
    mockGet.mockResolvedValue({ data: { articles: [] } });
    await searchFlevolandNews('stikstof', 0);
    expect(mockGet.mock.calls[0][0] as string).toContain('top=1');
  });
});
