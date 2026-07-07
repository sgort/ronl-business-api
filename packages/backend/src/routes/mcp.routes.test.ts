/**
 * Route tests for /v1/mcp (jwt + requireRoles): sources, models, and the SSE
 * chat endpoint. runChatStream, the registries, and config are mocked.
 */

import type { Request, Response, NextFunction } from 'express';

jest.mock('@auth/jwt.middleware', () => ({
  jwtMiddleware: (req: Request, res: Response, next: NextFunction) => {
    const roles = req.headers['x-test-roles'] as string | undefined;
    if (!roles) return res.status(401).json({ success: false, error: { code: 'MISSING_TOKEN' } });
    req.user = { userId: 'u', tenantId: 'flevoland', roles: roles.split(',') } as Request['user'];
    next();
  },
  requireRoles:
    (...roles: string[]) =>
    (req: Request, res: Response, next: NextFunction) => {
      if (!req.user?.roles.some((r) => roles.includes(r)))
        return res.status(403).json({ success: false, error: { code: 'FORBIDDEN' } });
      next();
    },
}));
jest.mock('@services/mcpChat.service', () => ({ runChatStream: jest.fn() }));
jest.mock('@services/mcp/McpRegistry', () => ({
  mcpRegistry: { getProviderMeta: jest.fn(), isAnyConnected: jest.fn() },
}));
jest.mock('@services/llm/LlmRegistry', () => ({ llmRegistry: { getAvailableModels: jest.fn() } }));

const mockConfig = { mcp: { enabled: true } };
jest.mock('@utils/config', () => ({ config: mockConfig }));
const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
jest.mock('@utils/logger', () => ({ createLogger: () => mockLogger }));

import express from 'express';
import request from 'supertest';
import mcpRouter from './mcp.routes';
import { runChatStream } from '@services/mcpChat.service';
import { mcpRegistry } from '@services/mcp/McpRegistry';
import { llmRegistry } from '@services/llm/LlmRegistry';

const mockRunChat = runChatStream as jest.Mock;
const mcp = mcpRegistry as unknown as { getProviderMeta: jest.Mock; isAnyConnected: jest.Mock };
const llm = llmRegistry as unknown as { getAvailableModels: jest.Mock };

const app = express();
app.use(express.json());
app.use('/v1/mcp', mcpRouter);
const auth = (r: request.Test) => r.set('x-test-roles', 'caseworker');

beforeEach(() => {
  jest.clearAllMocks();
  mockConfig.mcp.enabled = true;
});

describe('GET /v1/mcp/sources', () => {
  it('401 without a token', async () => {
    expect((await request(app).get('/v1/mcp/sources')).status).toBe(401);
  });

  it('403 for a role without access', async () => {
    const res = await request(app).get('/v1/mcp/sources').set('x-test-roles', 'viewer');
    expect(res.status).toBe(403);
  });

  it('returns an empty list when MCP is disabled', async () => {
    mockConfig.mcp.enabled = false;
    const res = await auth(request(app).get('/v1/mcp/sources'));
    expect(res.body).toEqual({ success: true, data: [] });
    expect(mcp.getProviderMeta).not.toHaveBeenCalled();
  });

  it('returns provider metadata when enabled', async () => {
    mcp.getProviderMeta.mockReturnValue([{ id: 'operaton', connected: true }]);
    const res = await auth(request(app).get('/v1/mcp/sources'));
    expect(res.body.data).toEqual([{ id: 'operaton', connected: true }]);
  });
});

describe('GET /v1/mcp/models', () => {
  it('returns the available models', async () => {
    llm.getAvailableModels.mockReturnValue([{ id: 'claude-opus-4-8', providerId: 'anthropic' }]);
    const res = await auth(request(app).get('/v1/mcp/models'));
    expect(res.status).toBe(200);
    expect(res.body.data[0].id).toBe('claude-opus-4-8');
  });
});

describe('POST /v1/mcp/chat', () => {
  const body = { message: 'hi', modelId: 'claude-opus-4-8', sources: ['operaton'] };

  it('503 when MCP is disabled', async () => {
    mockConfig.mcp.enabled = false;
    const res = await auth(request(app).post('/v1/mcp/chat')).send(body);
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('MCP_DISABLED');
  });

  it('400 when the message is blank', async () => {
    const res = await auth(request(app).post('/v1/mcp/chat')).send({ ...body, message: '  ' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REQUEST');
  });

  it('400 when modelId is missing', async () => {
    const res = await auth(request(app).post('/v1/mcp/chat')).send({ message: 'hi', sources: [] });
    expect(res.status).toBe(400);
  });

  it('503 when no selected source is connected', async () => {
    mcp.isAnyConnected.mockReturnValue(false);
    const res = await auth(request(app).post('/v1/mcp/chat')).send(body);
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('MCP_NOT_CONNECTED');
  });

  it('streams the chat turn and a final done event', async () => {
    mcp.isAnyConnected.mockReturnValue(true);
    mockRunChat.mockImplementation(async (_h, _m, emit: (e: object) => void) => {
      emit({ type: 'delta', text: 'hello' });
    });

    const res = await auth(request(app).post('/v1/mcp/chat')).send(body);

    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.text).toContain('data: {"type":"delta","text":"hello"}');
    expect(res.text).toContain('data: {"type":"done"}');
    expect(mockRunChat).toHaveBeenCalledWith(
      [],
      'hi',
      expect.any(Function),
      ['operaton'],
      'claude-opus-4-8',
      expect.any(Object)
    );
  });

  it('forwards an error event emitted by the chat stream, then done', async () => {
    mcp.isAnyConnected.mockReturnValue(true);
    mockRunChat.mockImplementation(async (_h, _m, emit: (e: object) => void) => {
      emit({ type: 'error', message: 'llm down' });
    });

    const res = await auth(request(app).post('/v1/mcp/chat')).send(body);

    expect(res.text).toContain('data: {"type":"error","message":"llm down"}');
    expect(res.text).toContain('data: {"type":"done"}');
  });

  it('sends a timeout error and closes the stream when the chat takes too long', async () => {
    mcp.isAnyConnected.mockReturnValue(true);

    // Replace setTimeout so the route's 480s timer fires on the next microtask —
    // exactly when the handler suspends at `await runChatStream(...)`, before it
    // resolves. clearTimeout is no-op since there's no real handle to cancel.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    jest.spyOn(global, 'setTimeout').mockImplementation((fn: any) => {
      queueMicrotask(fn as () => void);
      return 1 as unknown as NodeJS.Timeout;
    });
    jest.spyOn(global, 'clearTimeout').mockImplementation(() => undefined);

    let resolveStream: (() => void) | undefined;
    mockRunChat.mockImplementation(
      () =>
        new Promise<void>((r) => {
          resolveStream = r;
        })
    );

    const res = await auth(request(app).post('/v1/mcp/chat')).send(body);

    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.text).toContain('"Chat request timed out"');

    resolveStream?.(); // let the route handler's finally block exit cleanly
    jest.restoreAllMocks();
  });
});
