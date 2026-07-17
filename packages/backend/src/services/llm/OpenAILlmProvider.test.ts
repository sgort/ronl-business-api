/**
 * Unit tests for OpenAILlmProvider — streamTurn (streamed text, streamed
 * tool-call accumulation across deltas, stop-reason) and the message flattening
 * (tool_results → per-result tool messages). The openai SDK is mocked.
 */

const mockCreate = jest.fn();

jest.mock('openai', () => {
  const ctor = jest.fn(() => ({ chat: { completions: { create: mockCreate } } }));
  return { __esModule: true, default: ctor };
});

const mockConfig = { openai: { apiKey: 'test-key' } };
jest.mock('@utils/config', () => ({ config: mockConfig }));

import { OpenAILlmProvider } from './OpenAILlmProvider';
import type { LlmStreamParams } from './LlmProvider';

const baseParams = (over: Partial<LlmStreamParams> = {}): LlmStreamParams => ({
  modelId: 'gpt-4o',
  maxTokens: 1000,
  systemPrompt: 'sys',
  tools: [{ name: 'search', description: 'd', input_schema: { type: 'object' } }],
  messages: [{ role: 'user', content: 'hi' }],
  ...over,
});

/** A chat.completions stream is consumed with `for await` — an array suffices. */
const chunk = (delta: unknown) => ({ choices: [{ delta }] });

let provider: OpenAILlmProvider;
beforeEach(() => {
  jest.clearAllMocks();
  mockConfig.openai.apiKey = 'test-key';
  provider = new OpenAILlmProvider();
});

describe('isAvailable', () => {
  it('reflects whether an API key is configured', () => {
    expect(provider.isAvailable()).toBe(true);
    mockConfig.openai.apiKey = '';
    expect(provider.isAvailable()).toBe(false);
  });
});

describe('streamTurn', () => {
  it('accumulates streamed text and ends the turn when there are no tool calls', async () => {
    mockCreate.mockResolvedValue([
      chunk({ content: 'Hel' }),
      chunk({ content: 'lo' }),
      chunk(undefined), // no delta → skipped
    ]);

    const deltas: string[] = [];
    const res = await provider.streamTurn(baseParams(), (t) => deltas.push(t));

    expect(deltas).toEqual(['Hel', 'lo']);
    expect(res.text).toBe('Hello');
    expect(res.toolUses).toEqual([]);
    expect(res.stopReason).toBe('end_turn');
  });

  it('accumulates a tool call streamed across multiple deltas', async () => {
    mockCreate.mockResolvedValue([
      chunk({ tool_calls: [{ index: 0, id: 'call_1', function: { name: 'search' } }] }),
      chunk({ tool_calls: [{ index: 0, function: { arguments: '{"q":' } }] }),
      chunk({ tool_calls: [{ index: 0, function: { arguments: '"x"}' } }] }),
    ]);

    const res = await provider.streamTurn(baseParams(), () => {});

    expect(res.toolUses).toEqual([{ id: 'call_1', name: 'search', input: { q: 'x' } }]);
    expect(res.stopReason).toBe('tool_use');
  });

  it('defaults empty tool-call arguments to {}', async () => {
    mockCreate.mockResolvedValue([
      chunk({ tool_calls: [{ index: 0, id: 'call_1', function: { name: 'ping' } }] }),
    ]);
    const res = await provider.streamTurn(baseParams(), () => {});
    expect(res.toolUses).toEqual([{ id: 'call_1', name: 'ping', input: {} }]);
  });

  it('prepends the system prompt and flattens tool_results into per-result tool messages', async () => {
    mockCreate.mockResolvedValue([]);

    await provider.streamTurn(
      baseParams({
        messages: [
          { role: 'user', content: 'u' },
          { role: 'assistant', content: 'a' },
          { role: 'assistant_tool_use', toolUses: [{ id: 'c1', name: 'search', input: { q: 1 } }] },
          {
            role: 'tool_results',
            results: [
              { toolUseId: 'c1', content: 'r1' },
              { toolUseId: 'c2', content: 'r2' },
            ],
          },
        ],
      }),
      () => {}
    );

    const req = mockCreate.mock.calls[0][0];
    expect(req).toMatchObject({ model: 'gpt-4o', max_tokens: 1000, stream: true });
    expect(req.messages).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'u' },
      { role: 'assistant', content: 'a' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          { id: 'c1', type: 'function', function: { name: 'search', arguments: '{"q":1}' } },
        ],
      },
      { role: 'tool', tool_call_id: 'c1', content: 'r1' },
      { role: 'tool', tool_call_id: 'c2', content: 'r2' },
    ]);
  });

  it('maps tools into the OpenAI function-tool shape', async () => {
    mockCreate.mockResolvedValue([]);
    await provider.streamTurn(baseParams(), () => {});
    const req = mockCreate.mock.calls[0][0];
    expect(req.tools).toEqual([
      {
        type: 'function',
        function: { name: 'search', description: 'd', parameters: { type: 'object' } },
      },
    ]);
  });
});
