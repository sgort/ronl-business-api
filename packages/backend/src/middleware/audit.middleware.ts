import { Request, Response, NextFunction } from 'express';
import { config } from '@utils/config';
import { createLogger } from '@utils/logger';

const logger = createLogger('audit-middleware');

export interface AuditLogEntry {
  timestamp: Date;
  tenantId: string;
  userId: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  result: 'success' | 'failure' | 'error';
  errorMessage?: string;
  requestId?: string;
}

// In-memory queue for audit logs (will be replaced with database persistence)
const auditQueue: AuditLogEntry[] = [];

/**
 * Create audit log entry
 */
export function createAuditLog(entry: Omit<AuditLogEntry, 'timestamp'>): void {
  if (!config.audit.enabled) {
    return;
  }

  const auditEntry: AuditLogEntry = {
    ...entry,
    timestamp: new Date(),
  };

  // Add to queue
  auditQueue.push(auditEntry);

  // Log to Winston
  logger.info('Audit log', auditEntry);

  // TODO: Persist to database asynchronously
  // This will be implemented with the audit service
}

/**
 * Audit Logging Middleware
 * Captures API calls for compliance logging
 */
export const auditMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (!config.audit.enabled) {
    return next();
  }

  const startTime = Date.now();

  // Capture original end and json methods
  const originalEnd = res.end;
  const originalJson = res.json;

  let responseBody: unknown;
  let responseSent = false;

  // Override res.json to capture response
  res.json = function (body: unknown) {
    responseBody = body;
    return originalJson.call(this, body);
  };

  // Override res.end to log audit entry
  res.end = function (...args: unknown[]) {
    if (!responseSent) {
      responseSent = true;

      const duration = Date.now() - startTime;
      const statusCode = res.statusCode;

      // Only audit if user is authenticated
      if (req.user && req.auth) {
        const action = `${req.method} ${req.path}`;
        const result =
          statusCode >= 200 && statusCode < 300
            ? 'success'
            : statusCode >= 400 && statusCode < 500
              ? 'failure'
              : 'error';

        // Extract resource information from path
        const pathSegments = req.path.split('/').filter(Boolean);
        let resourceType: string | undefined;
        let resourceId: string | undefined;

        if (pathSegments.length >= 2) {
          resourceType = pathSegments[1]; // e.g., 'process', 'task'
          if (pathSegments.length >= 3) {
            resourceId = pathSegments[2]; // e.g., process key or ID
          }
        }

        // Create audit log
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

    return originalEnd.apply(this, args as [unknown, BufferEncoding?]);
  };

  next();
};

/**
 * Extract error message from response body
 */
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

/**
 * Manual audit log helper for service-level operations
 */
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

/**
 * Get audit logs (for admin access)
 */
export function getAuditLogs(limit: number = 100): AuditLogEntry[] {
  return auditQueue.slice(-limit);
}

/**
 * Clear old audit logs from memory
 * (Database will handle retention based on config.audit.retentionDays)
 */
export function pruneAuditQueue(): void {
  const maxQueueSize = 1000;
  if (auditQueue.length > maxQueueSize) {
    auditQueue.splice(0, auditQueue.length - maxQueueSize);
    logger.debug('Pruned audit queue', { remaining: auditQueue.length });
  }
}

// Prune queue every minute
setInterval(pruneAuditQueue, 60000);

export default auditMiddleware;
