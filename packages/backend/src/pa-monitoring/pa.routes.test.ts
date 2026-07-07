/**
 * Route-level auth tests for PA Monitoring routes.
 * Verifies: anonymous → 401, authenticated non-PA → 403, public-affairs → 200/404.
 * jwtMiddleware is faked via x-test-roles header; requireRoles is the real implementation.
 */

// --- mocks must be hoisted above imports ---
// import type is erased at compile time, so it is safe to reference here before the hoisted mocks
import type { Request, Response, NextFunction } from 'express';

jest.mock('@auth/jwt.middleware', () => ({
  jwtMiddleware: (req: Request, res: Response, next: NextFunction) => {
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
};
jest.mock('@services/audit.service', () => ({ db: mockDb }));

jest.mock('@utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

jest.mock('./sources/tk.client', () => ({ fetchTkFeed: jest.fn(), TK_DOCUMENT_TYPES: [] }));
jest.mock('./sources/ob.client', () => ({ fetchObFeed: jest.fn(), OB_PUBLICATION_TYPES: [] }));
const mockPromoteToInbox = jest.fn();
jest.mock('./curation.service', () => ({
  runCurationCycle: jest.fn(),
  promoteToInbox: mockPromoteToInbox,
}));
jest.mock('./sources/agenda.client', () => ({ fetchAgenda: jest.fn() }));
jest.mock('@utils/config', () => ({
  config: {
    pa: {
      euSourceEnabled: true,
      epTextsSubmittedEnabled: true,
      mediaSourceEnabled: false,
    },
  },
}));

// --- imports after mocks ---

import express from 'express';
import request from 'supertest';
import router from './pa.routes';
import { fetchTkFeed } from './sources/tk.client';
import { fetchObFeed } from './sources/ob.client';
import { fetchAgenda } from './sources/agenda.client';
import { runCurationCycle } from './curation.service';

const mockTk = fetchTkFeed as jest.Mock;
const mockOb = fetchObFeed as jest.Mock;
const mockAgenda = fetchAgenda as jest.Mock;
const mockRun = runCurationCycle as jest.Mock;

const app = express();
app.use(express.json());
app.use('/v1/pa', router);

const PA = { 'x-test-roles': 'public-affairs' };
const NON_PA = { 'x-test-roles': 'caseworker' };

describe('PA routes — role gating', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('GET /v1/pa/signals', () => {
    it('anonymous → 401', async () => {
      const res = await request(app).get('/v1/pa/signals');
      expect(res.status).toBe(401);
    });

    it('authenticated non-PA role → 403', async () => {
      const res = await request(app).get('/v1/pa/signals').set(NON_PA);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('public-affairs role → 200', async () => {
      mockDb.any.mockResolvedValue([]);
      const res = await request(app).get('/v1/pa/signals').set(PA);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('response includes meta envelope with total, cap, and capped=false when under cap', async () => {
      mockDb.any
        .mockResolvedValueOnce([]) // rows (LIMIT query)
        .mockResolvedValueOnce([{ count: '42' }]); // COUNT(*) query
      const res = await request(app).get('/v1/pa/signals').set(PA);
      expect(res.status).toBe(200);
      expect(res.body.meta).toEqual({ total: 42, cap: 100, capped: false });
    });

    it('meta.capped=true and total reflects full count when COUNT(*) exceeds cap', async () => {
      mockDb.any
        .mockResolvedValueOnce([]) // rows (LIMIT query — empty to isolate meta count assertion)
        .mockResolvedValueOnce([{ count: '142' }]); // COUNT(*) query
      const res = await request(app).get('/v1/pa/signals').set(PA);
      expect(res.status).toBe(200);
      expect(res.body.meta).toEqual({ total: 142, cap: 100, capped: true });
    });
  });

  describe('POST /v1/pa/signals (promote raw hit)', () => {
    const rawHit = { id: 'ob-1', title: 'Publicatie X', source: 'ob' };

    it('anonymous → 401', async () => {
      const res = await request(app).post('/v1/pa/signals').send(rawHit);
      expect(res.status).toBe(401);
    });

    it('authenticated non-PA role → 403', async () => {
      const res = await request(app).post('/v1/pa/signals').set(NON_PA).send(rawHit);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('public-affairs role, missing fields → 400', async () => {
      const res = await request(app).post('/v1/pa/signals').set(PA).send({ id: 'ob-1' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('MISSING_FIELDS');
      expect(mockPromoteToInbox).not.toHaveBeenCalled();
    });

    it('public-affairs role, valid item → 201 with promoted signal', async () => {
      mockPromoteToInbox.mockResolvedValue('sig-ob-ob-1');
      mockDb.one.mockResolvedValue({
        id: 'sig-ob-ob-1',
        tab: 'regionaal',
        dossier_id: null,
        title: 'Publicatie X',
        src: 'Officiële Bekendmakingen · Publicatie',
        bron: 'ob',
        ref: null,
        rel: 5,
        impact: null,
        impact_label: null,
        duiding: null,
        status: 'candidate',
        ai_draft: null,
        confirmed_by: null,
        confirmed_at: null,
      });
      const res = await request(app).post('/v1/pa/signals').set(PA).send(rawHit);
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('candidate');
      expect(res.body.data.tab).toBe('regionaal');
      expect(mockPromoteToInbox).toHaveBeenCalledWith('flevoland', expect.objectContaining(rawHit));
    });
  });

  describe('PATCH /v1/pa/searches/:id (scope flip)', () => {
    it('anonymous → 401', async () => {
      const res = await request(app).patch('/v1/pa/searches/srch-1').send({ scope: 'tenant' });
      expect(res.status).toBe(401);
    });

    it('authenticated non-PA role → 403', async () => {
      const res = await request(app)
        .patch('/v1/pa/searches/srch-1')
        .set(NON_PA)
        .send({ scope: 'tenant' });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('public-affairs role, invalid scope → 400', async () => {
      const res = await request(app)
        .patch('/v1/pa/searches/srch-1')
        .set(PA)
        .send({ scope: 'bogus' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('BAD_SCOPE');
      expect(mockDb.result).not.toHaveBeenCalled();
    });

    it('public-affairs role, not owner / unknown id → 404', async () => {
      mockDb.result.mockResolvedValue({ rowCount: 0 });
      const res = await request(app)
        .patch('/v1/pa/searches/unknown')
        .set(PA)
        .send({ scope: 'tenant' });
      expect(res.status).toBe(404);
    });

    it('public-affairs role → 200 (guarded by tenant_id only, any PA officer can edit)', async () => {
      mockDb.result.mockResolvedValue({ rowCount: 1 });
      const res = await request(app)
        .patch('/v1/pa/searches/srch-1')
        .set(PA)
        .send({ scope: 'tenant' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const [, values] = mockDb.result.mock.calls[0];
      expect(values).toEqual(['tenant', 'srch-1', 'flevoland']);
    });
  });

  describe('POST /v1/pa/signals/:id/confirm', () => {
    it('anonymous → 401', async () => {
      const res = await request(app).post('/v1/pa/signals/sig-1/confirm').send({});
      expect(res.status).toBe(401);
    });

    it('authenticated non-PA role → 403', async () => {
      const res = await request(app).post('/v1/pa/signals/sig-1/confirm').set(NON_PA).send({});
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('public-affairs role, unknown signal → 404 (auth passed)', async () => {
      mockDb.oneOrNone.mockResolvedValue(null);
      const res = await request(app).post('/v1/pa/signals/unknown-sig/confirm').set(PA).send({});
      expect(res.status).toBe(404);
    });

    it('public-affairs role, known signal → 200', async () => {
      mockDb.oneOrNone.mockResolvedValue({ id: 'sig-1' });
      mockDb.none.mockResolvedValue(undefined);
      mockDb.one.mockResolvedValue({
        id: 'sig-1',
        tab: 'politiek',
        dossier_id: 'd-1',
        title: 'Test signal',
        src: 'Tweede Kamer · Document',
        bron: 'tk',
        ref: null,
        rel: 7,
        impact: null,
        impact_label: null,
        duiding: null,
        status: 'confirmed',
        ai_draft: null,
        confirmed_by: 'Test User',
        confirmed_at: new Date().toISOString(),
        routing: null,
      });
      const res = await request(app).post('/v1/pa/signals/sig-1/confirm').set(PA).send({});
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('confirmed');
    });

    it('confirms without dossierId → routing:watchlist in UPDATE SQL', async () => {
      mockDb.oneOrNone.mockResolvedValue({ id: 'sig-eu' });
      mockDb.none.mockResolvedValue(undefined);
      mockDb.one.mockResolvedValue({
        id: 'sig-eu',
        tab: 'europa',
        dossier_id: null,
        title: 'EU verslag zonder dossier',
        src: 'Europees Parlement · Verslag',
        bron: 'eu',
        subbron: 'ep-teksten',
        commissie: 'SANT',
        ref: null,
        rel: 5,
        impact: 'kans',
        impact_label: 'Kans',
        duiding: 'Bevestigd zonder dossier',
        status: 'confirmed',
        ai_draft: null,
        confirmed_by: 'Test User',
        confirmed_at: new Date().toISOString(),
        routing: 'watchlist',
      });
      const res = await request(app).post('/v1/pa/signals/sig-eu/confirm').set(PA).send({});
      expect(res.status).toBe(200);
      expect(res.body.data.routing).toBe('watchlist');
      expect(res.body.data.dossierId).toBeNull();
      // The UPDATE SQL must contain the CASE expression for routing
      const updateSql: string = mockDb.none.mock.calls[0][0] as string;
      expect(updateSql).toMatch(/routing\s*=\s*CASE/i);
    });

    it('confirmed watchlist signal appears in GET /signals (not filtered out)', async () => {
      mockDb.any.mockResolvedValue([
        {
          id: 'sig-eu',
          tab: 'europa',
          dossier_id: null,
          title: 'EU verslag zonder dossier',
          src: 'Europees Parlement · Verslag',
          bron: 'eu',
          subbron: 'ep-teksten',
          commissie: 'SANT',
          ref: null,
          rel: 5,
          impact: 'kans',
          impact_label: 'Kans',
          duiding: 'Bevestigd zonder dossier',
          status: 'confirmed',
          ai_draft: null,
          confirmed_by: 'Test User',
          confirmed_at: new Date().toISOString(),
          routing: 'watchlist',
        },
      ]);
      const res = await request(app).get('/v1/pa/signals?tab=europa').set(PA);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].routing).toBe('watchlist');
      expect(res.body.data[0].dossierId).toBeNull();
      // SELECT must NOT filter by dossier_id IS NOT NULL
      const selectSql: string = mockDb.any.mock.calls[0][0] as string;
      expect(selectSql).not.toMatch(/dossier_id\s+IS\s+NOT\s+NULL/i);
    });
  });

  describe('PATCH /v1/pa/signals/:id (link dossier)', () => {
    it('anonymous → 401', async () => {
      const res = await request(app).patch('/v1/pa/signals/sig-eu').send({ dossierId: 'energie' });
      expect(res.status).toBe(401);
    });

    it('authenticated non-PA role → 403', async () => {
      const res = await request(app)
        .patch('/v1/pa/signals/sig-eu')
        .set(NON_PA)
        .send({ dossierId: 'energie' });
      expect(res.status).toBe(403);
    });

    it('missing dossierId → 400', async () => {
      const res = await request(app).patch('/v1/pa/signals/sig-eu').set(PA).send({});
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('MISSING_DOSSIER_ID');
    });

    it('unknown signal → 404', async () => {
      mockDb.result.mockResolvedValue({ rowCount: 0 });
      const res = await request(app)
        .patch('/v1/pa/signals/unknown')
        .set(PA)
        .send({ dossierId: 'energie' });
      expect(res.status).toBe(404);
    });

    it('links dossier → 200, routing cleared', async () => {
      mockDb.result.mockResolvedValue({ rowCount: 1 });
      mockDb.one.mockResolvedValue({
        id: 'sig-eu',
        tab: 'europa',
        dossier_id: 'energie',
        title: 'EU verslag',
        src: 'Europees Parlement · Verslag',
        bron: 'eu',
        subbron: 'ep-teksten',
        commissie: 'SANT',
        ref: null,
        rel: 5,
        impact: 'kans',
        impact_label: 'Kans',
        duiding: 'Nu gekoppeld aan energie',
        status: 'confirmed',
        ai_draft: null,
        confirmed_by: 'Test User',
        confirmed_at: new Date().toISOString(),
        routing: null,
      });
      const res = await request(app)
        .patch('/v1/pa/signals/sig-eu')
        .set(PA)
        .send({ dossierId: 'energie' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.dossierId).toBe('energie');
      expect(res.body.data.routing).toBeNull();
      // UPDATE SQL must set routing = NULL
      const updateSql: string = mockDb.result.mock.calls[0][0] as string;
      expect(updateSql).toMatch(/routing\s*=\s*NULL/i);
    });
  });
});

describe('PA routes — feed & agenda', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('GET /v1/pa/feed', () => {
    it('merges TK + OB items and sums their totals by default', async () => {
      mockTk.mockResolvedValue({ items: [{ id: 'tk-1' }], total: 3 });
      mockOb.mockResolvedValue({ items: [{ id: 'ob-1' }], total: 2 });
      const res = await request(app).get('/v1/pa/feed').set(PA);
      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(2);
      expect(res.body.data.total).toBe(5);
      expect(mockTk).toHaveBeenCalled();
      expect(mockOb).toHaveBeenCalled();
    });

    it('source=tk fetches only TK', async () => {
      mockTk.mockResolvedValue({ items: [{ id: 'tk-1' }], total: 1 });
      const res = await request(app).get('/v1/pa/feed?source=tk').set(PA);
      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(mockOb).not.toHaveBeenCalled();
    });

    it('source=ob fetches only OB', async () => {
      mockOb.mockResolvedValue({ items: [{ id: 'ob-1' }], total: 1 });
      const res = await request(app).get('/v1/pa/feed?source=ob').set(PA);
      expect(res.status).toBe(200);
      expect(mockTk).not.toHaveBeenCalled();
    });

    it('keeps total null when neither source reports a total', async () => {
      mockTk.mockResolvedValue({ items: [{ id: 'tk-1' }], total: null });
      mockOb.mockResolvedValue({ items: [], total: null });
      const res = await request(app).get('/v1/pa/feed').set(PA);
      expect(res.body.data.total).toBeNull();
    });

    it('tolerates one source rejecting (allSettled) — returns the other', async () => {
      mockTk.mockResolvedValue({ items: [{ id: 'tk-1' }], total: 1 });
      mockOb.mockRejectedValue(new Error('ob down'));
      const res = await request(app).get('/v1/pa/feed').set(PA);
      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
    });

    it('502s when a fetch throws synchronously', async () => {
      mockTk.mockImplementationOnce(() => {
        throw new Error('sync boom');
      });
      const res = await request(app).get('/v1/pa/feed?source=tk').set(PA);
      expect(res.status).toBe(502);
      expect(res.body.error.code).toBe('UPSTREAM_ERROR');
    });
  });

  describe('GET /v1/pa/types', () => {
    it('returns the TK + OB taxonomy arrays', async () => {
      const res = await request(app).get('/v1/pa/types').set(PA);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('tk');
      expect(res.body.data).toHaveProperty('ob');
    });
  });

  describe('GET /v1/pa/agenda', () => {
    it('enriches an agenda item with a dossier when a saved-search term matches', async () => {
      mockAgenda.mockResolvedValue([{ id: 'a1', titel: 'Debat over stikstof in Flevoland' }]);
      mockDb.any.mockResolvedValue([{ dossier_id: 'stikstof-dossier', query: { q: 'stikstof' } }]);
      const res = await request(app).get('/v1/pa/agenda').set(PA);
      expect(res.status).toBe(200);
      expect(res.body.data[0].dossier).toBe('stikstof-dossier');
      expect(res.body.data[0].matchTerm).toBe('stikstof');
    });

    it('leaves an item unenriched when no term matches', async () => {
      mockAgenda.mockResolvedValue([{ id: 'a2', titel: 'Iets heel anders' }]);
      mockDb.any.mockResolvedValue([{ dossier_id: 'd', query: { q: 'stikstof' } }]);
      const res = await request(app).get('/v1/pa/agenda').set(PA);
      expect(res.body.data[0].dossier).toBeUndefined();
    });

    it('502s when the agenda upstream fails', async () => {
      mockAgenda.mockRejectedValue(new Error('agenda down'));
      mockDb.any.mockResolvedValue([]);
      const res = await request(app).get('/v1/pa/agenda').set(PA);
      expect(res.status).toBe(502);
      expect(res.body.error.code).toBe('AGENDA_ERROR');
    });
  });
});

describe('PA routes — curator, searches CRUD & status', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('POST /v1/pa/curator/run', () => {
    it('kicks off a background curation cycle for flevoland', async () => {
      mockRun.mockResolvedValue(undefined);
      const res = await request(app).post('/v1/pa/curator/run').set(PA);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ started: true, tenantId: 'flevoland' });
      expect(mockRun).toHaveBeenCalledWith('flevoland');
    });
  });

  describe('GET /v1/pa/curator/status', () => {
    it('maps signal + search counts to numbers', async () => {
      mockDb.one
        .mockResolvedValueOnce({ total: '10', candidate: '4', confirmed: '6' })
        .mockResolvedValueOnce({ total: '3', flevoland: '2' });
      const res = await request(app).get('/v1/pa/curator/status').set(PA);
      expect(res.status).toBe(200);
      expect(res.body.data.signals).toEqual({ total: 10, inbox: 4, confirmed: 6 });
      expect(res.body.data.searches).toEqual({ total: 3, flevoland: 2 });
    });

    it('500s on a DB error', async () => {
      mockDb.one.mockRejectedValue(new Error('db down'));
      const res = await request(app).get('/v1/pa/curator/status').set(PA);
      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe('STATUS_ERROR');
    });
  });

  describe('GET /v1/pa/searches', () => {
    it('returns the tenant/user-scoped saved searches', async () => {
      mockDb.any.mockResolvedValue([{ id: 'srch-1' }]);
      const res = await request(app).get('/v1/pa/searches').set(PA);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([{ id: 'srch-1' }]);
    });

    it('500s on a DB error', async () => {
      mockDb.any.mockRejectedValue(new Error('db down'));
      const res = await request(app).get('/v1/pa/searches').set(PA);
      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe('SEARCHES_ERROR');
    });
  });

  describe('POST /v1/pa/searches', () => {
    it('400s when query.q is missing', async () => {
      const res = await request(app).post('/v1/pa/searches').set(PA).send({ tags: [] });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('MISSING_QUERY');
      expect(mockDb.none).not.toHaveBeenCalled();
    });

    it('creates a search and returns a generated id', async () => {
      mockDb.none.mockResolvedValue(undefined);
      const res = await request(app)
        .post('/v1/pa/searches')
        .set(PA)
        .send({ query: { q: 'stikstof' }, scope: 'tenant', dossierId: 'd1', tags: ['a'] });
      expect(res.status).toBe(201);
      expect(res.body.data.id).toMatch(/^srch-/);
    });

    it('500s on a DB error', async () => {
      mockDb.none.mockRejectedValue(new Error('insert failed'));
      const res = await request(app)
        .post('/v1/pa/searches')
        .set(PA)
        .send({ query: { q: 'stikstof' } });
      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe('SEARCH_CREATE_ERROR');
    });
  });

  describe('DELETE /v1/pa/searches/:id', () => {
    it('deletes an owned search → 200', async () => {
      mockDb.result.mockResolvedValue({ rowCount: 1 });
      const res = await request(app).delete('/v1/pa/searches/srch-1').set(PA);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('404s when nothing was deleted', async () => {
      mockDb.result.mockResolvedValue({ rowCount: 0 });
      const res = await request(app).delete('/v1/pa/searches/unknown').set(PA);
      expect(res.status).toBe(404);
    });

    it('500s on a DB error', async () => {
      mockDb.result.mockRejectedValue(new Error('delete failed'));
      const res = await request(app).delete('/v1/pa/searches/srch-1').set(PA);
      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe('SEARCH_DELETE_ERROR');
    });
  });

  describe('PATCH /v1/pa/searches/:id — validation branches', () => {
    it('400 MISSING_FIELDS when the body is empty', async () => {
      const res = await request(app).patch('/v1/pa/searches/srch-1').set(PA).send({});
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('MISSING_FIELDS');
    });

    it('400 EMPTY_QUERY when query.q is blank', async () => {
      const res = await request(app)
        .patch('/v1/pa/searches/srch-1')
        .set(PA)
        .send({ query: { q: '   ' } });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('EMPTY_QUERY');
    });

    it('updates query, tags and dossierId together → 200', async () => {
      mockDb.result.mockResolvedValue({ rowCount: 1 });
      const res = await request(app)
        .patch('/v1/pa/searches/srch-1')
        .set(PA)
        .send({ query: { q: 'energie' }, tags: ['x'], dossierId: 'd2' });
      expect(res.status).toBe(200);
      const [sql] = mockDb.result.mock.calls[0];
      expect(sql).toMatch(/query = \$/);
      expect(sql).toMatch(/tags = \$/);
      expect(sql).toMatch(/dossier_id = \$/);
    });
  });

  describe('GET /v1/pa/sources/status', () => {
    it('reflects the configured connector flags', async () => {
      const res = await request(app).get('/v1/pa/sources/status').set(PA);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({
        tk: true,
        ob: true,
        eu: true,
        epTeksten: true,
        media: false,
      });
    });
  });
});

describe('PA routes — GET /v1/pa/signals query branches', () => {
  beforeEach(() => jest.clearAllMocks());

  it('status=all drops the status filter from the WHERE clause', async () => {
    mockDb.any.mockResolvedValue([]);
    await request(app).get('/v1/pa/signals?status=all').set(PA);
    const [sql] = mockDb.any.mock.calls[0];
    expect(sql).not.toMatch(/status = /);
  });

  it('a multi-value status uses the ANY($n) branch', async () => {
    mockDb.any.mockResolvedValue([]);
    await request(app).get('/v1/pa/signals?status=candidate,confirmed').set(PA);
    const [sql, values] = mockDb.any.mock.calls[0];
    expect(sql).toMatch(/status = ANY/);
    expect(values).toContainEqual(['candidate', 'confirmed']);
  });

  it('tab + dossierId add their own filters', async () => {
    mockDb.any.mockResolvedValue([]);
    await request(app).get('/v1/pa/signals?tab=politiek&dossierId=d1').set(PA);
    const [sql, values] = mockDb.any.mock.calls[0];
    expect(sql).toMatch(/tab = /);
    expect(sql).toMatch(/dossier_id = /);
    expect(values).toEqual(expect.arrayContaining(['politiek', 'd1']));
  });

  it('500s when the signals query fails', async () => {
    mockDb.any.mockRejectedValue(new Error('select failed'));
    const res = await request(app).get('/v1/pa/signals').set(PA);
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('SIGNALS_ERROR');
  });
});
