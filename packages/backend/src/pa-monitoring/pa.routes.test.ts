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
jest.mock('./curation.service', () => ({ runCurationCycle: jest.fn() }));
jest.mock('./sources/agenda.client', () => ({ fetchAgenda: jest.fn() }));

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
      });
      const res = await request(app).post('/v1/pa/signals/sig-1/confirm').set(PA).send({});
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('confirmed');
    });
  });
});
