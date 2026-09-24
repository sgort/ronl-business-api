import express from 'express';
import request from 'supertest';

import { versionMiddleware } from './version.middleware';
import packageJson from '../../package.json';

function app() {
  const instance = express();
  instance.use(versionMiddleware);
  instance.get('/anything', (_req, res) => res.json({ ok: true }));
  instance.get('/boom', (_req, res) => res.status(500).json({ ok: false }));
  return instance;
}

describe('versionMiddleware', () => {
  test('sets API-Version to the released version', async () => {
    const response = await request(app()).get('/anything');

    expect(response.headers['api-version']).toBe(packageJson.version);
  });

  // The document says every response carries it, including error responses --
  // the shared Error response component references the header too.
  test('sets it on error responses as well', async () => {
    const response = await request(app()).get('/boom');

    expect(response.status).toBe(500);
    expect(response.headers['api-version']).toBe(packageJson.version);
  });

  test('sets it on a 404, which no route handler produces', async () => {
    const response = await request(app()).get('/no-such-path');

    expect(response.status).toBe(404);
    expect(response.headers['api-version']).toBe(packageJson.version);
  });

  // CalVer, not semver: this is why openapi/.spectral.yaml switches
  // nlgov:semver off rather than rewriting the version to satisfy it.
  test('the version it reports is the CalVer release string', async () => {
    const response = await request(app()).get('/anything');

    expect(response.headers['api-version']).toMatch(/^\d{4}\.\d{2}\.\d+$/);
  });

  test('passes the request on', async () => {
    const response = await request(app()).get('/anything');

    expect(response.body).toEqual({ ok: true });
  });
});
