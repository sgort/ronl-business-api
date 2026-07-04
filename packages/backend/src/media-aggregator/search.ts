/**
 * media-aggregator — the one query the cockpit needs: GET /search.
 *
 * Semantics (matches what media.client.ts sends):
 *   region=Flevoland            → gazetteer region filter (province or municipality)
 *   q="term1 OR term2 OR ..."   → keep articles matching ANY term in title+summary
 *   sort=published_at:desc      → newest first (only supported sort in v1)
 *   top=50                      → page size cap
 *
 * The cockpit re-scores every returned article against its saved searches in
 * rules.ts, so this filter is deliberately permissive within the region: it is a
 * retrieval, not a ranking.
 */

import type { AggregatorArticle, SearchQuery } from './types';
import { getArticles } from './store';
import { isInRegion } from './enrich';

function orTerms(q: string): string[] {
  return q
    .split(/\s+OR\s+/i)
    .map((t) => t.replace(/^"|"$/g, '').trim().toLowerCase())
    .filter(Boolean);
}

function matchesQuery(a: AggregatorArticle, terms: string[]): boolean {
  if (!terms.length) return true;
  const haystack = `${a.title} ${a.summary_short}`.toLowerCase();
  return terms.some((t) => haystack.includes(t));
}

export async function searchArticles(query: SearchQuery): Promise<AggregatorArticle[]> {
  const { region = '', q = '', top = 50 } = query;
  const terms = orTerms(q);
  const all = await getArticles();

  const filtered = all.filter(
    (a) =>
      isInRegion({ province: a.province, municipality: a.municipality }, region) &&
      matchesQuery(a, terms)
  );

  filtered.sort((x, y) => (y.published_at || '').localeCompare(x.published_at || ''));

  const cap = Number.isFinite(top) && top > 0 ? Math.min(top, 100) : 50;
  return filtered.slice(0, cap);
}
