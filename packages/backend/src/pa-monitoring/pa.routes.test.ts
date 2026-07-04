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
        .mockResolvedValueOnce([]) // rows (100-row LIMIT result)
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
