import express, { Request, Response } from 'express';
import { config } from '@utils/config';
import packageJson from '../../package.json';

const router = express.Router();

/**
 * The paths this service advertises at `/`.
 *
 * Exported so the banner and index.ts's mounts can be read against each other.
 * They drifted once and nothing noticed: the banner promised documentation at
 * `/v1/docs` from the initial commit onwards and nothing ever mounted it, so a
 * consumer following the field got a 404 (#67).
 *
 * Nothing enforces that every entry here is mounted — index.ts calls
 * startServer() at import, so a test cannot load it to compare. Keeping the two
 * in step is still a human job; this at least puts one of them somewhere a test
 * can reach.
 */
export const ADVERTISED_ENDPOINTS = {
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
} as const;

/**
 * Service banner.
 *
 * No `documentation` field: there is no documentation endpoint. Serving one is
 * worth doing and stays open in #67; pointing at a 404 was the one option that
 * was definitely wrong.
 */
router.get('/', (req: Request, res: Response) => {
  res.json({
    name: 'RONL Business API',
    version: packageJson.version,
    status: 'running',
    environment: config.deploymentEnv,
    endpoints: ADVERTISED_ENDPOINTS,
    security: {
      authentication: 'JWT (Keycloak)',
      authorization: 'Role-based + Tenant isolation',
      compliance: ['BIO', 'NEN 7510', 'AVG/GDPR', 'eIDAS'],
    },
  });
});

export default router;
