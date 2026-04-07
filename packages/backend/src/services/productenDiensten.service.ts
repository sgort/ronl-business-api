import axios from 'axios';
import { createLogger } from '@utils/logger';

const logger = createLogger('producten-diensten-service');

const FLEVOLAND_SC_URL = 'https://flevoland.nl/loket/loketoverview?sc40=true';

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes — these change infrequently

export interface ProductDienstItem {
  id: string;
  title: string;
  description: string;
  url: string;
  audience: ('ondernemer' | 'particulier')[];
  onlineAanvragen: boolean;
  modified: string | null;
}

interface Cache {
  items: ProductDienstItem[];
  fetchedAt: number;
}

let cache: Cache | null = null;

// ── XML parsing ────────────────────────────────────────────────────────────

function extractTag(xml: string, tag: string): string {
  const match = xml.match(
    new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))<\\/${tag}>`, 'i')
  );
  return (match?.[1] ?? match?.[2] ?? '').trim();
}

function extractAllTags(xml: string, tag: string): string[] {
  const re = new RegExp(
    `<${tag}[^>]*>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))<\\/${tag}>`,
    'gi'
  );
  const results: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const value = (m[1] ?? m[2] ?? '').trim();
    if (value) results.push(value);
  }
  return results;
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
    .replace(/&hellip;/g, '…')
    .replace(/@/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseItems(xml: string): ProductDienstItem[] {
  const blocks = xml.split('<scproduct').slice(1);

  return blocks
    .map((block, index) => {
      const raw = block.split('</scproduct>')[0];

      const id = extractTag(raw, 'productID') || `product-${index}`;
      const title = decodeEntities(extractTag(raw, 'dcterms:title'));
      const description = decodeEntities(extractTag(raw, 'dcterms:abstract'));
      const url = extractTag(raw, 'dcterms:identifier');
      const modified = extractTag(raw, 'dcterms:modified') || null;
      const onlineAanvragen = extractTag(raw, 'onlineAanvragen').toLowerCase() === 'ja';

      const rawAudiences = extractAllTags(raw, 'dcterms:audience');
      const audience = rawAudiences.filter(
        (a): a is 'ondernemer' | 'particulier' => a === 'ondernemer' || a === 'particulier'
      );

      return { id, title, description, url, audience, onlineAanvragen, modified };
    })
    .filter((item) => item.title);
}

// ── Public API ─────────────────────────────────────────────────────────────

export async function getProductenDienstenItems(
  limit: number = 50,
  offset: number = 0
): Promise<{ items: ProductDienstItem[]; total: number }> {
  const now = Date.now();

  if (!cache || now - cache.fetchedAt > CACHE_TTL_MS) {
    logger.info('Fetching producten & diensten from Flevoland SC40');
    try {
      const response = await axios.get<string>(FLEVOLAND_SC_URL, {
        timeout: 10_000,
        headers: { Accept: 'application/xml, text/xml' },
        responseType: 'text',
      });

      const items = parseItems(response.data);
      cache = { items, fetchedAt: now };
      logger.info('Producten & diensten cache refreshed', { count: items.length });
    } catch (error) {
      logger.error('Failed to fetch producten & diensten', {
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
