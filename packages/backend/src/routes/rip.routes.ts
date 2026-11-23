import express from 'express';
import type { Request, Response } from 'express';
import { jwtMiddleware } from '@auth/jwt.middleware';
import { tenantMiddleware } from '@middleware/tenant.middleware';
import { denyTenant, tenantAllows } from '@auth/tenant-access';
import { operatonService } from '@services/operaton.service';
import {
  linkDocument,
  listInstanceDocuments,
  listInstanceWorkspace,
  RipDocumentError,
  uploadDocument,
} from '@services/rip-documents/rip-documents.service';
import { auditLog } from '@middleware/audit.middleware';
import { config } from '@utils/config';
import { createLogger } from '@utils/logger';
import { sendProblem } from '@utils/problem';
import { RIP_PHASE_KEYS } from '@ronl/shared';
import { edocsAccess, edocsOf, requireEdocsPrincipal, sendEdocsError } from './edocs.access';

const router = express.Router();
const logger = createLogger('rip-routes');

router.use(jwtMiddleware);
router.use(tenantMiddleware);

/**
 * Every RIP phase's process-definition key, in ladder order.
 *
 * No filter since #85: `processDefinitionKey` is required on `RipPhaseKey`, so
 * every entry has one. This used to drop the unmodelled phases, of which there
 * have been none since R5.3 completed the ladder (#72).
 */
const modelledKeys = () => RIP_PHASE_KEYS.map((p) => p.processDefinitionKey);

/**
 * Resolve a `:code` path param to its process-definition key, answering on
 * `res` and returning null when it cannot.
 *
 * One failure mode, not two. An unknown code is a client error — a typo or a
 * stale link — and 404s.
 *
 * There used to be a second: a known code with no process model yet answered
 * 409 PHASE_NOT_MODELLED, so that a caller could tell "this phase has no
 * process" from "this phase is deployed and currently idle". R5.3 completed the
 * ladder (#72) and `processDefinitionKey` became required on `RipPhaseKey`
 * (#85), which makes that state unrepresentable rather than merely absent — the
 * compiler rejects an entry without a key, so no input can reach the branch.
 * Its three tests had been skipping since the ladder closed; they were deleted
 * with it rather than left limping.
 */
function resolvePhaseKey(code: string, req: Request, res: Response): string | null {
  const phase = RIP_PHASE_KEYS.find((p) => p.code === code);
  if (!phase) {
    sendProblem(res, req, {
      status: 404,
      code: 'UNKNOWN_PHASE',
      detail: `Unknown RIP phase '${code}'`,
    });
    return null;
  }
  return phase.processDefinitionKey;
}

/**
 * GET /v1/rip/phases/active
 * Active instances of EVERY modelled RIP phase in one response, each row
 * tagged with the phase code it belongs to -- the aggregate the Infra-board
 * needs so `useRipActiveAcrossPhases()` can collapse its twelve per-phase
 * requests into one. Registered ahead of `/phases/:code/active` below, on the
 * same "literal before parameterised" principle as `/phases/deployment-status`
 * and `/phases/counts` further down -- though this pair cannot actually
 * collide: `/phases/active` is two path segments, `/phases/:code/active` is
 * three, so Express's own routing already keeps them apart (see the "not
 * swallowed" test in rip.routes.test.ts, which pins this for all four).
 *
 * One phase failing must not blank the rest: each modelled phase is fetched
 * independently via Promise.allSettled, a rejection is logged and that
 * phase's rows are simply omitted, and the response still succeeds as long
 * as at least one phase came back. Only a total failure (every modelled
 * phase rejected) answers 500 -- mirroring the frontend's own
 * fetchActiveAcrossPhases, which today does the fan-out and per-request
 * catch itself (infra.api.ts) and reports success iff at least one phase
 * succeeded.
 */
function phaseAggregate(state: 'active' | 'completed') {
  const list =
    state === 'active'
      ? (key: string, tenantId: string) => operatonService.getRipPhaseActiveList(key, tenantId)
      : (key: string, tenantId: string) => operatonService.getRipPhaseCompletedList(key, tenantId);
  const failCode =
    state === 'active' ? 'RIP_ACTIVE_AGGREGATE_FAILED' : 'RIP_COMPLETED_AGGREGATE_FAILED';
  return async (req: Request, res: Response) => {
    if (!req.user) {
      return sendProblem(res, req, {
        status: 401,
        code: 'UNAUTHORIZED',
        detail: 'Authentication required',
      });
    }
    const tenantId = req.user.tenantId;
    // No filter since #85 — every phase carries a process-definition key, so the
    // type predicate that used to narrow this list has nothing left to narrow.
    const settled = await Promise.allSettled(
      RIP_PHASE_KEYS.map((p) => list(p.processDefinitionKey, tenantId))
    );
    const rows: Array<Record<string, unknown> & { phaseCode: string }> = [];
    let anySucceeded = false;
    settled.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        anySucceeded = true;
        for (const instance of result.value) {
          rows.push({ ...instance, phaseCode: RIP_PHASE_KEYS[i].code });
        }
      } else {
        logger.error(`Failed to list ${state} RIP phase instances for the aggregate`, {
          phaseCode: RIP_PHASE_KEYS[i].code,
          tenantId,
          error:
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason ?? 'Unknown error'),
        });
      }
    });
    if (!anySucceeded) {
      return sendProblem(res, req, {
        status: 500,
        code: failCode,
        detail: `Failed to retrieve ${state} RIP phase instances for any modelled phase`,
      });
    }
    res.json({ success: true, data: rows });
  };
}

router.get('/phases/active', phaseAggregate('active'));

/**
 * GET /v1/rip/phases/completed
 * Completed instances of EVERY modelled RIP phase, tagged with their phase
 * code -- the same aggregate as /phases/active above, with the same
 * one-phase-failing-does-not-blank-the-rest rule. The portfolio needs it to
 * show a project that has finished a phase while the next one has not been
 * started: such a project has no running instance at all, so /phases/active
 * alone drops it.
 */
router.get('/phases/completed', phaseAggregate('completed'));

/**
 * GET /v1/rip/phases/:code/active
 * List active instances of one RIP phase for the caseworker's municipality.
 */
router.get('/phases/:code/active', async (req, res) => {
  if (!req.user) {
    return sendProblem(res, req, {
      status: 401,
      code: 'UNAUTHORIZED',
      detail: 'Authentication required',
    });
  }
  const { code } = req.params;
  const key = resolvePhaseKey(code, req, res);
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
    sendProblem(res, req, {
      status: 500,
      code: 'RIP_LIST_FAILED',
      detail: 'Failed to retrieve active RIP phase instances',
    });
  }
});

/**
 * GET /v1/rip/phases/:code/completed
 * List completed instances of one RIP phase for the caseworker's municipality.
 */
router.get('/phases/:code/completed', async (req, res) => {
  if (!req.user) {
    return sendProblem(res, req, {
      status: 401,
      code: 'UNAUTHORIZED',
      detail: 'Authentication required',
    });
  }
  const { code } = req.params;
  const key = resolvePhaseKey(code, req, res);
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
    sendProblem(res, req, {
      status: 500,
      code: 'RIP_COMPLETED_LIST_FAILED',
      detail: 'Failed to retrieve completed RIP phase instances',
    });
  }
});

/**
 * GET /v1/rip/phases/:code/model
 * Swimlane model for one RIP phase, derived from its deployed BPMN.
 */
router.get('/phases/:code/model', async (req, res) => {
  if (!req.user) {
    return sendProblem(res, req, {
      status: 401,
      code: 'UNAUTHORIZED',
      detail: 'Authentication required',
    });
  }
  const code = req.params.code;
  const key = resolvePhaseKey(code, req, res);
  if (!key) return;
  try {
    const model = await operatonService.getPhaseSwimlaneModel(key, code, req.user.tenantId);
    res.json({ success: true, data: model });
  } catch (error) {
    logger.error('Failed to build RIP phase swimlane model', {
      code,
      tenantId: req.user.tenantId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    sendProblem(res, req, {
      status: 500,
      code: 'PHASE_MODEL_FAILED',
      detail: 'Failed to build phase process model',
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
    return sendProblem(res, req, {
      status: 401,
      code: 'UNAUTHORIZED',
      detail: 'Authentication required',
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
    sendProblem(res, req, {
      status: 500,
      code: 'DEPLOYMENT_STATUS_FAILED',
      detail: 'Failed to retrieve phase deployment status',
    });
  }
});

/**
 * GET /v1/rip/phases/counts
 * WIP + Gereed instance counts per deployed RIP phase process-definition key.
 */
router.get('/phases/counts', async (req, res) => {
  if (!req.user) {
    return sendProblem(res, req, {
      status: 401,
      code: 'UNAUTHORIZED',
      detail: 'Authentication required',
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
    sendProblem(res, req, {
      status: 500,
      code: 'PHASE_COUNTS_FAILED',
      detail: 'Failed to retrieve phase instance counts',
    });
  }
});

/**
 * GET /v1/rip/instances/:instanceId/documents
 * Fetch an instance's document templates + current process variables, and
 * every document its model declares -- generated (A) and linked (B / B+) --
 * with its status, plus the kredietcheck state.
 *
 * Keyed by instance rather than by phase: the deployment is resolved from the
 * instance itself, so no phase code is needed and none is asked for.
 *
 * eDOCS is read as the person when they have an eDOCS identity, for the live
 * version of each linked document. Without one the list still answers, with
 * the versions left empty: the panel matters more than the version number.
 */
router.get('/instances/:instanceId/documents', edocsAccess, async (req, res) => {
  if (!req.user) {
    return sendProblem(res, req, {
      status: 401,
      code: 'UNAUTHORIZED',
      detail: 'Authentication required',
    });
  }
  const { instanceId } = req.params;
  try {
    const result = await operatonService.getRipInstanceDocuments(instanceId);

    // Tenant isolation, before any eDOCS read on the instance's behalf.
    if (!tenantAllows(req.user, result.variables.municipality)) {
      return denyTenant(req, res, {
        processInstanceId: instanceId,
        processTenant: result.variables.municipality,
      });
    }

    const docs = await listInstanceDocuments(instanceId, req.edocs ?? null);
    res.json({
      success: true,
      data: {
        ...result,
        documents: docs.documents,
        kredietChecks: docs.kredietChecks,
        edocsWorkspaceId: docs.edocsWorkspaceId,
        uploadTarget: docs.uploadTarget,
      },
    });
  } catch (error) {
    logger.error('Failed to fetch RIP instance documents', {
      instanceId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    sendProblem(res, req, {
      status: 500,
      code: 'RIP_DOCUMENTS_FAILED',
      detail: 'Failed to retrieve RIP instance documents',
    });
  }
});

/** A refusal from the document service, or an eDOCS failure, as a problem detail. */
function sendDocumentError(req: Request, res: Response, error: unknown, fallback: string) {
  if (error instanceof RipDocumentError) {
    return sendProblem(res, req, {
      status: error.status,
      code: error.code,
      detail: error.message,
    });
  }
  logger.error(fallback, {
    instanceId: req.params.instanceId,
    error: error instanceof Error ? error.message : 'Unknown error',
  });
  sendEdocsError(req, res, error, fallback);
}

/** The caller as the document service needs it; jwtMiddleware has set req.user. */
const callerOf = (req: Request) => ({
  userId: req.user?.userId ?? '',
  roles: req.user?.roles ?? [],
});

/** Answers 403 TENANT_MISMATCH on `res` when the instance is not the caller's. */
const tenantGate = (req: Request, res: Response) => (municipality: unknown) => {
  if (req.user && tenantAllows(req.user, municipality)) return true;
  denyTenant(req, res, {
    processInstanceId: req.params.instanceId,
    processTenant: municipality,
  });
  return false;
};

const SLUG = /^[a-z0-9][a-z0-9-]*$/;

/**
 * GET /v1/rip/instances/:instanceId/workspace[?folderId=]
 * The content of the instance's eDOCS projectmap (or of one folder in it),
 * as the person: what the task panel offers to link.
 */
router.get(
  '/instances/:instanceId/workspace',
  edocsAccess,
  requireEdocsPrincipal,
  async (req: Request, res: Response) => {
    const folderId = typeof req.query.folderId === 'string' ? req.query.folderId : undefined;
    try {
      const ctx = await operatonService.getAccessVariables(req.params.instanceId);
      if (!tenantGate(req, res)(ctx.municipality)) return;
      const result = await listInstanceWorkspace(req.params.instanceId, edocsOf(req), folderId);
      res.json({
        success: true,
        data: { workspaceId: result.workspaceId, folderId: folderId ?? null, items: result.items },
      });
    } catch (error) {
      sendDocumentError(req, res, error, 'Failed to list the project workspace');
    }
  }
);

/**
 * POST /v1/rip/instances/:instanceId/documents/:slug/link   { documentId }
 * Link a document (or, for a map, a folder) from the projectmap to a linked
 * document the instance's open task declares, for a caller in its candidate
 * groups.
 */
router.post(
  '/instances/:instanceId/documents/:slug/link',
  edocsAccess,
  requireEdocsPrincipal,
  async (req: Request, res: Response) => {
    const { instanceId, slug } = req.params;
    const documentId = req.body?.documentId;
    if (!SLUG.test(slug) || typeof documentId !== 'string' || documentId.trim() === '') {
      return sendProblem(res, req, {
        status: 400,
        code: 'INVALID_REQUEST',
        detail: 'A document slug and a documentId are required.',
      });
    }
    try {
      const result = await linkDocument(
        instanceId,
        slug,
        documentId.trim(),
        callerOf(req),
        edocsOf(req),
        tenantGate(req, res)
      );
      if (!result) return;
      auditLog(req, 'rip.document.link', 'success', {
        processInstanceId: instanceId,
        slug,
        documentNumber: result.link.documentNumber,
      });
      res.json({ success: true, data: { slug, link: result.link } });
    } catch (error) {
      auditLog(req, 'rip.document.link', 'failure', {
        processInstanceId: instanceId,
        slug,
        reason: error instanceof RipDocumentError ? error.code : 'ERROR',
      });
      sendDocumentError(req, res, error, 'Failed to link the document');
    }
  }
);

/**
 * POST /v1/rip/instances/:instanceId/documents/:slug/upload
 *   { filename, contentBase64 }
 * Upload a file to eDOCS and link it. Has its own body limit (the app-wide
 * parser stops at 1 MB): see isLinkedUploadPath.
 */
router.post(
  '/instances/:instanceId/documents/:slug/upload',
  express.json({ limit: Math.ceil((config.edocs.linkedUploadMaxBytes * 4) / 3) + 64 * 1024 }),
  edocsAccess,
  requireEdocsPrincipal,
  async (req: Request, res: Response) => {
    const { instanceId, slug } = req.params;
    const { filename, contentBase64 } = req.body ?? {};
    if (
      !SLUG.test(slug) ||
      typeof filename !== 'string' ||
      filename.trim() === '' ||
      filename.length > 255 ||
      typeof contentBase64 !== 'string' ||
      contentBase64 === ''
    ) {
      return sendProblem(res, req, {
        status: 400,
        code: 'INVALID_REQUEST',
        detail: 'A document slug, a filename and the file content (base64) are required.',
      });
    }
    try {
      const result = await uploadDocument(
        instanceId,
        slug,
        { filename: filename.trim(), contentBase64 },
        callerOf(req),
        edocsOf(req),
        tenantGate(req, res)
      );
      if (!result) return;
      auditLog(req, 'rip.document.upload', 'success', {
        processInstanceId: instanceId,
        slug,
        documentNumber: result.link.documentNumber,
        inWorkspace: result.link.inWorkspace,
      });
      res.status(201).json({ success: true, data: { slug, link: result.link } });
    } catch (error) {
      auditLog(req, 'rip.document.upload', 'failure', {
        processInstanceId: instanceId,
        slug,
        reason: error instanceof RipDocumentError ? error.code : 'ERROR',
      });
      sendDocumentError(req, res, error, 'Failed to upload the document');
    }
  }
);

/**
 * The upload route parses its own, larger body. The app-wide JSON parser in
 * index.ts must skip it, or a file over 1 MB is refused before it arrives.
 */
export function isLinkedUploadPath(path: string): boolean {
  return /^\/v1\/rip\/instances\/[^/]+\/documents\/[^/]+\/upload\/?$/.test(path);
}

export default router;
