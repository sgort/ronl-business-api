/**
 * PA curation rules — keyword/source/tag scoring.
 * Assigns baseline relevance (1–10) and candidate tab + dossier
 * to a raw FeedItem before it enters the human-review inbox.
 */

import type { FeedItem, Signal } from '@ronl/shared';
import {
  REL_BASE,
  ZWAARTYPE_BUMP,
  MEDIA_MUNI_BUMP,
  MEDIA_PROV_BUMP,
  TITLE_HIT,
  DESC_HIT,
  TAG_HIT,
  MATCH_CAP,
  REL_MAX,
  NOISE_FLOOR,
} from '@ronl/shared';

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
  media: 'media',
};

const HIGH_VALUE_TK_TYPES = new Set(['Motie', 'Kamervraag', 'Brief', 'Amendement']);
const HIGH_VALUE_EU_TYPES = new Set(['Verslag', 'Motie', 'Aangenomen tekst', 'Resolutie']);

// Flevoland gazetteer for geographic relevance bump on media items.
// regio/sentiment are display-only; only the province/municipality bump counts toward rel.
const FLEVOLAND_MUNICIPALITIES = new Set([
  'almere',
  'lelystad',
  'dronten',
  'noordoostpolder',
  'urk',
  'zeewolde',
  'zuiderzeeland',
]);

export function scoreItem(item: FeedItem, searches: SavedSearch[]): RulesResult {
  let rel = REL_BASE;
  const tab: Signal['tab'] = TAB_BY_SOURCE[item.source] ?? 'politiek';
  let dossierId: string | null = null;

  // Bump for high-value document types per source
  if (item.source === 'tk' && item.type && HIGH_VALUE_TK_TYPES.has(item.type)) {
    rel += ZWAARTYPE_BUMP;
  }
  if (item.source === 'eu' && item.type && HIGH_VALUE_EU_TYPES.has(item.type)) {
    rel += ZWAARTYPE_BUMP;
  }

  // Geographic bump for media items: province match +2, municipality match +1.
  // regio and sentiment are never fed into this calculation.
  if (item.source === 'media') {
    const regio = (item.regio ?? '').toLowerCase();
    const haystack = `${item.title} ${item.description ?? ''} ${regio}`.toLowerCase();
    if (regio.includes('flevoland') || haystack.includes('flevoland')) rel += MEDIA_PROV_BUMP;
    for (const gemeente of FLEVOLAND_MUNICIPALITIES) {
      if (haystack.includes(gemeente)) {
        rel += MEDIA_MUNI_BUMP;
        break;
      }
    }
  }

  // Score against saved searches
  let bestScore = 0;
  for (const search of searches) {
    const q = search.query.q?.toLowerCase() ?? '';
    const title = item.title.toLowerCase();
    const desc = (item.description ?? '').toLowerCase();

    let score = 0;
    const terms = q
      .split(/\s+(?:OR|AND)\s+/i)
      .map((t) => t.replace(/^"|"$/g, '').trim())
      .filter(Boolean);

    for (const term of terms) {
      if (title.includes(term)) score += TITLE_HIT;
      else if (desc.includes(term)) score += DESC_HIT;
    }

    // Tag intersection
    for (const tag of search.tags) {
      if (title.includes(tag) || desc.includes(tag)) score += TAG_HIT;
    }

    if (score > bestScore) {
      bestScore = score;
      dossierId = search.dossierId;
    }
  }

  rel = Math.min(REL_MAX, rel + Math.min(bestScore, MATCH_CAP));

  // Items that don't match any search get a low rel — not worth surfacing
  if (bestScore === 0) rel = Math.min(rel, NOISE_FLOOR);

  return { rel, tab, dossierId };
}
