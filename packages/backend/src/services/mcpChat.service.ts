import Anthropic from '@anthropic-ai/sdk';
import { config } from '@utils/config';
import { createLogger } from '@utils/logger';
import { mcpClientService } from '@services/mcpClient.service';

const logger = createLogger('mcp-chat');

const MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 4096;
const MAX_TOOL_ROUNDS = 10;

const SYSTEM_PROMPT = `You are an AI assistant integrated into the RONL Business API platform.
You are connected to the Operaton instance at: ${config.operaton.baseUrl}
You have access to the Operaton BPMN/DMN engine via tools to query process definitions,
process instances, tasks, decisions, deployments, and more.

Important conventions:
- When LISTING resources for display, use maxResults=20 unless the user asks for more.
- When COUNTING resources, use the dedicated count tools or maxResults=1000 with a count-only intent.
- When listing or counting deployed process definitions or decisions, filter by latestVersion=true
  unless the user explicitly asks about all versions or version history.
- Be concise and structured in your responses.
- Never describe or narrate your tool calls in your response text. Only provide the final answer
  based on the tool results.`;

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

const ALLOWED_TOOLS = new Set([
  'processDefinition_list',
  'processDefinition_count',
  'processDefinition_getByKey',
  'processInstance_list',
  'processInstance_count',
  'processInstance_get',
  'task_list',
  'task_count',
  'task_getById',
  'decision_list',
  'decision_getByKey',
  'deployment_list',
  'deployment_count',
  'deployment_getById',
  'incident_list',
  'incident_count',
]);

const MAX_TOOL_RESULT_CHARS = 12_000;

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
  signal?: AbortSignal
): Promise<void> {
  const client = new Anthropic({ apiKey: config.anthropic.apiKey });

  const allTools = await mcpClientService.getToolDefinitions();
  const tools = allTools.filter((t) => ALLOWED_TOOLS.has(t.name));

  const messages: Anthropic.MessageParam[] = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage },
  ];

  let round = 0;

  while (round < MAX_TOOL_ROUNDS) {
    if (signal?.aborted) return;
    round++;

    // Buffer text for this round — only flush to the client if this is the
    // final round (stop_reason === 'end_turn'). Intermediate rounds that
    // proceed to tool execution discard their text to avoid narration leaking
    // into the bubble mid-loop.
    let roundText = '';

    const stream = client.messages.stream(
      {
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
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
      // Final round — emit the buffered text as deltas so the bubble fills in
      if (roundText) {
        emit({ type: 'delta', text: roundText });
      }
      return;
    }

    // Tool round — discard roundText, do not emit it
    messages.push({ role: 'assistant', content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const toolUse of toolUseBlocks) {
      if (signal?.aborted) return;

      emit({ type: 'status', message: `Calling ${toolUse.name}…` });
      logger.info('Executing tool', { tool: toolUse.name });

      try {
        const result = await mcpClientService.callTool(
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

  emit({
    type: 'delta',
    text: 'Maximum tool call rounds reached. Please refine your question.',
  });
}
