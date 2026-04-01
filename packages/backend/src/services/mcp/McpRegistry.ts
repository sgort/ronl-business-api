import { createLogger } from '@utils/logger';
import type { McpProvider, McpProviderMeta, McpToolResult, ToolDefinition } from './McpProvider';

const logger = createLogger('mcp-registry');

export class McpRegistry {
  private providers = new Map<string, McpProvider>();
  private toolIndex = new Map<string, McpProvider>(); // toolName → owning provider

  register(provider: McpProvider): void {
    this.providers.set(provider.meta.id, provider);
    logger.info('MCP provider registered', { id: provider.meta.id });
  }

  async connectAll(): Promise<void> {
    for (const provider of this.providers.values()) {
      try {
        await provider.connect();
        const tools = await provider.getToolDefinitions();
        for (const tool of tools) {
          this.toolIndex.set(tool.name, provider);
        }
        logger.info('MCP provider connected', { id: provider.meta.id, tools: tools.length });
      } catch (err) {
        logger.error('MCP provider failed to connect — continuing without it', {
          id: provider.meta.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  async disconnectAll(): Promise<void> {
    for (const provider of this.providers.values()) {
      try {
        await provider.disconnect();
      } catch (err) {
        logger.error('MCP provider disconnect error', {
          id: provider.meta.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    this.toolIndex.clear();
  }

  async getToolDefinitions(providerIds?: string[]): Promise<ToolDefinition[]> {
    const results: ToolDefinition[] = [];
    for (const provider of this.resolveProviders(providerIds)) {
      if (provider.isConnected()) {
        results.push(...(await provider.getToolDefinitions()));
      }
    }
    return results;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
    const provider = this.toolIndex.get(name);
    if (!provider) {
      throw new Error(`No provider found for tool: ${name}`);
    }
    return provider.callTool(name, args);
  }

  buildSystemPrompt(providerIds?: string[]): string {
    return this.resolveProviders(providerIds)
      .filter((p) => p.isConnected())
      .map((p) => p.systemPromptContribution())
      .join('\n\n');
  }

  getProviderMeta(): Array<McpProviderMeta & { connected: boolean }> {
    return Array.from(this.providers.values()).map((p) => ({
      ...p.meta,
      connected: p.isConnected(),
    }));
  }

  isAnyConnected(providerIds?: string[]): boolean {
    return this.resolveProviders(providerIds).some((p) => p.isConnected());
  }

  private resolveProviders(ids?: string[]): McpProvider[] {
    if (!ids || ids.length === 0) {
      return Array.from(this.providers.values());
    }
    return ids.map((id) => this.providers.get(id)).filter((p): p is McpProvider => p !== undefined);
  }
}

export const mcpRegistry = new McpRegistry();
