import Anthropic from '@anthropic-ai/sdk';
import { config } from '@utils/config';
import { createLogger } from '@utils/logger';
import { mcpRegistry } from '@services/mcp/McpRegistry';

const logger = createLogger('mcp-chat');

const MODEL = 'claude-sonnet-4-20250514';
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
  signal?: AbortSignal
): Promise<void> {
  const client = new Anthropic({ apiKey: config.anthropic.apiKey });

  const tools = await mcpRegistry.getToolDefinitions(
    selectedProviderIds.length > 0 ? selectedProviderIds : undefined
  );
  const systemPrompt = mcpRegistry.buildSystemPrompt(
    selectedProviderIds.length > 0 ? selectedProviderIds : undefined
  );

  const messages: Anthropic.MessageParam[] = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage },
  ];

  let round = 0;

  while (round < MAX_TOOL_ROUNDS) {
    if (signal?.aborted) return;
    round++;

    let roundText = '';

    const stream = client.messages.stream(
      {
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        tools: tools as Anthropic.Tool[],
        messages,
      },
      { signal }
    );

    stream.on('text', (text) => {
      roundText += text;
    });

    const response = await stream.finalMessage();

    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
    );

    if (response.stop_reason === 'end_turn' || toolUseBlocks.length === 0) {
      if (roundText) {
        emit({ type: 'delta', text: roundText });
      }
      return;
    }

    // Tool round — discard buffered text, execute tools
    messages.push({ role: 'assistant', content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const toolUse of toolUseBlocks) {
      if (signal?.aborted) return;

      emit({ type: 'status', message: `Calling ${toolUse.name}…` });
      logger.info('Executing tool', { tool: toolUse.name });

      try {
        const result = await mcpRegistry.callTool(
          toolUse.name,
          toolUse.input as Record<string, unknown>
        );
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: truncateToolResult(result.content.map((c) => c.text).join('\n')),
        });
      } catch (err) {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          is_error: true,
          content: err instanceof Error ? err.message : 'Tool call failed',
        });
      }
    }

    messages.push({ role: 'user', content: toolResults });
  }

  emit({ type: 'delta', text: 'Maximum tool call rounds reached. Please refine your question.' });
}
