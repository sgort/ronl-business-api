import axios from 'axios';
import { createLogger } from '@utils/logger';

const logger = createLogger('nieuws-service');

const RIJKSOVERHEID_URL =
  'https://opendata.rijksoverheid.nl/v1/infotypes/news?output=json&rows=200';

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Actual shape returned by the Rijksoverheid API
interface RijksoverheidItem {
  id?: string;
  title?: string;
  introduction?: string;
  lastmodified?: string;
  available?: string;
  location?: string; // canonical path, e.g. "/actueel/nieuws/..."
  label?: string[];
  type?: string[];
  // nested content nodes exist but we only need the list fields
}

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

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalise(item: RijksoverheidItem, index: number): NieuwsItem {
  return {
    id: item.id ?? `nieuws-${index}`,
    title: item.title ?? '',
    summary: stripHtml(item.introduction ?? ''),
    category: Array.isArray(item.label) ? (item.label[0] ?? null) : null,
    publishedAt: item.lastmodified ?? item.available ?? '',
    url: item.location ? `https://www.rijksoverheid.nl${item.location}` : null,
    source: { id: 'rijksoverheid', name: 'Rijksoverheid' },
  };
}

export async function getNieuwsItems(
  limit: number = 10,
  offset: number = 0
): Promise<{ items: NieuwsItem[]; total: number }> {
  const now = Date.now();

  if (!cache || now - cache.fetchedAt > CACHE_TTL_MS) {
    logger.info('Fetching nieuws from Rijksoverheid');
    try {
      // The API returns either { root: [...] } or a top-level array — log
      // the raw shape on first fetch so field names can be verified in dev.
      const response = await axios.get(RIJKSOVERHEID_URL, {
        timeout: 8000,
        headers: { Accept: 'application/json' },
      });

      const raw = response.data;
      logger.info('Rijksoverheid raw response shape', {
        type: typeof raw,
        isArray: Array.isArray(raw),
        topLevelKeys: raw && typeof raw === 'object' ? Object.keys(raw).slice(0, 6) : [],
        firstItem: Array.isArray(raw)
          ? Object.keys(raw[0] ?? {}).slice(0, 8)
          : raw?.root
            ? Object.keys(raw.root[0] ?? {}).slice(0, 8)
            : 'unknown',
      });

      // The API wraps results in { root: [...] } for JSON output
      const docs: RijksoverheidItem[] = Array.isArray(raw)
        ? raw
        : Array.isArray(raw?.root)
          ? raw.root
          : [];

      cache = {
        items: docs
          .map(normalise)
          .filter((n) => n.title)
          .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()),
        fetchedAt: now,
      };
      logger.info('Nieuws cache refreshed', { count: cache.items.length });
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
