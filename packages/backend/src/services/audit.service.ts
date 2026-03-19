import pgPromise from 'pg-promise';
import { config } from '@utils/config';
import { createLogger } from '@utils/logger';
import type { AuditLogEntry } from '@/types/audit.types';

const logger = createLogger('audit-service');

const pgp = pgPromise();

export const db = pgp({
  connectionString: config.database.url,
  max: config.database.poolMax,
});

export async function initDb(): Promise<void> {
  try {
    const conn = await db.connect();
    conn.done();
    logger.info('Database connection pool established', {
      poolMin: config.database.poolMin,
      poolMax: config.database.poolMax,
    });
  } catch (error) {
    logger.warn(
      'Database unavailable at startup — audit logs will be in-memory only until reconnect',
      {
        error: error instanceof Error ? error.message : String(error),
      }
    );
  }
}

export async function persistAuditLog(entry: AuditLogEntry & { azp?: string }): Promise<void> {
  try {
    await db.none(
      `INSERT INTO audit_logs (
        timestamp, tenant_id, user_id, action,
        resource_type, resource_id, details,
        ip_address, user_agent, result, error_message, request_id
      ) VALUES (
        $<timestamp>, $<tenantId>, $<userId>, $<action>,
        $<resourceType>, $<resourceId>, $<details:json>,
        $<ipAddress>, $<userAgent>, $<result>, $<errorMessage>, $<requestId>
      )`,
      {
        ...entry,
        tenantId: entry.tenantId ?? entry.azp ?? 'unknown',
      }
    );
  } catch (error) {
    logger.error('Failed to persist audit log to database', {
      error: error instanceof Error ? error.message : String(error),
      tenantId: entry.tenantId,
      userId: entry.userId,
      action: entry.action,
      requestId: entry.requestId,
    });
  }
}
