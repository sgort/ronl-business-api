/**
 * Unit tests for tenant-access: the one module that decides tenant questions
 * for process and task access (#218, #219).
 */

const mockWarn = jest.fn();
jest.mock('@utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: mockWarn, error: jest.fn(), debug: jest.fn() }),
}));

import express from 'express';
import request from 'supertest';
import {
  RESERVED_PROCESS_VARIABLES,
  TENANT_MISMATCH_MESSAGE,
  denyTenant,
  isCitizen,
  reservedVariablesIn,
  resolveStartTenant,
  tenantAllows,
} from './tenant-access';

const citizen = (tenantId: string) => ({ tenantId, roles: ['citizen'] });
const staff = (tenantId: string, roles = ['caseworker']) => ({ tenantId, roles });

beforeEach(() => jest.clearAllMocks());

describe('isCitizen', () => {
  it('is true for a token carrying the citizen role', () => {
    expect(isCitizen({ roles: ['citizen'] })).toBe(true);
  });

  it('is false for staff roles, including ones that are not caseworker', () => {
    expect(isCitizen({ roles: ['caseworker'] })).toBe(false);
    expect(isCitizen({ roles: ['public-affairs', 'pa-author'] })).toBe(false);
    expect(isCitizen({ roles: ['woo-coordinatie'] })).toBe(false);
  });

  it('is false when the token has no roles claim at all', () => {
    expect(isCitizen({} as { roles: string[] })).toBe(false);
  });
});

describe('tenantAllows', () => {
  const user = { tenantId: 'flevoland' };

  it('admits an exactly equal label', () => {
    expect(tenantAllows(user, 'flevoland')).toBe(true);
  });

  it('refuses a different tenant', () => {
    expect(tenantAllows(user, 'utrecht')).toBe(false);
  });

  it('refuses a missing or empty label', () => {
    expect(tenantAllows(user, undefined)).toBe(false);
    expect(tenantAllows(user, null)).toBe(false);
    expect(tenantAllows(user, '')).toBe(false);
  });

  it('refuses a label that differs only in case', () => {
    expect(tenantAllows(user, 'Flevoland')).toBe(false);
  });

  it('refuses a non-string label', () => {
    expect(tenantAllows(user, 42)).toBe(false);
    expect(tenantAllows(user, { value: 'flevoland' })).toBe(false);
  });

  it('refuses when the caller has no tenant, even against an empty label', () => {
    expect(tenantAllows({ tenantId: '' }, '')).toBe(false);
  });
});

describe('resolveStartTenant', () => {
  it('untenanted deployment: stamps the caller tenant, for anyone', () => {
    expect(resolveStartTenant(staff('utrecht'), null)).toEqual({
      allowed: true,
      municipality: 'utrecht',
      originTenantId: 'utrecht',
    });
    expect(resolveStartTenant(citizen('unive'), null)).toEqual({
      allowed: true,
      municipality: 'unive',
      originTenantId: 'unive',
    });
  });

  it('same tenant: stamps the caller tenant, for anyone', () => {
    expect(resolveStartTenant(staff('flevoland'), 'flevoland')).toEqual({
      allowed: true,
      municipality: 'flevoland',
      originTenantId: 'flevoland',
    });
    expect(resolveStartTenant(citizen('flevoland'), 'flevoland')).toEqual({
      allowed: true,
      municipality: 'flevoland',
      originTenantId: 'flevoland',
    });
  });

  it('different tenant, citizen: stamps the deployed tenant and records the origin', () => {
    expect(resolveStartTenant(citizen('unive'), 'toeslagen')).toEqual({
      allowed: true,
      municipality: 'toeslagen',
      originTenantId: 'unive',
    });
  });

  it('different tenant, staff: refused', () => {
    expect(resolveStartTenant(staff('utrecht'), 'flevoland')).toEqual({ allowed: false });
  });

  it('different tenant, no roles claim: treated as staff and refused', () => {
    expect(resolveStartTenant({ tenantId: 'utrecht' } as never, 'flevoland')).toEqual({
      allowed: false,
    });
  });
});

describe('reservedVariablesIn', () => {
  it('returns [] for no variables and for none reserved', () => {
    expect(reservedVariablesIn({})).toEqual([]);
    expect(reservedVariablesIn({ decision: 'x', amount: 5 })).toEqual([]);
  });

  it('returns each reserved key present, in the maps own order', () => {
    expect(reservedVariablesIn({ applicantId: 'u', decision: 'x', municipality: 'm' })).toEqual([
      'applicantId',
      'municipality',
    ]);
  });

  it('RESERVED_PROCESS_VARIABLES is exactly the three tenant-decision keys', () => {
    expect(RESERVED_PROCESS_VARIABLES).toEqual(['municipality', 'originTenantId', 'applicantId']);
  });
});

describe('denyTenant', () => {
  const app = express();
  app.get('/probe', (req, res) => {
    req.user = { userId: 'u-1', tenantId: 'utrecht' } as never;
    denyTenant(req, res, { processInstanceId: 'pi-1' });
  });
  app.get('/probe-no-context', (req, res) => {
    denyTenant(req, res);
  });

  it('answers 403 TENANT_MISMATCH with the one message', async () => {
    const res = await request(app).get('/probe');
    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      success: false,
      error: { code: 'TENANT_MISMATCH', message: TENANT_MISMATCH_MESSAGE },
    });
    expect(TENANT_MISMATCH_MESSAGE).toBe('Access denied: organisation mismatch');
  });

  it('logs the caller and the context it was given', async () => {
    await request(app).get('/probe');
    expect(mockWarn).toHaveBeenCalledWith(
      'Tenant mismatch',
      expect.objectContaining({
        userId: 'u-1',
        userTenant: 'utrecht',
        path: '/probe',
        processInstanceId: 'pi-1',
      })
    );
  });

  it('answers the same way without a context or a user', async () => {
    const res = await request(app).get('/probe-no-context');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('TENANT_MISMATCH');
  });
});
