// The registry imports every route module. The real @utils/config is used --
// scripts/jest-setup-env.cjs provides the one variable validateConfig() demands --
// because a stub would have to satisfy every field 19 route modules read.
jest.mock('@utils/logger', () => {
  const stub = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  return { __esModule: true, default: stub, createLogger: () => stub };
});

import { advertisedEndpoints, routeRegistry } from './registry';

describe('routeRegistry', () => {
  test('every mount is under /v1', () => {
    expect(routeRegistry.filter((r) => !r.mount.startsWith('/v1/'))).toEqual([]);
  });

  test('every entry carries a router and a summary', () => {
    for (const route of routeRegistry) {
      expect(typeof route.router).toBe('function');
      expect(route.summary.length).toBeGreaterThan(0);
    }
  });

  // The ValidSign callback router MUST precede the authenticated one on the
  // same mount: ValidSign sends no token, so the authenticated router would
  // reject its callback. This was a comment in index.ts and is now the order
  // of an array, which is exactly the kind of thing that gets "tidied".
  test('the ValidSign callback router is mounted before the authenticated one', () => {
    const validsign = routeRegistry
      .map((route, index) => ({ ...route, index }))
      .filter((route) => route.mount === '/v1/validsign');

    expect(validsign).toHaveLength(2);
    expect(validsign[0].summary).toMatch(/callback/i);
    expect(validsign[0].index).toBeLessThan(validsign[1].index);
  });

  test('only /v1/validsign and /v1/pa mount more than one router', () => {
    const counts = new Map<string, number>();
    for (const { mount } of routeRegistry) counts.set(mount, (counts.get(mount) ?? 0) + 1);

    expect(
      [...counts]
        .filter(([, n]) => n > 1)
        .map(([mount]) => mount)
        .sort()
    ).toEqual(['/v1/pa', '/v1/validsign']);
  });
});

describe('advertisedEndpoints', () => {
  test('advertises each path once, under a distinct key', () => {
    const paths = Object.values(advertisedEndpoints);
    expect(new Set(paths).size).toBe(paths.length);
  });

  // The whole reason the registry exists: the banner cannot advertise a path
  // that is not mounted, because both come from the same array. This is the
  // drift that let /v1/docs be promised from the initial commit while nothing
  // ever served it (#67).
  test('every advertised path is mounted', () => {
    const mounted = new Set(routeRegistry.map((r) => r.mount));
    for (const path of Object.values(advertisedEndpoints)) {
      expect(mounted.has(path)).toBe(true);
    }
  });

  test('advertises the OpenAPI document, closing #67', () => {
    expect(advertisedEndpoints.documentation).toBe('/v1/openapi.json');
  });

  test('is frozen, so a caller cannot edit the banner in place', () => {
    expect(Object.isFrozen(advertisedEndpoints)).toBe(true);
  });

  test('a second router on an advertised mount adds no second key', () => {
    // /v1/pa carries two routers; only one advertises.
    expect(Object.values(advertisedEndpoints).filter((p) => p === '/v1/pa')).toHaveLength(1);
  });
});
