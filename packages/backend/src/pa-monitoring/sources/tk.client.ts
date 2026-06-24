/**
 * Tweede Kamer OData v4 client.
 * Ported from PlatO services/tk_client.py — preserving all upstream quirks.
 *
 * Quirks:
 * - OData $-params must NOT be percent-encoded. Build query string by hand.
 *   encodeURIComponent() would encode $ signs and break the OData protocol.
 * - URL for the TK website uses DocumentNummer, never the internal UUID Id.
 * - Negative Volgnummer (-1) means "no value" — hide it.
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

function buildFilter(q: string | null, types: string[]): string {
  const parts: string[] = ['Verwijderd eq false'];
  if (q?.trim()) {
    // Split on OR — OData contains() is a literal match, not a boolean search.
    const terms = q
      .trim()
      .split(/\s+OR\s+/i)
      .map((t) => t.replace(/^"|"$/g, '').trim())
      .filter(Boolean);
    if (terms.length === 1) {
      parts.push(`contains(Onderwerp,'${terms[0].replace(/'/g, "''")}')`);
    } else {
      const orClauses = terms
        .map((t) => `contains(Onderwerp,'${t.replace(/'/g, "''")}')`)
        .join(' or ');
      parts.push(`(${orClauses})`);
    }
  }
  if (types.length) {
    const typeClauses = types.map((t) => `Soort eq '${t}'`).join(' or ');
    parts.push(`(${typeClauses})`);
  }
  return parts.join(' and ');
}

function buildUrl(q: string | null, types: string[], skip: number, top: number): string {
  const filterStr = buildFilter(q, types);
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
    `&$count=true` +
    `&$filter=${encodedFilter}`
  );
}

function cacheKey(q: string | null, types: string[], skip: number, top: number): string {
  const raw = `tk|${q}|${[...types].sort().join(',')}|${skip}|${top}`;
  return 'tk:' + createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

function documentUrl(item: Record<string, unknown>): string | null {
  const nr = item['DocumentNummer'] as string | undefined;
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
    number: cleanNumber(item['Volgnummer']),
    date:
      (item['GewijzigdOp'] as string | null) ??
      (item['DatumRegistratie'] as string | null) ??
      (item['Datum'] as string | null) ??
      null,
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
  if (cached) return cached;

  const url = buildUrl(q, types, skip, top);
  logger.info('TK fetch', { url });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  let data: Record<string, unknown>;
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) {
      throw new Error(`TK API ${res.status}: ${url}`);
    }
    data = (await res.json()) as Record<string, unknown>;
  } catch (err) {
    clearTimeout(timer);
    logger.error('TK API error', { error: err instanceof Error ? err.message : String(err) });
    throw err;
  }

  const items = normalise((data['value'] as Record<string, unknown>[]) ?? []);
  const total = (data['@odata.count'] as number | null) ?? null;
  const result: TkFeedResult = { items, total, skip, top };

  await cacheSet(key, result, config.pa.cacheTtlTk);
  return result;
}
