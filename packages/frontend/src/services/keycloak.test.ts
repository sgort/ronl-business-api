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
