// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useLandingLogin } from './landing-login';

const mockNavigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }));

const request = () => JSON.parse(sessionStorage.getItem('login_board_request') ?? 'null');

beforeEach(() => {
  sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
});

describe('useLandingLogin', () => {
  describe('startMedewerkerLogin', () => {
    it('with a board, remembers it as chosen on this landing page', () => {
      window.history.replaceState(null, '', '/amsterdam');
      const { result } = renderHook(() => useLandingLogin());

      result.current.startMedewerkerLogin('/dashboard/caseworker', 'test-caseworker-amsterdam');

      expect(sessionStorage.getItem('post_login_redirect')).toBe('/dashboard/caseworker');
      expect(sessionStorage.getItem('username_hint')).toBe('test-caseworker-amsterdam');
      expect(sessionStorage.getItem('selected_idp')).toBe('medewerker');
      expect(request()).toEqual({ route: '/dashboard/caseworker', landing: '/amsterdam' });
      expect(mockNavigate).toHaveBeenCalledWith('/auth');
    });

    it('without a board, chooses none and forgets an earlier choice', () => {
      sessionStorage.setItem('login_board_request', '{"route":"/dashboard/woo","landing":"/"}');
      const { result } = renderHook(() => useLandingLogin());

      result.current.startMedewerkerLogin();

      expect(request()).toBeNull();
      expect(sessionStorage.getItem('selected_idp')).toBe('medewerker');
    });
  });

  describe('startEntraBoardLogin', () => {
    it('logs in with the Flevoland account and keeps the chosen board', () => {
      sessionStorage.setItem('username_hint', 'test-woo-flevoland');
      const { result } = renderHook(() => useLandingLogin());

      result.current.startEntraBoardLogin('/dashboard/public-affairs');

      expect(sessionStorage.getItem('selected_idp')).toBe('entra-flevoland');
      expect(sessionStorage.getItem('post_login_redirect')).toBe('/dashboard/public-affairs');
      expect(sessionStorage.getItem('username_hint')).toBeNull();
      expect(request()).toEqual({ route: '/dashboard/public-affairs', landing: '/' });
      expect(mockNavigate).toHaveBeenCalledWith('/auth');
    });
  });

  describe('startIdpLogin', () => {
    it('drops a board chosen earlier, with its redirect', () => {
      sessionStorage.setItem('post_login_redirect', '/dashboard/woo');
      sessionStorage.setItem('login_board_request', '{"route":"/dashboard/woo","landing":"/"}');
      const { result } = renderHook(() => useLandingLogin());

      result.current.startIdpLogin('digid', 'test-citizen-flevoland');

      expect(sessionStorage.getItem('post_login_redirect')).toBeNull();
      expect(request()).toBeNull();
      expect(sessionStorage.getItem('username_hint')).toBe('test-citizen-flevoland');
      expect(sessionStorage.getItem('selected_idp')).toBe('digid');
    });
  });

  it('still navigates when sessionStorage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { result } = renderHook(() => useLandingLogin());

    result.current.startMedewerkerLogin('/dashboard/caseworker');
    result.current.startEntraBoardLogin('/dashboard/caseworker');
    result.current.startIdpLogin('digid');

    expect(mockNavigate).toHaveBeenCalledTimes(3);
    vi.restoreAllMocks();
  });
});
