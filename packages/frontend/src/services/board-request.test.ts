// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { consumeBoardRequest, forgetBoardRequest, rememberBoardRequest } from './board-request';

afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('board request', () => {
  it('round-trips the chosen board and the landing page it was chosen on, once', () => {
    rememberBoardRequest('/dashboard/woo', '/');

    expect(consumeBoardRequest()).toEqual({ route: '/dashboard/woo', landing: '/' });
    expect(consumeBoardRequest()).toBeNull();
  });

  it('keeps a tenant landing page', () => {
    rememberBoardRequest('/dashboard/caseworker', '/amsterdam');

    expect(consumeBoardRequest()?.landing).toBe('/amsterdam');
  });

  it('is gone after forgetBoardRequest', () => {
    rememberBoardRequest('/dashboard/woo', '/');
    forgetBoardRequest();

    expect(consumeBoardRequest()).toBeNull();
  });

  it.each([
    [
      'a route outside /dashboard/',
      JSON.stringify({ route: 'https://evil.example', landing: '/' }),
    ],
    ['malformed JSON', '{nope'],
    ['a missing route', JSON.stringify({ landing: '/' })],
  ])('ignores %s', (_label, raw) => {
    sessionStorage.setItem('login_board_request', raw);

    expect(consumeBoardRequest()).toBeNull();
    expect(sessionStorage.getItem('login_board_request')).toBeNull();
  });

  it.each(['//evil.example', 'https://evil.example', '/amsterdam/x', '/Amsterdam', 42])(
    'sends an unexpected landing (%s) back to /',
    (landing) => {
      sessionStorage.setItem(
        'login_board_request',
        JSON.stringify({ route: '/dashboard/woo', landing })
      );

      expect(consumeBoardRequest()).toEqual({ route: '/dashboard/woo', landing: '/' });
    }
  );

  it('survives sessionStorage being unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(() => rememberBoardRequest('/dashboard/woo', '/')).not.toThrow();
    expect(() => forgetBoardRequest()).not.toThrow();
    expect(consumeBoardRequest()).toBeNull();
  });
});
