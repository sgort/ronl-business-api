/**
 * Unit tests for McpRegistry — provider registration, connect/disconnect
 * lifecycle, tool routing, tool-definition aggregation, system-prompt assembly
 * and provider filtering. Providers are stubbed; only the logger is mocked.
 */

jest.mock('@utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import { McpRegistry } from './McpRegistry';
import type { McpProvider, ToolDefinition } from './McpProvider';

const tool = (name: string): ToolDefinition => ({
  name,
  description: name,
  input_schema: {},
});

function makeProvider(
  id: string,
  opts: {
    connected?: boolean;
    tools?: ToolDefinition[];
    prompt?: string;
    connect?: jest.Mock;
    disconnect?: jest.Mock;
  } = {}
): McpProvider {
  return {
    meta: { id, displayName: `${id} name`, description: `${id} desc` },
    connect: opts.connect ?? jest.fn().mockResolvedValue(undefined),
    disconnect: opts.disconnect ?? jest.fn().mockResolvedValue(undefined),
    isConnected: jest.fn(() => opts.connected ?? true),
    getToolDefinitions: jest.fn().mockResolvedValue(opts.tools ?? []),
    callTool: jest.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] }),
    systemPromptContribution: jest.fn(() => opts.prompt ?? ''),
  };
}

let registry: McpRegistry;
beforeEach(() => {
  registry = new McpRegistry();
});

describe('connectAll / callTool', () => {
  it('connects providers, indexes their tools, and routes callTool to the owner', async () => {
    const p = makeProvider('op', { tools: [tool('search')] });
    registry.register(p);

    await registry.connectAll();
    await registry.callTool('search', { q: 'x' });

    expect(p.connect).toHaveBeenCalled();
    expect(p.callTool).toHaveBeenCalledWith('search', { q: 'x' });
  });

  it('continues when one provider fails to connect', async () => {
    const bad = makeProvider('bad', { connect: jest.fn().mockRejectedValue(new Error('nope')) });
    const good = makeProvider('good', { tools: [tool('t1')] });
    registry.register(bad);
    registry.register(good);

    await registry.connectAll();

    // good provider's tool is still routable
    await registry.callTool('t1', {});
    expect(good.callTool).toHaveBeenCalled();
  });

  it('throws when no provider owns the requested tool', async () => {
    await expect(registry.callTool('ghost', {})).rejects.toThrow(
      'No provider found for tool: ghost'
    );
  });
});

describe('getToolDefinitions', () => {
  it('aggregates tools only from connected providers', async () => {
    registry.register(makeProvider('a', { connected: true, tools: [tool('a1')] }));
    registry.register(makeProvider('b', { connected: false, tools: [tool('b1')] }));

    const tools = await registry.getToolDefinitions();

    expect(tools.map((t) => t.name)).toEqual(['a1']);
  });

  it('filters by the requested provider ids', async () => {
    registry.register(makeProvider('a', { tools: [tool('a1')] }));
    registry.register(makeProvider('b', { tools: [tool('b1')] }));

    const tools = await registry.getToolDefinitions(['b']);

    expect(tools.map((t) => t.name)).toEqual(['b1']);
  });
});

describe('buildSystemPrompt', () => {
  it('joins the contributions of connected providers', () => {
    registry.register(makeProvider('a', { prompt: 'Prompt A' }));
    registry.register(makeProvider('b', { connected: false, prompt: 'Prompt B' }));

    expect(registry.buildSystemPrompt()).toBe('Prompt A');
  });
});

describe('disconnectAll', () => {
  it('disconnects providers and clears the tool index', async () => {
    const p = makeProvider('op', { tools: [tool('search')] });
    registry.register(p);
    await registry.connectAll();

    await registry.disconnectAll();

    expect(p.disconnect).toHaveBeenCalled();
    // tool index cleared → routing now fails
    await expect(registry.callTool('search', {})).rejects.toThrow(/No provider found/);
  });

  it('swallows a disconnect error', async () => {
    const p = makeProvider('op', { disconnect: jest.fn().mockRejectedValue(new Error('boom')) });
    registry.register(p);
    await expect(registry.disconnectAll()).resolves.toBeUndefined();
  });
});

describe('metadata helpers', () => {
  it('getProviderMeta reports the connected flag', () => {
    registry.register(makeProvider('a', { connected: true }));
    registry.register(makeProvider('b', { connected: false }));

    const meta = registry.getProviderMeta();
    expect(meta).toEqual([
      expect.objectContaining({ id: 'a', connected: true }),
      expect.objectContaining({ id: 'b', connected: false }),
    ]);
  });

  it('isAnyConnected reflects provider state and id filtering', () => {
    registry.register(makeProvider('a', { connected: false }));
    registry.register(makeProvider('b', { connected: true }));

    expect(registry.isAnyConnected()).toBe(true);
    expect(registry.isAnyConnected(['a'])).toBe(false);
    expect(registry.isAnyConnected(['unknown'])).toBe(false); // unknown ids resolve to nothing
  });
});

describe('failures that are not Error instances', () => {
  // An MCP transport dying mid-handshake can reject with a bare string; the
  // registry has to keep going and log something readable either way.
  it('continues when a provider rejects connect with a string', async () => {
    const bad = makeProvider('bad', { connect: jest.fn().mockRejectedValue('socket hang up') });
    const good = makeProvider('good', { tools: [tool('t1')] });
    registry.register(bad);
    registry.register(good);

    await registry.connectAll();

    await registry.callTool('t1', {});
    expect(good.callTool).toHaveBeenCalled();
  });

  it('swallows a disconnect that rejects with a string', async () => {
    const p = makeProvider('op', { disconnect: jest.fn().mockRejectedValue('socket hang up') });
    registry.register(p);
    await expect(registry.disconnectAll()).resolves.toBeUndefined();
  });
});
