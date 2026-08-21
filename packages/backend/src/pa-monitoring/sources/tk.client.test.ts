/**
 * Unit tests for tk.client.fetchTkFeed — OData filter building, normalisation
 * (title fallbacks, negative-number hiding, document URL), and the cache flow.
 * cacheGet/cacheSet, fetch, and config are mocked.
 */

jest.mock('../pa-cache', () => ({ cacheGet: jest.fn(), cacheSet: jest.fn() }));
jest.mock('@utils/config', () => ({
  config: { pa: { tkApiBase: 'https://tk/api', cacheTtlTk: 900 } },
}));
jest.mock('@utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import { fetchTkFeed } from './tk.client';
import { cacheGet, cacheSet } from '../pa-cache';

const mockCacheGet = cacheGet as jest.Mock;
const mockCacheSet = cacheSet as jest.Mock;
const mockFetch = jest.fn();

beforeAll(() => {
  global.fetch = mockFetch as unknown as typeof fetch;
});
beforeEach(() => {
  jest.clearAllMocks();
  mockCacheGet.mockResolvedValue(null);
  mockCacheSet.mockResolvedValue(undefined);
});

describe('fetchTkFeed', () => {
  it('returns the cached result without fetching', async () => {
    mockCacheGet.mockResolvedValue({ items: [{ id: 'c' }], total: 1, skip: 0, top: 20 });
    const res = await fetchTkFeed('q');
    expect(res.items).toEqual([{ id: 'c' }]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('does not serve an empty cached result for the rest of the TTL', async () => {
    // A failed or momentarily-empty fetch caches { items: [], total: 0 }, which
    // is truthy. Serving it hid a transient upstream blip behind a 15-minute
    // zero — and because the blanco search band shares this cache key with the
    // curation cycle, both reported it and looked like independent evidence.
    mockCacheGet.mockResolvedValue({ items: [], total: 0, skip: 0, top: 20 });
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        value: [{ Id: '1', Onderwerp: 'Motie energie', Soort: 'Motie', Ondernummer: 1 }],
        '@odata.count': 1,
      }),
    });

    const res = await fetchTkFeed('energie');

    expect(mockFetch).toHaveBeenCalled();
    expect(res.items).toHaveLength(1);
  });

  it('builds an OR filter, normalises items, and caches the result', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        value: [
          {
            Id: '1',
            Onderwerp: 'Motie stikstof',
            Soort: 'Motie',
            Ondernummer: 5,
            GewijzigdOp: '2026-07-01',
            Nummer: '2026Z001',
          },
          { Id: '2', Titel: 'Titel fallback', Ondernummer: -1 }, // negative → number null; no Nummer → url null
          { Id: '3' }, // no subject → '(geen onderwerp)'
        ],
        '@odata.count': 3,
      }),
    });

    const res = await fetchTkFeed('"green deal" OR stikstof', ['Motie'], 0, 20);

    expect(res.total).toBe(3);
    expect(res.items[0]).toMatchObject({
      id: '1',
      title: 'Motie stikstof',
      type: 'Motie',
      number: '5',
      url: 'https://www.tweedekamer.nl/kamerstukken/detail?id=2026Z001&did=2026Z001',
      source: 'tk',
    });
    expect(res.items[1]).toMatchObject({ title: 'Titel fallback', number: null, url: null });
    expect(res.items[2].title).toBe('(geen onderwerp)');

    // OData filter is built by hand and only partly encoded
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('Verwijderd eq false');
    expect(url).toContain("contains(Onderwerp,'green deal')");
    expect(url).toContain("contains(Onderwerp,'stikstof')");
    expect(url).toContain("Soort eq 'Motie'");

    expect(mockCacheSet).toHaveBeenCalledWith(expect.stringMatching(/^tk:/), res, 900);
  });

  it('builds a single-term filter (no OR wrapping)', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ value: [], '@odata.count': 0 }) });
    await fetchTkFeed('stikstof');
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("contains(Onderwerp,'stikstof')");
  });

  it('throws when the API responds with a non-ok status', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 503 });
    await expect(fetchTkFeed('q')).rejects.toThrow(/TK API 503/);
  });

  it('rethrows a fetch/network error', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNRESET'));
    await expect(fetchTkFeed('q')).rejects.toThrow('ECONNRESET');
  });
});
