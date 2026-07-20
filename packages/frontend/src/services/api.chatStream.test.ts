import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { businessApi } from './api';
import type { McpChatStreamEvent } from './api';

const mockKeycloak = vi.hoisted(() => ({
  authenticated: false,
  token: undefined as string | undefined,
  updateToken: vi.fn(),
  login: vi.fn(),
}));
vi.mock('./keycloak', () => ({ default: mockKeycloak }));

function makeStreamResponse(
  chunks: string[],
  opts: { ok?: boolean; status?: number; json?: () => Promise<unknown> } = {}
) {
  const encoder = new TextEncoder();
  let i = 0;
  const releaseLock = vi.fn();
  const reader = {
    read: vi.fn(async () => {
      if (i < chunks.length) {
        const value = encoder.encode(chunks[i]);
        i++;
        return { done: false, value };
      }
      return { done: true, value: undefined };
    }),
    releaseLock,
  };
  return {
    response: {
      ok: opts.ok ?? true,
      status: opts.status ?? 200,
      json: opts.json ?? vi.fn().mockResolvedValue({}),
      body: { getReader: () => reader },
    } as unknown as Response,
    releaseLock,
  };
}

async function collect(gen: AsyncGenerator<McpChatStreamEvent>): Promise<McpChatStreamEvent[]> {
  const out: McpChatStreamEvent[] = [];
  for await (const ev of gen) out.push(ev);
  return out;
}

beforeEach(() => {
  mockKeycloak.authenticated = false;
  mockKeycloak.token = undefined;
  mockKeycloak.updateToken.mockReset().mockResolvedValue(true);
  mockKeycloak.login.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('businessApi.mcp.chatStream', () => {
  it('yields parsed SSE events from the stream', async () => {
    const { response } = makeStreamResponse([
      'data: {"type":"status","message":"thinking"}\n',
      'data: {"type":"delta","text":"Hello"}\n',
      'data: {"type":"done"}\n',
    ]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

    const events = await collect(businessApi.mcp.chatStream('hi', [], [], 'model-1'));

    expect(events).toEqual([
      { type: 'status', message: 'thinking' },
      { type: 'delta', text: 'Hello' },
      { type: 'done' },
    ]);
  });

  it('reassembles an SSE line split across two chunks', async () => {
    const { response } = makeStreamResponse(['data: {"type":"delta","tex', 't":"hello"}\n']);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

    const events = await collect(businessApi.mcp.chatStream('hi', [], [], 'model-1'));

    expect(events).toEqual([{ type: 'delta', text: 'hello' }]);
  });

  it('silently skips a malformed data line but keeps yielding valid ones', async () => {
    const { response } = makeStreamResponse(['data: {not valid json\n', 'data: {"type":"done"}\n']);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

    const events = await collect(businessApi.mcp.chatStream('hi', [], [], 'model-1'));

    expect(events).toEqual([{ type: 'done' }]);
  });

  it('ignores lines without the "data: " prefix', async () => {
    const { response } = makeStreamResponse([
      ': this is an SSE comment\n',
      '\n',
      'data: {"type":"done"}\n',
    ]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

    const events = await collect(businessApi.mcp.chatStream('hi', [], [], 'model-1'));

    expect(events).toEqual([{ type: 'done' }]);
  });

  it('releases the reader lock once the stream ends', async () => {
    const { response, releaseLock } = makeStreamResponse(['data: {"type":"done"}\n']);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

    await collect(businessApi.mcp.chatStream('hi', [], [], 'model-1'));

    expect(releaseLock).toHaveBeenCalled();
  });

  it('yields a single error event using the parsed error body when the response is not ok', async () => {
    const { response } = makeStreamResponse([], {
      ok: false,
      status: 500,
      json: vi.fn().mockResolvedValue({ error: { message: 'Model unavailable' } }),
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

    const events = await collect(businessApi.mcp.chatStream('hi', [], [], 'model-1'));

    expect(events).toEqual([{ type: 'error', message: 'Model unavailable' }]);
  });

  it('falls back to "HTTP <status>" when the error body is not valid JSON', async () => {
    const { response } = makeStreamResponse([], {
      ok: false,
      status: 503,
      json: vi.fn().mockRejectedValue(new Error('not json')),
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

    const events = await collect(businessApi.mcp.chatStream('hi', [], [], 'model-1'));

    expect(events).toEqual([{ type: 'error', message: 'HTTP 503' }]);
  });

  it('yields an error event when fetch itself rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    const events = await collect(businessApi.mcp.chatStream('hi', [], [], 'model-1'));

    expect(events).toEqual([{ type: 'error', message: 'network down' }]);
  });

  it('yields nothing when the request was aborted', async () => {
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError));

    const events = await collect(businessApi.mcp.chatStream('hi', [], [], 'model-1'));

    expect(events).toEqual([]);
  });

  it('attaches a bearer token when authenticated', async () => {
    mockKeycloak.authenticated = true;
    mockKeycloak.token = 'test-token';
    const { response } = makeStreamResponse(['data: {"type":"done"}\n']);
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal('fetch', fetchMock);

    await collect(businessApi.mcp.chatStream('hi', [], [], 'model-1'));

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/mcp/chat'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
      })
    );
  });

  it('does not call fetch and yields nothing when the token refresh fails', async () => {
    mockKeycloak.authenticated = true;
    mockKeycloak.updateToken.mockRejectedValue(new Error('expired'));
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const events = await collect(businessApi.mcp.chatStream('hi', [], [], 'model-1'));

    expect(events).toEqual([]);
    expect(mockKeycloak.login).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
