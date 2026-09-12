/**
 * Route tests for the Doccle HTTP surface (/v1/doccle).
 * Verifies the jwt gate, /status shape (stub/up/down), and every endpoint's
 * happy path, field validation (400), and service-failure mapping (502).
 *
 * The service is mocked — these tests own the routing/validation/error-mapping
 * layer; doccle.service.test.ts owns the service behaviour.
 */

import type { Request, Response, NextFunction } from 'express';

jest.mock('@auth/jwt.middleware', () => ({
  jwtMiddleware: (req: Request, res: Response, next: NextFunction) => {
    if (!req.headers['x-test-auth']) {
      return res.status(401).json({ success: false, error: { code: 'MISSING_TOKEN' } });
    }
    req.user = {
      userId: 'test-user',
      tenantId: 'flevoland',
      roles: ['public-affairs'],
      organisationType: 'province',
      assuranceLevel: 'substantieel',
      displayName: 'Test User',
      preferredUsername: 'test-user',
    };
    next();
  },
}));

jest.mock('@services/doccle.service', () => ({
  doccleService: {
    healthCheck: jest.fn(),
    createOrUpdateReceiver: jest.fn(),
    putDocument: jest.fn(),
    markDocumentPaid: jest.fn(),
  },
}));

jest.mock('@utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

import express from 'express';
import request from 'supertest';
import doccleRouter from './doccle.routes';
import { doccleService } from '@services/doccle.service';

const svc = doccleService as unknown as {
  healthCheck: jest.Mock;
  createOrUpdateReceiver: jest.Mock;
  putDocument: jest.Mock;
  markDocumentPaid: jest.Mock;
};

const app = express();
app.use(express.json());
app.use('/v1/doccle', doccleRouter);

const auth = (r: request.Test) => r.set('x-test-auth', '1');

beforeEach(() => jest.clearAllMocks());

describe('auth gate', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const res = await request(app).get('/v1/doccle/status');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('MISSING_TOKEN');
    expect(svc.healthCheck).not.toHaveBeenCalled();
  });
});

describe('GET /status', () => {
  it('reports stub + reachable in stub mode', async () => {
    svc.healthCheck.mockResolvedValue({ status: 'stub', reachable: true });
    const res = await auth(request(app).get('/v1/doccle/status'));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'stub', stubMode: true, reachable: true });
  });

  it('reports up + reachable with latency and a reachability-only note when live', async () => {
    svc.healthCheck.mockResolvedValue({
      status: 'up',
      reachable: true,
      latency: 42,
      note: 'Reachability only',
    });
    const res = await auth(request(app).get('/v1/doccle/status'));
    expect(res.body.data).toMatchObject({
      status: 'up',
      stubMode: false,
      reachable: true,
      latencyMs: 42,
      note: 'Reachability only',
    });
  });

  it('reports unreachable when the host is down', async () => {
    svc.healthCheck.mockResolvedValue({ status: 'down', reachable: false, error: 'ECONNREFUSED' });
    const res = await auth(request(app).get('/v1/doccle/status'));
    expect(res.body.data).toMatchObject({
      status: 'down',
      reachable: false,
      error: 'ECONNREFUSED',
    });
  });
});

describe('PUT /senders/:senderName/receivers/:externalReference', () => {
  it('400s when receiver.id is missing', async () => {
    const res = await auth(request(app).put('/v1/doccle/senders/acme/receivers/ref-1')).send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MISSING_FIELDS');
    expect(svc.createOrUpdateReceiver).not.toHaveBeenCalled();
  });

  it('creates/updates the receiver on success', async () => {
    svc.createOrUpdateReceiver.mockResolvedValue({ created: true });
    const res = await auth(request(app).put('/v1/doccle/senders/acme/receivers/ref-1')).send({
      id: 'ref-1',
      personalInformation: { firstName: 'Jane' },
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ created: true });
    expect(svc.createOrUpdateReceiver).toHaveBeenCalledWith('acme', 'ref-1', {
      id: 'ref-1',
      personalInformation: { firstName: 'Jane' },
    });
  });

  it('maps a service failure to 502 DOCCLE_ERROR', async () => {
    svc.createOrUpdateReceiver.mockRejectedValue(new Error('boom'));
    const res = await auth(request(app).put('/v1/doccle/senders/acme/receivers/ref-1')).send({
      id: 'ref-1',
    });
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('DOCCLE_ERROR');
  });
});

describe('POST /senders/:senderName/receivers/:externalReferenceId/documents/:documentId', () => {
  const valid = {
    senderDocumentType: 'INFO',
    documentFile: { reference: 'f.pdf', contentBase64: 'YmFzZTY0', mimeType: 'application/pdf' },
  };

  it('400s when documentFile is missing required fields', async () => {
    const res = await auth(
      request(app).post('/v1/doccle/senders/acme/receivers/ref-1/documents/doc-1')
    ).send({ documentFile: {} });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MISSING_FIELDS');
    expect(svc.putDocument).not.toHaveBeenCalled();
  });

  it('sends the document and returns the resulting uri on success', async () => {
    svc.putDocument.mockResolvedValue({ documentUri: 'uri-1', remPickupUrl: 'http://pickup' });
    const res = await auth(
      request(app).post('/v1/doccle/senders/acme/receivers/ref-1/documents/doc-1')
    ).send(valid);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ documentUri: 'uri-1', remPickupUrl: 'http://pickup' });
    expect(svc.putDocument).toHaveBeenCalledWith('acme', 'ref-1', 'doc-1', valid);
  });

  it('maps a service failure to 502', async () => {
    svc.putDocument.mockRejectedValue(new Error('boom'));
    const res = await auth(
      request(app).post('/v1/doccle/senders/acme/receivers/ref-1/documents/doc-1')
    ).send(valid);
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('DOCCLE_ERROR');
  });
});

describe('POST /senders/:senderName/receivers/:externalReferenceId/documents/:documentId/paid', () => {
  it('marks the document paid on success', async () => {
    svc.markDocumentPaid.mockResolvedValue(undefined);
    const res = await auth(
      request(app).post('/v1/doccle/senders/acme/receivers/ref-1/documents/doc-1/paid')
    );
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(svc.markDocumentPaid).toHaveBeenCalledWith('acme', 'ref-1', 'doc-1');
  });

  it('maps a service failure to 502', async () => {
    svc.markDocumentPaid.mockRejectedValue(new Error('boom'));
    const res = await auth(
      request(app).post('/v1/doccle/senders/acme/receivers/ref-1/documents/doc-1/paid')
    );
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('DOCCLE_ERROR');
  });
});
