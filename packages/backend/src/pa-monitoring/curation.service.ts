/**
 * Curation pipeline: retrieve → rules → persist candidates.
 * AI duiding is stubbed (returns null) — off by default per spec.
 */

import { db } from '@services/audit.service';
import { createLogger } from '@utils/logger';
import { fetchTkFeed } from './sources/tk.client';
import { fetchObFeed } from './sources/ob.client';
import { scoreItem } from './rules';
import type { FeedItem, Signal } from '@ronl/shared';

const logger = createLogger('curation-service');

interface SavedSearch {
  id: string;
  tenantId: string;
  dossierId: string | null;
  query: { q: string; types: string[]; source: string[] };
  tags: string[];
}

async function loadSearches(tenantId: string): Promise<SavedSearch[]> {
  try {
    const rows = await db.any<{
      id: string;
      tenant_id: string;
      dossier_id: string | null;
      query: { q: string; types: string[]; source: string[] };
      tags: string[];
    }>(
      `SELECT id, tenant_id, dossier_id, query, tags
       FROM pa_saved_searches
       WHERE tenant_id = $1 AND scope = 'tenant'`,
      [tenantId]
    );
    return rows.map((r) => ({
      id: r.id,
      tenantId: r.tenant_id,
      dossierId: r.dossier_id,
      query: r.query,
      tags: r.tags,
    }));
  } catch {
    return [];
  }
}

function displayNr(item: FeedItem): string {
  // For TK, DocumentNummer is encoded in the URL (?id=2026D12345); use that.
  // For OB, item.id is already the meaningful publication identifier (stb-2026-123).
  if (item.source === 'tk' && item.url) {
    const m = item.url.match(/[?&]id=([^&]+)/);
    if (m) return decodeURIComponent(m[1]);
  }
  return item.id;
}

async function persistCandidate(
  item: FeedItem,
  scored: { rel: number; tab: Signal['tab']; dossierId: string | null }
): Promise<void> {
  const sourceKey = `${item.source}:${item.id}`;
  const srcLabel =
    item.source === 'tk'
      ? `Tweede Kamer · ${item.type ?? 'Document'} · ${formatAge(item.date)}`
      : `Officiële Bekendmakingen · ${item.type ?? 'Publicatie'} · ${formatAge(item.date)}`;

  try {
    await db.none(
      `INSERT INTO pa_signals
         (id, tab, dossier_id, title, src, bron, ref, rel, status, source_key, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'candidate',$9,NOW(),NOW())
       ON CONFLICT (source_key) DO NOTHING`,
      [
        `sig-${item.source}-${item.id}`,
        scored.tab,
        scored.dossierId,
        item.title,
        srcLabel,
        item.source,
        item.url
          ? JSON.stringify({ type: item.type ?? '', nr: displayNr(item), url: item.url })
          : null,
        scored.rel,
        sourceKey,
      ]
    );
  } catch (err) {
    logger.warn('Failed to persist candidate', {
      sourceKey,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function formatAge(date: string | null): string {
  if (!date) return 'onbekend';
  const d = new Date(date);
  if (isNaN(d.getTime())) return date;
  const diffMs = Date.now() - d.getTime();
  const diffH = Math.floor(diffMs / 3_600_000);
  if (diffH < 1) return 'nu';
  if (diffH < 24) return `${diffH} u geleden`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return 'gisteren';
  if (diffD === 2) return 'eergisteren';
  return `${diffD} dgn`;
}

export async function runCurationCycle(tenantId = 'flevoland'): Promise<void> {
  logger.info('Curation cycle start', { tenantId });
  const searches = await loadSearches(tenantId);
  if (!searches.length) {
    logger.warn('No saved searches found — nothing to retrieve');
    return;
  }

  const allItems: FeedItem[] = [];

  // Merge unique queries across all searches
  const queries = [...new Set(searches.map((s) => s.query.q).filter(Boolean))];

  for (const q of queries) {
    const [tkResult, obResult] = await Promise.allSettled([
      fetchTkFeed(q, [], 0, 20),
      fetchObFeed(q, [], 0, 20),
    ]);
    if (tkResult.status === 'fulfilled') {
      allItems.push(...tkResult.value.items);
    } else {
      logger.error('TK feed fetch failed', {
        q,
        error: tkResult.reason instanceof Error ? tkResult.reason.message : String(tkResult.reason),
      });
    }
    if (obResult.status === 'fulfilled') {
      allItems.push(...obResult.value.items);
    } else {
      logger.error('OB feed fetch failed', {
        q,
        error: obResult.reason instanceof Error ? obResult.reason.message : String(obResult.reason),
      });
    }
  }

  // Deduplicate by source:id
  const seen = new Set<string>();
  const unique = allItems.filter((item) => {
    const key = `${item.source}:${item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  for (const item of unique) {
    const scored = scoreItem(item, searches);
    if (scored.rel >= 4) {
      await persistCandidate(item, scored);
    }
  }

  logger.info('Curation cycle complete', { tenantId, processed: unique.length });
}

// AI duiding stub — always off, returns null
export function draftAiDuiding(_item: FeedItem): null {
  return null;
}
