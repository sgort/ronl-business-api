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
      ...(health.latency !== undefined && { latencyMs: health.latency }),
      ...(health.error !== undefined && { error: health.error }),
    },
    timestamp: new Date().toISOString(),
  });
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
 * Body: { workspaceId, filename, contentBase64, metadata }
 */
router.post('/documents', async (req: Request, res: Response) => {
  const { workspaceId, filename, contentBase64, metadata } = req.body as {
    workspaceId?: string;
    filename?: string;
    contentBase64?: string;
    metadata?: { docName: string; appId?: string; formName?: string };
  };

  if (!workspaceId || !filename || !contentBase64 || !metadata?.docName) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'MISSING_FIELDS',
        message: 'workspaceId, filename, contentBase64, and metadata.docName are required.',
      },
    });
  }

  try {
    const result = await edocsService.uploadDocument(
      workspaceId,
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

export default router;
