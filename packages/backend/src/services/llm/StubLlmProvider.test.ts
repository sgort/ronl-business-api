/**
 * Unit tests for StubLlmProvider — the deterministic model the E2E suite chats
 * with. It is offered only when LLM_STUB_ENABLED is on, calls nothing external,
 * and answers with the number of MCP tools the chat collected for it.
 */

const mockConfig = { llmStub: { enabled: false } };
jest.mock('@utils/config', () => ({ config: mockConfig }));

import { StubLlmProvider } from './StubLlmProvider';
import type { LlmStreamParams } from './LlmProvider';

const params = (toolNames: string[]): LlmStreamParams => ({
  modelId: 'stub-model',
  messages: [{ role: 'user', content: 'Hallo' }],
  systemPrompt: '',
  tools: toolNames.map((name) => ({ name, description: name, input_schema: {} })),
  maxTokens: 4096,
});

beforeEach(() => {
  mockConfig.llmStub.enabled = false;
});

describe('StubLlmProvider', () => {
  it('is available only when LLM_STUB_ENABLED is on', () => {
    const p = new StubLlmProvider();
    expect(p.isAvailable()).toBe(false);
    mockConfig.llmStub.enabled = true;
    expect(p.isAvailable()).toBe(true);
  });

  it('answers with the number of tools it received, and ends the turn', async () => {
    const p = new StubLlmProvider();
    const deltas: string[] = [];

    const result = await p.streamTurn(params(['bundle_list', 'form_get', 'sparql']), (t) =>
      deltas.push(t)
    );

    expect(result.text).toBe('Stub model: received 3 tools.');
    expect(deltas.join('')).toBe(result.text);
    expect(result.toolUses).toEqual([]);
    expect(result.stopReason).toBe('end_turn');
  });

  it('says so when the chat collected no tools at all', async () => {
    const result = await new StubLlmProvider().streamTurn(params([]), () => undefined);
    expect(result.text).toBe('Stub model: received 0 tools.');
  });
});
