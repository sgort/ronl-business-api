import { config } from '@utils/config';
import type { LlmProvider, LlmProviderMeta, LlmStreamParams, LlmTurnResult } from './LlmProvider';

/**
 * A deterministic model for the E2E suite. The chat still runs through the real
 * MCP registry -- every selected source lists its tools -- and only the model
 * is replaced: it calls nothing external and answers with the number of tools
 * it received, so a test can tell that the sources were reached.
 *
 * Offered only when LLM_STUB_ENABLED is on; config refuses that in production.
 */
export class StubLlmProvider implements LlmProvider {
  readonly meta: LlmProviderMeta = {
    id: 'stub',
    displayName: 'Test',
    models: [{ id: 'stub-model', displayName: 'Stub model (E2E)' }],
  };

  isAvailable(): boolean {
    return config.llmStub.enabled;
  }

  async streamTurn(
    params: LlmStreamParams,
    onDelta: (text: string) => void
  ): Promise<LlmTurnResult> {
    const text = `Stub model: received ${params.tools.length} tools.`;
    onDelta(text);
    return { text, toolUses: [], stopReason: 'end_turn' };
  }
}
