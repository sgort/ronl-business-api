import fs from 'fs';
import os from 'os';
import path from 'path';

import express from 'express';
import request from 'supertest';

import type { OpenApiDocument } from '../document';
import { expectToMatchOperation } from './conformance';

const THING = { id: 't1', createdAt: '2026-09-15T07:00:00.000Z' };

// A fixture document rather than the real one: these tests are about the
// helper, and pinning them to openapi.yaml would make every documentation
// change able to break them for reasons that have nothing to do with the
// helper's behaviour.
const DOCUMENT: OpenApiDocument = {
  openapi: '3.1.0',
  info: { title: 'Fixture', version: '1.0.0' },
  paths: {
    '/things': {
      get: {
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ThingList' } },
            },
          },
          '500': {
            description: 'Error',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['success'],
                  properties: { success: { const: false } },
                },
              },
            },
          },
        },
      },
    },
    '/things/{id}/xml': {
      get: {
        responses: {
          '200': {
            description: 'XML',
            content: { 'application/xml': { schema: { type: 'string', pattern: '^<' } } },
          },
        },
      },
    },
    '/schemaless': {
      get: {
        responses: { '200': { description: 'Untyped JSON', content: { 'application/json': {} } } },
      },
    },
    '/untyped': {
      get: {
        responses: {
          '204': { description: 'No content' },
          default: {
            description: 'Anything else',
            content: { 'application/vnd.fixture+json': { schema: { type: 'object' } } },
          },
        },
      },
    },
    '/undocumented-responses': { get: {} },
  },
  components: {
    schemas: {
      ThingList: {
        type: 'object',
        required: ['success', 'data'],
        properties: {
          success: { const: true },
          data: { type: 'array', items: { $ref: '#/components/schemas/Thing' } },
        },
      },
      Thing: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' }, createdAt: { type: 'string', format: 'date-time' } },
        example: THING,
      },
    },
  },
};

function makeApp() {
  const app = express();
  const versioned = (res: express.Response) => res.set('API-Version', '1.0.0');

  app.get('/things', (req, res) => {
    switch (req.query.case) {
      case 'bad-shape':
        return versioned(res).json({ success: true, data: [{ createdAt: THING.createdAt }] });
      case 'bad-date':
        return versioned(res).json({ success: true, data: [{ id: 't1', createdAt: 'yesterday' }] });
      case 'no-version':
        return res.json({ success: true, data: [THING] });
      case 'text':
        return versioned(res).type('text/plain').send('hello');
      case 'no-content-type':
        return versioned(res).status(200).end();
      case 'error':
        return res.status(500).json({ success: false });
      case 'teapot':
        return res.status(418).json({});
      default:
        return versioned(res).json({ success: true, data: [THING] });
    }
  });
  app.get('/things/:id/xml', (req, res) => {
    versioned(res)
      .type('application/xml')
      .send(req.query.case === 'bad' ? 'not xml' : '<dmn/>');
  });
  app.get('/schemaless', (_req, res) => {
    versioned(res).json({ anything: true });
  });
  app.get('/untyped', (req, res) => {
    if (req.query.case === 'teapot') {
      res.status(418).type('application/vnd.fixture+json').send('{}');
      return;
    }
    versioned(res).status(204).end();
  });
  app.get('/undocumented-responses', (_req, res) => {
    versioned(res).json({});
  });
  return app;
}

const get = (url: string) => request(makeApp()).get(url);

describe('expectToMatchOperation', () => {
  test('passes a documented response, resolving component references', async () => {
    const res = await get('/things');

    expect(() => expectToMatchOperation(res, 'get', '/things', DOCUMENT)).not.toThrow();
  });

  test('fails when the body does not match the schema', async () => {
    const res = await get('/things?case=bad-shape');

    expect(() => expectToMatchOperation(res, 'get', '/things', DOCUMENT)).toThrow(
      /GET \/things answered 200 with a body that does not match the document:\n.*must have required property 'id'/
    );
  });

  test('checks formats', async () => {
    const res = await get('/things?case=bad-date');

    expect(() => expectToMatchOperation(res, 'get', '/things', DOCUMENT)).toThrow(
      /must match format "date-time"/
    );
  });

  test('fails a 2xx response without the API-Version header', async () => {
    const res = await get('/things?case=no-version');

    expect(() => expectToMatchOperation(res, 'get', '/things', DOCUMENT)).toThrow(
      'GET /things answered 200 without the API-Version header'
    );
  });

  test('does not require the API-Version header on an error response', async () => {
    const res = await get('/things?case=error');

    expect(() => expectToMatchOperation(res, 'get', '/things', DOCUMENT)).not.toThrow();
  });

  test('fails an undocumented content type', async () => {
    const res = await get('/things?case=text');

    expect(() => expectToMatchOperation(res, 'get', '/things', DOCUMENT)).toThrow(
      'GET /things answered 200 with text/plain; documented: application/json'
    );
  });

  test('fails a response without a content type where one is documented', async () => {
    const res = await get('/things?case=no-content-type');

    expect(() => expectToMatchOperation(res, 'get', '/things', DOCUMENT)).toThrow(
      'GET /things answered 200 with no content type; documented: application/json'
    );
  });

  test('fails an undocumented status', async () => {
    const res = await get('/things?case=teapot');

    expect(() => expectToMatchOperation(res, 'get', '/things', DOCUMENT)).toThrow(
      'GET /things does not document status 418'
    );
  });

  test('fails an operation that documents no responses', async () => {
    const res = await get('/undocumented-responses');

    expect(() => expectToMatchOperation(res, 'get', '/undocumented-responses', DOCUMENT)).toThrow(
      'GET /undocumented-responses does not document status 200'
    );
  });

  test('falls back to the default response and validates +json bodies as JSON', async () => {
    const res = await get('/untyped?case=teapot');

    expect(() => expectToMatchOperation(res, 'get', '/untyped', DOCUMENT)).not.toThrow();
  });

  test('passes a response that documents no content', async () => {
    const res = await get('/untyped');

    expect(() => expectToMatchOperation(res, 'get', '/untyped', DOCUMENT)).not.toThrow();
  });

  test('passes a documented media type without a schema', async () => {
    const res = await get('/schemaless');

    expect(() => expectToMatchOperation(res, 'get', '/schemaless', DOCUMENT)).not.toThrow();
  });

  test('validates a non-JSON body as text', async () => {
    const good = await get('/things/1/xml');
    const bad = await get('/things/1/xml?case=bad');

    expect(() => expectToMatchOperation(good, 'get', '/things/{id}/xml', DOCUMENT)).not.toThrow();
    expect(() => expectToMatchOperation(bad, 'get', '/things/{id}/xml', DOCUMENT)).toThrow(
      /must match pattern "\^<"/
    );
  });

  test('works with a document that has no components', async () => {
    const res = await get('/things/1/xml');
    const bare: OpenApiDocument = { ...DOCUMENT, components: undefined };

    expect(() => expectToMatchOperation(res, 'get', '/things/{id}/xml', bare)).not.toThrow();
  });

  describe('recording what it was asked about', () => {
    // scripts/check-conformance-coverage.cjs reads this log to fail a build
    // where a documented operation was never compared against a response.
    const LOG = path.join(os.tmpdir(), `conformance-record-${process.pid}.log`);
    const original = process.env.CONFORMANCE_LOG;

    afterEach(() => {
      if (original === undefined) delete process.env.CONFORMANCE_LOG;
      else process.env.CONFORMANCE_LOG = original;
      fs.rmSync(LOG, { force: true });
    });

    test('appends the operation to CONFORMANCE_LOG', async () => {
      process.env.CONFORMANCE_LOG = LOG;
      fs.writeFileSync(LOG, '');

      expectToMatchOperation(await get('/things'), 'get', '/things', DOCUMENT);

      expect(fs.readFileSync(LOG, 'utf8')).toBe('get /things\n');
    });

    test('records an operation whose check then FAILS, so the gap is not hidden', async () => {
      process.env.CONFORMANCE_LOG = LOG;
      fs.writeFileSync(LOG, '');

      const res = await get('/things?case=bad-shape');
      expect(() => expectToMatchOperation(res, 'get', '/things', DOCUMENT)).toThrow(
        /does not match the document/
      );

      expect(fs.readFileSync(LOG, 'utf8')).toBe('get /things\n');
    });

    test('an unwritable log does not fail the caller', async () => {
      process.env.CONFORMANCE_LOG = path.join(LOG, 'not-a-directory', 'x.log');

      const res = await get('/things');
      expect(() => expectToMatchOperation(res, 'get', '/things', DOCUMENT)).not.toThrow();
    });

    test('records nothing when CONFORMANCE_LOG is unset', async () => {
      delete process.env.CONFORMANCE_LOG;
      fs.writeFileSync(LOG, '');

      expectToMatchOperation(await get('/things'), 'get', '/things', DOCUMENT);

      expect(fs.readFileSync(LOG, 'utf8')).toBe('');
    });
  });

  test.each([
    ['post', '/things', 'POST /things is not documented'],
    ['get', '/nowhere', 'GET /nowhere is not documented'],
  ] as const)('fails an undocumented operation (%s %s)', async (method, path, message) => {
    const res = await get('/things');

    expect(() => expectToMatchOperation(res, method, path, DOCUMENT)).toThrow(message);
  });
});
