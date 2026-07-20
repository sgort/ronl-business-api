import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { createLogger } from '@utils/logger';

const logger = createLogger('api-key-middleware');

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Requires a valid `X-API-Key` header, checked against `expectedKey` with a
 * constant-time comparison. A dedicated header rather than `Authorization:
 * Bearer` — that's already claimed by jwtMiddleware elsewhere, and Power
 * Platform's built-in "API Key" connector security type expects its own
 * header/query param anyway.
 */
export function apiKeyMiddleware(expectedKey: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!expectedKey) {
      logger.error('API key middleware invoked with no configured key', { path: req.path });
      return res.status(503).json({
        success: false,
        error: { code: 'API_KEY_NOT_CONFIGURED', message: 'This endpoint is not configured.' },
      });
    }

    const provided = req.header('x-api-key');
    if (!provided || !timingSafeEqual(provided, expectedKey)) {
      logger.warn('Rejected request with missing or invalid X-API-Key', { path: req.path });
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_API_KEY', message: 'Missing or invalid X-API-Key header.' },
      });
    }

    next();
  };
}
