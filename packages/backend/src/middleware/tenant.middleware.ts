import { Request, Response, NextFunction } from 'express';
import { config } from '@utils/config';
import { createLogger } from '@utils/logger';

const logger = createLogger('tenant-middleware');

/**
 * Tenant Isolation Middleware
 * Ensures all operations are scoped to the user's organisation
 */
export const tenantMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (!config.tenant.enableIsolation) {
    logger.debug('Tenant isolation disabled');
    return next();
  }

  if (!req.user) {
    logger.error('Tenant middleware called without authenticated user');
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      },
    });
  }

  const tenantId = req.user.tenantId;

  if (!tenantId) {
    logger.error('Missing tenant ID in user context', {
      userId: req.user.userId,
    });

    return res.status(403).json({
      success: false,
      error: {
        code: 'MISSING_TENANT',
        message: 'Organisation information missing',
      },
    });
  }

  if (req.auth) {
    req.auth = {
      ...req.auth,
      tenantId,
    };
  }

  logger.debug('Tenant context established', {
    tenantId,
    organisationType: req.user.organisationType,
    userId: req.user.userId,
    path: req.path,
  });

  next();
};

/**
 * Validate tenant ID in request parameters
 * Ensures user can only access resources from their own organisation
 */
export const validateTenantParam = (paramName: string = 'tenantId') => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
    }

    const requestedTenant = req.params[paramName];
    const userTenant = req.user.tenantId;

    if (requestedTenant !== userTenant) {
      logger.warn('Tenant mismatch detected', {
        userId: req.user.userId,
        userTenant,
        requestedTenant,
        path: req.path,
      });

      return res.status(403).json({
        success: false,
        error: {
          code: 'TENANT_MISMATCH',
          message: 'Access denied: organisation mismatch',
        },
      });
    }

    next();
  };
};

/**
 * Add tenant ID and organisation type to Operaton process variables
 * Ensures all BPMN processes are tagged with tenant context
 */
export const addTenantToProcessVariables = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return next();
  }

  if (req.body && typeof req.body === 'object') {
    if (!req.body.variables) {
      req.body.variables = {};
    }

    req.body.businessKey = `${req.user.tenantId}-${Date.now()}`;

    req.body.variables.municipality = req.user.tenantId;
    req.body.variables.organisationType = req.user.organisationType;
    req.body.variables.initiator = req.user.userId;
    req.body.variables.assuranceLevel = req.user.assuranceLevel;
    req.body.variables.applicantId = req.user.userId;

    logger.debug('Added tenant context to process variables', {
      tenantId: req.user.tenantId,
      organisationType: req.user.organisationType,
      businessKey: req.body.businessKey,
    });
  }

  next();
};

export default tenantMiddleware;
