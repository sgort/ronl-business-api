import express from 'express';
import { jwtMiddleware } from '@auth/jwt.middleware';
import { requireRoles } from '@auth/jwt.middleware';
import { createLogger } from '@utils/logger';
import { runChatTurn } from '@services/mcpChat.service';
import { mcpClientService } from '@services/mcpClient.service';
import { config } from '@utils/config';

const router = express.Router();
const logger = createLogger('mcp-routes');

router.use(jwtMiddleware);
router.use(requireRoles('caseworker', 'admin'));

const CHAT_TIMEOUT_MS = 60_000;

/**
 * POST /v1/mcp/chat
 * Run a single chat turn through the MCP agentic loop.
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

  try {
    logger.info('MCP chat turn', { userId: req.user?.userId, historyLength: history.length });

    const response = await Promise.race([
      runChatTurn(history, message),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Chat request timed out after 60s')), CHAT_TIMEOUT_MS)
      ),
    ]);

    res.json({ success: true, data: { response } });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const timedOut = msg.includes('timed out');

    logger.error('MCP chat failed', { error: msg });
    res.status(timedOut ? 504 : 500).json({
      success: false,
      error: {
        code: timedOut ? 'MCP_CHAT_TIMEOUT' : 'MCP_CHAT_FAILED',
        message: msg,
      },
    });
  }
});

export default router;
