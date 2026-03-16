import { Request, Response, NextFunction } from 'express';
import { config } from '@utils/config';
import { createLogger } from '@utils/logger';
import { persistAuditLog } from '@services/audit.service';
import type { AuditLogEntry } from '@/types/audit.types';

export type { AuditLogEntry };

const logger = createLogger('audit-middleware');

const auditQueue: AuditLogEntry[] = [];

export function createAuditLog(entry: Omit<AuditLogEntry, 'timestamp'>): void {
  if (!config.audit.enabled) {
    return;
  }

  const auditEntry: AuditLogEntry = {
    ...entry,
    timestamp: new Date(),
  };

  auditQueue.push(auditEntry);

  logger.info('Audit log', auditEntry as unknown as Record<string, unknown>);

  persistAuditLog(auditEntry).catch(() => {
    // already handled inside persistAuditLog
  });
}

export const auditMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (!config.audit.enabled) {
    return next();
  }

  const startTime = Date.now();

  const originalEnd = res.end;
  const originalJson = res.json;

  let responseBody: unknown;
  let responseSent = false;

  res.json = function (body: unknown) {
    responseBody = body;
    return originalJson.call(this, body);
  };

  res.end = function (...args: unknown[]) {
    if (!responseSent) {
      responseSent = true;

      const duration = Date.now() - startTime;
      const statusCode = res.statusCode;

      if (req.user && req.auth) {
        const action = `${req.method} ${req.path}`;

        // Don't audit the audit log endpoint itself
        if (req.path === '/audit') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return originalEnd.apply(this, args as any);
        }
        const result =
          statusCode >= 200 && statusCode < 400
            ? 'success'
            : statusCode >= 400 && statusCode < 500
              ? 'failure'
              : 'error';

        const pathSegments = req.path.split('/').filter(Boolean);
        let resourceType: string | undefined;
        let resourceId: string | undefined;

        if (pathSegments.length >= 2) {
          resourceType = pathSegments[1];
          if (pathSegments.length >= 3) {
            resourceId = pathSegments[2];
          }
        }

        createAuditLog({
          tenantId: req.auth.tenantId,
          userId: req.auth.userId,
          action,
          resourceType,
          resourceId,
          details: {
            method: req.method,
            path: req.path,
            query: req.query,
            statusCode,
            duration,
          },
          ipAddress: config.audit.includeIp ? req.auth.ipAddress : undefined,
          userAgent: req.auth.userAgent,
          result,
          errorMessage:
            result !== 'success' && responseBody ? extractErrorMessage(responseBody) : undefined,
          requestId: req.auth.requestId,
        });
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return originalEnd.apply(this, args as any);
  };

  next();
};

function extractErrorMessage(body: unknown): string | undefined {
  if (typeof body === 'object' && body !== null) {
    const obj = body as Record<string, unknown>;
    if (obj.error && typeof obj.error === 'object') {
      const error = obj.error as Record<string, unknown>;
      return error.message as string;
    }
  }
  return undefined;
}

export function auditLog(
  req: Request,
  action: string,
  result: 'success' | 'failure' | 'error',
  details?: Record<string, unknown>
): void {
  if (!req.auth) {
    return;
  }

  createAuditLog({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    action,
    details,
    ipAddress: config.audit.includeIp ? req.auth.ipAddress : undefined,
    userAgent: req.auth.userAgent,
    result,
    requestId: req.auth.requestId,
  });
}

export function getAuditLogs(limit: number = 100): AuditLogEntry[] {
  return auditQueue.slice(-limit);
}

export function pruneAuditQueue(): void {
  const maxQueueSize = 1000;
  if (auditQueue.length > maxQueueSize) {
    auditQueue.splice(0, auditQueue.length - maxQueueSize);
    logger.debug('Pruned audit queue', { remaining: auditQueue.length });
  }
}

setInterval(pruneAuditQueue, 60000);

export default auditMiddleware;
