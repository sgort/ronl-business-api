/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createLogger } from '@utils/logger';
import { config } from '@utils/config';
import os from 'os';
import { createRequire } from 'module';

const logger = createLogger('mcp-client');

export interface McpToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

function getMcpCommand(): { command: string; args: string[] } {
  if (os.platform() === 'win32' || os.platform() === 'darwin') {
    return { command: 'npx', args: ['-y', 'operaton-mcp'] };
  }

  // Linux — resolve from local node_modules (bundled with deployment)
  try {
    const require = createRequire(__filename);
    const pkgPath = require.resolve('operaton-mcp/dist/index.js');
    return { command: 'node', args: [pkgPath] };
  } catch {
    logger.warn('operaton-mcp not found in node_modules, falling back to npx');
    return { command: 'npx', args: ['-y', 'operaton-mcp'] };
  }
}

export class McpClientService {
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

    // Prevent EPIPE from crashing the process when the transport pipe closes
    this.transport.stderr?.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code !== 'EPIPE') {
        logger.error('MCP transport stderr error', { error: err.message });
      }
    });

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
