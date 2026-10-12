// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const kc = vi.hoisted(() => ({ tokenParsed: undefined as Record<string, unknown> | undefined }));
vi.mock('../../services/keycloak', () => ({ default: kc }));

import { readViewer, useViewer } from './useViewer';

afterEach(() => {
  kc.tokenParsed = undefined;
  vi.restoreAllMocks();
});

describe('useViewer', () => {
  it('reads sub and realm roles from the token', () => {
    kc.tokenParsed = { sub: 'sub-1', realm_access: { roles: ['caseworker', 'rip-projectleider'] } };
    expect(readViewer()).toEqual({ userId: 'sub-1', roles: ['caseworker', 'rip-projectleider'] });
    const { result } = renderHook(() => useViewer());
    expect(result.current.userId).toBe('sub-1');
  });

  it('is anonymous with no roles without a token', () => {
    expect(readViewer()).toEqual({ userId: null, roles: [] });
  });

  it('logs nothing', () => {
    const log = vi.spyOn(console, 'log');
    kc.tokenParsed = { sub: 'sub-1', bsn: '999993653', realm_access: { roles: [] } };
    readViewer();
    expect(log).not.toHaveBeenCalled();
  });
});
