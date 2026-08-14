/**
 * Route tests for /v1/rip/phase1 (jwt + tenant) — active/completed lists and the
 * documents endpoint with tenant-isolation. operatonService is mocked.
 */

import type { Request, Response, NextFunction } from 'express';

jest.mock('@auth/jwt.middleware', () => ({
  jwtMiddleware: (req: Request, res: Response, next: NextFunction) => {
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
    svc.getDeployedProcessKeys.mockResolvedValue(['RipPhase1Process']);
    const res = await auth(request(app).get('/v1/rip/phases/deployment-status'));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ deployedKeys: ['RipPhase1Process'] });
    expect(svc.getDeployedProcessKeys).toHaveBeenCalledWith(['RipPhase1Process'], 'flevoland');
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
    svc.getDeployedProcessKeys.mockResolvedValue(['RipPhase1Process']);
    svc.getPhaseInstanceCounts.mockResolvedValue({
      RipPhase1Process: { wip: 3, gereed: 7 },
    });
    const res = await auth(request(app).get('/v1/rip/phases/counts'));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ counts: { RipPhase1Process: { wip: 3, gereed: 7 } } });
    expect(svc.getPhaseInstanceCounts).toHaveBeenCalledWith(['RipPhase1Process'], 'flevoland');
  });

  it('500 with PHASE_COUNTS_FAILED on service failure', async () => {
    svc.getDeployedProcessKeys.mockResolvedValue(['RipPhase1Process']);
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
