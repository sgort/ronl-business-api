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
});
