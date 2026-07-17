/**
 * Fail-soft Redis cache for PA monitoring.
 * Any Redis error falls through to a live fetch — the service stays up.
 */

import { createClient } from 'redis';
import { config } from '@utils/config';
import { createLogger } from '@utils/logger';

const logger = createLogger('pa-cache');

let redisClient: ReturnType<typeof createClient> | null = null;
let connectAttempted = false;

async function getClient(): Promise<ReturnType<typeof createClient> | null> {
  if (connectAttempted) return redisClient;
  connectAttempted = true;
  try {
    const client = createClient({ url: config.redis.url });
    client.on('error', (err: Error) => {
      logger.warn('PA cache Redis error', { error: err.message });
    });
    await client.connect();
    redisClient = client;
    logger.info('PA cache Redis connected');
  } catch (err) {
    connectAttempted = false; // allow retry on next curation cycle
    logger.warn('PA cache Redis unavailable — live fetch only', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return redisClient;
}

// node-redis v4 queues commands while reconnecting after ECONNRESET, so an
// awaited client.get() can hang indefinitely. Race against a 2 s timeout so a
// dead Redis always falls through to the live fetch instead of blocking the
// curation cycle.
const CACHE_OP_TIMEOUT_MS = 2_000;

function withTimeout<T>(promise: Promise<T>, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), CACHE_OP_TIMEOUT_MS);
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
