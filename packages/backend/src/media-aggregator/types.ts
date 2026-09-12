/**
 * media-aggregator — shared types.
 *
 * AggregatorArticle is the CONTRACT the PA-Cockpit's media.client.ts consumes.
 * Canonical definition lives in @ronl/shared (packages/shared/src/types/pa.types.ts)
 * so the aggregator and its consumer can't drift apart.
 * The GET /search response envelope is { articles: AggregatorArticle[] }.
 */

export type { AggregatorArticle } from '@ronl/shared';

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
