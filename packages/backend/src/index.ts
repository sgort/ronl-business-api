import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from '@utils/config';
import logger, { createLogger } from '@utils/logger';
import healthRoutes from '@routes/health.routes';
import processRoutes from '@routes/process.routes';
import decisionRoutes from '@routes/decision.routes';
import { auditMiddleware } from '@middleware/audit.middleware';
import packageJson from '../package.json';
import brpRoutes from './routes/brp.routes';

const appLogger = createLogger('app');

const app: Express = express();

// Trust proxy (required for Azure App Service, Kubernetes, etc.)
if (config.security.trustProxy) {
  app.set('trust proxy', 1);
}

// Security middleware
if (config.security.helmetEnabled) {
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
        },
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
    })
  );
}

// CORS configuration
app.use(
  cors({
    origin: config.corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  })
);

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests, please try again later',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Per-tenant rate limiting if enabled
  keyGenerator: (req: Request) => {
    if (config.rateLimit.perTenant && req.user) {
      return `${req.user.tenantId}:${req.ip}`;
    }
    return req.ip || 'unknown';
  },
});

app.use(limiter);

// Body parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Request logging
app.use((req: Request, res: Response, next) => {
  logger.info('Incoming request', {
    method: req.method,
    path: req.path,
    query: req.query,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });
  next();
});

// API version header middleware
app.use((req: Request, res: Response, next) => {
  res.setHeader('API-Version', packageJson.version);
  next();
});

// Audit logging middleware
app.use(auditMiddleware);

// Root endpoint
app.get('/', (req: Request, res: Response) => {
  res.json({
    name: 'RONL Business API',
    version: packageJson.version,
    status: 'running',
    environment: config.nodeEnv,
    documentation: '/v1/docs',
    endpoints: {
      health: '/v1/health',
      process: '/v1/process',
      decision: '/v1/decision',
      tasks: '/v1/tasks',
    },
    security: {
      authentication: 'JWT (Keycloak)',
      authorization: 'Role-based + Tenant isolation',
      compliance: ['BIO', 'NEN 7510', 'AVG/GDPR', 'eIDAS'],
    },
  });
});

// Mount routes
app.use('/v1/health', healthRoutes);
app.use('/v1/process', processRoutes);
app.use('/v1/decision', decisionRoutes);
// app.use('/v1/tasks', taskRoutes); // TODO: Create task routes
app.use('/v1/brp', brpRoutes);

// 404 handler
app.use((req: Request, res: Response) => {
  logger.warn('Route not found', {
    method: req.method,
    path: req.path,
  });

  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Endpoint not found',
      path: req.path,
    },
  });
});

// Error handler (must be last)
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
  });

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: config.nodeEnv === 'production' ? 'Internal server error' : err.message,
    },
  });
});

// Start server
const startServer = () => {
  const port = config.port;
  const host = config.host;

  app.listen(port, host, () => {
    appLogger.info('Server started', {
      environment: config.nodeEnv,
      host,
      port,
      corsOrigin: config.corsOrigin,
      keycloakUrl: config.keycloak.url,
      operatonUrl: config.operaton.baseUrl,
    });

    appLogger.info(`API available at: http://${host}:${port}/v1`);
    appLogger.info(`Health check: http://${host}:${port}/v1/health`);
    appLogger.info(`Documentation: http://${host}:${port}/v1/docs`);

    // Log security configuration
    appLogger.info('Security configuration', {
      helmetEnabled: config.security.helmetEnabled,
      secureCookies: config.security.secureCookies,
      trustProxy: config.security.trustProxy,
      auditEnabled: config.audit.enabled,
      tenantIsolation: config.tenant.enableIsolation,
    });
  });
};

// Graceful shutdown
process.on('SIGTERM', () => {
  appLogger.info('SIGTERM received, shutting down gracefully...');
  // TODO: Close database connections, flush logs, etc.
  process.exit(0);
});

process.on('SIGINT', () => {
  appLogger.info('SIGINT received, shutting down gracefully...');
  process.exit(0);
});

// Unhandled rejection handler
process.on('unhandledRejection', (reason: unknown) => {
  appLogger.error('Unhandled promise rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
  });
  // Don't crash the server, but log the error
});

// Start the server
startServer();

export default app;
