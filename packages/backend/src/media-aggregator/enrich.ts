/**
 * media-aggregator — enrichment: region tagging, summaries, sentiment.
 *
 * Region tagging is the "geen ruis" filter that turns a national + regional feed
 * mix into a Flevoland desk. It reuses the same six-municipality gazetteer the
 * cockpit's rules.ts uses, plus common town aliases that map onto a municipality
 * for better recall (e.g. "Emmeloord" → Noordoostpolder).
 *
 * Sentiment is phase-2: v1 always returns null (the cockpit chip simply doesn't
 * render). Flip MEDIA_AGGREGATOR_SENTIMENT_ENABLED + wire an analyzer later.
 */

import type { FeedSource } from './types';

const PROVINCE = 'Flevoland';

// canonical municipality → alias town/village names that imply it
const MUNICIPALITY_ALIASES: Record<string, string[]> = {
  Almere: ['almere', 'almere-buiten', 'almere buiten', 'almere-haven', 'almere haven'],
  Lelystad: ['lelystad', 'lelystad airport'],
  Dronten: ['dronten', 'swifterbant', 'biddinghuizen'],
  Noordoostpolder: [
    'noordoostpolder',
    'emmeloord',
    'nagele',
    'ens',
    'marknesse',
    'luttelgeest',
    'kraggenburg',
    'creil',
    'espel',
    'bant',
    'rutten',
    'tollebeek',
  ],
  Urk: ['urk'],
  Zeewolde: ['zeewolde'],
  'Waterschap Zuiderzeeland': ['waterschap zuiderzeeland', 'zuiderzeeland'],
};

export interface RegionTag {
  province: string | null;
  municipality: string | null;
}

/** Detect province + municipality from an article's text, honouring feed origin. */
export function detectRegion(title: string, summary: string, source: FeedSource): RegionTag {
  const haystack = `${title} ${summary}`.toLowerCase();

  let municipality: string | null = null;
  for (const [canonical, aliases] of Object.entries(MUNICIPALITY_ALIASES)) {
    if (aliases.some((a) => haystack.includes(a))) {
      municipality = canonical;
      break;
    }
  }

  const mentionsProvince = haystack.includes('flevoland');
  const province = source.alwaysFlevoland || municipality || mentionsProvince ? PROVINCE : null;

  return { province, municipality };
}

/** True when the article belongs to the requested region. */
export function isInRegion(tag: RegionTag, region: string): boolean {
  if (!region) return true;
  if (region.toLowerCase() === 'flevoland') {
    return tag.province === PROVINCE || tag.municipality !== null;
  }
  return tag.province?.toLowerCase() === region.toLowerCase();
}

/** Strip HTML/entities and collapse whitespace. */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Plain-text summary capped to ~50 words. */
export function summaryShort(description: string, maxWords = 50): string {
  const clean = stripHtml(description);
  const words = clean.split(' ').filter(Boolean);
  if (words.length <= maxWords) return clean;
  return words.slice(0, maxWords).join(' ') + '…';
}

/**
 * Sentiment — phase-2. Returns null in v1. When MEDIA_AGGREGATOR_SENTIMENT_ENABLED
 * is set, wire an analyzer here (e.g. the existing Anthropic client) and return
 * one of 'positief' | 'neutraal' | 'negatief'.
 */
export function analyzeSentiment(
  _title: string,
  _summary: string
): 'positief' | 'neutraal' | 'negatief' | null {
  if (process.env.MEDIA_AGGREGATOR_SENTIMENT_ENABLED !== 'true') return null;
  // TODO(phase-2): call an LLM/classifier and map to the Dutch enum.
  return null;
}
