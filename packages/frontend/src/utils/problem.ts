import type { ApiResponse } from '@ronl/shared';

/**
 * Since #216 the backend answers every 4xx/5xx with RFC 9457 problem details
 * (`application/problem+json`) instead of the `{ success: false, error }`
 * envelope. These helpers translate at the boundary, so the components that
 * read `res.error?.code` / `res.error?.message` keep working unchanged.
 */

/**
 * RFC 9457 problem details as the backend serves them. `code`, `details`,
 * `engine` and anything beyond the five RFC members are extension members.
 * `instance` is the RFC member (the request path); the Operaton engine base
 * URL that `ApiError.instance` carries arrives here as `engine`.
 *
 * Defined here rather than in @ronl/shared: only this module reads it, and the
 * frontend resolves @ronl/shared from its build output.
 */
export interface Problem {
  type?: string;
  status: number;
  title: string;
  detail: string;
  instance?: string;
  code?: string;
  details?: string;
  engine?: string;
  [extension: string]: unknown;
}

/** True for an RFC 9457 problem body: numeric `status`, string `title`, a `detail` key. */
export function isProblem(body: unknown): body is Problem {
  if (typeof body !== 'object' || body === null) return false;
  const b = body as Record<string, unknown>;
  return typeof b.status === 'number' && typeof b.title === 'string' && 'detail' in b;
}

/**
 * Rewrites a problem body into the legacy `ApiResponse` shape. The problem's
 * own members are spread first so extension members survive -- the health
 * call reads the report from `data` on a 503. `engine` (the Operaton base URL
 * on process-start failures) goes back to `error.instance`, where the
 * components look for it. Anything that is not a problem passes through.
 */
export function toApiResponse(body: unknown): unknown {
  if (!isProblem(body)) return body;
  const response: ApiResponse & Problem = {
    ...body,
    success: false,
    error: {
      code: body.code ?? 'ERROR',
      message: body.detail,
      details: body.details,
      instance: body.engine,
    },
  };
  return response;
}

/**
 * The human-readable message of an error body, for `fetch` call sites:
 * a problem's `detail`, else a legacy envelope's `error.message`, else `fallback`.
 */
export function problemMessage(body: unknown, fallback: string): string {
  if (isProblem(body) && typeof body.detail === 'string' && body.detail) return body.detail;
  if (typeof body === 'object' && body !== null) {
    const error = (body as { error?: unknown }).error;
    if (typeof error === 'object' && error !== null) {
      const message = (error as { message?: unknown }).message;
      if (typeof message === 'string' && message) return message;
    }
  }
  return fallback;
}
