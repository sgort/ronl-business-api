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
