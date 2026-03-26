import axios from 'axios';
import { createLogger } from '@utils/logger';

const logger = createLogger('berichten-service');

const FLEVOLAND_RSS_URL = 'https://flevoland.nl/Content/Pages/Loket?rss=news';

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export interface BerichtItem {
  id: string;
  subject: string;
  preview: string;
  content: string | null;
  type: 'announcement' | 'maintenance' | 'update';
  status: 'published';
  audience: 'all';
  sender: { id: string; name: string };
  publishedAt: string;
  expiresAt: string | null;
  priority: 'low' | 'normal' | 'high';
  isRead: boolean;
  action: { label: string; url: string } | null;
}

interface Cache {
  items: BerichtItem[];
  fetchedAt: number;
}

let cache: Cache | null = null;

// ── RSS parsing ────────────────────────────────────────────────────────────

function extractTag(xml: string, tag: string): string {
  const match = xml.match(
    new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))<\\/${tag}>`, 'i')
  );
  return (match?.[1] ?? match?.[2] ?? '').trim();
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&euro;/g, '€')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function parseItems(rss: string): BerichtItem[] {
  const itemBlocks = rss.split('<item>').slice(1);

  return itemBlocks
    .map((block, index) => {
      const raw = block.split('</item>')[0];

      const guid = extractTag(raw, 'guid') || `flevoland-${index}`;
      const title = decodeEntities(extractTag(raw, 'title'));
      const description = decodeEntities(extractTag(raw, 'description'));
      const pubDate = extractTag(raw, 'pubDate');
      const link = extractTag(raw, 'link');

      return {
        id: guid,
        subject: title,
        preview: description,
        content: description ? `<p>${description}</p>` : null,
        type: 'announcement' as const,
        status: 'published' as const,
        audience: 'all' as const,
        sender: { id: 'flevoland', name: 'Provincie Flevoland' },
        publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
        expiresAt: null,
        priority: 'normal' as const,
        isRead: false,
        action: link ? { label: 'Lees meer', url: link } : null,
      };
    })
    .filter((item) => item.subject);
}

// ── Public API ─────────────────────────────────────────────────────────────

export async function getBerichtenItems(
  limit: number = 10,
  offset: number = 0
): Promise<{ items: BerichtItem[]; total: number }> {
  const now = Date.now();

  if (!cache || now - cache.fetchedAt > CACHE_TTL_MS) {
    logger.info('Fetching berichten from Flevoland RSS');
    try {
      const response = await axios.get<string>(FLEVOLAND_RSS_URL, {
        timeout: 8_000,
        headers: { Accept: 'application/rss+xml, application/xml, text/xml' },
        responseType: 'text',
      });

      const items = parseItems(response.data);
      cache = { items, fetchedAt: now };
      logger.info('Berichten cache refreshed', { count: items.length });
    } catch (error) {
      logger.error('Failed to fetch berichten', {
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

export function getBerichtById(id: string): BerichtItem | null {
  return cache?.items.find((b) => b.id === id) ?? null;
}
