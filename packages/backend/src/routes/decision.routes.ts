import express from 'express';
import { jwtMiddleware, requireAssuranceLevel } from '@auth/jwt.middleware';
import { tenantMiddleware } from '@middleware/tenant.middleware';
import { operatonService } from '@services/operaton.service';
import { createLogger } from '@utils/logger';
import { sendProblem } from '@utils/problem';
import { auditLog } from '@middleware/audit.middleware';
import { OperatonVariable } from '@ronl/shared';
import { toOperatonVariable } from '@utils/operaton-variables';

const router = express.Router();
const logger = createLogger('decision-routes');

// Apply authentication and tenant isolation to all routes
router.use(jwtMiddleware);
router.use(tenantMiddleware);

/**
 * POST /v1/decision/:key/evaluate
 * Evaluate a DMN decision
 */
router.post(
  '/:key/evaluate',
  requireAssuranceLevel('basis'), // Minimum DigiD Basis for decision evaluation
  async (req, res) => {
    const { key } = req.params;
    const { variables = {} } = req.body;

    // Check if user is authenticated
    if (!req.user) {
      return sendProblem(res, req, {
        status: 401,
        code: 'UNAUTHORIZED',
        detail: 'Authentication required',
      });
    }

    try {
      logger.info('Evaluating DMN decision', {
        decisionKey: key,
        tenantId: req.user.tenantId,
        userId: req.user.userId,
        variableCount: Object.keys(variables).length,
      });

      // Transform variables to Operaton format
      const operatonVariables: Record<string, OperatonVariable> = {};
      for (const [varKey, value] of Object.entries(variables)) {
        // If already in Operaton format { value, type }, keep as-is
        if (typeof value === 'object' && value !== null && 'value' in value && 'type' in value) {
          operatonVariables[varKey] = value as OperatonVariable;
        } else {
          // Otherwise, wrap the value
          operatonVariables[varKey] = toOperatonVariable(value);
        }
      }

      // Evaluate decision
      const result = await operatonService.evaluateDecision(
        key,
        operatonVariables,
        req.user.tenantId
      );

      // Audit log
      auditLog(req, `decision.evaluate.${key}`, 'success', {
        decisionKey: key,
        variableCount: Object.keys(operatonVariables).length,
      });

      // Return result directly (Operaton already returns the array format)
      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Failed to evaluate DMN decision', {
        decisionKey: key,
        tenantId: req.user.tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      auditLog(req, `decision.evaluate.${key}`, 'error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      sendProblem(res, req, {
        status: 500,
        code: 'DECISION_EVALUATION_FAILED',
        detail: errorMessage,
      });
    }
  }
);

/**
 * GET /v1/decision/:key
 * Get decision definition details
 */
router.get('/:key', async (req, res) => {
  const { key } = req.params;

  // Check if user is authenticated
  if (!req.user) {
    return sendProblem(res, req, {
      status: 401,
      code: 'UNAUTHORIZED',
      detail: 'Authentication required',
    });
  }

  try {
    // Through the shared client, which carries the engine login (#415); a
    // bare fetch carries none and is refused.
    const definition = await operatonService.getDecisionDefinition(key);

    res.json({
      success: true,
      data: definition,
    });
  } catch (error) {
    logger.error('Failed to get decision definition', {
      decisionKey: key,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    sendProblem(res, req, {
      status: 404,
      code: 'DECISION_NOT_FOUND',
      detail: 'Decision definition not found',
    });
  }
});

export default router;
