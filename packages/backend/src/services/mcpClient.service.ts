/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createLogger } from '@utils/logger';
import { config } from '@utils/config';

const logger = createLogger('mcp-client');

export interface McpToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

export class McpClientService {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;

  async connect(): Promise<void> {
    if (this.client) return;

    this.transport = new StdioClientTransport({
      command: 'npx',
      args: ['-y', 'operaton-mcp'],
      env: {
        ...process.env,
        OPERATON_BASE_URL: config.operaton.baseUrl,
        OPERATON_USERNAME: config.operaton.username ?? '',
        OPERATON_PASSWORD: config.operaton.password ?? '',
        ...(config.mcp.skipHealthCheck && { OPERATON_SKIP_HEALTH_CHECK: 'true' }),
      },
    });

    this.client = new Client({ name: 'ronl-business-api', version: '1.0.0' }, { capabilities: {} });

    await Promise.race([
      this.client.connect(this.transport),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('MCP connect timed out after 30s')), 30_000)
      ),
    ]);

    logger.info('MCP client connected', { operatonBaseUrl: config.operaton.baseUrl });
  }

  async disconnect(): Promise<void> {
    if (!this.client) return;
    await this.client.close();
    this.client = null;
    this.transport = null;
    logger.info('MCP client disconnected');
  }

  async listTools(): Promise<string[]> {
    this.assertConnected();
    const result = await this.client!.listTools();
    return result.tools.map((t) => t.name);
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
    this.assertConnected();
    logger.info('Calling MCP tool', { tool: name });
    const result = await this.client!.callTool({ name, arguments: args });
    return result as McpToolResult;
  }

  async getToolDefinitions(): Promise<
    Array<{ name: string; description: string; input_schema: Record<string, unknown> }>
  > {
    this.assertConnected();
    const result = await this.client!.listTools();
    return result.tools.map((t) => ({
      name: t.name,
      description: t.description ?? '',
      input_schema: t.inputSchema as Record<string, unknown>,
    }));
  }

  isConnected(): boolean {
    return this.client !== null;
  }

  private assertConnected(): void {
    if (!this.client) {
      throw new Error('MCP client is not connected. Call connect() first.');
    }
  }
}

export const mcpClientService = new McpClientService();
