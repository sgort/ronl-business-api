/**
 * PA curation rules — keyword/source/tag scoring.
 * Assigns baseline relevance (1–10) and candidate tab + dossier
 * to a raw FeedItem before it enters the human-review inbox.
 */

import type { FeedItem, Signal } from '@ronl/shared';

interface SavedSearch {
  dossierId: string | null;
  query: { q: string; types: string[]; source: string[] };
  tags: string[];
}

interface RulesResult {
  rel: number;
  tab: Signal['tab'];
  dossierId: string | null;
}

const TAB_BY_SOURCE: Record<string, Signal['tab']> = {
  tk: 'politiek',
  ob: 'regionaal',
  eu: 'europa',
};

const HIGH_VALUE_TK_TYPES = new Set(['Motie', 'Kamervraag', 'Brief', 'Amendement']);
const HIGH_VALUE_EU_TYPES = new Set(['Verslag', 'Motie', 'Aangenomen tekst', 'Resolutie']);

export function scoreItem(item: FeedItem, searches: SavedSearch[]): RulesResult {
  let rel = 3;
  const tab: Signal['tab'] = TAB_BY_SOURCE[item.source] ?? 'politiek';
  let dossierId: string | null = null;

  // Bump for high-value document types per source
  if (item.source === 'tk' && item.type && HIGH_VALUE_TK_TYPES.has(item.type)) {
    rel += 2;
  }
  if (item.source === 'eu' && item.type && HIGH_VALUE_EU_TYPES.has(item.type)) {
    rel += 2;
  }

  // Score against saved searches
  let bestScore = 0;
  for (const search of searches) {
    const q = search.query.q?.toLowerCase() ?? '';
    const title = item.title.toLowerCase();
    const desc = (item.description ?? '').toLowerCase();

    let score = 0;
    // Split on OR/AND and check each term
    const terms = q
      .split(/\s+(?:OR|AND)\s+/i)
      .map((t) => t.replace(/^"|"$/g, '').trim())
      .filter(Boolean);

    for (const term of terms) {
      if (title.includes(term)) score += 3;
      else if (desc.includes(term)) score += 1;
    }

    // Tag intersection
    for (const tag of search.tags) {
      if (title.includes(tag) || desc.includes(tag)) score += 1;
    }

    if (score > bestScore) {
      bestScore = score;
      if (search.dossierId) dossierId = search.dossierId;
    }
  }

  rel = Math.min(10, rel + Math.min(bestScore, 5));

  // Items that don't match any search get a low rel — not worth surfacing
  if (bestScore === 0) rel = Math.min(rel, 3);

  return { rel, tab, dossierId };
}
