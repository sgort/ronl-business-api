import { createLogger } from '@utils/logger';
import { mcpRegistry } from '@services/mcp/McpRegistry';
import { llmRegistry } from '@services/llm/LlmRegistry';
import type { AgentMessage, AgentToolResult } from '@services/llm/LlmProvider';

const logger = createLogger('mcp-chat');

const MAX_TOKENS = 4096;
const MAX_TOOL_ROUNDS = 10;
const MAX_TOOL_RESULT_CHARS = 12_000;

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export type ChatStreamEvent =
  | { type: 'status'; message: string }
  | { type: 'delta'; text: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

export type ChatEventCallback = (event: ChatStreamEvent) => void;

function truncateToolResult(text: string): string {
  if (text.length <= MAX_TOOL_RESULT_CHARS) return text;
  return (
    text.slice(0, MAX_TOOL_RESULT_CHARS) +
    `\n\n[Result truncated: ${text.length - MAX_TOOL_RESULT_CHARS} characters omitted]`
  );
}

export async function runChatStream(
  history: ChatMessage[],
  userMessage: string,
  emit: ChatEventCallback,
  selectedProviderIds: string[],
  modelId: string,
  signal?: AbortSignal
): Promise<void> {
  const provider = llmRegistry.getProvider(modelId);
  if (!provider) {
    emit({ type: 'error', message: `Unknown model: ${modelId}` });
    return;
  }

  const tools = await mcpRegistry.getToolDefinitions(
    selectedProviderIds.length > 0 ? selectedProviderIds : undefined
  );
  const systemPrompt = mcpRegistry.buildSystemPrompt(
    selectedProviderIds.length > 0 ? selectedProviderIds : undefined
  );

  const messages: AgentMessage[] = [
    ...history.map((m): AgentMessage => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage },
  ];

  let round = 0;

  while (round < MAX_TOOL_ROUNDS) {
    if (signal?.aborted) return;
    round++;

    const turnResult = await provider.streamTurn(
      { modelId, messages, systemPrompt, tools, maxTokens: MAX_TOKENS },
      (text) => emit({ type: 'delta', text }),
      signal
    );

    if (turnResult.stopReason === 'end_turn' || turnResult.toolUses.length === 0) {
      return;
    }

    // Tool round
    messages.push({ role: 'assistant_tool_use', toolUses: turnResult.toolUses });

    const toolResults: AgentToolResult[] = [];

    for (const toolUse of turnResult.toolUses) {
      if (signal?.aborted) return;

      emit({ type: 'status', message: `Calling ${toolUse.name}…` });
      logger.info('Executing tool', { tool: toolUse.name });

      try {
        const result = await mcpRegistry.callTool(toolUse.name, toolUse.input);
        toolResults.push({
          toolUseId: toolUse.id,
          content: truncateToolResult(result.content.map((c) => c.text).join('\n')),
        });
      } catch (err) {
        toolResults.push({
          toolUseId: toolUse.id,
          content: err instanceof Error ? err.message : 'Tool call failed',
          isError: true,
        });
      }
    }

    messages.push({ role: 'tool_results', results: toolResults });
  }

  emit({ type: 'delta', text: 'Maximum tool call rounds reached. Please refine your question.' });
}
