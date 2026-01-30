import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import { config } from '@utils/config';
import { createLogger } from '@utils/logger';
import { JWTPayload, AuthenticatedUser, AssuranceLevel } from '@types/auth.types';

const logger = createLogger('jwt-middleware');

// JWKS client for fetching Keycloak public keys
const jwksClientInstance = jwksClient({
  jwksUri: `${config.keycloak.url}/realms/${config.keycloak.realm}/protocol/openid-connect/certs`,
  cache: true,
  cacheMaxAge: config.jwt.cacheTtl * 1000,
  rateLimit: true,
  jwksRequestsPerMinute: 10,
});

/**
 * Get signing key from Keycloak JWKS
 */
function getKey(header: jwt.JwtHeader, callback: jwt.SigningKeyCallback) {
  if (!header.kid) {
    return callback(new Error('Missing kid in JWT header'));
  }

  jwksClientInstance.getSigningKey(header.kid, (err, key) => {
    if (err) {
      logger.error('Failed to get signing key', { error: err.message, kid: header.kid });
      return callback(err);
    }
    const signingKey = key?.getPublicKey();
    callback(null, signingKey);
  });
}

/**
 * Validate JWT token
 */
function validateToken(token: string): Promise<JWTPayload> {
  return new Promise((resolve, reject) => {
    jwt.verify(
      token,
      getKey,
      {
        issuer: config.jwt.issuer,
        audience: config.jwt.audience,
        algorithms: ['RS256'],
      },
      (err, decoded) => {
        if (err) {
          logger.error('Token validation failed', { error: err.message });
          return reject(err);
        }
        resolve(decoded as JWTPayload);
      }
    );
  });
}

/**
 * Extract authenticated user from JWT payload
 */
function extractUser(payload: JWTPayload): AuthenticatedUser {
  return {
    userId: payload.sub,
    tenantId: payload.municipality,
    roles: payload.roles || [],
    assuranceLevel: payload.loa as AssuranceLevel,
    mandate: payload.mandate,
    displayName: payload.name,
  };
}

/**
 * JWT Authentication Middleware
 * Validates JWT token and attaches user context to request
 */
export const jwtMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();

  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logger.warn('Missing or invalid Authorization header', {
        path: req.path,
        ip: req.ip,
      });
      return res.status(401).json({
        success: false,
        error: {
          code: 'MISSING_TOKEN',
          message: 'Authorization header missing or invalid',
        },
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Validate token
    logger.debug('Validating JWT token', {
      path: req.path,
      tokenLength: token.length,
    });

    const payload = await validateToken(token);

    // Extract user information
    const user = extractUser(payload);

    // Attach to request
    req.user = user;
    req.auth = {
      ...user,
      requestId: (req.headers['x-request-id'] as string) || `req-${Date.now()}`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    };

    const duration = Date.now() - startTime;
    logger.info('JWT validation successful', {
      userId: user.userId,
      tenantId: user.tenantId,
      roles: user.roles,
      duration,
    });

    next();
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('JWT validation failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      duration,
      path: req.path,
    });

    return res.status(401).json({
      success: false,
      error: {
        code: 'INVALID_TOKEN',
        message: 'Token validation failed',
      },
    });
  }
};

/**
 * Optional JWT Middleware
 * Validates token if present, but allows request to continue without it
 */
export const optionalJwtMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // No token present, continue without authentication
    return next();
  }

  // Token present, validate it
  return jwtMiddleware(req, res, next);
};

/**
 * Require specific roles
 */
export const requireRoles = (...roles: string[]) => {
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

    const hasRole = roles.some((role) => req.user && req.user.roles.includes(role));

    if (!hasRole) {
      logger.warn('Insufficient permissions', {
        userId: req.user.userId,
        requiredRoles: roles,
        userRoles: req.user.roles,
      });

      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Insufficient permissions',
        },
      });
    }

    next();
  };
};

/**
 * Require minimum assurance level
 */
export const requireAssuranceLevel = (minLevel: AssuranceLevel) => {
  const levels: AssuranceLevel[] = ['basis', 'midden', 'substantieel', 'hoog'];
  const minIndex = levels.indexOf(minLevel);

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

    const userLevel = req.user.assuranceLevel;
    const userIndex = levels.indexOf(userLevel);

    if (userIndex < minIndex) {
      logger.warn('Insufficient assurance level', {
        userId: req.user.userId,
        required: minLevel,
        actual: userLevel,
      });

      return res.status(403).json({
        success: false,
        error: {
          code: 'INSUFFICIENT_ASSURANCE',
          message: `Assurance level '${minLevel}' or higher required`,
        },
      });
    }

    next();
  };
};

export default jwtMiddleware;
