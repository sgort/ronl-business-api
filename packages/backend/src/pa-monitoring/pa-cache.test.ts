/**
 * Unit tests for the fail-soft PA Redis cache. redis is mocked; the module is
 * re-required per test (jest.isolateModules) to reset its memoized client state.
 * Covers: hit/miss, invalid JSON, redis error, the 2s op-timeout race, a failed
 * connect falling through to live-fetch, client memoization, and cacheSet.
 */

const mockRedisClient = {
  on: jest.fn(),
  connect: jest.fn(),
  get: jest.fn(),
  set: jest.fn(),
};
const mockCreateClient = jest.fn(() => mockRedisClient);
jest.mock('redis', () => ({ createClient: mockCreateClient }));
jest.mock('@utils/config', () => ({ config: { redis: { url: 'redis://x' } } }));
jest.mock('@utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

type Mod = typeof import('./pa-cache');

function freshModule(): Mod {
  let mod!: Mod;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('./pa-cache');
  });
  return mod;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRedisClient.connect.mockResolvedValue(undefined);
});

describe('cacheGet', () => {
  it('returns the parsed value on a hit', async () => {
    mockRedisClient.get.mockResolvedValue(JSON.stringify({ a: 1 }));
    const { cacheGet } = freshModule();
    await expect(cacheGet('k')).resolves.toEqual({ a: 1 });
    expect(mockCreateClient).toHaveBeenCalledWith({ url: 'redis://x' });
  });

  it('returns null on a miss', async () => {
    mockRedisClient.get.mockResolvedValue(null);
    const { cacheGet } = freshModule();
    await expect(cacheGet('k')).resolves.toBeNull();
  });

  it('returns null on invalid JSON', async () => {
    mockRedisClient.get.mockResolvedValue('not json{');
    const { cacheGet } = freshModule();
    await expect(cacheGet('k')).resolves.toBeNull();
  });

  it('returns null when the redis command rejects', async () => {
    mockRedisClient.get.mockRejectedValue(new Error('redis down'));
    const { cacheGet } = freshModule();
    await expect(cacheGet('k')).resolves.toBeNull();
  });

  it('falls back to null when the command exceeds the 2s timeout', async () => {
    jest.useFakeTimers();
    mockRedisClient.get.mockReturnValue(new Promise(() => {})); // never settles
    const { cacheGet } = freshModule();
    const p = cacheGet('k');
    await jest.advanceTimersByTimeAsync(2000);
    await expect(p).resolves.toBeNull();
    jest.useRealTimers();
  });

  it('returns null (and does not query) when connect fails', async () => {
    mockRedisClient.connect.mockRejectedValue(new Error('unreachable'));
    const { cacheGet } = freshModule();
    await expect(cacheGet('k')).resolves.toBeNull();
    expect(mockRedisClient.get).not.toHaveBeenCalled();
  });

  it('memoizes the client across calls', async () => {
    mockRedisClient.get.mockResolvedValue(null);
    const { cacheGet } = freshModule();
    await cacheGet('k1');
    await cacheGet('k2');
    expect(mockCreateClient).toHaveBeenCalledTimes(1);
  });
});

describe('cacheSet', () => {
  it('stores the JSON value with an EX ttl', async () => {
    mockRedisClient.set.mockResolvedValue('OK');
    const { cacheSet } = freshModule();
    await cacheSet('k', { a: 1 }, 900);
    expect(mockRedisClient.set).toHaveBeenCalledWith('k', JSON.stringify({ a: 1 }), { EX: 900 });
  });

  it('is a no-op when connect fails', async () => {
    mockRedisClient.connect.mockRejectedValue(new Error('unreachable'));
    const { cacheSet } = freshModule();
    await expect(cacheSet('k', {}, 900)).resolves.toBeUndefined();
    expect(mockRedisClient.set).not.toHaveBeenCalled();
  });
});
