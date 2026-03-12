import axios from 'axios';
import { createLogger } from '@utils/logger';

const logger = createLogger('nieuws-service');

const GOVERNMENT_RSS_URL = 'https://feeds.government.nl/news.rss';

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
        source: { id: 'government', name: 'Government.nl' },
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
      return {
        items: cache?.items.slice(offset, offset + limit) ?? [],
        total: cache?.items.length ?? 0,
      };
    }
  }

  const all = cache.items;
  return {
    items: all.slice(offset, offset + limit),
    total: all.length,
  };
}
