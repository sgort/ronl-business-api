import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { businessApi } from './api';

// This suite exists specifically because SigningPanel.test.tsx mocks '../../services/api'
// wholesale, so the real validsign.* implementations never execute anywhere else. These are
// the only tests that prove the axios-error normalisation in api.ts actually produces the
// shape the panel depends on (e.g. suppressing the retry button on a 422).

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
  mockKeycloak.login.mockReset();
});

describe('businessApi.validsign.taskSpec', () => {
  it('returns response.data unchanged on success', async () => {
    server.use(
      http.get('*/validsign/task/task-1/spec', () =>
        HttpResponse.json({ success: true, data: { taskId: 'task-1', signers: [] } })
      )
    );

    const result = await businessApi.validsign.taskSpec('task-1');

    expect(result).toEqual({ success: true, data: { taskId: 'task-1', signers: [] } });
  });

  it('returns the backend error body instead of throwing when the response has data', async () => {
    server.use(
      http.get('*/validsign/task/task-1/spec', () =>
        HttpResponse.json(
          { success: false, error: { code: 'NOT_FOUND', message: 'no such task' } },
          { status: 404 }
        )
      )
    );

    const result = await businessApi.validsign.taskSpec('task-1');

    expect(result).toEqual({
      success: false,
      error: { code: 'NOT_FOUND', message: 'no such task' },
    });
  });

  it('rethrows on a network failure with no response', async () => {
    server.use(http.get('*/validsign/task/task-1/spec', () => HttpResponse.error()));

    await expect(businessApi.validsign.taskSpec('task-1')).rejects.toBeTruthy();
  });

  it('rethrows a non-axios error raised by the request interceptor', async () => {
    mockKeycloak.authenticated = true;
    mockKeycloak.updateToken.mockRejectedValue(new Error('token expired'));

    await expect(businessApi.validsign.taskSpec('task-1')).rejects.toThrow('Session expired');
    expect(mockKeycloak.login).toHaveBeenCalled();
  });
});

describe('businessApi.validsign.createPackage', () => {
  it('posts the delivery value to the task package URL and returns response.data on success', async () => {
    let body: unknown;
    let sawUrl = '';
    server.use(
      http.post('*/validsign/task/task-42/package', async ({ request }) => {
        sawUrl = request.url;
        body = await request.json();
        return HttpResponse.json({
          success: true,
          data: { packageId: 'pkg-1', signingUrl: 'https://sign.example/pkg-1' },
        });
      })
    );

    const result = await businessApi.validsign.createPackage('task-42', 'embedded');

    expect(sawUrl).toContain('/validsign/task/task-42/package');
    expect(body).toEqual({ delivery: 'embedded' });
    expect(result).toEqual({
      success: true,
      data: { packageId: 'pkg-1', signingUrl: 'https://sign.example/pkg-1' },
    });
  });

  it('sends the email delivery value unchanged', async () => {
    let body: unknown;
    server.use(
      http.post('*/validsign/task/task-42/package', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ success: true, data: { packageId: 'pkg-2', sentTo: 'a@b.nl' } });
      })
    );

    await businessApi.validsign.createPackage('task-42', 'email');

    expect(body).toEqual({ delivery: 'email' });
  });

  it('returns the backend error body instead of throwing when the response has data', async () => {
    server.use(
      http.post('*/validsign/task/task-42/package', () =>
        HttpResponse.json(
          { success: false, error: { code: 'BAD_REQUEST', message: 'nope' } },
          { status: 400 }
        )
      )
    );

    const result = await businessApi.validsign.createPackage('task-42', 'embedded');

    expect(result).toEqual({ success: false, error: { code: 'BAD_REQUEST', message: 'nope' } });
  });

  it('rethrows on a network failure with no response', async () => {
    server.use(http.post('*/validsign/task/task-42/package', () => HttpResponse.error()));

    await expect(businessApi.validsign.createPackage('task-42', 'embedded')).rejects.toBeTruthy();
  });

  it('rethrows a non-axios error raised by the request interceptor', async () => {
    mockKeycloak.authenticated = true;
    mockKeycloak.updateToken.mockRejectedValue(new Error('token expired'));

    await expect(businessApi.validsign.createPackage('task-42', 'embedded')).rejects.toThrow(
      'Session expired'
    );
    expect(mockKeycloak.login).toHaveBeenCalled();
  });

  it('surfaces MISSING_SIGNER_EMAIL on a 422 so the panel can suppress the retry button', async () => {
    server.use(
      http.post('*/validsign/task/task-42/package', () =>
        HttpResponse.json(
          {
            success: false,
            error: {
              code: 'MISSING_SIGNER_EMAIL',
              message: 'Signer has no email address on file',
            },
          },
          { status: 422 }
        )
      )
    );

    const result = await businessApi.validsign.createPackage('task-42', 'embedded');

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('MISSING_SIGNER_EMAIL');
  });

  it('surfaces VALIDSIGN_PACKAGE_EXISTS on a 409 along with the existing packageId', async () => {
    server.use(
      http.post('*/validsign/task/task-42/package', () =>
        HttpResponse.json(
          {
            success: false,
            error: {
              code: 'VALIDSIGN_PACKAGE_EXISTS',
              message: 'A package already exists for this task',
            },
            data: { packageId: 'pkg-existing-1' },
          },
          { status: 409 }
        )
      )
    );

    const result = await businessApi.validsign.createPackage('task-42', 'embedded');

    expect(result.error?.code).toBe('VALIDSIGN_PACKAGE_EXISTS');
    expect((result as unknown as { data: { packageId: string } }).data.packageId).toBe(
      'pkg-existing-1'
    );
  });
});

describe('businessApi.validsign.status', () => {
  it('returns response.data unchanged on success', async () => {
    server.use(
      http.get('*/validsign/task/task-7/status', () =>
        HttpResponse.json({ success: true, data: { status: 'sent' } })
      )
    );

    const result = await businessApi.validsign.status('task-7');

    expect(result).toEqual({ success: true, data: { status: 'sent' } });
  });

  it('returns the backend error body instead of throwing when the response has data', async () => {
    server.use(
      http.get('*/validsign/task/task-7/status', () =>
        HttpResponse.json(
          { success: false, error: { code: 'NOT_FOUND', message: 'no package' } },
          { status: 404 }
        )
      )
    );

    const result = await businessApi.validsign.status('task-7');

    expect(result).toEqual({ success: false, error: { code: 'NOT_FOUND', message: 'no package' } });
  });

  it('rethrows on a network failure with no response', async () => {
    server.use(http.get('*/validsign/task/task-7/status', () => HttpResponse.error()));

    await expect(businessApi.validsign.status('task-7')).rejects.toBeTruthy();
  });

  it('rethrows a non-axios error raised by the request interceptor', async () => {
    mockKeycloak.authenticated = true;
    mockKeycloak.updateToken.mockRejectedValue(new Error('token expired'));

    await expect(businessApi.validsign.status('task-7')).rejects.toThrow('Session expired');
    expect(mockKeycloak.login).toHaveBeenCalled();
  });
});
