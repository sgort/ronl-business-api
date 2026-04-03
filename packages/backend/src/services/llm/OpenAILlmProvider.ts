import OpenAI from 'openai';
import { config } from '@utils/config';
import type {
  LlmProvider,
  LlmProviderMeta,
  LlmStreamParams,
  LlmTurnResult,
  AgentMessage,
} from './LlmProvider';
import type { ToolDefinition } from '@services/mcp/McpProvider';

export class OpenAILlmProvider implements LlmProvider {
  readonly meta: LlmProviderMeta = {
    id: 'openai',
    displayName: 'OpenAI',
    models: [
      { id: 'gpt-4o', displayName: 'GPT-4o' },
      { id: 'gpt-4o-mini', displayName: 'GPT-4o Mini' },
    ],
  };

  isAvailable(): boolean {
    return !!config.openai.apiKey;
  }

  async streamTurn(
    params: LlmStreamParams,
    onDelta: (text: string) => void,
    signal?: AbortSignal
  ): Promise<LlmTurnResult> {
    const client = new OpenAI({ apiKey: config.openai.apiKey });

    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: params.systemPrompt },
      ...params.messages.map(toOpenAIMessage),
    ];

    const stream = await client.chat.completions.create(
      {
        model: params.modelId,
        max_tokens: params.maxTokens,
        tools: params.tools.map(toOpenAITool),
        messages,
        stream: true,
      },
      { signal }
    );

    let text = '';
    const toolCallAccumulators: Map<number, { id: string; name: string; args: string }> = new Map();

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;

      if (delta.content) {
        text += delta.content;
        onDelta(delta.content);
      }

      for (const tc of delta.tool_calls ?? []) {
        if (!toolCallAccumulators.has(tc.index)) {
          toolCallAccumulators.set(tc.index, {
            id: tc.id ?? '',
            name: tc.function?.name ?? '',
            args: '',
          });
        }
        const acc = toolCallAccumulators.get(tc.index)!;
        if (tc.id) acc.id = tc.id;
        if (tc.function?.name) acc.name = tc.function.name;
        if (tc.function?.arguments) acc.args += tc.function.arguments;
      }
    }

    const toolUses = Array.from(toolCallAccumulators.values()).map((tc) => ({
      id: tc.id,
      name: tc.name,
      input: JSON.parse(tc.args || '{}') as Record<string, unknown>,
    }));

    return {
      text,
      toolUses,
      stopReason: toolUses.length > 0 ? 'tool_use' : 'end_turn',
    };
  }
}

function toOpenAITool(t: ToolDefinition): OpenAI.ChatCompletionTool {
  return {
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema as Record<string, unknown>,
    },
  };
}

function toOpenAIMessage(m: AgentMessage): OpenAI.ChatCompletionMessageParam {
  switch (m.role) {
    case 'user':
      return { role: 'user', content: m.content };
    case 'assistant':
      return { role: 'assistant', content: m.content };
    case 'assistant_tool_use':
      return {
        role: 'assistant',
        content: null,
        tool_calls: m.toolUses.map((t) => ({
          id: t.id,
          type: 'function' as const,
          function: { name: t.name, arguments: JSON.stringify(t.input) },
        })),
      };
    case 'tool_results':
      // OpenAI requires one message per tool result
      return {
        role: 'tool',
        tool_call_id: m.results[0].toolUseId,
        content: m.results[0].content,
      };
  }
}
