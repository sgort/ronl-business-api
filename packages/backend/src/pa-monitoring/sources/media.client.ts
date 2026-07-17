/**
 * Media & omgeving connector — news-aggregator client.
 * Consumes a region-scoped GET /search from the Dutch news-aggregator
 * (100+ national + regional RSS feeds, AI dedup/region-tagging).
 * Maps AggregatorArticle → FeedItem; bron:'media'.
 * Social / omgeving  stays a later second sub-source.
 */

import axios from 'axios';
import { createLogger } from '@utils/logger';
import { config } from '@utils/config';
import type { FeedItem, AggregatorArticle } from '@ronl/shared';

const logger = createLogger('media-client');

export function articleToFeedItem(a: AggregatorArticle): FeedItem {
  const regioParts = [a.province, a.municipality].filter(Boolean);
  return {
    id: a.duplicate_group_id ?? a.id,
    title: a.title,
    type: 'Nieuwsartikel',
    number: a.source.homepage,
    date: a.published_at,
    url: a.canonical_url,
    source: 'media',
    description: a.summary_short,
    subbron: a.source.type === 'regional' ? 'nieuws-regionaal' : 'nieuws-nationaal',
    regio: regioParts.length ? regioParts.join(' · ') : null,
    sentiment: a.sentiment ?? null,
  };
}

async function fetchArticles(params: Record<string, string>): Promise<FeedItem[]> {
  const base = config.pa.mediaAggregatorBase;
  const apiKey = config.pa.mediaAggregatorApiKey;
  const search = new URLSearchParams(params);

  let attempt = 0;
  while (attempt < 2) {
    try {
      const res = await axios.get<{ articles: AggregatorArticle[] }>(`${base}/search?${search}`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Accept-Language': 'nl',
        },
        timeout: 15_000,
      });

      const items: FeedItem[] = [];
      for (const article of res.data.articles ?? []) {
        try {
          items.push(articleToFeedItem(article));
        } catch (err) {
          logger.warn('Skipping malformed media article', {
            id: article?.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      return items;
    } catch (err) {
      attempt++;
      if (attempt >= 2) {
        logger.error('Media feed fetch failed after retry', {
          error: err instanceof Error ? err.message : String(err),
        });
        return [];
      }
      await new Promise((r) => setTimeout(r, 1_500 * attempt));
    }
  }
  return [];
}

export async function fetchFlevolandNews({ terms }: { terms: string[] }): Promise<FeedItem[]> {
  return fetchArticles({
    region: 'Flevoland',
    q: terms.join(' OR '),
    sort: 'published_at:desc',
    top: '50',
  });
}

/**
 * Ad-hoc search for the blanco zoekfunctie (raw cross-source search), as opposed to
 * fetchFlevolandNews' fixed taxonomy terms. Region stays pinned to Flevoland — an
 * unscoped national firehose would just be noise for a provincial PA cockpit.
 * media-aggregator has no total-count concept (search.ts is a capped retrieval,
 * not a paginated index), so total is always null — same contract fetchTkFeed/
 * fetchObFeed's callers already handle for a null total.
 */
export async function searchFlevolandNews(
  q: string | null,
  top = 20
): Promise<{ items: FeedItem[]; total: number | null }> {
  const items = await fetchArticles({
    region: 'Flevoland',
    q: q ?? '',
    sort: 'published_at:desc',
    top: String(Math.min(Math.max(top, 1), 100)),
  });
  return { items, total: null };
}
