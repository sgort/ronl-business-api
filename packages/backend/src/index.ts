import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { rateLimitKey } from '@utils/client-ip';
import { config } from '@utils/config';
import logger, { createLogger } from '@utils/logger';
import { corsOriginCallback } from '@utils/cors-origin';
import { createRootRouter } from '@routes/root.routes';
import { advertisedEndpoints, routeRegistry } from '@routes/registry';
import { auditMiddleware } from '@middleware/audit.middleware';
import { versionMiddleware } from '@middleware/version.middleware';
import packageJson from '../package.json';
// The routers themselves come from the registry; this is the callback-path
// predicate the JSON body parser needs to exempt /v1/validsign/callback.
import { isCallbackPath } from '@routes/validsign.routes';
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
//
// A function rather than the array it used to be, so a pull request's Static Web
// Apps preview can call this backend (#37). Preview hostnames are ephemeral and
// cannot be listed; the callback matches them on their app's stable slug, and
// refuses them outright in production. See utils/cors-origin.ts.
const isProductionTier = config.deploymentEnv === 'production';
if (isProductionTier && config.corsPreviewSlugs.length > 0) {
  appLogger.warn('CORS_PREVIEW_SLUGS is set on a production tier and is being ignored', {
    slugs: config.corsPreviewSlugs.length,
  });
}
app.use(
  cors({
    origin: corsOriginCallback(config.corsOrigin, config.corsPreviewSlugs, isProductionTier),
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
// Sets API-Version on every response (NL ADR API-57). Before the mounts, so
// it covers the banner and every /v1 route. See #200.
app.use(versionMiddleware);

app.use(auditMiddleware);

// Mount routes. The banner at / lives in its own router so it can be tested.
//
// Everything under /v1 is mounted from routes/registry.ts, which is also what
// the banner advertises and what the OpenAPI coverage gate compares against
// (#200). The three used to be maintained separately and drifted: the banner
// promised /v1/docs from the initial commit and nothing ever served it (#67).
//
// Mount ORDER is the registry array order, and it is load-bearing -- the
// ValidSign callback router must precede the authenticated one on the same
// path. See the note there.
app.use('/', createRootRouter(advertisedEndpoints));
for (const { mount, router } of routeRegistry) {
  app.use(mount, router);
}

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
