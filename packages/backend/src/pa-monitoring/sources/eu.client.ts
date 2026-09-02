/**
 * European Parliament client — EP Open Data API v2 (Atom).
 *
 * Data source: EP plenary-documents feed (CC BY 4.0, no auth).
 *   https://data.europarl.europa.eu/api/v2/plenary-documents/feed
 *
 * Why the API rather than the RSS feeds it replaces:
 *   www.europarl.europa.eu is CDN-fronted with undocumented bot mitigation that
 *   answers our ACC egress range (20.76.243-246.x) with an empty 202 text/html —
 *   a soft block that passes res.ok and parses to zero items. Measured from
 *   inside the App Service: both RSS URLs return 202/0 bytes while this API
 *   returns 200 with 211 KB of Atom, in the same run, from the same IP. The API
 *   is also the endpoint the EP publishes for machines: it documents a
 *   User-Agent contract, where the CDN gates on a UA family it never describes.
 *   See issues #54 (root cause) and #55 (this migration).
 *
 *   The historical objection to the API — that its list endpoints carry no title,
 *   leaving the scoring engine nothing to match — does not apply to the *feed*
 *   endpoints, which do carry titles. It was /documents that was title-less.
 *
 * What the API gives us that RSS did not:
 *   A machine vocabulary for the document type (category/@scheme, an
 *   ep-document-types concept) instead of a free-text label, and parseable
 *   document references for every entry including older parliamentary terms.
 *
 * What it costs us, deliberately accepted (see #55):
 *   - English only. Entries are xml:lang="en" and Accept-Language is ignored.
 *   - No press releases. The API has no equivalent endpoint — they are a
 *     communications product, not legislative data — so that sub-source is gone.
 *   - No per-entry summary and no committee codes. The Atom entries carry only
 *     title, id, links, work-type and updated. So description is built from the
 *     title alone, and commissie is null for this sub-source.
 *
 * Term expansion:
 *   EP documents have English titles; our saved searches use Dutch terms
 *   (netcapaciteit, stikstof, …). FeedItem.description is the title PLUS Dutch
 *   equivalents of detected English EU-policy vocabulary (EU_TO_NL_TERMS), so
 *   the Dutch-query scoring engine in rules.ts can still find a desc match (+1).
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

// The EP Open Data API documents User-Agent as an optional header with the
// suggested format {user-id}-{environment}-{version}. Identifying ourselves is
// much of the point of preferring this endpoint, so we send it. The version is
// this client's own — it changes when the client changes, not on every release.
const EP_API_USER_AGENT = `ronl-business-api-${config.deploymentEnv}-1.0.0`;

// Takes no query parameters: a fixed "published or updated in the last month"
// window. That is the right shape for a monitoring source, and it means paging
// stays in-process exactly as it was under RSS.
const EP_PLENARY_FEED = 'https://data.europarl.europa.eu/api/v2/plenary-documents/feed';

// ── Document types ────────────────────────────────────────────────────────────

/**
 * Document types the EU source can yield, for the blanco search's type filter.
 * Mirrors TK_DOCUMENT_TYPES / OB_PUBLICATION_TYPES.
 *
 * 'Persbericht' is gone with the press-release feed (#55). The remaining labels
 * stay Dutch: they are our own UI vocabulary for the type filter, not source
 * content, so the English-only decision does not reach them.
 */
export const EU_DOCUMENT_TYPES = [
  'Verslag',
  'Motie',
  'Gezamenlijke motie',
  'Aangenomen tekst',
  'Schriftelijke vraag',
  'Mondelinge vraag',
] as const;

// Document reference prefix → Dutch document type label. Retained as the
// fallback for an entry whose work-type concept we do not recognise; the
// scheme-based map below is the primary route now that the source provides one.
const TYPE_BY_PREFIX: Record<string, string> = {
  'A-': 'Verslag',
  'B-': 'Motie',
  'RC-': 'Gezamenlijke motie',
  'TA-': 'Aangenomen tekst',
  'E-': 'Schriftelijke vraag',
  'QOB-': 'Mondelinge vraag',
  'O-': 'Mondelinge vraag',
};

export function inferType(ref: string): string | null {
  for (const [prefix, label] of Object.entries(TYPE_BY_PREFIX)) {
    if (ref.startsWith(prefix)) return label;
  }
  return null;
}

// EP work-type concept → Dutch label. The concept is the last segment of
// category/@scheme, e.g. .../def/ep-document-types/REPORT_PLENARY. Preferred
// over the ref prefix because it is a controlled vocabulary rather than a naming
// convention: QOB- and O- are both oral-question motions, and a prefix table has
// to learn each spelling separately.
const TYPE_BY_WORK_TYPE: Record<string, string> = {
  REPORT_PLENARY: 'Verslag',
  RESOLUTION_MOTION: 'Motie',
  RESOLUTION_MOTION_JOINT: 'Gezamenlijke motie',
  QUESTION_RESOLUTION_MOTION: 'Mondelinge vraag',
  ADOPTED_TEXT: 'Aangenomen tekst',
};

export function workTypeLabel(scheme: string): string | null {
  const concept = scheme.trim().split('/').pop() ?? '';
  return TYPE_BY_WORK_TYPE[concept] ?? null;
}

export function doceoUrl(ref: string): string {
  return `https://www.europarl.europa.eu/doceo/document/${ref}_NL.html`;
}

// ── Term expansion ────────────────────────────────────────────────────────────

// Map English EU-policy vocabulary patterns → Dutch monitoring terms.
// Applied to the title so that the Dutch-query scoring engine (rules.ts) can
// find a desc match (+1) for EP documents.
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

// ── Atom parsing ──────────────────────────────────────────────────────────────

const XML_PARSER = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) => name === 'entry' || name === 'category' || name === 'link',
});

/** An Atom text construct: `<title type="text" xml:lang="en">…</title>`. */
interface AtomText {
  '#text'?: string | number;
}

interface AtomCategory {
  '@_term'?: string;
  '@_scheme'?: string;
  '@_label'?: string;
}

interface AtomEntry {
  title?: AtomText | string;
  id?: AtomText | string;
  updated?: AtomText | string;
  category?: AtomCategory[];
}

/**
 * Read an Atom element's text whether fast-xml-parser gave us a bare string or,
 * because the element carries attributes, an object with '#text'. <title> has
 * attributes and <id> does not, so both shapes occur within one entry.
 */
function readText(value: AtomText | string | undefined): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (value && typeof value === 'object' && value['#text'] !== undefined) {
    return String(value['#text']).trim() || null;
  }
  return null;
}

// An EP document reference: prefix, parliamentary term, year, number.
//
// The term is NOT always 10. The feed covers documents *updated* in the last
// month, which pulls in older ones — the live feed carries terms 5, 6, 8 and 9.
// The RSS-era regex hardcoded -10- and would silently drop those (10 of 325
// entries when this was written), because an entry with no identity is dropped.
//
// Anchored at both ends on purpose, which excludes amendment lists: their refs
// carry extra segments (A-10-2025-0226-AM-001-002). That is deliberate — an
// amendment is a fragment of a document rather than one, it has no doceo page of
// its own, so doceoUrl() would produce a dead link. One of 325 entries. This is
// the rule the whole client follows: emit an entry only when its reference is a
// canonical EP document ref, because that is what makes both the signal id and
// the document URL trustworthy.
const EP_REF = /^[A-Z]{1,4}-\d{1,2}-\d{4}-\d{4}$/;

/**
 * Take the document reference from an Atom entry's <id>, which is the ELI URI
 * `https://data.europarl.europa.eu/eli/dl/doc/A-10-2026-0204`.
 *
 * Reads the last path segment rather than regex-hunting the whole string: the id
 * is a structured identifier, so its final segment *is* the ref, and matching it
 * whole means a malformed id is rejected rather than half-parsed.
 */
export function refFromEntryId(id: string): string | null {
  const segment = id.trim().replace(/\/+$/, '').split('/').pop() ?? '';
  return EP_REF.test(segment) ? segment : null;
}

function normaliseAtomEntry(entry: AtomEntry): FeedItem | null {
  const title = readText(entry.title);
  if (!title) return null;

  const id = readText(entry.id);
  const ref = id ? refFromEntryId(id) : null;
  // No reference means no stable identity to key a signal on, and the curation
  // cycle dedupes by id. Drop it rather than invent one.
  if (!ref) return null;

  const categories = Array.isArray(entry.category) ? entry.category : [];
  const workType = categories.find((c) => c['@_scheme']);
  const type =
    (workType?.['@_scheme'] ? workTypeLabel(workType['@_scheme']) : null) ?? inferType(ref);

  let date: string | null = null;
  const updated = readText(entry.updated);
  if (updated) {
    const parsed = new Date(updated);
    if (!Number.isNaN(parsed.getTime())) date = parsed.toISOString().slice(0, 10);
  }

  return {
    id: ref,
    title,
    type,
    number: ref,
    date,
    url: doceoUrl(ref),
    source: 'eu' as const,
    // Kept as 'ep-rss' although the transport is now Atom over the API. The
    // value is a persisted sub-source key — pa_signals.subbron, backfilled by an
    // idempotent migration — and it identifies the *stream* (EP plenary
    // documents), which has not changed. Renaming it would split existing
    // signals from new ones across two labels for one source and buy nothing.
    // The display label is what was corrected instead.
    subbron: 'ep-rss',
    // The API's Atom entries carry no committee. Under RSS this came from
    // <category domain="body">, which has no equivalent here; the detail
    // endpoint would mean one request per entry. ep-teksten still supplies it
    // for documents that appear in both.
    commissie: null,
    description: addDutchContext(title),
  };
}

/**
 * Parse an EP Atom XML string into FeedItem[].
 * Exported as a pure function so unit tests can call it without network I/O.
 */
export function parseAtomFeed(xml: string): FeedItem[] {
  let doc: Record<string, unknown>;
  try {
    doc = XML_PARSER.parse(xml) as Record<string, unknown>;
  } catch {
    return [];
  }
  const feed = doc['feed'] as Record<string, unknown> | undefined;
  const entries = (feed?.['entry'] as AtomEntry[] | undefined) ?? [];
  const result: FeedItem[] = [];
  for (const entry of entries) {
    const item = normaliseAtomEntry(entry);
    if (item) result.push(item);
  }
  return result;
}

// ── Feed fetcher ──────────────────────────────────────────────────────────────

async function fetchFeed(feedUrl: string): Promise<FeedItem[]> {
  const key = 'eu:feed:' + createHash('sha256').update(feedUrl).digest('hex').slice(0, 16);
  const cached = await cacheGet<FeedItem[]>(key);
  // An empty hit is not a valid answer to serve for the rest of the TTL — it is
  // what a failed fetch used to leave behind. Re-fetch instead.
  if (cached?.length) return cached;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  let xml: string;
  try {
    const res = await fetch(feedUrl, {
      signal: controller.signal,
      headers: {
        Accept: 'application/atom+xml, application/xml, text/xml',
        'User-Agent': EP_API_USER_AGENT,
      },
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`EP API ${res.status}: ${feedUrl}`);
    xml = await res.text();
    // A 2xx that is not the feed — a bot-protection 202, an error page, a
    // redirect landing — must fail loudly rather than parse to an empty list.
    // This guard is what made the CDN block visible in the first place; moving
    // to the API does not make it unnecessary.
    if (!xml.trimStart().startsWith('<')) {
      throw new Error(`EP API ${res.status} returned ${xml.length} bytes of non-XML: ${feedUrl}`);
    }
  } catch (err) {
    clearTimeout(timer);
    logger.warn('EP API fetch failed', {
      feedUrl,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }

  const items = parseAtomFeed(xml);
  logger.info('EP API fetched', { feedUrl, count: items.length });
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
  const entries = await fetchFeed(EP_PLENARY_FEED);

  // Deduplicate by ref and sort newest first. Two feeds can no longer collide
  // now the press-release feed is gone, but a single feed still can: the window
  // is "published or updated", and a reissued document appears under its
  // original ref.
  const seen = new Set<string>();
  const all: FeedItem[] = entries.filter((item) => {
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

/** Parse a local Atom file — useful for development without network access. */
export function parseAtomFile(path: string): FeedItem[] {
  try {
    return parseAtomFeed(readFileSync(path, 'utf-8'));
  } catch {
    return [];
  }
}
