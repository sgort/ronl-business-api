/**
 * Unit tests for the BRP upstream probe. global fetch is mocked; no network.
 */

import { BRP_API_BASE_URL, brpHealthCheck, transportErrorCode } from './brp-upstream';

const mockFetch = jest.fn();
beforeAll(() => {
  global.fetch = mockFetch as unknown as typeof fetch;
});
beforeEach(() => jest.clearAllMocks());

/** What undici throws when the TLS handshake fails: "fetch failed", reason on `cause`. */
function fetchFailed(code: string): Error {
  return Object.assign(new TypeError('fetch failed'), {
    cause: Object.assign(new Error(`${code} detail`), { code }),
  });
}

describe('brpHealthCheck', () => {
  it('probes the API root with a HEAD, so no BSN is sent', async () => {
    mockFetch.mockResolvedValue({ status: 405 });

    await brpHealthCheck();

    expect(mockFetch).toHaveBeenCalledWith(
      BRP_API_BASE_URL,
      expect.objectContaining({ method: 'HEAD', signal: expect.any(AbortSignal) })
    );
  });

  it('is up on any HTTP answer below 500, including the 405 the mock gives a HEAD', async () => {
    for (const status of [200, 404, 405]) {
      mockFetch.mockResolvedValueOnce({ status });
      const health = await brpHealthCheck();
      expect(health).toEqual({ status: 'up', latency: expect.any(Number) });
    }
  });

  it('is down on a 5xx', async () => {
    mockFetch.mockResolvedValue({ status: 502 });

    expect(await brpHealthCheck()).toEqual({ status: 'down', error: 'HTTP 502' });
  });

  it('is down, naming the TLS error, when the certificate does not match the host', async () => {
    // The 13 November 2026 outage: the mock's proxy served another host's certificate.
    mockFetch.mockRejectedValue(fetchFailed('ERR_TLS_CERT_ALTNAME_INVALID'));

    expect(await brpHealthCheck()).toEqual({
      status: 'down',
      error: 'ERR_TLS_CERT_ALTNAME_INVALID',
    });
  });

  it('is down on an expired certificate, a DNS failure or a timeout', async () => {
    mockFetch.mockRejectedValueOnce(fetchFailed('CERT_HAS_EXPIRED'));
    expect((await brpHealthCheck()).error).toBe('CERT_HAS_EXPIRED');

    mockFetch.mockRejectedValueOnce(fetchFailed('ENOTFOUND'));
    expect((await brpHealthCheck()).error).toBe('ENOTFOUND');

    mockFetch.mockRejectedValueOnce(
      Object.assign(new Error('The operation was aborted due to timeout'), {
        name: 'TimeoutError',
      })
    );
    expect((await brpHealthCheck()).error).toBe('TIMEOUT');
  });
});

describe('transportErrorCode', () => {
  it('prefers the cause code, then the error code, then the message', () => {
    expect(transportErrorCode(fetchFailed('ECONNREFUSED'))).toBe('ECONNREFUSED');
    expect(transportErrorCode({ code: 'ECONNRESET', message: 'socket hang up' })).toBe(
      'ECONNRESET'
    );
    expect(transportErrorCode(new Error('plain'))).toBe('plain');
  });

  it('falls back when there is nothing to name', () => {
    expect(transportErrorCode(undefined)).toBe('Unknown error');
    expect(transportErrorCode('a string')).toBe('Unknown error');
    expect(transportErrorCode({ cause: { code: 42 } })).toBe('Unknown error');
  });
});
