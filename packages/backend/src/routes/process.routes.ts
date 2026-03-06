import axios from 'axios';
import express from 'express';
import { jwtMiddleware, requireAssuranceLevel } from '@auth/jwt.middleware';
import { tenantMiddleware, addTenantToProcessVariables } from '@middleware/tenant.middleware';
import { operatonService } from '@services/operaton.service';
import { createLogger } from '@utils/logger';
import { auditLog } from '@middleware/audit.middleware';
import { OperatonVariable } from '@ronl/shared';

const router = express.Router();
const logger = createLogger('process-routes');

// Apply authentication and tenant isolation to all routes
router.use(jwtMiddleware);
router.use(tenantMiddleware);

/**
 * POST /v1/process/:key/start
 * Start a new process instance
 */
router.post(
  '/:key/start',
  requireAssuranceLevel('midden'), // Minimum DigiD Midden
  addTenantToProcessVariables,
  async (req, res) => {
    const { key } = req.params;
    const { variables = {} } = req.body;

    // Check if user is authenticated
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
    }

    try {
      logger.info('Starting process', {
        processKey: key,
        tenantId: req.user.tenantId,
        userId: req.user.userId,
      });

      // Transform variables to Operaton format
      const operatonVariables: Record<string, OperatonVariable> = {};
      for (const [varKey, value] of Object.entries(variables)) {
        operatonVariables[varKey] = {
          value,
          type: inferType(value),
        };
      }

      // Start process
      const processInstance = await operatonService.startProcess(
        key,
        {
          businessKey: req.body.businessKey,
          variables: operatonVariables,
        },
        req.user.tenantId
      );

      // Audit log
      auditLog(req, `process.start.${key}`, 'success', {
        processInstanceId: processInstance.id,
      });

      res.status(201).json({
        success: true,
        data: {
          processInstanceId: processInstance.id,
          businessKey: processInstance.businessKey,
          status: processInstance.ended
            ? 'ended'
            : processInstance.suspended
              ? 'suspended'
              : 'active',
          startTime: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error('Failed to start process', {
        processKey: key,
        tenantId: req.user.tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      auditLog(req, `process.start.${key}`, 'error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        success: false,
        error: {
          code: 'PROCESS_START_FAILED',
          message: 'Failed to start process',
        },
      });
    }
  }
);

/**
 * GET /v1/process/:id/status
 * Get process instance status
 */
router.get('/:id/status', async (req, res) => {
  const { id } = req.params;

  // Check if user is authenticated
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      },
    });
  }

  try {
    const processInstance = await operatonService.getProcessInstance(id);

    // Verify tenant ownership
    const variables = await operatonService.getProcessVariables(id);
    const processTenant = variables.municipality?.value;

    if (processTenant !== req.user.tenantId) {
      logger.warn('Tenant mismatch on process access', {
        processInstanceId: id,
        userTenant: req.user.tenantId,
        processTenant,
      });

      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied: municipality mismatch',
        },
      });
    }

    res.json({
      success: true,
      data: {
        processInstanceId: processInstance.id,
        definitionId: processInstance.definitionId,
        businessKey: processInstance.businessKey,
        status: processInstance.ended
          ? 'ended'
          : processInstance.suspended
            ? 'suspended'
            : 'active',
        ended: processInstance.ended,
        suspended: processInstance.suspended,
      },
    });
  } catch (error) {
    logger.error('Failed to get process status', {
      processInstanceId: id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(404).json({
      success: false,
      error: {
        code: 'PROCESS_NOT_FOUND',
        message: 'Process instance not found',
      },
    });
  }
});

/**
 * GET /v1/process/:id/variables
 * Get process variables
 */
router.get('/:id/variables', async (req, res) => {
  const { id } = req.params;

  // Check if user is authenticated
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      },
    });
  }

  try {
    const variables = await operatonService.getProcessVariables(id);

    // Verify tenant ownership
    const processTenant = variables.municipality?.value;

    if (processTenant !== req.user.tenantId) {
      logger.warn('Tenant mismatch on process variable access', {
        processInstanceId: id,
        userTenant: req.user.tenantId,
        processTenant,
      });

      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied: municipality mismatch',
        },
      });
    }

    // Extract plain values
    const plainVariables: Record<string, unknown> = {};
    for (const [key, variable] of Object.entries(variables)) {
      plainVariables[key] = variable.value;
    }

    res.json({
      success: true,
      data: plainVariables,
    });
  } catch (error) {
    logger.error('Failed to get process variables', {
      processInstanceId: id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(404).json({
      success: false,
      error: {
        code: 'PROCESS_NOT_FOUND',
        message: 'Process instance not found',
      },
    });
  }
});

/**
 * GET /v1/process/:key/start-form
 * Proxy the deployed start form schema for a process definition.
 * Only Camunda Forms (JSON, schemaVersion 16) are supported.
 * Returns 415 if the deployed form is an embedded HTML form.
 */
router.get('/:key/start-form', async (req, res) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
  }

  const { key } = req.params;

  try {
    const { data, contentType } = await operatonService.getDeployedStartForm(key);

    if (!contentType.includes('application/json')) {
      return res.status(415).json({
        success: false,
        error: {
          code: 'UNSUPPORTED_FORM_TYPE',
          message: `Process '${key}' has an embedded HTML start form. Only Camunda Forms (JSON) are supported.`,
        },
      });
    }

    const schema = JSON.parse(data);
    res.json({ success: true, data: schema });
  } catch (error) {
    logger.error('Failed to fetch start form', {
      processKey: key,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    const status =
      axios.isAxiosError(error) &&
      (error.response?.status === 404 || error.response?.status === 400)
        ? 404
        : 500;
    res.status(status).json({
      success: false,
      error: {
        code: status === 404 ? 'FORM_NOT_FOUND' : 'FORM_FETCH_FAILED',
        message:
          status === 404
            ? `No deployed start form found for process '${key}'`
            : 'Failed to retrieve start form',
      },
    });
  }
});

/**
 * DELETE /v1/process/:id
 * Cancel a process instance
 */
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  // Check if user is authenticated
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      },
    });
  }

  try {
    // Verify tenant ownership first
    const variables = await operatonService.getProcessVariables(id);
    const processTenant = variables.municipality?.value;

    if (processTenant !== req.user.tenantId) {
      logger.warn('Tenant mismatch on process deletion', {
        processInstanceId: id,
        userTenant: req.user.tenantId,
        processTenant,
      });

      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied: municipality mismatch',
        },
      });
    }

    await operatonService.deleteProcessInstance(id, reason);

    auditLog(req, 'process.delete', 'success', {
      processInstanceId: id,
      reason,
    });

    res.json({
      success: true,
      data: {
        message: 'Process instance cancelled',
        processInstanceId: id,
      },
    });
  } catch (error) {
    logger.error('Failed to delete process', {
      processInstanceId: id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    auditLog(req, 'process.delete', 'error', {
      processInstanceId: id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'PROCESS_DELETE_FAILED',
        message: 'Failed to cancel process',
      },
    });
  }
});

/**
 * Infer Operaton type from JavaScript value
 */
function inferType(value: unknown): OperatonVariable['type'] {
  if (value === null || value === undefined) {
    return 'Null';
  }

  switch (typeof value) {
    case 'boolean':
      return 'Boolean';
    case 'number':
      return Number.isInteger(value) ? 'Integer' : 'Double';
    case 'string':
      return 'String';
    case 'object':
      return 'Json';
    default:
      return 'String';
  }
}

/**
 * GET /v1/process/history?applicantId=xxx
 * List historical process instances for a citizen.
 * Accessible by both citizens (own history) and caseworkers (any citizen in their municipality).
 */
router.get('/history', async (req, res) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
  }

  const { applicantId } = req.query;

  if (!applicantId || typeof applicantId !== 'string') {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'applicantId query parameter is required' },
    });
  }

  // Citizens can only request their own history
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const roles: string[] = (req.user as any).roles ?? [];
  const isCaseworker = roles.includes('caseworker');
  if (!isCaseworker && applicantId !== req.user.userId) {
    return res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Citizens may only request their own history' },
    });
  }

  try {
    const instances = await operatonService.getProcessHistory(applicantId, req.user.tenantId);

    auditLog(req, 'process.history', 'success', {
      applicantId,
      tenantId: req.user.tenantId,
      count: (instances as unknown[]).length,
    });

    res.json({ success: true, data: instances });
  } catch (error) {
    logger.error('Failed to get process history', {
      applicantId,
      tenantId: req.user.tenantId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(500).json({
      success: false,
      error: { code: 'PROCESS_HISTORY_FAILED', message: 'Failed to retrieve process history' },
    });
  }
});

/**
 * GET /v1/process/:id/historic-variables
 * Fetch final variable state of a completed process instance from Operaton history.
 * Used to show the citizen their decision after the process ends.
 */
router.get('/:id/historic-variables', async (req, res) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
  }

  const { id } = req.params;

  try {
    const variables = await operatonService.getHistoricVariables(id);

    // Tenant check via municipality variable
    const municipality = variables['municipality'];
    if (municipality && municipality !== req.user.tenantId) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Access denied: municipality mismatch' },
      });
    }

    res.json({ success: true, data: variables });
  } catch (error) {
    logger.error('Failed to get historic variables', {
      processInstanceId: id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(500).json({
      success: false,
      error: {
        code: 'HISTORIC_VARIABLES_FAILED',
        message: 'Failed to retrieve historic variables',
      },
    });
  }
});

export default router;
