import Anthropic from '@anthropic-ai/sdk';
import { config } from '@utils/config';
import {
  LlmError,
  type LlmProvider,
  type LlmProviderMeta,
  type LlmStreamParams,
  type LlmTurnResult,
  type AgentMessage,
} from './LlmProvider';
import type { ToolDefinition } from '@services/mcp/McpProvider';

export class AnthropicLlmProvider implements LlmProvider {
  readonly meta: LlmProviderMeta = {
    id: 'anthropic',
    displayName: 'Anthropic',
    models: [
      { id: 'claude-sonnet-4-6', displayName: 'Claude Sonnet 4.6' },
      { id: 'claude-opus-4-8', displayName: 'Claude Opus 4.8' },
      { id: 'claude-haiku-4-5-20251001', displayName: 'Claude Haiku 4.5' },
    ],
  };

  isAvailable(): boolean {
    return !!config.anthropic.apiKey;
  }

  async streamTurn(
    params: LlmStreamParams,
    onDelta: (text: string) => void,
    signal?: AbortSignal
  ): Promise<LlmTurnResult> {
    const client = new Anthropic({ apiKey: config.anthropic.apiKey });

    try {
      const stream = client.messages.stream(
        {
          model: params.modelId,
          max_tokens: params.maxTokens,
          // Sonnet 4.6 / Opus 4.x default effort to 'high'; 'medium' keeps the
          // assistant responsive without a noticeable quality drop for this use.
          output_config: { effort: 'medium' },
          system: params.systemPrompt,
          tools: params.tools.map(toAnthropicTool),
          messages: params.messages.map(toAnthropicMessage),
        },
        { signal }
      );

      let text = '';
      stream.on('text', (chunk) => {
        text += chunk;
        onDelta(chunk);
      });

      const response = await stream.finalMessage();

      const toolUses = response.content
        .filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
        .map((b) => ({ id: b.id, name: b.name, input: b.input as Record<string, unknown> }));

      return {
        text,
        toolUses,
        stopReason: response.stop_reason === 'tool_use' ? 'tool_use' : 'end_turn',
      };
    } catch (err) {
      throw toLlmError(err, params.modelId);
    }
  }
}

/**
 * Translate a raw Anthropic SDK error into an {@link LlmError} with a clean,
 * user-facing Dutch message. Aborts are passed through untouched — the caller
 * treats those as cancellations, not failures.
 */
function toLlmError(err: unknown, modelId: string): unknown {
  if (
    err instanceof Anthropic.APIUserAbortError ||
    (err as { name?: string })?.name === 'AbortError'
  ) {
    return err;
  }
  if (err instanceof Anthropic.NotFoundError) {
    // Most commonly a retired/deprecated model id (Anthropic returns 404
    // not_found_error once a model passes its retirement date).
    return new LlmError(
      'model_unavailable',
      `Het AI-model "${modelId}" is niet (meer) beschikbaar bij Anthropic — ` +
        `waarschijnlijk uitgefaseerd. Kies een ander model of laat beheer de modelconfiguratie bijwerken.`,
      err
    );
  }
  if (err instanceof Anthropic.AuthenticationError) {
    return new LlmError(
      'auth',
      'De AI-dienst weigerde de API-sleutel. Neem contact op met beheer.',
      err
    );
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return new LlmError(
      'forbidden',
      'Geen toegang tot dit AI-model met de huidige API-sleutel.',
      err
    );
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new LlmError(
      'rate_limit',
      'Te veel verzoeken naar de AI-dienst. Probeer het zo opnieuw.',
      err
    );
  }
  // 529 overloaded is not a dedicated SDK class in this version — match on status.
  if (err instanceof Anthropic.APIError && err.status === 529) {
    return new LlmError(
      'overloaded',
      'De AI-dienst is tijdelijk overbelast. Probeer het zo opnieuw.',
      err
    );
  }
  return err;
}

function toAnthropicTool(t: ToolDefinition): Anthropic.Tool {
  return {
    name: t.name,
    description: t.description,
    input_schema: t.input_schema as Anthropic.Tool['input_schema'],
  };
}

function toAnthropicMessage(m: AgentMessage): Anthropic.MessageParam {
  switch (m.role) {
    case 'user':
      return { role: 'user', content: m.content };
    case 'assistant':
      return { role: 'assistant', content: m.content };
    case 'assistant_tool_use':
      return {
        role: 'assistant',
        content: m.toolUses.map((t) => ({
          type: 'tool_use' as const,
          id: t.id,
          name: t.name,
          input: t.input,
        })),
      };
    case 'tool_results':
      return {
        role: 'user',
        content: m.results.map((r) => ({
          type: 'tool_result' as const,
          tool_use_id: r.toolUseId,
          content: r.content,
          is_error: r.isError,
        })),
      };
  }
}
