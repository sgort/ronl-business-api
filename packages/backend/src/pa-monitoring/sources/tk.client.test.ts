/**
 * Unit tests for tk.client.fetchTkFeed — OData filter building, normalisation
 * (title fallbacks, negative-number hiding, document URL), and the cache flow.
 * cacheGet/cacheSet, fetch, and config are mocked.
 */

// Spread the real module so a third export added later is not silently absent.
const mockCacheOverrides = { cacheGet: jest.fn(), cacheSet: jest.fn() };
jest.mock('../pa-cache', () => ({
  ...jest.requireActual('../pa-cache'),
  ...mockCacheOverrides,
}));
jest.mock('@utils/config', () => ({
  config: { pa: { tkApiBase: 'https://tk/api', cacheTtlTk: 900 } },
}));
jest.mock('@utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import { fetchTkFeed } from './tk.client';
import { cacheGet, cacheSet } from '../pa-cache';
import { expectMockNamesRealExports } from '../../test-utils/mockModule';

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

describe('the pa-cache mock', () => {
  it('only names real exports', () => {
    expectMockNamesRealExports(jest.requireActual('../pa-cache'), mockCacheOverrides);
  });
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

  it('normalises items and caches the result', async () => {
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

    const res = await fetchTkFeed('stikstof', ['Motie'], 0, 20);

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
    expect(url).toContain("contains(Onderwerp,'stikstof')");
    expect(url).toContain("Soort eq 'Motie'");

    expect(mockCacheSet).toHaveBeenCalledWith(expect.stringMatching(/^tk:/), res, 900);
  });

  describe('multi-term OR', () => {
    const page = (items: Record<string, unknown>[]) => ({
      ok: true,
      json: async () => ({ value: items }),
    });

    it('issues one request per term instead of one OR filter', async () => {
      // A single contains(A) or contains(B) or ... filter is what blew the 15s
      // timeout against the live API; per-term requests scale flat.
      mockFetch.mockResolvedValue(page([]));

      await fetchTkFeed('"green deal" OR stikstof', ['Motie'], 0, 20);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      const urls = mockFetch.mock.calls.map((c) => c[0] as string);
      expect(urls.some((u) => u.includes("contains(Onderwerp,'green deal')"))).toBe(true);
      expect(urls.some((u) => u.includes("contains(Onderwerp,'stikstof')"))).toBe(true);
      // Each request carries one clause only — no OR in any filter.
      for (const u of urls) {
        expect(u).not.toContain(' or contains(');
        expect(u).toContain("Soort eq 'Motie'");
      }
    });

    it('omits $count, which is the expensive half of the query', async () => {
      mockFetch.mockResolvedValue(page([]));

      const res = await fetchTkFeed('a OR b');

      for (const c of mockFetch.mock.calls) expect(c[0] as string).not.toContain('$count');
      // No union count is available, and TkFeedResult already allows null; the
      // search band falls back to the number of items returned.
      expect(res.total).toBeNull();
    });

    it('merges the pages, dropping a document that matched more than one term', async () => {
      mockFetch
        .mockResolvedValueOnce(page([{ Id: 'dup', Onderwerp: 'Both', GewijzigdOp: '2026-07-02' }]))
        .mockResolvedValueOnce(
          page([
            { Id: 'dup', Onderwerp: 'Both', GewijzigdOp: '2026-07-02' },
            { Id: 'other', Onderwerp: 'Only b', GewijzigdOp: '2026-07-01' },
          ])
        );

      const res = await fetchTkFeed('a OR b');

      expect(res.items.map((i) => i.id)).toEqual(['dup', 'other']); // newest first, deduped
    });

    it('keeps going when one term fails, rather than losing the whole query', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('aborted'))
        .mockResolvedValueOnce(page([{ Id: 'ok', Onderwerp: 'Survivor' }]));

      const res = await fetchTkFeed('a OR b');

      expect(res.items.map((i) => i.id)).toEqual(['ok']);
    });

    it('throws when every term fails', async () => {
      mockFetch.mockRejectedValue(new Error('aborted'));

      await expect(fetchTkFeed('a OR b')).rejects.toThrow('aborted');
    });
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
  it('omits the subject clause entirely for a blanco query', async () => {
    // fetchTkFeed() with no arguments is the shape the search band uses for an
    // empty query and the curation cycle uses for its unfiltered sweep. The
    // filter must still exclude deleted documents, but must not carry a
    // contains() clause -- an empty one matches nothing on TK OData.
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ value: [], '@odata.count': 0 }) });

    await fetchTkFeed();

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('Verwijderd eq false');
    expect(url).not.toContain('contains(Onderwerp');
  });

  it('treats a whitespace-only query as blanco', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ value: [], '@odata.count': 0 }) });

    await fetchTkFeed('   ');

    expect(mockFetch.mock.calls[0][0] as string).not.toContain('contains(Onderwerp');
  });

  it('falls back to an empty id for an item TK returned without one', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ value: [{ Onderwerp: 'Geen Id' }], '@odata.count': 1 }),
    });

    const res = await fetchTkFeed('stikstof');

    expect(res.items[0].id).toBe('');
  });

  it('reports a missing value array and a missing count as empty rather than throwing', async () => {
    // TK answers a filter that matches nothing with a bare object on some
    // deployments -- no `value`, no `@odata.count`.
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });

    const res = await fetchTkFeed('stikstof');

    expect(res.items).toEqual([]);
    expect(res.total).toBeNull();
  });

  it('rethrows a non-Error rejection from the single-term path unchanged', async () => {
    // undici rejects with a bare string on some socket failures, so the
    // `instanceof Error` guard in the catch is not decorative.
    mockFetch.mockRejectedValue('socket hang up');

    await expect(fetchTkFeed('stikstof')).rejects.toBe('socket hang up');
  });

  it('aborts a request that outruns the timeout', async () => {
    jest.useFakeTimers();
    mockFetch.mockImplementation(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () =>
            reject(new Error('The operation was aborted'))
          );
        })
    );

    const pending = fetchTkFeed('stikstof');
    // Assert the rejection before advancing, so an unhandled-rejection warning
    // cannot race the timer.
    const assertion = expect(pending).rejects.toThrow('aborted');
    await jest.advanceTimersByTimeAsync(15_000);
    await assertion;

    jest.useRealTimers();
  });

  describe('multi-term OR, further cases', () => {
    const page = (items: Record<string, unknown>[]) => ({
      ok: true,
      json: async () => ({ value: items }),
    });

    it('wraps a non-Error rejection when every term fails', async () => {
      mockFetch.mockRejectedValue('socket hang up');

      await expect(fetchTkFeed('a OR b')).rejects.toThrow('TK API error');
    });

    it('tolerates a fulfilled page that carries no value array', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
        .mockResolvedValueOnce(page([{ Id: 'ok', Onderwerp: 'Survivor' }]));

      const res = await fetchTkFeed('a OR b');

      expect(res.items.map((i) => i.id)).toEqual(['ok']);
    });

    it('sorts undated items last without throwing', async () => {
      mockFetch
        .mockResolvedValueOnce(page([{ Id: 'undated', Onderwerp: 'No date' }]))
        .mockResolvedValueOnce(
          page([{ Id: 'dated', Onderwerp: 'Dated', GewijzigdOp: '2026-07-01' }])
        );

      const res = await fetchTkFeed('a OR b');

      expect(res.items.map((i) => i.id)).toEqual(['dated', 'undated']);
      expect(res.items[1].date).toBeNull();
    });
  });
});
