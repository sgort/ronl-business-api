import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { rateLimitKey } from '@utils/client-ip';
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
import doccleRoutes from './routes/doccle.routes';
import validsignRoutes, {
  callbackRouter as validsignCallbackRoutes,
  isCallbackPath,
} from './routes/validsign.routes';
import { externalTaskWorker } from '@services/externalTaskWorker.service';
import { validsignPoller } from '@services/validsignPoller.service';
import { mcpRegistry } from '@services/mcp/McpRegistry';
import { EdocsMcpProvider } from '@services/mcp/EdocsMcpProvider';
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
  // req.ip is not a client identity on its own: with TRUST_PROXY on, Express
  // reads it from X-Forwarded-For, and Azure writes that as address:port. The
  // port is per connection, so keying on it raw handed every new connection a
  // fresh budget. See utils/client-ip.ts.
  keyGenerator: (req: Request) =>
    rateLimitKey(req.ip, config.rateLimit.perTenant ? req.user?.tenantId : undefined),
  // ValidSign's callback must not share the board's IP bucket. The limiter is
  // global and IP-keyed, and with TRUST_PROXY=false every client behind one
  // proxy shares ONE budget — so a busy board could 429 the callback and
  // silently drop a signature. It gets its own limiter in validsign.routes.ts.
  skip: (req: Request) => isCallbackPath(req.path),
});

app.use(limiter);

// Body parsing.
// The ValidSign callback (/v1/validsign/callback) is exempted from the JSON
// parser here and parses its own body instead, with its own tighter limit
// and its own error handler that answers 400 rather than the app-wide 500
// on a malformed/oversized body (see validsign.routes.ts). That only works
// if the parse failure originates INSIDE that router: Express skips a
// mounted sub-router entirely once an error has occurred upstream of it, so
// if this global parser were the one to throw, the router's own error
// handler would never be reached and the request would fall through to the
// generic catch-all below -- which returns 500, telling ValidSign to retry
// forever.
const jsonParser = express.json({ limit: '1mb' });
app.use((req: Request, res: Response, next: NextFunction) => {
  if (isCallbackPath(req.path)) return next();
  jsonParser(req, res, next);
});
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
    environment: config.deploymentEnv,
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
      doccle: '/v1/doccle',
      validsign: '/v1/validsign',
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
app.use('/v1/doccle', doccleRoutes);
// The callback router mounts on its own, BEFORE any auth: ValidSign carries no
// token. The authenticated router applies jwtMiddleware internally.
app.use('/v1/validsign', validsignCallbackRoutes);
app.use('/v1/validsign', validsignRoutes);
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

  // Unconditional, like externalTaskWorker above: the primary path in local
  // development (ValidSign's cloud cannot reach localhost, so its webhook
  // never arrives) and the safety net in production. Gating it on stub mode
  // or the live-tiers allowlist would risk it silently never starting, which
  // for this poller means a completed signature can be stranded with nothing
  // in the logs to explain why. When there is nothing awaiting a signature —
  // including throughout stub mode, where the ceremony completes signatures
  // synchronously on its own path — each tick is just a cheap, harmless
  // empty sweep.
  validsignPoller.start();

  llmRegistry.register(new AnthropicLlmProvider());
  llmRegistry.register(new OpenAILlmProvider());

  if (config.mcp.enabled) {
    if (config.edocsMcp.enabled) {
      mcpRegistry.register(new EdocsMcpProvider());
    }
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
      environment: config.deploymentEnv,
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
  validsignPoller.stop();
  void mcpRegistry.disconnectAll();
  process.exit(0);
});

process.on('SIGINT', () => {
  appLogger.info('SIGINT received, shutting down gracefully...');
  externalTaskWorker.stop();
  validsignPoller.stop();
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
