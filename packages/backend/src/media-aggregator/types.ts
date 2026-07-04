/**
 * media-aggregator — shared types.
 *
 * AggregatorArticle is the CONTRACT the PA-Cockpit's media.client.ts consumes.
 * Field names and the sentiment enum must match media.client.ts exactly:
 *   id · duplicate_group_id · canonical_url · title · summary_short ·
 *   published_at · province · municipality · sentiment · source{name,type,homepage}
 * The GET /search response envelope is { articles: AggregatorArticle[] }.
 */

export interface AggregatorArticle {
  /** Stable id derived from the canonical URL. */
  id: string;
  /** Set when this article is one copy of a syndicated cluster; null for singletons.
   *  The cockpit collapses a cluster to one candidate via `duplicate_group_id ?? id`. */
  duplicate_group_id: string | null;
  canonical_url: string;
  title: string;
  /** ≤ ~50-word plain-text summary (RSS description, stripped). */
  summary_short: string;
  /** ISO-8601 timestamp. */
  published_at: string;
  /** Gazetteer-detected province — 'Flevoland' or null. Display-only in the cockpit. */
  province: string | null;
  /** Gazetteer-detected municipality — one of the six, or null. Display-only. */
  municipality: string | null;
  /** AI sentiment — phase-2 (null in v1). Display-only, never scored. */
  sentiment: 'positief' | 'neutraal' | 'negatief' | null;
  source: {
    name: string;
    type: 'national' | 'regional';
    homepage: string;
  };
}

/** A configured upstream RSS feed. */
export interface FeedSource {
  id: string;
  name: string;
  homepage: string;
  type: 'national' | 'regional';
  url: string;
  /** Extra query-string params some feeds require (e.g. Rijksoverheid's `query`). */
  params?: Record<string, string>;
  /** Regional Flevoland desks — force province = 'Flevoland' even without a name hit. */
  alwaysFlevoland?: boolean;
  /** When set, only RSS items whose <category> matches this string (case-insensitive) are kept. */
  categoryFilter?: string;
}

/** A normalised RSS/Atom item before enrichment. */
export interface RawItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  guid: string;
  source: FeedSource;
}

export interface SearchQuery {
  region?: string;
  q?: string;
  sort?: string;
  top?: number;
}
