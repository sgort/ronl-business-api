/**
 * Unit tests for the media-aggregator in-memory store: TTL caching, concurrent-
 * refresh coalescing, stale-on-error fallback, cold-error empty, the env TTL
 * override, and clearCache. ingestAll is mocked.
 */

jest.mock('./ingest', () => ({ ingestAll: jest.fn() }));
jest.mock('@utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import { getArticles, clearCache } from './store';
import { ingestAll } from './ingest';

const mockIngest = ingestAll as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  clearCache();
  delete process.env.MEDIA_AGGREGATOR_CACHE_TTL_MS;
});

describe('getArticles', () => {
  it('ingests on a cold cache and returns the articles', async () => {
    mockIngest.mockResolvedValue([{ id: 'a' }]);
    await expect(getArticles()).resolves.toEqual([{ id: 'a' }]);
    expect(mockIngest).toHaveBeenCalledTimes(1);
  });

  it('serves from cache within the TTL', async () => {
    mockIngest.mockResolvedValue([{ id: 'a' }]);
    await getArticles();
    await getArticles();
    expect(mockIngest).toHaveBeenCalledTimes(1);
  });

  it('coalesces concurrent refreshes into one ingest', async () => {
    let resolveIngest!: (v: unknown[]) => void;
    mockIngest.mockReturnValue(new Promise((r) => (resolveIngest = r)));
    const p1 = getArticles();
    const p2 = getArticles();
    resolveIngest([{ id: 'x' }]);
    await Promise.all([p1, p2]);
    expect(mockIngest).toHaveBeenCalledTimes(1);
  });

  it('serves the stale cache when a refresh fails', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000);
    mockIngest.mockResolvedValueOnce([{ id: 'a' }]);
    await getArticles(); // cache at t=1000

    now.mockReturnValue(1_000 + 15 * 60 * 1000 + 1); // past default TTL
    mockIngest.mockRejectedValueOnce(new Error('down'));
    await expect(getArticles()).resolves.toEqual([{ id: 'a' }]); // stale served
    now.mockRestore();
  });

  it('returns [] when a cold refresh fails', async () => {
    mockIngest.mockRejectedValue(new Error('down'));
    await expect(getArticles()).resolves.toEqual([]);
  });

  it('honours the MEDIA_AGGREGATOR_CACHE_TTL_MS override', async () => {
    process.env.MEDIA_AGGREGATOR_CACHE_TTL_MS = '1000';
    const now = jest.spyOn(Date, 'now').mockReturnValue(0);
    mockIngest.mockResolvedValue([{ id: 'a' }]);

    await getArticles(); // ingest #1 (t=0)
    now.mockReturnValue(500);
    await getArticles(); // within 1000ms TTL → cached
    now.mockReturnValue(1_500);
    await getArticles(); // past TTL → ingest #2

    expect(mockIngest).toHaveBeenCalledTimes(2);
    now.mockRestore();
  });

  it('clearCache forces a refetch', async () => {
    mockIngest.mockResolvedValue([{ id: 'a' }]);
    await getArticles();
    clearCache();
    await getArticles();
    expect(mockIngest).toHaveBeenCalledTimes(2);
  });
});
