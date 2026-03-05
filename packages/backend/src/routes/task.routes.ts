import axios from 'axios';
import express from 'express';
import { jwtMiddleware } from '@auth/jwt.middleware';
import { tenantMiddleware } from '@middleware/tenant.middleware';
import { operatonService } from '@services/operaton.service';
import { createLogger } from '@utils/logger';
import { auditLog } from '@middleware/audit.middleware';
import { OperatonVariable } from '@ronl/shared';

const router = express.Router();
const logger = createLogger('task-routes');

// All task routes require authentication and tenant context
router.use(jwtMiddleware);
router.use(tenantMiddleware);

/**
 * GET /v1/task
 * List open tasks for the authenticated caseworker's municipality.
 * Caseworkers see all unassigned tasks for their tenant.
 */
router.get('/', async (req, res) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
  }

  try {
    const tasks = await operatonService.getUserTasks(req.user.userId, req.user.tenantId);

    auditLog(req, 'task.list', 'success', { tenantId: req.user.tenantId, count: tasks.length });

    res.json({ success: true, data: tasks });
  } catch (error) {
    logger.error('Failed to list tasks', {
      tenantId: req.user.tenantId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(500).json({
      success: false,
      error: { code: 'TASK_LIST_FAILED', message: 'Failed to retrieve tasks' },
    });
  }
});

/**
 * GET /v1/task/:id
 * Get a single task by ID.
 */
router.get('/:id', async (req, res) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
  }

  const { id } = req.params;

  try {
    const task = await operatonService.getTask(id);

    // Tenant check via task's tenantId claim from Operaton
    if (task.tenantId && task.tenantId !== req.user.tenantId) {
      logger.warn('Tenant mismatch on task access', {
        taskId: id,
        userTenant: req.user.tenantId,
        taskTenant: task.tenantId,
      });
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Access denied: municipality mismatch' },
      });
    }

    res.json({ success: true, data: task });
  } catch (error) {
    logger.error('Failed to get task', {
      taskId: id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(404).json({
      success: false,
      error: { code: 'TASK_NOT_FOUND', message: 'Task not found' },
    });
  }
});

/**
 * GET /v1/task/:id/variables
 * Get all variables of a task's process instance.
 * Used to populate the caseworker task detail form.
 */
router.get('/:id/variables', async (req, res) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
  }

  const { id } = req.params;

  try {
    const task = await operatonService.getTask(id);

    if (task.tenantId && task.tenantId !== req.user.tenantId) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Access denied: municipality mismatch' },
      });
    }

    const variables = await operatonService.getProcessVariables(task.processInstanceId);

    // Return plain values
    const plainVariables: Record<string, unknown> = {};
    for (const [key, variable] of Object.entries(variables)) {
      plainVariables[key] = (variable as OperatonVariable).value;
    }

    res.json({ success: true, data: plainVariables });
  } catch (error) {
    logger.error('Failed to get task variables', {
      taskId: id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(500).json({
      success: false,
      error: { code: 'TASK_VARIABLES_FAILED', message: 'Failed to retrieve task variables' },
    });
  }
});

/**
 * GET /v1/task/:id/form-schema
 * Proxy the deployed task form schema for a user task.
 * Only Camunda Forms (JSON, schemaVersion 16) are supported.
 * Returns 415 if the deployed form is an embedded HTML form.
 *
 * Note: named /form-schema (not /form) because GET /task/:id/form is already
 * taken by Operaton's own "Get Form Key" meaning — returning only { key, contextPath }.
 */
router.get('/:id/form-schema', async (req, res) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
  }

  const { id } = req.params;

  try {
    const task = await operatonService.getTask(id);

    if (task.tenantId && task.tenantId !== req.user.tenantId) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Access denied: municipality mismatch' },
      });
    }

    const { data, contentType } = await operatonService.getDeployedTaskForm(id);

    if (!contentType.includes('application/json')) {
      return res.status(415).json({
        success: false,
        error: {
          code: 'UNSUPPORTED_FORM_TYPE',
          message: `Task '${id}' has an embedded HTML form. Only Camunda Forms (JSON) are supported.`,
        },
      });
    }

    const schema = JSON.parse(data);
    res.json({ success: true, data: schema });
  } catch (error) {
    logger.error('Failed to fetch task form schema', {
      taskId: id,
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
            ? `No deployed form found for task '${id}'`
            : 'Failed to retrieve task form schema',
      },
    });
  }
});

/**
 * POST /v1/task/:id/claim
 * Claim a task for the authenticated caseworker.
 */
router.post('/:id/claim', async (req, res) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
  }

  const { id } = req.params;

  try {
    const task = await operatonService.getTask(id);

    if (task.tenantId && task.tenantId !== req.user.tenantId) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Access denied: municipality mismatch' },
      });
    }

    await operatonService.claimTask(id, req.user.userId);

    auditLog(req, 'task.claim', 'success', { taskId: id, userId: req.user.userId });

    res.json({ success: true, data: { taskId: id, assignee: req.user.userId } });
  } catch (error) {
    logger.error('Failed to claim task', {
      taskId: id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(500).json({
      success: false,
      error: { code: 'TASK_CLAIM_FAILED', message: 'Failed to claim task' },
    });
  }
});

/**
 * POST /v1/task/:id/complete
 * Complete a task with the caseworker's submitted variables.
 */
router.post('/:id/complete', async (req, res) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
  }

  const { id } = req.params;
  const { variables = {} } = req.body;

  try {
    const task = await operatonService.getTask(id);

    if (task.tenantId && task.tenantId !== req.user.tenantId) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Access denied: municipality mismatch' },
      });
    }

    // Transform plain values to Operaton variable format
    const operatonVariables: Record<string, OperatonVariable> = {};
    for (const [key, value] of Object.entries(variables)) {
      operatonVariables[key] = { value, type: inferType(value) };
    }

    await operatonService.completeTask(id, { variables: operatonVariables });

    auditLog(req, 'task.complete', 'success', { taskId: id, userId: req.user.userId });

    res.json({ success: true, data: { taskId: id, status: 'completed' } });
  } catch (error) {
    logger.error('Failed to complete task', {
      taskId: id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(500).json({
      success: false,
      error: { code: 'TASK_COMPLETE_FAILED', message: 'Failed to complete task' },
    });
  }
});

function inferType(value: unknown): OperatonVariable['type'] {
  if (value === null || value === undefined) return 'Null';
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

export default router;
