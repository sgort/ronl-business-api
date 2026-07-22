// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import keycloak, { getToken, getUser } from './keycloak';

describe('getUser', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    keycloak.tokenParsed = undefined;
  });

  it('returns null when there is no parsed token', () => {
    keycloak.tokenParsed = undefined;
    expect(getUser()).toBeNull();
  });

  it('extracts user fields and realm roles from the parsed token', () => {
    keycloak.tokenParsed = {
      sub: 'user-123',
      name: 'Wessel Kooyman',
      municipality: 'Utrecht',
      organisation_type: 'gemeente',
      loa: 'hoog',
      preferred_username: 'test-citizen-utrecht',
      bsn: '999992235',
      employeeId: 'E-1',
      realm_access: { roles: ['citizen', 'authenticated'] },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    expect(getUser()).toEqual({
      sub: 'user-123',
      name: 'Wessel Kooyman',
      municipality: 'Utrecht',
      organisation_type: 'gemeente',
      loa: 'hoog',
      roles: ['citizen', 'authenticated'],
      preferred_username: 'test-citizen-utrecht',
      bsn: '999992235',
      employeeId: 'E-1',
    });
  });

  it('defaults roles to an empty array when realm_access is missing', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    keycloak.tokenParsed = { sub: 'user-123' } as any;

    expect(getUser()?.roles).toEqual([]);
  });
});

describe('getToken', () => {
  it('returns the current access token', () => {
    keycloak.token = 'abc.def.ghi';
    expect(getToken()).toBe('abc.def.ghi');
  });

  it('returns undefined when there is no token', () => {
    keycloak.token = undefined;
    expect(getToken()).toBeUndefined();
  });
});

describe('initializeKeycloak', () => {
  // A Keycloak instance can only be .init()'d once ever, and AuthCallback /
  // ProtectedRoute can each be the first caller in a given page load — this
  // memoizes across both. `initPromise` is module-level state, so each test
  // needs its own fresh module instance (vi.resetModules + re-import) rather
  // than sharing the top-level `keycloak` import the getUser/getToken tests
  // above use.
  beforeEach(() => {
    vi.resetModules();
  });

  it('calls keycloak.init with passive check-sso options on the first call', async () => {
    const { default: kc, initializeKeycloak } = await import('./keycloak');
    const initSpy = vi.spyOn(kc, 'init').mockResolvedValue(true);

    const result = await initializeKeycloak();

    expect(result).toBe(true);
    expect(initSpy).toHaveBeenCalledTimes(1);
    expect(initSpy).toHaveBeenCalledWith(expect.objectContaining({ onLoad: 'check-sso' }));
  });

  it('memoizes — a later call does not init() again', async () => {
    const { default: kc, initializeKeycloak } = await import('./keycloak');
    const initSpy = vi.spyOn(kc, 'init').mockResolvedValue(true);

    const first = await initializeKeycloak();
    const second = await initializeKeycloak();

    expect(first).toBe(true);
    expect(second).toBe(true);
    expect(initSpy).toHaveBeenCalledTimes(1);
  });
});
