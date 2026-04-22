import express from 'express';
import { jwtMiddleware } from '@auth/jwt.middleware';
import { tenantMiddleware } from '@middleware/tenant.middleware';
import { operatonService } from '@services/operaton.service';
import { createLogger } from '@utils/logger';

const router = express.Router();
const logger = createLogger('capacity-routes');

router.use(jwtMiddleware);
router.use(tenantMiddleware);

/**
 * GET /v1/hr-capacity/active
 * List active ManagementCapacityClaimProcess instances for the caseworker's tenant.
 * Enriched with jobTitle, requestType, boardDecision, advisoryGroup (may be '—' if not yet set).
 */
router.get('/active', async (req, res) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
  }
  try {
    const list = await operatonService.getCapacityClaimActiveList(req.user.tenantId);
    res.json({ success: true, data: list });
  } catch (error) {
    logger.error('Failed to list active capacity claims', {
      tenantId: req.user.tenantId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(500).json({
      success: false,
      error: {
        code: 'CAPACITY_CLAIM_LIST_FAILED',
        message: 'Failed to retrieve active capacity claims',
      },
    });
  }
});

/**
 * GET /v1/hr-capacity/completed
 * List completed ManagementCapacityClaimProcess instances for the caseworker's tenant.
 */
router.get('/completed', async (req, res) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
  }
  try {
    const list = await operatonService.getCapacityClaimCompletedList(req.user.tenantId);
    res.json({ success: true, data: list });
  } catch (error) {
    logger.error('Failed to list completed capacity claims', {
      tenantId: req.user.tenantId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(500).json({
      success: false,
      error: {
        code: 'CAPACITY_CLAIM_COMPLETED_LIST_FAILED',
        message: 'Failed to retrieve completed capacity claims',
      },
    });
  }
});

/**
 * GET /v1/hr-capacity/:instanceId/documents
 * Fetch both document templates (board-decision-notification, capacity-claim-handover)
 * plus current process variables for a ManagementCapacityClaimProcess instance.
 * Either template may be null if not present in the deployment bundle.
 */
router.get('/:instanceId/documents', async (req, res) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
  }
  const { instanceId } = req.params;
  try {
    const result = await operatonService.getCapacityClaimDocuments(instanceId);

    // Tenant isolation
    if (result.variables.municipality && result.variables.municipality !== req.user.tenantId) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Access denied: organisation mismatch' },
      });
    }

    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('Failed to fetch capacity claim documents', {
      instanceId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(500).json({
      success: false,
      error: {
        code: 'CAPACITY_CLAIM_DOCUMENTS_FAILED',
        message: 'Failed to retrieve capacity claim documents',
      },
    });
  }
});

export default router;
