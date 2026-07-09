/**
 * Unit tests for mcpChat.service — the agentic LLM chat loop. Drives the loop
 * with a mocked llm provider + mcp registry and asserts the emitted stream
 * events, tool-call orchestration, error mapping, abort, and the round cap.
 *
 * LlmProvider (the real module) is used unmocked so `instanceof LlmError` works.
 */

jest.mock('@services/mcp/McpRegistry', () => ({
  mcpRegistry: {
    getToolDefinitions: jest.fn(),
    buildSystemPrompt: jest.fn(),
    callTool: jest.fn(),
  },
}));
jest.mock('@services/llm/LlmRegistry', () => ({
  llmRegistry: { getProvider: jest.fn() },
}));
jest.mock('@utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import { runChatStream, type ChatStreamEvent } from './mcpChat.service';
import { mcpRegistry } from '@services/mcp/McpRegistry';
import { llmRegistry } from '@services/llm/LlmRegistry';
import { LlmError, type LlmTurnResult } from '@services/llm/LlmProvider';

const mcp = mcpRegistry as unknown as {
  getToolDefinitions: jest.Mock;
  buildSystemPrompt: jest.Mock;
  callTool: jest.Mock;
};
const llm = llmRegistry as unknown as { getProvider: jest.Mock };

const makeProvider = (streamTurn: jest.Mock) => ({
  meta: { id: 'p', displayName: 'P', models: [] },
  isAvailable: () => true,
  streamTurn,
});

const endTurn = (text = ''): LlmTurnResult => ({ text, toolUses: [], stopReason: 'end_turn' });
const toolTurn = (name: string, input: Record<string, unknown> = {}): LlmTurnResult => ({
  text: '',
  toolUses: [{ id: `${name}-1`, name, input }],
  stopReason: 'tool_use',
});

let events: ChatStreamEvent[];
const emit = (e: ChatStreamEvent) => events.push(e);

beforeEach(() => {
  jest.clearAllMocks();
  events = [];
  mcp.getToolDefinitions.mockResolvedValue([]);
  mcp.buildSystemPrompt.mockReturnValue('system');
});

describe('runChatStream', () => {
  it('emits an error and stops when the model is unknown', async () => {
    llm.getProvider.mockReturnValue(null);
    await runChatStream([], 'hi', emit, [], 'bad-model');
    expect(events).toEqual([{ type: 'error', message: 'Unknown model: bad-model' }]);
  });

  it('streams a plain assistant answer and ends the turn', async () => {
    const streamTurn = jest.fn(async (_p, onDelta: (t: string) => void) => {
      onDelta('Hello');
      return endTurn('Hello');
    });
    llm.getProvider.mockReturnValue(makeProvider(streamTurn));

    await runChatStream([{ role: 'user', content: 'prev' }], 'hi', emit, ['p1'], 'model-1');

    expect(events).toContainEqual({ type: 'delta', text: 'Hello' });
    expect(streamTurn).toHaveBeenCalledTimes(1);
    // selected providers are forwarded to the registry
    expect(mcp.getToolDefinitions).toHaveBeenCalledWith(['p1']);
    // history + new user message are passed to the provider
    const passedMessages = streamTurn.mock.calls[0][0].messages;
    expect(passedMessages).toEqual([
      { role: 'user', content: 'prev' },
      { role: 'user', content: 'hi' },
    ]);
  });

  it('passes undefined provider filter when none are selected', async () => {
    llm.getProvider.mockReturnValue(makeProvider(jest.fn(async () => endTurn())));
    await runChatStream([], 'hi', emit, [], 'model-1');
    expect(mcp.getToolDefinitions).toHaveBeenCalledWith(undefined);
    expect(mcp.buildSystemPrompt).toHaveBeenCalledWith(undefined);
  });

  it('executes a tool round then completes on the next turn', async () => {
    const streamTurn = jest
      .fn()
      .mockImplementationOnce(async () => toolTurn('search', { q: 'x' }))
      .mockImplementationOnce(async (_p, onDelta: (t: string) => void) => {
        onDelta('done');
        return endTurn('done');
      });
    llm.getProvider.mockReturnValue(makeProvider(streamTurn));
    mcp.callTool.mockResolvedValue({ content: [{ text: 'result text' }] });

    await runChatStream([], 'hi', emit, [], 'model-1');

    expect(events).toContainEqual({ type: 'status', message: 'Calling search…' });
    expect(mcp.callTool).toHaveBeenCalledWith('search', { q: 'x' });
    expect(streamTurn).toHaveBeenCalledTimes(2);
    expect(events).toContainEqual({ type: 'delta', text: 'done' });
    // the tool result is fed back to the provider on the second turn
    const secondMessages = streamTurn.mock.calls[1][0].messages;
    const toolResults = secondMessages.find((m: { role: string }) => m.role === 'tool_results');
    expect(toolResults.results[0]).toMatchObject({ toolUseId: 'search-1', content: 'result text' });
  });

  it('feeds a failed tool call back as an error result', async () => {
    const streamTurn = jest
      .fn()
      .mockImplementationOnce(async () => toolTurn('search'))
      .mockImplementationOnce(async () => endTurn());
    llm.getProvider.mockReturnValue(makeProvider(streamTurn));
    mcp.callTool.mockRejectedValue(new Error('tool boom'));

    await runChatStream([], 'hi', emit, [], 'model-1');

    const secondMessages = streamTurn.mock.calls[1][0].messages;
    const toolResults = secondMessages.find((m: { role: string }) => m.role === 'tool_results');
    expect(toolResults.results[0]).toMatchObject({ content: 'tool boom', isError: true });
  });

  it('truncates oversized tool results', async () => {
    const big = 'a'.repeat(13_000);
    const streamTurn = jest
      .fn()
      .mockImplementationOnce(async () => toolTurn('search'))
      .mockImplementationOnce(async () => endTurn());
    llm.getProvider.mockReturnValue(makeProvider(streamTurn));
    mcp.callTool.mockResolvedValue({ content: [{ text: big }] });

    await runChatStream([], 'hi', emit, [], 'model-1');

    const secondMessages = streamTurn.mock.calls[1][0].messages;
    const toolResults = secondMessages.find((m: { role: string }) => m.role === 'tool_results');
    expect(toolResults.results[0].content).toContain('[Result truncated');
  });

  it('maps an LlmError to its user message and code', async () => {
    const streamTurn = jest.fn(async () => {
      throw new LlmError('rate_limit', 'Te veel verzoeken.');
    });
    llm.getProvider.mockReturnValue(makeProvider(streamTurn));

    await runChatStream([], 'hi', emit, [], 'model-1');

    expect(events).toContainEqual({
      type: 'error',
      message: 'Te veel verzoeken.',
      code: 'rate_limit',
    });
  });

  it('maps a generic error to the Dutch fallback with llm_failure', async () => {
    const streamTurn = jest.fn(async () => {
      throw new Error('kaboom');
    });
    llm.getProvider.mockReturnValue(makeProvider(streamTurn));

    await runChatStream([], 'hi', emit, [], 'model-1');

    expect(events).toContainEqual({
      type: 'error',
      message: 'De AI-assistent kon geen antwoord genereren. Probeer het opnieuw.',
      code: 'llm_failure',
    });
  });

  it('returns immediately without a turn when the signal is already aborted', async () => {
    const streamTurn = jest.fn(async () => endTurn());
    llm.getProvider.mockReturnValue(makeProvider(streamTurn));

    await runChatStream([], 'hi', emit, [], 'model-1', { aborted: true } as AbortSignal);

    expect(streamTurn).not.toHaveBeenCalled();
    expect(events).toHaveLength(0);
  });

  it('stops after the max tool-round cap with a guidance message', async () => {
    const streamTurn = jest.fn(async () => toolTurn('search')); // always wants another tool
    llm.getProvider.mockReturnValue(makeProvider(streamTurn));
    mcp.callTool.mockResolvedValue({ content: [{ text: 'r' }] });

    await runChatStream([], 'hi', emit, [], 'model-1');

    expect(streamTurn).toHaveBeenCalledTimes(10); // MAX_TOOL_ROUNDS
    expect(events).toContainEqual({
      type: 'delta',
      text: 'Maximum tool call rounds reached. Please refine your question.',
    });
  });
});
