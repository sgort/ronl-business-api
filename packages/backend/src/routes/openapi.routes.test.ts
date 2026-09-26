// openapi.routes imports @utils/logger, which imports @utils/config, whose
// validateConfig() throws at import without a full environment.
jest.mock('@utils/config', () => ({ config: { nodeEnv: 'test', deploymentEnv: 'test' } }));
jest.mock('@utils/logger', () => {
  const stub = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  return { __esModule: true, default: stub, createLogger: () => stub };
});

import express from 'express';
import request from 'supertest';

import { createOpenApiRouter } from './openapi.routes';
import type { OpenApiDocument } from '../openapi/document';

const document = {
  openapi: '3.1.0',
  info: { title: 'RONL Business API', version: '2026.09.11' },
  paths: { '/health': { get: {} } },
} as unknown as OpenApiDocument;

function appWith(load: () => OpenApiDocument) {
  const app = express();
  app.use('/v1/openapi.json', createOpenApiRouter(load));
  return app;
}

describe('GET /v1/openapi.json', () => {
  test('serves the document', async () => {
    const response = await request(appWith(() => document)).get('/v1/openapi.json');

    expect(response.status).toBe(200);
    expect(response.body.openapi).toBe('3.1.0');
    expect(response.body.info.version).toBe('2026.09.11');
  });

  test('allows any origin, so a browser-based viewer can fetch it', async () => {
    const response = await request(appWith(() => document))
      .get('/v1/openapi.json')
      .set('Origin', 'https://example.invalid');

    expect(response.headers['access-control-allow-origin']).toBe('*');
  });

  // The read happens at module load, NOT on first request: a zip deploy
  // overwrites the file before it restarts the process, so a lazy read lets an
  // old process serve a document from an artifact it is not running.
  test('reads once at construction, not per request', async () => {
    const load = jest.fn(() => document);
    const app = appWith(load);

    await request(app).get('/v1/openapi.json');
    await request(app).get('/v1/openapi.json');

    expect(load).toHaveBeenCalledTimes(1);
  });

  test('a later change on disk is not served until the process restarts', async () => {
    let onDisk = { ...document, info: { ...document.info, version: 'first' } };
    const app = appWith(() => onDisk);

    onDisk = { ...document, info: { ...document.info, version: 'second' } };
    const response = await request(app).get('/v1/openapi.json');

    expect(response.body.info.version).toBe('first');
  });

  describe('when the document cannot be read', () => {
    // A missing document means a broken build, which should be loud -- but
    // crashing at module load would take the whole service down for one
    // documentation endpoint. The failure is answered per request instead.
    test('constructing the router does not throw', () => {
      expect(() =>
        createOpenApiRouter(() => {
          throw new Error('ENOENT');
        })
      ).not.toThrow();
    });

    test('answers 500 with the error envelope', async () => {
      const response = await request(
        appWith(() => {
          throw new Error('ENOENT');
        })
      ).get('/v1/openapi.json');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        success: false,
        error: { code: 'OPENAPI_UNAVAILABLE', message: 'The OpenAPI description is not available' },
      });
    });
  });
});
