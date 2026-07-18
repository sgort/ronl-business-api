/**
 * Unit tests for EdocsMcpProvider — ALLOWED_TOOLS filtering, callTool delegation,
 * connection guards and system prompt. MCP SDK mocked; mock client injected.
 */

const mockClientCtor = jest.fn();
const mockTransportCtor = jest.fn();
jest.mock('@modelcontextprotocol/sdk/client/index.js', () => ({ Client: mockClientCtor }));
jest.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: mockTransportCtor,
}));
jest.mock('@utils/config', () => ({
  config: {
    keycloak: { url: 'http://localhost:8080', realm: 'ronl' },
    edocsMcp: { enabled: true, clientId: 'edocs-mcp-client', clientSecret: 'test-secret' },
    port: 3002,
  },
}));
jest.mock('@utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import { EdocsMcpProvider } from './EdocsMcpProvider';

const inject = (p: object, client: unknown) => {
  (p as { client: unknown }).client = client;
};

beforeEach(() => jest.clearAllMocks());

describe('EdocsMcpProvider — connect', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('creates a transport + client and marks itself connected', async () => {
    const p = new EdocsMcpProvider();
    const client = { connect: jest.fn().mockResolvedValue(undefined) };
    mockTransportCtor.mockImplementation(() => ({ stderr: { on: jest.fn() } }));
    mockClientCtor.mockImplementation(() => client);

    await p.connect();

    expect(client.connect).toHaveBeenCalled();
    expect(p.isConnected()).toBe(true);
  });

  it('forwards Keycloak + the dedicated edocs-mcp-client credentials, not the DM-server ones', async () => {
    const p = new EdocsMcpProvider();
    const client = { connect: jest.fn().mockResolvedValue(undefined) };
    mockTransportCtor.mockImplementation(() => ({ stderr: { on: jest.fn() } }));
    mockClientCtor.mockImplementation(() => client);

    await p.connect();

    const { env } = mockTransportCtor.mock.calls[0][0] as { env: Record<string, string> };
    expect(env).toMatchObject({
      KEYCLOAK_URL: 'http://localhost:8080',
      KEYCLOAK_REALM: 'ronl',
      EDOCS_MCP_CLIENT_ID: 'edocs-mcp-client',
      EDOCS_MCP_CLIENT_SECRET: 'test-secret',
      PORT: '3002',
    });
    expect(env).not.toHaveProperty('EDOCS_BASE_URL');
    expect(env).not.toHaveProperty('EDOCS_PASSWORD');
  });

  it('is a no-op when already connected', async () => {
    const p = new EdocsMcpProvider();
    inject(p, {});
    await p.connect();
    expect(mockClientCtor).not.toHaveBeenCalled();
  });
});

describe('EdocsMcpProvider', () => {
  it('getToolDefinitions returns only allowed tools, mapped', async () => {
    const p = new EdocsMcpProvider();
    inject(p, {
      listTools: jest.fn().mockResolvedValue({
        tools: [
          {
            name: 'workspace_list',
            description: 'List workspaces',
            inputSchema: { type: 'object' },
          },
          { name: 'secret', description: 'nope', inputSchema: {} },
        ],
      }),
    });

    await expect(p.getToolDefinitions()).resolves.toEqual([
      { name: 'workspace_list', description: 'List workspaces', input_schema: { type: 'object' } },
    ]);
  });

  it('callTool delegates to the client', async () => {
    const p = new EdocsMcpProvider();
    const result = { content: [{ type: 'text', text: 'ok' }] };
    inject(p, { callTool: jest.fn().mockResolvedValue(result) });
    await expect(p.callTool('workspace_list', {})).resolves.toBe(result);
  });

  it('throws when not connected', async () => {
    const p = new EdocsMcpProvider();
    await expect(p.getToolDefinitions()).rejects.toThrow('not connected');
    await expect(p.callTool('x', {})).rejects.toThrow('not connected');
  });

  it('reflects connection state and contributes a system prompt', () => {
    const p = new EdocsMcpProvider();
    expect(p.isConnected()).toBe(false);
    inject(p, {});
    expect(p.isConnected()).toBe(true);
    expect(p.systemPromptContribution()).toContain('eDOCS');
  });

  it('disconnect closes the client and clears the connection', async () => {
    const p = new EdocsMcpProvider();
    const client = { close: jest.fn().mockResolvedValue(undefined) };
    inject(p, client);
    await p.disconnect();
    expect(client.close).toHaveBeenCalled();
    expect(p.isConnected()).toBe(false);
  });

  it('disconnect is a no-op when not connected', async () => {
    const p = new EdocsMcpProvider();
    await expect(p.disconnect()).resolves.toBeUndefined();
  });
});

describe('EdocsMcpProvider — command path and stderr handlers', () => {
  const origNodeEnv = process.env.NODE_ENV;
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    process.env.NODE_ENV = origNodeEnv;
    jest.useRealTimers();
  });

  it('uses node + dist path in production', async () => {
    process.env.NODE_ENV = 'production';
    const p = new EdocsMcpProvider();
    const client = { connect: jest.fn().mockResolvedValue(undefined) };
    mockTransportCtor.mockImplementation(() => ({ stderr: { on: jest.fn() } }));
    mockClientCtor.mockImplementation(() => client);

    await p.connect();

    const { command, args } = mockTransportCtor.mock.calls[0][0] as {
      command: string;
      args: string[];
    };
    expect(command).toBe('node');
    expect(args[0].replace(/\\/g, '/')).toContain('dist/mcp-servers/edocs/index.js');
  });

  it('invokes the stderr data handler and suppresses empty lines', async () => {
    const handlers: Record<string, (...a: unknown[]) => void> = {};
    mockTransportCtor.mockImplementation(() => ({
      stderr: {
        on: (event: string, fn: (...a: unknown[]) => void) => {
          handlers[event] = fn;
        },
      },
    }));
    mockClientCtor.mockImplementation(() => ({ connect: jest.fn().mockResolvedValue(undefined) }));

    const p = new EdocsMcpProvider();
    await p.connect();

    handlers['data'](Buffer.from('stderr output'));
    handlers['data'](Buffer.from('   '));
  });

  it('invokes the stderr error handler: EPIPE suppressed, others logged', async () => {
    const handlers: Record<string, (...a: unknown[]) => void> = {};
    mockTransportCtor.mockImplementation(() => ({
      stderr: {
        on: (event: string, fn: (...a: unknown[]) => void) => {
          handlers[event] = fn;
        },
      },
    }));
    mockClientCtor.mockImplementation(() => ({ connect: jest.fn().mockResolvedValue(undefined) }));

    const p = new EdocsMcpProvider();
    await p.connect();

    handlers['error'](Object.assign(new Error('pipe'), { code: 'EPIPE' }));
    handlers['error'](Object.assign(new Error('connect'), { code: 'ECONNREFUSED' }));
  });
});
