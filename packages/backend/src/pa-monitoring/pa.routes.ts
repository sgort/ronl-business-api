/**
 * PA Monitoring routes.
 * Mounted at /v1/pa in index.ts.
 * All routes require Keycloak JWT.
 */

import express from 'express';
import { jwtMiddleware, requireRoles } from '@auth/jwt.middleware';
import { tenantMiddleware } from '@middleware/tenant.middleware';
import { createLogger } from '@utils/logger';
import { db } from '@services/audit.service';
import { fetchTkFeed, TK_DOCUMENT_TYPES } from './sources/tk.client';
import { fetchObFeed, OB_PUBLICATION_TYPES } from './sources/ob.client';
import { runCurationCycle, promoteToInbox } from './curation.service';
import { fetchAgenda } from './sources/agenda.client';
import type { FeedItem, Signal } from '@ronl/shared';

const router = express.Router();
const logger = createLogger('pa-routes');

// ── POST /v1/pa/curator/run ───────────────────────────────────────────────────
// Triggers curation for flevoland tenant. Runs in background.
router.post('/curator/run', jwtMiddleware, requireRoles('public-affairs'), async (_req, res) => {
  void runCurationCycle('flevoland').catch((err) =>
    logger.error('Curation cycle failed', {
      error: err instanceof Error ? err.message : String(err),
    })
  );
  res.json({ success: true, data: { started: true, tenantId: 'flevoland' } });
});

// ── GET /v1/pa/curator/status ─────────────────────────────────────────────────
router.get('/curator/status', jwtMiddleware, requireRoles('public-affairs'), async (_req, res) => {
  try {
    const [signalCounts, searchCounts] = await Promise.all([
      db.one<{ total: string; candidate: string; confirmed: string }>(
        `SELECT
           COUNT(*)::text AS total,
           COUNT(*) FILTER (WHERE status = 'candidate' OR status = 'ai_drafted')::text AS candidate,
           COUNT(*) FILTER (WHERE status = 'confirmed')::text AS confirmed
         FROM pa_signals`
      ),
      db.one<{ total: string; flevoland: string }>(
        `SELECT
           COUNT(*)::text AS total,
           COUNT(*) FILTER (WHERE tenant_id = 'flevoland')::text AS flevoland
         FROM pa_saved_searches`
      ),
    ]);
    res.json({
      success: true,
      data: {
        signals: {
          total: Number(signalCounts.total),
          inbox: Number(signalCounts.candidate),
          confirmed: Number(signalCounts.confirmed),
        },
        searches: {
          total: Number(searchCounts.total),
          flevoland: Number(searchCounts.flevoland),
        },
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { code: 'STATUS_ERROR', message: err instanceof Error ? err.message : String(err) },
    });
  }
});

router.use(jwtMiddleware);
router.use(tenantMiddleware);
router.use(requireRoles('public-affairs'));

// ── GET /v1/pa/feed ──────────────────────────────────────────────────────────
// Raw merged TK+OB feed. Query params: q, types (csv), source (tk|ob), skip, top.
router.get('/feed', async (req, res) => {
  if (!req.user) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });

  const q = typeof req.query['q'] === 'string' ? req.query['q'] : null;
  const source = typeof req.query['source'] === 'string' ? req.query['source'] : 'both';
  const typesRaw = typeof req.query['types'] === 'string' ? req.query['types'] : '';
  const types = typesRaw ? typesRaw.split(',').map((t) => t.trim()) : [];
  const skip = parseInt(String(req.query['skip'] ?? '0'), 10) || 0;
  const top = Math.min(parseInt(String(req.query['top'] ?? '20'), 10) || 20, 100);

  try {
    const fetches: Promise<{ items: unknown[]; total: number | null }>[] = [];
    if (source !== 'ob')
      fetches.push(
        fetchTkFeed(
          q,
          types.filter((t) => TK_DOCUMENT_TYPES.includes(t as (typeof TK_DOCUMENT_TYPES)[number])),
          skip,
          top
        )
      );
    if (source !== 'tk')
      fetches.push(
        fetchObFeed(
          q,
          types.filter((t) =>
            OB_PUBLICATION_TYPES.includes(t as (typeof OB_PUBLICATION_TYPES)[number])
          ),
          skip,
          top
        )
      );

    const results = await Promise.allSettled(fetches);
    const items: unknown[] = [];
    let total: number | null = null;

    for (const r of results) {
      if (r.status === 'fulfilled') {
        items.push(...r.value.items);
        if (r.value.total != null) total = (total ?? 0) + r.value.total;
      } else {
        logger.warn('Feed source failed', { reason: r.reason });
      }
    }

    res.json({ success: true, data: { items, total, skip, top } });
  } catch (err) {
    logger.error('Feed error', { error: err instanceof Error ? err.message : String(err) });
    res.status(502).json({
      success: false,
      error: { code: 'UPSTREAM_ERROR', message: 'Upstream feed unavailable' },
    });
  }
});

// ── GET /v1/pa/types ─────────────────────────────────────────────────────────
router.get('/types', (_req, res) => {
  res.json({
    success: true,
    data: {
      tk: [...TK_DOCUMENT_TYPES],
      ob: [...OB_PUBLICATION_TYPES],
    },
  });
});

// ── GET /v1/pa/agenda ────────────────────────────────────────────────────────
// Read-only TK schedule: plenaire + commissiedebatten ±14/+30 days from today.
// No curation loop — straight fetch → normalise → taxonomy match → respond.
router.get('/agenda', async (req, res) => {
  if (!req.user) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });

  const today = new Date();
  const from = new Date(today);
  from.setDate(today.getDate() - 14);
  const to = new Date(today);
  to.setDate(today.getDate() + 30);
  const dateFrom = from.toISOString().substring(0, 10);
  const dateTo = to.toISOString().substring(0, 10);

  try {
    const [items, searches] = await Promise.all([
      fetchAgenda(dateFrom, dateTo),
      db.any<{ dossier_id: string; query: { q: string } }>(
        `SELECT dossier_id, query FROM pa_saved_searches
         WHERE tenant_id = $1 AND scope = 'tenant' AND dossier_id IS NOT NULL`,
        [req.user.tenantId]
      ),
    ]);

    const enriched = items.map((item) => {
      for (const s of searches) {
        const terms = s.query.q
          .split(/\s+OR\s+/i)
          .map((t) => t.replace(/^"|"$/g, '').trim())
          .filter(Boolean);
        const lower = item.titel.toLowerCase();
        for (const term of terms) {
          if (lower.includes(term.toLowerCase())) {
            return { ...item, dossier: s.dossier_id, matchTerm: term };
          }
        }
      }
      return item;
    });

    res.json({ success: true, data: enriched });
  } catch (err) {
    logger.error('Agenda error', { error: err instanceof Error ? err.message : String(err) });
    res.status(502).json({
      success: false,
      error: { code: 'AGENDA_ERROR', message: 'Upstream agenda unavailable' },
    });
  }
});

// ── GET /v1/pa/signals ───────────────────────────────────────────────────────
// Returns confirmed signals. Query: tab, dossierId, status.
router.get('/signals', async (req, res) => {
  if (!req.user) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });

  const tab = typeof req.query['tab'] === 'string' ? req.query['tab'] : null;
  const dossierId = typeof req.query['dossierId'] === 'string' ? req.query['dossierId'] : null;
  const status = typeof req.query['status'] === 'string' ? req.query['status'] : 'confirmed';

  try {
    const conditions: string[] = ['1=1'];
    const values: unknown[] = [];
    let idx = 1;

    if (tab) {
      conditions.push(`tab = $${idx++}`);
      values.push(tab);
    }
    if (dossierId) {
      conditions.push(`dossier_id = $${idx++}`);
      values.push(dossierId);
    }
    if (status !== 'all') {
      const statuses = status
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (statuses.length === 1) {
        conditions.push(`status = $${idx++}`);
        values.push(statuses[0]);
      } else {
        conditions.push(`status = ANY($${idx++})`);
        values.push(statuses);
      }
    }

    const rows = await db.any<Record<string, unknown>>(
      `SELECT id, tab, dossier_id, title, src, bron, subbron, commissie, ref, rel, impact, impact_label,
              duiding, status, ai_draft, confirmed_by, confirmed_at
       FROM pa_signals
       WHERE ${conditions.join(' AND ')}
       ORDER BY rel DESC, created_at DESC
       LIMIT 100`,
      values
    );

    const signals: Signal[] = rows.map(rowToSignal);
    res.json({ success: true, data: signals });
  } catch (err) {
    logger.error('Signals fetch error', {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ success: false, error: { code: 'SIGNALS_ERROR' } });
  }
});

// ── POST /v1/pa/signals ──────────────────────────────────────────────────────
// Promote one raw feed item (body = FeedItem) into the inbox as a candidate.
// Scoring/persist stays in curation.service; this route stays thin.
router.post('/signals', async (req, res) => {
  if (!req.user) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });

  const item = req.body as Partial<FeedItem>;
  if (!item?.id || !item.title || !item.source) {
    return res.status(400).json({ success: false, error: { code: 'MISSING_FIELDS' } });
  }

  try {
    const id = await promoteToInbox(req.user.tenantId, item as FeedItem);
    const row = await db.one<Record<string, unknown>>(
      `SELECT id, tab, dossier_id, title, src, bron, subbron, commissie, ref, rel, impact, impact_label,
              duiding, status, ai_draft, confirmed_by, confirmed_at
       FROM pa_signals WHERE id = $1`,
      [id]
    );
    res.status(201).json({ success: true, data: rowToSignal(row) });
  } catch (err) {
    logger.error('Promote to inbox error', {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ success: false, error: { code: 'PROMOTE_ERROR' } });
  }
});

// ── POST /v1/pa/signals/:id/confirm ──────────────────────────────────────────
router.post('/signals/:id/confirm', async (req, res) => {
  if (!req.user) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });

  const { id } = req.params;
  const { duiding, impact, impactLabel, rel } = req.body as {
    duiding?: string;
    impact?: string;
    impactLabel?: string;
    rel?: number;
  };

  try {
    const existing = await db.oneOrNone<{ id: string }>('SELECT id FROM pa_signals WHERE id = $1', [
      id,
    ]);
    if (!existing) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND' } });

    const confirmedAt = new Date().toISOString();
    const confirmedBy = req.user.displayName ?? req.user.preferredUsername ?? req.user.userId;

    await db.none(
      `UPDATE pa_signals
       SET status = 'confirmed',
           duiding = COALESCE($1, duiding),
           impact = COALESCE($2, impact),
           impact_label = COALESCE($3, impact_label),
           rel = COALESCE($4, rel),
           confirmed_by = $5,
           confirmed_at = $6,
           updated_at = NOW()
       WHERE id = $7`,
      [
        duiding ?? null,
        impact ?? null,
        impactLabel ?? null,
        rel ?? null,
        confirmedBy,
        confirmedAt,
        id,
      ]
    );

    const updated = await db.one<Record<string, unknown>>(
      `SELECT id, tab, dossier_id, title, src, bron, subbron, commissie, ref, rel, impact, impact_label,
              duiding, status, ai_draft, confirmed_by, confirmed_at
       FROM pa_signals WHERE id = $1`,
      [id]
    );

    res.json({ success: true, data: rowToSignal(updated) });
  } catch (err) {
    logger.error('Signal confirm error', {
      id,
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ success: false, error: { code: 'CONFIRM_ERROR' } });
  }
});

// ── GET /v1/pa/searches ───────────────────────────────────────────────────────
router.get('/searches', async (req, res) => {
  if (!req.user) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });

  try {
    const rows = await db.any(
      `SELECT id, tenant_id, user_id, scope, dossier_id, query, tags, created_at, updated_at
       FROM pa_saved_searches
       WHERE tenant_id = $1 AND (scope = 'tenant' OR user_id = $2)
       ORDER BY created_at`,
      [req.user.tenantId, req.user.userId]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    logger.error('Searches fetch error', {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ success: false, error: { code: 'SEARCHES_ERROR' } });
  }
});

// ── POST /v1/pa/searches ──────────────────────────────────────────────────────
router.post('/searches', async (req, res) => {
  if (!req.user) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });

  const { dossierId, query, tags, scope } = req.body as {
    dossierId?: string;
    query: { q: string; types?: string[]; source?: string[] };
    tags?: string[];
    scope?: 'tenant' | 'user';
  };

  if (!query?.q) {
    return res.status(400).json({ success: false, error: { code: 'MISSING_QUERY' } });
  }

  try {
    const id = `srch-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    await db.none(
      `INSERT INTO pa_saved_searches (id, tenant_id, user_id, scope, dossier_id, query, tags)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        id,
        req.user.tenantId,
        req.user.userId,
        scope ?? 'user',
        dossierId ?? null,
        JSON.stringify(query),
        tags ?? [],
      ]
    );
    res.status(201).json({ success: true, data: { id } });
  } catch (err) {
    logger.error('Search create error', {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ success: false, error: { code: 'SEARCH_CREATE_ERROR' } });
  }
});

// ── DELETE /v1/pa/searches/:id ────────────────────────────────────────────────
router.delete('/searches/:id', async (req, res) => {
  if (!req.user) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });

  const { id } = req.params;
  try {
    const result = await db.result(
      `DELETE FROM pa_saved_searches
       WHERE id = $1 AND (user_id = $2 OR tenant_id = $3)`,
      [id, req.user.userId, req.user.tenantId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND' } });
    }
    res.json({ success: true });
  } catch (err) {
    logger.error('Search delete error', {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ success: false, error: { code: 'SEARCH_DELETE_ERROR' } });
  }
});

// ── PATCH /v1/pa/searches/:id ─────────────────────────────────────────────────
// Flip a personal (user) search to a team (tenant) bron, or back. Owner-only via
// the user_id clause. A tenant-scoped search is what the curation cron consumes.
router.patch('/searches/:id', async (req, res) => {
  if (!req.user) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });

  const { scope } = req.body as { scope?: 'tenant' | 'user' };
  if (scope !== 'tenant' && scope !== 'user') {
    return res.status(400).json({ success: false, error: { code: 'BAD_SCOPE' } });
  }

  try {
    const result = await db.result(
      `UPDATE pa_saved_searches SET scope = $1, updated_at = NOW()
       WHERE id = $2 AND user_id = $3 AND tenant_id = $4`,
      [scope, req.params.id, req.user.userId, req.user.tenantId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND' } });
    }
    res.json({ success: true });
  } catch (err) {
    logger.error('Search scope update error', {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ success: false, error: { code: 'SEARCH_UPDATE_ERROR' } });
  }
});

function rowToSignal(row: Record<string, unknown>): Signal {
  return {
    id: row['id'] as string,
    tab: row['tab'] as Signal['tab'],
    dossierId: (row['dossier_id'] as string | null) ?? null,
    title: row['title'] as string,
    src: row['src'] as string,
    bron: (row['bron'] as Signal['bron']) ?? null,
    subbron: (row['subbron'] as string | null) ?? null,
    commissie: (row['commissie'] as string | null) ?? null,
    ref: row['ref'] ? (row['ref'] as Signal['ref']) : null,
    rel: row['rel'] as number,
    impact: (row['impact'] as Signal['impact']) ?? null,
    impactLabel: (row['impact_label'] as string | null) ?? null,
    duiding: (row['duiding'] as string | null) ?? null,
    status: row['status'] as Signal['status'],
    aiDraft: row['ai_draft'] ? (row['ai_draft'] as Signal['aiDraft']) : null,
    confirmedBy: (row['confirmed_by'] as string | null) ?? null,
    confirmedAt: row['confirmed_at'] ? String(row['confirmed_at']) : null,
  };
}

export default router;
