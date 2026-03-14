import express from 'express';
import { jwtMiddleware } from '@auth/jwt.middleware';
import { tenantMiddleware } from '@middleware/tenant.middleware';
import { operatonService } from '@services/operaton.service';
import { createLogger } from '@utils/logger';

const router = express.Router();
const logger = createLogger('rip-routes');

router.use(jwtMiddleware);
router.use(tenantMiddleware);

/**
 * GET /v1/rip/phase1/active
 * List active RipPhase1Process instances for the caseworker's municipality.
 */
router.get('/phase1/active', async (req, res) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
  }
  try {
    const list = await operatonService.getRipPhase1ActiveList(req.user.tenantId);
    res.json({ success: true, data: list });
  } catch (error) {
    logger.error('Failed to list active RIP Phase 1 instances', {
      tenantId: req.user.tenantId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(500).json({
      success: false,
      error: {
        code: 'RIP_LIST_FAILED',
        message: 'Failed to retrieve active RIP Phase 1 instances',
      },
    });
  }
});

/**
 * GET /v1/rip/phase1/:instanceId/documents
 * Fetch all three document templates + current process variables for a RIP Phase 1 instance.
 */
router.get('/phase1/:instanceId/documents', async (req, res) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
  }
  const { instanceId } = req.params;
  try {
    const result = await operatonService.getRipPhase1Documents(instanceId);

    // Tenant isolation
    if (result.variables.municipality && result.variables.municipality !== req.user.tenantId) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Access denied: organisation mismatch' },
      });
    }

    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('Failed to fetch RIP Phase 1 documents', {
      instanceId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(500).json({
      success: false,
      error: {
        code: 'RIP_DOCUMENTS_FAILED',
        message: 'Failed to retrieve RIP Phase 1 documents',
      },
    });
  }
});

/**
 * GET /v1/rip/phase1/completed
 * List completed RipPhase1Process instances for the caseworker's municipality.
 */
router.get('/phase1/completed', async (req, res) => {
  if (!req.user) {
    return res
      .status(401)
      .json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
  }
  try {
    const list = await operatonService.getRipPhase1CompletedList(req.user.tenantId);
    res.json({ success: true, data: list });
  } catch (error) {
    logger.error('Failed to list completed RIP Phase 1 instances', {
      tenantId: req.user.tenantId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res
      .status(500)
      .json({
        success: false,
        error: {
          code: 'RIP_COMPLETED_LIST_FAILED',
          message: 'Failed to retrieve completed RIP Phase 1 instances',
        },
      });
  }
});

export default router;
