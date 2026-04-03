import Anthropic from '@anthropic-ai/sdk';
import { config } from '@utils/config';
import type {
  LlmProvider,
  LlmProviderMeta,
  LlmStreamParams,
  LlmTurnResult,
  AgentMessage,
} from './LlmProvider';
import type { ToolDefinition } from '@services/mcp/McpProvider';

export class AnthropicLlmProvider implements LlmProvider {
  readonly meta: LlmProviderMeta = {
    id: 'anthropic',
    displayName: 'Anthropic',
    models: [
      { id: 'claude-sonnet-4-20250514', displayName: 'Claude Sonnet 4' },
      { id: 'claude-opus-4-20250514', displayName: 'Claude Opus 4' },
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

    const stream = client.messages.stream(
      {
        model: params.modelId,
        max_tokens: params.maxTokens,
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
  }
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
