import { Router, Request, Response } from 'express';
import { jwtMiddleware } from '@auth/jwt.middleware';
import { createLogger } from '@utils/logger';
import { edocsService } from '@services/edocs.service';

const router = Router();
const logger = createLogger('edocs-routes');

router.use(jwtMiddleware);

/**
 * GET /v1/edocs/status
 */
router.get('/status', async (_req: Request, res: Response) => {
  const health = await edocsService.healthCheck();
  logger.info('eDOCS status requested', health);
  res.json({
    success: true,
    data: {
      status: health.status,
      library: process.env.EDOCS_LIBRARY ?? 'DOCUVITT',
      stubMode: health.status === 'stub',
      reachable: health.reachable,
      authenticated: health.authenticated,
      ...(health.latency !== undefined && { latencyMs: health.latency }),
      ...(health.error !== undefined && { error: health.error }),
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /v1/edocs/workspaces
 * Lists available workspaces from eDOCS.
 */
router.get('/workspaces', async (_req: Request, res: Response) => {
  try {
    const documents = await edocsService.listWorkspaces();
    res.json({ success: true, data: documents, timestamp: new Date().toISOString() });
  } catch (error) {
    logger.error('listWorkspaces failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(502).json({
      success: false,
      error: { code: 'EDOCS_ERROR', message: 'Failed to list eDOCS workspaces.' },
    });
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
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_FIELDS', message: 'projectNumber and projectName are required.' },
    });
  }

  try {
    const result = await edocsService.ensureWorkspace(projectNumber, projectName);
    res.json({ success: true, data: result, timestamp: new Date().toISOString() });
  } catch (error) {
    logger.error('ensureWorkspace failed', {
      projectNumber,
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(502).json({
      success: false,
      error: { code: 'EDOCS_ERROR', message: 'Failed to ensure eDOCS workspace.' },
    });
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
    return res.status(400).json({
      success: false,
      error: {
        code: 'MISSING_FIELDS',
        message: 'filename, contentBase64, metadata.docName, and metadata.department are required.',
      },
    });
  }

  try {
    const result = await edocsService.uploadDocument(
      workspaceId ?? null,
      filename,
      contentBase64,
      metadata
    );
    res.json({ success: true, data: result, timestamp: new Date().toISOString() });
  } catch (error) {
    logger.error('uploadDocument failed', {
      workspaceId,
      filename,
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(502).json({
      success: false,
      error: { code: 'EDOCS_ERROR', message: 'Failed to upload document to eDOCS.' },
    });
  }
});

/**
 * GET /v1/edocs/workspaces/:workspaceId/documents
 */
router.get('/workspaces/:workspaceId/documents', async (req: Request, res: Response) => {
  const { workspaceId } = req.params;

  try {
    const documents = await edocsService.getWorkspaceDocuments(workspaceId);
    res.json({
      success: true,
      data: { workspaceId, documents },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('getWorkspaceDocuments failed', {
      workspaceId,
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(502).json({
      success: false,
      error: { code: 'EDOCS_ERROR', message: 'Failed to retrieve workspace documents.' },
    });
  }
});

/**
 * GET /v1/edocs/documents/:documentId/profile
 */
router.get('/documents/:documentId/profile', async (req: Request, res: Response) => {
  const { documentId } = req.params;

  try {
    const profile = await edocsService.getDocumentProfile(documentId);
    res.json({ success: true, data: profile, timestamp: new Date().toISOString() });
  } catch (error) {
    logger.error('getDocumentProfile failed', {
      documentId,
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(502).json({
      success: false,
      error: { code: 'EDOCS_ERROR', message: 'Failed to retrieve document profile.' },
    });
  }
});

/**
 * GET /v1/edocs/documents/:documentId/versions
 */
router.get('/documents/:documentId/versions', async (req: Request, res: Response) => {
  const { documentId } = req.params;

  try {
    const versions = await edocsService.getDocumentVersions(documentId);
    res.json({
      success: true,
      data: { documentId, versions },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('getDocumentVersions failed', {
      documentId,
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(502).json({
      success: false,
      error: { code: 'EDOCS_ERROR', message: 'Failed to retrieve document versions.' },
    });
  }
});

/**
 * GET /v1/edocs/documents/:documentId/versions/:version
 * Returns the raw file content of this version, base64-encoded.
 */
router.get('/documents/:documentId/versions/:version', async (req: Request, res: Response) => {
  const { documentId, version } = req.params;

  try {
    const result = await edocsService.downloadDocumentVersion(documentId, version);
    res.json({ success: true, data: result, timestamp: new Date().toISOString() });
  } catch (error) {
    logger.error('downloadDocumentVersion failed', {
      documentId,
      version,
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(502).json({
      success: false,
      error: { code: 'EDOCS_ERROR', message: 'Failed to download document content.' },
    });
  }
});

/**
 * DELETE /v1/edocs/documents/:documentId
 */
router.delete('/documents/:documentId', async (req: Request, res: Response) => {
  const { documentId } = req.params;

  try {
    await edocsService.deleteDocument(documentId);
    res.json({
      success: true,
      data: { documentId, deleted: true },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('deleteDocument failed', {
      documentId,
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(502).json({
      success: false,
      error: { code: 'EDOCS_ERROR', message: 'Failed to delete document.' },
    });
  }
});

/**
 * DELETE /v1/edocs/workspaces/:workspaceId
 */
router.delete('/workspaces/:workspaceId', async (req: Request, res: Response) => {
  const { workspaceId } = req.params;

  try {
    await edocsService.deleteWorkspace(workspaceId);
    res.json({
      success: true,
      data: { workspaceId, deleted: true },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('deleteWorkspace failed', {
      workspaceId,
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(502).json({
      success: false,
      error: { code: 'EDOCS_ERROR', message: 'Failed to delete workspace.' },
    });
  }
});

export default router;
