/**
 * Tweede Kamer OData v5 client.
 * Ported from PlatO services/tk_client.py — preserving all upstream quirks.
 *
 * Quirks:
 * - OData $-params must NOT be percent-encoded. Build query string by hand.
 *   encodeURIComponent() would encode $ signs and break the OData protocol.
 * - URL for the TK website uses Nummer (was DocumentNummer in v4), never the internal UUID Id.
 * - Negative Ondernummer (-1) means "no value" — hide it (was Volgnummer in v4).
 * - Filter always includes `Verwijderd eq false`.
 */

import { createHash } from 'crypto';
import { config } from '@utils/config';
import { createLogger } from '@utils/logger';
import { cacheGet, cacheSet } from '../pa-cache';
import type { FeedItem } from '@ronl/shared';

const logger = createLogger('tk-client');

export const TK_DOCUMENT_TYPES = [
  'Motie',
  'Amendement',
  'Brief',
  'Kamervraag',
  'Verslag',
  'Rapport',
  'Vergaderverslag',
  'Antwoord',
  'Besluitenlijst',
] as const;

const HTTP_TIMEOUT_MS = 15_000;
// The per-term fan-out gets a longer budget than a single query. Its requests
// are cheaper individually ($count is omitted), and they are issued together, so
// the wall clock is the slowest one rather than their sum — but node does not
// reproduce the parallelism of separate processes, and every timer starts when
// the request is created, so a queued request spends its budget waiting. TK
// OData latency is also wildly unstable: the same five-term query measured 23s
// and 48s minutes apart. 15s aborted a five-term fan-out that curl served in 9s.
const FANOUT_TIMEOUT_MS = 30_000;
// TK OData caps $top at 100; asking for more returns HTTP 400.
const MAX_TOP = 100;

/** Split an OR query into its terms. A single term list means a simple query. */
function splitTerms(q: string | null): string[] {
  if (!q?.trim()) return [];
  return q
    .trim()
    .split(/\s+OR\s+/i)
    .map((t) => t.replace(/^"|"$/g, '').trim())
    .filter(Boolean);
}

function buildFilter(terms: string[], types: string[]): string {
  const parts: string[] = ['Verwijderd eq false'];
  if (terms.length === 1) {
    parts.push(`contains(Onderwerp,'${terms[0].replace(/'/g, "''")}')`);
  } else if (terms.length > 1) {
    const orClauses = terms
      .map((t) => `contains(Onderwerp,'${t.replace(/'/g, "''")}')`)
      .join(' or ');
    parts.push(`(${orClauses})`);
  }
  if (types.length) {
    const typeClauses = types.map((t) => `Soort eq '${t}'`).join(' or ');
    parts.push(`(${typeClauses})`);
  }
  return parts.join(' and ');
}

function buildUrl(
  terms: string[],
  types: string[],
  skip: number,
  top: number,
  withCount: boolean
): string {
  const filterStr = buildFilter(terms, types);
  // Encode only the filter value, leaving OData operators unencoded.
  // safe chars: () =', — matches PlatO's _up.quote(filter_str, safe="() =',")
  const encodedFilter = encodeURIComponent(filterStr)
    .replace(/%28/g, '(')
    .replace(/%29/g, ')')
    .replace(/%20/g, ' ')
    .replace(/%3D/g, '=')
    .replace(/%27/g, "'")
    .replace(/%2C/g, ',');
  return (
    `${config.pa.tkApiBase}/Document` +
    `?$orderby=GewijzigdOp desc` +
    `&$top=${top}` +
    `&$skip=${skip}` +
    (withCount ? `&$count=true` : '') +
    `&$filter=${encodedFilter}`
  );
}

/** One request, with its own timeout. Throws on abort or a non-ok status. */
async function fetchPage(
  url: string,
  timeoutMs: number = HTTP_TIMEOUT_MS
): Promise<Record<string, unknown>> {
  logger.info('TK fetch', { url });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`TK API ${res.status}: ${url}`);
    return (await res.json()) as Record<string, unknown>;
  } finally {
    clearTimeout(timer);
  }
}

function cacheKey(q: string | null, types: string[], skip: number, top: number): string {
  const raw = `tk|${q}|${[...types].sort().join(',')}|${skip}|${top}`;
  return 'tk:' + createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

function documentUrl(item: Record<string, unknown>): string | null {
  const nr = item['Nummer'] as string | undefined;
  if (nr) return `https://www.tweedekamer.nl/kamerstukken/detail?id=${nr}&did=${nr}`;
  return null;
}

function cleanNumber(v: unknown): string | null {
  if (v == null) return null;
  const n = Number(v);
  if (!isNaN(n) && n < 0) return null;
  return String(v);
}

function normalise(rawItems: Record<string, unknown>[]): FeedItem[] {
  return rawItems.map((item) => ({
    id: (item['Id'] as string) ?? '',
    title:
      (item['Onderwerp'] as string) ||
      (item['Titel'] as string) ||
      (item['Naam'] as string) ||
      '(geen onderwerp)',
    type: (item['Soort'] as string | null) ?? null,
    number: cleanNumber(item['Ondernummer']),
    date: (item['GewijzigdOp'] as string | null) ?? (item['Datum'] as string | null) ?? null,
    url: documentUrl(item),
    source: 'tk' as const,
  }));
}

export interface TkFeedResult {
  items: FeedItem[];
  total: number | null;
  skip: number;
  top: number;
}

export async function fetchTkFeed(
  q: string | null = null,
  types: string[] = [],
  skip = 0,
  top = 20
): Promise<TkFeedResult> {
  const key = cacheKey(q, types, skip, top);
  const cached = await cacheGet<TkFeedResult>(key);
  // Guard on the items, not the entry. A failed or empty fetch caches
  // { items: [], total: 0 }, which is truthy, so a transient upstream blip
  // used to be served as a real answer for the rest of the TTL — and the
  // blanco search band shares this cache key with the curation cycle, so
  // both reported the same zero and looked like independent confirmation.
  // Re-fetching a genuinely empty result costs one upstream call.
  if (cached?.items.length) return cached;

  const terms = splitTerms(q);

  // A multi-term OR is issued as one request per term, in parallel, and merged
  // here — not as a single `contains(A) or contains(B) or ...` filter.
  //
  // TK OData slows sharply per contains() clause, and asking it for a total over
  // the union is the larger half of that cost. Measured against the live API for
  // a five-term query: one OR request with $count took 23-48s and blew the 15s
  // AbortController every time, so every multi-term criterion — which is what
  // the whole seeded taxonomy uses — silently retrieved nothing from TK. Without
  // $count that same request takes ~13s, still inside the timeout only by luck.
  // Five single-term requests in parallel take ~9s all together, and the shape
  // scales flat rather than exponentially with the number of terms.
  //
  // The cost is the exact union total, which is precisely what cannot be had
  // cheaply. total is therefore null for multi-term queries; TkFeedResult
  // already allows it, and the search band falls back to the item count.
  let items: FeedItem[];
  let total: number | null;

  if (terms.length > 1) {
    // Each request needs the whole window, since any term may supply the newest
    // items once merged.
    const window = Math.min(skip + top, MAX_TOP);
    const pages = await Promise.allSettled(
      terms.map((t) => fetchPage(buildUrl([t], types, 0, window, false), FANOUT_TIMEOUT_MS))
    );

    const failed = pages.filter((p) => p.status === 'rejected');
    // All terms failing is a real failure; some failing is a thinner result, and
    // that beats losing the query outright because one term was slow.
    if (failed.length === terms.length) {
      const reason = (failed[0] as PromiseRejectedResult | undefined)?.reason;
      logger.error('TK API error', {
        error: reason instanceof Error ? reason.message : String(reason),
      });
      throw reason instanceof Error ? reason : new Error('TK API error');
    }
    if (failed.length) {
      logger.warn('TK partial fetch — some terms failed', {
        failed: failed.length,
        terms: terms.length,
      });
    }

    const merged = new Map<string, FeedItem>();
    for (const page of pages) {
      if (page.status !== 'fulfilled') continue;
      for (const item of normalise((page.value['value'] as Record<string, unknown>[]) ?? [])) {
        // First writer wins; the same document matching two terms is one hit.
        if (!merged.has(item.id)) merged.set(item.id, item);
      }
    }

    const sorted = [...merged.values()].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
    items = sorted.slice(skip, skip + top);
    total = null;
  } else {
    const data = await fetchPage(buildUrl(terms, types, skip, top, true)).catch((err: unknown) => {
      logger.error('TK API error', { error: err instanceof Error ? err.message : String(err) });
      throw err;
    });
    items = normalise((data['value'] as Record<string, unknown>[]) ?? []);
    total = (data['@odata.count'] as number | null) ?? null;
  }

  const result: TkFeedResult = { items, total, skip, top };

  await cacheSet(key, result, config.pa.cacheTtlTk);
  return result;
}
