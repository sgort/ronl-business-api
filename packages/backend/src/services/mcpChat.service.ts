import Anthropic from '@anthropic-ai/sdk';
import { config } from '@utils/config';
import { createLogger } from '@utils/logger';
import { mcpClientService } from '@services/mcpClient.service';

const logger = createLogger('mcp-chat');

const MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 4096;
const MAX_TOOL_ROUNDS = 10;

const SYSTEM_PROMPT = `You are an AI assistant integrated into the RONL Business API platform.
You have access to the Operaton BPMN/DMN engine via tools that allow you to query process definitions,
process instances, tasks, decisions, deployments, and more.
When answering questions about workflows, tasks, or process data, use the available tools to fetch
current information. Be concise and structured in your responses.`;

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const ALLOWED_TOOLS = new Set([
  // Process definitions
  'getProcessDefinitions',
  'getProcessDefinition',
  'getProcessDefinitionCount',
  // Process instances
  'getProcessInstances',
  'getProcessInstance',
  'getProcessInstanceCount',
  // Tasks
  'getTasks',
  'getTask',
  'getTaskCount',
  // History
  'getHistoricProcessInstances',
  'getHistoricProcessInstanceCount',
  'getHistoricTaskInstances',
  'getHistoricTaskInstanceCount',
  // Decisions
  'getDecisionDefinitions',
  'getDecisionDefinition',
  // Deployments
  'getDeployments',
  'getDeployment',
  'getDeploymentCount',
  // Incidents
  'getIncidents',
  'getIncidentCount',
  // Jobs
  'getJobs',
  'getJobCount',
]);

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
      return textBlocks
        .map((b) => b.text)
        .join('\n')
        .trim();
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
