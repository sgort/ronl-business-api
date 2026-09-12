/**
 * Cross-watch notification matcher — tkconv-inspired: a "watch" is a
 * pa_saved_searches row with notify=true (either a topic search or a
 * dossier-only watch-everything entry). Every confirmed pa_signals row is
 * matched against every active watch; matches for the same (user, signal)
 * collapse into one pa_notifications row listing every watch that matched,
 * so a signal caught by two overlapping watches produces one delivered item,
 * not two. UNIQUE(user_id, signal_id) is the delivery dedup key — a signal
 * already notified to a user never resurfaces on a later cycle.
 */

import { db } from '@services/audit.service';
import { createLogger } from '@utils/logger';
import { matchesQueryTerms } from './query-match';

const logger = createLogger('pa-notifications');

interface WatchRow {
  id: string;
  user_id: string;
  dossier_id: string | null;
  query: { q?: string } | null;
}

interface SignalRow {
  id: string;
  dossier_id: string | null;
  title: string;
  duiding: string | null;
}

export interface MatchedSearch {
  id: string;
  dossierId: string | null;
  label: string;
}

/**
 * Matches one watch against one signal. Returns a display label (the matched
 * term, or a dossier-watch sentinel) or null when the watch doesn't match.
 * A watch with a dossier_id but empty query matches every confirmed signal
 * for that dossier (tkconv's "watch this entity" mode); a watch with a query
 * matches on term hit, optionally further scoped to the dossier.
 */
function matchWatch(watch: WatchRow, signal: SignalRow): string | null {
  const q = (watch.query?.q ?? '').trim();
  const haystack = `${signal.title} ${signal.duiding ?? ''}`;

  if (watch.dossier_id) {
    if (signal.dossier_id !== watch.dossier_id) return null;
    if (!q) return `dossier:${watch.dossier_id}`;
    return matchesQueryTerms(haystack, q);
  }
  if (!q) return null;
  return matchesQueryTerms(haystack, q);
}

export async function computeNotifications(tenantId: string, reason = 'unknown'): Promise<void> {
  const startedAt = Date.now();
  const [watches, signals] = await Promise.all([
    db.any<WatchRow>(
      `SELECT id, user_id, dossier_id, query FROM pa_saved_searches
       WHERE tenant_id = $1 AND notify = true AND user_id IS NOT NULL`,
      [tenantId]
    ),
    db.any<SignalRow>(
      `SELECT id, dossier_id, title, duiding FROM pa_signals WHERE status = 'confirmed'`
    ),
  ]);

  logger.info('computeNotifications started', {
    tenantId,
    reason,
    watches: watches.length,
    signals: signals.length,
  });

  if (!watches.length || !signals.length) {
    logger.info('computeNotifications: nothing to match, exiting early', {
      tenantId,
      reason,
      watches: watches.length,
      signals: signals.length,
    });
    return;
  }

  const grouped = new Map<string, { userId: string; signalId: string; matches: MatchedSearch[] }>();

  for (const watch of watches) {
    for (const signal of signals) {
      const label = matchWatch(watch, signal);
      if (label === null) continue;
      const key = `${watch.user_id}:${signal.id}`;
      const entry = grouped.get(key) ?? { userId: watch.user_id, signalId: signal.id, matches: [] };
      entry.matches.push({ id: watch.id, dossierId: watch.dossier_id, label });
      grouped.set(key, entry);
    }
  }

  if (!grouped.size) {
    logger.info('computeNotifications: no watch matched any confirmed signal', {
      tenantId,
      reason,
      watches: watches.length,
      signals: signals.length,
    });
    return;
  }

  let inserted = 0;
  let conflicted = 0;
  for (const { userId, signalId, matches } of grouped.values()) {
    try {
      const result = await db.result(
        `INSERT INTO pa_notifications (id, tenant_id, user_id, signal_id, matched_searches)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, signal_id) DO NOTHING`,
        [
          `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          tenantId,
          userId,
          signalId,
          JSON.stringify(matches),
        ]
      );
      if (result.rowCount > 0) {
        inserted += result.rowCount;
        logger.info('computeNotifications: inserted', { tenantId, reason, userId, signalId });
      } else {
        conflicted += 1; // already existed — expected on repeat cycles, not an error
      }
    } catch (err) {
      logger.error('Notification insert failed', {
        tenantId,
        reason,
        userId,
        signalId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.info('computeNotifications finished', {
    tenantId,
    reason,
    watches: watches.length,
    signals: signals.length,
    matched: grouped.size,
    inserted,
    alreadyExisted: conflicted,
    durationMs: Date.now() - startedAt,
  });
}
