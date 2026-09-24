// packages/backend/src/routes/registry.ts
//
// Single source of truth for the v1 route topology (#200). Consumed by
// index.ts to mount, by root.routes.ts to advertise, and by
// src/openapi/coverage.test.ts to check the OpenAPI document against what is
// actually served.
//
// Before this, the mount list lived in index.ts and the advertised list in
// root.routes.ts, and nothing held them together. root.routes.ts said so:
//
//   Nothing enforces that every entry here is mounted -- index.ts calls
//   startServer() at import, so a test cannot load it to compare.
//
// That is the drift that let the banner promise /v1/docs from the initial
// commit while nothing ever served it (#67). A registry in its own module has
// no such side effect: a test can import it without starting a server.
//
// Adding a route is one entry here. Mounting, the banner and the OpenAPI
// coverage gate all follow from it.

import type { Router } from 'express';

import healthRoutes from './health.routes';
import processRoutes from './process.routes';
import decisionRoutes from './decision.routes';
import taskRoutes from './task.routes';
import brpRoutes from './brp.routes';
import publicRoutes from './public.routes';
import hrRoutes from './hr.routes';
import capacityRoutes from './capacity.routes';
import ripRoutes from './rip.routes';
import edocsRoutes from './edocs.routes';
import doccleRoutes from './doccle.routes';
import validsignRoutes, { callbackRouter as validsignCallbackRoutes } from './validsign.routes';
import adminRoutes from './admin.routes';
import m2mRoutes from './m2m.routes';
import mcpRoutes from './mcp.routes';
import openapiRoutes from './openapi.routes';
import paRoutes from '../pa-monitoring/pa.routes';
import paDossiersRoutes from '../pa-monitoring/pa-dossiers.routes';
import mediaAggregatorRoutes from '../media-aggregator/media-aggregator.routes';

export interface RouteDefinition {
  /** Mount path. Drives registration, the banner and the coverage gate. */
  mount: string;
  /** Express Router, imported here so module names appear in one place. */
  router: Router;
  /**
   * Key under which this mount appears in the root banner's `endpoints`.
   *
   * Omitted for a SECOND router on a mount already advertised by the first --
   * `/v1/validsign` and `/v1/pa` each carry two. Omitting it keeps the banner
   * a map of distinct paths rather than repeating one under two names.
   */
  advertiseAs?: string;
  /** Short description. Not rendered anywhere yet; kept for the reader. */
  summary: string;
}

// ORDER MATTERS, for two reasons.
//
// Express matches in mount order, so a more specific path must precede its
// parent. More importantly here: the ValidSign CALLBACK router is mounted on
// the same path as the authenticated one and must come first, because
// ValidSign carries no token and the authenticated router would reject it.
// That ordering was a comment in index.ts; it is now load-bearing data.
export const routeRegistry: ReadonlyArray<RouteDefinition> = [
  {
    mount: '/v1/health',
    router: healthRoutes,
    advertiseAs: 'health',
    summary: 'Liveness, readiness and dependency latency',
  },
  {
    mount: '/v1/openapi.json',
    router: openapiRoutes,
    advertiseAs: 'documentation',
    summary: 'OpenAPI 3.1 description of this API',
  },
  {
    mount: '/v1/process',
    router: processRoutes,
    advertiseAs: 'process',
    summary: 'Operaton process instances',
  },
  {
    mount: '/v1/decision',
    router: decisionRoutes,
    advertiseAs: 'decision',
    summary: 'DMN decision evaluation',
  },
  {
    mount: '/v1/task',
    router: taskRoutes,
    advertiseAs: 'tasks',
    summary: 'User tasks and task forms',
  },
  { mount: '/v1/brp', router: brpRoutes, advertiseAs: 'brp', summary: 'Personal records lookup' },
  {
    mount: '/v1/public',
    router: publicRoutes,
    advertiseAs: 'public',
    summary: 'Unauthenticated citizen-facing endpoints',
  },
  { mount: '/v1/hr', router: hrRoutes, advertiseAs: 'hr', summary: 'Business register lookup' },
  {
    mount: '/v1/hr-capacity',
    router: capacityRoutes,
    advertiseAs: 'hrCapacity',
    summary: 'Caseworker capacity',
  },
  { mount: '/v1/rip', router: ripRoutes, advertiseAs: 'rip', summary: 'RIP process integration' },
  {
    mount: '/v1/edocs',
    router: edocsRoutes,
    advertiseAs: 'edocs',
    summary: 'Document generation and retrieval',
  },
  { mount: '/v1/doccle', router: doccleRoutes, advertiseAs: 'doccle', summary: 'Doccle delivery' },

  // The callback router FIRST -- see the note above. Both mount on
  // /v1/validsign; only the second one advertises the path.
  {
    mount: '/v1/validsign',
    router: validsignCallbackRoutes,
    summary: 'ValidSign callbacks, deliberately unauthenticated',
  },
  {
    mount: '/v1/validsign',
    router: validsignRoutes,
    advertiseAs: 'validsign',
    summary: 'ValidSign signing requests',
  },

  {
    mount: '/v1/pa',
    router: paRoutes,
    advertiseAs: 'curator',
    summary: 'Policy analysis monitoring',
  },
  { mount: '/v1/pa', router: paDossiersRoutes, summary: 'Policy analysis dossiers' },

  {
    mount: '/v1/media-aggregator',
    router: mediaAggregatorRoutes,
    advertiseAs: 'mediaAggregator',
    summary: 'Aggregated media items',
  },
  {
    mount: '/v1/admin',
    router: adminRoutes,
    advertiseAs: 'admin',
    summary: 'Administrative operations',
  },
  {
    mount: '/v1/m2m',
    router: m2mRoutes,
    advertiseAs: 'm2m',
    summary: 'Machine-to-machine integration',
  },
  {
    mount: '/v1/mcp',
    router: mcpRoutes,
    advertiseAs: 'mcp',
    summary: 'Model Context Protocol endpoints',
  },
];

/**
 * The `endpoints` map the banner serves, derived from the registry rather than
 * maintained beside it. An entry can no longer be advertised without being
 * mounted, which is the whole point.
 */
export const advertisedEndpoints: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(
    routeRegistry
      .filter((route): route is RouteDefinition & { advertiseAs: string } => !!route.advertiseAs)
      .map((route) => [route.advertiseAs, route.mount])
  )
);
