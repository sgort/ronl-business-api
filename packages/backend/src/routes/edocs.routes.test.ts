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
      return res.status(401).type('application/problem+json').json({
        type: 'about:blank',
        status: 401,
        title: 'Missing token',
        detail: 'Missing token',
        instance: req.originalUrl,
        code: 'MISSING_TOKEN',
      });
    }
    req.user = {
      userId: 'test-user',
      tenantId: 'flevoland',
      roles: ['caseworker'],
      organisationType: 'province',
      assuranceLevel: 'substantieel',
      displayName: 'Test User',
      preferredUsername: 'test-user',
    };
    req.auth = {
      ...req.user,
      azp: (req.headers['x-test-azp'] as string) ?? 'ronl-business-api',
      token: 'kc-test',
      requestId: 'r',
    };
    next();
  },
}));

const mockConfig = {
  keycloak: { clientId: 'ronl-business-api' },
  edocs: {
    stubMode: false,
    allowServiceFallback: false,
    allowedClients: ['edocs-mcp-client', 'copilot-studio-edocs', 'operaton-mcp-client'],
    userId: 'testuser001',
  },
};
// Merge over the real config: other modules this router pulls in (version
// middleware, conformance helpers) read their own keys. The edocs/keycloak
// objects stay the mockConfig ones, so tests can still flip them.
jest.mock('@utils/config', () => {
  const actual = jest.requireActual('@utils/config').config;
  return {
    config: {
      ...actual,
      keycloak: { ...actual.keycloak, ...mockConfig.keycloak },
      edocs: Object.assign(mockConfig.edocs, { ...actual.edocs, ...mockConfig.edocs }),
    },
  };
});
const mockGetIdToken = jest.fn().mockResolvedValue('id-test');
jest.mock('@auth/entra-token.service', () => {
  const actual = jest.requireActual('@auth/entra-token.service');
  return {
    ...actual,
    entraTokenService: { getIdToken: (...a: unknown[]) => mockGetIdToken(...a) },
  };
});

jest.mock('@services/edocs.service', () => {
  const svc: Record<string, jest.Mock> = {
    healthCheck: jest.fn(),
    listWorkspaces: jest.fn(),
    ensureWorkspace: jest.fn(),
    uploadDocument: jest.fn(),
    getWorkspaceDocuments: jest.fn(),
    getDocumentProfile: jest.fn(),
    getDocumentVersions: jest.fn(),
    downloadDocumentVersion: jest.fn(),
    deleteDocument: jest.fn(),
    deleteWorkspace: jest.fn(),
    probeUser: jest.fn(),
  };
  svc.forUser = jest.fn(() => svc);
  class EdocsAccessDeniedError extends Error {
    readonly code = 'EDOCS_ACCESS_DENIED';
  }
  return { edocsService: svc, EdocsAccessDeniedError };
});

jest.mock('@utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

import express from 'express';
import request from 'supertest';
import { versionMiddleware } from '@middleware/version.middleware';
import { expectToMatchOperation } from '@/openapi/testing/conformance';
import edocsRouter from './edocs.routes';
import { edocsService } from '@services/edocs.service';

const svc = edocsService as unknown as {
  healthCheck: jest.Mock;
  listWorkspaces: jest.Mock;
  ensureWorkspace: jest.Mock;
  uploadDocument: jest.Mock;
  getWorkspaceDocuments: jest.Mock;
  getDocumentProfile: jest.Mock;
  getDocumentVersions: jest.Mock;
  downloadDocumentVersion: jest.Mock;
  deleteDocument: jest.Mock;
  deleteWorkspace: jest.Mock;
  probeUser: jest.Mock;
  forUser: jest.Mock;
};

const app = express();
// versionMiddleware is app-wide in index.ts, not in the router, so a test
// app mounting the router alone answers without API-Version -- which
// expectToMatchOperation checks on every 2xx (ADR API-57). Mounting it here
// keeps the test app answering what the real one does (#269).
app.use(express.json());
app.use(versionMiddleware);
app.use('/v1/edocs', edocsRouter);

const auth = (r: request.Test) => r.set('x-test-auth', '1');

beforeEach(() => jest.clearAllMocks());

describe('auth gate', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const res = await request(app).get('/v1/edocs/status');
    expect(res.status).toBe(401);
    expectToMatchOperation(res, 'get', '/edocs/status');
    expect(res.body.code).toBe('MISSING_TOKEN');
    expect(svc.healthCheck).not.toHaveBeenCalled();
  });
});

describe('GET /status', () => {
  it('reports stub + reachable + authenticated in stub mode', async () => {
    svc.healthCheck.mockResolvedValue({ status: 'stub', reachable: true, authenticated: true });
    const res = await auth(request(app).get('/v1/edocs/status'));
    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'get', '/edocs/status');
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
      baseUrl: process.env.EDOCS_BASE_URL ?? '',
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
    // EdocsWorkspace names `name` as required; `{ id: 'ws-1' }` was a workspace
    // with no name, which nothing consuming this could render (#269).
    svc.listWorkspaces.mockResolvedValue([{ id: 'ws-1', name: 'Dossier 2026-001' }]);
    const res = await auth(request(app).get('/v1/edocs/workspaces'));
    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'get', '/edocs/workspaces');
    expect(res.body).toMatchObject({
      success: true,
      data: [{ id: 'ws-1', name: 'Dossier 2026-001' }],
    });
  });

  it('maps a service failure to 502 EDOCS_ERROR', async () => {
    svc.listWorkspaces.mockRejectedValue(new Error('boom'));
    const res = await auth(request(app).get('/v1/edocs/workspaces'));
    expect(res.status).toBe(502);
    expectToMatchOperation(res, 'get', '/edocs/workspaces');
    expect(res.body.code).toBe('EDOCS_ERROR');
  });
});

describe('POST /workspaces/ensure', () => {
  it('400s when required fields are missing', async () => {
    const res = await auth(request(app).post('/v1/edocs/workspaces/ensure')).send({
      projectNumber: 'P-1',
    });
    expect(res.status).toBe(400);
    expectToMatchOperation(res, 'post', '/edocs/workspaces/ensure');
    expect(res.body.code).toBe('MISSING_FIELDS');
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
    expectToMatchOperation(res, 'post', '/edocs/workspaces/ensure');
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
    expectToMatchOperation(res, 'post', '/edocs/workspaces/ensure');
    expect(res.body.code).toBe('EDOCS_ERROR');
  });
});

describe('POST /documents', () => {
  const valid = {
    workspaceId: 'ws-1',
    filename: 'a.pdf',
    contentBase64: 'YmFzZTY0',
    metadata: { docName: 'Doc', department: 'IVR' },
  };

  it('400s when metadata.docName is missing', async () => {
    const res = await auth(request(app).post('/v1/edocs/documents')).send({
      ...valid,
      metadata: { department: 'IVR' },
    });
    expect(res.status).toBe(400);
    expectToMatchOperation(res, 'post', '/edocs/documents');
    expect(res.body.code).toBe('MISSING_FIELDS');
    expect(svc.uploadDocument).not.toHaveBeenCalled();
  });

  it('400s when metadata.department is missing', async () => {
    const res = await auth(request(app).post('/v1/edocs/documents')).send({
      ...valid,
      metadata: { docName: 'Doc' },
    });
    expect(res.status).toBe(400);
    expectToMatchOperation(res, 'post', '/edocs/documents');
    expect(res.body.code).toBe('MISSING_FIELDS');
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
    expectToMatchOperation(res, 'post', '/edocs/documents');
    expect(res.body.data).toMatchObject({ documentId: 'doc-1', documentNumber: '555' });
    expect(svc.uploadDocument).toHaveBeenCalledWith('ws-1', 'a.pdf', 'YmFzZTY0', {
      docName: 'Doc',
      department: 'IVR',
    });
  });

  it('uploads standalone (null workspaceId) when workspaceId is omitted', async () => {
    svc.uploadDocument.mockResolvedValue({
      documentId: 'doc-2',
      documentNumber: '556',
      workspaceId: null,
    });
    const { workspaceId: _omit, ...withoutWorkspace } = valid;
    const res = await auth(request(app).post('/v1/edocs/documents')).send(withoutWorkspace);
    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'post', '/edocs/documents');
    expect(res.body.data).toMatchObject({ documentId: 'doc-2', workspaceId: null });
    expect(svc.uploadDocument).toHaveBeenCalledWith(null, 'a.pdf', 'YmFzZTY0', {
      docName: 'Doc',
      department: 'IVR',
    });
  });

  it('maps a service failure to 502', async () => {
    svc.uploadDocument.mockRejectedValue(new Error('boom'));
    const res = await auth(request(app).post('/v1/edocs/documents')).send(valid);
    expect(res.status).toBe(502);
    expectToMatchOperation(res, 'post', '/edocs/documents');
    expect(res.body.code).toBe('EDOCS_ERROR');
  });
});

describe('GET /workspaces/:workspaceId/documents', () => {
  it('returns the documents scoped to the workspace', async () => {
    svc.getWorkspaceDocuments.mockResolvedValue([
      { id: 'd1', name: 'one.pdf', documentNumber: '111' },
    ]);
    const res = await auth(request(app).get('/v1/edocs/workspaces/ws-1/documents'));
    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'get', '/edocs/workspaces/{workspaceId}/documents');
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
    expectToMatchOperation(res, 'get', '/edocs/workspaces/{workspaceId}/documents');
    expect(res.body.code).toBe('EDOCS_ERROR');
  });
});

describe('GET /documents/:documentId/profile', () => {
  it('returns the document profile on success', async () => {
    svc.getDocumentProfile.mockResolvedValue({ DOCNAME: 'a.pdf', DOCNUMBER: '111' });
    const res = await auth(request(app).get('/v1/edocs/documents/doc-1/profile'));
    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'get', '/edocs/documents/{documentId}/profile');
    expect(res.body.data).toMatchObject({ DOCNUMBER: '111' });
    expect(svc.getDocumentProfile).toHaveBeenCalledWith('doc-1');
  });

  it('maps a service failure to 502', async () => {
    svc.getDocumentProfile.mockRejectedValue(new Error('boom'));
    const res = await auth(request(app).get('/v1/edocs/documents/doc-1/profile'));
    expect(res.status).toBe(502);
    expectToMatchOperation(res, 'get', '/edocs/documents/{documentId}/profile');
    expect(res.body.code).toBe('EDOCS_ERROR');
  });
});

describe('GET /documents/:documentId/versions', () => {
  it('returns the version list on success', async () => {
    svc.getDocumentVersions.mockResolvedValue([{ id: 'v1', version: '1' }]);
    const res = await auth(request(app).get('/v1/edocs/documents/doc-1/versions'));
    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'get', '/edocs/documents/{documentId}/versions');
    expect(res.body.data).toMatchObject({
      documentId: 'doc-1',
      versions: [{ id: 'v1', version: '1' }],
    });
  });

  it('maps a service failure to 502', async () => {
    svc.getDocumentVersions.mockRejectedValue(new Error('boom'));
    const res = await auth(request(app).get('/v1/edocs/documents/doc-1/versions'));
    expect(res.status).toBe(502);
    expectToMatchOperation(res, 'get', '/edocs/documents/{documentId}/versions');
    expect(res.body.code).toBe('EDOCS_ERROR');
  });
});

describe('GET /documents/:documentId/versions/:version', () => {
  it('returns the base64 file content on success', async () => {
    svc.downloadDocumentVersion.mockResolvedValue({ contentBase64: 'YmFzZTY0' });
    const res = await auth(request(app).get('/v1/edocs/documents/doc-1/versions/1'));
    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'get', '/edocs/documents/{documentId}/versions/{version}');
    expect(res.body.data).toEqual({ contentBase64: 'YmFzZTY0' });
    expect(svc.downloadDocumentVersion).toHaveBeenCalledWith('doc-1', '1');
  });

  it('maps a service failure to 502', async () => {
    svc.downloadDocumentVersion.mockRejectedValue(new Error('boom'));
    const res = await auth(request(app).get('/v1/edocs/documents/doc-1/versions/1'));
    expect(res.status).toBe(502);
    expectToMatchOperation(res, 'get', '/edocs/documents/{documentId}/versions/{version}');
    expect(res.body.code).toBe('EDOCS_ERROR');
  });
});

describe('DELETE /documents/:documentId', () => {
  it('deletes the document and confirms', async () => {
    svc.deleteDocument.mockResolvedValue(undefined);
    const res = await auth(request(app).delete('/v1/edocs/documents/doc-1'));
    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'delete', '/edocs/documents/{documentId}');
    expect(res.body.data).toEqual({ documentId: 'doc-1', deleted: true });
    expect(svc.deleteDocument).toHaveBeenCalledWith('doc-1');
  });

  it('maps a service failure to 502', async () => {
    svc.deleteDocument.mockRejectedValue(new Error('boom'));
    const res = await auth(request(app).delete('/v1/edocs/documents/doc-1'));
    expect(res.status).toBe(502);
    expectToMatchOperation(res, 'delete', '/edocs/documents/{documentId}');
    expect(res.body.code).toBe('EDOCS_ERROR');
  });
});

describe('DELETE /workspaces/:workspaceId', () => {
  it('deletes the workspace and confirms', async () => {
    svc.deleteWorkspace.mockResolvedValue(undefined);
    const res = await auth(request(app).delete('/v1/edocs/workspaces/ws-1'));
    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'delete', '/edocs/workspaces/{workspaceId}');
    expect(res.body.data).toEqual({ workspaceId: 'ws-1', deleted: true });
    expect(svc.deleteWorkspace).toHaveBeenCalledWith('ws-1');
  });

  it('maps a service failure to 502', async () => {
    svc.deleteWorkspace.mockRejectedValue(new Error('boom'));
    const res = await auth(request(app).delete('/v1/edocs/workspaces/ws-1'));
    expect(res.status).toBe(502);
    expectToMatchOperation(res, 'delete', '/edocs/workspaces/{workspaceId}');
    expect(res.body.code).toBe('EDOCS_ERROR');
  });
});

describe('non-Error rejections', () => {
  // eDOCS failures arrive over SOAP and surface as bare strings often enough
  // that the String(error) fallback in each catch is a real path, not a formality.
  const VALID_UPLOAD = {
    workspaceId: 'ws-1',
    filename: 'a.pdf',
    contentBase64: 'AAAA',
    metadata: { docName: 'A', department: 'IV' },
  };

  it.each([
    ['listWorkspaces', 'get', '/v1/edocs/workspaces', undefined],
    [
      'ensureWorkspace',
      'post',
      '/v1/edocs/workspaces/ensure',
      { projectNumber: 'p-1', projectName: 'Project 1' },
    ],
    ['uploadDocument', 'post', '/v1/edocs/documents', VALID_UPLOAD],
    ['getWorkspaceDocuments', 'get', '/v1/edocs/workspaces/ws-1/documents', undefined],
    ['getDocumentProfile', 'get', '/v1/edocs/documents/d-1/profile', undefined],
    ['getDocumentVersions', 'get', '/v1/edocs/documents/d-1/versions', undefined],
    ['downloadDocumentVersion', 'get', '/v1/edocs/documents/d-1/versions/2', undefined],
    ['deleteDocument', 'delete', '/v1/edocs/documents/d-1', undefined],
    ['deleteWorkspace', 'delete', '/v1/edocs/workspaces/ws-1', undefined],
  ] as const)('%s rejecting with a string still answers 502', async (fn, method, path, body) => {
    (svc[fn] as jest.Mock).mockRejectedValue('SOAP fault');
    const req = auth(request(app)[method](path));
    const res = await (body ? req.send(body) : req);
    expect(res.status).toBe(502);
    expect(res.body.code).toBe('EDOCS_ERROR');
  });
});

describe('/v1/edocs — principals', () => {
  it('a listed machine client acts as the service', async () => {
    svc.listWorkspaces.mockResolvedValue([]);
    const res = await request(app)
      .get('/v1/edocs/workspaces')
      .set('x-test-auth', '1')
      .set('x-test-azp', 'operaton-mcp-client');
    expect(res.status).toBe(200);
    expect(res.body.actingAs).toBe('service');
  });

  it('an unlisted machine client is refused', async () => {
    const res = await request(app)
      .get('/v1/edocs/workspaces')
      .set('x-test-auth', '1')
      .set('x-test-azp', 'random-client');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('EDOCS_CLIENT_NOT_ALLOWED');
  });

  it('a person with an Entra token acts as themselves', async () => {
    svc.listWorkspaces.mockResolvedValue([]);
    const res = await request(app).get('/v1/edocs/workspaces').set('x-test-auth', '1');
    expect(res.status).toBe(200);
    expect(res.body.actingAs).toBe('user');
  });

  it('a person without an Entra token gets 403 on data, but 200 on status with the reason', async () => {
    const { UserTokenUnavailableError } = jest.requireActual('@auth/entra-token.service');
    mockGetIdToken.mockRejectedValue(new UserTokenUnavailableError());
    svc.healthCheck.mockResolvedValue({ status: 'up', reachable: true, authenticated: true });
    const data = await request(app).get('/v1/edocs/workspaces').set('x-test-auth', '1');
    expect(data.status).toBe(403);
    expect(data.body.code).toBe('EDOCS_USER_TOKEN_UNAVAILABLE');
    const status = await request(app).get('/v1/edocs/status').set('x-test-auth', '1');
    expect(status.status).toBe(200);
    expect(status.body.data.user).toEqual({
      available: false,
      problem: 'EDOCS_USER_TOKEN_UNAVAILABLE',
    });
    mockGetIdToken.mockResolvedValue('id-test');
  });

  // #326 item 4: a Keycloak outage is reported, not turned into a 500.
  it('status reports a failed Keycloak lookup in data.user instead of failing', async () => {
    mockGetIdToken.mockRejectedValue(
      Object.assign(new Error('Request failed with status code 503'), {
        response: { status: 503 },
      })
    );
    svc.healthCheck.mockResolvedValue({ status: 'up', reachable: true, authenticated: true });
    const res = await request(app).get('/v1/edocs/status').set('x-test-auth', '1');
    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'get', '/edocs/status');
    expect(res.body.data.user).toEqual({
      available: false,
      problem: 'EDOCS_USER_LOOKUP_FAILED',
      error: 'Request failed with status code 503',
    });
    mockGetIdToken.mockResolvedValue('id-test');
  });

  it('a data route still fails on a Keycloak outage, without falling back to the service', async () => {
    mockGetIdToken.mockRejectedValue(new Error('socket hang up'));
    const res = await request(app).get('/v1/edocs/workspaces').set('x-test-auth', '1');
    expect(res.status).toBe(500);
    expect(svc.listWorkspaces).not.toHaveBeenCalled();
    mockGetIdToken.mockResolvedValue('id-test');
  });

  it('status tells a person whether eDOCS knows them', async () => {
    svc.healthCheck.mockResolvedValue({ status: 'up', reachable: true, authenticated: true });
    svc.probeUser.mockResolvedValue({ authenticated: true, edocsUserId: 'GORTS01' });
    const res = await request(app).get('/v1/edocs/status').set('x-test-auth', '1');
    expect(res.body.data.user).toEqual({
      available: true,
      authenticated: true,
      edocsUserId: 'GORTS01',
    });
  });

  it('eDOCS refusing the person is 403 EDOCS_ACCESS_DENIED, not 502', async () => {
    const { EdocsAccessDeniedError } = jest.requireMock('@services/edocs.service');
    svc.listWorkspaces.mockRejectedValue(new EdocsAccessDeniedError('Access not allowed'));
    const res = await request(app).get('/v1/edocs/workspaces').set('x-test-auth', '1');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('EDOCS_ACCESS_DENIED');
  });
});
