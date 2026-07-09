import type { ToolDefinition } from '@services/mcp/McpProvider';

export interface LlmModelMeta {
  id: string;
  displayName: string;
}

/**
 * Error carrying a user-facing (Dutch) message plus a stable `code` the
 * frontend can switch on to pick an icon/badge. Providers translate raw SDK
 * errors (e.g. a 404 for a retired model) into this so the UI never shows the
 * raw provider payload.
 */
export class LlmError extends Error {
  constructor(
    readonly code: string,
    readonly userMessage: string,
    cause?: unknown
  ) {
    super(userMessage);
    this.name = 'LlmError';
    if (cause instanceof Error) this.cause = cause;
  }
}

export interface LlmProviderMeta {
  id: string;
  displayName: string;
  models: LlmModelMeta[];
}

/** Provider-agnostic message format for the agentic loop */
export type AgentMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string }
  | { role: 'assistant_tool_use'; toolUses: AgentToolUse[] }
  | { role: 'tool_results'; results: AgentToolResult[] };

export interface AgentToolUse {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface AgentToolResult {
  toolUseId: string;
  content: string;
  isError?: boolean;
}

export interface LlmTurnResult {
  text: string;
  toolUses: AgentToolUse[];
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens';
}

export interface LlmStreamParams {
  modelId: string;
  messages: AgentMessage[];
  systemPrompt: string;
  tools: ToolDefinition[];
  maxTokens: number;
}

export interface LlmProvider {
  readonly meta: LlmProviderMeta;
  isAvailable(): boolean;
  /**
   * Execute a single turn against the LLM.
   * Calls onDelta for each text token as it arrives.
   * Returns tool use blocks and stop reason when the turn completes.
   */
  streamTurn(
    params: LlmStreamParams,
    onDelta: (text: string) => void,
    signal?: AbortSignal
  ): Promise<LlmTurnResult>;
}
