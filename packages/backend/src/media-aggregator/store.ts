/**
 * media-aggregator — in-memory article store with TTL.
 *
 * MVP: no OpenSearch, no Postgres. The corpus is small (a handful of feeds), so
 * we cache the enriched, deduped article set in memory and refresh it lazily,
 * exactly like nieuws.service.ts. The cockpit polls on a 6-hour curation cycle,
 * so a 15-minute TTL is comfortably fresh while keeping outbound calls tiny.
 *
 * On refresh failure we serve the stale cache rather than an empty result.
 */

import { createLogger } from '@utils/logger';
import type { AggregatorArticle } from './types';
import { ingestAll } from './ingest';

const logger = createLogger('media-aggregator-store');

function ttlMs(): number {
  const raw = Number(process.env.MEDIA_AGGREGATOR_CACHE_TTL_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 15 * 60 * 1000;
}

interface Cache {
  articles: AggregatorArticle[];
  fetchedAt: number;
}

let cache: Cache | null = null;
let inflight: Promise<AggregatorArticle[]> | null = null;

async function refresh(): Promise<AggregatorArticle[]> {
  try {
    const articles = await ingestAll();
    cache = { articles, fetchedAt: Date.now() };
    return articles;
  } catch (err) {
    logger.error('Store refresh failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    if (cache) return cache.articles; // serve stale
    return [];
  }
}

/** Return the current article set, refreshing if the cache is cold or stale. */
export async function getArticles(): Promise<AggregatorArticle[]> {
  const fresh = cache && Date.now() - cache.fetchedAt < ttlMs();
  if (fresh) return cache!.articles;

  // Coalesce concurrent refreshes into one in-flight fetch.
  if (!inflight) {
    inflight = refresh().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

/** Test/ops helper — drop the cache so the next read refetches. */
export function clearCache(): void {
  cache = null;
}
