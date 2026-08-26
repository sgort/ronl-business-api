/**
 * Unit tests for jwt.middleware — the auth gate every route (incl. eDOCS) sits
 * behind. Covers header validation, token validation success/failure, user
 * extraction, optional auth, role checks and assurance-level checks.
 *
 * jsonwebtoken and jwks-rsa are mocked at the module boundary so no real crypto
 * or Keycloak JWKS fetch happens.
 */

import type { Request, Response, NextFunction } from 'express';

jest.mock('jsonwebtoken', () => ({ __esModule: true, default: { verify: jest.fn() } }));
jest.mock('jwks-rsa', () => ({
  __esModule: true,
  default: jest.fn(() => ({ getSigningKey: jest.fn() })),
}));
jest.mock('@utils/config', () => ({
  config: {
    keycloak: { url: 'http://kc', realm: 'ronl' },
    jwt: { cacheTtl: 600, issuer: 'http://kc/realms/ronl', audience: 'ronl-api' },
  },
}));
jest.mock('@utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import jwt from 'jsonwebtoken';
import {
  jwtMiddleware,
  optionalJwtMiddleware,
  requireRoles,
  requireAssuranceLevel,
} from './jwt.middleware';

const mockVerify = (jwt as unknown as { verify: jest.Mock }).verify;

function makeRes() {
  const res = {} as Response & { statusCode: number };
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

const basePayload = {
  sub: 'user-1',
  municipality: 'flevoland',
  organisation_type: 'province',
  loa: 'substantieel',
  realm_access: { roles: ['public-affairs', 'viewer'] },
  name: 'Test User',
  preferred_username: 'tuser',
  employeeId: 'E-1',
  azp: 'ronl-frontend',
};

beforeEach(() => jest.clearAllMocks());

describe('jwtMiddleware', () => {
  it('401 MISSING_TOKEN when Authorization header is absent', async () => {
    const req = { headers: {}, path: '/x', ip: '1.1.1.1' } as unknown as Request;
    const res = makeRes();
    const next = jest.fn();
    await jwtMiddleware(req, res, next as NextFunction);
    expect(res.status).toHaveBeenCalledWith(401);
    expect((res.json as jest.Mock).mock.calls[0][0].error.code).toBe('MISSING_TOKEN');
    expect(next).not.toHaveBeenCalled();
  });

  it('401 MISSING_TOKEN when the scheme is not Bearer', async () => {
    const req = {
      headers: { authorization: 'Basic abc' },
      path: '/x',
    } as unknown as Request;
    const res = makeRes();
    await jwtMiddleware(req, res, jest.fn() as NextFunction);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('attaches user + auth context and calls next on a valid token', async () => {
    mockVerify.mockImplementation((_t, _k, _o, cb) => cb(null, basePayload));
    const req = {
      headers: { authorization: 'Bearer good.token', 'user-agent': 'jest' },
      path: '/x',
      ip: '2.2.2.2',
    } as unknown as Request;
    const res = makeRes();
    const next = jest.fn();

    await jwtMiddleware(req, res, next as NextFunction);

    expect(next).toHaveBeenCalled();
    expect(req.user).toMatchObject({
      userId: 'user-1',
      tenantId: 'flevoland',
      organisationType: 'province',
      roles: ['public-affairs', 'viewer'],
      assuranceLevel: 'substantieel',
    });
    expect(req.auth).toMatchObject({ azp: 'ronl-frontend', ipAddress: '2.2.2.2' });
    expect(res.status).not.toHaveBeenCalled();
  });

  it('defaults roles to [] when realm_access is absent', async () => {
    mockVerify.mockImplementation((_t, _k, _o, cb) =>
      cb(null, { ...basePayload, realm_access: undefined })
    );
    const req = {
      headers: { authorization: 'Bearer good.token' },
      path: '/x',
    } as unknown as Request;
    const res = makeRes();
    const next = jest.fn();
    await jwtMiddleware(req, res, next as NextFunction);
    expect(req.user?.roles).toEqual([]);
    expect(next).toHaveBeenCalled();
  });

  it('propagates email and splits displayName on the FIRST space', async () => {
    mockVerify.mockImplementation((_t, _k, _o, cb) =>
      cb(null, { ...basePayload, name: 'Jan van der Berg', email: 'jan@example.nl' })
    );
    const req = {
      headers: { authorization: 'Bearer good.token' },
      path: '/x',
    } as unknown as Request;
    const res = makeRes();
    const next = jest.fn();
    await jwtMiddleware(req, res, next as NextFunction);
    expect(req.user?.email).toBe('jan@example.nl');
    // Splitting on the LAST space would give lastName "Berg" and drop "van der".
    expect(req.user?.givenName).toBe('Jan');
    expect(req.user?.familyName).toBe('van der Berg');
  });

  it('falls back to preferred_username for name-splitting when displayName is absent', async () => {
    mockVerify.mockImplementation((_t, _k, _o, cb) =>
      cb(null, { ...basePayload, name: undefined, preferred_username: 'jdoe' })
    );
    const req = {
      headers: { authorization: 'Bearer good.token' },
      path: '/x',
    } as unknown as Request;
    const res = makeRes();
    const next = jest.fn();
    await jwtMiddleware(req, res, next as NextFunction);
    expect(req.user?.givenName).toBe('jdoe');
    expect(req.user?.familyName).toBeUndefined();
    expect(req.user?.email).toBeUndefined();
  });

  it('401 INVALID_TOKEN when verification fails', async () => {
    mockVerify.mockImplementation((_t, _k, _o, cb) => cb(new Error('expired'), undefined));
    const req = {
      headers: { authorization: 'Bearer bad.token' },
      path: '/x',
    } as unknown as Request;
    const res = makeRes();
    const next = jest.fn();
    await jwtMiddleware(req, res, next as NextFunction);
    expect(res.status).toHaveBeenCalledWith(401);
    expect((res.json as jest.Mock).mock.calls[0][0].error.code).toBe('INVALID_TOKEN');
    expect(next).not.toHaveBeenCalled();
  });
});

describe('optionalJwtMiddleware', () => {
  it('continues without auth when no token is present', async () => {
    const req = { headers: {}, path: '/x' } as unknown as Request;
    const res = makeRes();
    const next = jest.fn();
    await optionalJwtMiddleware(req, res, next as NextFunction);
    expect(next).toHaveBeenCalled();
    expect(req.user).toBeUndefined();
  });

  it('validates when a token is present', async () => {
    mockVerify.mockImplementation((_t, _k, _o, cb) => cb(null, basePayload));
    const req = {
      headers: { authorization: 'Bearer good.token' },
      path: '/x',
    } as unknown as Request;
    const res = makeRes();
    const next = jest.fn();
    await optionalJwtMiddleware(req, res, next as NextFunction);
    expect(req.user?.userId).toBe('user-1');
    expect(next).toHaveBeenCalled();
  });
});

describe('requireRoles', () => {
  const run = (user: unknown, roles: string[]) => {
    const req = { user } as unknown as Request;
    const res = makeRes();
    const next = jest.fn();
    requireRoles(...roles)(req, res, next as NextFunction);
    return { res, next };
  };

  it('401 when no user is attached', () => {
    const { res, next } = run(undefined, ['admin']);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next when the user has one of the required roles', () => {
    const { res, next } = run({ userId: 'u', roles: ['viewer', 'admin'] }, ['admin']);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('403 when the user lacks all required roles', () => {
    const { res, next } = run({ userId: 'u', roles: ['viewer'] }, ['admin']);
    expect(res.status).toHaveBeenCalledWith(403);
    expect((res.json as jest.Mock).mock.calls[0][0].error.code).toBe('FORBIDDEN');
    expect(next).not.toHaveBeenCalled();
  });
});

describe('requireAssuranceLevel', () => {
  const run = (user: unknown, min: 'basis' | 'midden' | 'substantieel' | 'hoog') => {
    const req = { user } as unknown as Request;
    const res = makeRes();
    const next = jest.fn();
    requireAssuranceLevel(min)(req, res, next as NextFunction);
    return { res, next };
  };

  it('401 when no user is attached', () => {
    const { res, next } = run(undefined, 'substantieel');
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next when the user meets the minimum level', () => {
    const { res, next } = run({ userId: 'u', assuranceLevel: 'hoog' }, 'substantieel');
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('403 INSUFFICIENT_ASSURANCE when the user is below the minimum level', () => {
    const { res, next } = run({ userId: 'u', assuranceLevel: 'basis' }, 'substantieel');
    expect(res.status).toHaveBeenCalledWith(403);
    expect((res.json as jest.Mock).mock.calls[0][0].error.code).toBe('INSUFFICIENT_ASSURANCE');
    expect(next).not.toHaveBeenCalled();
  });
});
