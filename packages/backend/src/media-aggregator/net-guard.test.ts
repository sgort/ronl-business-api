/**
 * net-guard — SSRF guard and body-cap tests.
 * A fake DNS resolver is passed to assertPublicHttpUrl for most cases; node's
 * dns/promises is mocked so the defaultResolver + safeFetch paths run without a
 * real lookup, and axios is mocked so no real network call is made.
 */

jest.mock('axios');
jest.mock('node:dns/promises', () => ({ lookup: jest.fn() }));

import axios from 'axios';
import { lookup } from 'node:dns/promises';
import {
  isPublicIp,
  assertPublicHttpUrl,
  fetchLimited,
  safeFetch,
  UnsafeUrlError,
  ResponseTooLargeError,
} from './net-guard';

const mockGet = axios.get as jest.MockedFunction<typeof axios.get>;
const mockLookup = lookup as unknown as jest.Mock; // overloaded signature — use an untyped mock

// Fake resolver: everything resolves to a known-public address.
const publicResolver = (_host: string) => Promise.resolve(['93.184.216.34']);
const privateResolver = (_host: string) => Promise.resolve(['10.0.0.5']);

beforeEach(() => jest.clearAllMocks());

describe('isPublicIp', () => {
  it.each(['93.184.216.34', '8.8.8.8', '1.1.1.1'])('is true for public IPv4 %s', (ip) => {
    expect(isPublicIp(ip)).toBe(true);
  });

  it.each([
    ['10.0.0.1', '10/8 private'],
    ['127.0.0.1', 'loopback'],
    ['0.0.0.0', 'this host'],
    ['169.254.169.254', 'link-local metadata'],
    ['172.16.5.5', '172.16/12 private'],
    ['192.168.1.1', '192.168/16 private'],
    ['100.64.0.1', 'CGNAT'],
    ['224.0.0.1', 'multicast'],
  ])('is false for %s (%s)', (ip) => {
    expect(isPublicIp(ip)).toBe(false);
  });

  it('unwraps IPv4-mapped IPv6 and applies the IPv4 rules', () => {
    expect(isPublicIp('::ffff:10.0.0.1')).toBe(false);
    expect(isPublicIp('::ffff:93.184.216.34')).toBe(true);
  });

  it.each([
    ['::1', 'loopback'],
    ['::', 'unspecified'],
    ['fe80::1', 'link-local'],
    ['fc00::1', 'unique-local fc'],
    ['fd12::1', 'unique-local fd'],
    ['ff02::1', 'multicast'],
  ])('is false for IPv6 %s (%s)', (ip) => {
    expect(isPublicIp(ip)).toBe(false);
  });

  it('is true for a public IPv6 address', () => {
    expect(isPublicIp('2606:2800:220:1:248:1893:25c8:1946')).toBe(true);
  });
});

describe('assertPublicHttpUrl — rejects', () => {
  it('malformed url', async () => {
    await expect(assertPublicHttpUrl('not a url', publicResolver)).rejects.toThrow(UnsafeUrlError);
  });

  it('non-http scheme (file:)', async () => {
    await expect(assertPublicHttpUrl('file:///etc/passwd', publicResolver)).rejects.toThrow(
      /scheme not allowed/
    );
  });

  it('embedded credentials', async () => {
    await expect(assertPublicHttpUrl('http://user:pw@example.com', publicResolver)).rejects.toThrow(
      /credentials/
    );
  });

  it('a literal non-public IP host', async () => {
    await expect(assertPublicHttpUrl('http://127.0.0.1/x', publicResolver)).rejects.toThrow(
      /non-public ip/
    );
  });

  it('a named host that fails DNS', async () => {
    const failing = () => Promise.reject(new Error('ENOTFOUND'));
    await expect(assertPublicHttpUrl('https://nope.example/x', failing)).rejects.toThrow(
      /dns resolution failed/
    );
  });

  it('a named host that resolves to no addresses', async () => {
    const empty = () => Promise.resolve([]);
    await expect(assertPublicHttpUrl('https://empty.example/x', empty)).rejects.toThrow(
      /no addresses/
    );
  });

  it('a named host that resolves to a private IP', async () => {
    await expect(assertPublicHttpUrl('https://rebind.example/x', privateResolver)).rejects.toThrow(
      /non-public ip/
    );
  });
});

describe('assertPublicHttpUrl — accepts', () => {
  it('a literal public IP host', async () => {
    const url = await assertPublicHttpUrl('http://93.184.216.34/x', publicResolver);
    expect(url.hostname).toBe('93.184.216.34');
  });

  it('a public named host, returning the parsed URL', async () => {
    const url = await assertPublicHttpUrl('https://example.com/feed', publicResolver);
    expect(url.hostname).toBe('example.com');
  });

  it('uses the real defaultResolver (dns.lookup) when none is supplied', async () => {
    mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    const url = await assertPublicHttpUrl('https://example.com/feed');
    expect(url.hostname).toBe('example.com');
    expect(mockLookup).toHaveBeenCalledWith('example.com', { all: true });
  });
});

describe('fetchLimited', () => {
  it('returns the response body as a string', async () => {
    mockGet.mockResolvedValueOnce({ data: '<rss/>' });
    expect(await fetchLimited('https://example.com/feed')).toBe('<rss/>');
  });

  it('coerces a non-string body to a string', async () => {
    mockGet.mockResolvedValueOnce({ data: 12345 });
    expect(await fetchLimited('https://example.com/feed')).toBe('12345');
  });

  it('throws ResponseTooLargeError when axios signals content-length exceeded', async () => {
    const axiosErr = Object.assign(new Error('too big'), {
      code: 'ERR_FR_MAX_CONTENT_LENGTH_EXCEEDED',
    });
    mockGet.mockRejectedValueOnce(axiosErr);
    await expect(fetchLimited('https://example.com/feed', { maxBytes: 100 })).rejects.toThrow(
      ResponseTooLargeError
    );
  });

  it('re-throws any other axios error unchanged', async () => {
    mockGet.mockRejectedValueOnce(new Error('ECONNRESET'));
    await expect(fetchLimited('https://example.com/feed')).rejects.toThrow('ECONNRESET');
  });
});

describe('safeFetch', () => {
  it('validates the URL (via dns.lookup) then fetches the body', async () => {
    mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    mockGet.mockResolvedValueOnce({ data: '<feed/>' });
    expect(await safeFetch('https://example.com/feed')).toBe('<feed/>');
  });

  it('rejects before fetching when the URL is unsafe', async () => {
    await expect(safeFetch('http://127.0.0.1/x')).rejects.toThrow(UnsafeUrlError);
    expect(mockGet).not.toHaveBeenCalled();
  });
});
