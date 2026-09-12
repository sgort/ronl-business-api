/**
 * Unit tests for the fail-soft PA Redis cache. redis is mocked; the module is
 * re-required per test (jest.isolateModules) to reset its memoized client state.
 * Covers: hit/miss, invalid JSON, redis error, the 2s op-timeout race, a failed
 * connect falling through to live-fetch, client memoization, and cacheSet.
 */

// This file has no top-level import, so TypeScript would otherwise treat it as
// a global script and hoist every top-level declaration below into the global
// scope — where `mockAxios`, `Mod`, `freshModule` and friends collide with the
// identically-named declarations in sibling test files. `export {}` makes it a
// module and scopes them to this file.
export {};

const mockRedisClient = {
  on: jest.fn(),
  connect: jest.fn(),
  disconnect: jest.fn(),
  get: jest.fn(),
  set: jest.fn(),
  // node-redis exposes isReady; getClient() gates on it because a client that
  // connected but never became ready is exactly the state #62 was stuck in.
  isReady: true,
};
const mockCreateClient = jest.fn(() => mockRedisClient);
jest.mock('redis', () => ({ createClient: mockCreateClient }));
jest.mock('@utils/config', () => ({ config: { redis: { url: 'redis://x' } } }));
const mockWarn = jest.fn();
const mockInfo = jest.fn();
jest.mock('@utils/logger', () => ({
  createLogger: () => ({ info: mockInfo, warn: mockWarn, error: jest.fn(), debug: jest.fn() }),
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
  mockRedisClient.disconnect.mockResolvedValue(undefined);
  mockRedisClient.isReady = true;
  mockCreateClient.mockReturnValue(mockRedisClient);
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

describe('cacheHealth', () => {
  it('reports up when the client connects and is ready', async () => {
    const { cacheHealth } = freshModule();
    await expect(cacheHealth()).resolves.toEqual({ status: 'up' });
  });

  it('reports down with the reason when the connect rejects', async () => {
    mockRedisClient.connect.mockRejectedValue(new Error('unreachable'));
    const { cacheHealth } = freshModule();
    await expect(cacheHealth()).resolves.toEqual({ status: 'down', error: 'unreachable' });
  });

  it('reports down when the client connects but never becomes ready', async () => {
    // The #62 state exactly: the socket is accepted and then reset, so connect()
    // resolves against a client that can never run a command.
    mockRedisClient.isReady = false;
    const { cacheHealth } = freshModule();
    await expect(cacheHealth()).resolves.toEqual({
      status: 'down',
      error: 'connected but not ready',
    });
  });

  it('never rejects, even when createClient throws outright', async () => {
    // A malformed REDIS_URL throws synchronously. cacheHealth() is called from
    // /v1/health, so a throw here would 503 the whole health check and make an
    // optional dependency fatal. This is the regression a route test caught.
    mockCreateClient.mockImplementation(() => {
      throw new Error('Invalid URL');
    });
    const { cacheHealth } = freshModule();
    await expect(cacheHealth()).resolves.toEqual({ status: 'down', error: 'Invalid URL' });
  });

  it('does not fail a cacheGet when the cache is down', async () => {
    // The fail-soft contract: a dead cache costs a live fetch, never an error.
    mockRedisClient.connect.mockRejectedValue(new Error('unreachable'));
    const { cacheGet, cacheSet } = freshModule();
    await expect(cacheGet('k')).resolves.toBeNull();
    await expect(cacheSet('k', {}, 900)).resolves.toBeUndefined();
  });
});

describe('reconnection after a failed connect', () => {
  it('retries on a later call instead of latching off until restart', async () => {
    // The defect this replaces: connectAttempted was cleared only in a catch,
    // and the real failure arrived as an 'error' EVENT rather than a rejection,
    // so the catch never ran and the cache stayed dead for nine days (#62).
    jest.useFakeTimers();
    try {
      mockRedisClient.connect.mockRejectedValueOnce(new Error('unreachable'));
      const { cacheHealth } = freshModule();

      await expect(cacheHealth()).resolves.toEqual({ status: 'down', error: 'unreachable' });
      expect(mockCreateClient).toHaveBeenCalledTimes(1);

      // Within the cooldown: no new attempt, so a dead Redis is not hammered.
      await expect(cacheHealth()).resolves.toEqual({ status: 'down', error: 'unreachable' });
      expect(mockCreateClient).toHaveBeenCalledTimes(1);

      // Past the cooldown: it tries again and recovers without a restart.
      jest.advanceTimersByTime(31_000);
      await expect(cacheHealth()).resolves.toEqual({ status: 'up' });
      expect(mockCreateClient).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('drops a client that stopped being ready rather than issuing commands at it', async () => {
    const { cacheGet } = freshModule();
    await expect(cacheGet('k')).resolves.toBeNull(); // connects, get returns null
    expect(mockCreateClient).toHaveBeenCalledTimes(1);

    // The connection dies underneath us.
    mockRedisClient.isReady = false;
    await expect(cacheGet('k')).resolves.toBeNull();
    expect(mockRedisClient.disconnect).toHaveBeenCalled();
  });
});

describe('error logging', () => {
  it('logs a repeated identical error once rather than on every event', async () => {
    // 10,269 identical "read ECONNRESET" lines is volume, not signal (#62).
    const { cacheHealth } = freshModule();
    await cacheHealth();

    const handler = mockRedisClient.on.mock.calls.find((c) => c[0] === 'error')?.[1] as (
      err: Error
    ) => void;
    expect(handler).toBeDefined();

    const before = mockWarn.mock.calls.filter((c) => c[0] === 'PA cache Redis error').length;
    handler(new Error('read ECONNRESET'));
    handler(new Error('read ECONNRESET'));
    handler(new Error('read ECONNRESET'));
    const after = mockWarn.mock.calls.filter((c) => c[0] === 'PA cache Redis error');

    expect(after.length - before).toBe(1);
    expect(after[after.length - 1][1]).toEqual({ error: 'read ECONNRESET' });
  });

  it('logs again when the error changes, so a new fault is not swallowed', async () => {
    const { cacheHealth } = freshModule();
    await cacheHealth();
    const handler = mockRedisClient.on.mock.calls.find((c) => c[0] === 'error')?.[1] as (
      err: Error
    ) => void;

    const before = mockWarn.mock.calls.filter((c) => c[0] === 'PA cache Redis error').length;
    handler(new Error('read ECONNRESET'));
    handler(new Error('read ECONNRESET'));
    handler(new Error('WRONGPASS invalid username-password pair'));
    const after = mockWarn.mock.calls.filter((c) => c[0] === 'PA cache Redis error').length;

    expect(after - before).toBe(2);
  });

  it('announces a successful connection, which never once appeared in nine days', async () => {
    const { cacheHealth } = freshModule();
    await cacheHealth();
    expect(mockInfo).toHaveBeenCalledWith('PA cache Redis connected');
  });
});

describe('connect failures the ECONNRESET loop actually produced', () => {
  it('gives up on a connect that never settles, rather than awaiting forever', async () => {
    // This is the #62 state precisely: node-redis retries a resetting socket
    // internally, so connect() neither resolves nor rejects. The old code had
    // no timeout on it, which is why neither 'connected' nor 'unavailable' was
    // ever logged across 10,269 errors — the await simply never returned.
    jest.useFakeTimers();
    try {
      mockRedisClient.connect.mockReturnValue(new Promise(() => {}));
      const { cacheHealth } = freshModule();

      const pending = cacheHealth();
      await jest.advanceTimersByTimeAsync(3_100);

      await expect(pending).resolves.toEqual({
        status: 'down',
        error: 'connect timed out after 3000ms',
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('reports a non-Error connect rejection as its string form', async () => {
    mockRedisClient.connect.mockRejectedValue('ECONNREFUSED');
    const { cacheHealth } = freshModule();
    await expect(cacheHealth()).resolves.toEqual({ status: 'down', error: 'ECONNREFUSED' });
  });

  it('reports down with no reason when the cooldown blocks an attempt', async () => {
    // Second call inside the cooldown never reaches a client, and by then the
    // recorded error has been cleared by an intervening success. Reporting
    // 'down' without inventing a cause is the honest answer.
    jest.useFakeTimers();
    try {
      mockRedisClient.connect.mockRejectedValueOnce(new Error('boom'));
      const mod = freshModule();
      await mod.cacheHealth();

      // A later ready client, but still inside the cooldown window.
      mockRedisClient.isReady = true;
      jest.advanceTimersByTime(1_000);
      await expect(mod.cacheHealth()).resolves.toEqual({ status: 'down', error: 'boom' });
      expect(mockCreateClient).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('tolerates a client whose disconnect rejects during teardown', async () => {
    // teardown() swallows this on purpose: the client is already unusable, and
    // an error while discarding it must not surface as a cache failure.
    mockRedisClient.isReady = false;
    mockRedisClient.disconnect.mockRejectedValue(new Error('already closed'));
    const { cacheHealth } = freshModule();
    await expect(cacheHealth()).resolves.toEqual({
      status: 'down',
      error: 'connected but not ready',
    });
  });
});
