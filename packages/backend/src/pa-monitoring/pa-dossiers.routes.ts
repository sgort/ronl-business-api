/**
 * PA Dossierbeheer routes — the authoring source for /pa/dossiers.
 * Mounted at /v1/pa in index.ts, alongside pa.routes.ts.
 *
 * Every route sits under the same auth block as the rest of PA
 * (jwt → tenant → requireRoles('public-affairs')). Fine-grained authoring
 * capabilities map to the additional realm roles:
 *   pa-author  → create, edit
 *   pa-editor  → + templates, publish
 *   pa-admin   → + archive, delete
 * (see dossierCaps). Each write appends an immutable pa_dossier_versions row.
 */

import express from 'express';
import { jwtMiddleware, requireRoles } from '@auth/jwt.middleware';
import { tenantMiddleware } from '@middleware/tenant.middleware';
import { createLogger } from '@utils/logger';
import { db } from '@services/audit.service';
import { computeNotifications } from './notifications.service';
import {
  buildBodyFromAuthoring,
  rowToDossier,
  rowToAdminDossier,
  dossierDateLabel,
  DOSSIER_TEMPLATES,
  DOSSIER_SNIPPETS,
} from './pa-dossiers.db';
import type {
  AdminDossierStatus,
  DossierArchief,
  DossierMarkdown,
  DossierVersion,
  Momentum,
  PartialKompasScores,
} from '@ronl/shared';

const router = express.Router();
const logger = createLogger('pa-dossiers-routes');

router.use(jwtMiddleware);
router.use(tenantMiddleware);
router.use(requireRoles('public-affairs'));

const DOSSIER_COLS = `id, tenant_id, naam, onderwerp, status, momentum, eigenaar, kompas, md, body,
  versie, gepubliceerd, sjabloon, archief, created_at, updated_at`;

// ── Capability helper ───────────────────────────────────────────────

interface DossierCaps {
  create: boolean;
  edit: boolean;
  template: boolean;
  publish: boolean;
  archive: boolean;
  del: boolean;
}

export function dossierCaps(roles: string[]): DossierCaps {
  const admin = roles.includes('pa-admin');
  const editor = admin || roles.includes('pa-editor');
  const author = editor || roles.includes('pa-author');
  return {
    create: author,
    edit: author,
    template: editor,
    publish: editor,
    archive: admin,
    del: admin,
  };
}

function slugify(naam: string): string {
  return naam
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function actor(req: express.Request): string {
  return req.user?.displayName ?? req.user?.preferredUsername ?? req.user?.userId ?? 'onbekend';
}

async function loadVersions(dossierId: string): Promise<DossierVersion[]> {
  const rows = await db.any<{ v: number; at: string; by: string; note: string }>(
    `SELECT v, at, by, note FROM pa_dossier_versions WHERE dossier_id = $1 ORDER BY v`,
    [dossierId]
  );
  return rows.map((r) => ({ v: r.v, at: dossierDateLabel(r.at), by: r.by, note: r.note }));
}

async function appendVersion(
  dossierId: string,
  v: number,
  by: string,
  note: string
): Promise<void> {
  await db.none(
    `INSERT INTO pa_dossier_versions (dossier_id, v, by, note) VALUES ($1,$2,$3,$4)
     ON CONFLICT (dossier_id, v) DO NOTHING`,
    [dossierId, v, by, note]
  );
}

// ── GET /v1/pa/dossiers ─────────────────────────────────────────────
// Default → cockpit view: published, non-archived, rich Dossier[].
// ?admin=1 → management view: every dossier as an AdminDossier (with versies).
router.get('/dossiers', async (req, res) => {
  if (!req.user) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
  const admin = req.query['admin'] === '1' || req.query['admin'] === 'true';

  try {
    if (admin) {
      const rows = await db.any<Record<string, unknown>>(
        `SELECT ${DOSSIER_COLS} FROM pa_dossiers WHERE tenant_id = $1
         ORDER BY (status = 'gearchiveerd'), naam`,
        [req.user.tenantId]
      );
      const data = await Promise.all(
        rows.map(async (r) => rowToAdminDossier(r, await loadVersions(r['id'] as string)))
      );
      return res.json({ success: true, data });
    }

    const rows = await db.any<Record<string, unknown>>(
      `SELECT ${DOSSIER_COLS} FROM pa_dossiers
       WHERE tenant_id = $1 AND status <> 'gearchiveerd' AND gepubliceerd = true
       ORDER BY naam`,
      [req.user.tenantId]
    );
    res.json({ success: true, data: rows.map(rowToDossier) });
  } catch (err) {
    logger.error('Dossiers fetch error', {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ success: false, error: { code: 'DOSSIERS_ERROR' } });
  }
});

// ── GET /v1/pa/dossiers/:id ─────────────────────────────────────────
router.get('/dossiers/:id', async (req, res) => {
  if (!req.user) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
  const admin = req.query['admin'] === '1' || req.query['admin'] === 'true';

  try {
    const row = await db.oneOrNone<Record<string, unknown>>(
      `SELECT ${DOSSIER_COLS} FROM pa_dossiers WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, req.user.tenantId]
    );
    if (!row) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND' } });
    if (admin) {
      return res.json({
        success: true,
        data: rowToAdminDossier(row, await loadVersions(req.params.id)),
      });
    }
    res.json({ success: true, data: rowToDossier(row) });
  } catch (err) {
    logger.error('Dossier fetch error', {
      id: req.params.id,
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ success: false, error: { code: 'DOSSIER_ERROR' } });
  }
});

// ── POST /v1/pa/dossiers/:id/watch ──────────────────────────────────
// Idempotent: creates (or re-enables) a personal watch-everything-for-this-
// dossier pa_saved_searches row — dossier_id set, empty query. In
// notifications.service's matcher, an empty-query dossier watch matches every
// confirmed signal for that dossier (tkconv's "watch this entity" mode), as
// opposed to a topic search that happens to be scoped to the same dossier.
router.post('/dossiers/:id/watch', async (req, res) => {
  if (!req.user) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
  const dossierId = req.params.id;

  try {
    const existing = await db.oneOrNone<{ id: string }>(
      `SELECT id FROM pa_saved_searches
       WHERE tenant_id = $1 AND user_id = $2 AND dossier_id = $3 AND scope = 'user' AND query->>'q' = ''`,
      [req.user.tenantId, req.user.userId, dossierId]
    );
    let id: string;
    if (existing) {
      id = existing.id;
      await db.none(
        `UPDATE pa_saved_searches SET notify = true, updated_at = NOW() WHERE id = $1`,
        [id]
      );
    } else {
      id = `watch-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      await db.none(
        `INSERT INTO pa_saved_searches (id, tenant_id, user_id, scope, dossier_id, query, tags, notify)
         VALUES ($1, $2, $3, 'user', $4, $5, $6, true)`,
        [
          id,
          req.user.tenantId,
          req.user.userId,
          dossierId,
          JSON.stringify({ q: '', types: [], source: [] }),
          [],
        ]
      );
    }

    // Watching a dossier is the moment any already-confirmed backlog for it
    // becomes "watched" — recompute now so it surfaces immediately, not
    // silently deferred until some unrelated later trigger dumps it all at
    // once (see docs/WATCHBELL.md known limitations).
    await computeNotifications(req.user.tenantId, 'watch-toggle').catch((err: unknown) => {
      logger.error('Notification compute failed after dossier watch toggle', {
        dossierId,
        error: err instanceof Error ? err.message : String(err),
      });
    });

    res.status(existing ? 200 : 201).json({ success: true, data: { id } });
  } catch (err) {
    logger.error('Dossier watch create error', {
      dossierId,
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ success: false, error: { code: 'DOSSIER_WATCH_ERROR' } });
  }
});

// ── DELETE /v1/pa/dossiers/:id/watch ────────────────────────────────
router.delete('/dossiers/:id/watch', async (req, res) => {
  if (!req.user) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
  const dossierId = req.params.id;

  try {
    await db.none(
      `DELETE FROM pa_saved_searches
       WHERE tenant_id = $1 AND user_id = $2 AND dossier_id = $3 AND scope = 'user' AND query->>'q' = ''`,
      [req.user.tenantId, req.user.userId, dossierId]
    );
    res.json({ success: true });
  } catch (err) {
    logger.error('Dossier watch delete error', {
      dossierId,
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ success: false, error: { code: 'DOSSIER_WATCH_DELETE_ERROR' } });
  }
});

interface DossierWriteBody {
  naam?: string;
  onderwerp?: string;
  status?: AdminDossierStatus;
  momentum?: Momentum;
  eigenaar?: string;
  kompas?: PartialKompasScores;
  md?: Partial<DossierMarkdown>;
  sjabloon?: string;
  gepubliceerd?: boolean;
}

const EMPTY_MD: DossierMarkdown = { waaromNu: '', waarover: '', onsVerhaal: '' };

// ── POST /v1/pa/dossiers ────────────────────────────────────────────
// Create a dossier (requires pa-author+). Publishing requires pa-editor+.
router.post('/dossiers', requireRoles('pa-author', 'pa-editor', 'pa-admin'), async (req, res) => {
  if (!req.user) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
  const caps = dossierCaps(req.user.roles);
  const b = req.body as DossierWriteBody;

  const naam = (b.naam ?? '').trim();
  const onderwerp = (b.onderwerp ?? '').trim();
  if (naam.length < 3 || onderwerp.length === 0) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_FIELDS' } });
  }
  const gepubliceerd = Boolean(b.gepubliceerd);
  if (gepubliceerd && !caps.publish) {
    return res.status(403).json({ success: false, error: { code: 'FORBIDDEN_PUBLISH' } });
  }

  const status: AdminDossierStatus = b.status === 'sluimerend' ? 'sluimerend' : 'actief';
  const momentum: Momentum = b.momentum ?? 'flat';
  const md: DossierMarkdown = { ...EMPTY_MD, ...(b.md ?? {}) };
  const kompas: PartialKompasScores = b.kompas ?? {};
  const id = slugify(naam) || `dossier-${Date.now()}`;

  try {
    const exists = await db.oneOrNone<{ id: string }>('SELECT id FROM pa_dossiers WHERE id = $1', [
      id,
    ]);
    if (exists) return res.status(409).json({ success: false, error: { code: 'ID_CONFLICT' } });

    const body = buildBodyFromAuthoring({ id, naam, onderwerp, status, momentum, kompas, md });
    await db.none(
      `INSERT INTO pa_dossiers
         (id, tenant_id, naam, onderwerp, status, momentum, eigenaar, kompas, md, body,
          versie, gepubliceerd, sjabloon, archief)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,1,$11,$12,NULL)`,
      [
        id,
        req.user.tenantId,
        naam,
        onderwerp,
        status,
        momentum,
        (b.eigenaar ?? actor(req)).trim(),
        JSON.stringify(kompas),
        JSON.stringify(md),
        JSON.stringify(body),
        gepubliceerd,
        b.sjabloon ?? 'blanco',
      ]
    );
    await appendVersion(
      id,
      1,
      actor(req),
      gepubliceerd ? 'Aangemaakt en gepubliceerd.' : 'Aangemaakt.'
    );

    const row = await db.one<Record<string, unknown>>(
      `SELECT ${DOSSIER_COLS} FROM pa_dossiers WHERE id = $1`,
      [id]
    );
    res.status(201).json({ success: true, data: rowToAdminDossier(row, await loadVersions(id)) });
  } catch (err) {
    logger.error('Dossier create error', {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ success: false, error: { code: 'DOSSIER_CREATE_ERROR' } });
  }
});

// ── PATCH /v1/pa/dossiers/:id ───────────────────────────────────────
// Edit a dossier (requires pa-author+). Publishing requires pa-editor+.
// Appends a version on every write.
router.patch(
  '/dossiers/:id',
  requireRoles('pa-author', 'pa-editor', 'pa-admin'),
  async (req, res) => {
    if (!req.user) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
    const caps = dossierCaps(req.user.roles);
    const b = req.body as DossierWriteBody;
    const { id } = req.params;

    if (b.gepubliceerd === true && !caps.publish) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN_PUBLISH' } });
    }

    try {
      const existing = await db.oneOrNone<Record<string, unknown>>(
        `SELECT ${DOSSIER_COLS} FROM pa_dossiers WHERE id = $1 AND tenant_id = $2`,
        [id, req.user.tenantId]
      );
      if (!existing) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND' } });
      // Archived dossiers are read-only. Un-archiving is an explicit, audited
      // action (POST /dossiers/:id/unarchive), not a silent status flip.
      if (existing['status'] === 'gearchiveerd') {
        return res.status(409).json({ success: false, error: { code: 'ARCHIVED_READONLY' } });
      }

      const naam = b.naam !== undefined ? b.naam.trim() : (existing['naam'] as string);
      const onderwerp =
        b.onderwerp !== undefined ? b.onderwerp.trim() : (existing['onderwerp'] as string);
      if (naam.length < 3 || onderwerp.length === 0) {
        return res.status(400).json({ success: false, error: { code: 'INVALID_FIELDS' } });
      }

      const status = (b.status ?? existing['status']) as AdminDossierStatus;
      const momentum = (b.momentum ?? existing['momentum']) as Momentum;
      const kompas = (b.kompas ?? existing['kompas']) as PartialKompasScores;
      const md: DossierMarkdown = {
        ...EMPTY_MD,
        ...((existing['md'] as DossierMarkdown) ?? {}),
        ...(b.md ?? {}),
      };
      const eigenaar =
        b.eigenaar !== undefined ? b.eigenaar.trim() : (existing['eigenaar'] as string);
      const gepubliceerd =
        b.gepubliceerd !== undefined ? Boolean(b.gepubliceerd) : Boolean(existing['gepubliceerd']);
      const nextVersie = Number(existing['versie'] ?? 1) + 1;

      // Sync the authored fields into the rich body so the cockpit stays current.
      const prevBody = (existing['body'] as ReturnType<typeof buildBodyFromAuthoring>) ?? {};
      const body = {
        ...prevBody,
        id,
        naam,
        onderwerp,
        status: (status === 'gearchiveerd' ? 'sluimerend' : status) as 'actief' | 'sluimerend',
        momentum,
        kompas,
        waaromNu: md.waaromNu,
        waarover: md.waarover,
        narratief: { ...prevBody.narratief, onsVerhaal: md.onsVerhaal },
      };

      await db.none(
        `UPDATE pa_dossiers SET
           naam = $1, onderwerp = $2, status = $3, momentum = $4, eigenaar = $5,
           kompas = $6, md = $7, body = $8, versie = $9, gepubliceerd = $10,
           updated_at = NOW()
         WHERE id = $11`,
        [
          naam,
          onderwerp,
          status,
          momentum,
          eigenaar,
          JSON.stringify(kompas),
          JSON.stringify(md),
          JSON.stringify(body),
          nextVersie,
          gepubliceerd,
          id,
        ]
      );
      await appendVersion(
        id,
        nextVersie,
        actor(req),
        b.gepubliceerd === true ? 'Bijgewerkt en gepubliceerd.' : 'Bijgewerkt.'
      );

      const row = await db.one<Record<string, unknown>>(
        `SELECT ${DOSSIER_COLS} FROM pa_dossiers WHERE id = $1`,
        [id]
      );
      res.json({ success: true, data: rowToAdminDossier(row, await loadVersions(id)) });
    } catch (err) {
      logger.error('Dossier update error', {
        id,
        error: err instanceof Error ? err.message : String(err),
      });
      res.status(500).json({ success: false, error: { code: 'DOSSIER_UPDATE_ERROR' } });
    }
  }
);

// ── POST /v1/pa/dossiers/:id/archive ────────────────────────────────
// Archiefwet archive (requires pa-admin). Captures classificatie + bewaartermijn
// + grondslag, sets status=gearchiveerd, unpublishes, bumps version.
router.post('/dossiers/:id/archive', requireRoles('pa-admin'), async (req, res) => {
  if (!req.user) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
  const { id } = req.params;
  const { classificatie, bewaartermijn, reden } = req.body as Partial<DossierArchief>;

  const CLASS = ['openbaar', 'intern', 'vertrouwelijk'];
  const TERM = ['V5', 'V10', 'V20', 'B'];
  if (
    !classificatie ||
    !CLASS.includes(classificatie) ||
    !bewaartermijn ||
    !TERM.includes(bewaartermijn) ||
    !reden ||
    !reden.trim()
  ) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_ARCHIVE_METADATA' } });
  }

  try {
    const existing = await db.oneOrNone<{ versie: number }>(
      `SELECT versie FROM pa_dossiers WHERE id = $1 AND tenant_id = $2`,
      [id, req.user.tenantId]
    );
    if (!existing) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND' } });

    const nextVersie = Number(existing.versie ?? 1) + 1;
    const archief: DossierArchief = {
      classificatie,
      bewaartermijn,
      reden: reden.trim(),
      at: new Date().toISOString(),
      by: actor(req),
    };

    await db.none(
      `UPDATE pa_dossiers SET
         status = 'gearchiveerd', gepubliceerd = false, archief = $1, versie = $2, updated_at = NOW()
       WHERE id = $3`,
      [JSON.stringify(archief), nextVersie, id]
    );
    await appendVersion(
      id,
      nextVersie,
      actor(req),
      `Gearchiveerd (Archiefwet) — classificatie ${classificatie}, bewaartermijn ${bewaartermijn}.`
    );

    const row = await db.one<Record<string, unknown>>(
      `SELECT ${DOSSIER_COLS} FROM pa_dossiers WHERE id = $1`,
      [id]
    );
    res.json({ success: true, data: rowToAdminDossier(row, await loadVersions(id)) });
  } catch (err) {
    logger.error('Dossier archive error', {
      id,
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ success: false, error: { code: 'DOSSIER_ARCHIVE_ERROR' } });
  }
});

// ── POST /v1/pa/dossiers/:id/unarchive ──────────────────────────────
// Explicit un-archive (requires pa-admin). Restores the dossier as a concept:
// status → actief (or sluimerend), clears the Archiefwet metadata, leaves it
// unpublished (must be re-published to return to the cockpit), bumps version.
router.post('/dossiers/:id/unarchive', requireRoles('pa-admin'), async (req, res) => {
  if (!req.user) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
  const { id } = req.params;
  const { status } = req.body as { status?: AdminDossierStatus };
  const restored: AdminDossierStatus = status === 'sluimerend' ? 'sluimerend' : 'actief';

  try {
    const existing = await db.oneOrNone<{ versie: number; status: string }>(
      `SELECT versie, status FROM pa_dossiers WHERE id = $1 AND tenant_id = $2`,
      [id, req.user.tenantId]
    );
    if (!existing) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND' } });
    if (existing.status !== 'gearchiveerd') {
      return res.status(400).json({ success: false, error: { code: 'NOT_ARCHIVED' } });
    }

    const nextVersie = Number(existing.versie ?? 1) + 1;
    await db.none(
      `UPDATE pa_dossiers SET
         status = $1, archief = NULL, gepubliceerd = false, versie = $2, updated_at = NOW()
       WHERE id = $3`,
      [restored, nextVersie, id]
    );
    await appendVersion(
      id,
      nextVersie,
      actor(req),
      `Gedearchiveerd — teruggezet naar concept (${restored}).`
    );

    const row = await db.one<Record<string, unknown>>(
      `SELECT ${DOSSIER_COLS} FROM pa_dossiers WHERE id = $1`,
      [id]
    );
    res.json({ success: true, data: rowToAdminDossier(row, await loadVersions(id)) });
  } catch (err) {
    logger.error('Dossier unarchive error', {
      id,
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ success: false, error: { code: 'DOSSIER_UNARCHIVE_ERROR' } });
  }
});

// ── DELETE /v1/pa/dossiers/:id ──────────────────────────────────────
// Hard delete incl. all versions (requires pa-admin).
router.delete('/dossiers/:id', requireRoles('pa-admin'), async (req, res) => {
  if (!req.user) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
  const { id } = req.params;
  try {
    const result = await db.result(`DELETE FROM pa_dossiers WHERE id = $1 AND tenant_id = $2`, [
      id,
      req.user.tenantId,
    ]);
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND' } });
    }
    await db.none(`DELETE FROM pa_dossier_versions WHERE dossier_id = $1`, [id]);
    res.json({ success: true });
  } catch (err) {
    logger.error('Dossier delete error', {
      id,
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ success: false, error: { code: 'DOSSIER_DELETE_ERROR' } });
  }
});

// ── GET/POST /v1/pa/templates ───────────────────────────────────────
router.get('/templates', async (_req, res) => {
  try {
    const rows = await db.any<Record<string, unknown>>(
      `SELECT id, naam, cat, beschrijving, versie, eigenaar, gebruikt, seed, status
       FROM pa_templates WHERE status = 'actief' ORDER BY gebruikt DESC, naam`
    );
    const data = rows.length
      ? rows.map((r) => ({
          id: r['id'],
          naam: r['naam'],
          cat: r['cat'],
          beschrijving: r['beschrijving'],
          versie: r['versie'],
          eigenaar: r['eigenaar'],
          gebruikt: Number(r['gebruikt'] ?? 0),
          seed: r['seed'],
        }))
      : DOSSIER_TEMPLATES;
    res.json({ success: true, data });
  } catch (err) {
    logger.error('Templates fetch error', {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ success: false, error: { code: 'TEMPLATES_ERROR' } });
  }
});

router.post('/templates', requireRoles('pa-editor', 'pa-admin'), async (req, res) => {
  const { naam, cat, beschrijving, versie, eigenaar, seed } = req.body as {
    naam?: string;
    cat?: string;
    beschrijving?: string;
    versie?: string;
    eigenaar?: string;
    seed?: unknown;
  };
  if (!naam || !naam.trim()) {
    return res.status(400).json({ success: false, error: { code: 'MISSING_NAAM' } });
  }
  try {
    const id = `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    await db.none(
      `INSERT INTO pa_templates (id, naam, cat, beschrijving, versie, eigenaar, gebruikt, seed, status)
       VALUES ($1,$2,$3,$4,$5,$6,0,$7,'actief')`,
      [
        id,
        naam.trim(),
        cat ?? '',
        beschrijving ?? '',
        versie ?? 'v1.0',
        eigenaar ?? actor(req),
        JSON.stringify(seed ?? {}),
      ]
    );
    res.status(201).json({ success: true, data: { id } });
  } catch (err) {
    logger.error('Template create error', {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ success: false, error: { code: 'TEMPLATE_CREATE_ERROR' } });
  }
});

// ── GET/POST /v1/pa/snippets ────────────────────────────────────────
router.get('/snippets', async (_req, res) => {
  try {
    const rows = await db.any<Record<string, unknown>>(
      `SELECT id, naam, cat, md FROM pa_snippets ORDER BY naam`
    );
    res.json({ success: true, data: rows.length ? rows : DOSSIER_SNIPPETS });
  } catch (err) {
    logger.error('Snippets fetch error', {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ success: false, error: { code: 'SNIPPETS_ERROR' } });
  }
});

router.post('/snippets', requireRoles('pa-editor', 'pa-admin'), async (req, res) => {
  const { naam, cat, md } = req.body as { naam?: string; cat?: string; md?: string };
  if (!naam || !naam.trim() || md === undefined) {
    return res.status(400).json({ success: false, error: { code: 'MISSING_FIELDS' } });
  }
  try {
    const id = `snip-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    await db.none(`INSERT INTO pa_snippets (id, naam, cat, md) VALUES ($1,$2,$3,$4)`, [
      id,
      naam.trim(),
      cat ?? '',
      md,
    ]);
    res.status(201).json({ success: true, data: { id } });
  } catch (err) {
    logger.error('Snippet create error', {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ success: false, error: { code: 'SNIPPET_CREATE_ERROR' } });
  }
});

export default router;
