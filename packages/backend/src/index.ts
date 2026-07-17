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
import taskRoutes from '@routes/task.routes';
import publicRoutes from '@routes/public.routes';
import hrRoutes from './routes/hr.routes';
import capacityRoutes from './routes/capacity.routes';
import ripRoutes from './routes/rip.routes';
import edocsRoutes from './routes/edocs.routes';
import { externalTaskWorker } from '@services/externalTaskWorker.service';
import { mcpRegistry } from '@services/mcp/McpRegistry';
import { OperatonMcpProvider } from '@services/mcp/OperatonMcpProvider';
import { TriplyDbMcpProvider } from '@services/mcp/TriplyDbMcpProvider';
import { CprmvMcpProvider } from '@services/mcp/CprmvMcpProvider';
import { LdeMcpProvider } from '@services/mcp/LdeMcpProvider';
import { llmRegistry } from '@services/llm/LlmRegistry';
import { AnthropicLlmProvider } from '@services/llm/AnthropicLlmProvider';
import { OpenAILlmProvider } from '@services/llm/OpenAILlmProvider';
import { initDb } from '@services/audit.service';
import { initPaDb } from './pa-monitoring/pa-monitoring.db';
import { initDossiersDb } from './pa-monitoring/pa-dossiers.db';
import { runCurationCycle } from './pa-monitoring/curation.service';
import paRoutes from './pa-monitoring/pa.routes';
import paDossiersRoutes from './pa-monitoring/pa-dossiers.routes';
import mediaAggregatorRoutes from './media-aggregator/media-aggregator.routes';
import adminRoutes from '@routes/admin.routes';
import m2mRoutes from './routes/m2m.routes';
import mcpRoutes from './routes/mcp.routes';

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
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
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
      tasks: '/v1/task',
      brp: '/v1/brp',
      public: '/v1/public',
      hr: '/v1/hr',
      hrCapacity: '/v1/hr-capacity',
      rip: '/v1/rip',
      edocs: '/v1/edocs',
      curator: '/v1/pa',
      mediaAggregator: '/v1/media-aggregator',
      admin: '/v1/admin',
      m2m: '/v1/m2m',
      mcp: '/v1/mcp',
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
app.use('/v1/task', taskRoutes);
app.use('/v1/brp', brpRoutes);
app.use('/v1/public', publicRoutes);
app.use('/v1/hr', hrRoutes);
app.use('/v1/hr-capacity', capacityRoutes);
app.use('/v1/rip', ripRoutes);
app.use('/v1/edocs', edocsRoutes);
app.use('/v1/pa', paRoutes);
app.use('/v1/pa', paDossiersRoutes);
app.use('/v1/media-aggregator', mediaAggregatorRoutes);
app.use('/v1/admin', adminRoutes);
app.use('/v1/m2m', m2mRoutes);
app.use('/v1/mcp', mcpRoutes);

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

// Suppress EPIPE errors from MCP child process stdio pipes closing
process.on('SIGPIPE', () => {});
process.stdout.on('error', (err) => {
  if (err.code !== 'EPIPE') throw err;
});
process.stderr.on('error', (err) => {
  if (err.code !== 'EPIPE') throw err;
});

// Start server
const startServer = async () => {
  const port = config.port;
  const host = config.host;

  await initDb();
  await initPaDb();
  await initDossiersDb();
  void runCurationCycle().catch((err) =>
    appLogger.error('Startup curation cycle failed', {
      error: err instanceof Error ? err.message : String(err),
    })
  );

  // Periodic curation refresh — picks up new EP teksten, TK, and OB candidates.
  // EP teksten fetch is gated inside runCurationCycle on epTextsSubmittedEnabled.
  setInterval(
    () => {
      void runCurationCycle().catch((err) =>
        appLogger.error('Periodic curation cycle failed', {
          error: err instanceof Error ? err.message : String(err),
        })
      );
    },
    6 * 60 * 60 * 1000
  );

  externalTaskWorker.start();

  llmRegistry.register(new AnthropicLlmProvider());
  llmRegistry.register(new OpenAILlmProvider());

  if (config.mcp.enabled) {
    mcpRegistry.register(new OperatonMcpProvider());
    if (config.triplydb.enabled) {
      mcpRegistry.register(new TriplyDbMcpProvider());
    }
    if (config.cprmv.enabled) {
      mcpRegistry.register(new CprmvMcpProvider());
    }
    if (config.lde.enabled) {
      mcpRegistry.register(new LdeMcpProvider());
    }
    await mcpRegistry.connectAll();
    appLogger.info('MCP registry ready');
  }

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
  externalTaskWorker.stop();
  void mcpRegistry.disconnectAll();
  process.exit(0);
});

process.on('SIGINT', () => {
  appLogger.info('SIGINT received, shutting down gracefully...');
  externalTaskWorker.stop();
  void mcpRegistry.disconnectAll();
  process.exit(0);
});

process.on('unhandledRejection', (reason: unknown) => {
  appLogger.error('Unhandled promise rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
  });
});

startServer();

export default app;
