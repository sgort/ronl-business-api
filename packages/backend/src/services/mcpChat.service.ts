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

const ALLOWED_TOOLS = new Set([
  // Process definitions — read only
  'processDefinition_list',
  'processDefinition_count',
  'processDefinition_getByKey',
  // Process instances — read only
  'processInstance_list',
  'processInstance_count',
  'processInstance_get',
  // Tasks — read only
  'task_list',
  'task_count',
  'task_getById',
  // Decisions — read only
  'decision_list',
  'decision_getByKey',
  // Deployments — read only
  'deployment_list',
  'deployment_count',
  'deployment_getById',
  // Incidents — read only
  'incident_list',
  'incident_count',
]);

function sanitizeResponse(text: string): string {
  return text
    .replace(/<function_calls>[\s\S]*?<\/function_calls>/g, '')
    .replace(/<function_result>[\s\S]*?<\/function_result>/g, '')
    .replace(/<invoke[\s\S]*?<\/invoke>/g, '')
    .replace(/<select>[\s\S]*?<\/select>/g, '')
    .replace(/<operaton_[\w]+>[\s\S]*?<\/operaton_[\w]+>/g, '')
    .replace(/<operation_call>[\s\S]*?<\/operation_call>/g, '')
    .replace(/<operation_result>[\s\S]*?<\/operation_result>/g, '')
    .replace(/\{[^}]*color:[^}]*\}/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function runChatTurn(history: ChatMessage[], userMessage: string): Promise<string> {
  const client = new Anthropic({ apiKey: config.anthropic.apiKey });

  const allTools = await mcpClientService.getToolDefinitions();
  const tools = allTools.filter((t) => ALLOWED_TOOLS.has(t.name));

  const messages: Anthropic.MessageParam[] = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage },
  ];

  let round = 0;

  while (round < MAX_TOOL_ROUNDS) {
    round++;

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      tools: tools as Anthropic.Tool[],
      messages,
    });

    // Collect any text content from this response
    const textBlocks = response.content.filter((b): b is Anthropic.TextBlock => b.type === 'text');
    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
    );

    if (response.stop_reason === 'end_turn' || toolUseBlocks.length === 0) {
      return sanitizeResponse(textBlocks.map((b) => b.text).join('\n'));
    }

    // Add assistant turn with all content blocks
    messages.push({ role: 'assistant', content: response.content });

    // Execute all tool calls and collect results
    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const toolUse of toolUseBlocks) {
      logger.info('Executing tool', { tool: toolUse.name });
      try {
        const result = await mcpClientService.callTool(
          toolUse.name,
          toolUse.input as Record<string, unknown>
        );
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: result.content.map((c) => c.text).join('\n'),
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

  return 'Maximum tool call rounds reached. Please refine your question.';
}
