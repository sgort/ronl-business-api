// net-guard.ts — SSRF allow-list + size-capped body read.
//
// Standard defensive-fetch helpers for the media-aggregator. Every outbound
// call (feed fetch in ingest.ts, and any future source-page/OG fetch) should
// pass its URL through assertPublicHttpUrl() and read the body through
// fetchLimited() so a hostile or misconfigured URL cannot reach internal hosts
// or exhaust memory.
//
// No new dependency: uses Node's stdlib `dns`/`net` and the `axios` already in
// the backend. If you prefer undici/fetch, the guard function is transport-agnostic.

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { URL } from 'node:url';
import axios, { AxiosRequestConfig } from 'axios';

export class UnsafeUrlError extends Error {}
export class ResponseTooLargeError extends Error {}

/** Default cap for a single feed/page response body. */
export const DEFAULT_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * True when an IP string is globally routable (not private/loopback/etc.).
 * Covers IPv4 + IPv6, including IPv4-mapped IPv6 (::ffff:10.0.0.1) and the
 * cloud metadata address 169.254.169.254 (link-local).
 */
export function isPublicIp(ip: string): boolean {
  const v = ip.toLowerCase().replace(/^::ffff:/, ''); // unwrap IPv4-mapped IPv6

  if (isIP(v) === 4) {
    const [a, b] = v.split('.').map(Number);
    if (a === 10) return false; // 10/8 private
    if (a === 127) return false; // loopback
    if (a === 0) return false; // "this host"
    if (a === 169 && b === 254) return false; // link-local (incl. 169.254.169.254 metadata)
    if (a === 172 && b >= 16 && b <= 31) return false; // 172.16/12 private
    if (a === 192 && b === 168) return false; // 192.168/16 private
    if (a === 100 && b >= 64 && b <= 127) return false; // 100.64/10 CGNAT
    if (a >= 224) return false; // multicast / reserved
    return true;
  }

  // IPv6
  if (v === '::1' || v === '::') return false; // loopback / unspecified
  if (v.startsWith('fe80')) return false; // link-local
  if (v.startsWith('fc') || v.startsWith('fd')) return false; // unique-local fc00::/7
  if (v.startsWith('ff')) return false; // multicast
  return true;
}

/**
 * Reject anything that is not a plain public http(s) URL. Blocks non-http
 * schemes (file:, gopher:, data:), embedded credentials, and hosts that
 * resolve to any non-public address. DNS is resolved here so a public name
 * that points at an internal IP is caught (basic rebinding-at-parse defence).
 *
 * Pass a `resolver` in tests to avoid real DNS.
 */
export async function assertPublicHttpUrl(
  raw: string,
  resolver: (host: string) => Promise<string[]> = defaultResolver
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError(`malformed url: ${raw}`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UnsafeUrlError(`scheme not allowed: ${url.protocol}`);
  }
  if (url.username || url.password) {
    throw new UnsafeUrlError('credentials in url not allowed');
  }
  const host = url.hostname;
  if (!host) throw new UnsafeUrlError('missing host');

  // Literal IP host — check directly.
  if (isIP(host)) {
    if (!isPublicIp(host)) throw new UnsafeUrlError(`non-public ip host: ${host}`);
    return url;
  }

  // Named host — every resolved address must be public.
  let addrs: string[];
  try {
    addrs = await resolver(host);
  } catch {
    throw new UnsafeUrlError(`dns resolution failed: ${host}`);
  }
  if (addrs.length === 0) throw new UnsafeUrlError(`no addresses for host: ${host}`);
  for (const ip of addrs) {
    if (!isPublicIp(ip))
      throw new UnsafeUrlError(`host resolves to non-public ip: ${host} → ${ip}`);
  }
  return url;
}

async function defaultResolver(host: string): Promise<string[]> {
  const rows = await lookup(host, { all: true });
  return rows.map((r) => r.address);
}

/**
 * GET a validated URL and return the body as a string, aborting if it exceeds
 * `maxBytes`. Combine with assertPublicHttpUrl() at the call site.
 */
export async function fetchLimited(
  url: string,
  opts: { maxBytes?: number; timeoutMs?: number; headers?: Record<string, string> } = {}
): Promise<string> {
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const config: AxiosRequestConfig = {
    responseType: 'text',
    timeout: opts.timeoutMs ?? 10_000,
    maxContentLength: maxBytes, // axios aborts past this
    maxBodyLength: maxBytes,
    headers: { 'user-agent': 'ronl-media-aggregator', ...(opts.headers ?? {}) },
    // Never follow a redirect to a fresh host without re-checking it:
    maxRedirects: 0,
  };
  try {
    const res = await axios.get(url, config);
    return typeof res.data === 'string' ? res.data : String(res.data);
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      (err as NodeJS.ErrnoException).code === 'ERR_FR_MAX_CONTENT_LENGTH_EXCEEDED'
    ) {
      throw new ResponseTooLargeError(`response exceeds ${maxBytes} bytes: ${url}`);
    }
    throw err;
  }
}

/**
 * Convenience: validate then fetch. If a feed 3xx-redirects, the caller gets a
 * clear error (maxRedirects:0) and can re-validate the Location before retrying,
 * rather than silently following into a private host.
 */
export async function safeFetch(
  raw: string,
  opts?: Parameters<typeof fetchLimited>[1]
): Promise<string> {
  await assertPublicHttpUrl(raw);
  return fetchLimited(raw, opts);
}
