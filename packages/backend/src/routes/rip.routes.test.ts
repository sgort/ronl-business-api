/**
 * Route tests for /v1/rip/phase1 (jwt + tenant) — active/completed lists and the
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
    getRipPhase1ActiveList: jest.fn(),
    getRipPhase1CompletedList: jest.fn(),
    getRipPhase1Documents: jest.fn(),
    getDeployedProcessKeys: jest.fn(),
    getPhaseInstanceCounts: jest.fn(),
  },
}));
jest.mock('@utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import express from 'express';
import request from 'supertest';
import ripRouter from './rip.routes';
import { operatonService } from '@services/operaton.service';
import { RIP_PHASE_KEYS } from '@ronl/shared';

/** Every phase modelled as BPMN — the exact list both phase endpoints query. */
const MODELLED_KEYS = RIP_PHASE_KEYS.map((p) => p.processDefinitionKey).filter(Boolean);

const svc = operatonService as unknown as {
  getRipPhase1ActiveList: jest.Mock;
  getRipPhase1CompletedList: jest.Mock;
  getRipPhase1Documents: jest.Mock;
  getDeployedProcessKeys: jest.Mock;
  getPhaseInstanceCounts: jest.Mock;
};

const app = express();
app.use('/v1/rip', ripRouter);
const auth = (r: request.Test) => r.set('x-test-auth', '1');

beforeEach(() => jest.clearAllMocks());

describe('lists', () => {
  it('401 without a token', async () => {
    const res = await request(app).get('/v1/rip/phase1/active');
    expect(res.status).toBe(401);
  });

  it('GET /phase1/active returns the tenant list', async () => {
    svc.getRipPhase1ActiveList.mockResolvedValue([{ id: 'i1' }]);
    const res = await auth(request(app).get('/v1/rip/phase1/active'));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([{ id: 'i1' }]);
    expect(svc.getRipPhase1ActiveList).toHaveBeenCalledWith('flevoland');
  });

  it('GET /phase1/active → 500 on service failure', async () => {
    svc.getRipPhase1ActiveList.mockRejectedValue(new Error('boom'));
    const res = await auth(request(app).get('/v1/rip/phase1/active'));
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('RIP_LIST_FAILED');
  });

  it('GET /phase1/completed returns the tenant list', async () => {
    svc.getRipPhase1CompletedList.mockResolvedValue([{ id: 'c1' }]);
    const res = await auth(request(app).get('/v1/rip/phase1/completed'));
    expect(res.status).toBe(200);
    expect(svc.getRipPhase1CompletedList).toHaveBeenCalledWith('flevoland');
  });

  it('GET /phase1/completed → 500 on service failure', async () => {
    svc.getRipPhase1CompletedList.mockRejectedValue(new Error('boom'));
    const res = await auth(request(app).get('/v1/rip/phase1/completed'));
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('RIP_COMPLETED_LIST_FAILED');
  });
});

describe('GET /phases/deployment-status', () => {
  it('401 without a token', async () => {
    const res = await request(app).get('/v1/rip/phases/deployment-status');
    expect(res.status).toBe(401);
  });

  it('returns the deployed keys from the service', async () => {
    svc.getDeployedProcessKeys.mockResolvedValue(['RipR21Process']);
    const res = await auth(request(app).get('/v1/rip/phases/deployment-status'));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ deployedKeys: ['RipR21Process'] });
    expect(svc.getDeployedProcessKeys).toHaveBeenCalledWith(MODELLED_KEYS, 'flevoland');
  });

  it('500 with DEPLOYMENT_STATUS_FAILED on service failure', async () => {
    svc.getDeployedProcessKeys.mockRejectedValue(new Error('boom'));
    const res = await auth(request(app).get('/v1/rip/phases/deployment-status'));
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('DEPLOYMENT_STATUS_FAILED');
  });
});

describe('GET /phases/counts', () => {
  it('401 without a token', async () => {
    const res = await request(app).get('/v1/rip/phases/counts');
    expect(res.status).toBe(401);
  });

  it('returns counts for the deployed keys only', async () => {
    svc.getDeployedProcessKeys.mockResolvedValue(['RipR21Process']);
    svc.getPhaseInstanceCounts.mockResolvedValue({
      RipR21Process: { wip: 3, gereed: 7 },
    });
    const res = await auth(request(app).get('/v1/rip/phases/counts'));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ counts: { RipR21Process: { wip: 3, gereed: 7 } } });
    expect(svc.getPhaseInstanceCounts).toHaveBeenCalledWith(['RipR21Process'], 'flevoland');
  });

  it('500 with PHASE_COUNTS_FAILED on service failure', async () => {
    svc.getDeployedProcessKeys.mockResolvedValue(['RipR21Process']);
    svc.getPhaseInstanceCounts.mockRejectedValue(new Error('boom'));
    const res = await auth(request(app).get('/v1/rip/phases/counts'));
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('PHASE_COUNTS_FAILED');
  });
});

describe('GET /phase1/:instanceId/documents', () => {
  it('returns documents when the instance belongs to the tenant', async () => {
    svc.getRipPhase1Documents.mockResolvedValue({
      variables: { municipality: 'flevoland' },
      intakeReport: { t: 'intake' },
      psuReport: null,
      pdp: null,
    });
    const res = await auth(request(app).get('/v1/rip/phase1/pi-1/documents'));
    expect(res.status).toBe(200);
    expect(res.body.data.intakeReport).toEqual({ t: 'intake' });
  });

  it('403 when the instance belongs to another tenant', async () => {
    svc.getRipPhase1Documents.mockResolvedValue({
      variables: { municipality: 'utrecht' },
      intakeReport: null,
      psuReport: null,
      pdp: null,
    });
    const res = await auth(request(app).get('/v1/rip/phase1/pi-1/documents'));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('500 on service failure', async () => {
    svc.getRipPhase1Documents.mockRejectedValue(new Error('boom'));
    const res = await auth(request(app).get('/v1/rip/phase1/pi-1/documents'));
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('RIP_DOCUMENTS_FAILED');
  });
});

describe('handler guards for an authenticated request without a user', () => {
  // jwtMiddleware always attaches req.user or rejects, so these guards are
  // defensive; they still have to answer 401 rather than crash on req.user.x.
  const noUser = (r: request.Test) => r.set('x-test-no-user', '1');

  it.each([
    ['/v1/rip/phase1/active'],
    ['/v1/rip/phases/deployment-status'],
    ['/v1/rip/phases/counts'],
    ['/v1/rip/phase1/pi-1/documents'],
    ['/v1/rip/phase1/completed'],
  ])('%s → 401 UNAUTHORIZED', async (path) => {
    const res = await noUser(request(app).get(path));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
});

describe('non-Error rejections', () => {
  // Operaton failures surface as strings often enough that the ternary's
  // 'Unknown error' fallback is a real path, not a formality.
  it('GET /phase1/active still answers 500', async () => {
    svc.getRipPhase1ActiveList.mockRejectedValue('socket hang up');
    const res = await auth(request(app).get('/v1/rip/phase1/active'));
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('RIP_LIST_FAILED');
  });

  it('GET /phases/deployment-status still answers 500', async () => {
    svc.getDeployedProcessKeys.mockRejectedValue('socket hang up');
    const res = await auth(request(app).get('/v1/rip/phases/deployment-status'));
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('DEPLOYMENT_STATUS_FAILED');
  });

  it('GET /phases/counts still answers 500', async () => {
    svc.getDeployedProcessKeys.mockResolvedValue(['RipR21Process']);
    svc.getPhaseInstanceCounts.mockRejectedValue('socket hang up');
    const res = await auth(request(app).get('/v1/rip/phases/counts'));
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('PHASE_COUNTS_FAILED');
  });

  it('GET /phase1/:instanceId/documents still answers 500', async () => {
    svc.getRipPhase1Documents.mockRejectedValue('socket hang up');
    const res = await auth(request(app).get('/v1/rip/phase1/pi-1/documents'));
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('RIP_DOCUMENTS_FAILED');
  });

  it('GET /phase1/completed still answers 500', async () => {
    svc.getRipPhase1CompletedList.mockRejectedValue('socket hang up');
    const res = await auth(request(app).get('/v1/rip/phase1/completed'));
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('RIP_COMPLETED_LIST_FAILED');
  });
});

describe('tenant isolation when the instance has no municipality', () => {
  it('serves the documents rather than 403, since there is nothing to mismatch', async () => {
    svc.getRipPhase1Documents.mockResolvedValue({
      variables: {},
      intakeReport: { t: 'intake' },
      psuReport: null,
      pdp: null,
    });
    const res = await auth(request(app).get('/v1/rip/phase1/pi-1/documents'));
    expect(res.status).toBe(200);
    expect(res.body.data.intakeReport).toEqual({ t: 'intake' });
  });
});
