import express, { NextFunction, Request, Response } from 'express';
import { jwtMiddleware } from '@auth/jwt.middleware';
import { config } from '@utils/config';
import { operatonService, OperatonService } from '@services/operaton.service';
import { createLogger } from '@utils/logger';
import { auditLog } from '@middleware/audit.middleware';
import { OperatonVariable } from '@ronl/shared';
import { inferType } from '@utils/operaton-variables';
import { RESERVED_PROCESS_VARIABLES } from '@auth/tenant-access';

const router = express.Router();
const logger = createLogger('m2m-routes');

// M2M uses the main engine on every tier (#262). OPERATON_M2M_BASE_URL still
// overrides that, for an engine set aside on purpose, but nothing sets it.
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
// Exported so the gate itself can be exercised: with every operation listed, the
// 403 path below is otherwise only reachable by editing this file.
export const M2M_ALLOWED_OPERATIONS: string[] = [
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
// No tenantMiddleware: M2M clients are system actors, not scoped to a single
// organisation. A valid token is not enough to be one, though — every person
// in the realm holds a token for this audience. The caller must be a client on
// M2M_ALLOWED_CLIENTS, identified by the token's `azp` (#237).
//
function requireM2mClient(req: Request, res: Response, next: NextFunction) {
  const azp = req.auth?.azp;
  if (azp && config.operaton.m2mAllowedClients.includes(azp)) return next();

  logger.warn('M2M request from a client not on the allow-list', {
    azp,
    userId: req.user?.userId,
    path: req.path,
  });
  res.status(403).json({
    success: false,
    error: {
      code: 'M2M_CLIENT_NOT_ALLOWED',
      message: 'This API is only available to registered M2M clients.',
    },
  });
}

router.use(jwtMiddleware, requireM2mClient);

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

/**
 * Refuses a body that writes an access label (#261). `municipality` decides
 * every /v1 access check, so writing it places or moves a case between
 * organisations -- and an M2M client, having no organisation of its own, has
 * no reason to. Answers 400 and returns true when it refused.
 */
function refuseReserved(
  req: Request,
  res: Response,
  action: string,
  names: readonly string[],
  variables: Record<string, unknown>,
  details: Record<string, unknown>
): boolean {
  const reserved = Object.keys(variables).filter((key) => names.includes(key));
  if (reserved.length === 0) return false;
  auditLog(req, action, 'failure', { ...details, reason: 'RESERVED_VARIABLE', reserved });
  res.status(400).json({
    success: false,
    error: {
      code: 'RESERVED_VARIABLE',
      message: `Variables set at process start cannot be changed: ${reserved.join(', ')}`,
    },
  });
  return true;
}

/**
 * Refused at start: the deployed tenant is the only legitimate source of the
 * label, and this surface never sets originTenantId. applicantId is allowed --
 * a machine may start a case on a citizen's behalf.
 */
const RESERVED_AT_START = ['municipality', 'originTenantId'] as const;

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
  if (
    refuseReserved(req, res, `process.start.m2m.${key}`, RESERVED_AT_START, variables, {
      processKey: key,
    })
  ) {
    return;
  }

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
 * When the GET spelling of process.history was deprecated (#263), as the RFC
 * 9745 Deprecation header states it: `@` and Unix seconds, 3 October 2026.
 */
export const HISTORY_GET_DEPRECATED = '@1790985600';

/**
 * POST /v1/m2m/process/history
 * Query process instance history. Body is passed through to Operaton unchanged.
 *
 * GET /v1/m2m/process/history -- DEPRECATED alias (#263), kept for one release.
 * A body on GET has no defined meaning, and clients, proxies and generated
 * SDKs drop it; the caller then receives the unfiltered history with no error.
 * NOTE: Must be registered before /process/:id/* to avoid route shadowing.
 */
async function queryHistory(req: Request, res: Response) {
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
}

router.post('/process/history', queryHistory);
router.get('/process/history', (req: Request, res: Response) => {
  res.setHeader('Deprecation', HISTORY_GET_DEPRECATED);
  return queryHistory(req, res);
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
  // All three, exactly as /v1/task/{id}/complete: completion is not where any
  // of them is set.
  if (
    refuseReserved(req, res, 'task.complete.m2m', RESERVED_PROCESS_VARIABLES, variables, {
      taskId: id,
    })
  ) {
    return;
  }

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
