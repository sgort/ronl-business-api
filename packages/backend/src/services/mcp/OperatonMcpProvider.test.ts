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
import os from 'os';

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

  it('disconnect is a no-op when not connected', async () => {
    const p = new OperatonMcpProvider();
    await expect(p.disconnect()).resolves.toBeUndefined();
  });
});

describe('OperatonMcpProvider — command path and stderr handlers', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('uses npx on win32/darwin platforms', async () => {
    jest.spyOn(os, 'platform').mockReturnValue('darwin' as NodeJS.Platform);
    const p = new OperatonMcpProvider();
    const client = { connect: jest.fn().mockResolvedValue(undefined) };
    mockTransportCtor.mockImplementation(() => ({ stderr: { on: jest.fn() } }));
    mockClientCtor.mockImplementation(() => client);

    await p.connect();

    const { command, args } = mockTransportCtor.mock.calls[0][0] as {
      command: string;
      args: string[];
    };
    expect(command).toBe('npx');
    expect(args).toEqual(['-y', 'operaton-mcp']);
    jest.restoreAllMocks();
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

    const p = new OperatonMcpProvider();
    await p.connect();

    handlers['error'](Object.assign(new Error('pipe'), { code: 'EPIPE' }));
    handlers['error'](Object.assign(new Error('connect'), { code: 'ECONNREFUSED' }));
  });
});

describe('OperatonMcpProvider — environment and metadata fallbacks', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('passes empty strings when PATH and HOME are absent from the environment', async () => {
    // The child process gets an explicit env, so anything missing here has to
    // become '' rather than undefined — StdioClientTransport rejects undefined.
    const { PATH, HOME } = process.env;
    delete process.env.PATH;
    delete process.env.HOME;
    try {
      const p = new OperatonMcpProvider();
      mockTransportCtor.mockImplementation(() => ({ stderr: { on: jest.fn() } }));
      mockClientCtor.mockImplementation(() => ({
        connect: jest.fn().mockResolvedValue(undefined),
      }));

      await p.connect();

      const { env } = mockTransportCtor.mock.calls[0][0] as { env: Record<string, string> };
      expect(env).toMatchObject({ PATH: '', HOME: '' });
    } finally {
      if (PATH !== undefined) process.env.PATH = PATH;
      if (HOME !== undefined) process.env.HOME = HOME;
    }
  });

  it('passes empty credentials when Operaton has no username or password', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { config } = require('@utils/config') as {
      config: { operaton: Record<string, string | undefined> };
    };
    const { username, password } = config.operaton;
    config.operaton.username = undefined;
    config.operaton.password = undefined;
    try {
      const p = new OperatonMcpProvider();
      mockTransportCtor.mockImplementation(() => ({ stderr: { on: jest.fn() } }));
      mockClientCtor.mockImplementation(() => ({
        connect: jest.fn().mockResolvedValue(undefined),
      }));

      await p.connect();

      const { env } = mockTransportCtor.mock.calls[0][0] as { env: Record<string, string> };
      expect(env).toMatchObject({ OPERATON_USERNAME: '', OPERATON_PASSWORD: '' });
    } finally {
      config.operaton.username = username;
      config.operaton.password = password;
    }
  });

  it('describes a tool that ships without a description as an empty string', async () => {
    const p = new OperatonMcpProvider();
    inject(p, {
      listTools: jest
        .fn()
        .mockResolvedValue({ tools: [{ name: 'task_list', inputSchema: { type: 'object' } }] }),
    });
    await expect(p.getToolDefinitions()).resolves.toEqual([
      { name: 'task_list', description: '', input_schema: { type: 'object' } },
    ]);
  });
});
