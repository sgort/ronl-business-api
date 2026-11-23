/**
 * Route tests for /v1/rip (jwt + tenant) — the phase-parameterised
 * active/completed lists, the instance documents endpoint with
 * tenant-isolation, and the catalogue-driven phase endpoints.
 * operatonService is mocked.
 */

import type { Request, Response, NextFunction } from 'express';
import { readFileSync } from 'fs';
import { join } from 'path';

jest.mock('@auth/jwt.middleware', () => ({
  jwtMiddleware: (req: Request, res: Response, next: NextFunction) => {
    // An authenticated request that carries no user: the shape each handler's own
    // `if (!req.user)` guard is written for, which jwtMiddleware itself never produces.
    if (req.headers['x-test-no-user']) return next();
    if (!req.headers['x-test-auth'])
      return res.status(401).type('application/problem+json').json({
        type: 'about:blank',
        status: 401,
        title: 'Missing token',
        detail: 'Missing token',
        instance: req.originalUrl,
        code: 'MISSING_TOKEN',
      });
    req.user = { userId: 'u', tenantId: 'flevoland' } as Request['user'];
    next();
  },
}));
jest.mock('@middleware/tenant.middleware', () => ({
  tenantMiddleware: (_req: Request, _res: Response, next: NextFunction) => next(),
}));
jest.mock('@services/operaton.service', () => ({
  operatonService: {
    getRipPhaseActiveList: jest.fn(),
    getRipPhaseCompletedList: jest.fn(),
    getRipInstanceDocuments: jest.fn(),
    getDeployedProcessKeys: jest.fn(),
    getPhaseInstanceCounts: jest.fn(),
    getPhaseSwimlaneModel: jest.fn(),
    getAccessVariables: jest.fn(),
  },
}));
jest.mock('./edocs.access', () => ({
  // A person with an eDOCS identity, unless the test says otherwise.
  edocsAccess: (req: Request, _res: Response, next: NextFunction) => {
    if (!req.headers['x-test-no-edocs']) {
      (req as unknown as { edocs?: unknown }).edocs = { person: true };
    }
    next();
  },
  requireEdocsPrincipal: (req: Request, res: Response, next: NextFunction) => {
    if ((req as unknown as { edocs?: unknown }).edocs) return next();
    res.status(403).type('application/problem+json').json({
      type: 'about:blank',
      status: 403,
      title: 'Forbidden',
      detail: 'no eDOCS identity',
      instance: req.originalUrl,
      code: 'EDOCS_USER_TOKEN_UNAVAILABLE',
    });
  },
  edocsOf: (req: Request) => (req as unknown as { edocs?: unknown }).edocs,
  sendEdocsError: (req: Request, res: Response) =>
    res.status(502).type('application/problem+json').json({
      type: 'about:blank',
      status: 502,
      title: 'Bad Gateway',
      detail: 'eDOCS failed',
      instance: req.originalUrl,
      code: 'EDOCS_ERROR',
    }),
}));
jest.mock('@services/rip-documents/rip-documents.service', () => {
  class RipDocumentError extends Error {
    constructor(
      public readonly status: number,
      public readonly code: string,
      message: string
    ) {
      super(message);
    }
  }
  return {
    RipDocumentError,
    listInstanceDocuments: jest.fn(),
    listInstanceWorkspace: jest.fn(),
    linkDocument: jest.fn(),
    uploadDocument: jest.fn(),
  };
});
jest.mock('@middleware/audit.middleware', () => ({ auditLog: jest.fn() }));
jest.mock('@utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import express from 'express';
import request from 'supertest';
import { versionMiddleware } from '@middleware/version.middleware';
import { expectToMatchOperation } from '@/openapi/testing/conformance';
import ripRouter, { isLinkedUploadPath } from './rip.routes';
import { operatonService } from '@services/operaton.service';
import * as ripDocuments from '@services/rip-documents/rip-documents.service';
import { auditLog } from '@middleware/audit.middleware';
import { RIP_PHASE_KEYS } from '@ronl/shared';
import { parseSwimlane } from '../rip-swimlane/bpmn-swimlane';

/** Every phase modelled as BPMN — the exact list both phase endpoints query. */
const MODELLED_KEYS = RIP_PHASE_KEYS.map((p) => p.processDefinitionKey);

const svc = operatonService as unknown as {
  getRipPhaseActiveList: jest.Mock;
  getRipPhaseCompletedList: jest.Mock;
  getRipInstanceDocuments: jest.Mock;
  getDeployedProcessKeys: jest.Mock;
  getPhaseInstanceCounts: jest.Mock;
  getPhaseSwimlaneModel: jest.Mock;
  getAccessVariables: jest.Mock;
};
const docs = ripDocuments as unknown as {
  RipDocumentError: new (status: number, code: string, message: string) => Error;
  listInstanceDocuments: jest.Mock;
  listInstanceWorkspace: jest.Mock;
  linkDocument: jest.Mock;
  uploadDocument: jest.Mock;
};
const EMPTY_DOCUMENTS = {
  municipality: 'flevoland',
  edocsWorkspaceId: null,
  uploadTarget: 'edocs',
  documents: [],
  kredietChecks: [],
};
beforeEach(() => {
  docs.listInstanceDocuments.mockResolvedValue(EMPTY_DOCUMENTS);
});

// versionMiddleware is app-wide in index.ts, not in the router, so a test
// app mounting the router alone answers without API-Version -- which
// expectToMatchOperation checks on every 2xx (ADR API-57). Mounting it here
// keeps the test app answering what the real one does (#269).
const app = express();
app.use(versionMiddleware);
// The app-wide JSON parser, as index.ts mounts it: 1 MB, skipping the upload
// route, which parses its own larger body.
const appJson = express.json({ limit: '1mb' });
app.use((req, res, next) => (isLinkedUploadPath(req.path) ? next() : appJson(req, res, next)));
app.use('/v1/rip', ripRouter);
const auth = (r: request.Test) => r.set('x-test-auth', '1');

// An instance as the RIP boards report one. RipInstance names `businessKey`
// and `startTime` as required, and `{ id: 'i1' }` supplied neither while
// satisfying every assertion in this file until #269.
const ripInstance = (over: Record<string, unknown> = {}) => ({
  id: 'i1',
  businessKey: 'flevoland-1',
  startTime: '2026-09-28T10:00:00.000Z',
  ...over,
});

beforeEach(() => jest.clearAllMocks());

describe('lists', () => {
  it('401 without a token', async () => {
    const res = await request(app).get('/v1/rip/phases/R2.1/active');
    expect(res.status).toBe(401);
    expectToMatchOperation(res, 'get', '/rip/phases/{code}/active');
  });

  it('GET /phases/:code/active returns the tenant list', async () => {
    svc.getRipPhaseActiveList.mockResolvedValue([ripInstance()]);
    const res = await auth(request(app).get('/v1/rip/phases/R2.1/active'));
    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'get', '/rip/phases/{code}/active');
    expect(res.body.data).toEqual([ripInstance()]);
    expect(svc.getRipPhaseActiveList).toHaveBeenCalledWith('RipR21Process', 'flevoland');
  });

  it('GET /phases/:code/active resolves each modelled phase to its own key', async () => {
    svc.getRipPhaseActiveList.mockResolvedValue([]);
    await auth(request(app).get('/v1/rip/phases/R2.2/active'));
    expect(svc.getRipPhaseActiveList).toHaveBeenCalledWith('RipR22Process', 'flevoland');
  });

  it('GET /phases/:code/active answers 404 for a phase code the catalogue has never heard of', async () => {
    const res = await auth(request(app).get('/v1/rip/phases/R9.9/active'));
    expect(res.status).toBe(404);
    expectToMatchOperation(res, 'get', '/rip/phases/{code}/active');
    expect(res.body.code).toBe('UNKNOWN_PHASE');
    expect(svc.getRipPhaseActiveList).not.toHaveBeenCalled();
  });

  it('GET /phases/:code/active → 500 on service failure', async () => {
    svc.getRipPhaseActiveList.mockRejectedValue(new Error('boom'));
    const res = await auth(request(app).get('/v1/rip/phases/R2.1/active'));
    expect(res.status).toBe(500);
    expectToMatchOperation(res, 'get', '/rip/phases/{code}/active');
    expect(res.body.code).toBe('RIP_LIST_FAILED');
  });

  it('GET /phases/:code/completed returns the tenant list', async () => {
    svc.getRipPhaseCompletedList.mockResolvedValue([ripInstance({ id: 'c1' })]);
    const res = await auth(request(app).get('/v1/rip/phases/R2.1/completed'));
    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'get', '/rip/phases/{code}/completed');
    expect(svc.getRipPhaseCompletedList).toHaveBeenCalledWith('RipR21Process', 'flevoland');
  });

  it('GET /phases/:code/completed answers 404 for an unknown phase', async () => {
    const res = await auth(request(app).get('/v1/rip/phases/R9.9/completed'));
    expect(res.status).toBe(404);
    expectToMatchOperation(res, 'get', '/rip/phases/{code}/completed');
    expect(res.body.code).toBe('UNKNOWN_PHASE');
  });

  it('the fixed /phases routes are not swallowed by /phases/:code', async () => {
    // deployment-status, counts and active sit one path segment shorter than
    // /phases/:code/active so they cannot collide, but the arrangement is
    // load-bearing enough to pin.
    svc.getDeployedProcessKeys.mockResolvedValue([]);
    svc.getPhaseInstanceCounts.mockResolvedValue({});
    svc.getRipPhaseActiveList.mockResolvedValue([]);
    expect((await auth(request(app).get('/v1/rip/phases/deployment-status'))).status).toBe(200);
    expect((await auth(request(app).get('/v1/rip/phases/counts'))).status).toBe(200);
    const activeRes = await auth(request(app).get('/v1/rip/phases/active'));
    expect(activeRes.status).toBe(200);
    // The tell-tale sign of being swallowed by /phases/:code/active would be a
    // 404 UNKNOWN_PHASE (code="active" is not in the catalogue) — the aggregate
    // shape below is proof this hit the literal route instead.
    expect(activeRes.body.code).toBeUndefined();
    expect(activeRes.body.data).toEqual([]);
  });

  it('GET /phases/:code/completed → 500 on service failure', async () => {
    svc.getRipPhaseCompletedList.mockRejectedValue(new Error('boom'));
    const res = await auth(request(app).get('/v1/rip/phases/R2.1/completed'));
    expect(res.status).toBe(500);
    expectToMatchOperation(res, 'get', '/rip/phases/{code}/completed');
    expect(res.body.code).toBe('RIP_COMPLETED_LIST_FAILED');
  });
});

describe('GET /phases/active', () => {
  it('401 without a token', async () => {
    const res = await request(app).get('/v1/rip/phases/active');
    expect(res.status).toBe(401);
    expectToMatchOperation(res, 'get', '/rip/phases/active');
  });

  it('aggregates active instances across every modelled phase, tagging each row with its phaseCode', async () => {
    svc.getRipPhaseActiveList.mockImplementation((key: string) =>
      Promise.resolve(key === 'RipR21Process' ? [ripInstance()] : [])
    );
    const res = await auth(request(app).get('/v1/rip/phases/active'));
    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'get', '/rip/phases/active');
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual([ripInstance({ phaseCode: 'R2.1' })]);
    expect(svc.getRipPhaseActiveList).toHaveBeenCalledTimes(MODELLED_KEYS.length);
    expect(svc.getRipPhaseActiveList).toHaveBeenCalledWith('RipR21Process', 'flevoland');
    expect(svc.getRipPhaseActiveList).toHaveBeenCalledWith('RipR22Process', 'flevoland');
  });

  it('omits a failing phase rather than blanking the rest of the aggregate', async () => {
    svc.getRipPhaseActiveList.mockImplementation((key: string) => {
      if (key === 'RipR22Process') return Promise.reject('socket hang up'); // non-Error rejection
      return Promise.resolve(key === 'RipR21Process' ? [ripInstance()] : []);
    });
    const res = await auth(request(app).get('/v1/rip/phases/active'));
    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'get', '/rip/phases/active');
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual([ripInstance({ phaseCode: 'R2.1' })]);
    expect(
      (res.body.data as Array<{ phaseCode: string }>).some((r) => r.phaseCode === 'R2.2')
    ).toBe(false);
  });

  it('500s with RIP_ACTIVE_AGGREGATE_FAILED when every modelled phase fails', async () => {
    svc.getRipPhaseActiveList.mockRejectedValue(new Error('boom'));
    const res = await auth(request(app).get('/v1/rip/phases/active'));
    expect(res.status).toBe(500);
    expectToMatchOperation(res, 'get', '/rip/phases/active');
    expect(res.body.code).toBe('RIP_ACTIVE_AGGREGATE_FAILED');
  });
});

describe('GET /phases/completed', () => {
  const completed = (over: Record<string, unknown> = {}) =>
    ripInstance({ id: 'c1', endTime: '2026-10-08T10:00:00.000Z', ...over });

  it('401 without a token', async () => {
    const res = await request(app).get('/v1/rip/phases/completed');
    expect(res.status).toBe(401);
    expectToMatchOperation(res, 'get', '/rip/phases/completed');
  });

  it('aggregates completed instances across every modelled phase, tagging each row with its phaseCode', async () => {
    svc.getRipPhaseCompletedList.mockImplementation((key: string) =>
      Promise.resolve(key === 'RipR21Process' ? [completed()] : [])
    );
    const res = await auth(request(app).get('/v1/rip/phases/completed'));
    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'get', '/rip/phases/completed');
    expect(res.body.data).toEqual([completed({ phaseCode: 'R2.1' })]);
    expect(svc.getRipPhaseCompletedList).toHaveBeenCalledTimes(MODELLED_KEYS.length);
    expect(svc.getRipPhaseCompletedList).toHaveBeenCalledWith('RipR22Process', 'flevoland');
    expect(svc.getRipPhaseActiveList).not.toHaveBeenCalled();
  });

  it('is not swallowed by /phases/:code/completed', async () => {
    svc.getRipPhaseCompletedList.mockResolvedValue([]);
    const res = await auth(request(app).get('/v1/rip/phases/completed'));
    expect(res.status).toBe(200);
    expect(res.body.code).toBeUndefined();
    expect(res.body.data).toEqual([]);
  });

  it('omits a failing phase rather than blanking the rest of the aggregate', async () => {
    svc.getRipPhaseCompletedList.mockImplementation((key: string) => {
      if (key === 'RipR22Process') return Promise.reject('socket hang up');
      return Promise.resolve(key === 'RipR21Process' ? [completed()] : []);
    });
    const res = await auth(request(app).get('/v1/rip/phases/completed'));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([completed({ phaseCode: 'R2.1' })]);
  });

  it('500s with RIP_COMPLETED_AGGREGATE_FAILED when every modelled phase fails', async () => {
    svc.getRipPhaseCompletedList.mockRejectedValue(new Error('boom'));
    const res = await auth(request(app).get('/v1/rip/phases/completed'));
    expect(res.status).toBe(500);
    expectToMatchOperation(res, 'get', '/rip/phases/completed');
    expect(res.body.code).toBe('RIP_COMPLETED_AGGREGATE_FAILED');
  });
});

describe('GET /phases/deployment-status', () => {
  it('401 without a token', async () => {
    const res = await request(app).get('/v1/rip/phases/deployment-status');
    expect(res.status).toBe(401);
    expectToMatchOperation(res, 'get', '/rip/phases/deployment-status');
  });

  it('returns the deployed keys from the service', async () => {
    svc.getDeployedProcessKeys.mockResolvedValue(['RipR21Process']);
    const res = await auth(request(app).get('/v1/rip/phases/deployment-status'));
    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'get', '/rip/phases/deployment-status');
    expect(res.body.data).toEqual({ deployedKeys: ['RipR21Process'] });
    expect(svc.getDeployedProcessKeys).toHaveBeenCalledWith(MODELLED_KEYS, 'flevoland');
  });

  it('500 with DEPLOYMENT_STATUS_FAILED on service failure', async () => {
    svc.getDeployedProcessKeys.mockRejectedValue(new Error('boom'));
    const res = await auth(request(app).get('/v1/rip/phases/deployment-status'));
    expect(res.status).toBe(500);
    expectToMatchOperation(res, 'get', '/rip/phases/deployment-status');
    expect(res.body.code).toBe('DEPLOYMENT_STATUS_FAILED');
  });
});

describe('GET /phases/counts', () => {
  it('401 without a token', async () => {
    const res = await request(app).get('/v1/rip/phases/counts');
    expect(res.status).toBe(401);
    expectToMatchOperation(res, 'get', '/rip/phases/counts');
  });

  it('returns counts for the deployed keys only', async () => {
    svc.getDeployedProcessKeys.mockResolvedValue(['RipR21Process']);
    svc.getPhaseInstanceCounts.mockResolvedValue({
      RipR21Process: { wip: 3, gereed: 7 },
    });
    const res = await auth(request(app).get('/v1/rip/phases/counts'));
    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'get', '/rip/phases/counts');
    expect(res.body.data).toEqual({ counts: { RipR21Process: { wip: 3, gereed: 7 } } });
    expect(svc.getPhaseInstanceCounts).toHaveBeenCalledWith(['RipR21Process'], 'flevoland');
  });

  it('500 with PHASE_COUNTS_FAILED on service failure', async () => {
    svc.getDeployedProcessKeys.mockResolvedValue(['RipR21Process']);
    svc.getPhaseInstanceCounts.mockRejectedValue(new Error('boom'));
    const res = await auth(request(app).get('/v1/rip/phases/counts'));
    expect(res.status).toBe(500);
    expectToMatchOperation(res, 'get', '/rip/phases/counts');
    expect(res.body.code).toBe('PHASE_COUNTS_FAILED');
  });
});

describe('GET /instances/:instanceId/documents', () => {
  it('returns documents when the instance belongs to the tenant', async () => {
    svc.getRipInstanceDocuments.mockResolvedValue({
      variables: { municipality: 'flevoland' },
      intakeReport: { t: 'intake' },
      psuReport: null,
      pdp: null,
    });
    const res = await auth(request(app).get('/v1/rip/instances/pi-1/documents'));
    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'get', '/rip/instances/{instanceId}/documents');
    expect(res.body.data.intakeReport).toEqual({ t: 'intake' });
  });

  it('403 when the instance belongs to another tenant', async () => {
    svc.getRipInstanceDocuments.mockResolvedValue({
      variables: { municipality: 'utrecht' },
      intakeReport: null,
      psuReport: null,
      pdp: null,
    });
    const res = await auth(request(app).get('/v1/rip/instances/pi-1/documents'));
    expect(res.status).toBe(403);
    expectToMatchOperation(res, 'get', '/rip/instances/{instanceId}/documents');
    expect(res.body.code).toBe('TENANT_MISMATCH');
  });

  it('500 on service failure', async () => {
    svc.getRipInstanceDocuments.mockRejectedValue(new Error('boom'));
    const res = await auth(request(app).get('/v1/rip/instances/pi-1/documents'));
    expect(res.status).toBe(500);
    expectToMatchOperation(res, 'get', '/rip/instances/{instanceId}/documents');
    expect(res.body.code).toBe('RIP_DOCUMENTS_FAILED');
  });
});

describe('handler guards for an authenticated request without a user', () => {
  // jwtMiddleware always attaches req.user or rejects, so these guards are
  // defensive; they still have to answer 401 rather than crash on req.user.x.
  const noUser = (r: request.Test) => r.set('x-test-no-user', '1');

  it.each([
    ['/v1/rip/phases/active'],
    ['/v1/rip/phases/completed'],
    ['/v1/rip/phases/R2.1/active'],
    ['/v1/rip/phases/deployment-status'],
    ['/v1/rip/phases/counts'],
    ['/v1/rip/instances/pi-1/documents'],
    ['/v1/rip/phases/R2.1/completed'],
    ['/v1/rip/phases/R2.1/model'],
  ])('%s → 401 UNAUTHORIZED', async (path) => {
    const res = await noUser(request(app).get(path));
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });
});

describe('non-Error rejections', () => {
  // Operaton failures surface as strings often enough that the ternary's
  // 'Unknown error' fallback is a real path, not a formality.
  it('GET /phases/:code/active still answers 500', async () => {
    svc.getRipPhaseActiveList.mockRejectedValue('socket hang up');
    const res = await auth(request(app).get('/v1/rip/phases/R2.1/active'));
    expect(res.status).toBe(500);
    expectToMatchOperation(res, 'get', '/rip/phases/{code}/active');
    expect(res.body.code).toBe('RIP_LIST_FAILED');
  });

  it('GET /phases/active still answers 500 when every phase rejects without an Error', async () => {
    svc.getRipPhaseActiveList.mockRejectedValue('socket hang up');
    const res = await auth(request(app).get('/v1/rip/phases/active'));
    expect(res.status).toBe(500);
    expectToMatchOperation(res, 'get', '/rip/phases/active');
    expect(res.body.code).toBe('RIP_ACTIVE_AGGREGATE_FAILED');
  });

  it('GET /phases/deployment-status still answers 500', async () => {
    svc.getDeployedProcessKeys.mockRejectedValue('socket hang up');
    const res = await auth(request(app).get('/v1/rip/phases/deployment-status'));
    expect(res.status).toBe(500);
    expectToMatchOperation(res, 'get', '/rip/phases/deployment-status');
    expect(res.body.code).toBe('DEPLOYMENT_STATUS_FAILED');
  });

  it('GET /phases/counts still answers 500', async () => {
    svc.getDeployedProcessKeys.mockResolvedValue(['RipR21Process']);
    svc.getPhaseInstanceCounts.mockRejectedValue('socket hang up');
    const res = await auth(request(app).get('/v1/rip/phases/counts'));
    expect(res.status).toBe(500);
    expectToMatchOperation(res, 'get', '/rip/phases/counts');
    expect(res.body.code).toBe('PHASE_COUNTS_FAILED');
  });

  it('GET /instances/:instanceId/documents still answers 500', async () => {
    svc.getRipInstanceDocuments.mockRejectedValue('socket hang up');
    const res = await auth(request(app).get('/v1/rip/instances/pi-1/documents'));
    expect(res.status).toBe(500);
    expectToMatchOperation(res, 'get', '/rip/instances/{instanceId}/documents');
    expect(res.body.code).toBe('RIP_DOCUMENTS_FAILED');
  });

  it('GET /phases/:code/completed still answers 500', async () => {
    svc.getRipPhaseCompletedList.mockRejectedValue('socket hang up');
    const res = await auth(request(app).get('/v1/rip/phases/R2.1/completed'));
    expect(res.status).toBe(500);
    expectToMatchOperation(res, 'get', '/rip/phases/{code}/completed');
    expect(res.body.code).toBe('RIP_COMPLETED_LIST_FAILED');
  });

  it('GET /phases/:code/model still answers 500', async () => {
    svc.getPhaseSwimlaneModel.mockRejectedValue('socket hang up');
    const res = await auth(request(app).get('/v1/rip/phases/R2.1/model'));
    expect(res.status).toBe(500);
    expectToMatchOperation(res, 'get', '/rip/phases/{code}/model');
    expect(res.body.code).toBe('PHASE_MODEL_FAILED');
  });
});

describe('tenant isolation when the instance has no municipality', () => {
  it('refuses with TENANT_MISMATCH: an unlabelled instance belongs to no tenant', async () => {
    svc.getRipInstanceDocuments.mockResolvedValue({
      variables: {},
      intakeReport: { t: 'intake' },
      psuReport: null,
      pdp: null,
    });
    const res = await auth(request(app).get('/v1/rip/instances/pi-1/documents'));
    expect(res.status).toBe(403);
    expectToMatchOperation(res, 'get', '/rip/instances/{instanceId}/documents');
    expect(res.body.code).toBe('TENANT_MISMATCH');
  });
});

describe('GET /phases/:code/model', () => {
  // The route now delegates fetch+parse+cache to operatonService.getPhaseSwimlaneModel
  // (operaton.service.test.ts covers that pipeline against this same fixture,
  // including the cache itself); here the mock resolves with the real parsed
  // model so the route-layer assertions below still catch wrong-shape wiring.
  const r22Xml = readFileSync(
    join(__dirname, '../rip-swimlane/__fixtures__/RipR22Process.bpmn'),
    'utf-8'
  );
  const r22Model = parseSwimlane(r22Xml, 'R2.2');

  it('401 without a token', async () => {
    const res = await request(app).get('/v1/rip/phases/R2.2/model');
    expect(res.status).toBe(401);
    expectToMatchOperation(res, 'get', '/rip/phases/{code}/model');
  });

  it('returns a swimlane model derived from the deployed BPMN', async () => {
    svc.getPhaseSwimlaneModel.mockResolvedValue(r22Model);

    const res = await auth(request(app).get('/v1/rip/phases/R2.2/model'));

    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'get', '/rip/phases/{code}/model');
    expect(res.body.success).toBe(true);
    // Fixture-verified (bpmn-swimlane.test.ts): R2.2 has these exact 4 lanes,
    // 17 nodes and 21 edges. Asserting the counts and lane labels, not just
    // `success: true`, catches wrong-fixture or mis-wired parsing.
    expect(res.body.data.phaseCode).toBe('R2.2');
    expect(res.body.data.lanes.map((l: { label: string }) => l.label)).toEqual([
      'Projectleider',
      'Ontwerper',
      'RIP-team, Aandrager, Adviseur',
      'Omgevingsmanager',
    ]);
    expect(res.body.data.nodes).toHaveLength(17);
    expect(res.body.data.edges).toHaveLength(21);
    expect(svc.getPhaseSwimlaneModel).toHaveBeenCalledWith('RipR22Process', 'R2.2', 'flevoland');
  });

  it('404s an unknown phase code without touching the engine', async () => {
    const res = await auth(request(app).get('/v1/rip/phases/R9.9/model'));
    expect(res.status).toBe(404);
    expectToMatchOperation(res, 'get', '/rip/phases/{code}/model');
    expect(res.body.code).toBe('UNKNOWN_PHASE');
    expect(svc.getPhaseSwimlaneModel).not.toHaveBeenCalled();
  });

  it('500s with PHASE_MODEL_FAILED rather than half-rendering when the engine is unreachable', async () => {
    svc.getPhaseSwimlaneModel.mockRejectedValue(new Error('ECONNREFUSED'));
    const res = await auth(request(app).get('/v1/rip/phases/R2.2/model'));
    expect(res.status).toBe(500);
    expectToMatchOperation(res, 'get', '/rip/phases/{code}/model');
    expect(res.body.code).toBe('PHASE_MODEL_FAILED');
  });
});

describe('linked documents (Infra-board, werkwijze B / B+)', () => {
  const r21Docs = () => ({
    variables: { municipality: 'flevoland' },
    intakeReport: null,
    psuReport: null,
    pdp: null,
  });
  const LINK = {
    documentId: '3500001',
    documentNumber: '3500001',
    name: 'PSU-presentatie.pptx',
    linkedAt: '2026-11-23T10:00:00.000Z',
    linkedBy: 'u',
  };

  describe('GET /instances/:instanceId/documents', () => {
    it('adds every declared document and the kredietchecks', async () => {
      svc.getRipInstanceDocuments.mockResolvedValue(r21Docs());
      docs.listInstanceDocuments.mockResolvedValue({
        ...EMPTY_DOCUMENTS,
        edocsWorkspaceId: '77',
        documents: [
          {
            slug: 'rip-psu-presentatie',
            label: 'PSU-presentatie',
            kind: 'B',
            format: '3325975',
            taskKey: 'Task_UitvoerenPSU',
            taskName: 'Uitvoeren PSU',
            candidateGroups: ['rip-projectleider'],
            optional: false,
            map: false,
            status: 'linked',
            edocs: { documentId: '1', documentNumber: '3500001', version: '2', modified: null },
            figures: null,
            checklist: null,
          },
        ],
      });
      const res = await auth(request(app).get('/v1/rip/instances/pi-1/documents'));
      expect(res.status).toBe(200);
      expectToMatchOperation(res, 'get', '/rip/instances/{instanceId}/documents');
      expect(res.body.data.documents[0]).toMatchObject({ status: 'linked', kind: 'B' });
      expect(res.body.data.uploadTarget).toBe('edocs');
      expect(res.body.data.edocsWorkspaceId).toBe('77');
      expect(docs.listInstanceDocuments).toHaveBeenCalledWith('pi-1', { person: true });
    });

    it('still answers for a person without an eDOCS identity, reading no versions', async () => {
      svc.getRipInstanceDocuments.mockResolvedValue(r21Docs());
      const res = await auth(
        request(app).get('/v1/rip/instances/pi-1/documents').set('x-test-no-edocs', '1')
      );
      expect(res.status).toBe(200);
      expect(docs.listInstanceDocuments).toHaveBeenCalledWith('pi-1', null);
    });

    it('reads nothing from eDOCS for an instance of another tenant', async () => {
      svc.getRipInstanceDocuments.mockResolvedValue({
        ...r21Docs(),
        variables: { municipality: 'utrecht' },
      });
      docs.listInstanceDocuments.mockClear();
      const res = await auth(request(app).get('/v1/rip/instances/pi-1/documents'));
      expect(res.status).toBe(403);
      expect(docs.listInstanceDocuments).not.toHaveBeenCalled();
    });
  });

  describe('GET /instances/:instanceId/workspace', () => {
    it('lists the projectmap as the person', async () => {
      svc.getAccessVariables.mockResolvedValue({ municipality: 'flevoland' });
      docs.listInstanceWorkspace.mockResolvedValue({
        municipality: 'flevoland',
        workspaceId: '77',
        items: [
          {
            id: '1',
            name: 'Raming',
            documentNumber: '3500001',
            isFolder: false,
            version: '1',
            modified: null,
            author: null,
          },
        ],
      });
      const res = await auth(request(app).get('/v1/rip/instances/pi-1/workspace'));
      expect(res.status).toBe(200);
      expectToMatchOperation(res, 'get', '/rip/instances/{instanceId}/workspace');
      expect(res.body.data).toMatchObject({ workspaceId: '77', folderId: null });
      expect(docs.listInstanceWorkspace).toHaveBeenCalledWith('pi-1', { person: true }, undefined);
    });

    it('passes a folder id through', async () => {
      svc.getAccessVariables.mockResolvedValue({ municipality: 'flevoland' });
      docs.listInstanceWorkspace.mockResolvedValue({
        municipality: 'flevoland',
        workspaceId: '77',
        items: [],
      });
      const res = await auth(request(app).get('/v1/rip/instances/pi-1/workspace?folderId=88'));
      expect(res.status).toBe(200);
      expect(res.body.data.folderId).toBe('88');
      expect(docs.listInstanceWorkspace).toHaveBeenCalledWith('pi-1', { person: true }, '88');
    });

    it('refuses another tenant before listing anything', async () => {
      svc.getAccessVariables.mockResolvedValue({ municipality: 'utrecht' });
      docs.listInstanceWorkspace.mockClear();
      const res = await auth(request(app).get('/v1/rip/instances/pi-1/workspace'));
      expect(res.status).toBe(403);
      expectToMatchOperation(res, 'get', '/rip/instances/{instanceId}/workspace');
      expect(res.body.code).toBe('TENANT_MISMATCH');
      expect(docs.listInstanceWorkspace).not.toHaveBeenCalled();
    });

    it('needs an eDOCS identity', async () => {
      const res = await auth(
        request(app).get('/v1/rip/instances/pi-1/workspace').set('x-test-no-edocs', '1')
      );
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('EDOCS_USER_TOKEN_UNAVAILABLE');
    });

    it('maps a service refusal to its problem', async () => {
      svc.getAccessVariables.mockResolvedValue({ municipality: 'flevoland' });
      docs.listInstanceWorkspace.mockRejectedValue(
        new docs.RipDocumentError(409, 'NO_PROJECT_WORKSPACE', 'geen map')
      );
      const res = await auth(request(app).get('/v1/rip/instances/pi-1/workspace'));
      expect(res.status).toBe(409);
      expectToMatchOperation(res, 'get', '/rip/instances/{instanceId}/workspace');
      expect(res.body.code).toBe('NO_PROJECT_WORKSPACE');
    });

    it('answers 502 when eDOCS fails', async () => {
      svc.getAccessVariables.mockResolvedValue({ municipality: 'flevoland' });
      docs.listInstanceWorkspace.mockRejectedValue(new Error('ECONNRESET'));
      const res = await auth(request(app).get('/v1/rip/instances/pi-1/workspace'));
      expect(res.status).toBe(502);
      expectToMatchOperation(res, 'get', '/rip/instances/{instanceId}/workspace');
    });
  });

  describe('POST /instances/:instanceId/documents/:slug/link', () => {
    const post = (body: unknown, slug = 'rip-psu-presentatie') =>
      auth(
        request(app)
          .post(`/v1/rip/instances/pi-1/documents/${slug}/link`)
          .send(body as object)
      );

    it('links and audit-logs', async () => {
      docs.linkDocument.mockResolvedValue({
        municipality: 'flevoland',
        slug: 'rip-psu-presentatie',
        link: LINK,
      });
      const res = await post({ documentId: ' 3500001 ' });
      expect(res.status).toBe(200);
      expectToMatchOperation(res, 'post', '/rip/instances/{instanceId}/documents/{slug}/link');
      expect(res.body.data.link.documentNumber).toBe('3500001');
      expect(docs.linkDocument).toHaveBeenCalledWith(
        'pi-1',
        'rip-psu-presentatie',
        '3500001',
        { userId: 'u', roles: [] },
        { person: true },
        expect.any(Function)
      );
      expect(auditLog).toHaveBeenCalledWith(
        expect.anything(),
        'rip.document.link',
        'success',
        expect.objectContaining({ slug: 'rip-psu-presentatie', documentNumber: '3500001' })
      );
    });

    it('the tenant gate it hands the service refuses another tenant with 403', async () => {
      docs.linkDocument.mockImplementation(
        async (
          _i: string,
          _s: string,
          _d: string,
          _c: unknown,
          _e: unknown,
          authorize: (m: unknown) => boolean
        ) => (authorize('utrecht') ? { municipality: 'utrecht', slug: 's', link: LINK } : null)
      );
      const res = await post({ documentId: '1' });
      expect(res.status).toBe(403);
      expectToMatchOperation(res, 'post', '/rip/instances/{instanceId}/documents/{slug}/link');
      expect(res.body.code).toBe('TENANT_MISMATCH');
    });

    it.each([[{}], [{ documentId: '' }], [{ documentId: 42 }]])('400 on body %j', async (body) => {
      const res = await post(body);
      expect(res.status).toBe(400);
      expectToMatchOperation(res, 'post', '/rip/instances/{instanceId}/documents/{slug}/link');
      expect(res.body.code).toBe('INVALID_REQUEST');
    });

    it('400 on a malformed slug', async () => {
      const res = await post({ documentId: '1' }, 'Bad_Slug');
      expect(res.status).toBe(400);
    });

    it.each([
      [403, 'NOT_CANDIDATE'],
      [404, 'UNKNOWN_DOCUMENT'],
      [409, 'DOCUMENT_TASK_NOT_OPEN'],
      [422, 'DOCUMENT_NOT_IN_WORKSPACE'],
    ])('%i %s from the service', async (status, code) => {
      docs.linkDocument.mockRejectedValue(new docs.RipDocumentError(status, code, 'nee'));
      const res = await post({ documentId: '1' });
      expect(res.status).toBe(status);
      expectToMatchOperation(res, 'post', '/rip/instances/{instanceId}/documents/{slug}/link');
      expect(res.body.code).toBe(code);
      expect(auditLog).toHaveBeenCalledWith(
        expect.anything(),
        'rip.document.link',
        'failure',
        expect.objectContaining({ reason: code })
      );
    });

    it('answers 502 when eDOCS fails', async () => {
      docs.linkDocument.mockRejectedValue(new Error('timeout'));
      const res = await post({ documentId: '1' });
      expect(res.status).toBe(502);
      expectToMatchOperation(res, 'post', '/rip/instances/{instanceId}/documents/{slug}/link');
    });
  });

  describe('POST /instances/:instanceId/documents/:slug/upload', () => {
    const post = (body: unknown) =>
      auth(
        request(app)
          .post('/v1/rip/instances/pi-1/documents/rip-projectraming/upload')
          .send(body as object)
      );
    const file = { filename: 'Raming.xlsx', contentBase64: Buffer.from('xlsx').toString('base64') };

    it('uploads, links and answers 201', async () => {
      docs.uploadDocument.mockResolvedValue({
        municipality: 'flevoland',
        slug: 'rip-projectraming',
        link: { ...LINK, uploadedVia: 'ronl', inWorkspace: false },
      });
      const res = await post(file);
      expect(res.status).toBe(201);
      expectToMatchOperation(res, 'post', '/rip/instances/{instanceId}/documents/{slug}/upload');
      expect(res.body.data.link).toMatchObject({ uploadedVia: 'ronl', inWorkspace: false });
      expect(docs.uploadDocument).toHaveBeenCalledWith(
        'pi-1',
        'rip-projectraming',
        file,
        expect.anything(),
        { person: true },
        expect.any(Function)
      );
    });

    it.each([
      [{}],
      [{ filename: 'a.xlsx' }],
      [{ contentBase64: 'eA==' }],
      [{ filename: ' ', contentBase64: 'eA==' }],
    ])('400 on body %j', async (body) => {
      const res = await post(body);
      expect(res.status).toBe(400);
      expectToMatchOperation(res, 'post', '/rip/instances/{instanceId}/documents/{slug}/upload');
    });

    it.each([
      [409, 'MAP_UPLOAD_UNSUPPORTED'],
      [413, 'FILE_TOO_LARGE'],
    ])('%i %s from the service', async (status, code) => {
      docs.uploadDocument.mockRejectedValue(new docs.RipDocumentError(status, code, 'nee'));
      const res = await post(file);
      expect(res.status).toBe(status);
      expectToMatchOperation(res, 'post', '/rip/instances/{instanceId}/documents/{slug}/upload');
      expect(res.body.code).toBe(code);
    });

    it('takes a body larger than the app-wide 1 MB limit', async () => {
      docs.uploadDocument.mockResolvedValue({
        municipality: 'flevoland',
        slug: 'rip-projectraming',
        link: LINK,
      });
      const big = {
        filename: 'big.xlsx',
        contentBase64: Buffer.alloc(2 * 1024 * 1024, 1).toString('base64'),
      };
      const res = await post(big);
      expect(res.status).toBe(201);
    });
  });

  describe('isLinkedUploadPath', () => {
    it('matches only the upload route', () => {
      expect(isLinkedUploadPath('/v1/rip/instances/pi-1/documents/rip-x/upload')).toBe(true);
      expect(isLinkedUploadPath('/v1/rip/instances/pi-1/documents/rip-x/upload/')).toBe(true);
      expect(isLinkedUploadPath('/v1/rip/instances/pi-1/documents/rip-x/link')).toBe(false);
      expect(isLinkedUploadPath('/v1/rip/instances/pi-1/documents')).toBe(false);
      expect(isLinkedUploadPath('/v1/edocs/documents')).toBe(false);
    });
  });
});
