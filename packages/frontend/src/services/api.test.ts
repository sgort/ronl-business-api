import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { businessApi } from './api';

const mockKeycloak = vi.hoisted(() => ({
  authenticated: false,
  token: undefined as string | undefined,
  updateToken: vi.fn(),
  login: vi.fn(),
}));

vi.mock('./keycloak', () => ({
  default: mockKeycloak,
}));

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  mockKeycloak.authenticated = false;
  mockKeycloak.token = undefined;
  mockKeycloak.updateToken.mockReset().mockResolvedValue(true);
});

describe('businessApi.health', () => {
  it('returns the health payload on success', async () => {
    server.use(
      http.get('*/health', () =>
        HttpResponse.json({
          success: true,
          data: { name: 'api', version: '1.0.0', status: 'healthy' },
        })
      )
    );

    const result = await businessApi.health();

    expect(result).toEqual({ name: 'api', version: '1.0.0', status: 'healthy' });
  });

  it('falls back to the error response body when the server still returned data', async () => {
    server.use(
      http.get('*/health', () =>
        HttpResponse.json(
          { success: false, data: { name: 'api', version: '1.0.0', status: 'degraded' } },
          { status: 503 }
        )
      )
    );

    const result = await businessApi.health();

    expect(result).toEqual({ name: 'api', version: '1.0.0', status: 'degraded' });
  });

  it('attaches a bearer token when the user is authenticated', async () => {
    mockKeycloak.authenticated = true;
    mockKeycloak.token = 'test-token';

    let receivedAuth: string | null = null;
    server.use(
      http.get('*/health', ({ request }) => {
        receivedAuth = request.headers.get('authorization');
        return HttpResponse.json({
          success: true,
          data: { name: 'api', version: '1.0.0', status: 'healthy' },
        });
      })
    );

    await businessApi.health();

    expect(receivedAuth).toBe('Bearer test-token');
    expect(mockKeycloak.updateToken).toHaveBeenCalledWith(120);
  });

  it('sends no Authorization header when the user is not authenticated', async () => {
    let receivedAuth: string | null = 'unset';
    server.use(
      http.get('*/health', ({ request }) => {
        receivedAuth = request.headers.get('authorization');
        return HttpResponse.json({
          success: true,
          data: { name: 'api', version: '1.0.0', status: 'healthy' },
        });
      })
    );

    await businessApi.health();

    expect(receivedAuth).toBeNull();
    expect(mockKeycloak.updateToken).not.toHaveBeenCalled();
  });
});
