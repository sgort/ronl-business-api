import { Router, Request, Response } from 'express';
import { apiKeyMiddleware } from '@middleware/apiKey.middleware';
import { createLogger } from '@utils/logger';
import { config } from '@utils/config';
import { edocsService } from '@services/edocs.service';

const router = Router();
const logger = createLogger('edocs-copilot-routes');

router.use(apiKeyMiddleware(config.edocsCopilot.apiKey));

/**
 * GET /status
 */
router.get('/status', async (_req: Request, res: Response) => {
  const health = await edocsService.healthCheck();
  logger.info('eDOCS copilot status requested', health);
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
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /workspaces
 * Lists available workspaces from eDOCS.
 */
router.get('/workspaces', async (_req: Request, res: Response) => {
  try {
    const workspaces = await edocsService.listWorkspaces();
    res.json({ success: true, data: workspaces, timestamp: new Date().toISOString() });
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
 * GET /workspaces/:workspaceId/documents
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
 * GET /documents/:documentId/profile
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
 * GET /documents/:documentId/versions
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

export default router;
