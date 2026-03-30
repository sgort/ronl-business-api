/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createLogger } from '@utils/logger';
import { config } from '@utils/config';
import path from 'path';
import type { McpProvider, McpProviderMeta, McpToolResult, ToolDefinition } from './McpProvider';

const logger = createLogger('triplydb-provider');

const ALLOWED_TOOLS = new Set(['sparql_query']);

function getServerCommand(): { command: string; args: string[] } {
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction) {
    const scriptPath = path.resolve(process.cwd(), 'dist/mcp-servers/triplydb/index.js');
    return { command: 'node', args: [scriptPath] };
  }

  // Development: run TypeScript source directly with tsx
  const srcPath = path.resolve(process.cwd(), 'src/mcp-servers/triplydb/index.ts');
  return { command: 'npx', args: ['tsx', srcPath] };
}

export class TriplyDbMcpProvider implements McpProvider {
  readonly meta: McpProviderMeta = {
    id: 'triplydb',
    displayName: 'Knowledge Graph',
    description: 'TriplyDB SPARQL — decision models, services, organisations, rules',
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
        TRIPLYDB_ENDPOINT: config.triplydb.endpoint,
        TRIPLYDB_TOKEN: config.triplydb.token,
      },
    });

    this.client = new Client({ name: 'ronl-business-api', version: '1.0.0' }, { capabilities: {} });

    await Promise.race([
      this.client.connect(this.transport),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('TriplyDB MCP connect timed out after 30s')), 30_000)
      ),
    ]);

    this.transport.stderr?.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code !== 'EPIPE') {
        logger.error('TriplyDB MCP transport error', { error: err.message });
      }
    });

    logger.info('TriplyDB MCP provider connected', { endpoint: config.triplydb.endpoint });
  }

  async disconnect(): Promise<void> {
    if (!this.client) return;
    await this.client.close();
    this.client = null;
    this.transport = null;
    logger.info('TriplyDB MCP provider disconnected');
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
    logger.info('Calling TriplyDB tool', { tool: name });
    const result = await this.client!.callTool({ name, arguments: args });
    return result as McpToolResult;
  }

  isConnected(): boolean {
    return this.client !== null;
  }

  systemPromptContribution(): string {
    return `## Knowledge Graph (TriplyDB)
You have access to the RONL knowledge graph via SPARQL. The default endpoint is:
  ${config.triplydb.endpoint}

Use sparql_query to retrieve decision models, public services, organisations, concepts, and rules.
If the user asks about a different dataset, pass its endpoint explicitly.

Common prefixes:
  PREFIX cprmv:  <https://cprmv.open-regels.nl/0.3.0/>
  PREFIX ronl:   <https://regels.overheid.nl/ontology#>
  PREFIX dct:    <http://purl.org/dc/terms/>
  PREFIX skos:   <http://www.w3.org/2004/02/skos/core#>
  PREFIX cpsv:   <http://www.w3.org/ns/regorg#>
  PREFIX schema: <http://schema.org/>
  PREFIX eli:    <http://data.europa.eu/eli/ontology#>

Key types: cprmv:DecisionModel, cpsv:PublicService, schema:Organization, cprmv:Rule.
Never narrate tool calls in your response text. Only return the final answer.

Note: the knowledge graph contains documented metadata about decision models, including their intended Operaton endpoints.
This is not live deployment data — to verify what is actually running in Operaton, the Process Engine source must also be selected.`;
  }

  private assertConnected(): void {
    if (!this.client) {
      throw new Error('TriplyDB MCP provider is not connected');
    }
  }
}
