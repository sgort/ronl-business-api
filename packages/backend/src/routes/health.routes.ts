import express from 'express';
import { config } from '@utils/config';
import { operatonService } from '@services/operaton.service';
import { cacheHealth } from '../pa-monitoring/pa-cache';
import { createLogger } from '@utils/logger';
import packageJson from '../../package.json';

const router = express.Router();
const logger = createLogger('health-routes');

/**
 * GET /v1/health
 * Comprehensive health check with dependency status
 */
router.get('/', async (req, res) => {
  const startTime = Date.now();

  try {
    // Check Operaton
    const operatonHealth = await operatonService.healthCheck();

    // Check Keycloak (JWKS endpoint)
    let keycloakHealth: { status: 'up' | 'down'; latency?: number; error?: string };
    try {
      const keycloakStart = Date.now();
      const response = await fetch(
        `${config.keycloak.url}/realms/${config.keycloak.realm}/protocol/openid-connect/certs`
      );
      if (response.ok) {
        keycloakHealth = { status: 'up', latency: Date.now() - keycloakStart };
      } else {
        keycloakHealth = { status: 'down', error: `HTTP ${response.status}` };
      }
    } catch (error) {
      keycloakHealth = {
        status: 'down',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }

    // The PA cache is optional: it is fail-soft by design and every source
    // client falls through to a live fetch without it, so it is reported but
    // deliberately excluded from `allUp`. Reporting is the whole point — a
    // cache that was failing 100% of the time still read "healthy" for at
    // least nine days (#62), because nothing here looked at it.
    //
    // cacheHealth() also drives reconnection, so polling this endpoint is what
    // recovers the cache after an outage. Its own cooldown means at most one
    // connect attempt per thirty seconds regardless of how often it is called.
    // cacheHealth() is written never to reject, but the route does not rely on
    // that: an optional dependency must not be able to fail the check that
    // reports it. Without this guard a throwing probe 503s the whole endpoint.
    const cache = await cacheHealth().catch((err: unknown) => ({
      status: 'down' as const,
      error: err instanceof Error ? err.message : String(err),
    }));

    // Overall status
    const allUp = operatonHealth.status === 'up' && keycloakHealth.status === 'up';
    const overallStatus = allUp ? 'healthy' : 'degraded';
    const statusCode = allUp ? 200 : 503;

    const healthData = {
      name: 'RONL Business API',
      version: packageJson.version,
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: config.deploymentEnv,
      duration: Date.now() - startTime,
      dependencies: {
        keycloak: keycloakHealth,
        operaton: operatonHealth,
        cache,
      },
    };

    logger.info('Health check completed', {
      status: overallStatus,
      cache: cache.status,
      duration: healthData.duration,
    });

    res.status(statusCode).json({
      success: allUp,
      data: healthData,
    });
  } catch (error) {
    logger.error('Health check failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(503).json({
      success: false,
      data: {
        name: 'RONL Business API',
        version: packageJson.version,
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
});

/**
 * GET /v1/health/live
 * Liveness probe - is the service running?
 */
router.get('/live', (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      status: 'alive',
      timestamp: new Date().toISOString(),
    },
  });
});

/**
 * GET /v1/health/ready
 * Readiness probe - is the service ready to accept traffic?
 */
router.get('/ready', async (req, res) => {
  try {
    // Check critical dependencies
    const operatonHealth = await operatonService.healthCheck();

    if (operatonHealth.status === 'up') {
      res.status(200).json({
        success: true,
        data: {
          status: 'ready',
          timestamp: new Date().toISOString(),
        },
      });
    } else {
      res.status(503).json({
        success: false,
        data: {
          status: 'not ready',
          reason: 'Operaton unavailable',
          timestamp: new Date().toISOString(),
        },
      });
    }
  } catch (error) {
    res.status(503).json({
      success: false,
      data: {
        status: 'not ready',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
    });
  }
});

/**
 * GET /v1/health/external
 * Reachability check for external platform tools — server-side to avoid CORS.
 */
router.get('/external', async (_req, res) => {
  const targets: Record<string, string> = {
    cprmv: 'https://acc.cprmv.open-regels.nl/docs',
    triplydb: 'https://api.open-regels.triply.cc/datasets/stevengort/RONL',
    lde: 'https://acc.linkeddata.open-regels.nl/',
  };

  const results = await Promise.all(
    Object.entries(targets).map(async ([id, url]) => {
      const start = Date.now();
      try {
        const response = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5_000) });
        return [id, { status: response.ok ? 'up' : 'down', latency: Date.now() - start }] as const;
      } catch {
        return [id, { status: 'down', latency: Date.now() - start }] as const;
      }
    })
  );

  res.json({
    success: true,
    data: Object.fromEntries(results),
    timestamp: new Date().toISOString(),
  });
});

export default router;
