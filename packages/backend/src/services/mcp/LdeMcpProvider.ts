/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createLogger } from '@utils/logger';
import { config } from '@utils/config';
import path from 'path';
import type { McpProvider, McpProviderMeta, McpToolResult, ToolDefinition } from './McpProvider';

const logger = createLogger('lde-provider');

const ALLOWED_TOOLS = new Set([
  'bundle_list',
  'bundle_get',
  'form_list',
  'form_get',
  'document_list',
  'document_get',
]);

function getServerCommand(): { command: string; args: string[] } {
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction) {
    const scriptPath = path.resolve(process.cwd(), 'dist/mcp-servers/lde/index.js');
    return { command: 'node', args: [scriptPath] };
  }

  const srcPath = path.resolve(process.cwd(), 'src/mcp-servers/lde/index.ts');
  return { command: 'npx', args: ['tsx', srcPath] };
}

export class LdeMcpProvider implements McpProvider {
  readonly meta: McpProviderMeta = {
    id: 'lde',
    displayName: 'Process Library',
    description: 'LDE asset store — deployed BPMN bundles, form schemas, document templates',
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
        LDE_DATABASE_URL: config.lde.databaseUrl,
      },
    });

    this.client = new Client({ name: 'ronl-business-api', version: '1.0.0' }, { capabilities: {} });

    await Promise.race([
      this.client.connect(this.transport),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('LDE MCP connect timed out after 30s')), 30_000)
      ),
    ]);

    this.transport.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString().trim();
      if (text) logger.warn('LDE MCP subprocess stderr', { output: text });
    });
    this.transport.stderr?.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code !== 'EPIPE') {
        logger.error('LDE MCP transport error', { error: err.message });
      }
    });

    logger.info('LDE MCP provider connected');
  }

  async disconnect(): Promise<void> {
    if (!this.client) return;
    await this.client.close();
    this.client = null;
    this.transport = null;
    logger.info('LDE MCP provider disconnected');
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
    logger.info('Calling LDE tool', { tool: name });
    const result = await this.client!.callTool({ name, arguments: args });
    return result as McpToolResult;
  }

  isConnected(): boolean {
    return this.client !== null;
  }

  systemPromptContribution(): string {
    return `## Process Library (LDE)
You have access to the LDE (Linked Data Explorer) asset store — the authoritative registry of deployed BPMN processes, form schemas, and document templates.

Available tools:
- bundle_list      — all deployed process bundles; each includes bpmnProcessId, name, processRole (shell/standalone), status, deployedAt, operatonDeploymentId, linkedDmnTemplates, deployedForms, deployedDocuments, and nested subprocesses
- bundle_get       — single bundle by bpmnProcessId
- form_list        — all form schemas (id, name, description, status); use form_get for the full schema
- form_get         — full Camunda Form JSON schema by form id; the id matches camunda:formRef in BPMN
- document_list    — all document templates (id, name, description, process_key, service_id, status)
- document_get     — full document template by id including zones and bindings; the id matches ronl:documentRef in BPMN

Key relationships:
- A bundle's linkedDmnTemplates contains DMN decision keys — cross-reference with the Process Engine source to find live deployments
- A bundle's deployedForms ids match camunda:formRef in the BPMN and the form_get id parameter
- A bundle's deployedDocuments ids match ronl:documentRef in the BPMN and document_get id parameter
- Shell bundles reference subprocesses via called_element; subprocesses are nested in the bundle response

Never narrate tool calls in your response text. Only return the final answer.`;
  }

  private assertConnected(): void {
    if (!this.client) {
      throw new Error('LDE MCP provider is not connected');
    }
  }
}
