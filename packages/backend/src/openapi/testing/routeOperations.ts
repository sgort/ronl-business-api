// packages/backend/src/openapi/testing/routeOperations.ts
//
// The operations Express actually serves under /v1, and the operations the
// OpenAPI document describes, in one notation ("GET /task/{id}/form"), so
// src/openapi/coverage.test.ts can compare them (#200).
//
// Anything the walk cannot read reliably -- a nested router, router.all, a
// regular-expression path -- THROWS. Skipping it would hide an operation from
// the gate, which is the failure the gate exists to prevent. None exist in
// this backend today: every router.use() call in the route modules applies
// middleware (jwtMiddleware, tenantMiddleware, requireRoles), which the walk
// skips correctly because those layers carry no `route`.

import type { RouteDefinition } from '../../routes/registry';
import type { OpenApiDocument } from '../document';

export const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

interface StackLayer {
  name?: string;
  route?: { path: unknown; methods: Record<string, boolean> };
}

/** '/v1/task' + '/:id/form' is '/task/{id}/form'. */
export function toDocumentPath(mount: string, routePath: string): string {
  if (!mount.startsWith('/v1/')) throw new Error(`${mount} is not a /v1 mount`);

  const subPath = routePath === '/' ? '' : routePath;
  return `${mount.slice('/v1'.length)}${subPath}`.replace(/:(\w+)/g, '{$1}');
}

export function listServedOperations(
  routes: ReadonlyArray<Pick<RouteDefinition, 'mount' | 'router'>>
): string[] {
  const operations: string[] = [];

  for (const { mount, router } of routes) {
    for (const layer of (router as unknown as { stack: StackLayer[] }).stack) {
      if (layer.name === 'router') throw new Error(`${mount}: nested routers are not supported`);
      if (!layer.route) continue; // middleware, such as jwtMiddleware or cors()

      const { path: routePath, methods } = layer.route;
      if (typeof routePath !== 'string') {
        throw new Error(`${mount}: only string route paths are supported`);
      }

      for (const method of Object.keys(methods)) {
        if (!(HTTP_METHODS as readonly string[]).includes(method)) {
          throw new Error(`${mount}${routePath}: unsupported method ${method}`);
        }
        operations.push(`${method.toUpperCase()} ${toDocumentPath(mount, routePath)}`);
      }
    }
  }

  // Deduplicated: two routers share the /v1/validsign mount and two share
  // /v1/pa, and an operation is a path plus a method regardless of which
  // router answers it. Without this a duplicate would have to be documented
  // twice to satisfy the gate, which is not a thing a document can express.
  return [...new Set(operations)].sort();
}

export function listDocumentedOperations(document: OpenApiDocument): string[] {
  const operations: string[] = [];

  for (const [documentPath, pathItem] of Object.entries(document.paths)) {
    for (const method of HTTP_METHODS) {
      if (method in pathItem) operations.push(`${method.toUpperCase()} ${documentPath}`);
    }
  }

  return operations.sort();
}
