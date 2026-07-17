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

import { FLEVOLAND_MUNICIPALITY_ALIASES } from '@ronl/shared';
import type { FeedSource } from './types';
import { summarize } from './sanitize';

const PROVINCE = 'Flevoland';

export interface RegionTag {
  province: string | null;
  municipality: string | null;
}

/** Detect province + municipality from an article's text, honouring feed origin. */
export function detectRegion(title: string, summary: string, source: FeedSource): RegionTag {
  const haystack = `${title} ${summary}`.toLowerCase();

  let municipality: string | null = null;
  for (const [canonical, aliases] of Object.entries(FLEVOLAND_MUNICIPALITY_ALIASES)) {
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

/** Plain-text summary capped to ~50 words. Delegates to sanitize.ts for correct HTML handling. */
export function summaryShort(description: string, maxWords = 50): string {
  return summarize(description, maxWords);
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
