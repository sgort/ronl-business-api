/**
 * Unit tests for EdocsService — both stub mode and the live OpenText eDOCS paths.
 *
 * Motivation: in stub mode none of the live code runs, so flipping
 * EDOCS_STUB_MODE=false exercises connect(), the 401/403 re-auth, workspace
 * search/create, uploadDocument and getWorkspaceDocuments for the first time.
 * These tests pin that behaviour down before the switch.
 *
 * axios is mocked at the module boundary: axios.create() returns a controllable
 * client whose get/post/interceptors we drive per test.
 */

// --- mocks (hoisted above imports; names must start with "mock") ---
const mockClient = {
  get: jest.fn(),
  post: jest.fn(),
  delete: jest.fn(),
  interceptors: { request: { use: jest.fn() } },
};

const mockFormAppend = jest.fn();
const mockFormGetHeaders = jest.fn(() => ({
  'content-type': 'multipart/form-data; boundary=mock',
}));

const mockConfig = {
  edocs: {
    baseUrl: 'https://edocs.test/api',
    library: 'DOCUVITT',
    userId: 'svc-user',
    password: 'secret',
    stubMode: true,
  },
};

jest.mock('axios', () => ({
  __esModule: true,
  default: { create: jest.fn(() => mockClient) },
}));
jest.mock('form-data', () =>
  jest.fn().mockImplementation(() => ({
    append: mockFormAppend,
    getHeaders: mockFormGetHeaders,
  }))
);
jest.mock('@utils/config', () => ({ config: mockConfig }));
jest.mock('@utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

import { EdocsService } from './edocs.service';

/** A realistic connect() response carrying both session cookies. */
const connectResponse = {
  headers: {
    'set-cookie': [
      'X-DM-DST=dst-abc-123; Path=/; HttpOnly',
      'X-DM-CSRF-TOKEN=csrf-xyz-789; Path=/',
    ],
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockConfig.edocs.stubMode = true;
});

describe('EdocsService — stub mode', () => {
  let svc: EdocsService;
  beforeEach(() => {
    mockConfig.edocs.stubMode = true;
    svc = new EdocsService();
  });

  it('never touches the network', async () => {
    await svc.listWorkspaces();
    await svc.ensureWorkspace('P-001', 'Project One');
    await svc.uploadDocument('ws-1', 'f.pdf', 'YmFzZTY0', { docName: 'Doc', department: 'IVR' });
    await svc.getWorkspaceDocuments('ws-1');
    await svc.getDocumentProfile('doc-1');
    await svc.getDocumentVersions('doc-1');
    await svc.downloadDocumentVersion('doc-1', '1');
    await svc.deleteDocument('doc-1');
    await svc.deleteWorkspace('ws-1');
    expect(mockClient.get).not.toHaveBeenCalled();
    expect(mockClient.post).not.toHaveBeenCalled();
    expect(mockClient.delete).not.toHaveBeenCalled();
  });

  it('ensureWorkspace derives a deterministic stub id and never reports created', async () => {
    const res = await svc.ensureWorkspace('RIP 2024/07', 'Gebiedsproces');
    expect(res.workspaceId).toBe('stub-ws-RIP-2024-07');
    expect(res.workspaceName).toBe('RIP 2024/07 — Gebiedsproces');
    expect(res.created).toBe(false);
  });

  it('uploadDocument returns a stub doc scoped to the workspace', async () => {
    const res = await svc.uploadDocument('ws-9', 'report.pdf', 'YmFzZTY0', {
      docName: 'Report',
      department: 'IVR',
    });
    expect(res.workspaceId).toBe('ws-9');
    expect(res.documentId).toMatch(/^stub-doc-/);
    expect(res.documentNumber).toMatch(/^STUB-/);
  });

  it('uploadDocument returns a stub doc with a null workspaceId when uploaded standalone', async () => {
    const res = await svc.uploadDocument(null, 'report.pdf', 'YmFzZTY0', {
      docName: 'Report',
      department: 'IVR',
    });
    expect(res.workspaceId).toBeNull();
    expect(res.documentId).toMatch(/^stub-doc-/);
  });

  it('getWorkspaceDocuments returns the canned two-document list', async () => {
    const docs = await svc.getWorkspaceDocuments('ws-1');
    expect(docs).toHaveLength(2);
    expect(docs[0]).toMatchObject({ documentNumber: '2993898' });
  });

  it('healthCheck reports stub status, reachable and authenticated', async () => {
    await expect(svc.healthCheck()).resolves.toEqual({
      status: 'stub',
      reachable: true,
      authenticated: true,
    });
  });

  it('getDocumentProfile returns a canned profile', async () => {
    const profile = await svc.getDocumentProfile('doc-1');
    expect(profile).toMatchObject({ DOCNUMBER: 'STUB-doc-1' });
  });

  it('getDocumentVersions returns a single canned version', async () => {
    const versions = await svc.getDocumentVersions('doc-1');
    expect(versions).toEqual([{ id: 'doc-1-v1', version: '1' }]);
  });

  it('downloadDocumentVersion returns decodable stub content', async () => {
    const res = await svc.downloadDocumentVersion('doc-1', '1');
    expect(Buffer.from(res.contentBase64, 'base64').toString()).toContain('doc-1');
  });

  it('deleteDocument and deleteWorkspace resolve without touching the network', async () => {
    await expect(svc.deleteDocument('doc-1')).resolves.toBeUndefined();
    await expect(svc.deleteWorkspace('ws-1')).resolves.toBeUndefined();
  });
});

describe('EdocsService — live mode', () => {
  let svc: EdocsService;
  beforeEach(() => {
    mockConfig.edocs.stubMode = false;
    svc = new EdocsService();
  });

  describe('connect()', () => {
    it('extracts X-DM-DST + CSRF cookies and authenticates before the request', async () => {
      mockClient.post.mockResolvedValueOnce(connectResponse); // connect
      mockClient.get.mockResolvedValueOnce({ data: { data: { list: [{ id: '1' }] } } });

      await svc.listWorkspaces();

      // connect posted to the 'connect' endpoint with the configured credentials
      expect(mockClient.post).toHaveBeenCalledWith('connect', {
        data: { userid: 'svc-user', password: 'secret', library: 'DOCUVITT' },
      });
      // only one connect for the first call
      expect(mockClient.post).toHaveBeenCalledTimes(1);
    });

    it('throws when the connect response lacks the X-DM-DST cookie', async () => {
      mockClient.post.mockResolvedValueOnce({
        headers: { 'set-cookie': ['X-DM-CSRF-TOKEN=only-csrf; Path=/'] },
      });
      await expect(svc.listWorkspaces()).rejects.toThrow(/X-DM-DST cookie was absent/);
    });

    it('propagates an upstream error when connect() is rejected (e.g. account lockout)', async () => {
      mockClient.post.mockRejectedValueOnce({
        response: {
          status: 400,
          data: { ERROR: { message: 'The referenced account is currently locked out' } },
        },
      });
      await expect(svc.listWorkspaces()).rejects.toMatchObject({ response: { status: 400 } });
    });

    it('caches the session — a second call does not re-connect', async () => {
      mockClient.post.mockResolvedValueOnce(connectResponse);
      mockClient.get.mockResolvedValue({ data: { data: { list: [] } } });

      await svc.listWorkspaces();
      await svc.listWorkspaces();

      expect(mockClient.post).toHaveBeenCalledTimes(1); // connect only once
      expect(mockClient.get).toHaveBeenCalledTimes(2);
    });
  });

  describe('withAuth re-authentication', () => {
    it('re-connects once on a 401 and retries the operation', async () => {
      mockClient.post
        .mockResolvedValueOnce(connectResponse) // initial connect
        .mockResolvedValueOnce(connectResponse); // re-connect after 401
      mockClient.get
        .mockRejectedValueOnce({ response: { status: 401 } }) // first attempt
        .mockResolvedValueOnce({ data: { data: { list: [{ id: 'ok' }] } } }); // retry

      const res = await svc.listWorkspaces();

      expect(res).toEqual([{ id: 'ok' }]);
      expect(mockClient.post).toHaveBeenCalledTimes(2); // connect twice
    });

    it('propagates non-auth errors without retrying', async () => {
      mockClient.post.mockResolvedValueOnce(connectResponse);
      mockClient.get.mockRejectedValueOnce({ response: { status: 500 } });

      await expect(svc.listWorkspaces()).rejects.toEqual({ response: { status: 500 } });
      expect(mockClient.post).toHaveBeenCalledTimes(1); // no re-connect
    });
  });

  describe('ensureWorkspace()', () => {
    it('returns the existing workspace when the search matches (created:false)', async () => {
      mockClient.post.mockResolvedValueOnce(connectResponse);
      mockClient.get.mockResolvedValueOnce({
        // Flat list item shape, confirmed live — not nested under `.data`.
        data: { data: { list: [{ id: 'ws-existing', DOCNAME: 'P-001 — Old' }] } },
      });

      const res = await svc.ensureWorkspace('P-001', 'Project One');

      expect(res).toEqual({
        workspaceId: 'ws-existing',
        workspaceName: 'P-001 — Old',
        created: false,
      });
      expect(mockClient.post).toHaveBeenCalledTimes(1); // connect only, no create
    });

    it('creates a new workspace when the search is empty (created:true)', async () => {
      mockClient.post
        .mockResolvedValueOnce(connectResponse) // connect
        .mockResolvedValueOnce({ data: { data: { id: 'ws-new' } } }); // create
      mockClient.get.mockResolvedValueOnce({ data: { data: { list: [] } } }); // empty search

      const res = await svc.ensureWorkspace('P-002', 'Project Two');

      expect(res).toEqual({
        workspaceId: 'ws-new',
        workspaceName: 'P-002 — Project Two',
        created: true,
      });
      // create posted the workspace DOCNAME
      const createCall = mockClient.post.mock.calls[1];
      expect(createCall[0]).toBe('workspaces');
      expect(createCall[1].data.DOCNAME).toBe('P-002 — Project Two');
    });

    it('reads the new id from the flat list shape when the server returns one', async () => {
      mockClient.post
        .mockResolvedValueOnce(connectResponse)
        .mockResolvedValueOnce({ data: { data: { list: [{ id: 'ws-flat' }] } } });
      mockClient.get.mockResolvedValueOnce({ data: { data: { list: [] } } });

      const res = await svc.ensureWorkspace('P-003', 'Project Three');

      expect(res.workspaceId).toBe('ws-flat');
    });
  });

  describe('uploadDocument()', () => {
    const lastProfileData = (): Record<string, unknown> => {
      const call = mockFormAppend.mock.calls.find((c) => c[0] === 'data');
      return JSON.parse(call![1] as string) as Record<string, unknown>;
    };

    it('posts a real multipart body (data + file parts) to documents', async () => {
      mockClient.post
        .mockResolvedValueOnce(connectResponse)
        .mockResolvedValueOnce({ data: { data: { list: [{ id: 'doc-1', DOCNUM: '555' }] } } });

      const res = await svc.uploadDocument('42', 'a.pdf', 'YmFzZTY0', {
        docName: 'Intake',
        department: 'IVR',
        formName: 'RIP_FORM',
      });

      expect(res).toEqual({ documentId: 'doc-1', documentNumber: '555', workspaceId: '42' });

      const uploadCall = mockClient.post.mock.calls[1];
      expect(uploadCall[0]).toBe('documents');
      expect(uploadCall[2]).toMatchObject({
        params: { library: 'DOCUVITT' },
        headers: { 'content-type': 'multipart/form-data; boundary=mock' },
      });

      const profileData = lastProfileData();
      expect(profileData).toMatchObject({
        DOCNAME: 'Intake',
        APP_ID: 'DEFAULT',
        UV_AFD_NAAM: 'IVR',
        _restapi: { form_name: 'RIP_FORM', ref: { type: 'workspace', id: 42, lib: 'DOCUVITT' } },
      });

      const fileAppendCall = mockFormAppend.mock.calls.find((c) => c[0] === 'file');
      expect(fileAppendCall![2]).toMatchObject({ filename: 'a.pdf' });
      expect(Buffer.isBuffer(fileAppendCall![1])).toBe(true);
    });

    it('defaults APP_ID to DEFAULT and omits form_name when no formName is supplied', async () => {
      mockClient.post
        .mockResolvedValueOnce(connectResponse)
        .mockResolvedValueOnce({ data: { data: { list: [{ id: 'doc-2' }] } } });

      const res = await svc.uploadDocument('7', 'b.pdf', 'YmFzZTY0', {
        docName: 'Plain',
        department: 'IVR',
      });

      const profileData = lastProfileData();
      expect(profileData.APP_ID).toBe('DEFAULT');
      expect((profileData._restapi as { form_name?: string }).form_name).toBeUndefined();
      expect((profileData._restapi as { ref: { id: number } }).ref.id).toBe(7);
      // DOCNUM absent → falls back to documentId
      expect(res.documentNumber).toBe('doc-2');
    });

    it('rejects when the DM server reports a validation error_list (HTTP 206)', async () => {
      mockClient.post.mockResolvedValueOnce(connectResponse).mockResolvedValueOnce({
        data: {
          data: {
            error_list: [{ object: 'a.pdf', message: 'unknown linked application' }],
          },
        },
      });

      await expect(
        svc.uploadDocument('1', 'a.pdf', 'YmFzZTY0', { docName: 'X', department: 'IVR' })
      ).rejects.toThrow(/unknown linked application/);
    });

    describe('standalone (workspaceId: null) — the confirmed-working path', () => {
      it('defaults form_name to D_INTERN_NIEUW and omits ref', async () => {
        mockClient.post
          .mockResolvedValueOnce(connectResponse)
          .mockResolvedValueOnce({ data: { data: { list: [{ id: 'doc-3', DOCNUM: '999' }] } } });

        const res = await svc.uploadDocument(null, 'c.pdf', 'YmFzZTY0', {
          docName: 'Standalone',
          department: 'IVR',
        });

        expect(res).toEqual({ documentId: 'doc-3', documentNumber: '999', workspaceId: null });

        const profileData = lastProfileData();
        expect(profileData._restapi).toEqual({ form_name: 'D_INTERN_NIEUW' });
      });

      it('respects an explicit formName override', async () => {
        mockClient.post
          .mockResolvedValueOnce(connectResponse)
          .mockResolvedValueOnce({ data: { data: { list: [{ id: 'doc-4' }] } } });

        await svc.uploadDocument(null, 'd.pdf', 'YmFzZTY0', {
          docName: 'Standalone',
          department: 'IVR',
          formName: 'CUSTOM_FORM',
        });

        const profileData = lastProfileData();
        expect(profileData._restapi).toEqual({ form_name: 'CUSTOM_FORM' });
      });
    });
  });

  describe('getWorkspaceDocuments()', () => {
    it('maps the raw eDOCS list into id/name/documentNumber', async () => {
      mockClient.post.mockResolvedValueOnce(connectResponse);
      mockClient.get.mockResolvedValueOnce({
        data: {
          data: {
            // Flat list item shape, confirmed live — not nested under `.data`.
            list: [
              { id: 'd1', DOCNAME: 'one.pdf', DOCNUM: '111' },
              { id: 'd2', DOCNAME: 'two.pdf', DOCNUM: '222' },
            ],
          },
        },
      });

      const docs = await svc.getWorkspaceDocuments('ws-1');

      expect(docs).toEqual([
        { id: 'd1', name: 'one.pdf', documentNumber: '111' },
        { id: 'd2', name: 'two.pdf', documentNumber: '222' },
      ]);
    });
  });

  describe('getDocumentProfile()', () => {
    it('returns the raw profile data', async () => {
      mockClient.post.mockResolvedValueOnce(connectResponse);
      mockClient.get.mockResolvedValueOnce({
        data: { data: { DOCNAME: 'report.pdf', DOCNUMBER: '999' } },
      });

      const profile = await svc.getDocumentProfile('doc-1');

      expect(profile).toEqual({ DOCNAME: 'report.pdf', DOCNUMBER: '999' });
      expect(mockClient.get).toHaveBeenCalledWith('documents/doc-1/profile', {
        params: { library: 'DOCUVITT' },
      });
    });
  });

  describe('getDocumentVersions()', () => {
    it('maps the raw eDOCS list into id/version', async () => {
      mockClient.post.mockResolvedValueOnce(connectResponse);
      mockClient.get.mockResolvedValueOnce({
        data: { data: { list: [{ id: 'v1', data: { VERSION: '1' } }] } },
      });

      const versions = await svc.getDocumentVersions('doc-1');

      expect(versions).toEqual([{ id: 'v1', version: '1' }]);
    });

    it('falls back to the item id when VERSION is absent', async () => {
      mockClient.post.mockResolvedValueOnce(connectResponse);
      mockClient.get.mockResolvedValueOnce({
        data: { data: { list: [{ id: 'v2' }] } },
      });

      const versions = await svc.getDocumentVersions('doc-1');

      expect(versions).toEqual([{ id: 'v2', version: 'v2' }]);
    });
  });

  describe('downloadDocumentVersion()', () => {
    it('returns the base64 file content', async () => {
      mockClient.post.mockResolvedValueOnce(connectResponse);
      mockClient.get.mockResolvedValueOnce({ data: { data: { file: 'YmFzZTY0' } } });

      const res = await svc.downloadDocumentVersion('doc-1', '1');

      expect(res).toEqual({ contentBase64: 'YmFzZTY0' });
      expect(mockClient.get).toHaveBeenCalledWith('documents/doc-1/versions/1', {
        params: { library: 'DOCUVITT' },
      });
    });

    it('throws when the response carries no file content', async () => {
      mockClient.post.mockResolvedValueOnce(connectResponse);
      mockClient.get.mockResolvedValueOnce({ data: { data: {} } });

      await expect(svc.downloadDocumentVersion('doc-1', '1')).rejects.toThrow(/no file content/);
    });
  });

  describe('deleteDocument() / deleteWorkspace()', () => {
    it('deleteDocument issues a DELETE against the document resource', async () => {
      mockClient.post.mockResolvedValueOnce(connectResponse);
      mockClient.delete.mockResolvedValueOnce({});

      await svc.deleteDocument('doc-1');

      expect(mockClient.delete).toHaveBeenCalledWith('documents/doc-1', {
        params: { library: 'DOCUVITT' },
      });
    });

    it('deleteWorkspace issues a DELETE against the workspace resource', async () => {
      mockClient.post.mockResolvedValueOnce(connectResponse);
      mockClient.delete.mockResolvedValueOnce({});

      await svc.deleteWorkspace('ws-1');

      expect(mockClient.delete).toHaveBeenCalledWith('workspaces/ws-1', {
        params: { library: 'DOCUVITT' },
      });
    });

    it('propagates an upstream error from a failed delete', async () => {
      mockClient.post.mockResolvedValueOnce(connectResponse);
      mockClient.delete.mockRejectedValueOnce({ response: { status: 404 } });

      await expect(svc.deleteDocument('missing')).rejects.toMatchObject({
        response: { status: 404 },
      });
    });
  });

  describe('healthCheck()', () => {
    it('reports up + authenticated when reachable and login succeeds', async () => {
      mockClient.get.mockResolvedValueOnce({ data: {} }); // libraries reachability
      mockClient.post.mockResolvedValueOnce(connectResponse); // login probe
      const res = await svc.healthCheck();
      expect(res).toMatchObject({ status: 'up', reachable: true, authenticated: true });
      expect(typeof res.latency).toBe('number');
    });

    it('reports down + unreachable when the libraries probe fails', async () => {
      mockClient.get.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      const res = await svc.healthCheck();
      expect(res).toMatchObject({
        status: 'down',
        reachable: false,
        authenticated: false,
        error: 'ECONNREFUSED',
      });
    });

    it('reports reachable-but-not-authenticated when login fails (e.g. lockout)', async () => {
      mockClient.get.mockResolvedValueOnce({ data: {} }); // reachable
      mockClient.post.mockRejectedValueOnce({
        response: { status: 400, data: { ERROR: { message: 'account is currently locked out' } } },
      });
      const res = await svc.healthCheck();
      expect(res).toMatchObject({
        status: 'down',
        reachable: true,
        authenticated: false,
        error: 'account is currently locked out',
      });
    });

    it('caches a failed login probe to avoid hammering the login endpoint', async () => {
      // First probe: reachable, but login fails → result cached.
      mockClient.get.mockResolvedValueOnce({ data: {} });
      mockClient.post.mockRejectedValueOnce({
        response: { status: 400, data: { ERROR: { message: 'locked out' } } },
      });
      await svc.healthCheck();
      jest.clearAllMocks();

      // Second probe within the TTL: reachable again, but login is NOT retried.
      mockClient.get.mockResolvedValueOnce({ data: {} });
      const res = await svc.healthCheck();
      expect(res).toMatchObject({ authenticated: false, error: 'locked out' });
      expect(mockClient.post).not.toHaveBeenCalled();
    });

    it('reuses a live session for the login probe without re-connecting', async () => {
      // First establish a session via a normal call.
      mockClient.post.mockResolvedValueOnce(connectResponse);
      mockClient.get.mockResolvedValueOnce({ data: { data: { list: [] } } });
      await svc.listWorkspaces();
      jest.clearAllMocks();

      // healthCheck should now only hit libraries (reachability), not connect again.
      mockClient.get.mockResolvedValueOnce({ data: {} });
      const res = await svc.healthCheck();
      expect(res).toMatchObject({ authenticated: true, reachable: true });
      expect(mockClient.post).not.toHaveBeenCalled();
    });
  });

  describe('request interceptor', () => {
    it('attaches Cookie and X-DM-DST headers once a session exists', async () => {
      mockClient.post.mockResolvedValueOnce(connectResponse);
      mockClient.get.mockResolvedValueOnce({ data: { data: { list: [] } } });
      await svc.listWorkspaces(); // establishes the session

      const interceptor = mockClient.interceptors.request.use.mock.calls[0][0] as (c: {
        headers: Record<string, string>;
      }) => { headers: Record<string, string> };

      const cfg = interceptor({ headers: {} });
      expect(cfg.headers['Cookie']).toBe('X-DM-DST=dst-abc-123; X-DM-CSRF-TOKEN=csrf-xyz-789');
      expect(cfg.headers['X-DM-DST']).toBe('dst-abc-123');
    });
  });
});
