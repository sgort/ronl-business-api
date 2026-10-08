const mockConfig = {
  keycloak: { url: 'http://kc', realm: 'ronl' },
  entra: { tenantId: 'tid', clientId: 'cid', clientSecret: 'csecret', idpAlias: 'entra-flevoland' },
};
const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
jest.mock('@utils/config', () => ({ config: mockConfig }));
jest.mock('@utils/logger', () => ({ createLogger: () => mockLogger }));

import type { AxiosInstance } from 'axios';
import {
  EntraTokenService,
  ReauthRequiredError,
  UserTokenUnavailableError,
  jwtExp,
} from './entra-token.service';

const NOW = 1_800_000_000_000; // ms
const jwt = (exp: number, tag = 'x') =>
  ['h', Buffer.from(JSON.stringify({ exp, tag })).toString('base64url'), 'sig'].join('.');
const valid = (tag: string) => jwt(NOW / 1000 + 3600, tag);
const expired = (tag: string) => jwt(NOW / 1000 - 10, tag);

function make(maxEntries = 500) {
  const http = { get: jest.fn(), post: jest.fn() };
  const svc = new EntraTokenService(http as unknown as AxiosInstance, () => NOW, maxEntries);
  return { http, svc };
}
const httpError = (status: number, data: unknown = {}) =>
  Object.assign(new Error(`HTTP ${status}`), { response: { status, data } });

beforeEach(() => jest.clearAllMocks());

describe('jwtExp', () => {
  it('reads exp, and answers 0 for garbage', () => {
    expect(jwtExp(jwt(123))).toBe(123);
    expect(jwtExp('not-a-jwt')).toBe(0);
  });
});

describe('EntraTokenService', () => {
  it('reads the stored token from the broker endpoint with the person’s own Keycloak token', async () => {
    const { http, svc } = make();
    http.get.mockResolvedValue({ data: { id_token: valid('a'), refresh_token: 'r1' } });
    await expect(svc.getIdToken('sub-a', 'kc-a')).resolves.toBe(valid('a'));
    expect(http.get).toHaveBeenCalledWith('http://kc/realms/ronl/broker/entra-flevoland/token', {
      headers: { Authorization: 'Bearer kc-a' },
    });
  });

  it('accepts the stored token response as a JSON string too', async () => {
    const { http, svc } = make();
    http.get.mockResolvedValue({ data: JSON.stringify({ id_token: valid('a') }) });
    await expect(svc.getIdToken('sub-a', 'kc-a')).resolves.toBe(valid('a'));
  });

  it('caches per user: a second call does not ask Keycloak again', async () => {
    const { http, svc } = make();
    http.get.mockResolvedValue({ data: { id_token: valid('a'), refresh_token: 'r1' } });
    await svc.getIdToken('sub-a', 'kc-a');
    await svc.getIdToken('sub-a', 'kc-a');
    expect(http.get).toHaveBeenCalledTimes(1);
  });

  it('never gives user A the token of user B', async () => {
    const { http, svc } = make();
    http.get
      .mockResolvedValueOnce({ data: { id_token: valid('a') } })
      .mockResolvedValueOnce({ data: { id_token: valid('b') } });
    await expect(svc.getIdToken('sub-a', 'kc-a')).resolves.toBe(valid('a'));
    await expect(svc.getIdToken('sub-b', 'kc-b')).resolves.toBe(valid('b'));
    await expect(svc.getIdToken('sub-a', 'kc-a')).resolves.toBe(valid('a'));
  });

  it('refreshes an expired ID token at Entra with the client secret', async () => {
    const { http, svc } = make();
    http.get.mockResolvedValue({ data: { id_token: expired('old'), refresh_token: 'r1' } });
    http.post.mockResolvedValue({ data: { id_token: valid('new'), refresh_token: 'r2' } });
    await expect(svc.getIdToken('sub-a', 'kc-a')).resolves.toBe(valid('new'));
    const [url, body] = http.post.mock.calls[0];
    expect(url).toBe('https://login.microsoftonline.com/tid/oauth2/v2.0/token');
    const form = new URLSearchParams(body as string);
    expect(Object.fromEntries(form)).toMatchObject({
      grant_type: 'refresh_token',
      refresh_token: 'r1',
      client_id: 'cid',
      client_secret: 'csecret',
      scope: 'openid profile email offline_access',
    });
  });

  it('keeps the old refresh token when Entra does not rotate it', async () => {
    const { http, svc } = make();
    http.get.mockResolvedValue({ data: { id_token: expired('old'), refresh_token: 'r1' } });
    http.post
      .mockResolvedValueOnce({ data: { id_token: expired('mid') } })
      .mockResolvedValueOnce({ data: { id_token: valid('new') } });
    await svc.getIdToken('sub-a', 'kc-a');
    await svc.getIdToken('sub-a', 'kc-a');
    expect(new URLSearchParams(http.post.mock.calls[1][1] as string).get('refresh_token')).toBe(
      'r1'
    );
  });

  it('forceRefresh refreshes a still-valid token', async () => {
    const { http, svc } = make();
    http.get.mockResolvedValue({ data: { id_token: valid('a'), refresh_token: 'r1' } });
    http.post.mockResolvedValue({ data: { id_token: valid('fresh') } });
    await svc.getIdToken('sub-a', 'kc-a');
    await expect(svc.getIdToken('sub-a', 'kc-a', { forceRefresh: true })).resolves.toBe(
      valid('fresh')
    );
  });

  it.each([400, 401, 403, 404])(
    'a %d from the broker endpoint means no stored token',
    async (status) => {
      const { http, svc } = make();
      http.get.mockRejectedValue(httpError(status));
      await expect(svc.getIdToken('sub-a', 'kc-a')).rejects.toBeInstanceOf(
        UserTokenUnavailableError
      );
    }
  );

  it('a stored response without an id_token means no stored token', async () => {
    const { http, svc } = make();
    http.get.mockResolvedValue({ data: { access_token: 'graph-only' } });
    await expect(svc.getIdToken('sub-a', 'kc-a')).rejects.toBeInstanceOf(UserTokenUnavailableError);
  });

  it('a 5xx from the broker endpoint is not mistaken for a missing token', async () => {
    const { http, svc } = make();
    http.get.mockRejectedValue(httpError(503));
    await expect(svc.getIdToken('sub-a', 'kc-a')).rejects.toThrow('HTTP 503');
  });

  it('a refused refresh means sign in again', async () => {
    const { http, svc } = make();
    http.get.mockResolvedValue({ data: { id_token: expired('old'), refresh_token: 'r1' } });
    http.post.mockRejectedValue(httpError(400, { error: 'invalid_grant' }));
    await expect(svc.getIdToken('sub-a', 'kc-a')).rejects.toBeInstanceOf(ReauthRequiredError);
  });

  it('interaction_required also means sign in again', async () => {
    const { http, svc } = make();
    http.get.mockResolvedValue({ data: { id_token: expired('old'), refresh_token: 'r1' } });
    http.post.mockRejectedValue(httpError(400, { error: 'interaction_required' }));
    await expect(svc.getIdToken('sub-a', 'kc-a')).rejects.toBeInstanceOf(ReauthRequiredError);
  });

  it.each(['invalid_client', 'unauthorized_client'])(
    'a broken client setting (%s) is not "sign in again" — it surfaces as an error',
    async (error) => {
      const { http, svc } = make();
      http.get.mockResolvedValue({ data: { id_token: expired('old'), refresh_token: 'r1' } });
      http.post.mockRejectedValue(httpError(401, { error }));
      const result = svc.getIdToken('sub-a', 'kc-a');
      await expect(result).rejects.not.toBeInstanceOf(ReauthRequiredError);
      await expect(svc.getIdToken('sub-a', 'kc-a')).rejects.toThrow(/Entra refused/);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Entra refused'),
        expect.objectContaining({ error })
      );
    }
  );

  it('an expired token with no refresh token means sign in again', async () => {
    const { http, svc } = make();
    http.get.mockResolvedValue({ data: { id_token: expired('old') } });
    await expect(svc.getIdToken('sub-a', 'kc-a')).rejects.toBeInstanceOf(ReauthRequiredError);
  });

  it('evicts the oldest user beyond the bound', async () => {
    const { http, svc } = make(1);
    http.get
      .mockResolvedValueOnce({ data: { id_token: valid('a') } })
      .mockResolvedValueOnce({ data: { id_token: valid('b') } })
      .mockResolvedValueOnce({ data: { id_token: valid('a2') } });
    await svc.getIdToken('sub-a', 'kc-a');
    await svc.getIdToken('sub-b', 'kc-b');
    await svc.getIdToken('sub-a', 'kc-a');
    expect(http.get).toHaveBeenCalledTimes(3);
  });

  // #326 item 2: a user who keeps working stays cached; the least recently
  // USED one goes, not the first one inserted.
  it('evicts the least recently used user, not the first one cached', async () => {
    const { http, svc } = make(2);
    http.get
      .mockResolvedValueOnce({ data: { id_token: valid('a') } })
      .mockResolvedValueOnce({ data: { id_token: valid('b') } })
      .mockResolvedValueOnce({ data: { id_token: valid('c') } })
      .mockResolvedValueOnce({ data: { id_token: valid('b2') } });
    await svc.getIdToken('sub-a', 'kc-a');
    await svc.getIdToken('sub-b', 'kc-b');
    await svc.getIdToken('sub-a', 'kc-a'); // a used again
    await svc.getIdToken('sub-c', 'kc-c'); // evicts b, the least recently used
    await svc.getIdToken('sub-a', 'kc-a'); // still cached
    expect(http.get).toHaveBeenCalledTimes(3);
    await svc.getIdToken('sub-b', 'kc-b'); // read again
    expect(http.get).toHaveBeenCalledTimes(4);
  });

  // #326 item 3: two first requests at once share one read of Keycloak.
  it('reads the broker endpoint once for concurrent first requests of one user', async () => {
    const { http, svc } = make();
    let release: (v: unknown) => void = () => undefined;
    http.get.mockReturnValueOnce(new Promise((resolve) => (release = resolve)));
    const both = Promise.all([svc.getIdToken('sub-a', 'kc-a'), svc.getIdToken('sub-a', 'kc-a')]);
    release({ data: { id_token: valid('a') } });
    await expect(both).resolves.toEqual([valid('a'), valid('a')]);
    expect(http.get).toHaveBeenCalledTimes(1);
  });

  it('lets the next request try again after a shared read failed', async () => {
    const { http, svc } = make();
    http.get
      .mockRejectedValueOnce(httpError(503))
      .mockResolvedValueOnce({ data: { id_token: valid('a') } });
    await expect(svc.getIdToken('sub-a', 'kc-a')).rejects.toThrow();
    await expect(svc.getIdToken('sub-a', 'kc-a')).resolves.toBe(valid('a'));
  });

  it('never puts a token in a log line (Review Focus 4)', async () => {
    const { http, svc } = make();
    http.get.mockResolvedValue({ data: { id_token: expired('old'), refresh_token: 'r-secret' } });
    http.post.mockRejectedValue(httpError(400, { error: 'invalid_grant' }));
    await svc.getIdToken('sub-a', 'kc-secret').catch(() => undefined);
    const logged = JSON.stringify([
      mockLogger.info.mock.calls,
      mockLogger.warn.mock.calls,
      mockLogger.error.mock.calls,
      mockLogger.debug.mock.calls,
    ]);
    for (const secret of ['kc-secret', 'r-secret', expired('old'), 'csecret']) {
      expect(logged).not.toContain(secret);
    }
  });
});
