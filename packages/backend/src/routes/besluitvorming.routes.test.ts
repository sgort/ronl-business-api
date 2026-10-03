/**
 * Route tests for /v1/besluitvorming (jwt + tenant): the running and completed
 * GedelegeerdBesluitProcess lists. operatonService is mocked.
 */

import type { Request, Response, NextFunction } from 'express';

jest.mock('@auth/jwt.middleware', () => ({
  jwtMiddleware: (req: Request, res: Response, next: NextFunction) => {
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
  operatonService: { getBesluitList: jest.fn() },
}));
jest.mock('@utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import express from 'express';
import request from 'supertest';
import { versionMiddleware } from '@middleware/version.middleware';
import { expectToMatchOperation } from '@/openapi/testing/conformance';
import besluitvormingRouter from './besluitvorming.routes';
import { operatonService } from '@services/operaton.service';

const svc = operatonService as unknown as { getBesluitList: jest.Mock };

const app = express();
app.use(versionMiddleware);
app.use('/v1/besluitvorming', besluitvormingRouter);
const auth = (r: request.Test) => r.set('x-test-auth', '1');

const row = {
  id: 'pi-1',
  businessKey: 'flevoland-1',
  startTime: '2026-10-02T09:00:00.000+0200',
  endTime: null,
  onderwerp: 'Opdracht schoonmaak',
  besluitType: 'standaard',
  financieleGevolgen: 12000,
  uitkomst: null,
  huidigeStap: 'Advies en toetsing',
  kenmerk: null,
  zaaknummer: null,
  motivering: null,
  voorgesteldBesluit: null,
  escalatieReden: null,
};

beforeEach(() => jest.clearAllMocks());

describe.each([
  ['active', 'lopend'],
  ['completed', 'afgerond'],
] as const)('GET /%s', (path, state) => {
  it('401 without a token', async () => {
    const res = await request(app).get(`/v1/besluitvorming/${path}`);
    expect(res.status).toBe(401);
    expectToMatchOperation(res, 'get', `/besluitvorming/${path}`);
  });

  it("returns the tenant's besluiten", async () => {
    svc.getBesluitList.mockResolvedValue([row]);
    const res = await auth(request(app).get(`/v1/besluitvorming/${path}`));
    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'get', `/besluitvorming/${path}`);
    expect(res.body.data).toEqual([row]);
    expect(svc.getBesluitList).toHaveBeenCalledWith('flevoland', state);
  });

  it('500 on service failure', async () => {
    svc.getBesluitList.mockRejectedValue(new Error('boom'));
    const res = await auth(request(app).get(`/v1/besluitvorming/${path}`));
    expect(res.status).toBe(500);
    expectToMatchOperation(res, 'get', `/besluitvorming/${path}`);
    expect(res.body.code).toBe('BESLUIT_LIST_FAILED');
  });

  it('500 when the service rejects with something other than an Error', async () => {
    svc.getBesluitList.mockRejectedValue('boom');
    const res = await auth(request(app).get(`/v1/besluitvorming/${path}`));
    expect(res.status).toBe(500);
    expect(res.body.code).toBe('BESLUIT_LIST_FAILED');
  });

  it('401 for an authenticated request without a user', async () => {
    const res = await request(app).get(`/v1/besluitvorming/${path}`).set('x-test-no-user', '1');
    expect(res.status).toBe(401);
  });
});
