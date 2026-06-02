/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createLogger } from '@utils/logger';
import { config } from '@utils/config';
import type { McpProvider, McpProviderMeta, McpToolResult, ToolDefinition } from './McpProvider';

const logger = createLogger('cprmv-provider');

const ALLOWED_TOOLS = new Set([
  'rules_rules__rule_id_path__get',
  'ref_ref__referencemethod___reference__get',
  'celex_cellar_by_celex__celexid___language___format__get',
]);

export class CprmvMcpProvider implements McpProvider {
  readonly meta: McpProviderMeta = {
    id: 'cprmv',
    displayName: 'Legislation (CPRMV)',
    description: 'Dutch & EU legislation — BWB national law, CVDR municipal regulations, EU CELLAR',
  };

  private client: Client | null = null;

  async connect(): Promise<void> {
    if (this.client) return;

    const transport = new StreamableHTTPClientTransport(new URL(config.cprmv.url));

    this.client = new Client({ name: 'ronl-business-api', version: '1.0.0' }, { capabilities: {} });

    await Promise.race([
      this.client.connect(transport),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('CPRMV MCP connect timed out after 30s')), 30_000)
      ),
    ]);

    logger.info('CPRMV MCP provider connected', { url: config.cprmv.url });
  }

  async disconnect(): Promise<void> {
    if (!this.client) return;
    await this.client.close();
    this.client = null;
    logger.info('CPRMV MCP provider disconnected');
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
        logger.warn('CPRMV session expired during tool listing, reconnecting…');
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
    logger.info('Calling CPRMV tool', { tool: name });

    try {
      const result = await this.client!.callTool({ name, arguments: args });
      return result as McpToolResult;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('Session not found')) {
        logger.warn('CPRMV session expired, reconnecting…');
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
    return `## Legislation (CPRMV)
You have access to Dutch and European legislation via the CPRMV API at: ${config.cprmv.url}

Available tools:
- rules_rules__rule_id_path__get   — retrieves a rule or rule set from BWB (Dutch national law), CVDR (municipal regulations), or EU CELLAR (European publications); supports path navigation to individual articles
- ref_ref__referencemethod___reference__get — resolves a rule by reference method (juriconnect); supports jci 1.3 and 1.31 for artikel, hoofdstuk, paragraaf, onderdeel, lid
- celex_cellar_by_celex__celexid___language___format__get — finds EU CELLAR publications by CELEX id; returns ruleset IDs usable with rules_rules__rule_id_path__get

Rule ID path format examples:
- BWB: \`BWBR0015703, Artikel 20, onderdeel a.\`  (current version)
- BWB with date: \`BWBR0015703_2025-07-01_0, Artikel 20\`
- CVDR: \`CVDR712517, Artikel 5\`
- EU CELLAR: \`CFMX483e4752e-f2e5-11e8-9982-01aa75ed71a1.0017.02_DOC_2, Artikel 1\`

Rule path matching ignores non-alphanumeric characters and whitespace. Intermediate rule IDs may be omitted.

Never narrate tool calls in your response text. Only return the final answer.`;
  }

  private assertConnected(): void {
    if (!this.client) {
      throw new Error('CPRMV MCP provider is not connected');
    }
  }
}
