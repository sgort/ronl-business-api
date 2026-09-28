/**
 * Route tests for /v1/brp/personen — a jwt-gated proxy to the BRP mock API.
 * axios, the auth middleware, and auditLog are mocked.
 */

import type { Request, Response, NextFunction } from 'express';

jest.mock('@auth/jwt.middleware', () => {
  const mw = (req: Request, res: Response, next: NextFunction) => {
    // An authenticated request that carries no user: the shape each handler's own
    // `if (!req.user)` guard is written for, which jwtMiddleware itself never produces.
    if (req.headers['x-test-no-user']) return next();
    if (!req.headers['x-test-auth'])
      return res.status(401).json({ success: false, error: { code: 'MISSING_TOKEN' } });
    req.user = { userId: 'u', tenantId: 'flevoland' } as Request['user'];
    req.auth = { userId: 'u', tenantId: 'flevoland', requestId: 'r' } as Request['auth'];
    next();
  };
  return { __esModule: true, default: mw, jwtMiddleware: mw };
});
jest.mock('@middleware/audit.middleware', () => ({ auditLog: jest.fn() }));
jest.mock('axios', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
    isAxiosError: (e: unknown) => !!(e && (e as { isAxiosError?: boolean }).isAxiosError),
  },
}));
const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
jest.mock('@utils/logger', () => ({
  createLogger: () => mockLogger,
}));

import express from 'express';
import request from 'supertest';
import { versionMiddleware } from '@middleware/version.middleware';
import { expectToMatchOperation } from '@/openapi/testing/conformance';
import axios from 'axios';
import brpRouter from './brp.routes';
import { auditLog } from '@middleware/audit.middleware';

const mockPost = (axios as unknown as { post: jest.Mock }).post;
const mockAuditLog = auditLog as jest.Mock;

const app = express();
// versionMiddleware is app-wide in index.ts, not in the router, so a test
// app mounting the router alone answers without API-Version -- which
// expectToMatchOperation checks on every 2xx (ADR API-57). Mounting it here
// keeps the test app answering what the real one does (#269).
app.use(express.json());
app.use(versionMiddleware);
app.use('/v1/brp', brpRouter);
const auth = (r: request.Test) => r.set('x-test-auth', '1');

beforeEach(() => jest.clearAllMocks());

describe('POST /v1/brp/personen', () => {
  it('401 without a token', async () => {
    const res = await request(app).post('/v1/brp/personen').send({});
    expect(res.status).toBe(401);
    expectToMatchOperation(res, 'post', '/brp/personen');
  });

  it('proxies a successful response and audits it', async () => {
    mockPost.mockResolvedValue({ status: 200, data: { personen: [{ bsn: '1' }] } });

    const res = await auth(request(app).post('/v1/brp/personen')).send({
      burgerservicenummer: ['999990019'],
    });

    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'post', '/brp/personen');
    expect(res.body).toEqual({ success: true, data: { personen: [{ bsn: '1' }] } });
    expect(mockAuditLog).toHaveBeenCalledWith(expect.anything(), 'brp.personen.fetch', 'success', {
      bsn: '999990019',
    });
  });

  it('passes a BRP 4xx through as BRP_API_ERROR', async () => {
    mockPost.mockResolvedValue({ status: 404, data: { message: 'not found' } });

    const res = await auth(request(app).post('/v1/brp/personen')).send({});

    expect(res.status).toBe(404);
    expectToMatchOperation(res, 'post', '/brp/personen');
    expect(res.body.error.code).toBe('BRP_API_ERROR');
    expect(res.body.error.details).toEqual({ message: 'not found' });
  });

  it('maps an axios error to its upstream status and message', async () => {
    mockPost.mockRejectedValue({
      isAxiosError: true,
      response: { status: 502, data: { message: 'upstream boom' } },
    });

    const res = await auth(request(app).post('/v1/brp/personen')).send({});

    expect(res.status).toBe(502);
    expectToMatchOperation(res, 'post', '/brp/personen');
    expect(res.body.error.message).toBe('upstream boom');
    expect(mockAuditLog).toHaveBeenCalledWith(expect.anything(), 'brp.personen.fetch', 'error', {
      error: expect.any(String),
    });
  });

  it('falls back to 500 for a non-axios error', async () => {
    mockPost.mockRejectedValue(new Error('network'));

    const res = await auth(request(app).post('/v1/brp/personen')).send({});

    expect(res.status).toBe(500);
    expectToMatchOperation(res, 'post', '/brp/personen');
    expect(res.body.error.message).toBe('BRP API request failed');
  });
});

describe('BRP application logging (#241)', () => {
  const BSN = '999992235';
  const query = {
    type: 'RaadpleegMetBurgerservicenummer',
    burgerservicenummer: [BSN, '999990019'],
    fields: ['burgerservicenummer', 'naam'],
  };
  const allLogged = () =>
    JSON.stringify([...mockLogger.info.mock.calls, ...mockLogger.error.mock.calls]);

  it('logs who asked, the query type and the subject count — never the BSN', async () => {
    mockPost.mockResolvedValue({ status: 200, data: { personen: [] } });

    await auth(request(app).post('/v1/brp/personen')).send(query);

    expect(mockLogger.info).toHaveBeenCalledWith('BRP personen request', {
      userId: 'u',
      tenantId: 'flevoland',
      queryType: 'RaadpleegMetBurgerservicenummer',
      bsnCount: 2,
    });
    expect(allLogged()).not.toContain(BSN);
  });

  it('counts zero subjects when the query carries no burgerservicenummer list', async () => {
    mockPost.mockResolvedValue({ status: 200, data: { personen: [] } });

    await auth(request(app).post('/v1/brp/personen')).send({});

    expect(mockLogger.info).toHaveBeenCalledWith(
      'BRP personen request',
      expect.objectContaining({ queryType: undefined, bsnCount: 0 })
    );
  });

  it('does not log an upstream 4xx body that echoes the query', async () => {
    mockPost.mockResolvedValue({
      status: 400,
      data: { code: 'paramsValidation', detail: `burgerservicenummer ${BSN} is ongeldig` },
    });

    await auth(request(app).post('/v1/brp/personen')).send(query);

    expect(mockLogger.error).toHaveBeenCalledWith('BRP API returned error', {
      status: 400,
      upstreamCode: 'paramsValidation',
    });
    expect(allLogged()).not.toContain(BSN);
  });

  it('does not log the upstream body of a failed request', async () => {
    mockPost.mockRejectedValue({
      isAxiosError: true,
      response: { status: 502, data: { message: `timeout for ${BSN}` } },
    });

    await auth(request(app).post('/v1/brp/personen')).send(query);

    expect(mockLogger.error).toHaveBeenCalledWith('BRP API request failed', {
      error: 'Unknown error',
      userId: 'u',
      upstreamStatus: 502,
    });
    expect(allLogged()).not.toContain(BSN);
  });
});

describe('BRP request options', () => {
  it('treats an upstream 4xx as a response to inspect, not an exception', async () => {
    mockPost.mockResolvedValue({ status: 200, data: { personen: [] } });

    await auth(request(app).post('/v1/brp/personen')).send({});

    const options = mockPost.mock.calls[0][2] as { validateStatus: (s: number) => boolean };
    // The handler maps a 4xx body onto BRP_API_ERROR itself, so those must
    // resolve; a 5xx stays an exception for the catch to translate.
    expect(options.validateStatus(400)).toBe(true);
    expect(options.validateStatus(404)).toBe(true);
    expect(options.validateStatus(499)).toBe(true);
    expect(options.validateStatus(500)).toBe(false);
    expect(options.validateStatus(502)).toBe(false);
  });
});
