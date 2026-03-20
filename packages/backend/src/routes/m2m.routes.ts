import express, { Request, Response } from 'express';
import { jwtMiddleware } from '@auth/jwt.middleware';
import { config } from '@utils/config';
import { operatonService, OperatonService } from '@services/operaton.service';
import { createLogger } from '@utils/logger';
import { auditLog } from '@middleware/audit.middleware';
import { OperatonVariable } from '@ronl/shared';

const router = express.Router();
const logger = createLogger('m2m-routes');

// Use a dedicated Operaton instance for M2M if OPERATON_M2M_BASE_URL is set,
// otherwise fall back to the shared default instance.
const m2mOperatonService = config.operaton.m2mBaseUrl
  ? new OperatonService(
      config.operaton.m2mBaseUrl,
      config.operaton.m2mUsername,
      config.operaton.m2mPassword
    )
  : operatonService;

// ─── Curation gate ────────────────────────────────────────────────────────────
//
// Comment out any entry to disable that operation for M2M clients.
// A disabled operation returns 403 OPERATION_NOT_PERMITTED.
// No other code changes required.
//
const M2M_ALLOWED_OPERATIONS: readonly string[] = [
  // Process
  'process.list',
  'process.start',
  'process.status',
  'process.variables',
  'process.historic-variables',
  'process.history',
  'process.decision-document',
  'process.start-form',
  'process.variable-hints',
  'process.delete',
  // Task
  'task.list',
  'task.get',
  'task.variables',
  'task.form-schema',
  'task.claim',
  'task.complete',
  // Decision
  'decision.evaluate',
  'decision.get',
];

function isAllowed(op: string): boolean {
  return M2M_ALLOWED_OPERATIONS.includes(op);
}

function notAllowed(res: Response): void {
  res.status(403).json({
    success: false,
    error: {
      code: 'OPERATION_NOT_PERMITTED',
      message: 'This operation is not available on the M2M API.',
    },
  });
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
//
// jwtMiddleware only — no tenantMiddleware. M2M clients are system actors,
// not scoped to a single organisation.
//
router.use(jwtMiddleware);

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function toOperatonVariables(input: Record<string, unknown>): Record<string, OperatonVariable> {
  const result: Record<string, OperatonVariable> = {};
  for (const [k, v] of Object.entries(input)) {
    result[k] =
      typeof v === 'object' && v !== null && 'value' in v && 'type' in v
        ? (v as OperatonVariable)
        : { value: v, type: inferType(v) };
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROCESS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /v1/m2m/process
 * List active process instances. No tenant filter — returns all instances.
 */
router.get('/process', async (req: Request, res: Response) => {
  if (!isAllowed('process.list')) return notAllowed(res);
  try {
    const data = await m2mOperatonService.listProcessInstances(
      req.query as Record<string, unknown>
    );
    auditLog(req, 'process.list.m2m', 'success', {});
    res.json({ success: true, data });
  } catch (error) {
    logger.error('m2m process.list failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      error: { code: 'PROCESS_LIST_FAILED', message: 'Failed to list process instances' },
    });
  }
});

/**
 * POST /v1/m2m/process/:key/start
 * Start a process instance by definition key.
 */
router.post('/process/:key/start', async (req: Request, res: Response) => {
  if (!isAllowed('process.start')) return notAllowed(res);
  const { key } = req.params;
  const { variables = {}, businessKey } = req.body;

  try {
    const instance = await m2mOperatonService.startProcess(
      key,
      { variables: toOperatonVariables(variables), businessKey },
      'm2m'
    );
    auditLog(req, `process.start.m2m.${key}`, 'success', { processInstanceId: instance.id });
    res.json({
      success: true,
      data: { processInstanceId: instance.id, businessKey: instance.businessKey },
    });
  } catch (error) {
    logger.error('m2m process.start failed', {
      processKey: key,
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      error: { code: 'PROCESS_START_FAILED', message: 'Failed to start process' },
    });
  }
});

/**
 * GET /v1/m2m/process/history
 * Query process instance history. Body is passed through to Operaton unchanged.
 * NOTE: Must be registered before /process/:id/* to avoid route shadowing.
 */
router.get('/process/history', async (req: Request, res: Response) => {
  if (!isAllowed('process.history')) return notAllowed(res);
  try {
    const data = await m2mOperatonService.queryProcessHistory(req.body ?? {});
    res.json({ success: true, data });
  } catch (error) {
    logger.error('m2m process.history failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      error: { code: 'PROCESS_HISTORY_FAILED', message: 'Failed to retrieve process history' },
    });
  }
});

/**
 * GET /v1/m2m/process/:id/status
 */
router.get('/process/:id/status', async (req: Request, res: Response) => {
  if (!isAllowed('process.status')) return notAllowed(res);
  const { id } = req.params;
  try {
    const instance = await m2mOperatonService.getProcessInstance(id);
    res.json({
      success: true,
      data: {
        processInstanceId: instance.id,
        definitionId: instance.definitionId,
        businessKey: instance.businessKey,
        status: instance.ended ? 'ended' : instance.suspended ? 'suspended' : 'active',
        ended: instance.ended,
        suspended: instance.suspended,
      },
    });
  } catch (error) {
    logger.error('m2m process.status failed', {
      id,
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(404).json({
      success: false,
      error: { code: 'PROCESS_NOT_FOUND', message: 'Process instance not found' },
    });
  }
});

/**
 * GET /v1/m2m/process/:id/variables
 */
router.get('/process/:id/variables', async (req: Request, res: Response) => {
  if (!isAllowed('process.variables')) return notAllowed(res);
  const { id } = req.params;
  try {
    const variables = await m2mOperatonService.getProcessVariables(id);
    const plain: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(variables)) plain[k] = v.value;
    res.json({ success: true, data: plain });
  } catch (error) {
    logger.error('m2m process.variables failed', {
      id,
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(404).json({
      success: false,
      error: { code: 'PROCESS_NOT_FOUND', message: 'Process instance not found' },
    });
  }
});

/**
 * GET /v1/m2m/process/:id/historic-variables
 */
router.get('/process/:id/historic-variables', async (req: Request, res: Response) => {
  if (!isAllowed('process.historic-variables')) return notAllowed(res);
  const { id } = req.params;
  try {
    const variables = await m2mOperatonService.getHistoricVariables(id);
    res.json({ success: true, data: variables });
  } catch (error) {
    logger.error('m2m process.historic-variables failed', {
      id,
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(404).json({
      success: false,
      error: { code: 'PROCESS_NOT_FOUND', message: 'Process instance not found' },
    });
  }
});

/**
 * GET /v1/m2m/process/:id/decision-document
 */
router.get('/process/:id/decision-document', async (req: Request, res: Response) => {
  if (!isAllowed('process.decision-document')) return notAllowed(res);
  const { id } = req.params;
  try {
    const template = await m2mOperatonService.getDecisionDocument(id);
    res.json({ success: true, template });
  } catch (error) {
    logger.error('m2m process.decision-document failed', {
      id,
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(404).json({
      success: false,
      error: { code: 'DOCUMENT_NOT_FOUND', message: 'Decision document not found' },
    });
  }
});

/**
 * GET /v1/m2m/process/:key/start-form
 */
router.get('/process/:key/start-form', async (req: Request, res: Response) => {
  if (!isAllowed('process.start-form')) return notAllowed(res);
  const { key } = req.params;
  try {
    const { data, contentType } = await m2mOperatonService.getDeployedStartForm(key);
    if (!contentType.includes('application/json')) {
      return res.status(415).json({
        success: false,
        error: {
          code: 'UNSUPPORTED_FORM_TYPE',
          message: 'Only Camunda Forms (JSON) are supported',
        },
      });
    }
    res.json({ success: true, data: JSON.parse(data) });
  } catch (error) {
    logger.error('m2m process.start-form failed', {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
    res
      .status(404)
      .json({ success: false, error: { code: 'FORM_NOT_FOUND', message: 'Start form not found' } });
  }
});

/**
 * GET /v1/m2m/process/:key/variable-hints
 */
router.get('/process/:key/variable-hints', async (req: Request, res: Response) => {
  if (!isAllowed('process.variable-hints')) return notAllowed(res);
  const { key } = req.params;
  try {
    const variables = await m2mOperatonService.getVariableHints(key);
    res.json({ success: true, variables });
  } catch (error) {
    logger.error('m2m process.variable-hints failed', {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      error: { code: 'VARIABLE_HINTS_FAILED', message: 'Failed to retrieve variable hints' },
    });
  }
});

/**
 * DELETE /v1/m2m/process/:id
 */
router.delete('/process/:id', async (req: Request, res: Response) => {
  if (!isAllowed('process.delete')) return notAllowed(res);
  const { id } = req.params;
  const { reason } = req.body;
  try {
    await m2mOperatonService.deleteProcessInstance(id, reason);
    auditLog(req, 'process.delete.m2m', 'success', { processInstanceId: id });
    res.json({
      success: true,
      data: { message: 'Process instance cancelled', processInstanceId: id },
    });
  } catch (error) {
    logger.error('m2m process.delete failed', {
      id,
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      error: { code: 'PROCESS_DELETE_FAILED', message: 'Failed to cancel process' },
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// TASK
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /v1/m2m/task
 * List all open tasks. No tenant filter — returns tasks across all organisations.
 */
router.get('/task', async (req: Request, res: Response) => {
  if (!isAllowed('task.list')) return notAllowed(res);
  try {
    const tasks = await m2mOperatonService.getUserTasks();
    res.json({ success: true, data: tasks });
  } catch (error) {
    logger.error('m2m task.list failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      error: { code: 'TASK_LIST_FAILED', message: 'Failed to list tasks' },
    });
  }
});

/**
 * GET /v1/m2m/task/:id
 */
router.get('/task/:id', async (req: Request, res: Response) => {
  if (!isAllowed('task.get')) return notAllowed(res);
  const { id } = req.params;
  try {
    const task = await m2mOperatonService.getTask(id);
    res.json({ success: true, data: task });
  } catch (error) {
    logger.error('m2m task.get failed', {
      id,
      error: error instanceof Error ? error.message : String(error),
    });
    res
      .status(404)
      .json({ success: false, error: { code: 'TASK_NOT_FOUND', message: 'Task not found' } });
  }
});

/**
 * GET /v1/m2m/task/:id/variables
 */
router.get('/task/:id/variables', async (req: Request, res: Response) => {
  if (!isAllowed('task.variables')) return notAllowed(res);
  const { id } = req.params;
  try {
    const variables = await m2mOperatonService.getTaskVariables(id);
    res.json({ success: true, data: variables });
  } catch (error) {
    logger.error('m2m task.variables failed', {
      id,
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      error: { code: 'TASK_VARIABLES_FAILED', message: 'Failed to retrieve task variables' },
    });
  }
});

/**
 * GET /v1/m2m/task/:id/form-schema
 */
router.get('/task/:id/form-schema', async (req: Request, res: Response) => {
  if (!isAllowed('task.form-schema')) return notAllowed(res);
  const { id } = req.params;
  try {
    const { data, contentType } = await m2mOperatonService.getDeployedTaskForm(id);
    if (!contentType.includes('application/json')) {
      return res.status(415).json({
        success: false,
        error: {
          code: 'UNSUPPORTED_FORM_TYPE',
          message: 'Only Camunda Forms (JSON) are supported',
        },
      });
    }
    res.json({ success: true, data: JSON.parse(data) });
  } catch (error) {
    logger.error('m2m task.form-schema failed', {
      id,
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(404).json({
      success: false,
      error: { code: 'FORM_NOT_FOUND', message: 'Form schema not found' },
    });
  }
});

/**
 * POST /v1/m2m/task/:id/claim
 * Body: { "userId": "..." } — optional, falls back to token subject.
 */
router.post('/task/:id/claim', async (req: Request, res: Response) => {
  if (!isAllowed('task.claim')) return notAllowed(res);
  const { id } = req.params;
  const { userId } = req.body;
  try {
    await m2mOperatonService.claimTask(id, userId ?? req.user?.userId);
    auditLog(req, 'task.claim.m2m', 'success', { taskId: id });
    res.json({ success: true, data: { taskId: id, claimed: true } });
  } catch (error) {
    logger.error('m2m task.claim failed', {
      id,
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      error: { code: 'TASK_CLAIM_FAILED', message: 'Failed to claim task' },
    });
  }
});

/**
 * POST /v1/m2m/task/:id/complete
 */
router.post('/task/:id/complete', async (req: Request, res: Response) => {
  if (!isAllowed('task.complete')) return notAllowed(res);
  const { id } = req.params;
  const { variables = {} } = req.body;

  try {
    await m2mOperatonService.completeTask(id, { variables: toOperatonVariables(variables) });
    auditLog(req, 'task.complete.m2m', 'success', { taskId: id });
    res.json({ success: true, data: { taskId: id, completed: true } });
  } catch (error) {
    logger.error('m2m task.complete failed', {
      id,
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      error: { code: 'TASK_COMPLETE_FAILED', message: 'Failed to complete task' },
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// DECISION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /v1/m2m/decision/:key/evaluate
 */
router.post('/decision/:key/evaluate', async (req: Request, res: Response) => {
  if (!isAllowed('decision.evaluate')) return notAllowed(res);
  const { key } = req.params;
  const { variables = {} } = req.body;

  try {
    const result = await m2mOperatonService.evaluateDecision(
      key,
      toOperatonVariables(variables),
      'm2m'
    );
    auditLog(req, `decision.evaluate.m2m.${key}`, 'success', { decisionKey: key });
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('m2m decision.evaluate failed', {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      error: {
        code: 'DECISION_EVALUATION_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
});

/**
 * GET /v1/m2m/decision/:key
 */
router.get('/decision/:key', async (req: Request, res: Response) => {
  if (!isAllowed('decision.get')) return notAllowed(res);
  const { key } = req.params;
  try {
    const data = await m2mOperatonService.getDecisionDefinition(key);
    res.json({ success: true, data });
  } catch (error) {
    logger.error('m2m decision.get failed', {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(404).json({
      success: false,
      error: { code: 'DECISION_NOT_FOUND', message: 'Decision definition not found' },
    });
  }
});

export default router;
