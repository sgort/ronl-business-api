/**
 * Unit tests for the standalone eDOCS MCP server. The module has no exports and
 * self-connects on import, so the MCP SDK is mocked to capture its request
 * handlers, axios is mocked (both the Keycloak token POST and the backend GET
 * client), and env vars are set before each require — the module caches its
 * token and axios client at module scope, so each scenario that needs a fresh
 * token cache reloads the module via jest.resetModules().
 */

const mockBackendClient = { get: jest.fn() };
const mockAxiosPost = jest.fn();

const mockServer = {
  setRequestHandler: jest.fn(),
  connect: jest.fn().mockResolvedValue(undefined),
};

jest.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: jest.fn(() => mockServer),
}));
jest.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({ StdioServerTransport: jest.fn() }));
jest.mock('@modelcontextprotocol/sdk/types.js', () => ({
  CallToolRequestSchema: 'CallTool',
  ListToolsRequestSchema: 'ListTools',
}));
jest.mock('axios', () => ({
  __esModule: true,
  default: {
    create: jest.fn(() => mockBackendClient),
    post: (...args: unknown[]) => mockAxiosPost(...args),
  },
}));

type Handler = (req: { params: { name: string; arguments?: Record<string, unknown> } }) => Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}>;

let listTools: () => Promise<{ tools: Array<{ name: string }> }>;
let callTool: Handler;

function loadModule(env: Partial<Record<string, string>> = {}): void {
  jest.resetModules();
  mockServer.setRequestHandler.mockClear();
  process.env.KEYCLOAK_URL = env.KEYCLOAK_URL ?? 'http://localhost:8080';
  process.env.KEYCLOAK_REALM = env.KEYCLOAK_REALM ?? 'ronl';
  process.env.EDOCS_MCP_CLIENT_ID = env.EDOCS_MCP_CLIENT_ID ?? 'edocs-mcp-client';
  process.env.EDOCS_MCP_CLIENT_SECRET = env.EDOCS_MCP_CLIENT_SECRET ?? 'secret';
  process.env.PORT = env.PORT ?? '3002';
  if (env.EDOCS_MCP_BACKEND_URL) {
    process.env.EDOCS_MCP_BACKEND_URL = env.EDOCS_MCP_BACKEND_URL;
  } else {
    delete process.env.EDOCS_MCP_BACKEND_URL;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('./index'); // side-effectful: registers handlers on mockServer
  const calls = mockServer.setRequestHandler.mock.calls;
  listTools = calls.find((c) => c[0] === 'ListTools')![1];
  callTool = calls.find((c) => c[0] === 'CallTool')![1];
}

const call = (name: string, args: Record<string, unknown> = {}) =>
  callTool({ params: { name, arguments: args } });
const textOf = (res: { content: Array<{ text: string }> }) => res.content[0].text;
const tokenResponse = (accessToken = 'tok1', expiresIn = 300) => ({
  data: { access_token: accessToken, expires_in: expiresIn },
});

beforeEach(() => {
  mockBackendClient.get.mockReset();
  mockAxiosPost.mockReset();
});

describe('ListTools', () => {
  beforeAll(() => loadModule());

  it('advertises the four read-only eDOCS tools', async () => {
    const { tools } = await listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'document_profile',
      'document_versions',
      'workspace_documents',
      'workspace_list',
    ]);
  });
});

describe('workspace_list', () => {
  beforeEach(() => loadModule());

  it('fetches a token then GETs /workspaces with a Bearer header', async () => {
    mockAxiosPost.mockResolvedValueOnce(tokenResponse());
    mockBackendClient.get.mockResolvedValueOnce({ data: { data: [{ id: 'ws-1' }] } });

    const res = await call('workspace_list');

    expect(JSON.parse(textOf(res))).toEqual([{ id: 'ws-1' }]);
    expect(mockBackendClient.get).toHaveBeenCalledWith('/workspaces', {
      headers: { Authorization: 'Bearer tok1' },
    });
    const [tokenUrl, body] = mockAxiosPost.mock.calls[0];
    expect(tokenUrl).toBe('http://localhost:8080/realms/ronl/protocol/openid-connect/token');
    expect((body as URLSearchParams).toString()).toBe(
      'grant_type=client_credentials&client_id=edocs-mcp-client&client_secret=secret'
    );
  });

  it('caches the token across calls within its lifetime', async () => {
    mockAxiosPost.mockResolvedValueOnce(tokenResponse());
    mockBackendClient.get.mockResolvedValue({ data: { data: [] } });

    await call('workspace_list');
    await call('workspace_list');

    expect(mockAxiosPost).toHaveBeenCalledTimes(1);
    expect(mockBackendClient.get).toHaveBeenCalledTimes(2);
  });

  it('re-fetches the token and retries once on a 401 from the backend', async () => {
    mockAxiosPost
      .mockResolvedValueOnce(tokenResponse('tok1'))
      .mockResolvedValueOnce(tokenResponse('tok2'));
    mockBackendClient.get
      .mockRejectedValueOnce({ response: { status: 401 } })
      .mockResolvedValueOnce({ data: { data: [{ id: 'ws-1' }] } });

    const res = await call('workspace_list');

    expect(JSON.parse(textOf(res))).toEqual([{ id: 'ws-1' }]);
    expect(mockAxiosPost).toHaveBeenCalledTimes(2);
    expect(mockBackendClient.get).toHaveBeenNthCalledWith(2, '/workspaces', {
      headers: { Authorization: 'Bearer tok2' },
    });
  });

  it('surfaces a missing access_token as an error result', async () => {
    mockAxiosPost.mockResolvedValueOnce({ data: {} });

    const res = await call('workspace_list');

    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain('no access_token');
    expect(mockBackendClient.get).not.toHaveBeenCalled();
  });

  it('propagates a non-auth backend failure as an error result', async () => {
    mockAxiosPost.mockResolvedValueOnce(tokenResponse());
    mockBackendClient.get.mockRejectedValueOnce(new Error('upstream exploded'));

    const res = await call('workspace_list');

    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain('upstream exploded');
  });
});

describe('workspace_documents / document_profile / document_versions', () => {
  beforeEach(() => loadModule());

  it('workspace_documents GETs /workspaces/:id/documents', async () => {
    mockAxiosPost.mockResolvedValueOnce(tokenResponse());
    mockBackendClient.get.mockResolvedValueOnce({
      data: { data: { workspaceId: 'ws-9', documents: [{ id: 'doc-1' }] } },
    });

    const res = await call('workspace_documents', { workspaceId: 'ws-9' });

    expect(JSON.parse(textOf(res))).toEqual({ workspaceId: 'ws-9', documents: [{ id: 'doc-1' }] });
    expect(mockBackendClient.get).toHaveBeenCalledWith('/workspaces/ws-9/documents', {
      headers: { Authorization: 'Bearer tok1' },
    });
  });

  it('document_profile GETs /documents/:id/profile', async () => {
    mockAxiosPost.mockResolvedValueOnce(tokenResponse());
    mockBackendClient.get.mockResolvedValueOnce({ data: { data: { DOCNAME: 'Doc' } } });

    const res = await call('document_profile', { documentId: 'doc-1' });

    expect(JSON.parse(textOf(res))).toEqual({ DOCNAME: 'Doc' });
    expect(mockBackendClient.get).toHaveBeenCalledWith('/documents/doc-1/profile', {
      headers: { Authorization: 'Bearer tok1' },
    });
  });

  it('document_versions GETs /documents/:id/versions', async () => {
    mockAxiosPost.mockResolvedValueOnce(tokenResponse());
    mockBackendClient.get.mockResolvedValueOnce({
      data: { data: { documentId: 'doc-1', versions: [{ id: 'v1', version: '1' }] } },
    });

    const res = await call('document_versions', { documentId: 'doc-1' });

    expect(JSON.parse(textOf(res))).toEqual({
      documentId: 'doc-1',
      versions: [{ id: 'v1', version: '1' }],
    });
    expect(mockBackendClient.get).toHaveBeenCalledWith('/documents/doc-1/versions', {
      headers: { Authorization: 'Bearer tok1' },
    });
  });

  it('missing required args return an error result without touching the network', async () => {
    expect((await call('workspace_documents')).isError).toBe(true);
    expect((await call('document_profile')).isError).toBe(true);
    expect((await call('document_versions')).isError).toBe(true);
    expect(mockAxiosPost).not.toHaveBeenCalled();
    expect(mockBackendClient.get).not.toHaveBeenCalled();
  });
});

describe('error handling', () => {
  beforeAll(() => loadModule());

  it('unknown tool → error result', async () => {
    const res = await call('nope');
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain('Unknown tool: nope');
  });
});

describe('backend base URL', () => {
  it('defaults to http://localhost:<PORT>', async () => {
    loadModule({ PORT: '4000' });
    mockAxiosPost.mockResolvedValueOnce(tokenResponse());
    mockBackendClient.get.mockResolvedValueOnce({ data: { data: [] } });

    await call('workspace_list');

    // axios.create's baseURL is captured on the constructed instance's config —
    // assert via the create() call args, the last thing this module does before use.
    const axiosDefault = jest.requireMock('axios').default as { create: jest.Mock };
    const createArgs = axiosDefault.create.mock.calls[axiosDefault.create.mock.calls.length - 1][0];
    expect(createArgs.baseURL).toBe('http://localhost:4000/v1/edocs');
  });

  it('EDOCS_MCP_BACKEND_URL overrides the PORT-derived default', async () => {
    loadModule({ EDOCS_MCP_BACKEND_URL: 'https://acc.api.open-regels.nl' });
    mockAxiosPost.mockResolvedValueOnce(tokenResponse());
    mockBackendClient.get.mockResolvedValueOnce({ data: { data: [] } });

    await call('workspace_list');

    const axiosDefault = jest.requireMock('axios').default as { create: jest.Mock };
    const createArgs = axiosDefault.create.mock.calls[axiosDefault.create.mock.calls.length - 1][0];
    expect(createArgs.baseURL).toBe('https://acc.api.open-regels.nl/v1/edocs');
  });
});
