import express from 'express';
import type { Response } from 'express';
import { jwtMiddleware } from '@auth/jwt.middleware';
import { tenantMiddleware } from '@middleware/tenant.middleware';
import { operatonService } from '@services/operaton.service';
import { createLogger } from '@utils/logger';
import { RIP_PHASE_KEYS } from '@ronl/shared';
import { parseSwimlane } from '../rip-swimlane/bpmn-swimlane';

const router = express.Router();
const logger = createLogger('rip-routes');

router.use(jwtMiddleware);
router.use(tenantMiddleware);

/** Every RIP phase modelled as BPMN, in ladder order. */
const modelledKeys = () =>
  RIP_PHASE_KEYS.map((p) => p.processDefinitionKey).filter((k): k is string => !!k);

/**
 * Resolve a `:code` path param to its process-definition key, answering on
 * `res` and returning null when it cannot.
 *
 * The two failure modes are deliberately distinct. An unknown code is a
 * client error — a typo or a stale link — and 404s. A known code with no
 * process model yet (R2.3 today) is a state of the world, not a bad request,
 * and 409s with the phase echoed back. Neither returns an empty list: a phase
 * that has no deployed process must not be indistinguishable from a deployed
 * one that happens to have no instances.
 */
function resolvePhaseKey(code: string, res: Response): string | null {
  const phase = RIP_PHASE_KEYS.find((p) => p.code === code);
  if (!phase) {
    res.status(404).json({
      success: false,
      error: { code: 'UNKNOWN_PHASE', message: `Unknown RIP phase '${code}'` },
    });
    return null;
  }
  if (!phase.processDefinitionKey) {
    res.status(409).json({
      success: false,
      error: {
        code: 'PHASE_NOT_MODELLED',
        message: `RIP phase '${code}' has no process model deployed yet`,
      },
    });
    return null;
  }
  return phase.processDefinitionKey;
}

/**
 * GET /v1/rip/phases/:code/active
 * List active instances of one RIP phase for the caseworker's municipality.
 */
router.get('/phases/:code/active', async (req, res) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
  }
  const { code } = req.params;
  const key = resolvePhaseKey(code, res);
  if (!key) return;
  try {
    const list = await operatonService.getRipPhaseActiveList(key, req.user.tenantId);
    res.json({ success: true, data: list });
  } catch (error) {
    logger.error('Failed to list active RIP phase instances', {
      phaseCode: code,
      tenantId: req.user.tenantId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(500).json({
      success: false,
      error: {
        code: 'RIP_LIST_FAILED',
        message: 'Failed to retrieve active RIP phase instances',
      },
    });
  }
});

/**
 * GET /v1/rip/phases/:code/completed
 * List completed instances of one RIP phase for the caseworker's municipality.
 */
router.get('/phases/:code/completed', async (req, res) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
  }
  const { code } = req.params;
  const key = resolvePhaseKey(code, res);
  if (!key) return;
  try {
    const list = await operatonService.getRipPhaseCompletedList(key, req.user.tenantId);
    res.json({ success: true, data: list });
  } catch (error) {
    logger.error('Failed to list completed RIP phase instances', {
      phaseCode: code,
      tenantId: req.user.tenantId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(500).json({
      success: false,
      error: {
        code: 'RIP_COMPLETED_LIST_FAILED',
        message: 'Failed to retrieve completed RIP phase instances',
      },
    });
  }
});

/**
 * GET /v1/rip/phases/:code/model
 * Swimlane model for one RIP phase, derived from its deployed BPMN.
 */
router.get('/phases/:code/model', async (req, res) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
  }
  const code = req.params.code;
  const key = resolvePhaseKey(code, res);
  if (!key) return;
  try {
    const xml = await operatonService.getPhaseBpmnXml(key, req.user.tenantId);
    res.json({ success: true, data: parseSwimlane(xml, code) });
  } catch (error) {
    logger.error('Failed to build RIP phase swimlane model', {
      code,
      tenantId: req.user.tenantId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(500).json({
      success: false,
      error: { code: 'PHASE_MODEL_FAILED', message: 'Failed to build phase process model' },
    });
  }
});

/**
 * GET /v1/rip/phases/deployment-status
 * Which RIP phase process-definition keys are actually deployed on this
 * environment's Operaton instance.
 */
router.get('/phases/deployment-status', async (req, res) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
  }
  try {
    const deployedKeys = await operatonService.getDeployedProcessKeys(
      modelledKeys(),
      req.user.tenantId
    );
    res.json({ success: true, data: { deployedKeys } });
  } catch (error) {
    logger.error('Failed to fetch RIP phase deployment status', {
      tenantId: req.user.tenantId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(500).json({
      success: false,
      error: {
        code: 'DEPLOYMENT_STATUS_FAILED',
        message: 'Failed to retrieve phase deployment status',
      },
    });
  }
});

/**
 * GET /v1/rip/phases/counts
 * WIP + Gereed instance counts per deployed RIP phase process-definition key.
 */
router.get('/phases/counts', async (req, res) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
  }
  try {
    const deployedKeys = await operatonService.getDeployedProcessKeys(
      modelledKeys(),
      req.user.tenantId
    );
    const counts = await operatonService.getPhaseInstanceCounts(deployedKeys, req.user.tenantId);
    res.json({ success: true, data: { counts } });
  } catch (error) {
    logger.error('Failed to fetch RIP phase instance counts', {
      tenantId: req.user.tenantId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(500).json({
      success: false,
      error: {
        code: 'PHASE_COUNTS_FAILED',
        message: 'Failed to retrieve phase instance counts',
      },
    });
  }
});

/**
 * GET /v1/rip/instances/:instanceId/documents
 * Fetch an instance's document templates + current process variables.
 *
 * Keyed by instance rather than by phase: the deployment is resolved from the
 * instance itself, so no phase code is needed and none is asked for.
 */
router.get('/instances/:instanceId/documents', async (req, res) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
  }
  const { instanceId } = req.params;
  try {
    const result = await operatonService.getRipInstanceDocuments(instanceId);

    // Tenant isolation
    if (result.variables.municipality && result.variables.municipality !== req.user.tenantId) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Access denied: organisation mismatch' },
      });
    }

    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('Failed to fetch RIP instance documents', {
      instanceId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(500).json({
      success: false,
      error: {
        code: 'RIP_DOCUMENTS_FAILED',
        message: 'Failed to retrieve RIP instance documents',
      },
    });
  }
});

export default router;
