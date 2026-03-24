import { Router } from 'express';
import { jwtMiddleware } from '@auth/jwt.middleware';
import { requireRoles } from '@auth/jwt.middleware';
import { db } from '@services/audit.service';
import { createLogger } from '@utils/logger';

const router = Router();
const logger = createLogger('admin-routes');

router.use(jwtMiddleware);
router.use(requireRoles('admin'));

/**
 * GET /v1/admin/audit
 * Returns paginated audit log records from the database.
 * Query params: limit (default 50, max 200), offset (default 0)
 */
router.get('/audit', async (req, res) => {
  const limit = Math.min(parseInt(req.query['limit'] as string) || 50, 200);
  const offset = parseInt(req.query['offset'] as string) || 0;

  try {
    const [rows, countResult] = await Promise.all([
      db.any(
        `SELECT
          id, timestamp, tenant_id, user_id, action,
          resource_type, resource_id, details,
          result, error_message, request_id
        FROM audit_logs
        ORDER BY timestamp DESC
        LIMIT $1 OFFSET $2`,
        [limit, offset]
      ),
      db.one('SELECT COUNT(*)::int AS total FROM audit_logs'),
    ]);

    logger.info('Audit log queried', {
      userId: req.auth?.userId,
      tenantId: req.auth?.tenantId,
      limit,
      offset,
      returned: rows.length,
    });

    res.json({
      success: true,
      data: {
        items: rows,
        pagination: {
          limit,
          offset,
          total: countResult.total,
          hasMore: offset + rows.length < countResult.total,
        },
      },
    });
  } catch (error) {
    logger.error('Failed to query audit logs', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      error: { code: 'DB_ERROR', message: 'Auditlog kon niet worden opgehaald.' },
    });
  }
});

export default router;
