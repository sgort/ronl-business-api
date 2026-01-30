import express from 'express';
import { config } from '@utils/config';
import { operatonService } from '@services/operaton.service';
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
      environment: config.nodeEnv,
      duration: Date.now() - startTime,
      dependencies: {
        keycloak: keycloakHealth,
        operaton: operatonHealth,
      },
    };

    logger.info('Health check completed', {
      status: overallStatus,
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

export default router;
