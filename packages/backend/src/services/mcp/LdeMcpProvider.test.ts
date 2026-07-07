/**
 * Unit tests for LdeMcpProvider — ALLOWED_TOOLS filtering, callTool delegation,
 * connection guards and system prompt. MCP SDK mocked; mock client injected.
 */

const mockClientCtor = jest.fn();
const mockTransportCtor = jest.fn();
jest.mock('@modelcontextprotocol/sdk/client/index.js', () => ({ Client: mockClientCtor }));
jest.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: mockTransportCtor,
}));
jest.mock('@utils/config', () => ({
  config: { lde: { databaseUrl: 'lde://db', enabled: true } },
}));
jest.mock('@utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import { LdeMcpProvider } from './LdeMcpProvider';

const inject = (p: object, client: unknown) => {
  (p as { client: unknown }).client = client;
};

beforeEach(() => jest.clearAllMocks());

describe('LdeMcpProvider — connect', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('creates a transport + client and marks itself connected', async () => {
    const p = new LdeMcpProvider();
    const client = { connect: jest.fn().mockResolvedValue(undefined) };
    mockTransportCtor.mockImplementation(() => ({ stderr: { on: jest.fn() } }));
    mockClientCtor.mockImplementation(() => client);

    await p.connect();

    expect(client.connect).toHaveBeenCalled();
    expect(p.isConnected()).toBe(true);
  });

  it('is a no-op when already connected', async () => {
    const p = new LdeMcpProvider();
    inject(p, {});
    await p.connect();
    expect(mockClientCtor).not.toHaveBeenCalled();
  });
});

describe('LdeMcpProvider', () => {
  it('getToolDefinitions returns only allowed tools, mapped', async () => {
    const p = new LdeMcpProvider();
    inject(p, {
      listTools: jest.fn().mockResolvedValue({
        tools: [
          { name: 'bundle_list', description: 'List bundles', inputSchema: { type: 'object' } },
          { name: 'secret', description: 'nope', inputSchema: {} },
        ],
      }),
    });

    await expect(p.getToolDefinitions()).resolves.toEqual([
      { name: 'bundle_list', description: 'List bundles', input_schema: { type: 'object' } },
    ]);
  });

  it('callTool delegates to the client', async () => {
    const p = new LdeMcpProvider();
    const result = { content: [{ type: 'text', text: 'ok' }] };
    inject(p, { callTool: jest.fn().mockResolvedValue(result) });
    await expect(p.callTool('bundle_list', {})).resolves.toBe(result);
  });

  it('throws when not connected', async () => {
    const p = new LdeMcpProvider();
    await expect(p.getToolDefinitions()).rejects.toThrow('not connected');
    await expect(p.callTool('x', {})).rejects.toThrow('not connected');
  });

  it('reflects connection state and contributes a system prompt', () => {
    const p = new LdeMcpProvider();
    expect(p.isConnected()).toBe(false);
    inject(p, {});
    expect(p.isConnected()).toBe(true);
    expect(p.systemPromptContribution()).toContain('Process Library');
  });

  it('disconnect closes the client and clears the connection', async () => {
    const p = new LdeMcpProvider();
    const client = { close: jest.fn().mockResolvedValue(undefined) };
    inject(p, client);
    await p.disconnect();
    expect(client.close).toHaveBeenCalled();
    expect(p.isConnected()).toBe(false);
  });
});
