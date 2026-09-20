/**
 * Route tests for the service banner at `/`.
 *
 * This response had never been tested. It is the first thing a new consumer
 * reads, and it promised documentation at /v1/docs that was never mounted —
 * since `388599b`, the initial commit (#67). A claim nothing exercises is a
 * claim nothing can contradict, which is why the banner now lives in a router
 * of its own rather than inline in index.ts, where importing it starts a
 * server.
 */
export {};

jest.mock('@utils/config', () => ({
  config: { deploymentEnv: 'acceptance' },
}));

import express from 'express';
import request from 'supertest';
import rootRouter, { ADVERTISED_ENDPOINTS } from './root.routes';
import packageJson from '../../package.json';

const app = express();
app.use('/', rootRouter);

describe('GET /', () => {
  it('identifies the service, its release and its tier', async () => {
    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      name: 'RONL Business API',
      version: packageJson.version,
      status: 'running',
      environment: 'acceptance',
    });
  });

  it('advertises no documentation endpoint, because none is served', async () => {
    // #67: the banner carried `documentation: '/v1/docs'` and nothing ever
    // mounted it — `git log -S "app.use('/v1/docs'"` finds no handler added and
    // later removed, and there is no OpenAPI or Swagger dependency anywhere in
    // the backend. A consumer following the field got a 404.
    //
    // Serving real documentation is the better answer and remains open; until
    // something serves it, saying nothing beats pointing at a 404.
    const res = await request(app).get('/');

    expect(res.body).not.toHaveProperty('documentation');
    expect(JSON.stringify(res.body)).not.toContain('/v1/docs');
  });

  it('advertises only paths under /v1', async () => {
    // A weak invariant, but it is the one this banner broke: every value here
    // is a promise that something answers at that path.
    const res = await request(app).get('/');

    const paths = Object.values(res.body.endpoints as Record<string, string>);
    expect(paths.length).toBeGreaterThan(0);
    for (const p of paths) {
      expect(p).toMatch(/^\/v1\//);
    }
  });

  it('exports the advertised endpoints, so index.ts mounts from one list', async () => {
    // The banner and the mounts drifting apart is the defect in #67. Exporting
    // the map is what lets a reader check them against each other in one place
    // instead of two hundred lines apart.
    const res = await request(app).get('/');
    expect(res.body.endpoints).toEqual(ADVERTISED_ENDPOINTS);
  });
});
