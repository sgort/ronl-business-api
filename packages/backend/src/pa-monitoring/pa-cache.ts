/**
 * Fail-soft Redis cache for PA monitoring.
 * Any Redis error falls through to a live fetch — the service stays up.
 *
 * Fail-soft is the right contract, but it hid a total outage for at least nine
 * days (#62): REDIS_URL pointed a plaintext scheme at the TLS-only port, every
 * connection was reset, and every request silently did a live fetch. Three
 * things about the old implementation let that run unnoticed, all fixed here.
 *
 *   1. connect() was unbounded. withTimeout() guarded get() and set() but not
 *      the connect itself, and node-redis retries a failing socket internally
 *      rather than rejecting — so the await never settled. Neither the
 *      'connected' nor the 'unavailable' line was ever logged, across 10,269
 *      errors, which is why the logs described the symptom and never the state.
 *   2. The retry never fired. `connectAttempted` was cleared only in the catch,
 *      and this failure arrives as an 'error' EVENT rather than a rejection, so
 *      the catch never ran and the cache stayed disabled until the process
 *      restarted. A transient blip became permanent.
 *   3. Nothing reported it. /v1/health covered keycloak and operaton, so a
 *      dependency failing 100% of the time still read "healthy".
 */

import { createClient } from 'redis';
import { config } from '@utils/config';
import { createLogger } from '@utils/logger';

const logger = createLogger('pa-cache');

type RedisClient = ReturnType<typeof createClient>;

// node-redis v4 queues commands while reconnecting after ECONNRESET, so an
// awaited client.get() can hang indefinitely. Race against a 2 s timeout so a
// dead Redis always falls through to the live fetch instead of blocking the
// curation cycle.
const CACHE_OP_TIMEOUT_MS = 2_000;

// The connect must be bounded for the same reason, and more urgently: a socket
// that keeps resetting leaves connect() pending forever rather than rejecting.
// Kept short — this is on the path of a health check.
const CONNECT_TIMEOUT_MS = 3_000;

// How long to wait before trying again after a failed connect. Without it, a
// dead Redis means one connect attempt per cache operation, which is a
// reconnect storm against a host that is already unhappy.
const RETRY_COOLDOWN_MS = 30_000;

let redisClient: RedisClient | null = null;
let lastError: string | null = null;
let loggedError: string | null = null;
let nextAttemptAt = 0;
let connecting: Promise<RedisClient | null> | null = null;

/** Stop a client's internal reconnect loop; it is what produced 10k log lines. */
async function teardown(client: RedisClient): Promise<void> {
  try {
    await client.disconnect();
  } catch {
    // Already closed, or never opened. Either way there is nothing to release.
  }
}

function recordError(message: string): void {
  lastError = message;
  // The old code logged every 'error' event, which produced 10,269 identical
  // "read ECONNRESET" lines — volume that reads as noise rather than signal.
  // Log a given message once until it changes or a connection succeeds.
  if (message !== loggedError) {
    loggedError = message;
    logger.warn('PA cache Redis error', { error: message });
  }
}

async function openClient(): Promise<RedisClient | null> {
  // Set the cooldown before awaiting, so concurrent callers that arrive while
  // this attempt is in flight do not queue up behind it and retry immediately.
  nextAttemptAt = Date.now() + RETRY_COOLDOWN_MS;

  // createClient throws synchronously on a malformed URL, and cacheHealth() is
  // on the /v1/health path — an unhandled throw here made the whole health
  // check 503, turning an optional dependency into a fatal one. Caught by a
  // route test, which is the only reason it is not shipping.
  let client: RedisClient;
  try {
    client = createClient({ url: config.redis.url });
    client.on('error', (err: Error) => recordError(err.message));
  } catch (err) {
    recordError(err instanceof Error ? err.message : String(err));
    logger.warn('PA cache Redis unavailable — live fetch only', { error: lastError });
    return null;
  }

  const connected = await withTimeout(
    client.connect().then(
      () => true,
      (err: unknown) => {
        recordError(err instanceof Error ? err.message : String(err));
        return false;
      }
    ),
    false,
    CONNECT_TIMEOUT_MS
  );

  if (!connected || !client.isReady) {
    if (connected) recordError('connected but not ready');
    else if (!lastError) recordError(`connect timed out after ${CONNECT_TIMEOUT_MS}ms`);
    logger.warn('PA cache Redis unavailable — live fetch only', { error: lastError });
    void teardown(client);
    return null;
  }

  redisClient = client;
  lastError = null;
  loggedError = null;
  logger.info('PA cache Redis connected');
  return client;
}

async function getClient(): Promise<RedisClient | null> {
  if (redisClient?.isReady) return redisClient;

  // A client that exists but is not ready is unusable, and its own reconnect
  // loop is still running. Drop it rather than wait on it.
  if (redisClient) {
    const stale = redisClient;
    redisClient = null;
    void teardown(stale);
  }

  if (connecting) return connecting;
  if (Date.now() < nextAttemptAt) return null;

  connecting = openClient().finally(() => {
    connecting = null;
  });
  return connecting;
}

function withTimeout<T>(promise: Promise<T>, fallback: T, ms = CACHE_OP_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      }
    );
  });
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const client = await getClient();
    if (!client) return null;
    const raw = await withTimeout(client.get(key), null);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  try {
    const client = await getClient();
    if (!client) return;
    await withTimeout(client.set(key, JSON.stringify(value), { EX: ttlSeconds }), undefined);
  } catch {
    // fail-soft
  }
}

export interface CacheHealth {
  status: 'up' | 'down';
  error?: string;
}

/**
 * Report whether the cache is usable, for /v1/health.
 *
 * Deliberately active rather than a cached flag: it calls getClient(), so a
 * health check both reports the true state AND drives reconnection. That makes
 * the health endpoint the thing that recovers the cache after an outage,
 * instead of a restart. The RETRY_COOLDOWN_MS gate means only one check per
 * thirty seconds actually attempts a connect; the rest return immediately.
 *
 * Redis is optional here — the cache is fail-soft and the service is designed
 * to run without it — so a 'down' result must not fail the health check. It
 * only has to be visible, which is exactly what was missing.
 */
export async function cacheHealth(): Promise<CacheHealth> {
  // No try/catch here on purpose. openClient() already catches the one path
  // that can throw (createClient on a malformed URL), so a catch at this level
  // would be unreachable — untestable defensive code that only depresses branch
  // coverage and implies a failure mode that does not exist. The health route
  // guards the call itself, and that guard is exercised by a route test.
  const client = await getClient();
  if (client) return { status: 'up' };
  return lastError ? { status: 'down', error: lastError } : { status: 'down' };
}
