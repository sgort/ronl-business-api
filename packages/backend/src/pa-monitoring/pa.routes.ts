/**
 * PA Monitoring routes.
 * Mounted at /v1/pa in index.ts.
 * All routes require Keycloak JWT, except /curator/run, /curator/status
 * (route-level JWT instead of the router-wide middleware) and /signals.rss
 * (RSS readers can't send a bearer token — authenticated via ?token= instead).
 */

import express from 'express';
import { randomBytes } from 'crypto';
import { jwtMiddleware, requireRoles } from '@auth/jwt.middleware';
import { tenantMiddleware } from '@middleware/tenant.middleware';
import { createLogger } from '@utils/logger';
import { db } from '@services/audit.service';
import { fetchTkFeed, TK_DOCUMENT_TYPES } from './sources/tk.client';
import { fetchObFeed, OB_PUBLICATION_TYPES } from './sources/ob.client';
import { searchFlevolandNews } from './sources/media.client';
import { fetchEuFeed } from './sources/eu.client';
import { FEEDS as MEDIA_FEEDS } from '../media-aggregator/feeds';
import { runCurationCycle, promoteToInbox } from './curation.service';
import { fetchAgenda } from './sources/agenda.client';
import { matchesQueryTerms } from './query-match';
import { computeNotifications } from './notifications.service';
import { toRssXml } from './rss';
import { config } from '@utils/config';
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

// ── GET /v1/pa/signals.rss ────────────────────────────────────────────────────
// Personal RSS export of confirmed signals — "one query, two renderers" alongside
// GET /v1/pa/signals below (same fetchSignalsRows + rowToSignal, XML instead of
// JSON). RSS readers can't send a Keycloak bearer token, so this sits before the
// router's jwtMiddleware and authenticates via ?token= instead, minted by the
// authenticated GET /v1/pa/feed-token.
router.get('/signals.rss', async (req, res) => {
  const token = typeof req.query['token'] === 'string' ? req.query['token'] : null;
  if (!token) return res.status(401).send('Missing token');

  try {
    const tokenRow = await db.oneOrNone<{ user_id: string; tenant_id: string }>(
      `SELECT user_id, tenant_id FROM pa_feed_tokens WHERE token = $1`,
      [token]
    );
    if (!tokenRow) return res.status(401).send('Invalid token');

    const tab = typeof req.query['tab'] === 'string' ? req.query['tab'] : null;
    const dossierId = typeof req.query['dossierId'] === 'string' ? req.query['dossierId'] : null;

    const conditions: string[] = [`status = 'confirmed'`];
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

    const rows = await fetchSignalsRows(conditions.join(' AND '), values, 100);
    const signals = rows.map(rowToSignal);
    const selfUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    const xml = toRssXml(signals, 'PA-Cockpit — gecureerde signalen', selfUrl);

    res.type('application/rss+xml; charset=utf-8').send(xml);
  } catch (err) {
    logger.error('Signals RSS error', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).send('Internal error');
  }
});

router.use(jwtMiddleware);
router.use(tenantMiddleware);
router.use(requireRoles('public-affairs'));

// ── GET /v1/pa/feed ──────────────────────────────────────────────────────────
// Raw merged TK+OB+media feed. Query params: q, types (csv),
// source (both|tk|ob|media|eu — 'both' does not include eu, matching the
// curation cycle's own opt-in-per-search treatment of the EU source), skip,
// top.
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
    if (source === 'both' || source === 'tk')
      fetches.push(
        fetchTkFeed(
          q,
          types.filter((t) => TK_DOCUMENT_TYPES.includes(t as (typeof TK_DOCUMENT_TYPES)[number])),
          skip,
          top
        )
      );
    if (source === 'both' || source === 'ob')
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
    if ((source === 'both' || source === 'media') && config.pa.mediaSourceEnabled)
      fetches.push(searchFlevolandNews(q, top));
    if (source === 'eu' && config.pa.euSourceEnabled)
      fetches.push(fetchEuFeed(q, types, skip, top));

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
// Keys double as the searchable-bronnen list for the blanco zoekfunctie
// (frontend derives feedSources from Object.keys of this response).
router.get('/types', (_req, res) => {
  res.json({
    success: true,
    data: {
      tk: [...TK_DOCUMENT_TYPES],
      ob: [...OB_PUBLICATION_TYPES],
      // Media has no fixed document-type taxonomy (RSS feeds, not a typed API) —
      // an empty array is enough to make 'media' a searchable bron key.
      ...(config.pa.mediaSourceEnabled ? { media: [] } : {}),
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
        const term = matchesQueryTerms(item.titel, s.query.q);
        if (term) return { ...item, dossier: s.dossier_id, matchTerm: term };
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

    const CAP = 100;
    const where = conditions.join(' AND ');
    const [rows, countRows] = await Promise.all([
      fetchSignalsRows(where, values, CAP),
      db.any<{ count: string }>(`SELECT COUNT(*) AS count FROM pa_signals WHERE ${where}`, values),
    ]);

    const signals: Signal[] = rows.map(rowToSignal);
    const total = parseInt(countRows[0]?.count ?? '0', 10);
    res.json({
      success: true,
      data: signals,
      meta: { total, cap: CAP, capped: total > CAP },
    });
  } catch (err) {
    logger.error('Signals fetch error', {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ success: false, error: { code: 'SIGNALS_ERROR' } });
  }
});

// ── GET /v1/pa/signals/counts ────────────────────────────────────────────────
// Inbox size per tab, in one grouped query. The cockpit's source badges need
// four totals on mount; asking /signals four times pulls four capped result sets
// (up to 100 rows each) to read four numbers off their meta. Must stay above any
// /signals/:id-shaped GET so 'counts' is not swallowed as an id.
router.get('/signals/counts', async (req, res) => {
  if (!req.user) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });

  const status =
    typeof req.query['status'] === 'string' ? req.query['status'] : 'candidate,ai_drafted';

  try {
    const statuses = status
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const rows = await db.any<{ tab: string; count: string }>(
      `SELECT tab, COUNT(*) AS count FROM pa_signals WHERE status = ANY($1) GROUP BY tab`,
      [statuses]
    );

    const counts: Record<string, number> = {};
    for (const row of rows) counts[row.tab] = parseInt(row.count, 10);

    res.json({ success: true, data: counts });
  } catch (err) {
    logger.error('Signal counts fetch error', {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ success: false, error: { code: 'SIGNAL_COUNTS_ERROR' } });
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
      `SELECT id, tab, dossier_id, title, src, bron, subbron, commissie, regio, sentiment, ref, rel, impact, impact_label,
              duiding, status, ai_draft, confirmed_by, confirmed_at, routing
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
           routing = CASE WHEN dossier_id IS NULL THEN 'watchlist' ELSE NULL END,
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
      `SELECT id, tab, dossier_id, title, src, bron, subbron, commissie, regio, sentiment, ref, rel, impact, impact_label,
              duiding, status, ai_draft, confirmed_by, confirmed_at, routing
       FROM pa_signals WHERE id = $1`,
      [id]
    );

    // A confirm is exactly the event a watch cares about — don't make the user
    // wait for the next 6-hourly curation cycle to see it in Meldingen.
    await computeNotifications(req.user.tenantId, 'confirm').catch((err: unknown) => {
      logger.error('Notification compute failed after confirm', {
        id,
        error: err instanceof Error ? err.message : String(err),
      });
    });

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
    // Team (unowned) rows have no `notify` column that means anything — see
    // docs/WATCHBELL.md Gotcha #2 — so their effective notify state for the
    // caller is whether a personal watch derivative (source_search_id -> this
    // row, owned by the caller) exists. Personal rows keep using their own
    // column. Derivative rows themselves are bookkeeping, not something a
    // user picks from the list, so they're excluded here.
    const rows = await db.any(
      `SELECT s.id, s.tenant_id, s.user_id, s.scope, s.dossier_id, s.query, s.tags, s.created_at, s.updated_at,
              CASE WHEN s.user_id IS NULL
                THEN EXISTS (
                  SELECT 1 FROM pa_saved_searches w
                  WHERE w.source_search_id = s.id AND w.user_id = $2 AND w.notify = true
                )
                ELSE s.notify
              END AS notify
       FROM pa_saved_searches s
       WHERE s.tenant_id = $1 AND (s.scope = 'tenant' OR s.user_id = $2 OR s.user_id IS NULL)
         AND s.source_search_id IS NULL
       ORDER BY s.created_at`,
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
// Edit scope, query, tags, and/or dossierId in place.
// Tenant-guarded (not user_id-only) so team criteria are editable by any PA officer.
router.patch('/searches/:id', async (req, res) => {
  if (!req.user) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });

  const { scope, query, tags, dossierId, notify } = req.body as {
    scope?: 'tenant' | 'user';
    query?: { q: string; types?: string[]; source?: string[] };
    tags?: string[];
    dossierId?: string | null;
    notify?: boolean;
  };

  if (
    scope === undefined &&
    query === undefined &&
    tags === undefined &&
    dossierId === undefined &&
    notify === undefined
  ) {
    return res.status(400).json({ success: false, error: { code: 'MISSING_FIELDS' } });
  }
  if (scope !== undefined && scope !== 'tenant' && scope !== 'user') {
    return res.status(400).json({ success: false, error: { code: 'BAD_SCOPE' } });
  }
  if (query !== undefined && !query.q?.trim()) {
    return res.status(400).json({ success: false, error: { code: 'EMPTY_QUERY' } });
  }

  try {
    const sets: string[] = ['updated_at = NOW()'];
    const values: unknown[] = [];
    let idx = 1;

    if (scope !== undefined) {
      sets.push(`scope = $${idx++}`);
      values.push(scope);
    }
    if (query !== undefined) {
      sets.push(`query = $${idx++}`);
      values.push(JSON.stringify(query));
    }
    if (tags !== undefined) {
      sets.push(`tags = $${idx++}`);
      values.push(tags);
    }
    if (dossierId !== undefined) {
      sets.push(`dossier_id = $${idx++}`);
      values.push(dossierId);
    }
    if (notify !== undefined) {
      // Team (unowned) rows have no single recipient — writing `notify`
      // straight onto the row is a no-op nobody ever sees (see
      // docs/WATCHBELL.md Gotcha #2). Skip it in SQL for those rows; the
      // block below creates/removes a personal watch derivative instead,
      // which computeNotifications' `user_id IS NOT NULL` query can actually
      // pick up.
      sets.push(`notify = CASE WHEN user_id IS NOT NULL THEN $${idx++} ELSE notify END`);
      values.push(notify);
    }

    values.push(req.params.id, req.user.tenantId);
    const result = await db.result(
      `UPDATE pa_saved_searches SET ${sets.join(', ')}
       WHERE id = $${idx} AND tenant_id = $${idx + 1}
       RETURNING user_id, dossier_id, query, tags`,
      values
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND' } });
    }

    const row = result.rows[0] as {
      user_id: string | null;
      dossier_id: string | null;
      query: { q: string; types?: string[]; source?: string[] };
      tags: string[];
    };
    const isTeamRow = row.user_id === null;

    // Keep any personal watch derivatives of this team row in sync with
    // edits to its query/tags/dossierId, so they don't keep matching on
    // terms the team search no longer has.
    if (isTeamRow && (query !== undefined || tags !== undefined || dossierId !== undefined)) {
      await db.none(
        `UPDATE pa_saved_searches SET query = $1, tags = $2, dossier_id = $3, updated_at = NOW()
         WHERE source_search_id = $4`,
        [JSON.stringify(row.query), row.tags, row.dossier_id, req.params.id]
      );
    }

    let recompute = false;
    if (notify !== undefined) {
      if (isTeamRow) {
        if (notify === true) {
          const existingWatch = await db.oneOrNone<{ id: string }>(
            `SELECT id FROM pa_saved_searches WHERE source_search_id = $1 AND user_id = $2`,
            [req.params.id, req.user.userId]
          );
          if (existingWatch) {
            await db.none(
              `UPDATE pa_saved_searches SET notify = true, query = $2, tags = $3, dossier_id = $4, updated_at = NOW()
               WHERE id = $1`,
              [existingWatch.id, JSON.stringify(row.query), row.tags, row.dossier_id]
            );
          } else {
            await db.none(
              `INSERT INTO pa_saved_searches (id, tenant_id, user_id, scope, dossier_id, query, tags, notify, source_search_id)
               VALUES ($1, $2, $3, 'user', $4, $5, $6, true, $7)`,
              [
                `watch-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                req.user.tenantId,
                req.user.userId,
                row.dossier_id,
                JSON.stringify(row.query),
                row.tags,
                req.params.id,
              ]
            );
          }
          recompute = true;
        } else {
          await db.none(
            `DELETE FROM pa_saved_searches WHERE source_search_id = $1 AND user_id = $2`,
            [req.params.id, req.user.userId]
          );
        }
      } else if (notify === true) {
        // Turning a watch on is the moment any already-confirmed backlog
        // becomes "watched" — recompute now so it surfaces here, not
        // silently deferred until some unrelated later trigger dumps it all
        // at once.
        recompute = true;
      }
    }

    if (recompute) {
      await computeNotifications(req.user.tenantId, 'watch-toggle').catch((err: unknown) => {
        logger.error('Notification compute failed after watch toggle', {
          id: req.params.id,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }

    res.json({ success: true });
  } catch (err) {
    logger.error('Search update error', {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ success: false, error: { code: 'SEARCH_UPDATE_ERROR' } });
  }
});

// ── PATCH /v1/pa/signals/:id ─────────────────────────────────────────────────
// Link a watchlist signal to a dossier; clears routing.
router.patch('/signals/:id', async (req, res) => {
  if (!req.user) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });

  const { id } = req.params;
  const { dossierId } = req.body as { dossierId?: string };
  if (!dossierId) {
    return res.status(400).json({ success: false, error: { code: 'MISSING_DOSSIER_ID' } });
  }

  try {
    const result = await db.result(
      `UPDATE pa_signals
       SET dossier_id = $1,
           routing = NULL,
           updated_at = NOW()
       WHERE id = $2`,
      [dossierId, id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND' } });
    }
    const updated = await db.one<Record<string, unknown>>(
      `SELECT id, tab, dossier_id, title, src, bron, subbron, commissie, regio, sentiment, ref, rel, impact, impact_label,
              duiding, status, ai_draft, confirmed_by, confirmed_at, routing
       FROM pa_signals WHERE id = $1`,
      [id]
    );

    // Linking a watchlist signal to a dossier is exactly the kind of change a
    // dossier-only watch (empty-query, matched on dossier_id) cares about — it
    // couldn't have matched while dossier_id was null, so recompute now rather
    // than waiting for the next curation cycle.
    await computeNotifications(req.user.tenantId, 'link-dossier').catch((err: unknown) => {
      logger.error('Notification compute failed after dossier link', {
        id,
        error: err instanceof Error ? err.message : String(err),
      });
    });

    res.json({ success: true, data: rowToSignal(updated) });
  } catch (err) {
    logger.error('Signal link dossier error', {
      id,
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ success: false, error: { code: 'LINK_DOSSIER_ERROR' } });
  }
});

// ── GET /v1/pa/notifications ──────────────────────────────────────────────────
// Delivery inbox for watched saved searches (notify=true), populated by
// notifications.service's computeNotifications() at the end of each curation
// cycle. Query: unseen=true restricts to rows not yet acked.
router.get('/notifications', async (req, res) => {
  if (!req.user) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });

  const unseenOnly = req.query['unseen'] === 'true';

  try {
    const conditions = ['n.user_id = $1', 'n.tenant_id = $2'];
    const values: unknown[] = [req.user.userId, req.user.tenantId];
    if (unseenOnly) conditions.push('n.seen_at IS NULL');

    const rows = await db.any<Record<string, unknown>>(
      `SELECT n.id, n.signal_id, n.matched_searches, n.created_at, n.seen_at,
              s.title, s.tab, s.dossier_id, s.src, s.ref,
              d.naam AS dossier_naam
       FROM pa_notifications n
       JOIN pa_signals s ON s.id = n.signal_id
       LEFT JOIN pa_dossiers d ON d.id = s.dossier_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY n.created_at DESC
       LIMIT 100`,
      values
    );

    const notifications = rows.map((row) => {
      const dossierNaam = row['dossier_naam'] as string | null;
      // matchWatch() (notifications.service.ts) stores a `dossier:<id>` sentinel
      // label for a watch-everything-for-this-dossier match — swap it for the
      // dossier's actual name here rather than showing the raw id to the user.
      const rawMatches = (row['matched_searches'] ?? []) as {
        id: string;
        dossierId: string | null;
        label: string;
      }[];
      const matchedSearches = rawMatches.map((m) =>
        dossierNaam && m.label.startsWith('dossier:')
          ? { ...m, label: `Dossier: ${dossierNaam}` }
          : m
      );

      return {
        id: row['id'] as string,
        signalId: row['signal_id'] as string,
        title: row['title'] as string,
        tab: row['tab'] as string,
        dossierId: (row['dossier_id'] as string | null) ?? null,
        src: row['src'] as string,
        ref: row['ref'] ? (row['ref'] as { type: string; nr: string; url: string }) : null,
        matchedSearches,
        createdAt: String(row['created_at']),
        seenAt: row['seen_at'] ? String(row['seen_at']) : null,
      };
    });
    const unseenCount = notifications.filter((n) => !n.seenAt).length;

    res.json({ success: true, data: notifications, meta: { unseenCount } });
  } catch (err) {
    logger.error('Notifications fetch error', {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ success: false, error: { code: 'NOTIFICATIONS_ERROR' } });
  }
});

// ── POST /v1/pa/notifications/ack ─────────────────────────────────────────────
// Marks notifications seen. Body { ids?: string[] } — omitted acks every unseen
// notification for the caller (tkconv's whole-batch delivery, no per-item read state).
router.post('/notifications/ack', async (req, res) => {
  if (!req.user) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });

  const { ids } = req.body as { ids?: string[] };

  try {
    if (ids?.length) {
      await db.none(
        `UPDATE pa_notifications SET seen_at = NOW()
         WHERE user_id = $1 AND tenant_id = $2 AND id = ANY($3) AND seen_at IS NULL`,
        [req.user.userId, req.user.tenantId, ids]
      );
    } else {
      await db.none(
        `UPDATE pa_notifications SET seen_at = NOW()
         WHERE user_id = $1 AND tenant_id = $2 AND seen_at IS NULL`,
        [req.user.userId, req.user.tenantId]
      );
    }
    res.json({ success: true });
  } catch (err) {
    logger.error('Notifications ack error', {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ success: false, error: { code: 'NOTIFICATIONS_ACK_ERROR' } });
  }
});

// ── GET /v1/pa/feed-token ─────────────────────────────────────────────────────
// Find-or-create the caller's personal RSS token (GET /v1/pa/signals.rss?token=...).
router.get('/feed-token', async (req, res) => {
  if (!req.user) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });

  try {
    const existing = await db.oneOrNone<{ token: string }>(
      `SELECT token FROM pa_feed_tokens WHERE user_id = $1 AND tenant_id = $2`,
      [req.user.userId, req.user.tenantId]
    );
    const token = existing?.token ?? randomBytes(24).toString('hex');
    if (!existing) {
      await db.none(`INSERT INTO pa_feed_tokens (token, user_id, tenant_id) VALUES ($1, $2, $3)`, [
        token,
        req.user.userId,
        req.user.tenantId,
      ]);
    }
    const url = `${req.protocol}://${req.get('host')}/v1/pa/signals.rss?token=${token}`;
    res.json({ success: true, data: { token, url } });
  } catch (err) {
    logger.error('Feed token error', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ success: false, error: { code: 'FEED_TOKEN_ERROR' } });
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
    regio: (row['regio'] as string | null) ?? null,
    sentiment: (row['sentiment'] as Signal['sentiment']) ?? null,
    ref: row['ref'] ? (row['ref'] as Signal['ref']) : null,
    rel: row['rel'] as number,
    impact: (row['impact'] as Signal['impact']) ?? null,
    impactLabel: (row['impact_label'] as string | null) ?? null,
    duiding: (row['duiding'] as string | null) ?? null,
    status: row['status'] as Signal['status'],
    aiDraft: row['ai_draft'] ? (row['ai_draft'] as Signal['aiDraft']) : null,
    confirmedBy: (row['confirmed_by'] as string | null) ?? null,
    confirmedAt: row['confirmed_at'] ? String(row['confirmed_at']) : null,
    routing: (row['routing'] as 'watchlist' | null) ?? null,
  };
}

// Shared row-fetch behind GET /v1/pa/signals and GET /v1/pa/signals.rss — "one
// query, two renderers": both routes build their own WHERE clause, then map
// through the same rowToSignal().
function fetchSignalsRows(
  where: string,
  values: unknown[],
  limit: number
): Promise<Record<string, unknown>[]> {
  return db.any<Record<string, unknown>>(
    `SELECT id, tab, dossier_id, title, src, bron, subbron, commissie, regio, sentiment, ref, rel, impact, impact_label,
            duiding, status, ai_draft, confirmed_by, confirmed_at, routing
     FROM pa_signals
     WHERE ${where}
     ORDER BY rel DESC, created_at DESC
     LIMIT ${limit}`,
    values
  );
}

// ── GET /v1/pa/sources/status ─────────────────────────────────────────────────
// Read-only connector health: reflects actual env flags so the Signaalbronnen
// screen never shows a status that contradicts the deployed configuration.
// `feeds` mirrors media-aggregator's live registry (feeds.ts) so BronnenSection.tsx
// doesn't need its own hand-maintained copy of the per-RSS-feed list.
router.get('/sources/status', (_req, res) => {
  res.json({
    success: true,
    data: {
      tk: true,
      ob: true,
      eu: config.pa.euSourceEnabled,
      epTeksten: config.pa.epTextsSubmittedEnabled,
      media: config.pa.mediaSourceEnabled,
      feeds: MEDIA_FEEDS.map((f) => ({
        id: f.id,
        name: f.name,
        homepage: f.homepage,
        type: f.type,
        url: f.url,
        alwaysFlevoland: f.alwaysFlevoland ?? false,
        categoryFilter: f.categoryFilter ?? null,
      })),
    },
  });
});

export default router;
