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
      return res.status(401).type('application/problem+json').json({
        type: 'about:blank',
        status: 401,
        title: 'Missing token',
        detail: 'Missing token',
        instance: req.originalUrl,
        code: 'MISSING_TOKEN',
      });
    // Default: a brp-raadpleger at substantieel (#319), who may look up anyone,
    // so the upstream-behaviour tests below need no BSN of their own. The
    // access tests set a citizen through these headers instead.
    const header = (name: string) => req.headers[name] as string | undefined;
    req.user = {
      userId: 'u',
      tenantId: 'flevoland',
      roles: (header('x-test-roles') ?? 'caseworker,brp-raadpleger').split(','),
      assuranceLevel: header('x-test-loa') ?? 'substantieel',
      bsn: header('x-test-bsn'),
    } as Request['user'];
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
      via: 'brp-raadpleger',
    });
  });

  it('passes a BRP 4xx through as BRP_API_ERROR', async () => {
    mockPost.mockResolvedValue({ status: 404, data: { message: 'not found' } });

    const res = await auth(request(app).post('/v1/brp/personen')).send({});

    expect(res.status).toBe(404);
    expectToMatchOperation(res, 'post', '/brp/personen');
    expect(res.body.code).toBe('BRP_API_ERROR');
    expect(res.body.details).toEqual({ message: 'not found' });
  });

  it('maps an axios error to its upstream status and message', async () => {
    mockPost.mockRejectedValue({
      isAxiosError: true,
      response: { status: 502, data: { message: 'upstream boom' } },
    });

    const res = await auth(request(app).post('/v1/brp/personen')).send({});

    expect(res.status).toBe(502);
    expectToMatchOperation(res, 'post', '/brp/personen');
    expect(res.body.detail).toBe('upstream boom');
    expect(mockAuditLog).toHaveBeenCalledWith(expect.anything(), 'brp.personen.fetch', 'error', {
      error: expect.any(String),
    });
  });

  it('502 BRP_UPSTREAM_UNREACHABLE when the TLS handshake fails, naming the cause in the log only', async () => {
    // The 13 November 2026 outage: the upstream's proxy served a certificate for
    // another host. axios rejects with no response, which used to become a bare 500.
    const tlsMessage =
      "Hostname/IP does not match certificate's altnames: Host: brp-api-mock.open-regels.nl.";
    mockPost.mockRejectedValue(
      Object.assign(new Error(tlsMessage), {
        isAxiosError: true,
        code: 'ERR_TLS_CERT_ALTNAME_INVALID',
      })
    );

    const res = await auth(request(app).post('/v1/brp/personen')).send({});

    expect(res.status).toBe(502);
    expectToMatchOperation(res, 'post', '/brp/personen');
    expect(res.body.code).toBe('BRP_UPSTREAM_UNREACHABLE');
    expect(res.body.detail).toBe('The BRP API could not be reached');
    expect(JSON.stringify(res.body)).not.toContain('altnames');
    expect(mockLogger.error).toHaveBeenCalledWith(
      'BRP API request failed',
      expect.objectContaining({ transportError: 'ERR_TLS_CERT_ALTNAME_INVALID' })
    );
    expect(mockAuditLog).toHaveBeenCalledWith(expect.anything(), 'brp.personen.fetch', 'error', {
      error: tlsMessage,
    });
  });

  it('502 BRP_UPSTREAM_UNREACHABLE on a timeout or DNS failure too', async () => {
    for (const code of ['ECONNABORTED', 'ENOTFOUND']) {
      mockPost.mockRejectedValueOnce(Object.assign(new Error(code), { isAxiosError: true, code }));

      const res = await auth(request(app).post('/v1/brp/personen')).send({});

      expect(res.status).toBe(502);
      expect(res.body.code).toBe('BRP_UPSTREAM_UNREACHABLE');
      expect(mockLogger.error).toHaveBeenLastCalledWith(
        'BRP API request failed',
        expect.objectContaining({ transportError: code })
      );
    }
  });

  it('falls back to 500 for a non-axios error', async () => {
    mockPost.mockRejectedValue(new Error('network'));

    const res = await auth(request(app).post('/v1/brp/personen')).send({});

    expect(res.status).toBe(500);
    expectToMatchOperation(res, 'post', '/brp/personen');
    expect(res.body.detail).toBe('BRP API request failed');
  });
});

// #319: who may look up whom. The rule itself is unit-tested in
// auth/brp-access.test.ts; these check that the route applies it before the
// upstream is called, answers with problem details and audits the refusal.
describe('POST /v1/brp/personen access (#319)', () => {
  const asCitizen = (r: request.Test, loa = 'hoog', bsn: string | null = '999990019') => {
    const t = auth(r).set('x-test-roles', 'citizen').set('x-test-loa', loa);
    return bsn === null ? t : t.set('x-test-bsn', bsn);
  };

  it('lets a citizen at hoog look up their own record', async () => {
    mockPost.mockResolvedValue({ status: 200, data: { personen: [] } });
    const res = await asCitizen(request(app).post('/v1/brp/personen')).send({
      type: 'RaadpleegMetBurgerservicenummer',
      burgerservicenummer: ['999990019'],
    });
    expect(res.status).toBe(200);
    expect(mockPost).toHaveBeenCalled();
    expect(mockAuditLog).toHaveBeenCalledWith(expect.anything(), 'brp.personen.fetch', 'success', {
      bsn: '999990019',
      via: 'own-record',
    });
  });

  it.each([
    ['someone else’s BSN', 'hoog', '999990019', ['999992235'], 'BRP_SUBJECT_MISMATCH'],
    [
      'a list mixing the own BSN with another',
      'hoog',
      '999990019',
      ['999990019', '999992235'],
      'BRP_SUBJECT_MISMATCH',
    ],
    ['a citizen below hoog', 'substantieel', '999990019', ['999990019'], 'INSUFFICIENT_ASSURANCE'],
    ['a login without a bsn claim', 'hoog', null, ['999990019'], 'BSN_CLAIM_MISSING'],
  ])('403 for %s, before the upstream is called', async (_label, loa, bsn, requested, code) => {
    const res = await asCitizen(request(app).post('/v1/brp/personen'), loa, bsn).send({
      type: 'RaadpleegMetBurgerservicenummer',
      burgerservicenummer: requested,
    });
    expect(res.status).toBe(403);
    expectToMatchOperation(res, 'post', '/brp/personen');
    expect(res.body.code).toBe(code);
    expect(mockPost).not.toHaveBeenCalled();
    // The refusal is audited with the subject asked for (the audit log keeps
    // the BSN on purpose; the application log never does).
    expect(mockAuditLog).toHaveBeenCalledWith(expect.anything(), 'brp.personen.fetch', 'failure', {
      reason: code,
      bsn: requested[0],
    });
  });

  it('403 for a brp-raadpleger below substantieel', async () => {
    const res = await auth(request(app).post('/v1/brp/personen'))
      .set('x-test-loa', 'midden')
      .send({ burgerservicenummer: ['999992235'] });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('INSUFFICIENT_ASSURANCE');
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('lets a brp-raadpleger at substantieel look up anyone', async () => {
    mockPost.mockResolvedValue({ status: 200, data: { personen: [] } });
    const res = await auth(request(app).post('/v1/brp/personen')).send({
      burgerservicenummer: ['999992235'],
    });
    expect(res.status).toBe(200);
  });

  it('401 for an authenticated request with no user, before any check', async () => {
    const res = await request(app)
      .post('/v1/brp/personen')
      .set('x-test-no-user', '1')
      .send({ burgerservicenummer: ['999990019'] });
    expect(res.status).toBe(401);
    expect(mockPost).not.toHaveBeenCalled();
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
