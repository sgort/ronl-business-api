const mockConfig = {
  keycloak: { clientId: 'ronl-business-api' },
  edocs: {
    stubMode: false,
    allowServiceFallback: false,
    allowedClients: ['edocs-mcp-client', 'copilot-studio-edocs', 'operaton-mcp-client'],
    userId: 'testuser001',
  },
};
const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
const mockGetIdToken = jest.fn();
const mockForUser = jest.fn((p: unknown) => ({ actingAs: 'user', principal: p }));
const mockService = { actingAs: 'service', forUser: mockForUser };

jest.mock('@utils/config', () => ({ config: mockConfig }));
jest.mock('@utils/logger', () => ({ createLogger: () => mockLogger }));
jest.mock('@auth/entra-token.service', () => {
  const actual = jest.requireActual('@auth/entra-token.service');
  return {
    ...actual,
    entraTokenService: { getIdToken: (...a: unknown[]) => mockGetIdToken(...a) },
  };
});
jest.mock('@services/edocs.service', () => {
  class EdocsAccessDeniedError extends Error {
    readonly code = 'EDOCS_ACCESS_DENIED';
  }
  return { edocsService: mockService, EdocsAccessDeniedError };
});

import type { Request, Response, NextFunction } from 'express';
import { ReauthRequiredError, UserTokenUnavailableError } from '@auth/entra-token.service';
import { EdocsAccessDeniedError } from '@services/edocs.service';
import { edocsAccess, requireEdocsPrincipal, sendEdocsError } from './edocs.access';

type FakeRes = Response & { body: unknown; type: jest.Mock };
function res(): FakeRes {
  const r: {
    statusCode: number;
    body: unknown;
    status: jest.Mock;
    type: jest.Mock;
    json: jest.Mock;
  } = {
    statusCode: 200,
    body: undefined,
    status: jest.fn(),
    type: jest.fn(),
    json: jest.fn(),
  };
  r.status.mockImplementation((c: number) => {
    r.statusCode = c;
    return r;
  });
  r.type.mockImplementation(() => r);
  r.json.mockImplementation((b: unknown) => {
    r.body = b;
    return r;
  });
  return r as unknown as FakeRes;
}
const anyReq = { originalUrl: '/v1/edocs/workspaces' } as unknown as Request;
const person = (roles: string[] = ['caseworker']) =>
  ({
    path: '/workspaces',
    user: { userId: 'sub-a', roles, email: 'a@flevoland.nl', preferredUsername: 'a@flevoland.nl' },
    auth: { azp: 'ronl-business-api', token: 'kc-a' },
  }) as unknown as Request;
const machine = (azp: string) =>
  ({
    path: '/workspaces',
    user: { userId: 'svc', roles: [] },
    auth: { azp },
  }) as unknown as Request;

beforeEach(() => {
  jest.clearAllMocks();
  mockConfig.edocs.stubMode = false;
  mockConfig.edocs.allowServiceFallback = false;
});

describe('edocsAccess', () => {
  it('a listed machine client acts as the service (Review Focus 5)', async () => {
    const req = machine('operaton-mcp-client');
    const next = jest.fn();
    await edocsAccess(req, res(), next as NextFunction);
    expect(next).toHaveBeenCalledWith();
    expect(req.edocs).toBe(mockService);
    expect(req.edocsActingAs).toBe('service');
  });

  it('an unlisted machine client gets 403 EDOCS_CLIENT_NOT_ALLOWED', async () => {
    const r = res();
    await edocsAccess(machine('some-other-client'), r, jest.fn());
    expect(r.statusCode).toBe(403);
    expect(r.body).toMatchObject({ code: 'EDOCS_CLIENT_NOT_ALLOWED' });
  });

  it('a person without caseworker or admin gets 403 FORBIDDEN', async () => {
    const r = res();
    await edocsAccess(person(['citizen']), r, jest.fn());
    expect(r.statusCode).toBe(403);
    expect(r.body).toMatchObject({ code: 'FORBIDDEN' });
    expect(mockGetIdToken).not.toHaveBeenCalled();
  });

  it('a person with an Entra token acts as themselves', async () => {
    mockGetIdToken.mockResolvedValue('id-a');
    const req = person(['admin']);
    await edocsAccess(req, res(), jest.fn());
    expect(mockGetIdToken).toHaveBeenCalledWith('sub-a', 'kc-a');
    expect(req.edocsActingAs).toBe('user');
    const principal = mockForUser.mock.calls[0][0] as {
      sub: string;
      email: string;
      getIdToken: (o?: object) => Promise<string>;
    };
    expect(principal).toMatchObject({ sub: 'sub-a', email: 'a@flevoland.nl' });
    await principal.getIdToken({ forceRefresh: true });
    expect(mockGetIdToken).toHaveBeenLastCalledWith('sub-a', 'kc-a', { forceRefresh: true });
  });

  it.each([
    [new UserTokenUnavailableError(), 'EDOCS_USER_TOKEN_UNAVAILABLE'],
    [new ReauthRequiredError(), 'EDOCS_REAUTH_REQUIRED'],
  ])('records %s as the person’s problem and continues', async (err, problem) => {
    mockGetIdToken.mockRejectedValue(err);
    const req = person();
    const next = jest.fn();
    await edocsAccess(req, res(), next);
    expect(next).toHaveBeenCalledWith();
    expect(req.edocs).toBeUndefined();
    expect(req.edocsUserProblem).toBe(problem);
  });

  it('in stub mode a person acts as the (stub) service without asking Keycloak', async () => {
    mockConfig.edocs.stubMode = true;
    const req = person();
    await edocsAccess(req, res(), jest.fn());
    expect(mockGetIdToken).not.toHaveBeenCalled();
    expect(req.edocs).toBe(mockService);
  });

  it('never logs the Keycloak token (Review Focus 4)', async () => {
    const r = res();
    await edocsAccess(machine('some-other-client'), r, jest.fn());
    mockGetIdToken.mockRejectedValue(new UserTokenUnavailableError());
    await edocsAccess(person(), res(), jest.fn());
    expect(
      JSON.stringify(mockLogger.warn.mock.calls) + JSON.stringify(mockLogger.info.mock.calls)
    ).not.toContain('kc-a');
  });
});

describe('requireEdocsPrincipal', () => {
  it('passes a resolved principal', () => {
    const next = jest.fn();
    requireEdocsPrincipal({ edocs: mockService } as unknown as Request, res(), next);
    expect(next).toHaveBeenCalledWith();
  });

  it('no token → 403 EDOCS_USER_TOKEN_UNAVAILABLE', () => {
    const r = res();
    requireEdocsPrincipal(
      { ...person(), edocsUserProblem: 'EDOCS_USER_TOKEN_UNAVAILABLE' } as unknown as Request,
      r,
      jest.fn()
    );
    expect(r.statusCode).toBe(403);
    expect(r.body).toMatchObject({ code: 'EDOCS_USER_TOKEN_UNAVAILABLE' });
  });

  it('no token, fallback on → the service, visibly, with an audit line', () => {
    mockConfig.edocs.allowServiceFallback = true;
    const req = {
      ...person(),
      edocsUserProblem: 'EDOCS_USER_TOKEN_UNAVAILABLE',
    } as unknown as Request;
    const next = jest.fn();
    requireEdocsPrincipal(req, res(), next);
    expect(next).toHaveBeenCalledWith();
    expect(req.edocs).toBe(mockService);
    expect(req.edocsActingAs).toBe('service');
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('fallback'),
      expect.objectContaining({ audit: true, userId: 'sub-a', actingAs: 'testuser001' })
    );
  });

  it('reauth required → 401 EDOCS_REAUTH_REQUIRED, even with the fallback on', () => {
    mockConfig.edocs.allowServiceFallback = true;
    const r = res();
    requireEdocsPrincipal(
      { ...person(), edocsUserProblem: 'EDOCS_REAUTH_REQUIRED' } as unknown as Request,
      r,
      jest.fn()
    );
    expect(r.statusCode).toBe(401);
    expect(r.body).toMatchObject({ code: 'EDOCS_REAUTH_REQUIRED' });
  });
});

describe('sendEdocsError', () => {
  it.each([
    [new ReauthRequiredError(), 401, 'EDOCS_REAUTH_REQUIRED'],
    [new UserTokenUnavailableError(), 403, 'EDOCS_USER_TOKEN_UNAVAILABLE'],
    [new EdocsAccessDeniedError('nope'), 403, 'EDOCS_ACCESS_DENIED'],
    [new Error('boom'), 502, 'EDOCS_ERROR'],
  ])('%s → %d %s', (err, status, code) => {
    const r = res();
    sendEdocsError(anyReq, r, err, 'Failed to list eDOCS workspaces.');
    expect(r.statusCode).toBe(status);
    expect(r.body).toMatchObject({ status, code });
    expect(r.type).toHaveBeenCalledWith('application/problem+json');
  });

  it('keeps the route’s own message for an upstream failure', () => {
    const r = res();
    sendEdocsError(anyReq, r, new Error('boom'), 'Failed to list eDOCS workspaces.');
    expect(r.body).toMatchObject({ detail: 'Failed to list eDOCS workspaces.' });
  });
});
