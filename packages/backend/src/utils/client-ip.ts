/**
 * Turning `req.ip` into something that identifies a caller.
 *
 * The rate limiter buckets by whatever its keyGenerator returns, so the key has
 * to name a *client* — not one of that client's TCP connections.
 *
 * On a tier with TRUST_PROXY on, Express takes `req.ip` from X-Forwarded-For,
 * and Azure App Service writes that header as `address:port`. Observed on ACC:
 *
 *   {"message":"Incoming request","ip":"77.161.155.118:52169","path":"/v1/pa/dossiers"}
 *
 * The port is ephemeral, so every new connection produced a new key and a fresh
 * budget. The limit read as "N requests per minute per client" and behaved as
 * "N per connection" — softer by whatever multiple of connections a browser
 * happened to open, which is not a number anyone can reason about. Locally,
 * where TRUST_PROXY is off and `req.ip` is the socket peer with no port, the
 * same config keyed correctly and throttled hard. One setting, two meanings.
 *
 * express-rate-limit ships an `ipKeyGenerator` for this, but not in the version
 * pinned here (7.5.1 exports only `rateLimit` and `MemoryStore`), so this is
 * that job done locally rather than a helper we can import.
 *
 * Not addressed here, and worth a separate decision: an IPv6 client is normally
 * bucketed by its /64 rather than its exact address, because a single subscriber
 * can hold the whole range and rotate freely within it. That is the same defect
 * as the port — an identity the client can change at will — but it needs
 * evidence about real IPv6 traffic before changing how those callers are
 * grouped, and this deployment shows IPv4.
 */

/**
 * Strips a transport port from an address, leaving the host.
 *
 * The IPv4/IPv6 split is decided by counting colons rather than by parsing:
 * an IPv6 address always contains at least two, and a bare IPv6 address cannot
 * carry a port without brackets. So exactly one colon means `IPv4:port`, and
 * anything more means an IPv6 address that should be left alone — which is what
 * keeps `::ffff:10.0.0.5` and `::1` intact instead of being truncated to `:`.
 */
export function normalizeClientIp(ip: string | undefined): string {
  if (!ip) return 'unknown';

  const value = ip.trim();
  if (!value) return 'unknown';

  // Bracketed IPv6, with or without a port: [2001:db8::1]:52169
  if (value.startsWith('[')) {
    const close = value.indexOf(']');
    return close > 1 ? value.slice(1, close) : value;
  }

  const firstColon = value.indexOf(':');
  if (firstColon === -1) return value; // bare IPv4 or a hostname

  // More than one colon: an IPv6 address, which has no port to strip here.
  if (value.indexOf(':', firstColon + 1) !== -1) return value;

  // Exactly one colon: IPv4:port.
  return value.slice(0, firstColon);
}

/**
 * The rate limiter's bucket key.
 *
 * Pass `tenantId` only when per-tenant bucketing is on and the request is
 * authenticated; an unauthenticated request keys on the address alone, exactly
 * as it did before, so anonymous traffic to public routes still shares a bucket
 * per client rather than escaping the limit.
 */
export function rateLimitKey(ip: string | undefined, tenantId?: string): string {
  const host = normalizeClientIp(ip);
  return tenantId ? `${tenantId}:${host}` : host;
}
