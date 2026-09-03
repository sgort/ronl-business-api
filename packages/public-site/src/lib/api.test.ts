import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const originalFetch = global.fetch;

function mockFetchOnce(status: number, body: unknown) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as unknown as typeof fetch;
}

afterEach(() => {
  global.fetch = originalFetch;
  vi.unstubAllEnvs();
});

describe('lib/api', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_URL', 'http://localhost:3002/v1');
  });

  it('searchPublic() builds the right query string and returns data', async () => {
    mockFetchOnce(200, {
      success: true,
      data: { items: [], total: 0, facets: { soort: [], bron: [], doelgroep: [] } },
    });
    const { searchPublic } = await import('./api');
    await searchPublic({ q: 'zorg', soort: ['regel', 'product'], sort: 'az' });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/public/zoeken?q=zorg&soort=regel%2Cproduct&sort=az')
    );
  });

  it('throws when the HTTP response is not ok', async () => {
    mockFetchOnce(500, { success: false, error: { code: 'X', message: 'boom' } });
    const { getNieuws } = await import('./api');
    await expect(getNieuws()).rejects.toThrow(/HTTP 500/);
  });

  it('throws when success:false even on HTTP 200', async () => {
    mockFetchOnce(200, { success: false, error: { code: 'X', message: 'business error' } });
    const { getBerichten } = await import('./api');
    await expect(getBerichten()).rejects.toThrow('business error');
  });

  it('getRegelBySlug returns null on 404 instead of throwing', async () => {
    mockFetchOnce(404, {
      success: false,
      error: { code: 'ITEM_NOT_FOUND', message: 'Item niet gevonden.' },
    });
    const { getRegelBySlug } = await import('./api');
    expect(await getRegelBySlug('nope')).toBeNull();
  });
  it('uses a generic message when a failed response carries no error body', async () => {
    mockFetchOnce(503, {});
    const { getNieuws } = await import('./api');
    await expect(getNieuws()).rejects.toThrow(/HTTP 503: request failed/);
  });

  it('uses a generic message when success:false carries no error body', async () => {
    mockFetchOnce(200, { success: false });
    const { getBerichten } = await import('./api');
    await expect(getBerichten()).rejects.toThrow('Request failed');
  });

  it('still throws from a by-slug lookup when the failure is not a 404', async () => {
    // getJSONOrNull treats only 404 as "normal absence"; a 500 is still a
    // fault, and swallowing it would render an empty detail page instead.
    mockFetchOnce(500, { success: false, error: { code: 'X', message: 'upstream down' } });
    const { getRegelBySlug } = await import('./api');
    await expect(getRegelBySlug('zorgtoeslag')).rejects.toThrow(/HTTP 500: upstream down/);
  });

  it('throws from a by-slug lookup on success:false with a 200', async () => {
    mockFetchOnce(200, { success: false, error: { code: 'X', message: 'business error' } });
    const { getProcesByKey } = await import('./api');
    await expect(getProcesByKey('some-key')).rejects.toThrow('business error');
  });

  it('uses generic messages for a by-slug lookup with no error body', async () => {
    mockFetchOnce(500, {});
    const { getBerichtBySlug } = await import('./api');
    await expect(getBerichtBySlug('x')).rejects.toThrow(/HTTP 500: request failed/);

    mockFetchOnce(200, { success: false });
    const { getNieuwsBySlug } = await import('./api');
    await expect(getNieuwsBySlug('x')).rejects.toThrow('Request failed');
  });

  it('omits the query string entirely when every parameter is empty', async () => {
    // An empty facet array must not produce `?soort=` -- the backend reads that
    // as "filter to nothing" rather than "no filter".
    mockFetchOnce(200, {
      success: true,
      data: { items: [], total: 0, facets: { soort: [], bron: [], doelgroep: [] } },
    });
    const { searchPublic } = await import('./api');
    await searchPublic({ q: '', soort: [], bron: undefined });

    expect(global.fetch).toHaveBeenCalledWith('http://localhost:3002/v1/public/zoeken');
  });
});
