/**
 * Unit tests for AnthropicLlmProvider — streamTurn (text accumulation, tool-use
 * extraction, stop-reason mapping, message/tool translation) and the toLlmError
 * SDK-error → LlmError mapping. The @anthropic-ai/sdk is mocked; the error
 * classes are provided so `instanceof` checks in toLlmError resolve.
 */

class MockAPIError extends Error {
  status?: number;
  constructor(message = '', status?: number) {
    super(message);
    this.status = status;
  }
}
class MockNotFoundError extends MockAPIError {}
class MockAuthenticationError extends MockAPIError {}
class MockPermissionDeniedError extends MockAPIError {}
class MockRateLimitError extends MockAPIError {}
class MockAPIUserAbortError extends Error {}

const mockStream = jest.fn();

jest.mock('@anthropic-ai/sdk', () => {
  const ctor = jest.fn(() => ({ messages: { stream: mockStream } }));
  return {
    __esModule: true,
    default: Object.assign(ctor, {
      APIError: MockAPIError,
      NotFoundError: MockNotFoundError,
      AuthenticationError: MockAuthenticationError,
      PermissionDeniedError: MockPermissionDeniedError,
      RateLimitError: MockRateLimitError,
      APIUserAbortError: MockAPIUserAbortError,
    }),
  };
});

const mockConfig = { anthropic: { apiKey: 'test-key' } };
jest.mock('@utils/config', () => ({ config: mockConfig }));

import { AnthropicLlmProvider } from './AnthropicLlmProvider';
import { LlmError, type LlmStreamParams } from './LlmProvider';

const baseParams = (over: Partial<LlmStreamParams> = {}): LlmStreamParams => ({
  modelId: 'claude-opus-4-8',
  maxTokens: 1000,
  systemPrompt: 'sys',
  tools: [{ name: 'search', description: 'd', input_schema: { type: 'object' } }],
  messages: [{ role: 'user', content: 'hi' }],
  ...over,
});

/** Fake Anthropic stream: fires `deltas` on 'text', resolves/rejects finalMessage. */
function fakeStream(opts: { deltas?: string[]; final?: unknown; error?: unknown }) {
  return {
    on: (event: string, cb: (chunk: string) => void) => {
      if (event === 'text') (opts.deltas ?? []).forEach(cb);
    },
    finalMessage: async () => {
      if (opts.error) throw opts.error;
      return opts.final;
    },
  };
}

let provider: AnthropicLlmProvider;
beforeEach(() => {
  jest.clearAllMocks();
  mockConfig.anthropic.apiKey = 'test-key';
  provider = new AnthropicLlmProvider();
});

describe('isAvailable', () => {
  it('reflects whether an API key is configured', () => {
    expect(provider.isAvailable()).toBe(true);
    mockConfig.anthropic.apiKey = '';
    expect(provider.isAvailable()).toBe(false);
  });
});

describe('streamTurn', () => {
  it('accumulates text, extracts tool uses, and maps a tool_use stop reason', async () => {
    mockStream.mockReturnValue(
      fakeStream({
        deltas: ['Hel', 'lo'],
        final: {
          content: [
            { type: 'text', text: 'Hello' },
            { type: 'tool_use', id: 't1', name: 'search', input: { q: 1 } },
          ],
          stop_reason: 'tool_use',
        },
      })
    );

    const deltas: string[] = [];
    const res = await provider.streamTurn(baseParams(), (t) => deltas.push(t));

    expect(deltas).toEqual(['Hel', 'lo']);
    expect(res.text).toBe('Hello');
    expect(res.toolUses).toEqual([{ id: 't1', name: 'search', input: { q: 1 } }]);
    expect(res.stopReason).toBe('tool_use');
  });

  it('maps any non-tool_use stop reason to end_turn', async () => {
    mockStream.mockReturnValue(fakeStream({ final: { content: [], stop_reason: 'max_tokens' } }));
    const res = await provider.streamTurn(baseParams(), () => {});
    expect(res.stopReason).toBe('end_turn');
    expect(res.toolUses).toEqual([]);
  });

  it('translates agent messages and tools into the Anthropic request shape', async () => {
    mockStream.mockReturnValue(fakeStream({ final: { content: [], stop_reason: 'end_turn' } }));

    await provider.streamTurn(
      baseParams({
        messages: [
          { role: 'user', content: 'u' },
          { role: 'assistant', content: 'a' },
          { role: 'assistant_tool_use', toolUses: [{ id: 't1', name: 'search', input: { q: 1 } }] },
          {
            role: 'tool_results',
            results: [{ toolUseId: 't1', content: 'result', isError: false }],
          },
        ],
      }),
      () => {}
    );

    const req = mockStream.mock.calls[0][0];
    expect(req).toMatchObject({
      model: 'claude-opus-4-8',
      max_tokens: 1000,
      system: 'sys',
      output_config: { effort: 'medium' },
      tools: [{ name: 'search', description: 'd', input_schema: { type: 'object' } }],
    });
    expect(req.messages).toEqual([
      { role: 'user', content: 'u' },
      { role: 'assistant', content: 'a' },
      {
        role: 'assistant',
        content: [{ type: 'tool_use', id: 't1', name: 'search', input: { q: 1 } }],
      },
      {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 't1', content: 'result', is_error: false }],
      },
    ]);
  });
});

describe('toLlmError mapping', () => {
  /** Run streamTurn with a finalMessage that rejects, and return the thrown error. */
  const runAndCatch = async (error: unknown): Promise<unknown> => {
    mockStream.mockReturnValue(fakeStream({ error }));
    try {
      await provider.streamTurn(baseParams(), () => {});
      throw new Error('streamTurn did not throw');
    } catch (e) {
      return e;
    }
  };

  const expectCode = async (error: unknown, code: string) => {
    const e = await runAndCatch(error);
    expect(e).toBeInstanceOf(LlmError);
    expect((e as LlmError).code).toBe(code);
  };

  it('maps NotFoundError → model_unavailable', () =>
    expectCode(new MockNotFoundError('gone'), 'model_unavailable'));

  it('maps AuthenticationError → auth', () =>
    expectCode(new MockAuthenticationError('bad key'), 'auth'));

  it('maps PermissionDeniedError → forbidden', () =>
    expectCode(new MockPermissionDeniedError('no access'), 'forbidden'));

  it('maps RateLimitError → rate_limit', () =>
    expectCode(new MockRateLimitError('slow down'), 'rate_limit'));

  it('maps a 529 APIError → overloaded', () =>
    expectCode(new MockAPIError('overloaded', 529), 'overloaded'));

  it('passes an abort error through untouched (not an LlmError)', async () => {
    const abort = new MockAPIUserAbortError('aborted');
    await expect(runAndCatch(abort)).resolves.toBe(abort);
  });

  it('passes a name==="AbortError" through untouched', async () => {
    const abort = Object.assign(new Error('x'), { name: 'AbortError' });
    await expect(runAndCatch(abort)).resolves.toBe(abort);
  });

  it('passes an unrecognised error through untouched', async () => {
    const other = new Error('weird');
    await expect(runAndCatch(other)).resolves.toBe(other);
  });

  it('does not translate a non-529 APIError', async () => {
    const e = await runAndCatch(new MockAPIError('teapot', 418));
    expect(e).not.toBeInstanceOf(LlmError);
  });
});
