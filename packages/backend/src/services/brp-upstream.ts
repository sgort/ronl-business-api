/**
 * The BRP Haal Centraal upstream: where it is, and how to tell whether it can
 * be reached.
 *
 * The upstream is a BRP mock hosted outside Azure. On 13 November 2026 its
 * reverse proxy stopped presenting the certificate for this hostname, so every
 * TLS handshake failed with ERR_TLS_CERT_ALTNAME_INVALID. The citizen timeline
 * went blank on ACC and PROD, and all the API said about it was a bare 500.
 * The probe below puts that state in /v1/health, and brp.routes.ts names it in
 * its error.
 */

export const BRP_API_BASE_URL = 'https://brp-api-mock.open-regels.nl/haalcentraal/api/brp';

export type BrpHealth = { status: 'up' | 'down'; latency?: number; error?: string };

/**
 * The most specific reason a request failed before any HTTP answer came back.
 * fetch() reports every transport failure as "fetch failed" and puts the real
 * one (ERR_TLS_CERT_ALTNAME_INVALID, ENOTFOUND, ECONNREFUSED, ...) on `cause`;
 * axios puts it on `code`. A timeout from AbortSignal.timeout is named too.
 */
export function transportErrorCode(error: unknown): string {
  if (error && typeof error === 'object') {
    const { code, cause, name, message } = error as {
      code?: unknown;
      cause?: unknown;
      name?: unknown;
      message?: unknown;
    };
    if (cause && typeof cause === 'object') {
      const causeCode = (cause as { code?: unknown }).code;
      if (typeof causeCode === 'string') return causeCode;
    }
    if (typeof code === 'string') return code;
    if (name === 'TimeoutError') return 'TIMEOUT';
    if (typeof message === 'string') return message;
  }
  return 'Unknown error';
}

/**
 * HEAD on the API root. The mock answers 405 to a HEAD, which is the point:
 * any HTTP answer below 500 means DNS, TCP and the TLS handshake all worked,
 * and no BSN has to be sent to find that out. Never rejects.
 */
export async function brpHealthCheck(timeoutMs = 5_000): Promise<BrpHealth> {
  const start = Date.now();
  try {
    const response = await fetch(BRP_API_BASE_URL, {
      method: 'HEAD',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status >= 500) {
      return { status: 'down', error: `HTTP ${response.status}` };
    }
    return { status: 'up', latency: Date.now() - start };
  } catch (error) {
    return { status: 'down', error: transportErrorCode(error) };
  }
}
