/**
 * net-guard — SSRF guard and body-cap tests.
 * Uses a fake DNS resolver so no real network calls are made.
 */

jest.mock('axios');

import axios from 'axios';
import {
  assertPublicHttpUrl,
  fetchLimited,
  UnsafeUrlError,
  ResponseTooLargeError,
} from './net-guard';

const mockGet = axios.get as jest.MockedFunction<typeof axios.get>;

// Fake resolver: only example.com is "known public"; anything else fails DNS.
const publicResolver = (_host: string) => Promise.resolve(['93.184.216.34']);

describe('assertPublicHttpUrl — blocked addresses', () => {
  it('throws UnsafeUrlError for loopback 127.0.0.1', async () => {
    await expect(assertPublicHttpUrl('http://127.0.0.1/x', publicResolver)).rejects.toThrow(
      UnsafeUrlError
    );
  });

  it('throws UnsafeUrlError for cloud metadata endpoint 169.254.169.254', async () => {
    await expect(
      assertPublicHttpUrl('http://169.254.169.254/latest/meta-data', publicResolver)
    ).rejects.toThrow(UnsafeUrlError);
  });

  it('throws UnsafeUrlError for private 10.0.0.5', async () => {
    await expect(assertPublicHttpUrl('http://10.0.0.5/x', publicResolver)).rejects.toThrow(
      UnsafeUrlError
    );
  });

  it('throws UnsafeUrlError for file: scheme', async () => {
    await expect(assertPublicHttpUrl('file:///etc/passwd', publicResolver)).rejects.toThrow(
      UnsafeUrlError
    );
  });

  it('throws UnsafeUrlError for embedded credentials', async () => {
    await expect(assertPublicHttpUrl('http://user:pw@example.com', publicResolver)).rejects.toThrow(
      UnsafeUrlError
    );
  });
});

describe('assertPublicHttpUrl — allowed addresses', () => {
  it('passes a public named host and returns the parsed URL', async () => {
    const url = await assertPublicHttpUrl('https://example.com/feed', publicResolver);
    expect(url.hostname).toBe('example.com');
  });
});

describe('fetchLimited', () => {
  afterEach(() => jest.clearAllMocks());

  it('throws ResponseTooLargeError when axios signals content-length exceeded', async () => {
    const axiosErr = Object.assign(new Error('max content length exceeded'), {
      code: 'ERR_FR_MAX_CONTENT_LENGTH_EXCEEDED',
    });
    mockGet.mockRejectedValueOnce(axiosErr);
    await expect(fetchLimited('https://example.com/feed', { maxBytes: 100 })).rejects.toThrow(
      ResponseTooLargeError
    );
  });

  it('returns the response body as a string for a normal response', async () => {
    mockGet.mockResolvedValueOnce({ data: '<rss/>' });
    expect(await fetchLimited('https://example.com/feed')).toBe('<rss/>');
  });
});
