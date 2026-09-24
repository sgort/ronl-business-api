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
import { createRootRouter } from './root.routes';
import packageJson from '../../package.json';

// A fixture rather than the real registry: importing that would pull in all 19
// route modules to test a JSON literal, which is the coupling root.routes.ts is
// written to avoid. That every advertised path is really mounted is checked in
// routes/registry.test.ts (#200).
const ADVERTISED_ENDPOINTS = {
  health: '/v1/health',
  documentation: '/v1/openapi.json',
  process: '/v1/process',
};

const app = express();
app.use('/', createRootRouter(ADVERTISED_ENDPOINTS));

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

  it('advertises the OpenAPI document, which is now served', async () => {
    // The other half of #67, closed by #200. The banner carried
    // `documentation: '/v1/docs'` from the initial commit and nothing ever
    // mounted it, so the field was REMOVED rather than left pointing at a 404.
    //
    // This test asserted that absence. It now asserts the opposite, because the
    // document is served: /v1/openapi.json. The old assertion would still pass
    // untouched -- `documentation` lives under `endpoints`, not at the top
    // level -- which is exactly why it is replaced rather than left green.
    const res = await request(app).get('/');

    expect(res.body.endpoints).toHaveProperty('documentation', '/v1/openapi.json');
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

  it('advertises exactly the endpoint map it is given', async () => {
    // The banner and the mounts drifting apart is the defect in #67. The map is
    // no longer exported from here: index.ts passes in routes/registry.ts's,
    // which is the same array it mounts from, and registry.test.ts checks that
    // every advertised path is mounted. What is left to test here is that the
    // banner renders what it was handed, whole and unaltered.
    const res = await request(app).get('/');
    expect(res.body.endpoints).toEqual(ADVERTISED_ENDPOINTS);
  });
});
