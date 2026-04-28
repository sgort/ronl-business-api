import axios from 'axios';
import { createLogger } from '@utils/logger';

const logger = createLogger('nieuws-service');

const GOVERNMENT_RSS_URL = 'https://www.rijksoverheid.nl/api/rss';

// New (April 2026) Rijksoverheid RSS API uses a JSON-encoded `query` parameter.
// This filter selects newsDocument content — equivalent to the old /nieuws.rss feed.
const GOVERNMENT_RSS_QUERY = {
  filters: [{ field: 'content_type', values: ['pro:newsDocument'], type: 'all' }],
  resultSearchTerm: '',
};

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export interface NieuwsItem {
  id: string;
  title: string;
  summary: string;
  category: string | null;
  publishedAt: string;
  url: string | null;
  source: { id: string; name: string };
}

interface Cache {
  items: NieuwsItem[];
  fetchedAt: number;
}

let cache: Cache | null = null;

// ── RSS parsing ────────────────────────────────────────────────────────────

function extractTag(xml: string, tag: string): string {
  // Handles both plain <tag>value</tag> and CDATA <tag><![CDATA[value]]></tag>
  const match = xml.match(
    new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))<\\/${tag}>`, 'i')
  );
  return (match?.[1] ?? match?.[2] ?? '').trim();
}

function parseItems(rss: string): NieuwsItem[] {
  // Split on <item> boundaries — safe for this feed's structure
  const itemBlocks = rss.split('<item>').slice(1);

  return itemBlocks
    .map((block, index) => {
      const raw = block.split('</item>')[0];

      const guid = extractTag(raw, 'guid') || `gov-news-${index}`;
      const title = extractTag(raw, 'title');
      const description = extractTag(raw, 'description');
      const pubDate = extractTag(raw, 'pubDate');
      const link = extractTag(raw, 'link');

      return {
        id: guid,
        title,
        summary: description,
        category: null,
        publishedAt: pubDate ? new Date(pubDate).toISOString() : '',
        url: link || null,
        source: { id: 'government', name: 'Rijksoverheid' },
      };
    })
    .filter((item) => item.title);
}

// ── Public API ─────────────────────────────────────────────────────────────

export async function getNieuwsItems(
  limit: number = 10,
  offset: number = 0
): Promise<{ items: NieuwsItem[]; total: number }> {
  const now = Date.now();

  if (!cache || now - cache.fetchedAt > CACHE_TTL_MS) {
    logger.info('Fetching nieuws from Government.nl RSS');
    try {
      const response = await axios.get<string>(GOVERNMENT_RSS_URL, {
        params: { query: JSON.stringify(GOVERNMENT_RSS_QUERY) },
        timeout: 8_000,
        headers: { Accept: 'application/rss+xml, application/xml, text/xml' },
        responseType: 'text',
      });

      const items = parseItems(response.data);
      cache = { items, fetchedAt: now };
      logger.info('Nieuws cache refreshed', { count: items.length });
    } catch (error) {
      logger.error('Failed to fetch nieuws', {
        error: error instanceof Error ? error.message : String(error),
      });
      // Fall back to stale cache if we have one — better than an empty page.
      if (cache) {
        return {
          items: cache.items.slice(offset, offset + limit),
          total: cache.items.length,
        };
      }
      // Cold cache + upstream down: throw so the route returns 500
      // and the frontend shows the retry button instead of an empty state.
      throw error;
    }
  }

  const all = cache.items;
  return {
    items: all.slice(offset, offset + limit),
    total: all.length,
  };
}
