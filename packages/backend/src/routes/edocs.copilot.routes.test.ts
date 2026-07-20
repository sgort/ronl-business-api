/**
 * Route tests for the eDOCS Copilot Studio connector surface
 * (/v1/copilot/edocs). Verifies the X-API-Key gate, the read-only route set,
 * and that no write routes exist (see docs/CUSTOM-CONNECTOR.md §1.2 — the
 * "read-only, no CRUD" decision).
 *
 * The service is mocked — these tests own the routing/auth/error-mapping
 * layer; edocs.service.test.ts owns the service behaviour.
 */

jest.mock('@utils/config', () => ({ config: { edocsCopilot: { apiKey: 'test-api-key' } } }));

jest.mock('@services/edocs.service', () => ({
  edocsService: {
    healthCheck: jest.fn(),
    listWorkspaces: jest.fn(),
    getWorkspaceDocuments: jest.fn(),
    getDocumentProfile: jest.fn(),
    getDocumentVersions: jest.fn(),
  },
}));

jest.mock('@utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

import express from 'express';
import request from 'supertest';
import edocsCopilotRouter from './edocs.copilot.routes';
import { edocsService } from '@services/edocs.service';

const svc = edocsService as unknown as {
  healthCheck: jest.Mock;
  listWorkspaces: jest.Mock;
  getWorkspaceDocuments: jest.Mock;
  getDocumentProfile: jest.Mock;
  getDocumentVersions: jest.Mock;
};

const app = express();
app.use(express.json());
app.use('/v1/copilot/edocs', edocsCopilotRouter);

const auth = (r: request.Test) => r.set('x-api-key', 'test-api-key');

beforeEach(() => jest.clearAllMocks());

describe('auth gate', () => {
  it('rejects a request with no X-API-Key with 401', async () => {
    const res = await request(app).get('/v1/copilot/edocs/status');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_API_KEY');
    expect(svc.healthCheck).not.toHaveBeenCalled();
  });

  it('rejects a request with the wrong X-API-Key with 401', async () => {
    const res = await request(app).get('/v1/copilot/edocs/status').set('x-api-key', 'wrong-key');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_API_KEY');
    expect(svc.healthCheck).not.toHaveBeenCalled();
  });

  it('accepts a request with the correct X-API-Key', async () => {
    svc.healthCheck.mockResolvedValue({ status: 'up', reachable: true, authenticated: true });
    const res = await auth(request(app).get('/v1/copilot/edocs/status'));
    expect(res.status).toBe(200);
  });
});

describe('GET /status', () => {
  it('reports stub + reachable + authenticated in stub mode', async () => {
    svc.healthCheck.mockResolvedValue({ status: 'stub', reachable: true, authenticated: true });
    const res = await auth(request(app).get('/v1/copilot/edocs/status'));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      status: 'stub',
      stubMode: true,
      reachable: true,
      authenticated: true,
    });
  });

  it('reports up + authenticated with latency when live and logged in', async () => {
    svc.healthCheck.mockResolvedValue({
      status: 'up',
      reachable: true,
      authenticated: true,
      latency: 42,
    });
    const res = await auth(request(app).get('/v1/copilot/edocs/status'));
    expect(res.body.data).toMatchObject({
      status: 'up',
      stubMode: false,
      reachable: true,
      authenticated: true,
      latencyMs: 42,
    });
  });
});

describe('GET /workspaces', () => {
  it('returns the workspace list on success', async () => {
    svc.listWorkspaces.mockResolvedValue([{ id: 'ws-1' }]);
    const res = await auth(request(app).get('/v1/copilot/edocs/workspaces'));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, data: [{ id: 'ws-1' }] });
  });

  it('maps a service failure to 502 EDOCS_ERROR', async () => {
    svc.listWorkspaces.mockRejectedValue(new Error('boom'));
    const res = await auth(request(app).get('/v1/copilot/edocs/workspaces'));
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('EDOCS_ERROR');
  });
});

describe('GET /workspaces/:workspaceId/documents', () => {
  it('returns the documents scoped to the workspace', async () => {
    svc.getWorkspaceDocuments.mockResolvedValue([
      { id: 'd1', name: 'one.pdf', documentNumber: '111' },
    ]);
    const res = await auth(request(app).get('/v1/copilot/edocs/workspaces/ws-1/documents'));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      workspaceId: 'ws-1',
      documents: [{ id: 'd1', documentNumber: '111' }],
    });
    expect(svc.getWorkspaceDocuments).toHaveBeenCalledWith('ws-1');
  });

  it('maps a service failure to 502', async () => {
    svc.getWorkspaceDocuments.mockRejectedValue(new Error('boom'));
    const res = await auth(request(app).get('/v1/copilot/edocs/workspaces/ws-1/documents'));
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('EDOCS_ERROR');
  });
});

describe('GET /documents/:documentId/profile', () => {
  it('returns the document profile on success', async () => {
    svc.getDocumentProfile.mockResolvedValue({ DOCNAME: 'a.pdf', DOCNUMBER: '111' });
    const res = await auth(request(app).get('/v1/copilot/edocs/documents/doc-1/profile'));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ DOCNUMBER: '111' });
    expect(svc.getDocumentProfile).toHaveBeenCalledWith('doc-1');
  });

  it('maps a service failure to 502', async () => {
    svc.getDocumentProfile.mockRejectedValue(new Error('boom'));
    const res = await auth(request(app).get('/v1/copilot/edocs/documents/doc-1/profile'));
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('EDOCS_ERROR');
  });
});

describe('GET /documents/:documentId/versions', () => {
  it('returns the version list on success', async () => {
    svc.getDocumentVersions.mockResolvedValue([{ id: 'v1', version: '1' }]);
    const res = await auth(request(app).get('/v1/copilot/edocs/documents/doc-1/versions'));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      documentId: 'doc-1',
      versions: [{ id: 'v1', version: '1' }],
    });
  });

  it('maps a service failure to 502', async () => {
    svc.getDocumentVersions.mockRejectedValue(new Error('boom'));
    const res = await auth(request(app).get('/v1/copilot/edocs/documents/doc-1/versions'));
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('EDOCS_ERROR');
  });
});

describe('no write routes exist (read-only, no CRUD — decision in CUSTOM-CONNECTOR.md)', () => {
  it('404s on POST /workspaces/ensure', async () => {
    const res = await auth(request(app).post('/v1/copilot/edocs/workspaces/ensure')).send({
      projectNumber: 'P-1',
      projectName: 'Proj',
    });
    expect(res.status).toBe(404);
  });

  it('404s on POST /documents', async () => {
    const res = await auth(request(app).post('/v1/copilot/edocs/documents')).send({
      filename: 'a.pdf',
      contentBase64: 'YmFzZTY0',
      metadata: { docName: 'Doc', department: 'IVR' },
    });
    expect(res.status).toBe(404);
  });

  it('404s on DELETE /documents/:documentId', async () => {
    const res = await auth(request(app).delete('/v1/copilot/edocs/documents/doc-1'));
    expect(res.status).toBe(404);
  });

  it('404s on DELETE /workspaces/:workspaceId', async () => {
    const res = await auth(request(app).delete('/v1/copilot/edocs/workspaces/ws-1'));
    expect(res.status).toBe(404);
  });
});
