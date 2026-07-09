/**
 * Route tests for /v1/brp/personen — a jwt-gated proxy to the BRP mock API.
 * axios, the auth middleware, and auditLog are mocked.
 */

import type { Request, Response, NextFunction } from 'express';

jest.mock('@auth/jwt.middleware', () => {
  const mw = (req: Request, res: Response, next: NextFunction) => {
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
jest.mock('@utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import express from 'express';
import request from 'supertest';
import axios from 'axios';
import brpRouter from './brp.routes';
import { auditLog } from '@middleware/audit.middleware';

const mockPost = (axios as unknown as { post: jest.Mock }).post;
const mockAuditLog = auditLog as jest.Mock;

const app = express();
app.use(express.json());
app.use('/v1/brp', brpRouter);
const auth = (r: request.Test) => r.set('x-test-auth', '1');

beforeEach(() => jest.clearAllMocks());

describe('POST /v1/brp/personen', () => {
  it('401 without a token', async () => {
    const res = await request(app).post('/v1/brp/personen').send({});
    expect(res.status).toBe(401);
  });

  it('proxies a successful response and audits it', async () => {
    mockPost.mockResolvedValue({ status: 200, data: { personen: [{ bsn: '1' }] } });

    const res = await auth(request(app).post('/v1/brp/personen')).send({
      burgerservicenummer: ['999990019'],
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { personen: [{ bsn: '1' }] } });
    expect(mockAuditLog).toHaveBeenCalledWith(expect.anything(), 'brp.personen.fetch', 'success', {
      bsn: '999990019',
    });
  });

  it('passes a BRP 4xx through as BRP_API_ERROR', async () => {
    mockPost.mockResolvedValue({ status: 404, data: { message: 'not found' } });

    const res = await auth(request(app).post('/v1/brp/personen')).send({});

    expect(res.status).toBe(404);
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
    expect(res.body.error.message).toBe('upstream boom');
    expect(mockAuditLog).toHaveBeenCalledWith(expect.anything(), 'brp.personen.fetch', 'error', {
      error: expect.any(String),
    });
  });

  it('falls back to 500 for a non-axios error', async () => {
    mockPost.mockRejectedValue(new Error('network'));

    const res = await auth(request(app).post('/v1/brp/personen')).send({});

    expect(res.status).toBe(500);
    expect(res.body.error.message).toBe('BRP API request failed');
  });
});
