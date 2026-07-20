/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createLogger } from '@utils/logger';
import { config } from '@utils/config';
import type { McpProvider, McpProviderMeta, McpToolResult, ToolDefinition } from './McpProvider';

const logger = createLogger('python-poc-provider');

// The Python server also exposes document_upload and document_download (see
// server.py) — deliberately NOT allow-listed here, so the AI Assistant chat
// stays read-only, matching EdocsMcpProvider's policy. Those two tools exist
// only for scripts/test-edocs-live.sh to call directly over raw MCP, proving
// this route can create/read back its own document independent of the
// direct /v1/edocs route.
const ALLOWED_TOOLS = new Set([
  'process_list',
  'process_status',
  'workspace_list',
  'workspace_documents',
  'document_profile',
  'document_versions',
]);

export class PythonPocMcpProvider implements McpProvider {
  readonly meta: McpProviderMeta = {
    id: 'python-poc',
    displayName: 'Python MCP POC',
    description:
      'Proof of concept — a Python-SDK MCP server, in Docker, calling /v1/m2m/process and /v1/edocs',
  };

  private client: Client | null = null;

  async connect(): Promise<void> {
    if (this.client) return;

    const transport = new StreamableHTTPClientTransport(new URL(config.pythonMcpPoc.url));

    this.client = new Client({ name: 'ronl-business-api', version: '1.0.0' }, { capabilities: {} });

    await Promise.race([
      this.client.connect(transport),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Python MCP POC connect timed out after 30s')), 30_000)
      ),
    ]);

    logger.info('Python MCP POC provider connected', { url: config.pythonMcpPoc.url });
  }

  async disconnect(): Promise<void> {
    if (!this.client) return;
    await this.client.close();
    this.client = null;
    logger.info('Python MCP POC provider disconnected');
  }

  async getToolDefinitions(): Promise<ToolDefinition[]> {
    this.assertConnected();

    try {
      const result = await this.client!.listTools();
      return result.tools
        .filter((t) => ALLOWED_TOOLS.has(t.name))
        .map((t) => ({
          name: t.name,
          description: t.description ?? '',
          input_schema: t.inputSchema as Record<string, unknown>,
        }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('Session not found')) {
        logger.warn('Python MCP POC session expired during tool listing, reconnecting…');
        await this.disconnect();
        await this.connect();
        const result = await this.client!.listTools();
        return result.tools
          .filter((t) => ALLOWED_TOOLS.has(t.name))
          .map((t) => ({
            name: t.name,
            description: t.description ?? '',
            input_schema: t.inputSchema as Record<string, unknown>,
          }));
      }
      throw err;
    }
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
    this.assertConnected();
    logger.info('Calling Python MCP POC tool', { tool: name });

    try {
      const result = await this.client!.callTool({ name, arguments: args });
      return result as McpToolResult;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('Session not found')) {
        logger.warn('Python MCP POC session expired, reconnecting…');
        await this.disconnect();
        await this.connect();
        const result = await this.client!.callTool({ name, arguments: args });
        return result as McpToolResult;
      }
      throw err;
    }
  }

  isConnected(): boolean {
    return this.client !== null;
  }

  systemPromptContribution(): string {
    return `## Python MCP POC
You have access to a proof-of-concept MCP server, written in Python and running in its own
Docker container, which calls this backend's own /v1/m2m/process and /v1/edocs APIs.

Available tools:
- process_list             — lists active Operaton process instances (no tenant filter)
- process_status           — status of a single process instance, given its instance id
- workspace_list           — lists workspaces (folders) in the configured eDOCS library
- workspace_documents      — lists a workspace's documents (and sub-items), given its id
- document_profile         — full metadata profile for a document, given its id
- document_versions        — the version history for a document, given its id

These eDOCS tools are read-only, live-tested routes only — there is no tool to upload or
delete; do not imply those capabilities exist.

This is a proof-of-concept source — treat it the same as any other read-only source.

Never narrate tool calls in your response text. Only return the final answer.`;
  }

  private assertConnected(): void {
    if (!this.client) {
      throw new Error('Python MCP POC provider is not connected');
    }
  }
}
