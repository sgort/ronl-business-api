import express from 'express';
import { jwtMiddleware, requireRoles } from '@auth/jwt.middleware';
import { createLogger } from '@utils/logger';
import { runChatStream } from '@services/mcpChat.service';
import { mcpRegistry } from '@services/mcp/McpRegistry';
import { llmRegistry } from '@services/llm/LlmRegistry';
import { config } from '@utils/config';

const router = express.Router();
const logger = createLogger('mcp-routes');

router.use(jwtMiddleware);
router.use(requireRoles('caseworker', 'admin'));

const CHAT_TIMEOUT_MS = 480_000;

/**
 * GET /v1/mcp/sources
 * Returns all registered MCP providers with their metadata and connection status.
 * Used by the frontend to populate the source selector.
 */
router.get('/sources', (_req, res) => {
  if (!config.mcp.enabled) {
    return res.json({ success: true, data: [] });
  }
  return res.json({ success: true, data: mcpRegistry.getProviderMeta() });
});

/**
 * GET /v1/mcp/models
 * Returns all available LLM models with their provider.
 */
router.get('/models', (_req, res) => {
  return res.json({ success: true, data: llmRegistry.getAvailableModels() });
});

/**
 * POST /v1/mcp/chat
 * Stream a single chat turn through the MCP agentic loop via SSE.
 *
 * Body:
 *   message  string          — the user's message
 *   history  ChatMessage[]   — prior turns
 *   sources  string[]        — provider IDs to use (e.g. ["operaton", "triplydb"])
 *
 * SSE event types:
 *   { type: 'status', message: string }  — tool call about to execute
 *   { type: 'delta',  text: string }     — text token from the model
 *   { type: 'done' }                     — loop finished cleanly
 *   { type: 'error', message: string }   — unrecoverable failure
 */
router.post('/chat', async (req, res) => {
  if (!config.mcp.enabled) {
    return res.status(503).json({
      success: false,
      error: { code: 'MCP_DISABLED', message: 'MCP is not enabled' },
    });
  }

  const {
    message,
    history = [],
    sources = [],
    modelId,
  } = req.body as {
    message: string;
    history: Array<{ role: 'user' | 'assistant'; content: string }>;
    sources: string[];
    modelId: string;
  };

  if (!message?.trim()) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_REQUEST', message: 'message is required' },
    });
  }

  if (!modelId) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_REQUEST', message: 'modelId is required' },
    });
  }

  if (!mcpRegistry.isAnyConnected(sources.length > 0 ? sources : undefined)) {
    return res.status(503).json({
      success: false,
      error: { code: 'MCP_NOT_CONNECTED', message: 'No selected MCP sources are connected' },
    });
  }

  // ── SSE setup ──────────────────────────────────────────────────────────────
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const abortController = new AbortController();

  const timeoutId = setTimeout(() => {
    abortController.abort();
    send({ type: 'error', message: 'Chat request timed out' });
    if (!res.writableEnded) res.end();
  }, CHAT_TIMEOUT_MS);

  req.on('close', () => {
    abortController.abort();
    clearTimeout(timeoutId);
  });

  function send(event: object): void {
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  }

  logger.info('MCP chat stream started', {
    userId: req.user?.userId,
    sources,
    historyLength: history.length,
  });

  try {
    await runChatStream(history, message, send, sources, modelId, abortController.signal);
    send({ type: 'done' });
  } catch (error) {
    if (!abortController.signal.aborted) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error('MCP chat stream failed', { error: msg });
      send({ type: 'error', message: msg });
    }
  } finally {
    clearTimeout(timeoutId);
    if (!res.writableEnded) res.end();
  }
});

export default router;
