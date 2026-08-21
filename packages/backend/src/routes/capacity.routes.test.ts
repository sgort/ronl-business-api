/**
 * Route tests for /v1/hr-capacity (jwt + tenant) — active/completed lists and the
 * documents endpoint with tenant-isolation. operatonService is mocked.
 */

import type { Request, Response, NextFunction } from 'express';

jest.mock('@auth/jwt.middleware', () => ({
  jwtMiddleware: (req: Request, res: Response, next: NextFunction) => {
    // An authenticated request that carries no user: the shape each handler's own
    // `if (!req.user)` guard is written for, which jwtMiddleware itself never produces.
    if (req.headers['x-test-no-user']) return next();
    if (!req.headers['x-test-auth'])
      return res.status(401).json({ success: false, error: { code: 'MISSING_TOKEN' } });
    req.user = { userId: 'u', tenantId: 'flevoland' } as Request['user'];
    next();
  },
}));
jest.mock('@middleware/tenant.middleware', () => ({
  tenantMiddleware: (_req: Request, _res: Response, next: NextFunction) => next(),
}));
jest.mock('@services/operaton.service', () => ({
  operatonService: {
    getCapacityClaimActiveList: jest.fn(),
    getCapacityClaimCompletedList: jest.fn(),
    getCapacityClaimDocuments: jest.fn(),
  },
}));
jest.mock('@utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import express from 'express';
import request from 'supertest';
import capacityRouter from './capacity.routes';
import { operatonService } from '@services/operaton.service';

const svc = operatonService as unknown as {
  getCapacityClaimActiveList: jest.Mock;
  getCapacityClaimCompletedList: jest.Mock;
  getCapacityClaimDocuments: jest.Mock;
};

const app = express();
app.use('/v1/hr-capacity', capacityRouter);
const auth = (r: request.Test) => r.set('x-test-auth', '1');

beforeEach(() => jest.clearAllMocks());

describe('lists', () => {
  it('401 without a token', async () => {
    const res = await request(app).get('/v1/hr-capacity/active');
    expect(res.status).toBe(401);
  });

  it('GET /active returns the tenant list', async () => {
    svc.getCapacityClaimActiveList.mockResolvedValue([{ id: 'i1' }]);
    const res = await auth(request(app).get('/v1/hr-capacity/active'));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([{ id: 'i1' }]);
    expect(svc.getCapacityClaimActiveList).toHaveBeenCalledWith('flevoland');
  });

  it('GET /active → 500 on service failure', async () => {
    svc.getCapacityClaimActiveList.mockRejectedValue(new Error('boom'));
    const res = await auth(request(app).get('/v1/hr-capacity/active'));
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('CAPACITY_CLAIM_LIST_FAILED');
  });

  it('GET /completed returns the tenant list', async () => {
    svc.getCapacityClaimCompletedList.mockResolvedValue([{ id: 'c1' }]);
    const res = await auth(request(app).get('/v1/hr-capacity/completed'));
    expect(res.status).toBe(200);
    expect(svc.getCapacityClaimCompletedList).toHaveBeenCalledWith('flevoland');
  });

  it('GET /completed → 500 on service failure', async () => {
    svc.getCapacityClaimCompletedList.mockRejectedValue(new Error('boom'));
    const res = await auth(request(app).get('/v1/hr-capacity/completed'));
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('CAPACITY_CLAIM_COMPLETED_LIST_FAILED');
  });
});

describe('GET /:instanceId/documents', () => {
  it('returns documents when the instance belongs to the tenant', async () => {
    svc.getCapacityClaimDocuments.mockResolvedValue({
      variables: { municipality: 'flevoland' },
      boardDecisionNotification: { doc: 'a' },
      capacityClaimHandover: null,
    });
    const res = await auth(request(app).get('/v1/hr-capacity/pi-1/documents'));
    expect(res.status).toBe(200);
    expect(res.body.data.boardDecisionNotification).toEqual({ doc: 'a' });
  });

  it('403 when the instance belongs to another tenant', async () => {
    svc.getCapacityClaimDocuments.mockResolvedValue({
      variables: { municipality: 'utrecht' },
      boardDecisionNotification: null,
      capacityClaimHandover: null,
    });
    const res = await auth(request(app).get('/v1/hr-capacity/pi-1/documents'));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('500 on service failure', async () => {
    svc.getCapacityClaimDocuments.mockRejectedValue(new Error('boom'));
    const res = await auth(request(app).get('/v1/hr-capacity/pi-1/documents'));
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('CAPACITY_CLAIM_DOCUMENTS_FAILED');
  });
});

describe('handler guards for an authenticated request without a user', () => {
  // jwtMiddleware always attaches req.user or rejects, so these guards are
  // defensive; they still have to answer 401 rather than crash on req.user.x.
  const noUser = (r: request.Test) => r.set('x-test-no-user', '1');

  it.each([
    ['/v1/hr-capacity/active'],
    ['/v1/hr-capacity/completed'],
    ['/v1/hr-capacity/pi-1/documents'],
  ])('%s → 401 UNAUTHORIZED', async (path) => {
    const res = await noUser(request(app).get(path));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
});

describe('non-Error rejections', () => {
  // Operaton failures surface as strings often enough that the ternary's
  // 'Unknown error' fallback is a real path, not a formality.
  it('GET /active still answers 500', async () => {
    svc.getCapacityClaimActiveList.mockRejectedValue('socket hang up');
    const res = await auth(request(app).get('/v1/hr-capacity/active'));
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('CAPACITY_CLAIM_LIST_FAILED');
  });

  it('GET /completed still answers 500', async () => {
    svc.getCapacityClaimCompletedList.mockRejectedValue('socket hang up');
    const res = await auth(request(app).get('/v1/hr-capacity/completed'));
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('CAPACITY_CLAIM_COMPLETED_LIST_FAILED');
  });

  it('GET /:instanceId/documents still answers 500', async () => {
    svc.getCapacityClaimDocuments.mockRejectedValue('socket hang up');
    const res = await auth(request(app).get('/v1/hr-capacity/pi-1/documents'));
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('CAPACITY_CLAIM_DOCUMENTS_FAILED');
  });
});

describe('tenant isolation when the instance has no municipality', () => {
  it('serves the documents rather than 403, since there is nothing to mismatch', async () => {
    svc.getCapacityClaimDocuments.mockResolvedValue({
      variables: {},
      boardDecisionNotification: { doc: 'a' },
      capacityClaimHandover: null,
    });
    const res = await auth(request(app).get('/v1/hr-capacity/pi-1/documents'));
    expect(res.status).toBe(200);
    expect(res.body.data.boardDecisionNotification).toEqual({ doc: 'a' });
  });
});
