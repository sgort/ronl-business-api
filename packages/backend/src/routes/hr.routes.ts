/* eslint-disable @typescript-eslint/no-non-null-assertion */
import express from 'express';
import { jwtMiddleware } from '@auth/jwt.middleware';
import { tenantMiddleware } from '@middleware/tenant.middleware';
import { operatonService } from '@services/operaton.service';
import { createLogger } from '@utils/logger';

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
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'employeeId query parameter is required' },
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
    res.status(500).json({
      success: false,
      error: { code: 'HR_PROFILE_FAILED', message: 'Failed to retrieve HR onboarding profile' },
    });
  }
});

export default router;
