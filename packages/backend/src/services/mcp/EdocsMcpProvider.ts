/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createLogger } from '@utils/logger';
import { config } from '@utils/config';
import path from 'path';
import type { McpProvider, McpProviderMeta, McpToolResult, ToolDefinition } from './McpProvider';

const logger = createLogger('edocs-mcp-provider');

const ALLOWED_TOOLS = new Set([
  'workspace_list',
  'workspace_documents',
  'document_profile',
  'document_versions',
]);

function getServerCommand(): { command: string; args: string[] } {
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction) {
    const scriptPath = path.resolve(process.cwd(), 'dist/mcp-servers/edocs/index.js');
    return { command: 'node', args: [scriptPath] };
  }

  const srcPath = path.resolve(process.cwd(), 'src/mcp-servers/edocs/index.ts');
  return { command: 'npx', args: ['tsx', srcPath] };
}

export class EdocsMcpProvider implements McpProvider {
  readonly meta: McpProviderMeta = {
    id: 'edocs',
    displayName: 'eDOCS',
    description:
      "OpenText eDOCS DM — workspaces and documents, via this backend's own /v1/edocs API",
  };

  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;

  async connect(): Promise<void> {
    if (this.client) return;

    const { command, args } = getServerCommand();

    this.transport = new StdioClientTransport({
      command,
      args,
      env: {
        PATH: process.env.PATH ?? '',
        HOME: process.env.HOME ?? '',
        KEYCLOAK_URL: config.keycloak.url,
        KEYCLOAK_REALM: config.keycloak.realm,
        EDOCS_MCP_CLIENT_ID: config.edocsMcp.clientId,
        EDOCS_MCP_CLIENT_SECRET: config.edocsMcp.clientSecret,
        PORT: String(config.port),
      },
    });

    this.client = new Client({ name: 'ronl-business-api', version: '1.0.0' }, { capabilities: {} });

    await Promise.race([
      this.client.connect(this.transport),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('eDOCS MCP connect timed out after 30s')), 30_000)
      ),
    ]);

    this.transport.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString().trim();
      if (text) logger.warn('eDOCS MCP subprocess stderr', { output: text });
    });
    this.transport.stderr?.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code !== 'EPIPE') {
        logger.error('eDOCS MCP transport error', { error: err.message });
      }
    });

    logger.info('eDOCS MCP provider connected');
  }

  async disconnect(): Promise<void> {
    if (!this.client) return;
    await this.client.close();
    this.client = null;
    this.transport = null;
    logger.info('eDOCS MCP provider disconnected');
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
    logger.info('Calling eDOCS tool', { tool: name });
    const result = await this.client!.callTool({ name, arguments: args });
    return result as McpToolResult;
  }

  isConnected(): boolean {
    return this.client !== null;
  }

  systemPromptContribution(): string {
    return `## eDOCS
You have access to the OpenText eDOCS document management system, via this backend's own
/v1/edocs API (the same routes proven live in edocs-live-testing.md).

Available tools:
- workspace_list       — lists workspaces (folders) in the configured library
- workspace_documents  — lists the documents (and sub-items) inside a workspace, given its id
- document_profile     — full metadata profile for a document, given its id
- document_versions    — the version history for a document, given its id

These are read-only, live-tested routes only — there is no tool to browse documents outside
a workspace, upload, or delete; do not imply those capabilities exist.

Never narrate tool calls in your response text. Only return the final answer.`;
  }

  private assertConnected(): void {
    if (!this.client) {
      throw new Error('eDOCS MCP provider is not connected');
    }
  }
}
