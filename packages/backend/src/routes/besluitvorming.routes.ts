import express from 'express';
import type { Request, Response } from 'express';
import { jwtMiddleware } from '@auth/jwt.middleware';
import { tenantMiddleware } from '@middleware/tenant.middleware';
import { operatonService } from '@services/operaton.service';
import { createLogger } from '@utils/logger';
import { sendProblem } from '@utils/problem';

const router = express.Router();
const logger = createLogger('besluitvorming-routes');

router.use(jwtMiddleware);
router.use(tenantMiddleware);

/**
 * GedelegeerdBesluitProcess instances in one state, for the caller's tenant.
 * Scoped like /v1/hr-capacity: by tenant (the municipality variable), not by
 * role -- the rail item limits who reaches the overview in the dashboard.
 */
function listHandler(state: 'lopend' | 'afgerond') {
  return async (req: Request, res: Response) => {
    if (!req.user) {
      return sendProblem(res, req, {
        status: 401,
        code: 'UNAUTHORIZED',
        detail: 'Authentication required',
      });
    }
    try {
      const list = await operatonService.getBesluitList(req.user.tenantId, state);
      return res.json({ success: true, data: list });
    } catch (error) {
      logger.error('Failed to list besluiten', {
        tenantId: req.user.tenantId,
        state,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return sendProblem(res, req, {
        status: 500,
        code: 'BESLUIT_LIST_FAILED',
        detail: 'Failed to retrieve besluiten',
      });
    }
  };
}

/** GET /v1/besluitvorming/active -- running besluiten, with their current step. */
router.get('/active', listHandler('lopend'));

/** GET /v1/besluitvorming/completed -- completed besluiten, newest first, with their outcome. */
router.get('/completed', listHandler('afgerond'));

export default router;
