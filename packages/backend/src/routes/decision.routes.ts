import express from 'express';
import { jwtMiddleware, requireAssuranceLevel } from '@auth/jwt.middleware';
import { tenantMiddleware } from '@middleware/tenant.middleware';
import { operatonService } from '@services/operaton.service';
import { createLogger } from '@utils/logger';
import { auditLog } from '@middleware/audit.middleware';
import { OperatonVariable } from '@ronl/shared';

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
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
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
          operatonVariables[varKey] = {
            value,
            type: inferType(value),
          };
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

      res.status(500).json({
        success: false,
        error: {
          code: 'DECISION_EVALUATION_FAILED',
          message: 'Failed to evaluate decision',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
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
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      },
    });
  }

  try {
    // Call Operaton to get decision definition
    const response = await fetch(
      `${operatonService['client'].defaults.baseURL}/decision-definition/key/${key}`,
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const definition = await response.json();

    res.json({
      success: true,
      data: definition,
    });
  } catch (error) {
    logger.error('Failed to get decision definition', {
      decisionKey: key,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(404).json({
      success: false,
      error: {
        code: 'DECISION_NOT_FOUND',
        message: 'Decision definition not found',
      },
    });
  }
});

/**
 * Infer Operaton type from JavaScript value
 */
function inferType(value: unknown): OperatonVariable['type'] {
  if (value === null || value === undefined) {
    return 'Null';
  }

  switch (typeof value) {
    case 'boolean':
      return 'Boolean';
    case 'number':
      return Number.isInteger(value) ? 'Integer' : 'Double';
    case 'string':
      return 'String';
    case 'object':
      return 'Json';
    default:
      return 'String';
  }
}

export default router;
