/**
 * Media & omgeving connector — news-aggregator client.
 * Consumes a region-scoped GET /search from the Dutch news-aggregator
 * (100+ national + regional RSS feeds, AI dedup/region-tagging).
 * Maps AggregatorArticle → FeedItem; bron:'media'.
 * Social / omgeving (Polpo) stays a later second sub-source.
 */

import axios from 'axios';
import { createLogger } from '@utils/logger';
import { config } from '@utils/config';
import type { FeedItem } from '@ronl/shared';

const logger = createLogger('media-client');

export interface AggregatorArticle {
  id: string;
  duplicate_group_id: string | null;
  canonical_url: string;
  title: string;
  summary_short: string;
  published_at: string;
  province: string | null;
  municipality: string | null;
  sentiment: 'positief' | 'neutraal' | 'negatief' | null;
  source: { name: string; type: 'national' | 'regional'; homepage: string };
}

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

export async function fetchFlevolandNews({ terms }: { terms: string[] }): Promise<FeedItem[]> {
  const base = config.pa.mediaAggregatorBase;
  const apiKey = config.pa.mediaAggregatorApiKey;

  const params = new URLSearchParams({
    region: 'Flevoland',
    q: terms.join(' OR '),
    sort: 'published_at:desc',
    top: '50',
  });

  let attempt = 0;
  while (attempt < 2) {
    try {
      const res = await axios.get<{ articles: AggregatorArticle[] }>(`${base}/search?${params}`, {
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
