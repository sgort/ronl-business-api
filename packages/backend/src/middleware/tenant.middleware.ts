import { Request, Response, NextFunction } from 'express';
import { config } from '@utils/config';
import { createLogger } from '@utils/logger';

const logger = createLogger('tenant-middleware');

/**
 * Tenant Isolation Middleware
 * Ensures all operations are scoped to the user's municipality
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

  // Validate tenant ID
  if (!tenantId) {
    logger.error('Missing tenant ID in user context', {
      userId: req.user.userId,
    });

    return res.status(403).json({
      success: false,
      error: {
        code: 'MISSING_TENANT',
        message: 'Municipality information missing',
      },
    });
  }

  // Add tenant context to request
  if (req.auth) {
    req.auth = {
      ...req.auth,
      tenantId,
    };
  }

  logger.debug('Tenant context established', {
    tenantId,
    userId: req.user.userId,
    path: req.path,
  });

  next();
};

/**
 * Validate tenant ID in request parameters
 * Ensures user can only access resources from their own municipality
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
          message: 'Access denied: municipality mismatch',
        },
      });
    }

    next();
  };
};

/**
 * Add tenant ID to Operaton process variables
 * Ensures all BPMN processes are tagged with municipality
 */
export const addTenantToProcessVariables = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return next();
  }

  // Add tenant ID to request body variables
  if (req.body && typeof req.body === 'object') {
    if (!req.body.variables) {
      req.body.variables = {};
    }

    // Add tenant as business key
    req.body.businessKey = `${req.user.tenantId}-${Date.now()}`;

    // Add tenant to variables
    req.body.variables.municipality = {
      value: req.user.tenantId,
      type: 'String',
    };

    // Add user context
    req.body.variables.initiator = {
      value: req.user.userId,
      type: 'String',
    };

    req.body.variables.assuranceLevel = {
      value: req.user.assuranceLevel,
      type: 'String',
    };

    logger.debug('Added tenant context to process variables', {
      tenantId: req.user.tenantId,
      businessKey: req.body.businessKey,
    });
  }

  next();
};

export default tenantMiddleware;
