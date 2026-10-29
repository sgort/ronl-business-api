/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createLogger } from '@utils/logger';
import { config } from '@utils/config';
import type { McpProvider, McpProviderMeta, McpToolResult, ToolDefinition } from './McpProvider';

const logger = createLogger('cprmv-provider');

// The names fastmcp 4 gives the CPRMV API's routes (cprmv !21). fastmcp derives
// them, so a fastmcp upgrade in cprmv can rename them: allowedTools() warns when
// one goes missing rather than leaving the source quietly without tools.
const ALLOWED_TOOLS = new Set(['rules_rules', 'ref_ref_get', 'celex_cellar_by_celex']);

type ListedTool = { name: string; description?: string; inputSchema: unknown };

function allowedTools(listed: ListedTool[]): ToolDefinition[] {
  const names = new Set(listed.map((t) => t.name));
  const missing = [...ALLOWED_TOOLS].filter((n) => !names.has(n)).sort();
  if (missing.length > 0) {
    logger.warn('CPRMV tools not listed by the MCP server — renamed or removed?', {
      missing,
      listed: [...names].sort(),
    });
  }
  return listed
    .filter((t) => ALLOWED_TOOLS.has(t.name))
    .map((t) => ({
      name: t.name,
      description: t.description ?? '',
      input_schema: t.inputSchema as Record<string, unknown>,
    }));
}

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

    try {
      await Promise.race([
        this.client.connect(transport),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('CPRMV MCP connect timed out after 30s')), 30_000)
        ),
      ]);
    } catch (err) {
      // isConnected() reads `client`, so a failed connect must clear it. Left set,
      // the source was offered as connected and every chat that selected it failed
      // with the SDK's "Not connected" (29 October 2026, CPRMV).
      await this.client.close().catch(() => undefined);
      this.client = null;
      throw err;
    }

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
      return allowedTools(result.tools);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('Session not found')) {
        logger.warn('CPRMV session expired during tool listing, reconnecting…');
        await this.disconnect();
        await this.connect();
        const result = await this.client!.listTools();
        return allowedTools(result.tools);
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
- rules_rules           — retrieves a rule or rule set from BWB (Dutch national law), CVDR (municipal regulations), or EU CELLAR (European publications); supports path navigation to individual articles
- ref_ref_get           — resolves a rule by reference method (juriconnect); supports jci 1.3 and 1.31 for artikel, hoofdstuk, paragraaf, onderdeel, lid
- celex_cellar_by_celex — finds EU CELLAR publications by CELEX id; returns ruleset IDs usable with rules_rules

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
