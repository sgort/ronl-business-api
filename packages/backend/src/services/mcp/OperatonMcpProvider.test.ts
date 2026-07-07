/**
 * Unit tests for OperatonMcpProvider — the ALLOWED_TOOLS filter, callTool
 * delegation, connection guards, and system prompt. The MCP SDK client/transport
 * are mocked; a mock client is injected so no child process is spawned.
 */

const mockClientCtor = jest.fn();
const mockTransportCtor = jest.fn();
jest.mock('@modelcontextprotocol/sdk/client/index.js', () => ({ Client: mockClientCtor }));
jest.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: mockTransportCtor,
}));
jest.mock('@utils/config', () => ({
  config: { operaton: { baseUrl: 'http://op', username: 'u', password: 'p' } },
}));
jest.mock('@utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import { OperatonMcpProvider } from './OperatonMcpProvider';

const inject = (p: object, client: unknown) => {
  (p as { client: unknown }).client = client;
};

beforeEach(() => jest.clearAllMocks());

describe('OperatonMcpProvider — connect', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('creates a transport + client and marks itself connected', async () => {
    const p = new OperatonMcpProvider();
    const client = { connect: jest.fn().mockResolvedValue(undefined) };
    mockTransportCtor.mockImplementation(() => ({ stderr: { on: jest.fn() } }));
    mockClientCtor.mockImplementation(() => client);

    await p.connect();

    expect(client.connect).toHaveBeenCalled();
    expect(p.isConnected()).toBe(true);
  });

  it('is a no-op when already connected', async () => {
    const p = new OperatonMcpProvider();
    inject(p, {});
    await p.connect();
    expect(mockClientCtor).not.toHaveBeenCalled();
  });
});

describe('OperatonMcpProvider', () => {
  it('getToolDefinitions returns only allowed tools, mapped to input_schema', async () => {
    const p = new OperatonMcpProvider();
    inject(p, {
      listTools: jest.fn().mockResolvedValue({
        tools: [
          { name: 'task_list', description: 'List tasks', inputSchema: { type: 'object' } },
          { name: 'secret_tool', description: 'nope', inputSchema: {} },
        ],
      }),
    });

    await expect(p.getToolDefinitions()).resolves.toEqual([
      { name: 'task_list', description: 'List tasks', input_schema: { type: 'object' } },
    ]);
  });

  it('callTool delegates to the client', async () => {
    const p = new OperatonMcpProvider();
    const result = { content: [{ type: 'text', text: 'ok' }] };
    inject(p, { callTool: jest.fn().mockResolvedValue(result) });
    await expect(p.callTool('task_list', { a: 1 })).resolves.toBe(result);
  });

  it('throws when not connected', async () => {
    const p = new OperatonMcpProvider();
    await expect(p.getToolDefinitions()).rejects.toThrow('not connected');
    await expect(p.callTool('x', {})).rejects.toThrow('not connected');
    expect(p.isConnected()).toBe(false);
  });

  it('reflects connection state and contributes a system prompt', () => {
    const p = new OperatonMcpProvider();
    expect(p.isConnected()).toBe(false);
    inject(p, {});
    expect(p.isConnected()).toBe(true);
    expect(p.systemPromptContribution()).toContain('Operaton');
  });

  it('disconnect closes the client and clears the connection', async () => {
    const p = new OperatonMcpProvider();
    const client = { close: jest.fn().mockResolvedValue(undefined) };
    inject(p, client);
    await p.disconnect();
    expect(client.close).toHaveBeenCalled();
    expect(p.isConnected()).toBe(false);
  });
});
