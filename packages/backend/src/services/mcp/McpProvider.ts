export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface McpToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

export interface McpProviderMeta {
  /** Stable machine identifier used in API requests and source selection */
  id: string;
  /** Human-readable name shown in the UI */
  displayName: string;
  /** Short description shown as tooltip/helper text in the UI */
  description: string;
}

export interface McpProvider {
  readonly meta: McpProviderMeta;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  /** Returns the curated, allowed tool definitions for this provider */
  getToolDefinitions(): Promise<ToolDefinition[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult>;
  isConnected(): boolean;
  /** Contributes a block to the shared system prompt describing this provider's capabilities */
  systemPromptContribution(): string;
}
