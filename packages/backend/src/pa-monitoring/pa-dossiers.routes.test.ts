/**
 * Route-level tests for PA Dossierbeheer routes.
 * Verifies: auth gating (401/403), capability gating (pa-author/editor/admin),
 * validation, archive metadata capture, and version append-on-write.
 * jwtMiddleware is faked via x-test-roles; requireRoles is the real semantics.
 */

import type { Request, Response, NextFunction } from 'express';

jest.mock('@auth/jwt.middleware', () => ({
  jwtMiddleware: (req: Request, res: Response, next: NextFunction) => {
    // An authenticated request that carries no user: the shape each handler's own
    // `if (!req.user)` guard is written for, which jwtMiddleware never produces.
    if (req.headers['x-test-no-user']) return next();
    const header = req.headers['x-test-roles'] as string | undefined;
    if (!header) {
      return res.status(401).json({ success: false, error: { code: 'MISSING_TOKEN' } });
    }
    req.user = {
      userId: 'test-user',
      tenantId: 'flevoland',
      roles: header.split(',').map((r: string) => r.trim()),
      organisationType: 'province',
      assuranceLevel: 'substantieel',
      displayName: 'Test User',
      preferredUsername: 'test-user',
    };
    next();
  },
  requireRoles:
    (...required: string[]) =>
    (req: Request, res: Response, next: NextFunction) => {
      // Let the no-user probe through to the handler, whose own guard is the
      // subject of the test; the real requireRoles would stop it here.
      if (req.headers['x-test-no-user']) return next();
      const user = req.user;
      if (!user) {
        return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      }
      const has = required.some((r) => user.roles.includes(r));
      if (!has) {
        return res.status(403).json({ success: false, error: { code: 'FORBIDDEN' } });
      }
      next();
    },
}));

jest.mock('@middleware/tenant.middleware', () => ({
  tenantMiddleware: (_req: Request, _res: Response, next: NextFunction) => next(),
}));

const mockDb = {
  any: jest.fn(),
  one: jest.fn(),
  oneOrNone: jest.fn(),
  none: jest.fn(),
  result: jest.fn(),
  tx: jest.fn(),
};
// The transaction context exposes the same query methods as db itself —
// reuse mockDb so existing mockDb.result/none setups work unchanged inside
// a db.tx(...) callback. Assigned after the literal (not inline) so TS can
// type mockDb itself without a self-referential initializer.
mockDb.tx.mockImplementation((cb: (t: typeof mockDb) => unknown) => cb(mockDb));
jest.mock('@services/audit.service', () => ({ db: mockDb }));

const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
jest.mock('@utils/logger', () => ({ createLogger: () => mockLogger }));

import express from 'express';
import request from 'supertest';
import router, { dossierCaps } from './pa-dossiers.routes';

const app = express();
app.use(express.json());
app.use('/v1/pa', router);

const ANON = {};
const NON_PA = { 'x-test-roles': 'caseworker' };
const PA = { 'x-test-roles': 'public-affairs' };
const AUTHOR = { 'x-test-roles': 'public-affairs,pa-author' };
const EDITOR = { 'x-test-roles': 'public-affairs,pa-editor' };
const ADMIN = { 'x-test-roles': 'public-affairs,pa-admin' };

function adminRow(over: Record<string, unknown> = {}) {
  return {
    id: 'stikstof',
    tenant_id: 'flevoland',
    naam: 'Stikstof & landbouwtransitie',
    onderwerp: 'Gebiedsgerichte aanpak',
    status: 'actief',
    momentum: 'up',
    eigenaar: 'Sanne Bakker',
    kompas: { opgaven: { score: 2, duiding: '' } },
    md: { waaromNu: '## Waarom nu', waarover: '', onsVerhaal: '' },
    body: { id: 'stikstof', naam: 'Stikstof & landbouwtransitie', ritme: { lobby: [] } },
    versie: 3,
    gepubliceerd: true,
    sjabloon: 'standaard',
    archief: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...over,
  };
}

describe('dossierCaps', () => {
  it('maps roles to capabilities', () => {
    expect(dossierCaps([])).toEqual({
      create: false,
      edit: false,
      template: false,
      publish: false,
      archive: false,
      del: false,
    });
    expect(dossierCaps(['pa-author'])).toMatchObject({ create: true, edit: true, publish: false });
    expect(dossierCaps(['pa-editor'])).toMatchObject({ publish: true, template: true, del: false });
    expect(dossierCaps(['pa-admin'])).toMatchObject({ archive: true, del: true, publish: true });
  });
});

describe('GET /v1/pa/dossiers', () => {
  beforeEach(() => jest.clearAllMocks());

  it('anonymous → 401', async () => {
    const res = await request(app).get('/v1/pa/dossiers').set(ANON);
    expect(res.status).toBe(401);
  });

  it('non-PA role → 403', async () => {
    const res = await request(app).get('/v1/pa/dossiers').set(NON_PA);
    expect(res.status).toBe(403);
  });

  it('public-affairs → 200 cockpit view (published, non-archived)', async () => {
    mockDb.any.mockResolvedValue([adminRow()]);
    const res = await request(app).get('/v1/pa/dossiers').set(PA);
    expect(res.status).toBe(200);
    expect(res.body.data[0].id).toBe('stikstof');
    // cockpit query must exclude archived + unpublished
    const [sql] = mockDb.any.mock.calls[0];
    expect(sql).toMatch(/status <> 'gearchiveerd'/);
    expect(sql).toMatch(/gepubliceerd = true/);
  });

  it('cockpit view completes a partial Kompas to all 8 criteria (no undefined crashes)', async () => {
    // adminRow() carries only { opgaven } — the Issuekaart scorecard indexes all 8.
    mockDb.any.mockResolvedValue([adminRow()]);
    const res = await request(app).get('/v1/pa/dossiers').set(PA);
    expect(res.status).toBe(200);
    const kompas = res.body.data[0].kompas;
    expect(Object.keys(kompas).sort()).toEqual(
      [
        'coalitie',
        'momentum',
        'opbrengst',
        'opgaven',
        'reputatie',
        'risico',
        'synergie',
        'uitvoering',
      ].sort()
    );
    // scored criterion preserved; missing ones default to score 0
    expect(kompas.opgaven.score).toBe(2);
    expect(kompas.risico.score).toBe(0);
  });

  it('?admin=1 → 200 management view with versies', async () => {
    mockDb.any
      .mockResolvedValueOnce([adminRow()]) // rows
      .mockResolvedValueOnce([{ v: 1, at: '2026-05-12', by: 'x', note: 'n' }]); // versions
    const res = await request(app).get('/v1/pa/dossiers?admin=1').set(PA);
    expect(res.status).toBe(200);
    expect(res.body.data[0].versie).toBe(3);
    expect(res.body.data[0].versies).toHaveLength(1);
    expect(res.body.data[0].md.waaromNu).toBe('## Waarom nu');
  });

  it('500s on a DB error', async () => {
    mockDb.any.mockRejectedValue(new Error('boom'));
    const res = await request(app).get('/v1/pa/dossiers').set(PA);
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('DOSSIERS_ERROR');
  });
});

describe('GET /v1/pa/dossiers/:id', () => {
  beforeEach(() => jest.clearAllMocks());

  it('anonymous → 401', async () => {
    const res = await request(app).get('/v1/pa/dossiers/stikstof').set(ANON);
    expect(res.status).toBe(401);
  });

  it('unknown id → 404', async () => {
    mockDb.oneOrNone.mockResolvedValue(null);
    const res = await request(app).get('/v1/pa/dossiers/unknown').set(PA);
    expect(res.status).toBe(404);
  });

  it('public-affairs → 200 cockpit shape (no versies)', async () => {
    mockDb.oneOrNone.mockResolvedValue(adminRow());
    const res = await request(app).get('/v1/pa/dossiers/stikstof').set(PA);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('stikstof');
    expect(res.body.data.versies).toBeUndefined();
  });

  it('?admin=1 → 200 management shape with versies', async () => {
    mockDb.oneOrNone.mockResolvedValue(adminRow());
    mockDb.any.mockResolvedValue([{ v: 1, at: '2026-05-12', by: 'x', note: 'n' }]);
    const res = await request(app).get('/v1/pa/dossiers/stikstof?admin=1').set(PA);
    expect(res.status).toBe(200);
    expect(res.body.data.versies).toHaveLength(1);
  });

  it('500s on a DB error', async () => {
    mockDb.oneOrNone.mockRejectedValue(new Error('boom'));
    const res = await request(app).get('/v1/pa/dossiers/stikstof').set(PA);
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('DOSSIER_ERROR');
  });
});

describe('POST /v1/pa/dossiers (create)', () => {
  beforeEach(() => jest.clearAllMocks());
  const valid = { naam: 'Nieuw dossier', onderwerp: 'Iets', momentum: 'flat' };

  it('anonymous → 401', async () => {
    const res = await request(app).post('/v1/pa/dossiers').set(ANON).send(valid);
    expect(res.status).toBe(401);
  });

  it('public-affairs without pa-author → 403', async () => {
    const res = await request(app).post('/v1/pa/dossiers').set(PA).send(valid);
    expect(res.status).toBe(403);
  });

  it('author, invalid (naam too short) → 400', async () => {
    const res = await request(app)
      .post('/v1/pa/dossiers')
      .set(AUTHOR)
      .send({ naam: 'ab', onderwerp: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_FIELDS');
  });

  it('author publishing → 403 FORBIDDEN_PUBLISH', async () => {
    const res = await request(app)
      .post('/v1/pa/dossiers')
      .set(AUTHOR)
      .send({ ...valid, gepubliceerd: true });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN_PUBLISH');
  });

  it('author, valid → 201 and appends version v1', async () => {
    mockDb.oneOrNone.mockResolvedValue(null); // no id conflict
    mockDb.none.mockResolvedValue(undefined);
    mockDb.one.mockResolvedValue(
      adminRow({ id: 'nieuw-dossier', naam: 'Nieuw dossier', versie: 1 })
    );
    mockDb.any.mockResolvedValue([
      { v: 1, at: '2026-07-08', by: 'Test User', note: 'Aangemaakt.' },
    ]);
    const res = await request(app).post('/v1/pa/dossiers').set(AUTHOR).send(valid);
    expect(res.status).toBe(201);
    expect(res.body.data.versie).toBe(1);
    const versionInsert = mockDb.none.mock.calls.find((c) =>
      /INSERT INTO pa_dossier_versions/.test(c[0] as string)
    );
    expect(versionInsert).toBeTruthy();
    expect(versionInsert?.[1]).toEqual(['nieuw-dossier', 1, 'Test User', 'Aangemaakt.']);
  });

  it('editor may publish on create → 201', async () => {
    mockDb.oneOrNone.mockResolvedValue(null);
    mockDb.none.mockResolvedValue(undefined);
    mockDb.one.mockResolvedValue(adminRow({ id: 'nieuw-dossier', gepubliceerd: true, versie: 1 }));
    mockDb.any.mockResolvedValue([]);
    const res = await request(app)
      .post('/v1/pa/dossiers')
      .set(EDITOR)
      .send({ ...valid, gepubliceerd: true });
    expect(res.status).toBe(201);
  });

  it('500s on a DB error', async () => {
    mockDb.oneOrNone.mockRejectedValue(new Error('boom'));
    const res = await request(app).post('/v1/pa/dossiers').set(AUTHOR).send(valid);
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('DOSSIER_CREATE_ERROR');
  });
});

describe('PATCH /v1/pa/dossiers/:id (edit)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('non-author → 403', async () => {
    const res = await request(app).patch('/v1/pa/dossiers/stikstof').set(PA).send({ naam: 'X yz' });
    expect(res.status).toBe(403);
  });

  it('unknown id → 404', async () => {
    mockDb.oneOrNone.mockResolvedValue(null);
    const res = await request(app)
      .patch('/v1/pa/dossiers/unknown')
      .set(AUTHOR)
      .send({ naam: 'Iets nieuws' });
    expect(res.status).toBe(404);
  });

  it('author publishing (false → true) → 403 FORBIDDEN_PUBLISH', async () => {
    mockDb.oneOrNone.mockResolvedValue(adminRow({ gepubliceerd: false }));
    const res = await request(app)
      .patch('/v1/pa/dossiers/stikstof')
      .set(AUTHOR)
      .send({ gepubliceerd: true });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN_PUBLISH');
    expect(mockDb.none).not.toHaveBeenCalled();
  });

  it('author unpublishing (true → false) → 403 FORBIDDEN_PUBLISH', async () => {
    mockDb.oneOrNone.mockResolvedValue(adminRow({ gepubliceerd: true }));
    const res = await request(app)
      .patch('/v1/pa/dossiers/stikstof')
      .set(AUTHOR)
      .send({ gepubliceerd: false });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN_PUBLISH');
    expect(mockDb.none).not.toHaveBeenCalled();
  });

  it('author resending the current gepubliceerd value (no-op) → not gated', async () => {
    mockDb.oneOrNone.mockResolvedValue(adminRow({ versie: 3, gepubliceerd: true }));
    mockDb.none.mockResolvedValue(undefined);
    mockDb.one.mockResolvedValue(adminRow({ versie: 4, gepubliceerd: true }));
    mockDb.any.mockResolvedValue([]);
    const res = await request(app)
      .patch('/v1/pa/dossiers/stikstof')
      .set(AUTHOR)
      .send({ gepubliceerd: true });
    expect(res.status).toBe(200);
  });

  it('author archiving via status:gearchiveerd → 403 FORBIDDEN_ARCHIVE', async () => {
    mockDb.oneOrNone.mockResolvedValue(adminRow({ status: 'actief' }));
    const res = await request(app)
      .patch('/v1/pa/dossiers/stikstof')
      .set(AUTHOR)
      .send({ status: 'gearchiveerd' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN_ARCHIVE');
    expect(mockDb.none).not.toHaveBeenCalled();
  });

  it('editor archiving via status:gearchiveerd → 403 FORBIDDEN_ARCHIVE (archive is admin-only)', async () => {
    mockDb.oneOrNone.mockResolvedValue(adminRow({ status: 'actief' }));
    const res = await request(app)
      .patch('/v1/pa/dossiers/stikstof')
      .set(EDITOR)
      .send({ status: 'gearchiveerd' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN_ARCHIVE');
  });

  it('unrecognized status value → 400 INVALID_STATUS', async () => {
    const res = await request(app)
      .patch('/v1/pa/dossiers/stikstof')
      .set(AUTHOR)
      .send({ status: 'weggegooid' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_STATUS');
    expect(mockDb.oneOrNone).not.toHaveBeenCalled();
  });

  it('author edit → 200, bumps versie and appends a version', async () => {
    mockDb.oneOrNone.mockResolvedValue(adminRow({ versie: 3 }));
    mockDb.none.mockResolvedValue(undefined);
    mockDb.one.mockResolvedValue(adminRow({ versie: 4 }));
    mockDb.any.mockResolvedValue([]);
    const res = await request(app)
      .patch('/v1/pa/dossiers/stikstof')
      .set(AUTHOR)
      .send({ onderwerp: 'Aangepast onderwerp' });
    expect(res.status).toBe(200);
    expect(res.body.data.versie).toBe(4);
    const versionInsert = mockDb.none.mock.calls.find((c) =>
      /INSERT INTO pa_dossier_versions/.test(c[0] as string)
    );
    expect(versionInsert?.[1]?.[1]).toBe(4); // v = 4
    // UPDATE must bump versie to 4
    const updateCall = mockDb.none.mock.calls.find((c) =>
      /UPDATE pa_dossiers SET/.test(c[0] as string)
    );
    expect(updateCall).toBeTruthy();
  });

  it('editing an archived dossier → 409 ARCHIVED_READONLY (no silent un-archive)', async () => {
    mockDb.oneOrNone.mockResolvedValue(adminRow({ status: 'gearchiveerd' }));
    const res = await request(app)
      .patch('/v1/pa/dossiers/omgevingswet-2023')
      .set(ADMIN)
      .send({ status: 'actief' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ARCHIVED_READONLY');
    expect(mockDb.none).not.toHaveBeenCalled();
  });

  it('naam too short → 400 INVALID_FIELDS', async () => {
    mockDb.oneOrNone.mockResolvedValue(adminRow());
    const res = await request(app)
      .patch('/v1/pa/dossiers/stikstof')
      .set(AUTHOR)
      .send({ naam: 'ab' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_FIELDS');
    expect(mockDb.none).not.toHaveBeenCalled();
  });

  it('empty onderwerp → 400 INVALID_FIELDS', async () => {
    mockDb.oneOrNone.mockResolvedValue(adminRow());
    const res = await request(app)
      .patch('/v1/pa/dossiers/stikstof')
      .set(AUTHOR)
      .send({ onderwerp: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_FIELDS');
  });

  it('500s on a DB error', async () => {
    mockDb.oneOrNone.mockResolvedValue(adminRow());
    mockDb.none.mockRejectedValue(new Error('boom'));
    const res = await request(app)
      .patch('/v1/pa/dossiers/stikstof')
      .set(AUTHOR)
      .send({ onderwerp: 'Aangepast onderwerp' });
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('DOSSIER_UPDATE_ERROR');
  });
});

describe('POST /v1/pa/dossiers/:id/watch', () => {
  beforeEach(() => jest.clearAllMocks());

  it('anonymous → 401', async () => {
    const res = await request(app).post('/v1/pa/dossiers/stikstof/watch').send({});
    expect(res.status).toBe(401);
  });

  it('no watch-everything row exists yet → creates one, notify=true → 201', async () => {
    mockDb.oneOrNone.mockResolvedValue(null);
    mockDb.none.mockResolvedValue(undefined);
    const res = await request(app).post('/v1/pa/dossiers/stikstof/watch').set(PA).send({});
    expect(res.status).toBe(201);
    expect(typeof res.body.data.id).toBe('string');

    const [sql, values] = mockDb.none.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO pa_saved_searches/);
    expect(values).toEqual([
      res.body.data.id,
      'flevoland',
      'test-user',
      'stikstof',
      // types/source must be present (even empty) — a bare { q: '' } left
      // SavedSearch.query.source undefined and crashed ZoekcriteriaSection's
      // zcBestCase(), which calls sources.includes() unconditionally.
      JSON.stringify({ q: '', types: [], source: [] }),
      [],
    ]);
  });

  it('a watch-everything row already exists → re-enables it in place → 200', async () => {
    mockDb.oneOrNone.mockResolvedValue({ id: 'watch-existing' });
    mockDb.none.mockResolvedValue(undefined);
    const res = await request(app).post('/v1/pa/dossiers/stikstof/watch').set(PA).send({});
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('watch-existing');
    const [sql, values] = mockDb.none.mock.calls[0];
    expect(sql).toMatch(/SET notify = true/);
    expect(values).toEqual(['watch-existing']);
  });

  it("only matches the caller's own empty-query watch row, not a topic search on the same dossier", async () => {
    mockDb.oneOrNone.mockResolvedValue(null);
    mockDb.none.mockResolvedValue(undefined);
    await request(app).post('/v1/pa/dossiers/stikstof/watch').set(PA).send({});
    const [sql, params] = mockDb.oneOrNone.mock.calls[0];
    expect(sql).toMatch(/scope = 'user'/);
    expect(sql).toMatch(/query->>'q' = ''/);
    expect(params).toEqual(['flevoland', 'test-user', 'stikstof']);
  });

  it('recomputes notifications immediately, so an already-confirmed backlog for this dossier surfaces on activation rather than waiting for an unrelated later trigger', async () => {
    mockDb.oneOrNone.mockResolvedValueOnce(null); // no existing watch-everything row
    mockDb.none.mockResolvedValue(undefined);
    // computeNotifications' own two db.any calls: active watches, then confirmed signals.
    mockDb.any
      .mockResolvedValueOnce([
        { id: 'w1', user_id: 'test-user', dossier_id: 'stikstof', query: { q: '' } },
      ])
      .mockResolvedValueOnce([
        {
          id: 'sig-old',
          dossier_id: 'stikstof',
          title: 'Ouder, al bevestigd signaal',
          duiding: null,
        },
      ]);
    mockDb.result.mockResolvedValue({ rowCount: 1 });

    const res = await request(app).post('/v1/pa/dossiers/stikstof/watch').set(PA).send({});
    expect(res.status).toBe(201);
    expect(mockDb.result).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO pa_notifications'),
      expect.arrayContaining(['flevoland', 'test-user', 'sig-old'])
    );
  });

  it('500s on a DB error', async () => {
    mockDb.oneOrNone.mockRejectedValue(new Error('boom'));
    const res = await request(app).post('/v1/pa/dossiers/stikstof/watch').set(PA).send({});
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('DOSSIER_WATCH_ERROR');
  });
});

describe('DELETE /v1/pa/dossiers/:id/watch', () => {
  beforeEach(() => jest.clearAllMocks());

  it('anonymous → 401', async () => {
    const res = await request(app).delete('/v1/pa/dossiers/stikstof/watch');
    expect(res.status).toBe(401);
  });

  it("public-affairs role → 200, deletes only the caller's own watch-everything row", async () => {
    mockDb.none.mockResolvedValue(undefined);
    const res = await request(app).delete('/v1/pa/dossiers/stikstof/watch').set(PA);
    expect(res.status).toBe(200);
    const [sql, values] = mockDb.none.mock.calls[0];
    expect(sql).toMatch(/DELETE FROM pa_saved_searches/);
    expect(sql).toMatch(/scope = 'user'/);
    expect(values).toEqual(['flevoland', 'test-user', 'stikstof']);
  });

  it('500s on a DB error', async () => {
    mockDb.none.mockRejectedValue(new Error('boom'));
    const res = await request(app).delete('/v1/pa/dossiers/stikstof/watch').set(PA);
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('DOSSIER_WATCH_DELETE_ERROR');
  });
});

describe('POST /v1/pa/dossiers/:id/archive', () => {
  beforeEach(() => jest.clearAllMocks());
  const meta = { classificatie: 'intern', bewaartermijn: 'V10', reden: 'Traject afgerond' };

  it('non-admin (editor) → 403', async () => {
    const res = await request(app).post('/v1/pa/dossiers/stikstof/archive').set(EDITOR).send(meta);
    expect(res.status).toBe(403);
  });

  it('admin, missing reden → 400', async () => {
    const res = await request(app)
      .post('/v1/pa/dossiers/stikstof/archive')
      .set(ADMIN)
      .send({ classificatie: 'intern', bewaartermijn: 'V10' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_ARCHIVE_METADATA');
  });

  it('admin, bad classificatie → 400', async () => {
    const res = await request(app)
      .post('/v1/pa/dossiers/stikstof/archive')
      .set(ADMIN)
      .send({ ...meta, classificatie: 'geheim' });
    expect(res.status).toBe(400);
  });

  it('admin, non-string reden → 400 INVALID_ARCHIVE_METADATA (not a 500/hang from reden.trim())', async () => {
    const res = await request(app)
      .post('/v1/pa/dossiers/stikstof/archive')
      .set(ADMIN)
      .send({ ...meta, reden: 123 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_ARCHIVE_METADATA');
  });

  it('admin, unknown id → 404', async () => {
    mockDb.oneOrNone.mockResolvedValue(null);
    const res = await request(app).post('/v1/pa/dossiers/unknown/archive').set(ADMIN).send(meta);
    expect(res.status).toBe(404);
  });

  it('admin → 200, captures archief metadata and appends version', async () => {
    mockDb.oneOrNone.mockResolvedValue({ versie: 3 });
    mockDb.none.mockResolvedValue(undefined);
    mockDb.one.mockResolvedValue(
      adminRow({
        status: 'gearchiveerd',
        gepubliceerd: false,
        versie: 4,
        archief: {
          classificatie: 'intern',
          bewaartermijn: 'V10',
          reden: 'Traject afgerond',
          at: 'x',
          by: 'Test User',
        },
      })
    );
    mockDb.any.mockResolvedValue([]);
    const res = await request(app).post('/v1/pa/dossiers/stikstof/archive').set(ADMIN).send(meta);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('gearchiveerd');
    expect(res.body.data.archief.reden).toBe('Traject afgerond');
    // UPDATE stores archief JSON with the captured metadata
    const updateCall = mockDb.none.mock.calls.find((c) =>
      /status = 'gearchiveerd'/.test(c[0] as string)
    );
    expect(updateCall).toBeTruthy();
    const updateValues = updateCall![1] as unknown[];
    const archiefJson = JSON.parse(updateValues[0] as string);
    expect(archiefJson).toMatchObject({ classificatie: 'intern', bewaartermijn: 'V10' });
    expect(archiefJson.by).toBe('Test User');
    // version appended
    const versionInsert = mockDb.none.mock.calls.find((c) =>
      /INSERT INTO pa_dossier_versions/.test(c[0] as string)
    );
    expect(versionInsert?.[1]?.[1]).toBe(4);
  });

  it('500s on a DB error', async () => {
    mockDb.oneOrNone.mockRejectedValue(new Error('boom'));
    const res = await request(app).post('/v1/pa/dossiers/stikstof/archive').set(ADMIN).send(meta);
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('DOSSIER_ARCHIVE_ERROR');
  });
});

describe('POST /v1/pa/dossiers/:id/unarchive', () => {
  beforeEach(() => jest.clearAllMocks());

  it('non-admin (editor) → 403', async () => {
    const res = await request(app).post('/v1/pa/dossiers/omgevingswet-2023/unarchive').set(EDITOR);
    expect(res.status).toBe(403);
  });

  it('admin, unknown id → 404', async () => {
    mockDb.oneOrNone.mockResolvedValue(null);
    const res = await request(app).post('/v1/pa/dossiers/unknown/unarchive').set(ADMIN);
    expect(res.status).toBe(404);
  });

  it('admin, dossier not archived → 400 NOT_ARCHIVED', async () => {
    mockDb.oneOrNone.mockResolvedValue({ versie: 3, status: 'actief' });
    const res = await request(app).post('/v1/pa/dossiers/stikstof/unarchive').set(ADMIN);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('NOT_ARCHIVED');
    expect(mockDb.none).not.toHaveBeenCalled();
  });

  it('admin → 200, restores to concept, clears archief, appends version', async () => {
    mockDb.oneOrNone.mockResolvedValue({ versie: 7, status: 'gearchiveerd' });
    mockDb.none.mockResolvedValue(undefined);
    mockDb.one.mockResolvedValue(
      adminRow({ status: 'actief', gepubliceerd: false, versie: 8, archief: null })
    );
    mockDb.any.mockResolvedValue([]);
    const res = await request(app).post('/v1/pa/dossiers/omgevingswet-2023/unarchive').set(ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('actief');
    expect(res.body.data.archief).toBeNull();
    // UPDATE clears archief + unpublishes
    const updateCall = mockDb.none.mock.calls.find((c) =>
      /UPDATE pa_dossiers SET/.test(c[0] as string)
    );
    expect(updateCall![0]).toMatch(/archief = NULL/);
    expect(updateCall![0]).toMatch(/gepubliceerd = false/);
    // version appended at v8
    const versionInsert = mockDb.none.mock.calls.find((c) =>
      /INSERT INTO pa_dossier_versions/.test(c[0] as string)
    );
    expect(versionInsert?.[1]?.[1]).toBe(8);
  });

  it('admin can restore to sluimerend when requested', async () => {
    mockDb.oneOrNone.mockResolvedValue({ versie: 7, status: 'gearchiveerd' });
    mockDb.none.mockResolvedValue(undefined);
    mockDb.one.mockResolvedValue(adminRow({ status: 'sluimerend', versie: 8, archief: null }));
    mockDb.any.mockResolvedValue([]);
    const res = await request(app)
      .post('/v1/pa/dossiers/omgevingswet-2023/unarchive')
      .set(ADMIN)
      .send({ status: 'sluimerend' });
    expect(res.status).toBe(200);
    const updateCall = mockDb.none.mock.calls.find((c) =>
      /UPDATE pa_dossiers SET/.test(c[0] as string)
    );
    expect((updateCall![1] as unknown[])[0]).toBe('sluimerend');
  });

  it('500s on a DB error', async () => {
    mockDb.oneOrNone.mockRejectedValue(new Error('boom'));
    const res = await request(app).post('/v1/pa/dossiers/omgevingswet-2023/unarchive').set(ADMIN);
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('DOSSIER_UNARCHIVE_ERROR');
  });
});

describe('DELETE /v1/pa/dossiers/:id', () => {
  beforeEach(() => jest.clearAllMocks());

  it('non-admin (editor) → 403', async () => {
    const res = await request(app).delete('/v1/pa/dossiers/stikstof').set(EDITOR);
    expect(res.status).toBe(403);
  });

  it('admin, unknown id → 404', async () => {
    mockDb.result.mockResolvedValue({ rowCount: 0 });
    const res = await request(app).delete('/v1/pa/dossiers/unknown').set(ADMIN);
    expect(res.status).toBe(404);
  });

  it('admin → 200, deletes row and its versions inside a transaction', async () => {
    mockDb.result.mockResolvedValue({ rowCount: 1 });
    mockDb.none.mockResolvedValue(undefined);
    const res = await request(app).delete('/v1/pa/dossiers/stikstof').set(ADMIN);
    expect(res.status).toBe(200);
    expect(mockDb.tx).toHaveBeenCalled();
    const versionDelete = mockDb.none.mock.calls.find((c) =>
      /DELETE FROM pa_dossier_versions/.test(c[0] as string)
    );
    expect(versionDelete?.[1]).toEqual(['stikstof']);
  });

  it('versions delete failing mid-transaction → 500 (not a partial delete leaving orphaned versions)', async () => {
    mockDb.result.mockResolvedValue({ rowCount: 1 });
    mockDb.none.mockRejectedValue(new Error('versions delete failed'));
    const res = await request(app).delete('/v1/pa/dossiers/stikstof').set(ADMIN);
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('DOSSIER_DELETE_ERROR');
  });
});

describe('templates + snippets', () => {
  beforeEach(() => jest.clearAllMocks());

  it('GET /templates → 200 (falls back to built-ins when table empty)', async () => {
    mockDb.any.mockResolvedValue([]);
    const res = await request(app).get('/v1/pa/templates').set(PA);
    expect(res.status).toBe(200);
    expect(res.body.data.some((t: { id: string }) => t.id === 'standaard')).toBe(true);
  });

  it('GET /templates → 200 mapping real DB rows (not the built-in fallback)', async () => {
    mockDb.any.mockResolvedValue([
      {
        id: 'tpl-live-1',
        naam: 'Live sjabloon',
        cat: 'Provincie',
        beschrijving: 'Uit de database',
        versie: 'v1',
        eigenaar: 'Test User',
        gebruikt: '3',
        seed: { onderwerp: '', waaromNu: '', waarover: '', onsVerhaal: '' },
      },
    ]);
    const res = await request(app).get('/v1/pa/templates').set(PA);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      {
        id: 'tpl-live-1',
        naam: 'Live sjabloon',
        cat: 'Provincie',
        beschrijving: 'Uit de database',
        versie: 'v1',
        eigenaar: 'Test User',
        gebruikt: 3,
        seed: { onderwerp: '', waaromNu: '', waarover: '', onsVerhaal: '' },
      },
    ]);
  });

  it('GET /templates → 500 on a DB error', async () => {
    mockDb.any.mockRejectedValue(new Error('boom'));
    const res = await request(app).get('/v1/pa/templates').set(PA);
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('TEMPLATES_ERROR');
  });

  it('POST /templates without editor → 403', async () => {
    const res = await request(app).post('/v1/pa/templates').set(AUTHOR).send({ naam: 'X' });
    expect(res.status).toBe(403);
  });

  it('POST /templates, missing naam → 400 MISSING_NAAM', async () => {
    const res = await request(app).post('/v1/pa/templates').set(EDITOR).send({ naam: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MISSING_NAAM');
    expect(mockDb.none).not.toHaveBeenCalled();
  });

  it('POST /templates as editor → 201', async () => {
    mockDb.none.mockResolvedValue(undefined);
    const res = await request(app)
      .post('/v1/pa/templates')
      .set(EDITOR)
      .send({ naam: 'Nieuw sjabloon' });
    expect(res.status).toBe(201);
    expect(res.body.data.id).toMatch(/^tpl-/);
  });

  it('POST /templates → 500 on a DB error', async () => {
    mockDb.none.mockRejectedValue(new Error('boom'));
    const res = await request(app)
      .post('/v1/pa/templates')
      .set(EDITOR)
      .send({ naam: 'Nieuw sjabloon' });
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('TEMPLATE_CREATE_ERROR');
  });

  it('GET /snippets → 200', async () => {
    mockDb.any.mockResolvedValue([]);
    const res = await request(app).get('/v1/pa/snippets').set(PA);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('GET /snippets → 500 on a DB error', async () => {
    mockDb.any.mockRejectedValue(new Error('boom'));
    const res = await request(app).get('/v1/pa/snippets').set(PA);
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('SNIPPETS_ERROR');
  });

  it('POST /snippets, missing naam → 400 MISSING_FIELDS', async () => {
    const res = await request(app)
      .post('/v1/pa/snippets')
      .set(EDITOR)
      .send({ naam: '  ', md: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MISSING_FIELDS');
    expect(mockDb.none).not.toHaveBeenCalled();
  });

  it('POST /snippets, missing md → 400 MISSING_FIELDS', async () => {
    const res = await request(app).post('/v1/pa/snippets').set(EDITOR).send({ naam: 'Blok' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MISSING_FIELDS');
  });

  it('POST /snippets as editor → 201', async () => {
    mockDb.none.mockResolvedValue(undefined);
    const res = await request(app)
      .post('/v1/pa/snippets')
      .set(EDITOR)
      .send({ naam: 'Blok', md: '- item' });
    expect(res.status).toBe(201);
    expect(res.body.data.id).toMatch(/^snip-/);
  });

  it('POST /snippets → 500 on a DB error', async () => {
    mockDb.none.mockRejectedValue(new Error('boom'));
    const res = await request(app)
      .post('/v1/pa/snippets')
      .set(EDITOR)
      .send({ naam: 'Blok', md: '- item' });
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('SNIPPET_CREATE_ERROR');
  });
});

describe('handler guards for an authenticated request without a user', () => {
  // jwtMiddleware always attaches req.user or rejects, so these guards are
  // defensive; they still have to answer 401 rather than crash on req.user.x.
  const NO_USER = { 'x-test-no-user': '1' };

  it.each([
    ['get', '/v1/pa/dossiers'],
    ['get', '/v1/pa/dossiers/d-1'],
    ['post', '/v1/pa/dossiers/d-1/watch'],
    ['delete', '/v1/pa/dossiers/d-1/watch'],
    ['post', '/v1/pa/dossiers'],
    ['patch', '/v1/pa/dossiers/d-1'],
    ['post', '/v1/pa/dossiers/d-1/archive'],
    ['post', '/v1/pa/dossiers/d-1/unarchive'],
    ['delete', '/v1/pa/dossiers/d-1'],
  ] as const)('%s %s -> 401 UNAUTHORIZED', async (method, path) => {
    const res = await request(app)[method](path).set(NO_USER).send({});
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
});

describe('failures that are not Error instances', () => {
  // pg can reject with a bare string on a connection-level failure; each catch
  // has a String(err) fallback so the log line still says something.
  const VALID_DOSSIER = { naam: 'Nieuw dossier', onderwerp: 'Onderwerp' };

  it.each([
    ['get', '/v1/pa/dossiers', PA, {}],
    ['get', '/v1/pa/dossiers/d-1', PA, {}],
    ['post', '/v1/pa/dossiers/d-1/watch', PA, {}],
    ['delete', '/v1/pa/dossiers/d-1/watch', PA, {}],
    ['post', '/v1/pa/dossiers', AUTHOR, VALID_DOSSIER],
    ['patch', '/v1/pa/dossiers/d-1', AUTHOR, { naam: 'Gewijzigd' }],
    ['post', '/v1/pa/dossiers/d-1/archive', ADMIN, { reden: 'afgerond' }],
    ['post', '/v1/pa/dossiers/d-1/unarchive', ADMIN, {}],
    ['delete', '/v1/pa/dossiers/d-1', ADMIN, {}],
    ['get', '/v1/pa/templates', PA, {}],
    ['post', '/v1/pa/templates', EDITOR, { naam: 'Sjabloon' }],
    ['get', '/v1/pa/snippets', PA, {}],
    ['post', '/v1/pa/snippets', EDITOR, { naam: 'Snippet', md: '# md' }],
  ] as const)('%s %s answers 5xx rather than hanging', async (method, path, roles, body) => {
    for (const fn of ['any', 'one', 'oneOrNone', 'none', 'result', 'tx'] as const) {
      mockDb[fn].mockRejectedValue('connection terminated');
    }
    const res = await request(app)[method](path).set(roles).send(body);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(mockLogger.error).toHaveBeenCalled();
  });
});
