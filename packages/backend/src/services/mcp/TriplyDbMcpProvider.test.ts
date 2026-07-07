/**
 * Unit tests for TriplyDbMcpProvider — ALLOWED_TOOLS filtering, callTool
 * delegation, connection guards and system prompt. MCP SDK mocked; mock client
 * injected.
 */

const mockClientCtor = jest.fn();
const mockTransportCtor = jest.fn();
jest.mock('@modelcontextprotocol/sdk/client/index.js', () => ({ Client: mockClientCtor }));
jest.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: mockTransportCtor,
}));
jest.mock('@utils/config', () => ({
  config: { triplydb: { endpoint: 'http://triply', token: 't', enabled: true } },
}));
jest.mock('@utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import { TriplyDbMcpProvider } from './TriplyDbMcpProvider';

const inject = (p: object, client: unknown) => {
  (p as { client: unknown }).client = client;
};

beforeEach(() => jest.clearAllMocks());

describe('TriplyDbMcpProvider — connect', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('creates a transport + client and marks itself connected', async () => {
    const p = new TriplyDbMcpProvider();
    const client = { connect: jest.fn().mockResolvedValue(undefined) };
    mockTransportCtor.mockImplementation(() => ({ stderr: { on: jest.fn() } }));
    mockClientCtor.mockImplementation(() => client);

    await p.connect();

    expect(client.connect).toHaveBeenCalled();
    expect(p.isConnected()).toBe(true);
  });

  it('is a no-op when already connected', async () => {
    const p = new TriplyDbMcpProvider();
    inject(p, {});
    await p.connect();
    expect(mockClientCtor).not.toHaveBeenCalled();
  });
});

describe('TriplyDbMcpProvider', () => {
  it('getToolDefinitions returns only allowed tools, mapped', async () => {
    const p = new TriplyDbMcpProvider();
    inject(p, {
      listTools: jest.fn().mockResolvedValue({
        tools: [
          { name: 'dmn_list', description: 'List DMN', inputSchema: { type: 'object' } },
          { name: 'secret', description: 'nope', inputSchema: {} },
        ],
      }),
    });

    await expect(p.getToolDefinitions()).resolves.toEqual([
      { name: 'dmn_list', description: 'List DMN', input_schema: { type: 'object' } },
    ]);
  });

  it('callTool delegates to the client', async () => {
    const p = new TriplyDbMcpProvider();
    const result = { content: [{ type: 'text', text: 'ok' }] };
    inject(p, { callTool: jest.fn().mockResolvedValue(result) });
    await expect(p.callTool('dmn_list', {})).resolves.toBe(result);
  });

  it('throws when not connected', async () => {
    const p = new TriplyDbMcpProvider();
    await expect(p.getToolDefinitions()).rejects.toThrow('not connected');
    await expect(p.callTool('x', {})).rejects.toThrow('not connected');
  });

  it('reflects connection state and contributes a system prompt', () => {
    const p = new TriplyDbMcpProvider();
    expect(p.isConnected()).toBe(false);
    inject(p, {});
    expect(p.isConnected()).toBe(true);
    expect(p.systemPromptContribution()).toContain('Knowledge Graph');
  });

  it('disconnect closes the client and clears the connection', async () => {
    const p = new TriplyDbMcpProvider();
    const client = { close: jest.fn().mockResolvedValue(undefined) };
    inject(p, client);
    await p.disconnect();
    expect(client.close).toHaveBeenCalled();
    expect(p.isConnected()).toBe(false);
  });
});
