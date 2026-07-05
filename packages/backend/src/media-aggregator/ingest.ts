/**
 * media-aggregator — ingestion: fetch feeds, parse RSS/Atom, map to AggregatorArticle.
 *
 * Uses fast-xml-parser (already a dependency, see eu.client.ts) and axios (see
 * nieuws.service.ts). Handles both RSS 2.0 (channel.item) and Atom (feed.entry).
 * A malformed item (no title or link) is skipped, never thrown.
 */

import { createHash } from 'node:crypto';
import { XMLParser } from 'fast-xml-parser';
import { createLogger } from '@utils/logger';
import type { AggregatorArticle, FeedSource, RawItem } from './types';
import { FEEDS } from './feeds';
import { detectRegion, summaryShort, analyzeSentiment } from './enrich';
import { assignDuplicateGroups } from './dedup';
import { safeFetch, UnsafeUrlError, ResponseTooLargeError } from './net-guard';

const logger = createLogger('media-aggregator-ingest');

const XML_PARSER = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) => name === 'item' || name === 'entry',
});

// ── XML → RawItem ────────────────────────────────────────────────────────────

function text(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'object' && '#text' in (v as Record<string, unknown>)) {
    return String((v as Record<string, unknown>)['#text'] ?? '').trim();
  }
  return String(v).trim();
}

function atomLink(entry: Record<string, unknown>): string {
  const link = entry['link'];
  if (typeof link === 'string') return link;
  if (Array.isArray(link)) {
    const alt =
      link.find((l) => (l as Record<string, unknown>)['@_rel'] === 'alternate') ?? link[0];
    return String((alt as Record<string, unknown>)?.['@_href'] ?? '');
  }
  if (link && typeof link === 'object')
    return String((link as Record<string, unknown>)['@_href'] ?? '');
  return '';
}

export function parseFeedXml(xml: string, source: FeedSource): RawItem[] {
  let doc: Record<string, unknown>;
  try {
    doc = XML_PARSER.parse(xml) as Record<string, unknown>;
  } catch {
    return [];
  }

  // RSS 2.0
  const channel = (doc['rss'] as Record<string, unknown> | undefined)?.['channel'] as
    | Record<string, unknown>
    | undefined;
  if (channel) {
    const items = (channel['item'] as Record<string, unknown>[] | undefined) ?? [];
    const cat = source.categoryFilter?.toLowerCase();
    return items
      .map((it) => ({
        title: text(it['title']),
        link: text(it['link']),
        description: text(it['description']) || text(it['summary']),
        pubDate: text(it['pubDate']) || text(it['date']),
        guid: text(it['guid']) || text(it['link']),
        category: text(it['category']),
        source,
      }))
      .filter((r) => r.title && r.link && (!cat || r.category.toLowerCase() === cat));
  }

  // Atom
  const feed = doc['feed'] as Record<string, unknown> | undefined;
  if (feed) {
    const entries = (feed['entry'] as Record<string, unknown>[] | undefined) ?? [];
    return entries
      .map((e) => {
        const link = atomLink(e);
        return {
          title: text(e['title']),
          link,
          description: text(e['summary']) || text(e['content']),
          pubDate: text(e['updated']) || text(e['published']),
          guid: text(e['id']) || link,
          source,
        };
      })
      .filter((r) => r.title && r.link);
  }

  return [];
}

// ── RawItem → AggregatorArticle ──────────────────────────────────────────────

function articleId(url: string): string {
  return 'art-' + createHash('sha1').update(url).digest('hex').slice(0, 12);
}

function toIso(pubDate: string): string {
  if (!pubDate) return '';
  const d = new Date(pubDate);
  return isNaN(d.getTime()) ? pubDate : d.toISOString();
}

export function toArticle(raw: RawItem): AggregatorArticle {
  const summary = summaryShort(raw.description);
  const { province, municipality } = detectRegion(raw.title, summary, raw.source);
  return {
    id: articleId(raw.link),
    duplicate_group_id: null, // assigned later across the corpus
    canonical_url: raw.link,
    title: raw.title,
    summary_short: summary,
    published_at: toIso(raw.pubDate),
    province,
    municipality,
    sentiment: analyzeSentiment(raw.title, summary),
    source: { name: raw.source.name, type: raw.source.type, homepage: raw.source.homepage },
  };
}

// ── Feed fetcher ─────────────────────────────────────────────────────────────

async function fetchFeed(source: FeedSource): Promise<RawItem[]> {
  try {
    const urlObj = new URL(source.url);
    if (source.params) {
      for (const [k, v] of Object.entries(source.params)) urlObj.searchParams.set(k, v);
    }
    const xml = await safeFetch(urlObj.toString(), {
      maxBytes: 5 * 1024 * 1024,
      timeoutMs: 10_000,
    });
    const items = parseFeedXml(xml, source);
    logger.info('Feed fetched', { feed: source.id, count: items.length });
    return items;
  } catch (err) {
    if (err instanceof UnsafeUrlError || err instanceof ResponseTooLargeError) {
      logger.warn('Feed skipped (security policy)', {
        feed: source.id,
        error: err.message,
      });
      return [];
    }
    logger.warn('Feed fetch failed', {
      feed: source.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/**
 * Fetch every configured feed in parallel, map to articles, and assign
 * duplicate groups across the combined corpus. Failures per feed fall through.
 */
export async function ingestAll(): Promise<AggregatorArticle[]> {
  const rawLists = await Promise.all(FEEDS.map(fetchFeed));
  const articles: AggregatorArticle[] = [];
  const seenUrl = new Set<string>();
  for (const list of rawLists) {
    for (const raw of list) {
      if (seenUrl.has(raw.link)) continue; // same URL twice → keep first
      seenUrl.add(raw.link);
      articles.push(toArticle(raw));
    }
  }
  assignDuplicateGroups(articles);
  logger.info('Ingest complete', { total: articles.length });
  return articles;
}
