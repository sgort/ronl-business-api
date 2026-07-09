/**
 * Route tests for /v1/decision (jwt + tenant + assurance).
 * POST /:key/evaluate — variable type inference + operatonService.evaluateDecision.
 * GET  /:key         — decision definition lookup via global fetch.
 */

import type { Request, Response, NextFunction } from 'express';

jest.mock('@auth/jwt.middleware', () => ({
  jwtMiddleware: (req: Request, res: Response, next: NextFunction) => {
    if (!req.headers['x-test-auth'])
      return res.status(401).json({ success: false, error: { code: 'MISSING_TOKEN' } });
    req.user = {
      userId: 'u',
      tenantId: 'flevoland',
      assuranceLevel: 'substantieel',
    } as Request['user'];
    next();
  },
  requireAssuranceLevel: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));
jest.mock('@middleware/tenant.middleware', () => ({
  tenantMiddleware: (_req: Request, _res: Response, next: NextFunction) => next(),
}));
jest.mock('@services/operaton.service', () => ({
  operatonService: {
    evaluateDecision: jest.fn(),
    client: { defaults: { baseURL: 'http://operaton' } },
  },
}));
jest.mock('@middleware/audit.middleware', () => ({ auditLog: jest.fn() }));
jest.mock('@utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import express from 'express';
import request from 'supertest';
import decisionRouter from './decision.routes';
import { operatonService } from '@services/operaton.service';
import { auditLog } from '@middleware/audit.middleware';

const svc = operatonService as unknown as { evaluateDecision: jest.Mock };
const mockAuditLog = auditLog as jest.Mock;
const mockFetch = jest.fn();

const app = express();
app.use(express.json());
app.use('/v1/decision', decisionRouter);
const auth = (r: request.Test) => r.set('x-test-auth', '1');

beforeAll(() => {
  global.fetch = mockFetch as unknown as typeof fetch;
});
beforeEach(() => jest.clearAllMocks());

describe('POST /:key/evaluate', () => {
  it('401 without a token', async () => {
    const res = await request(app).post('/v1/decision/MyDec/evaluate').send({});
    expect(res.status).toBe(401);
  });

  it('infers Operaton variable types and evaluates the decision', async () => {
    svc.evaluateDecision.mockResolvedValue([{ approved: true }]);

    const res = await auth(request(app).post('/v1/decision/MyDec/evaluate')).send({
      variables: {
        count: 3, // Integer
        ratio: 1.5, // Double
        active: true, // Boolean
        name: 'Bob', // String
        payload: { a: 1 }, // Json
        empty: null, // Null
        prewrapped: { value: 9, type: 'Integer' }, // kept as-is
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([{ approved: true }]);

    const [key, vars, tenantId] = svc.evaluateDecision.mock.calls[0];
    expect(key).toBe('MyDec');
    expect(tenantId).toBe('flevoland');
    expect(vars).toEqual({
      count: { value: 3, type: 'Integer' },
      ratio: { value: 1.5, type: 'Double' },
      active: { value: true, type: 'Boolean' },
      name: { value: 'Bob', type: 'String' },
      payload: { value: { a: 1 }, type: 'Json' },
      empty: { value: null, type: 'Null' },
      prewrapped: { value: 9, type: 'Integer' },
    });
    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      'decision.evaluate.MyDec',
      'success',
      expect.any(Object)
    );
  });

  it('500 with the engine message and an error audit on failure', async () => {
    svc.evaluateDecision.mockRejectedValue(new Error('DMN configuratiefout'));

    const res = await auth(request(app).post('/v1/decision/MyDec/evaluate')).send({
      variables: {},
    });

    expect(res.status).toBe(500);
    expect(res.body.error).toEqual({
      code: 'DECISION_EVALUATION_FAILED',
      message: 'DMN configuratiefout',
    });
    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      'decision.evaluate.MyDec',
      'error',
      expect.any(Object)
    );
  });
});

describe('GET /:key', () => {
  it('returns the decision definition', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ id: 'def-1', key: 'MyDec' }) });

    const res = await auth(request(app).get('/v1/decision/MyDec'));

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: 'def-1', key: 'MyDec' });
    expect(mockFetch).toHaveBeenCalledWith(
      'http://operaton/decision-definition/key/MyDec',
      expect.any(Object)
    );
  });

  it('404 when the upstream lookup is not ok', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 });
    const res = await auth(request(app).get('/v1/decision/MyDec'));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('DECISION_NOT_FOUND');
  });

  it('404 when the fetch throws', async () => {
    mockFetch.mockRejectedValue(new Error('network'));
    const res = await auth(request(app).get('/v1/decision/MyDec'));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('DECISION_NOT_FOUND');
  });
});
