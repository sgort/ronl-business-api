/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createLogger } from '@utils/logger';
import { config } from '@utils/config';
import os from 'os';
import { createRequire } from 'module';
import type { McpProvider, McpProviderMeta, McpToolResult, ToolDefinition } from './McpProvider';

const logger = createLogger('operaton-provider');

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

function getMcpCommand(): { command: string; args: string[] } {
  if (os.platform() === 'win32' || os.platform() === 'darwin') {
    return { command: 'npx', args: ['-y', 'operaton-mcp'] };
  }
  try {
    const require = createRequire(__filename);
    const pkgPath = require.resolve('operaton-mcp/dist/index.js');
    return { command: 'node', args: [pkgPath] };
  } catch {
    logger.warn('operaton-mcp not found in node_modules, falling back to npx');
    return { command: 'npx', args: ['-y', 'operaton-mcp'] };
  }
}

export class OperatonMcpProvider implements McpProvider {
  readonly meta: McpProviderMeta = {
    id: 'operaton',
    displayName: 'Process Engine',
    description: 'Operaton BPMN/DMN — process instances, tasks, decisions, deployments',
  };

  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;

  async connect(): Promise<void> {
    if (this.client) return;

    const { command, args } = getMcpCommand();

    this.transport = new StdioClientTransport({
      command,
      args,
      env: {
        PATH: process.env.PATH ?? '',
        HOME: process.env.HOME ?? '',
        OPERATON_BASE_URL: config.operaton.baseUrl,
        OPERATON_USERNAME: config.operaton.username ?? '',
        OPERATON_PASSWORD: config.operaton.password ?? '',
        OPERATON_SKIP_HEALTH_CHECK: 'true',
      },
    });

    this.client = new Client({ name: 'ronl-business-api', version: '1.0.0' }, { capabilities: {} });

    await Promise.race([
      this.client.connect(this.transport),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('MCP connect timed out after 30s')), 30_000)
      ),
    ]);

    this.transport.stderr?.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code !== 'EPIPE') {
        logger.error('Operaton MCP transport error', { error: err.message });
      }
    });

    logger.info('Operaton MCP provider connected', { operatonBaseUrl: config.operaton.baseUrl });
  }

  async disconnect(): Promise<void> {
    if (!this.client) return;
    await this.client.close();
    this.client = null;
    this.transport = null;
    logger.info('Operaton MCP provider disconnected');
  }

  async getToolDefinitions(): Promise<ToolDefinition[]> {
    this.assertConnected();
    const result = await this.client!.listTools();
    return result.tools
      .filter((t) => ALLOWED_TOOLS.has(t.name))
      .map((t) => ({
        name: t.name,
        description: t.description ?? '',
        input_schema: t.inputSchema as Record<string, unknown>,
      }));
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
    this.assertConnected();
    logger.info('Calling Operaton tool', { tool: name });
    const result = await this.client!.callTool({ name, arguments: args });
    return result as McpToolResult;
  }

  isConnected(): boolean {
    return this.client !== null;
  }

  systemPromptContribution(): string {
    return `## Process Engine (Operaton)
You are connected to the Operaton BPMN/DMN engine at: ${config.operaton.baseUrl}
Use these tools to query process definitions, running instances, tasks, decisions, deployments, and incidents.

Conventions:
- When LISTING resources for display, use maxResults=20 unless the user asks for more.
- When COUNTING resources, use the dedicated count tools or maxResults=1000 with a count-only intent.
- When listing or counting deployed process definitions or decisions, filter by latestVersion=true
  unless the user explicitly asks about all versions or version history.
- Never narrate tool calls in your response text. Only return the final answer.`;
  }

  private assertConnected(): void {
    if (!this.client) {
      throw new Error('Operaton MCP provider is not connected');
    }
  }
}
