/**
 * Structural guard: every /v1/public/* route is GET-only and carries no
 * auth middleware, EXCEPT the small, explicit allow-list of write endpoints
 * that exist for the IOU use-case/feedback forms. If a future change adds a
 * write verb or an auth check to a content route, this test fails — it
 * inspects the real Express router, not a mock.
 */

jest.mock('@utils/altcha', () => ({ createChallenge: jest.fn(), verifySolution: jest.fn() }));
jest.mock('@services/nieuws.service', () => ({ getNieuwsItems: jest.fn() }));
jest.mock('@services/berichten.service', () => ({
  getBerichtenItems: jest.fn(),
  getBerichtById: jest.fn(),
}));
jest.mock('@services/productenDiensten.service', () => ({ getProductenDienstenItems: jest.fn() }));
jest.mock('@services/regelcatalogus.service', () => ({
  getRegelcatalogusData: jest.fn(),
  getRegelcatalogusCacheInfo: jest.fn(),
}));
jest.mock('@services/lde.service', () => ({
  getPublicProcesses: jest.fn(),
  getPublicProcessByKey: jest.fn(),
}));
jest.mock('@services/search.service', () => ({
  getPublicIndex: jest.fn(),
  searchPublicIndex: jest.fn(),
  facetCounts: jest.fn(),
  getPublicItemBySlug: jest.fn(),
}));
jest.mock('@utils/config', () => ({
  config: {
    altcha: { hmacKey: '' },
    gitlab: { token: '', baseUrl: '', projectPath: '', ucLabel: '' },
  },
}));
jest.mock('@utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import publicRouter from './public.routes';

// Paths that are intentionally NOT GET-only: the IOU use-case/feedback
// write forms. Everything else on this router must be a content read.
const WRITE_ALLOWLIST = new Set(['/use-case', '/upload-file', '/feedback']);

interface RouteLayer {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ name: string }>;
  };
}

function routeLayers(): NonNullable<RouteLayer['route']>[] {
  const stack = (publicRouter as unknown as { stack: RouteLayer[] }).stack;
  return stack.map((l) => l.route).filter((r): r is NonNullable<RouteLayer['route']> => !!r);
}

describe('public.routes — GET-only, no-auth guard', () => {
  const routes = routeLayers();

  it('found at least the expected read routes (guards against an empty/broken router)', () => {
    const paths = routes.map((r) => r.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        '/nieuws',
        '/berichten',
        '/producten-diensten',
        '/regelcatalogus',
        '/processen',
        '/zoeken',
      ])
    );
  });

  it.each(routes.map((r) => [r.path, r] as const))(
    '%s: content routes are GET-only, write routes are on the allow-list',
    (path, route) => {
      const methods = Object.keys(route.methods).filter((m) => route.methods[m]);
      if (WRITE_ALLOWLIST.has(path)) {
        expect(methods).toContain('post');
      } else if (path === '/altcha/challenge' || path === '/use-cases') {
        expect(methods).toEqual(['get']);
      } else {
        expect(methods).toEqual(['get']);
      }
    }
  );

  it('no route layer references auth-style middleware by name', () => {
    const forbiddenNamePattern = /requireAuth|verifyToken|checkJwt|authenticate/i;
    for (const route of routes) {
      for (const layer of route.stack) {
        expect(layer.name).not.toMatch(forbiddenNamePattern);
      }
    }
  });
});
