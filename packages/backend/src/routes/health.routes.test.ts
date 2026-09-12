/**
 * Route tests for the health/readiness surface (/v1/health).
 * operatonService and global fetch are mocked; these are public probes (no jwt).
 */

jest.mock('@services/operaton.service', () => ({
  operatonService: { healthCheck: jest.fn() },
}));
jest.mock('@utils/config', () => ({
  config: {
    keycloak: { url: 'http://kc', realm: 'ronl' },
    nodeEnv: 'test',
    deploymentEnv: 'acceptance',
  },
}));
jest.mock('@utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));
// Spread requireActual before overriding, so an export added to pa-cache later
// is inherited rather than silently undefined — the failure mode that once made
// GET /v1/pa/types answer 500 while every route test passed.
jest.mock('../pa-monitoring/pa-cache', () => ({
  ...jest.requireActual('../pa-monitoring/pa-cache'),
  cacheHealth: jest.fn(),
}));

import express from 'express';
import request from 'supertest';
import healthRouter from './health.routes';
import { operatonService } from '@services/operaton.service';
import { cacheHealth } from '../pa-monitoring/pa-cache';

const opHealth = (operatonService as unknown as { healthCheck: jest.Mock }).healthCheck;
const mockCacheHealth = cacheHealth as jest.Mock;

const app = express();
app.use('/v1/health', healthRouter);

const mockFetch = jest.fn();
beforeAll(() => {
  global.fetch = mockFetch as unknown as typeof fetch;
});
beforeEach(() => {
  jest.clearAllMocks();
  mockCacheHealth.mockResolvedValue({ status: 'up' });
});

describe('GET /v1/health', () => {
  it('200 healthy when Operaton and Keycloak are both up', async () => {
    opHealth.mockResolvedValue({ status: 'up' });
    mockFetch.mockResolvedValue({ ok: true, status: 200 });

    const res = await request(app).get('/v1/health');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('healthy');
    expect(res.body.data.dependencies.operaton.status).toBe('up');
    expect(res.body.data.dependencies.keycloak.status).toBe('up');
  });

  it('503 degraded when Operaton is down', async () => {
    opHealth.mockResolvedValue({ status: 'down' });
    mockFetch.mockResolvedValue({ ok: true, status: 200 });

    const res = await request(app).get('/v1/health');
    expect(res.status).toBe(503);
    expect(res.body.data.status).toBe('degraded');
  });

  it('marks Keycloak down when the JWKS endpoint returns non-OK', async () => {
    opHealth.mockResolvedValue({ status: 'up' });
    mockFetch.mockResolvedValue({ ok: false, status: 500 });

    const res = await request(app).get('/v1/health');
    expect(res.status).toBe(503);
    expect(res.body.data.dependencies.keycloak).toMatchObject({
      status: 'down',
      error: 'HTTP 500',
    });
  });

  it('marks Keycloak down when the JWKS fetch throws', async () => {
    opHealth.mockResolvedValue({ status: 'up' });
    mockFetch.mockRejectedValue(new Error('network'));

    const res = await request(app).get('/v1/health');
    expect(res.body.data.dependencies.keycloak).toMatchObject({ status: 'down', error: 'network' });
  });

  it('503 unhealthy when the Operaton health check throws', async () => {
    opHealth.mockRejectedValue(new Error('operaton exploded'));

    const res = await request(app).get('/v1/health');
    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.data.status).toBe('unhealthy');
    expect(res.body.data.error).toBe('operaton exploded');
  });
});

describe('GET /v1/health/live', () => {
  it('always returns 200 alive without touching dependencies', async () => {
    const res = await request(app).get('/v1/health/live');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('alive');
    expect(opHealth).not.toHaveBeenCalled();
  });
});

describe('GET /v1/health/ready', () => {
  it('200 ready when Operaton is up', async () => {
    opHealth.mockResolvedValue({ status: 'up' });
    const res = await request(app).get('/v1/health/ready');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ready');
  });

  it('503 not ready when Operaton is down', async () => {
    opHealth.mockResolvedValue({ status: 'down' });
    const res = await request(app).get('/v1/health/ready');
    expect(res.status).toBe(503);
    expect(res.body.data.reason).toBe('Operaton unavailable');
  });

  it('503 with error when the readiness check throws', async () => {
    opHealth.mockRejectedValue(new Error('boom'));
    const res = await request(app).get('/v1/health/ready');
    expect(res.status).toBe(503);
    expect(res.body.data.error).toBe('boom');
  });
});

describe('GET /v1/health/external', () => {
  it('maps each target to up/down based on reachability', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true }) // cprmv
      .mockResolvedValueOnce({ ok: false }) // triplydb
      .mockRejectedValueOnce(new Error('timeout')); // lde

    const res = await request(app).get('/v1/health/external');

    expect(res.status).toBe(200);
    expect(res.body.data.cprmv.status).toBe('up');
    expect(res.body.data.triplydb.status).toBe('down');
    expect(res.body.data.lde.status).toBe('down');
  });
});

describe('reported environment', () => {
  it('reports the deployment tier rather than the Node runtime mode', async () => {
    // ACC runs with NODE_ENV=production so it behaves like production; the tier
    // is what a reader of /v1/health actually needs to know. The mocked config
    // deliberately has the two disagreeing.
    opHealth.mockResolvedValue({ status: 'up' });
    mockFetch.mockResolvedValue({ ok: true });

    const res = await request(app).get('/v1/health');

    expect(res.body.data.environment).toBe('acceptance');
  });
});

describe('GET /v1/health — the PA cache', () => {
  it('reports the cache alongside keycloak and operaton', async () => {
    opHealth.mockResolvedValue({ status: 'up' });
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
    mockCacheHealth.mockResolvedValue({ status: 'up' });

    const res = await request(app).get('/v1/health');

    expect(res.status).toBe(200);
    expect(res.body.data.dependencies.cache).toEqual({ status: 'up' });
  });

  it('stays healthy when the cache is down, and says so', async () => {
    // The cache is optional: every source client falls through to a live fetch
    // without it. A down cache must be VISIBLE without failing the check — the
    // whole point of #62, where a dependency failing 100% of the time still
    // read "healthy" because nothing reported it.
    opHealth.mockResolvedValue({ status: 'up' });
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
    mockCacheHealth.mockResolvedValue({ status: 'down', error: 'read ECONNRESET' });

    const res = await request(app).get('/v1/health');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('healthy');
    expect(res.body.data.dependencies.cache).toEqual({
      status: 'down',
      error: 'read ECONNRESET',
    });
  });

  it('does not 503 the health check when the cache probe itself throws', async () => {
    // cacheHealth() is written never to reject, but the route must not depend on
    // that: an optional dependency has no business failing the whole check.
    opHealth.mockResolvedValue({ status: 'up' });
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
    mockCacheHealth.mockRejectedValue(new Error('Invalid URL'));

    const res = await request(app).get('/v1/health');

    expect(res.status).toBe(200);
    expect(res.body.data.dependencies.cache.status).toBe('down');
  });
});

describe('GET /v1/health — failure paths', () => {
  it('reports keycloak down when the JWKS fetch rejects outright', async () => {
    opHealth.mockResolvedValue({ status: 'up' });
    mockFetch.mockRejectedValue(new Error('getaddrinfo ENOTFOUND kc'));

    const res = await request(app).get('/v1/health');

    expect(res.status).toBe(503);
    expect(res.body.data.status).toBe('degraded');
    expect(res.body.data.dependencies.keycloak).toEqual({
      status: 'down',
      error: 'getaddrinfo ENOTFOUND kc',
    });
  });

  it('reports keycloak down with the status when JWKS answers non-2xx', async () => {
    opHealth.mockResolvedValue({ status: 'up' });
    mockFetch.mockResolvedValue({ ok: false, status: 500 });

    const res = await request(app).get('/v1/health');

    expect(res.status).toBe(503);
    expect(res.body.data.dependencies.keycloak).toEqual({ status: 'down', error: 'HTTP 500' });
  });

  it('503s unhealthy when the probe itself throws, rather than reporting degraded', async () => {
    // A required dependency failing is 'degraded'; the check being unable to run
    // at all is 'unhealthy'. The two are distinct and the payload differs.
    opHealth.mockRejectedValue(new Error('operaton client exploded'));
    mockFetch.mockResolvedValue({ ok: true, status: 200 });

    const res = await request(app).get('/v1/health');

    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.data.status).toBe('unhealthy');
    expect(res.body.data.error).toBe('operaton client exploded');
  });

  it('survives a cache probe that rejects with a non-Error', async () => {
    // The String(err) arm. A rejected non-Error is what a stray `throw 'oops'`
    // or an aborted promise produces, and it must not take the endpoint down.
    opHealth.mockResolvedValue({ status: 'up' });
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
    mockCacheHealth.mockRejectedValue('socket closed');

    const res = await request(app).get('/v1/health');

    expect(res.status).toBe(200);
    expect(res.body.data.dependencies.cache).toEqual({
      status: 'down',
      error: 'socket closed',
    });
  });
});
