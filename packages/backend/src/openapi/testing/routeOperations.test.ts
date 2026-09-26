import express from 'express';

import {
  HTTP_METHODS,
  listDocumentedOperations,
  listServedOperations,
  toDocumentPath,
} from './routeOperations';
import type { OpenApiDocument } from '../document';

describe('toDocumentPath', () => {
  test('strips the /v1 prefix and converts Express params to OpenAPI ones', () => {
    expect(toDocumentPath('/v1/task', '/:taskId/form')).toBe('/task/{taskId}/form');
  });

  test("a router's root path is the mount itself", () => {
    expect(toDocumentPath('/v1/health', '/')).toBe('/health');
  });

  test('converts every parameter, not only the first', () => {
    expect(toDocumentPath('/v1/edocs', '/workspaces/:workspaceId/documents/:documentId')).toBe(
      '/edocs/workspaces/{workspaceId}/documents/{documentId}'
    );
  });

  test('refuses a mount outside /v1', () => {
    expect(() => toDocumentPath('/internal/thing', '/')).toThrow('not a /v1 mount');
  });
});

describe('listServedOperations', () => {
  test('reports each method of each route, sorted', () => {
    const router = express.Router();
    router.post('/', (_req, res) => res.end());
    router.get('/:id', (_req, res) => res.end());

    expect(listServedOperations([{ mount: '/v1/things', router }])).toEqual([
      'GET /things/{id}',
      'POST /things',
    ]);
  });

  test('skips middleware, which carries no route', () => {
    const router = express.Router();
    router.use((_req, _res, next) => next());
    router.get('/', (_req, res) => res.end());

    expect(listServedOperations([{ mount: '/v1/things', router }])).toEqual(['GET /things']);
  });

  // Two routers share /v1/validsign and two share /v1/pa. An operation is a
  // path plus a method regardless of which router answers it, and a duplicate
  // would otherwise have to be documented twice to satisfy the gate.
  test('deduplicates across routers mounted on the same path', () => {
    const first = express.Router();
    first.get('/status', (_req, res) => res.end());
    const second = express.Router();
    second.get('/status', (_req, res) => res.end());

    expect(
      listServedOperations([
        { mount: '/v1/dup', router: first },
        { mount: '/v1/dup', router: second },
      ])
    ).toEqual(['GET /dup/status']);
  });

  // The three rules below are why this helper throws rather than skips.
  // Skipping would hide an operation from the coverage gate, which is the
  // exact failure the gate exists to prevent.
  test('refuses a nested router', () => {
    const parent = express.Router();
    parent.use('/nested', express.Router());

    expect(() => listServedOperations([{ mount: '/v1/things', router: parent }])).toThrow(
      'nested routers are not supported'
    );
  });

  test('refuses a non-string route path', () => {
    const router = express.Router();
    router.get(/^\/regex$/, (_req, res) => res.end());

    expect(() => listServedOperations([{ mount: '/v1/things', router }])).toThrow(
      'only string route paths are supported'
    );
  });

  test('refuses a method the document cannot express', () => {
    const router = express.Router();
    router.all('/everything', (_req, res) => res.end());

    expect(() => listServedOperations([{ mount: '/v1/things', router }])).toThrow(
      /unsupported method/
    );
  });
});

describe('listDocumentedOperations', () => {
  const document = {
    openapi: '3.1.0',
    info: { title: 'test', version: '0' },
    paths: {
      '/things': { get: {}, post: {} },
      '/things/{id}': { delete: {} },
    },
  } as unknown as OpenApiDocument;

  test('reports each documented method, sorted', () => {
    expect(listDocumentedOperations(document)).toEqual([
      'DELETE /things/{id}',
      'GET /things',
      'POST /things',
    ]);
  });

  test('ignores path-item keys that are not operations', () => {
    const withExtras = {
      ...document,
      paths: { '/things': { get: {}, summary: 'not an operation', parameters: [] } },
    } as unknown as OpenApiDocument;

    expect(listDocumentedOperations(withExtras)).toEqual(['GET /things']);
  });
});

describe('HTTP_METHODS', () => {
  // head and options are answered by Express for free and are not operations a
  // hand-written document describes; trace is not served at all.
  test('covers the methods this API serves and no others', () => {
    expect([...HTTP_METHODS]).toEqual(['get', 'post', 'put', 'patch', 'delete']);
  });
});
