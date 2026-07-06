/**
 * Route tests for the eDOCS HTTP surface (/v1/edocs).
 * Verifies the jwt gate, /status shape (stub/up/down), and every endpoint's
 * happy path, field validation (400), and service-failure mapping (502).
 *
 * The service is mocked — these tests own the routing/validation/error-mapping
 * layer; edocs.service.test.ts owns the service behaviour.
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

jest.mock('@services/edocs.service', () => ({
  edocsService: {
    healthCheck: jest.fn(),
    listWorkspaces: jest.fn(),
    ensureWorkspace: jest.fn(),
    uploadDocument: jest.fn(),
    getWorkspaceDocuments: jest.fn(),
  },
}));

jest.mock('@utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

import express from 'express';
import request from 'supertest';
import edocsRouter from './edocs.routes';
import { edocsService } from '@services/edocs.service';

const svc = edocsService as unknown as {
  healthCheck: jest.Mock;
  listWorkspaces: jest.Mock;
  ensureWorkspace: jest.Mock;
  uploadDocument: jest.Mock;
  getWorkspaceDocuments: jest.Mock;
};

const app = express();
app.use(express.json());
app.use('/v1/edocs', edocsRouter);

const auth = (r: request.Test) => r.set('x-test-auth', '1');

beforeEach(() => jest.clearAllMocks());

describe('auth gate', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const res = await request(app).get('/v1/edocs/status');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('MISSING_TOKEN');
    expect(svc.healthCheck).not.toHaveBeenCalled();
  });
});

describe('GET /status', () => {
  it('reports stub + reachable + authenticated in stub mode', async () => {
    svc.healthCheck.mockResolvedValue({ status: 'stub', reachable: true, authenticated: true });
    const res = await auth(request(app).get('/v1/edocs/status'));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      status: 'stub',
      stubMode: true,
      reachable: true,
      authenticated: true,
    });
    expect(res.body.data.latencyMs).toBeUndefined();
  });

  it('reports up + authenticated with latency when live and logged in', async () => {
    svc.healthCheck.mockResolvedValue({
      status: 'up',
      reachable: true,
      authenticated: true,
      latency: 42,
    });
    const res = await auth(request(app).get('/v1/edocs/status'));
    expect(res.body.data).toMatchObject({
      status: 'up',
      stubMode: false,
      reachable: true,
      authenticated: true,
      latencyMs: 42,
    });
  });

  it('distinguishes reachable-but-not-authenticated (login failure) from unreachable', async () => {
    svc.healthCheck.mockResolvedValue({
      status: 'down',
      reachable: true,
      authenticated: false,
      error: 'account is currently locked out',
    });
    const res = await auth(request(app).get('/v1/edocs/status'));
    expect(res.body.data).toMatchObject({
      status: 'down',
      reachable: true,
      authenticated: false,
      error: 'account is currently locked out',
    });
  });

  it('reports unreachable when the server itself is down', async () => {
    svc.healthCheck.mockResolvedValue({
      status: 'down',
      reachable: false,
      authenticated: false,
      error: 'ECONNREFUSED',
    });
    const res = await auth(request(app).get('/v1/edocs/status'));
    expect(res.body.data).toMatchObject({ status: 'down', reachable: false, authenticated: false });
  });
});

describe('GET /workspaces', () => {
  it('returns the workspace list on success', async () => {
    svc.listWorkspaces.mockResolvedValue([{ id: 'ws-1' }]);
    const res = await auth(request(app).get('/v1/edocs/workspaces'));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, data: [{ id: 'ws-1' }] });
  });

  it('maps a service failure to 502 EDOCS_ERROR', async () => {
    svc.listWorkspaces.mockRejectedValue(new Error('boom'));
    const res = await auth(request(app).get('/v1/edocs/workspaces'));
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('EDOCS_ERROR');
  });
});

describe('POST /workspaces/ensure', () => {
  it('400s when required fields are missing', async () => {
    const res = await auth(request(app).post('/v1/edocs/workspaces/ensure')).send({
      projectNumber: 'P-1',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MISSING_FIELDS');
    expect(svc.ensureWorkspace).not.toHaveBeenCalled();
  });

  it('returns the ensured workspace on success', async () => {
    svc.ensureWorkspace.mockResolvedValue({
      workspaceId: 'ws-9',
      workspaceName: 'P-1 — Proj',
      created: true,
    });
    const res = await auth(request(app).post('/v1/edocs/workspaces/ensure')).send({
      projectNumber: 'P-1',
      projectName: 'Proj',
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ workspaceId: 'ws-9', created: true });
    expect(svc.ensureWorkspace).toHaveBeenCalledWith('P-1', 'Proj');
  });

  it('maps a service failure to 502', async () => {
    svc.ensureWorkspace.mockRejectedValue(new Error('boom'));
    const res = await auth(request(app).post('/v1/edocs/workspaces/ensure')).send({
      projectNumber: 'P-1',
      projectName: 'Proj',
    });
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('EDOCS_ERROR');
  });
});

describe('POST /documents', () => {
  const valid = {
    workspaceId: 'ws-1',
    filename: 'a.pdf',
    contentBase64: 'YmFzZTY0',
    metadata: { docName: 'Doc' },
  };

  it('400s when metadata.docName is missing', async () => {
    const res = await auth(request(app).post('/v1/edocs/documents')).send({
      ...valid,
      metadata: {},
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MISSING_FIELDS');
    expect(svc.uploadDocument).not.toHaveBeenCalled();
  });

  it('uploads and returns the document on success', async () => {
    svc.uploadDocument.mockResolvedValue({
      documentId: 'doc-1',
      documentNumber: '555',
      workspaceId: 'ws-1',
    });
    const res = await auth(request(app).post('/v1/edocs/documents')).send(valid);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ documentId: 'doc-1', documentNumber: '555' });
    expect(svc.uploadDocument).toHaveBeenCalledWith('ws-1', 'a.pdf', 'YmFzZTY0', {
      docName: 'Doc',
    });
  });

  it('maps a service failure to 502', async () => {
    svc.uploadDocument.mockRejectedValue(new Error('boom'));
    const res = await auth(request(app).post('/v1/edocs/documents')).send(valid);
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('EDOCS_ERROR');
  });
});

describe('GET /workspaces/:workspaceId/documents', () => {
  it('returns the documents scoped to the workspace', async () => {
    svc.getWorkspaceDocuments.mockResolvedValue([
      { id: 'd1', name: 'one.pdf', documentNumber: '111' },
    ]);
    const res = await auth(request(app).get('/v1/edocs/workspaces/ws-1/documents'));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      workspaceId: 'ws-1',
      documents: [{ id: 'd1', documentNumber: '111' }],
    });
    expect(svc.getWorkspaceDocuments).toHaveBeenCalledWith('ws-1');
  });

  it('maps a service failure to 502', async () => {
    svc.getWorkspaceDocuments.mockRejectedValue(new Error('boom'));
    const res = await auth(request(app).get('/v1/edocs/workspaces/ws-1/documents'));
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('EDOCS_ERROR');
  });
});
