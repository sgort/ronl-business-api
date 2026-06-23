/**
 * Officiële Bekendmakingen SRU client.
 * Ported from PlatO services/ob_client.py — preserving all upstream quirks.
 *
 * Quirks:
 * - CQL exact-match operator is double == (not single =).
 * - sortKeys must NOT be sent — the server returns a diagnostic error.
 *   Sort client-side by dcterms:date after fetching.
 * - Fetch 3× top on page 1 so the trimmed top-N is genuinely the newest.
 * - XML uses default namespace (no prefix). Walk with fast-xml-parser using
 *   attributeNamePrefix + namespace-aware config.
 * - w.jaargang MUST be dynamic (new Date().getFullYear()) — PlatO hardcoded
 *   "2026" and would break every January.
 */

import { createHash } from 'crypto';
import { XMLParser } from 'fast-xml-parser';
import { config } from '@utils/config';
import { createLogger } from '@utils/logger';
import { cacheGet, cacheSet } from '../pa-cache';
import type { FeedItem } from '@ronl/shared';

const logger = createLogger('ob-client');

const SRU_BASE = 'https://repository.overheid.nl/sru';
const HTTP_TIMEOUT_MS = 15_000;

export const OB_PUBLICATION_TYPES = [
  'Staatsblad',
  'Staatscourant',
  'Tractatenblad',
  'Kamerstuk',
  'Gemeenteblad',
  'Provinciaal blad',
  'Blad gemeenschappelijke regeling',
  'Waterschapsblad',
] as const;

function buildCql(q: string | null, pubTypes: string[]): string {
  const year = new Date().getFullYear();
  const parts: string[] = ['c.product-area == "officielepublicaties"', `w.jaargang == "${year}"`];
  if (q?.trim()) {
    const safe = q.trim().replace(/"/g, '\\"');
    parts.push(`cql.textAndIndexes any "${safe}"`);
  }
  if (pubTypes.length) {
    const typeClauses = pubTypes.map((t) => `w.publicatienaam == "${t}"`).join(' OR ');
    parts.push(`(${typeClauses})`);
  }
  return parts.join(' AND ');
}

function cacheKey(q: string | null, pubTypes: string[], skip: number, top: number): string {
  const raw = `ob8|${q}|${[...pubTypes].sort().join(',')}|${skip}|${top}`;
  return 'ob:' + createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

// fast-xml-parser config to handle namespaced XML.
// We instruct it to keep namespace prefixes intact.
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: false,
  parseTagValue: true,
  trimValues: true,
});

function dig(obj: unknown, ...keys: string[]): unknown {
  let cur = obj;
  for (const k of keys) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

function str(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'string') return v.trim() || null;
  if (typeof v === 'object' && '#text' in (v as Record<string, unknown>)) {
    return String((v as Record<string, unknown>)['#text']).trim() || null;
  }
  return null;
}

interface ParsedRecord {
  id: string | null;
  title: string | null;
  type: string | null;
  date: string | null;
  description: string | null;
  url: string | null;
}

function parseRecord(recordData: unknown): ParsedRecord | null {
  // Walk to the ow:wetgevingContainer or the root content element.
  // The structure under recordData varies; we use dig() to navigate paths
  // and fall back gracefully when a path doesn't exist.

  const kern =
    dig(recordData, 'ow:wetgevingContainer', 'ow:owmskern') ??
    dig(recordData, 'ow:wetgeving', 'ow:owmskern') ??
    findDeep(recordData, 'ow:owmskern');

  const mantel =
    dig(recordData, 'ow:wetgevingContainer', 'ow:owmsmantel') ??
    dig(recordData, 'ow:wetgeving', 'ow:owmsmantel') ??
    findDeep(recordData, 'ow:owmsmantel');

  const tpmeta = findDeep(recordData, 'ow:tpmeta');
  const enriched = findDeep(recordData, 'gzd:enrichedData');

  if (!kern) return null;

  const identifier = str(dig(kern, 'dcterms:identifier'));
  const title = str(dig(kern, 'dcterms:title'));
  const dateVal = str(dig(mantel, 'dcterms:date'));
  const description = str(dig(mantel, 'dcterms:abstract'));
  const pubType = str(dig(tpmeta, 'ow:publicatienaam'));

  let url: string | null = null;
  if (enriched) {
    url = str(dig(enriched, 'gzd:preferredUrl'));
  }
  if (!url && identifier) {
    url = `https://zoek.officielebekendmakingen.nl/${identifier}.html`;
  }

  if (!title && !identifier) return null;

  return { id: identifier, title, type: pubType, date: dateVal, description, url };
}

function findDeep(obj: unknown, key: string): unknown {
  if (obj == null || typeof obj !== 'object') return undefined;
  const rec = obj as Record<string, unknown>;
  if (key in rec) return rec[key];
  for (const v of Object.values(rec)) {
    const found = findDeep(v, key);
    if (found !== undefined) return found;
  }
  return undefined;
}

function toArray(v: unknown): unknown[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

export interface ObFeedResult {
  items: FeedItem[];
  total: number | null;
  skip: number;
  top: number;
}

export async function fetchObFeed(
  q: string | null = null,
  pubTypes: string[] = [],
  skip = 0,
  top = 20
): Promise<ObFeedResult> {
  const key = cacheKey(q, pubTypes, skip, top);
  const cached = await cacheGet<ObFeedResult>(key);
  if (cached) return cached;

  // Fetch 3× top on page 1 for a better client-side sort window
  const fetchTop = skip === 0 ? top * 3 : top;

  const params = new URLSearchParams({
    operation: 'searchRetrieve',
    version: '2.0',
    maximumRecords: String(fetchTop),
    startRecord: String(skip + 1),
    query: buildCql(q, pubTypes),
    // sortKeys intentionally omitted
  });

  logger.info('OB SRU fetch', { query: params.get('query'), fetchTop });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  let xmlText: string;
  try {
    const res = await fetch(`${SRU_BASE}?${params}`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`OB SRU ${res.status}`);
    xmlText = await res.text();
  } catch (err) {
    clearTimeout(timer);
    logger.error('OB SRU request error', {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  let parsed: unknown;
  try {
    parsed = xmlParser.parse(xmlText);
  } catch (err) {
    logger.error('OB SRU XML parse error', {
      error: err instanceof Error ? err.message : String(err),
    });
    throw new Error(`Invalid XML from OB SRU: ${err instanceof Error ? err.message : err}`);
  }

  // Navigate: searchRetrieveResponse > numberOfRecords + records
  const root = dig(parsed, 'searchRetrieveResponse') ?? parsed;
  const totalRaw = str(dig(root, 'numberOfRecords'));
  const total = totalRaw != null ? parseInt(totalRaw, 10) : null;

  const recordsNode = dig(root, 'records');
  const recordEls = toArray(dig(recordsNode, 'record'));

  const items: FeedItem[] = [];
  for (const rec of recordEls) {
    const dataEl = dig(rec, 'recordData');
    if (!dataEl) continue;
    const parsed = parseRecord(dataEl);
    if (!parsed) continue;
    items.push({
      id: parsed.id ?? '',
      title: parsed.title ?? '(geen titel)',
      type: parsed.type ?? null,
      number: null,
      date: parsed.date,
      url: parsed.url,
      description: parsed.description ?? undefined,
      source: 'ob',
    });
  }

  // Sort newest first client-side, then trim to requested top
  items.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  const trimmed = items.slice(0, top);

  logger.info('OB SRU result', { total, parsed: trimmed.length });
  const result: ObFeedResult = { items: trimmed, total, skip, top };

  await cacheSet(key, result, config.pa.cacheTtlTk);
  return result;
}
