import express from 'express';
import { jwtMiddleware, requireRoles } from '@auth/jwt.middleware';
import { createLogger } from '@utils/logger';
import { runChatStream } from '@services/mcpChat.service';
import { mcpClientService } from '@services/mcpClient.service';
import { config } from '@utils/config';

const router = express.Router();
const logger = createLogger('mcp-routes');

router.use(jwtMiddleware);
router.use(requireRoles('caseworker', 'admin'));

const CHAT_TIMEOUT_MS = 240_000;

/**
 * POST /v1/mcp/chat
 * Stream a single chat turn through the MCP agentic loop via SSE.
 *
 * Event types emitted on the stream:
 *   { type: 'status', message: string }  — tool call about to execute
 *   { type: 'delta',  text: string }     — text token from the model
 *   { type: 'done' }                     — loop finished cleanly
 *   { type: 'error', message: string }   — unrecoverable failure
 */
router.post('/chat', async (req, res) => {
  if (!config.mcp.enabled) {
    return res.status(503).json({
      success: false,
      error: { code: 'MCP_DISABLED', message: 'MCP client is not enabled' },
    });
  }

  if (!mcpClientService.isConnected()) {
    return res.status(503).json({
      success: false,
      error: { code: 'MCP_NOT_CONNECTED', message: 'MCP client is not connected' },
    });
  }

  const { message, history = [] } = req.body as {
    message: string;
    history: Array<{ role: 'user' | 'assistant'; content: string }>;
  };

  if (!message?.trim()) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_REQUEST', message: 'message is required' },
    });
  }

  // ── SSE setup ──────────────────────────────────────────────────────────────
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable Caddy / nginx proxy buffering
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

  // ── Agentic loop ───────────────────────────────────────────────────────────
  logger.info('MCP chat stream started', {
    userId: req.user?.userId,
    historyLength: history.length,
  });

  try {
    await runChatStream(history, message, send, abortController.signal);
    send({ type: 'done' });
  } catch (error) {
    if (abortController.signal.aborted) {
      // timeout or client disconnect — already handled
    } else {
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
