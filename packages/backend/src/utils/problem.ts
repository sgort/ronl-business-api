/**
 * RFC 9457 problem details, the one way this API answers an error (#216).
 *
 * Ported from linked-data-explorer's utils/problem.ts (its #131), with one
 * deliberate difference: the title. There a typed map gives each `code` its
 * title; here there are some 150 codes, so the title is DERIVED from the code
 * instead -- `PROCESS_START_FAILED` reads "Process start failed". That keeps
 * the RFC's rule (the same kind of problem always gets the same title) without
 * a second list to keep in step with the first.
 *
 * `type` is `about:blank` unless a caller overrides it: this API has no page
 * per problem kind, and `about:blank` is the RFC's own placeholder for exactly
 * that case (its meaning is "see `title`").
 *
 * `code` survives as an extension member alongside the RFC's own
 * `status`/`title`/`detail`/`instance`. It is the machine-readable identifier
 * existing callers already branch on, and the ADR 2.2.1 ruleset's
 * `nlgov:problem-schema-members` rule allows extra members.
 */

import { STATUS_CODES } from 'http';

import type { Request, Response } from 'express';

export const PROBLEM_CONTENT_TYPE = 'application/problem+json';

export interface ProblemInit {
  /** HTTP status, repeated in the body per RFC 9457. */
  status: number;
  /** What went wrong with *this* request. */
  detail: string;
  /**
   * The machine-readable identifier, UPPER_SNAKE_CASE, kept as an extension
   * member. Selects the title when `title` is omitted.
   */
  code?: string;
  /** A short, stable summary of the *kind* of problem. Rarely needed. */
  title?: string;
  /** Defaults to `about:blank` -- see the module comment. */
  type?: string;
  /**
   * Further extension members (`reserved`, `tenants`, `retryAfter`, ...). They
   * cannot replace the members above: those are written after the extensions,
   * so a stray `status` or `detail` here never changes what the problem says.
   */
  extensions?: Record<string, unknown>;
}

/** The body sendProblem writes; exported for the global handlers and tests. */
export interface Problem {
  type: string;
  status: number;
  title: string;
  detail: string;
  instance: string;
  code?: string;
  [extension: string]: unknown;
}

/** `PROCESS_START_FAILED` -> `Process start failed`. */
export function titleFromCode(code: string): string {
  const words = code.toLowerCase().split('_').filter(Boolean).join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * The problem body, without sending it. For callers that hand a body to
 * something else rather than to `res` -- express-rate-limit's `message`.
 */
export function buildProblem(instance: string, init: ProblemInit): Problem {
  const { status, detail, code, type = 'about:blank', extensions } = init;
  const title =
    init.title ?? (code ? titleFromCode(code) : undefined) ?? STATUS_CODES[status] ?? 'Error';
  return {
    ...extensions,
    type,
    status,
    title,
    detail,
    instance: instance.split('?')[0],
    ...(code !== undefined ? { code } : {}),
  };
}

/**
 * Send an `application/problem+json` response: `type`, `status`, `title`,
 * `detail` and `instance` (the request path), plus `code` and any extensions.
 *
 * This function must never throw. It runs inside error paths -- often the
 * `catch` of an async handler, which Express 4 does not await -- so an
 * exception here would become an unhandled rejection.
 */
export function sendProblem(res: Response, req: Request, init: ProblemInit): void {
  res
    .status(init.status)
    .type(PROBLEM_CONTENT_TYPE)
    .json(buildProblem(req.originalUrl ?? req.url ?? '', init));
}
