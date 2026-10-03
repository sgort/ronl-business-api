/**
 * Since #216 the backend answers every 4xx/5xx with RFC 9457 problem details
 * (`application/problem+json`: `status`, `title`, `detail`, ...) instead of
 * the `{ success: false, error: { message } }` envelope. Kept local rather
 * than imported from the frontend package: public-site builds on its own.
 *
 * Returns a problem's `detail`, else a legacy envelope's `error.message`,
 * else `fallback`.
 */
export function problemMessage(body: unknown, fallback: string): string {
  if (typeof body !== 'object' || body === null) return fallback;
  const b = body as { status?: unknown; title?: unknown; detail?: unknown; error?: unknown };
  if (typeof b.status === 'number' && typeof b.title === 'string') {
    if (typeof b.detail === 'string' && b.detail) return b.detail;
  }
  if (typeof b.error === 'object' && b.error !== null) {
    const message = (b.error as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }
  return fallback;
}
