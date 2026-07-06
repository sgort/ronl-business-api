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
  interceptors: { request: { use: jest.fn() } },
};

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
    await svc.uploadDocument('ws-1', 'f.pdf', 'YmFzZTY0', { docName: 'Doc' });
    await svc.getWorkspaceDocuments('ws-1');
    expect(mockClient.get).not.toHaveBeenCalled();
    expect(mockClient.post).not.toHaveBeenCalled();
  });

  it('ensureWorkspace derives a deterministic stub id and never reports created', async () => {
    const res = await svc.ensureWorkspace('RIP 2024/07', 'Gebiedsproces');
    expect(res.workspaceId).toBe('stub-ws-RIP-2024-07');
    expect(res.workspaceName).toBe('RIP 2024/07 — Gebiedsproces');
    expect(res.created).toBe(false);
  });

  it('uploadDocument returns a stub doc scoped to the workspace', async () => {
    const res = await svc.uploadDocument('ws-9', 'report.pdf', 'YmFzZTY0', { docName: 'Report' });
    expect(res.workspaceId).toBe('ws-9');
    expect(res.documentId).toMatch(/^stub-doc-/);
    expect(res.documentNumber).toMatch(/^STUB-/);
  });

  it('getWorkspaceDocuments returns the canned two-document list', async () => {
    const docs = await svc.getWorkspaceDocuments('ws-1');
    expect(docs).toHaveLength(2);
    expect(docs[0]).toMatchObject({ documentNumber: '2993898' });
  });

  it('healthCheck reports stub status', async () => {
    await expect(svc.healthCheck()).resolves.toEqual({ status: 'stub' });
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
        data: { data: { list: [{ id: 'ws-existing', data: { DOCNAME: 'P-001 — Old' } }] } },
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
  });

  describe('uploadDocument()', () => {
    it('includes _restapi.form_name when a formName is supplied', async () => {
      mockClient.post
        .mockResolvedValueOnce(connectResponse)
        .mockResolvedValueOnce({ data: { data: { id: 'doc-1', DOCNUMBER: '555' } } });

      const res = await svc.uploadDocument('42', 'a.pdf', 'YmFzZTY0', {
        docName: 'Intake',
        formName: 'RIP_FORM',
      });

      expect(res).toEqual({ documentId: 'doc-1', documentNumber: '555', workspaceId: '42' });
      const body = mockClient.post.mock.calls[1][1];
      expect(body.data._restapi.form_name).toBe('RIP_FORM');
      expect(body.data._restapi.ref).toEqual({ type: 'workspace', id: 42, lib: 'DOCUVITT' });
    });

    it('omits form_name when no formName is supplied', async () => {
      mockClient.post
        .mockResolvedValueOnce(connectResponse)
        .mockResolvedValueOnce({ data: { id: 'doc-2' } });

      const res = await svc.uploadDocument('7', 'b.pdf', 'YmFzZTY0', { docName: 'Plain' });

      const body = mockClient.post.mock.calls[1][1];
      expect(body.data._restapi.form_name).toBeUndefined();
      expect(body.data._restapi.ref.id).toBe(7);
      // DOCNUMBER absent → falls back to documentId
      expect(res.documentNumber).toBe('doc-2');
    });
  });

  describe('getWorkspaceDocuments()', () => {
    it('maps the raw eDOCS list into id/name/documentNumber', async () => {
      mockClient.post.mockResolvedValueOnce(connectResponse);
      mockClient.get.mockResolvedValueOnce({
        data: {
          data: {
            list: [
              { id: 'd1', data: { DOCNAME: 'one.pdf', DOCNUMBER: '111' } },
              { id: 'd2', data: { DOCNAME: 'two.pdf', DOCNUMBER: '222' } },
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

  describe('healthCheck()', () => {
    it('reports up with a latency when libraries is reachable', async () => {
      mockClient.get.mockResolvedValueOnce({ data: {} });
      const res = await svc.healthCheck();
      expect(res.status).toBe('up');
      expect(typeof res.latency).toBe('number');
    });

    it('reports down with the error message when libraries fails', async () => {
      mockClient.get.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      const res = await svc.healthCheck();
      expect(res).toMatchObject({ status: 'down', error: 'ECONNREFUSED' });
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
