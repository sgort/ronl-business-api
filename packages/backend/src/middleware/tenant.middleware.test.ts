/**
 * Unit tests for tenant.middleware — tenant isolation, param validation, and
 * process-variable tagging. config.tenant.enableIsolation is toggled per test.
 */

import type { Request, Response, NextFunction } from 'express';

const mockConfig = { tenant: { enableIsolation: true } };
jest.mock('@utils/config', () => ({ config: mockConfig }));
jest.mock('@utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import {
  tenantMiddleware,
  validateTenantParam,
  addTenantToProcessVariables,
} from './tenant.middleware';

function makeRes() {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockConfig.tenant.enableIsolation = true;
});

describe('tenantMiddleware', () => {
  it('short-circuits to next when isolation is disabled', () => {
    mockConfig.tenant.enableIsolation = false;
    const req = {} as Request;
    const res = makeRes();
    const next = jest.fn();
    tenantMiddleware(req, res, next as NextFunction);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('401 when isolation is on but no user is attached', () => {
    const req = {} as Request;
    const res = makeRes();
    const next = jest.fn();
    tenantMiddleware(req, res, next as NextFunction);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('403 MISSING_TENANT when the user has no tenantId', () => {
    const req = { user: { userId: 'u', tenantId: '' } } as unknown as Request;
    const res = makeRes();
    const next = jest.fn();
    tenantMiddleware(req, res, next as NextFunction);
    expect(res.status).toHaveBeenCalledWith(403);
    expect((res.json as jest.Mock).mock.calls[0][0].error.code).toBe('MISSING_TENANT');
  });

  it('establishes tenant context and syncs req.auth.tenantId', () => {
    const req = {
      user: { userId: 'u', tenantId: 'flevoland', organisationType: 'province' },
      auth: { userId: 'u', tenantId: 'stale', requestId: 'r1' },
      path: '/x',
    } as unknown as Request;
    const res = makeRes();
    const next = jest.fn();
    tenantMiddleware(req, res, next as NextFunction);
    expect(next).toHaveBeenCalled();
    expect(req.auth?.tenantId).toBe('flevoland');
  });
});

describe('validateTenantParam', () => {
  it('401 when no user is attached', () => {
    const req = { params: {} } as unknown as Request;
    const res = makeRes();
    const next = jest.fn();
    validateTenantParam()(req, res, next as NextFunction);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('403 TENANT_MISMATCH when the param differs from the user tenant', () => {
    const req = {
      user: { userId: 'u', tenantId: 'flevoland' },
      params: { tenantId: 'utrecht' },
      path: '/x',
    } as unknown as Request;
    const res = makeRes();
    const next = jest.fn();
    validateTenantParam()(req, res, next as NextFunction);
    expect(res.status).toHaveBeenCalledWith(403);
    expect((res.json as jest.Mock).mock.calls[0][0].error.code).toBe('TENANT_MISMATCH');
  });

  it('calls next when the param matches the user tenant', () => {
    const req = {
      user: { userId: 'u', tenantId: 'flevoland' },
      params: { tenantId: 'flevoland' },
    } as unknown as Request;
    const res = makeRes();
    const next = jest.fn();
    validateTenantParam()(req, res, next as NextFunction);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('honours a custom param name', () => {
    const req = {
      user: { userId: 'u', tenantId: 'flevoland' },
      params: { org: 'flevoland' },
    } as unknown as Request;
    const res = makeRes();
    const next = jest.fn();
    validateTenantParam('org')(req, res, next as NextFunction);
    expect(next).toHaveBeenCalled();
  });
});

describe('addTenantToProcessVariables', () => {
  it('passes through untouched when no user is attached', () => {
    const req = { body: {} } as Request;
    const next = jest.fn();
    addTenantToProcessVariables(req, makeRes(), next as NextFunction);
    expect(next).toHaveBeenCalled();
    expect((req.body as Record<string, unknown>).variables).toBeUndefined();
  });

  it('keeps a caller-supplied business key so a phase can inherit it', () => {
    const req = {
      user: { tenantId: 'flevoland', organisationType: 'gemeente', userId: 'u1' },
      body: { businessKey: 'flevoland-1788277164739', variables: {} },
    } as unknown as Request;
    const next = jest.fn();

    addTenantToProcessVariables(req, makeRes(), next as NextFunction);

    const body = req.body as { businessKey: string; variables: Record<string, unknown> };
    expect(body.businessKey).toBe('flevoland-1788277164739');
    // The tenant context is still applied -- honouring the key does not mean
    // honouring anything else the caller sent.
    expect(body.variables.municipality).toBe('flevoland');
    expect(next).toHaveBeenCalled();
  });

  it('injects businessKey and tenant-scoped variables', () => {
    const req = {
      user: {
        userId: 'u-1',
        tenantId: 'flevoland',
        organisationType: 'province',
        assuranceLevel: 'substantieel',
      },
      body: {},
    } as unknown as Request;
    const next = jest.fn();
    addTenantToProcessVariables(req, makeRes(), next as NextFunction);
    const body = req.body as { businessKey: string; variables: Record<string, unknown> };
    expect(body.businessKey).toMatch(/^flevoland-\d+$/);
    expect(body.variables).toMatchObject({
      municipality: 'flevoland',
      organisationType: 'province',
      initiator: 'u-1',
      assuranceLevel: 'substantieel',
      applicantId: 'u-1',
    });
    expect(next).toHaveBeenCalled();
  });

  it('preserves pre-existing variables', () => {
    const req = {
      user: { userId: 'u-1', tenantId: 'flevoland' },
      body: { variables: { existing: 'keep' } },
    } as unknown as Request;
    const next = jest.fn();
    addTenantToProcessVariables(req, makeRes(), next as NextFunction);
    const body = req.body as { variables: Record<string, unknown> };
    expect(body.variables.existing).toBe('keep');
    expect(body.variables.municipality).toBe('flevoland');
  });
});
