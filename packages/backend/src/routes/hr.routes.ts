/* eslint-disable @typescript-eslint/no-non-null-assertion */
import express from 'express';
import { jwtMiddleware } from '@auth/jwt.middleware';
import { tenantMiddleware } from '@middleware/tenant.middleware';
import { operatonService } from '@services/operaton.service';
import { createLogger } from '@utils/logger';
import { sendProblem } from '@utils/problem';

const router = express.Router();
const logger = createLogger('hr-routes');

router.use(jwtMiddleware);
router.use(tenantMiddleware);

/**
 * GET /v1/hr/onboarding/profile?employeeId=emp-001
 * Returns the completed HR onboarding output for the given employeeId.
 * Any caseworker can look up their own record; hr-medewerker can look up any.
 */
router.get('/onboarding/profile', async (req, res) => {
  const { employeeId } = req.query;

  if (!employeeId || typeof employeeId !== 'string') {
    return sendProblem(res, req, {
      status: 400,
      code: 'VALIDATION_ERROR',
      detail: 'employeeId query parameter is required',
    });
  }

  try {
    const profile = await operatonService.getHrOnboardingProfile(employeeId, req.user!.tenantId);
    res.json({ success: true, data: profile });
  } catch (error) {
    logger.error('Failed to fetch HR profile', {
      employeeId,
      tenantId: req.user!.tenantId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    sendProblem(res, req, {
      status: 500,
      code: 'HR_PROFILE_FAILED',
      detail: 'Failed to retrieve HR onboarding profile',
    });
  }
});

/**
 * GET /v1/hr/onboarding/completed
 * List all completed HrOnboardingProcess instances for the caseworker's municipality.
 */
router.get('/onboarding/completed', async (req, res) => {
  if (!req.user) {
    return sendProblem(res, req, {
      status: 401,
      code: 'UNAUTHORIZED',
      detail: 'Authentication required',
    });
  }

  try {
    const list = await operatonService.getHrOnboardingCompletedList(req.user.tenantId);
    res.json({ success: true, data: list });
  } catch (error) {
    logger.error('Failed to list completed onboardings', {
      tenantId: req.user.tenantId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    sendProblem(res, req, {
      status: 500,
      code: 'ONBOARDING_LIST_FAILED',
      detail: 'Failed to retrieve completed onboardings',
    });
  }
});

export default router;
