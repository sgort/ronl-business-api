/**
 * European Parliament RSS client — replaces the EP Open Data API v2 approach.
 *
 * Data source: EP plenary-documents RSS feed (CC BY 4.0, no auth, fast ~1-2 s).
 *   https://www.europarl.europa.eu/rss/doc/plenary/nl.xml
 *   https://www.europarl.europa.eu/rss/doc/press-releases/nl.xml
 *
 * Why RSS instead of the EP Open Data API v2:
 *   The v2 REST list endpoints (/documents, /parliamentary-questions) return only
 *   identifier, work_type URI and document_date — no title field is present.
 *   Without titles the scoring engine cannot match saved-search terms, so rel stays
 *   at 3 and nothing clears the rel ≥ 4 persistence threshold. SPARQL also 404s.
 *   The RSS plenary feed carries the same documents with titles, Dutch document-type
 *   labels in <category domain="type">, and doceo provenance links — all we need.
 *
 * Term expansion:
 *   EP plenary documents have English-language titles. Our saved searches use Dutch
 *   terms (netcapaciteit, stikstof, …). The optional FeedItem.description field is
 *   populated with the stripped RSS description PLUS Dutch equivalents of detected
 *   English EU-policy vocabulary (EU_TO_NL_TERMS table). The scoring engine awards
 *   +1 per desc match, which combined with the +2 high-value-type bump makes
 *   Verslagen/Moties about relevant topics reach rel ≥ 4.
 *
 * Provenance: CC BY 4.0 — attribute "Europees Parlement".
 *   Document links follow the doceo pattern: .../document/{REF}_NL.html.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { XMLParser } from 'fast-xml-parser';
import { config } from '@utils/config';
import { createLogger } from '@utils/logger';
import { cacheGet, cacheSet } from '../pa-cache';
import type { FeedItem } from '@ronl/shared';

const logger = createLogger('eu-client');

// Kept from original: matches the AbortController timeout on the config page
const HTTP_TIMEOUT_MS = 30_000;

const EP_PLENARY_FEED = 'https://www.europarl.europa.eu/rss/doc/plenary/nl.xml';
const EP_PRESSREL_FEED = 'https://www.europarl.europa.eu/rss/doc/press-releases/nl.xml';

// ── Helpers (kept from original per handoff) ──────────────────────────────────

// Document reference prefix → Dutch document type label
const TYPE_BY_PREFIX: Record<string, string> = {
  'A-': 'Verslag',
  'B-': 'Motie',
  'RC-': 'Gezamenlijke motie',
  'TA-': 'Aangenomen tekst',
  'E-': 'Schriftelijke vraag',
  'O-': 'Mondelinge vraag',
};

export function inferType(ref: string): string | null {
  for (const [prefix, label] of Object.entries(TYPE_BY_PREFIX)) {
    if (ref.startsWith(prefix)) return label;
  }
  return null;
}

export function doceoUrl(ref: string): string {
  return `https://www.europarl.europa.eu/doceo/document/${ref}_NL.html`;
}

// ── Term expansion ────────────────────────────────────────────────────────────

// Map English EU-policy vocabulary patterns → Dutch monitoring terms.
// Applied to the combined title + description text so that the Dutch-query
// scoring engine (rules.ts) can find a desc match (+1) for EP documents.
const EU_TO_NL_TERMS: Array<[RegExp, string[]]> = [
  [/\bnitrogen\b/i, ['stikstof', 'stikstofreductie']],
  [
    /\bnature restoration\b/i,
    ['stikstof', 'stikstofreductie', 'natuurherstelverordening', 'biodiversiteit'],
  ],
  [/\bbiodiversit/i, ['biodiversiteit']],
  [/\belectricit/i, ['elektriciteit', 'netcapaciteit', 'energietransitie']],
  [
    /\benergy.{0,20}grid\b|\bgrid.{0,15}capac/i,
    ['netcapaciteit', 'netbeheerder', 'energietransitie'],
  ],
  [/\bnetwork.{0,20}capac/i, ['netcapaciteit', 'netbeheerder']],
  [/\bflexibilit/i, ['flexibiliteit']],
  [/\brenewable energy\b/i, ['hernieuwbare energie', 'energietransitie']],
  [/\bclimate\b/i, ['klimaat', 'klimaatverandering']],
  [/\bwater.{0,10}qual|\bwater framework\b/i, ['waterkwaliteit']],
  [/\bhydrogen\b/i, ['waterstof', 'energietransitie']],
  [/\bpfas\b|\bperfluoro/i, ['pfas', 'waterkwaliteit']],
];

export function addDutchContext(text: string): string {
  const extras: string[] = [];
  for (const [pattern, dutchTerms] of EU_TO_NL_TERMS) {
    if (pattern.test(text)) extras.push(...dutchTerms);
  }
  if (!extras.length) return text;
  return `${text} [${[...new Set(extras)].join(' ')}]`;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── RSS parsing ───────────────────────────────────────────────────────────────

const XML_PARSER = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) => name === 'item' || name === 'category',
});

interface RssCategory {
  '#text': string;
  '@_domain'?: string;
}

interface RssGuid {
  '#text': string;
  '@_isPermaLink'?: string;
}

interface RssItem {
  title?: string;
  link?: string;
  description?: string;
  category?: RssCategory[];
  pubDate?: string;
  guid?: RssGuid | string;
}

// Extract the normalised EP ref (e.g. "A-10-2026-0181") from a guid string
// like "RR_A-10-2026-0181_v02-00_EN", or fall back to parsing the title suffix.
function extractRef(guid: string, title: string): string | null {
  const m = guid.match(/\b([A-Z]{1,3}-10-\d{4}-\d{4})\b/);
  if (m) return m[1];
  const t = title.match(/\b([A-Z]{1,3})10-(\d{4})\/(\d{4})\s*$/);
  if (t) return `${t[1]}-10-${t[3]}-${t[2]}`;
  return null;
}

function normaliseRssItem(item: RssItem): FeedItem | null {
  const title = typeof item.title === 'string' ? item.title.trim() : null;
  if (!title) return null;

  // Extract the Dutch document type from the category with domain="type"
  const categories = Array.isArray(item.category) ? item.category : [];
  const typeCat = categories.find((c) => c['@_domain'] === 'type');
  const rssType = typeCat ? (typeCat['#text']?.trim() ?? null) : null;

  // Ref from guid (plain string or object with #text)
  const guidRaw = item.guid;
  const guidStr = typeof guidRaw === 'object' ? (guidRaw['#text'] ?? '') : String(guidRaw ?? '');
  const ref = extractRef(guidStr, title);

  // Only surface items with a recognisable EP document ref (not agendas, etc.)
  if (!ref) return null;

  const type = rssType || inferType(ref);

  let date: string | null = null;
  if (item.pubDate) {
    try {
      date = new Date(item.pubDate).toISOString().slice(0, 10);
    } catch {
      /* ignore */
    }
  }

  const rawDesc = typeof item.description === 'string' ? stripHtml(item.description) : '';
  const description = addDutchContext(`${title} ${rawDesc}`.trim());

  return {
    id: ref,
    title,
    type,
    number: ref,
    date,
    url: doceoUrl(ref),
    source: 'eu' as const,
    subbron: 'ep-rss',
    description,
  };
}

/**
 * Parse an EP RSS XML string into FeedItem[].
 * Exported as a pure function so unit tests can call it without network I/O.
 */
export function parseRssFeed(xml: string): FeedItem[] {
  let doc: Record<string, unknown>;
  try {
    doc = XML_PARSER.parse(xml) as Record<string, unknown>;
  } catch {
    return [];
  }
  const channel = (doc['rss'] as Record<string, unknown> | undefined)?.['channel'] as
    | Record<string, unknown>
    | undefined;
  const items = (channel?.['item'] as RssItem[] | undefined) ?? [];
  const result: FeedItem[] = [];
  for (const item of items) {
    const fi = normaliseRssItem(item);
    if (fi) result.push(fi);
  }
  return result;
}

// ── Feed fetcher ──────────────────────────────────────────────────────────────

async function fetchFeed(feedUrl: string): Promise<FeedItem[]> {
  const key = 'eu:feed:' + createHash('sha256').update(feedUrl).digest('hex').slice(0, 16);
  const cached = await cacheGet<FeedItem[]>(key);
  if (cached) return cached;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  let xml: string;
  try {
    const res = await fetch(feedUrl, {
      signal: controller.signal,
      headers: { Accept: 'application/rss+xml, application/xml, text/xml' },
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`EU RSS ${res.status}: ${feedUrl}`);
    xml = await res.text();
  } catch (err) {
    clearTimeout(timer);
    logger.warn('EU RSS fetch failed', {
      feedUrl,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }

  const items = parseRssFeed(xml);
  logger.info('EU RSS fetched', { feedUrl, count: items.length });
  await cacheSet(key, items, config.pa.cacheTtlTk);
  return items;
}

// ── Public API (shape kept from original) ────────────────────────────────────

export interface EuFeedResult {
  items: FeedItem[];
  total: number | null;
  skip: number;
  top: number;
}

export async function fetchEuFeed(
  _q: string | null = null,
  _types: string[] = [],
  skip = 0,
  top = 20
): Promise<EuFeedResult> {
  // Fetch both feeds in parallel; failures fall through (returns [])
  const [plenary, pressrel] = await Promise.all([
    fetchFeed(EP_PLENARY_FEED),
    fetchFeed(EP_PRESSREL_FEED),
  ]);

  // Merge, deduplicate by ref, sort newest first
  const seen = new Set<string>();
  const all: FeedItem[] = [...plenary, ...pressrel].filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
  all.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));

  // Return the requested page; scoring + filtering happens in rules.ts
  const page = all.slice(skip, skip + top);
  return { items: page, total: all.length, skip, top };
}

// ── Local fixture helper (used by tests / dev) ────────────────────────────────

/** Parse a local RSS file — useful for development without network access. */
export function parseRssFile(path: string): FeedItem[] {
  try {
    return parseRssFeed(readFileSync(path, 'utf-8'));
  } catch {
    return [];
  }
}
