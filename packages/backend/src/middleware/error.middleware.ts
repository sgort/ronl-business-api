// packages/backend/src/middleware/error.middleware.ts
//
// The app-wide answers that no route gives itself: an unknown path, an error
// no handler caught, a body the parser could not read, and the rate limit.
// All four answer RFC 9457 problem details (#216). They lived inline in
// index.ts, which no test loads; here they can be exercised.

import type { NextFunction, Request, Response } from 'express';

import { config } from '@utils/config';
import { createLogger } from '@utils/logger';
import { sendProblem } from '@utils/problem';

const logger = createLogger('error-middleware');

/** What body-parser (and raw-body under it) attaches to the errors it throws. */
interface BodyParserError extends Error {
  type?: string;
  status?: number;
  statusCode?: number;
}

/**
 * The error types body-parser documents. Matched on `type` rather than on
 * `status` alone, so an arbitrary thrown error carrying a `status` property
 * cannot choose its own response status here.
 */
const BODY_PARSER_ERROR_TYPES = new Set([
  'entity.parse.failed',
  'entity.too.large',
  'charset.unsupported',
  'encoding.unsupported',
  'request.aborted',
  'request.size.invalid',
  'parameters.too.many',
  'querystring.parse.rangeError',
]);

/** 404 for a path no router answered. */
export function notFoundHandler(req: Request, res: Response): void {
  logger.warn('Route not found', { method: req.method, path: req.path });
  sendProblem(res, req, {
    status: 404,
    code: 'NOT_FOUND',
    detail: 'Endpoint not found',
  });
}

/**
 * The last handler. A body the parser refused is the client's fault and gets
 * its own 4xx -- until #216 it fell through to the 500 below, so a malformed
 * JSON body read as a server failure. Anything else is a 500, its message
 * hidden in production.
 */
export function errorHandler(
  err: BodyParserError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err.type && BODY_PARSER_ERROR_TYPES.has(err.type)) {
    logger.warn('Request body refused', { type: err.type, path: req.path });
    if (err.type === 'entity.parse.failed') {
      sendProblem(res, req, {
        status: 400,
        code: 'MALFORMED_BODY',
        detail: 'The request body could not be parsed.',
      });
    } else if (err.type === 'entity.too.large') {
      sendProblem(res, req, {
        status: 413,
        code: 'PAYLOAD_TOO_LARGE',
        detail: 'The request body exceeds the size limit.',
      });
    } else {
      // The rare ones keep the status body-parser chose for them (400, 413 or
      // 415), always a client error.
      const status = err.status ?? err.statusCode ?? 400;
      sendProblem(res, req, { status, code: 'INVALID_BODY', detail: err.message });
    }
    return;
  }

  logger.error('Unhandled error', { error: err.message, stack: err.stack, path: req.path });
  sendProblem(res, req, {
    status: 500,
    code: 'INTERNAL_ERROR',
    detail: config.nodeEnv === 'production' ? 'Internal server error' : err.message,
  });
}

/** express-rate-limit's `handler`: the 429, as problem details. */
export function rateLimitHandler(req: Request, res: Response): void {
  sendProblem(res, req, {
    status: 429,
    code: 'RATE_LIMIT_EXCEEDED',
    detail: 'Too many requests, please try again later',
  });
}
