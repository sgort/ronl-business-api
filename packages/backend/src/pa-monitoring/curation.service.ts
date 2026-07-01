/**
 * Curation pipeline: retrieve → rules → persist candidates.
 * AI duiding is stubbed (returns null) — off by default per spec.
 */

import { db } from '@services/audit.service';
import { createLogger } from '@utils/logger';
import { fetchTkFeed } from './sources/tk.client';
import { fetchObFeed } from './sources/ob.client';
import { fetchEuFeed } from './sources/eu.client';
import { config } from '@utils/config';
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
      : item.source === 'eu'
        ? `Europees Parlement · ${item.type ?? 'Document'} · ${formatAge(item.date)}`
        : `Officiële Bekendmakingen · ${item.type ?? 'Publicatie'} · ${formatAge(item.date)}`;

  try {
    await db.none(
      `INSERT INTO pa_signals
         (id, tab, dossier_id, title, src, bron, ref, rel, status, source_key, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'candidate',$9,NOW(),NOW())
       ON CONFLICT (source_key) DO UPDATE
         SET rel = EXCLUDED.rel, dossier_id = EXCLUDED.dossier_id, updated_at = NOW()
         WHERE pa_signals.status = 'candidate'`,
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

  // Build per-source query sets — prevents English EU-only queries from hitting TK/OB
  const tkQueries = new Set<string>();
  const obQueries = new Set<string>();
  let hasEuSearches = false;

  for (const s of searches) {
    const src: string[] = Array.isArray(s.query.source) ? s.query.source : ['tk', 'ob'];
    if (!s.query.q) continue;
    if (src.includes('tk')) tkQueries.add(s.query.q);
    if (src.includes('ob')) obQueries.add(s.query.q);
    if (src.includes('eu')) hasEuSearches = true;
  }

  // Fetch TK for TK-enabled queries
  for (const q of tkQueries) {
    const result = await fetchTkFeed(q, [], 0, 20).catch((err: unknown) => {
      logger.error('TK feed fetch failed', {
        q,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    });
    if (result) allItems.push(...result.items);
  }

  // Fetch OB for OB-enabled queries
  for (const q of obQueries) {
    const result = await fetchObFeed(q, [], 0, 20).catch((err: unknown) => {
      logger.error('OB feed fetch failed', {
        q,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    });
    if (result) allItems.push(...result.items);
  }

  // Fetch EU once — fetchEuFeed ignores the query string and returns the full cached feed
  if (hasEuSearches && config.pa.euSourceEnabled) {
    const result = await fetchEuFeed(null, [], 0, 50).catch((err: unknown) => {
      logger.error('EU feed fetch failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    });
    if (result) allItems.push(...result.items);
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

/**
 * Promote a single raw feed item into the inbox as a candidate.
 * Reuses the same scoring + persist path as the cron, but bypasses the
 * `rel >= 4` threshold (that gate lives in runCurationCycle, not in
 * persistCandidate) — a human decided this item is worth reviewing, so we
 * floor the rel to ≥5 and keep any matched dossier. Returns the signal id;
 * the shared source_key means a later curation cycle updates this row via
 * `ON CONFLICT (source_key) … WHERE status = 'candidate'` instead of duplicating.
 */
export async function promoteToInbox(tenantId: string, item: FeedItem): Promise<string> {
  const searches = await loadSearches(tenantId);
  const scored = scoreItem(item, searches);
  await persistCandidate(item, { ...scored, rel: Math.max(scored.rel, 5) });
  return `sig-${item.source}-${item.id}`;
}
