import { Router, Request, Response } from 'express';
import { jwtMiddleware } from '@auth/jwt.middleware';
import { config } from '@utils/config';
import { createLogger } from '@utils/logger';
import { sendProblem } from '@utils/problem';
import { edocsService } from '@services/edocs.service';
import { edocsAccess, edocsOf, requireEdocsPrincipal, sendEdocsError } from './edocs.access';

const router = Router();
const logger = createLogger('edocs-routes');

router.use(jwtMiddleware, edocsAccess);

/**
 * GET /v1/edocs/status
 */
router.get('/status', async (req: Request, res: Response) => {
  const health = await edocsService.healthCheck();
  logger.info('eDOCS status requested', health);

  // For a person: can eDOCS be reached as them? Machine clients get the service view only.
  let user:
    | {
        available: boolean;
        authenticated?: boolean;
        edocsUserId?: string;
        problem?: string;
        error?: string;
      }
    | undefined;
  if (req.auth?.azp === config.keycloak.clientId) {
    if (config.edocs.stubMode) user = { available: false, problem: 'STUB_MODE' };
    else if (req.edocsActingAs === 'user' && req.edocs)
      user = { available: true, ...(await req.edocs.probeUser()) };
    else
      user = { available: false, ...(req.edocsUserProblem && { problem: req.edocsUserProblem }) };
  }

  res.json({
    success: true,
    data: {
      status: health.status,
      library: process.env.EDOCS_LIBRARY ?? 'DOCUVITT',
      baseUrl: process.env.EDOCS_BASE_URL ?? '',
      stubMode: health.status === 'stub',
      reachable: health.reachable,
      authenticated: health.authenticated,
      ...(health.latency !== undefined && { latencyMs: health.latency }),
      ...(health.error !== undefined && { error: health.error }),
      ...(user && { user }),
    },
    timestamp: new Date().toISOString(),
  });
});

// Every route below needs an eDOCS client: the person's own, or the service.
router.use(requireEdocsPrincipal);

/**
 * GET /v1/edocs/workspaces
 * Lists available workspaces from eDOCS.
 */
router.get('/workspaces', async (req: Request, res: Response) => {
  try {
    const documents = await edocsOf(req).listWorkspaces();
    res.json({
      success: true,
      actingAs: req.edocsActingAs,
      data: documents,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('listWorkspaces failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return sendEdocsError(req, res, error, 'Failed to list eDOCS workspaces.');
  }
});

/**
 * POST /v1/edocs/workspaces/ensure
 * Body: { projectNumber: string, projectName: string }
 */
router.post('/workspaces/ensure', async (req: Request, res: Response) => {
  const { projectNumber, projectName } = req.body as {
    projectNumber?: string;
    projectName?: string;
  };

  if (!projectNumber || !projectName) {
    return sendProblem(res, req, {
      status: 400,
      code: 'MISSING_FIELDS',
      detail: 'projectNumber and projectName are required.',
    });
  }

  try {
    const result = await edocsOf(req).ensureWorkspace(projectNumber, projectName);
    res.json({
      success: true,
      actingAs: req.edocsActingAs,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('ensureWorkspace failed', {
      projectNumber,
      error: error instanceof Error ? error.message : String(error),
    });
    return sendEdocsError(req, res, error, 'Failed to ensure eDOCS workspace.');
  }
});

/**
 * POST /v1/edocs/documents
 * Body: { workspaceId?, filename, contentBase64, metadata }
 *
 * workspaceId is optional — omit it to upload standalone (the only path
 * confirmed working against the live DM server; see EDOCS-GO-LIVE.md § Known
 * issues). Passing a workspaceId uses the still-broken workspace-ref path.
 */
router.post('/documents', async (req: Request, res: Response) => {
  const { workspaceId, filename, contentBase64, metadata } = req.body as {
    workspaceId?: string;
    filename?: string;
    contentBase64?: string;
    metadata?: { docName: string; department: string; appId?: string; formName?: string };
  };

  if (!filename || !contentBase64 || !metadata?.docName || !metadata?.department) {
    return sendProblem(res, req, {
      status: 400,
      code: 'MISSING_FIELDS',
      detail: 'filename, contentBase64, metadata.docName, and metadata.department are required.',
    });
  }

  try {
    const result = await edocsOf(req).uploadDocument(
      workspaceId ?? null,
      filename,
      contentBase64,
      metadata
    );
    res.json({
      success: true,
      actingAs: req.edocsActingAs,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('uploadDocument failed', {
      workspaceId,
      filename,
      error: error instanceof Error ? error.message : String(error),
    });
    return sendEdocsError(req, res, error, 'Failed to upload document to eDOCS.');
  }
});

/**
 * GET /v1/edocs/workspaces/:workspaceId/documents
 */
router.get('/workspaces/:workspaceId/documents', async (req: Request, res: Response) => {
  const { workspaceId } = req.params;

  try {
    const documents = await edocsOf(req).getWorkspaceDocuments(workspaceId);
    res.json({
      success: true,
      actingAs: req.edocsActingAs,
      data: { workspaceId, documents },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('getWorkspaceDocuments failed', {
      workspaceId,
      error: error instanceof Error ? error.message : String(error),
    });
    return sendEdocsError(req, res, error, 'Failed to retrieve workspace documents.');
  }
});

/**
 * GET /v1/edocs/documents/:documentId/profile
 */
router.get('/documents/:documentId/profile', async (req: Request, res: Response) => {
  const { documentId } = req.params;

  try {
    const profile = await edocsOf(req).getDocumentProfile(documentId);
    res.json({
      success: true,
      actingAs: req.edocsActingAs,
      data: profile,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('getDocumentProfile failed', {
      documentId,
      error: error instanceof Error ? error.message : String(error),
    });
    return sendEdocsError(req, res, error, 'Failed to retrieve document profile.');
  }
});

/**
 * GET /v1/edocs/documents/:documentId/versions
 */
router.get('/documents/:documentId/versions', async (req: Request, res: Response) => {
  const { documentId } = req.params;

  try {
    const versions = await edocsOf(req).getDocumentVersions(documentId);
    res.json({
      success: true,
      actingAs: req.edocsActingAs,
      data: { documentId, versions },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('getDocumentVersions failed', {
      documentId,
      error: error instanceof Error ? error.message : String(error),
    });
    return sendEdocsError(req, res, error, 'Failed to retrieve document versions.');
  }
});

/**
 * GET /v1/edocs/documents/:documentId/versions/:version
 * Returns the raw file content of this version, base64-encoded.
 */
router.get('/documents/:documentId/versions/:version', async (req: Request, res: Response) => {
  const { documentId, version } = req.params;

  try {
    const result = await edocsOf(req).downloadDocumentVersion(documentId, version);
    res.json({
      success: true,
      actingAs: req.edocsActingAs,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('downloadDocumentVersion failed', {
      documentId,
      version,
      error: error instanceof Error ? error.message : String(error),
    });
    return sendEdocsError(req, res, error, 'Failed to download document content.');
  }
});

/**
 * DELETE /v1/edocs/documents/:documentId
 */
router.delete('/documents/:documentId', async (req: Request, res: Response) => {
  const { documentId } = req.params;

  try {
    await edocsOf(req).deleteDocument(documentId);
    res.json({
      success: true,
      actingAs: req.edocsActingAs,
      data: { documentId, deleted: true },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('deleteDocument failed', {
      documentId,
      error: error instanceof Error ? error.message : String(error),
    });
    return sendEdocsError(req, res, error, 'Failed to delete document.');
  }
});

/**
 * DELETE /v1/edocs/workspaces/:workspaceId
 */
router.delete('/workspaces/:workspaceId', async (req: Request, res: Response) => {
  const { workspaceId } = req.params;

  try {
    await edocsOf(req).deleteWorkspace(workspaceId);
    res.json({
      success: true,
      actingAs: req.edocsActingAs,
      data: { workspaceId, deleted: true },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('deleteWorkspace failed', {
      workspaceId,
      error: error instanceof Error ? error.message : String(error),
    });
    return sendEdocsError(req, res, error, 'Failed to delete workspace.');
  }
});

export default router;
