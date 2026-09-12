/**
 * Route tests for /v1/hr onboarding endpoints (jwt + tenant), delegating to
 * operatonService. Service and middleware are mocked.
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
    getHrOnboardingProfile: jest.fn(),
    getHrOnboardingCompletedList: jest.fn(),
  },
}));
jest.mock('@utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import express from 'express';
import request from 'supertest';
import hrRouter from './hr.routes';
import { operatonService } from '@services/operaton.service';

const svc = operatonService as unknown as {
  getHrOnboardingProfile: jest.Mock;
  getHrOnboardingCompletedList: jest.Mock;
};

const app = express();
app.use('/v1/hr', hrRouter);
const auth = (r: request.Test) => r.set('x-test-auth', '1');

beforeEach(() => jest.clearAllMocks());

describe('GET /v1/hr/onboarding/profile', () => {
  it('401 without a token', async () => {
    const res = await request(app).get('/v1/hr/onboarding/profile?employeeId=e1');
    expect(res.status).toBe(401);
  });

  it('400 when employeeId is missing', async () => {
    const res = await auth(request(app).get('/v1/hr/onboarding/profile'));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns the profile scoped to the tenant', async () => {
    svc.getHrOnboardingProfile.mockResolvedValue({ firstName: 'Bob' });
    const res = await auth(request(app).get('/v1/hr/onboarding/profile?employeeId=e1'));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ firstName: 'Bob' });
    expect(svc.getHrOnboardingProfile).toHaveBeenCalledWith('e1', 'flevoland');
  });

  it('500 when the service throws', async () => {
    svc.getHrOnboardingProfile.mockRejectedValue(new Error('boom'));
    const res = await auth(request(app).get('/v1/hr/onboarding/profile?employeeId=e1'));
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('HR_PROFILE_FAILED');
  });
});

describe('GET /v1/hr/onboarding/completed', () => {
  it('returns the completed list for the tenant', async () => {
    svc.getHrOnboardingCompletedList.mockResolvedValue([{ id: 'i1' }]);
    const res = await auth(request(app).get('/v1/hr/onboarding/completed'));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([{ id: 'i1' }]);
    expect(svc.getHrOnboardingCompletedList).toHaveBeenCalledWith('flevoland');
  });

  it('500 when the service throws', async () => {
    svc.getHrOnboardingCompletedList.mockRejectedValue(new Error('boom'));
    const res = await auth(request(app).get('/v1/hr/onboarding/completed'));
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('ONBOARDING_LIST_FAILED');
  });
});

describe('handler guard for an authenticated request without a user', () => {
  // jwtMiddleware always attaches req.user or rejects, so this guard is
  // defensive; it still has to answer 401 rather than crash on req.user.x.
  it('GET /onboarding/completed -> 401 UNAUTHORIZED', async () => {
    const res = await request(app).get('/v1/hr/onboarding/completed').set('x-test-no-user', '1');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
});

describe('non-Error rejections', () => {
  // Operaton failures surface as bare strings often enough that the
  // 'Unknown error' fallback in each catch is a real path, not a formality.
  it('GET /onboarding/profile still answers 500', async () => {
    svc.getHrOnboardingProfile.mockRejectedValue('socket hang up');
    const res = await auth(request(app).get('/v1/hr/onboarding/profile?employeeId=e-1'));
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('HR_PROFILE_FAILED');
  });

  it('GET /onboarding/completed still answers 500', async () => {
    svc.getHrOnboardingCompletedList.mockRejectedValue('socket hang up');
    const res = await auth(request(app).get('/v1/hr/onboarding/completed'));
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('ONBOARDING_LIST_FAILED');
  });
});
