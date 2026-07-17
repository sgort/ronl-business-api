/**
 * Route tests for /v1/admin — the audit-log query, gated by jwt + requireRoles('admin').
 * The audit.service db and the auth middleware are mocked.
 */

import type { Request, Response, NextFunction } from 'express';

jest.mock('@auth/jwt.middleware', () => ({
  jwtMiddleware: (req: Request, res: Response, next: NextFunction) => {
    const roles = req.headers['x-test-roles'] as string | undefined;
    if (!roles) return res.status(401).json({ success: false, error: { code: 'MISSING_TOKEN' } });
    req.user = {
      userId: 'u',
      tenantId: 'flevoland',
      roles: roles.split(','),
      organisationType: 'province',
      assuranceLevel: 'substantieel',
      displayName: 'U',
      preferredUsername: 'u',
    };
    req.auth = { userId: 'u', tenantId: 'flevoland' } as Request['auth'];
    next();
  },
  requireRoles:
    (...roles: string[]) =>
    (req: Request, res: Response, next: NextFunction) => {
      if (!req.user)
        return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      if (!roles.some((r) => req.user!.roles.includes(r)))
        return res.status(403).json({ success: false, error: { code: 'FORBIDDEN' } });
      next();
    },
}));
jest.mock('@services/audit.service', () => ({ db: { any: jest.fn(), one: jest.fn() } }));
jest.mock('@utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import express from 'express';
import request from 'supertest';
import adminRouter from './admin.routes';
import { db } from '@services/audit.service';

const mockDb = db as unknown as { any: jest.Mock; one: jest.Mock };

const app = express();
app.use('/v1/admin', adminRouter);
const asAdmin = (r: request.Test) => r.set('x-test-roles', 'admin');

beforeEach(() => jest.clearAllMocks());

describe('GET /v1/admin/audit', () => {
  it('401 without a token', async () => {
    const res = await request(app).get('/v1/admin/audit');
    expect(res.status).toBe(401);
  });

  it('403 for a non-admin role', async () => {
    const res = await request(app).get('/v1/admin/audit').set('x-test-roles', 'caseworker');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('returns rows with pagination for an admin', async () => {
    mockDb.any.mockResolvedValue([{ id: '1', action: 'GET /x' }]);
    mockDb.one.mockResolvedValue({ total: 1 });

    const res = await asAdmin(request(app).get('/v1/admin/audit'));

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.pagination).toEqual({ limit: 50, offset: 0, total: 1, hasMore: false });
  });

  it('clamps limit to 200 and computes hasMore', async () => {
    mockDb.any.mockResolvedValue(new Array(200).fill({ id: 'x' }));
    mockDb.one.mockResolvedValue({ total: 500 });

    const res = await asAdmin(request(app).get('/v1/admin/audit?limit=999&offset=0'));

    expect(res.body.data.pagination.limit).toBe(200);
    expect(res.body.data.pagination.hasMore).toBe(true);
    expect(mockDb.any).toHaveBeenCalledWith(expect.any(String), [200, 0]);
  });

  it('500 DB_ERROR when the query fails', async () => {
    mockDb.any.mockRejectedValue(new Error('db down'));
    mockDb.one.mockResolvedValue({ total: 0 });

    const res = await asAdmin(request(app).get('/v1/admin/audit'));

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('DB_ERROR');
  });
});
