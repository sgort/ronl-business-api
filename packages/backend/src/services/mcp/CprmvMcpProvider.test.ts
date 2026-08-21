/**
 * Unit tests for CprmvMcpProvider — ALLOWED_TOOLS filtering, callTool delegation,
 * connection guards, system prompt, and the "Session not found" reconnect logic
 * in both getToolDefinitions and callTool.
 *
 * The MCP SDK is mocked. The reconnect tests let connect() run (it news up a
 * mocked Client), so fake timers guard its 30s race timeout.
 */

const mockClientCtor = jest.fn();
jest.mock('@modelcontextprotocol/sdk/client/index.js', () => ({ Client: mockClientCtor }));
jest.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: jest.fn(),
}));
jest.mock('@utils/config', () => ({ config: { cprmv: { url: 'http://cprmv' } } }));
jest.mock('@utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import { CprmvMcpProvider } from './CprmvMcpProvider';

const RULE_TOOL = 'rules_rules__rule_id_path__get';
const inject = (p: object, client: unknown) => {
  (p as { client: unknown }).client = client;
};

beforeEach(() => jest.clearAllMocks());

describe('CprmvMcpProvider — core', () => {
  it('getToolDefinitions returns only allowed tools, mapped', async () => {
    const p = new CprmvMcpProvider();
    inject(p, {
      listTools: jest.fn().mockResolvedValue({
        tools: [
          { name: RULE_TOOL, description: 'Get rule', inputSchema: { type: 'object' } },
          { name: 'secret', description: 'nope', inputSchema: {} },
        ],
      }),
    });

    await expect(p.getToolDefinitions()).resolves.toEqual([
      { name: RULE_TOOL, description: 'Get rule', input_schema: { type: 'object' } },
    ]);
  });

  it('callTool delegates to the client', async () => {
    const p = new CprmvMcpProvider();
    const result = { content: [{ type: 'text', text: 'ok' }] };
    inject(p, { callTool: jest.fn().mockResolvedValue(result) });
    await expect(p.callTool(RULE_TOOL, {})).resolves.toBe(result);
  });

  it('throws when not connected', async () => {
    const p = new CprmvMcpProvider();
    await expect(p.getToolDefinitions()).rejects.toThrow('not connected');
    await expect(p.callTool('x', {})).rejects.toThrow('not connected');
  });

  it('reflects connection state and contributes a system prompt', () => {
    const p = new CprmvMcpProvider();
    expect(p.isConnected()).toBe(false);
    inject(p, {});
    expect(p.isConnected()).toBe(true);
    expect(p.systemPromptContribution()).toContain('Legislation');
  });

  it('callTool rethrows a non-session error without reconnecting', async () => {
    const p = new CprmvMcpProvider();
    inject(p, {
      callTool: jest.fn().mockRejectedValue(new Error('other error')),
      close: jest.fn(),
    });
    await expect(p.callTool(RULE_TOOL, {})).rejects.toThrow('other error');
    expect(mockClientCtor).not.toHaveBeenCalled(); // no reconnect attempted
  });

  it('getToolDefinitions rethrows a non-session error without reconnecting', async () => {
    const p = new CprmvMcpProvider();
    inject(p, {
      listTools: jest.fn().mockRejectedValue(new Error('timeout')),
      close: jest.fn(),
    });
    await expect(p.getToolDefinitions()).rejects.toThrow('timeout');
    expect(mockClientCtor).not.toHaveBeenCalled();
  });

  it('disconnect is a no-op when not connected', async () => {
    const p = new CprmvMcpProvider();
    await expect(p.disconnect()).resolves.toBeUndefined();
  });
});

describe('CprmvMcpProvider — session reconnect', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('getToolDefinitions reconnects and retries on a lost session', async () => {
    const p = new CprmvMcpProvider();
    const client1 = {
      listTools: jest.fn().mockRejectedValue(new Error('Session not found')),
      close: jest.fn().mockResolvedValue(undefined),
    };
    inject(p, client1);

    const client2 = {
      connect: jest.fn().mockResolvedValue(undefined),
      listTools: jest
        .fn()
        .mockResolvedValue({ tools: [{ name: RULE_TOOL, description: 'd', inputSchema: {} }] }),
    };
    mockClientCtor.mockImplementation(() => client2);

    const tools = await p.getToolDefinitions();

    expect(client1.close).toHaveBeenCalled(); // disconnected
    expect(client2.connect).toHaveBeenCalled(); // reconnected
    expect(tools.map((t) => t.name)).toEqual([RULE_TOOL]);
  });

  it('callTool reconnects and retries on a lost session', async () => {
    const p = new CprmvMcpProvider();
    const client1 = {
      callTool: jest.fn().mockRejectedValue(new Error('Session not found')),
      close: jest.fn().mockResolvedValue(undefined),
    };
    inject(p, client1);

    const result = { content: [{ type: 'text', text: 'ok' }] };
    const client2 = {
      connect: jest.fn().mockResolvedValue(undefined),
      callTool: jest.fn().mockResolvedValue(result),
    };
    mockClientCtor.mockImplementation(() => client2);

    await expect(p.callTool(RULE_TOOL, {})).resolves.toBe(result);
    expect(client2.callTool).toHaveBeenCalledWith({ name: RULE_TOOL, arguments: {} });
  });
});

describe('CprmvMcpProvider — edge cases', () => {
  it('connect is a no-op once a client already exists', async () => {
    const p = new CprmvMcpProvider();
    inject(p, { close: jest.fn() });
    await p.connect();
    expect(mockClientCtor).not.toHaveBeenCalled();
  });

  it('describes a tool that ships without a description as an empty string', async () => {
    const p = new CprmvMcpProvider();
    inject(p, {
      listTools: jest.fn().mockResolvedValue({
        tools: [{ name: RULE_TOOL, inputSchema: { type: 'object' } }],
      }),
    });
    await expect(p.getToolDefinitions()).resolves.toEqual([
      { name: RULE_TOOL, description: '', input_schema: { type: 'object' } },
    ]);
  });

  it('rethrows a non-Error rejection from getToolDefinitions rather than reconnecting', async () => {
    // A transport that rejects with a bare string still has to reach the caller;
    // String(err) is what decides it is not a lost session.
    const p = new CprmvMcpProvider();
    inject(p, { listTools: jest.fn().mockRejectedValue('socket hang up'), close: jest.fn() });
    await expect(p.getToolDefinitions()).rejects.toBe('socket hang up');
    expect(mockClientCtor).not.toHaveBeenCalled();
  });

  it('rethrows a non-Error rejection from callTool rather than reconnecting', async () => {
    const p = new CprmvMcpProvider();
    inject(p, { callTool: jest.fn().mockRejectedValue('socket hang up'), close: jest.fn() });
    await expect(p.callTool(RULE_TOOL, {})).rejects.toBe('socket hang up');
    expect(mockClientCtor).not.toHaveBeenCalled();
  });
});

describe('CprmvMcpProvider — reconnect keeps mapping tools without a description', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('maps a description-less tool after reconnecting on a lost session', async () => {
    const p = new CprmvMcpProvider();
    inject(p, {
      listTools: jest.fn().mockRejectedValue(new Error('Session not found')),
      close: jest.fn().mockResolvedValue(undefined),
    });
    mockClientCtor.mockImplementation(() => ({
      connect: jest.fn().mockResolvedValue(undefined),
      listTools: jest.fn().mockResolvedValue({ tools: [{ name: RULE_TOOL, inputSchema: {} }] }),
    }));

    await expect(p.getToolDefinitions()).resolves.toEqual([
      { name: RULE_TOOL, description: '', input_schema: {} },
    ]);
  });
});
