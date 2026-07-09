/**
 * EP "Ingediende teksten" (texts-submitted) client.
 *
 * Data source: https://www.europarl.europa.eu/plenary/nl/texts-submitted.html
 * The page is server-rendered HTML. Verified structure (2026-07):
 *   - Each document lives in a  div.notice  card.
 *   - Title + doceo href:  p.title a
 *   - Reference (display form A10-0151/2026):  .date_reference span.reference  (first one)
 *   - Date (dd-mm-yyyy):  .date_reference .date  (text contains "Datum :" prefix to strip)
 *   - Committee code:  span.acronym_comdel[title]
 *   - Tab param: ?tabType=reports  or  ?tabType=motions
 *   - Pagination: GET  ?tabType=X&page=N  (no next-link; stop when page returns 0 notices)
 *
 * Both tabs feed bron:'eu', subbron:'ep-teksten'. Committee is display metadata only.
 */

import * as cheerio from 'cheerio';
import type { CheerioAPI, Cheerio } from 'cheerio';
import type { AnyNode } from 'domhandler';
import { createLogger } from '@utils/logger';
import { addDutchContext } from './eu.client';
import type { FeedItem } from '@ronl/shared';

const logger = createLogger('ep-teksten-client');

const EP_TEXTS_BASE = 'https://www.europarl.europa.eu/plenary/nl/texts-submitted.html';
const USER_AGENT = 'PA-Cockpit/1.0 Provincie-Flevoland (monitoring@flevoland.nl)';
const TIMEOUT_MS = 20_000;
const PAGE_DELAY_MS = 800;
const MAX_PAGES = 10;

// tabType values as used in the EP URL query param (verified from live page).
const EP_SED_TABS = [
  { tabType: 'reports', label: 'Verslagen' },
  { tabType: 'motions', label: 'Ontwerpresoluties' },
] as const;

export interface RawEpDoc {
  /** Canonical dashed ref, e.g. A-10-2026-0151. Used as dedup key. */
  id: string;
  title: string;
  /** Dutch document type label. */
  docType: string;
  epRef: string;
  date: string | null;
  committee: string | null;
  doceoUrl: string;
}

// ── Reference normalisation ───────────────────────────────────────────────────

/**
 * Normalise EP display references to canonical dashed form used in doceo URLs.
 * A10-0151/2026  →  A-10-2026-0151
 * B10-0333/2026  →  B-10-2026-0333
 * A-10-2026-0151 →  A-10-2026-0151 (already canonical, pass-through)
 */
export function normaliseEpRef(raw: string): string | null {
  const s = raw.trim().replace(/\s+/g, '');
  if (/^[A-Z]{1,3}-10-\d{4}-\d{4,}$/.test(s)) return s;
  const m = s.match(/^([A-Z]{1,3})-?10-(\d+)\/(\d{4})$/);
  if (m) return `${m[1]}-10-${m[3]}-${m[2].padStart(4, '0')}`;
  return null;
}

// ── HTML page fetch ───────────────────────────────────────────────────────────

async function fetchPageHtml(page: number, tabType: string): Promise<string> {
  const url = new URL(EP_TEXTS_BASE);
  url.searchParams.set('tabType', tabType);
  if (page > 1) url.searchParams.set('page', String(page));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'nl,en;q=0.9',
      },
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// ── Cheerio card parser ───────────────────────────────────────────────────────

function parseCard($card: Cheerio<AnyNode>, _$: CheerioAPI): RawEpDoc | null {
  // Title and doceo URL come from the same anchor inside p.title.
  const titleAnchor = $card.find('p.title a').first();
  const title = titleAnchor.text().trim();
  if (!title) return null;

  // Prefer the href for the doceo URL (it's the canonical link on the card itself).
  const href = titleAnchor.attr('href') ?? '';

  // Reference — first .reference span inside .date_reference (e.g. "A10-0151/2026").
  const refRaw = $card.find('.date_reference .reference').first().text().trim();
  const epRef = normaliseEpRef(refRaw);
  if (!epRef) return null;

  // Doceo URL: from href if valid, otherwise construct from ref.
  const resolvedUrl = href.includes('/doceo/document/')
    ? href
    : `https://www.europarl.europa.eu/doceo/document/${epRef}_NL.html`;

  // Document type — derive from the canonical ref prefix.
  // B-prefix on texts-submitted = Ontwerpresolutie (draft resolution).
  // A-prefix covers both Verslagen and Aanbevelingen; distinguish by title prefix.
  let docType: string;
  if (epRef.startsWith('B-')) {
    docType = 'Ontwerpresolutie';
  } else if (/^aanbeveling\b/i.test(title)) {
    docType = 'Aanbeveling';
  } else {
    docType = 'Verslag';
  }

  // Committee — the orange badge: span.acronym_comdel; code is in the title attribute.
  const commEl = $card.find('span.acronym_comdel').first();
  const committeeRaw = commEl.attr('title')?.trim() ?? commEl.text().trim();
  // Validate: committee codes are 2–6 uppercase letters.
  const committee = /^[A-Z]{2,6}$/.test(committeeRaw) ? committeeRaw : null;

  // Date — span.date contains "Datum :dd-mm-yyyy"; strip the label with a regex.
  const dateText = $card.find('.date_reference .date').text().trim();
  let date: string | null = null;
  const dm = dateText.match(/(\d{2})-(\d{2})-(\d{4})/);
  if (dm) {
    try {
      date = new Date(`${dm[3]}-${dm[2]}-${dm[1]}`).toISOString().slice(0, 10);
    } catch {
      /* ignore */
    }
  }

  return {
    id: epRef,
    title,
    docType,
    epRef,
    date,
    committee,
    doceoUrl: resolvedUrl,
  };
}

function parsePageHtml(html: string): RawEpDoc[] {
  const $ = cheerio.load(html);
  const results: RawEpDoc[] = [];

  // Verified card selector: div.notice (each document occupies one).
  const $cards = $('div.notice');
  if ($cards.length === 0) return results;

  $cards.each((_, el) => {
    try {
      const doc = parseCard($(el), $);
      if (doc) results.push(doc);
    } catch (err) {
      logger.warn('EP teksten: skipping malformed card', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  return results;
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Fetch one page for a tab. Exported for fixture-based unit tests. */
export async function fetchSubmittedTexts(opts: {
  page?: number;
  tabType?: string;
}): Promise<RawEpDoc[]> {
  const html = await fetchPageHtml(opts.page ?? 1, opts.tabType ?? 'reports');
  return parsePageHtml(html);
}

/** Exported for fixture-based unit tests. */
export { parsePageHtml };

/**
 * Page through both tabs, deduplicate on epRef, and stop early once a page
 * yields only refs already in `sinceRefs`. Safety cap: MAX_PAGES per tab.
 */
export async function fetchAllNewSubmittedTexts(opts: {
  sinceRefs: Set<string>;
}): Promise<FeedItem[]> {
  const { sinceRefs } = opts;
  const results: FeedItem[] = [];
  const seen = new Set<string>();

  const tabResults = await Promise.allSettled(
    EP_SED_TABS.map(async ({ tabType, label }) => {
      const tabItems: FeedItem[] = [];
      for (let page = 1; page <= MAX_PAGES; page++) {
        if (page > 1) await delay(PAGE_DELAY_MS);

        let html: string;
        try {
          html = await fetchPageHtml(page, tabType);
        } catch (err) {
          logger.warn('EP teksten: page fetch failed', {
            tab: label,
            page,
            error: err instanceof Error ? err.message : String(err),
          });
          break;
        }

        const docs = parsePageHtml(html);

        // Empty page = past the last page of results.
        if (docs.length === 0) break;

        let allOld = true;
        for (const doc of docs) {
          if (sinceRefs.has(doc.id)) continue;
          allOld = false;
          if (!seen.has(doc.id)) {
            seen.add(doc.id);
            tabItems.push(rawDocToFeedItem(doc));
          }
        }

        if (allOld) break;
      }
      logger.info('EP teksten tab done', { tab: label, newItems: tabItems.length });
      return tabItems;
    })
  );

  for (const r of tabResults) {
    if (r.status === 'fulfilled') results.push(...r.value);
    else logger.warn('EP teksten tab failed', { error: String(r.reason) });
  }

  logger.info('EP teksten fetch complete', { total: results.length });
  return results;
}

function rawDocToFeedItem(doc: RawEpDoc): FeedItem {
  return {
    id: doc.id,
    title: doc.title,
    type: doc.docType,
    number: doc.epRef,
    date: doc.date,
    url: doc.doceoUrl,
    source: 'eu' as const,
    subbron: 'ep-teksten',
    commissie: doc.committee,
    description: addDutchContext(doc.title),
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
