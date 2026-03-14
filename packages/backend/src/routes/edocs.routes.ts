import { Router, Request, Response } from 'express';
import { jwtMiddleware } from '@auth/jwt.middleware';
import { createLogger } from '@utils/logger';

const router = Router();
const logger = createLogger('edocs-routes');

const STUB_MODE = process.env.EDOCS_STUB_MODE !== 'false';

router.use(jwtMiddleware);

/**
 * GET /v1/edocs/status
 * Returns eDOCS service health — stub or live.
 */
router.get('/status', (_req: Request, res: Response) => {
  logger.info('eDOCS status requested', { stub: STUB_MODE });
  res.json({
    success: true,
    data: {
      status: STUB_MODE ? 'stub' : 'up',
      library: process.env.EDOCS_LIBRARY ?? 'DOCUVITT',
      stubMode: STUB_MODE,
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /v1/edocs/workspaces/:workspaceId/documents
 * Lists documents in a workspace — stub returns realistic fake data.
 */
router.get('/workspaces/:workspaceId/documents', (req: Request, res: Response) => {
  const { workspaceId } = req.params;
  logger.info('eDOCS workspace documents requested', { workspaceId, stub: STUB_MODE });

  if (STUB_MODE) {
    return res.json({
      success: true,
      data: {
        workspaceId,
        documents: [
          {
            documentNumber: '2993898',
            filename: 'rip-intake-report.pdf',
            createdAt: new Date().toISOString(),
            type: 'Intakeverslag',
          },
          {
            documentNumber: '2993899',
            filename: 'rip-psu-report.pdf',
            createdAt: new Date().toISOString(),
            type: 'PSU-verslag',
          },
        ],
      },
      timestamp: new Date().toISOString(),
    });
  }

  // Live mode — extend when real eDOCS DOCUVITT credentials are available
  res.status(501).json({
    success: false,
    error: { code: 'NOT_IMPLEMENTED', message: 'Live eDOCS integration not yet configured.' },
  });
});

export default router;
