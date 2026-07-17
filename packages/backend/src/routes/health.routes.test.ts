/**
 * Route tests for the health/readiness surface (/v1/health).
 * operatonService and global fetch are mocked; these are public probes (no jwt).
 */

jest.mock('@services/operaton.service', () => ({
  operatonService: { healthCheck: jest.fn() },
}));
jest.mock('@utils/config', () => ({
  config: { keycloak: { url: 'http://kc', realm: 'ronl' }, nodeEnv: 'test' },
}));
jest.mock('@utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import express from 'express';
import request from 'supertest';
import healthRouter from './health.routes';
import { operatonService } from '@services/operaton.service';

const opHealth = (operatonService as unknown as { healthCheck: jest.Mock }).healthCheck;

const app = express();
app.use('/v1/health', healthRouter);

const mockFetch = jest.fn();
beforeAll(() => {
  global.fetch = mockFetch as unknown as typeof fetch;
});
beforeEach(() => jest.clearAllMocks());

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
