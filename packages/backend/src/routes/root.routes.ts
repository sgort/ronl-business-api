import express, { Request, Response } from 'express';
import { config } from '@utils/config';
import packageJson from '../../package.json';

/**
 * Service banner at `/`.
 *
 * Takes the endpoint map rather than importing it, and that is deliberate.
 *
 * This module exists to be importable WITHOUT side effects -- the banner used
 * to be inline in index.ts, where importing it starts a server, so nothing
 * could test it. That is how it promised documentation at /v1/docs from the
 * initial commit while nothing ever served it (#67).
 *
 * routes/registry.ts is now the single source of both what is mounted and what
 * is advertised (#200), but importing it here would pull in all 19 route
 * modules -- and with them the Operaton service, the Anthropic SDK and the
 * database pools -- to render a JSON literal. That would give this module back
 * exactly the property it was split out to avoid. index.ts passes the map in
 * instead; registry.test.ts is what checks every advertised path is mounted.
 *
 * The `documentation` field is back, and there is something behind it:
 * /v1/openapi.json, served by openapi.routes.ts. #67 removed the field because
 * it pointed at a 404, which was the one option that was definitely wrong.
 */
export function createRootRouter(endpoints: Readonly<Record<string, string>>): express.Router {
  const router = express.Router();

  router.get('/', (req: Request, res: Response) => {
    res.json({
      name: 'RONL Business API',
      version: packageJson.version,
      status: 'running',
      environment: config.deploymentEnv,
      endpoints,
      security: {
        authentication: 'JWT (Keycloak)',
        authorization: 'Role-based + Tenant isolation',
        compliance: ['BIO', 'NEN 7510', 'AVG/GDPR', 'eIDAS'],
      },
    });
  });

  return router;
}
