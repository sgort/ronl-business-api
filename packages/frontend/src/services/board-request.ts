/**
 * A board chosen on a landing page, carried through the login.
 *
 * post_login_redirect says where to go after login, and the dashboards write
 * it too when someone logs in from them. This marker says something more: the
 * person picked this board on a landing page. Only then does a login without
 * the board's role end in the no-access dialog on that landing page, instead
 * of quietly landing on the role's own dashboard.
 *
 * In a module of its own, without keycloak-js, so the landing page can use it.
 */
const KEY = 'login_board_request';

export interface BoardRequest {
  /** The dashboard path chosen, e.g. /dashboard/woo. */
  route: string;
  /** The landing page it was chosen on: / or a tenant page such as /amsterdam. */
  landing: string;
}

/**
 * Router state AuthCallback hands the landing page when the chosen board is
 * refused: which board, who is signed in, and their own dashboard, if any.
 */
export interface AccessDeniedState {
  route: string;
  name: string | undefined;
  home: string | null;
}

/** A landing page we would send someone back to; anything else becomes /. */
const LANDING_PATH = /^\/(?:[a-z][a-z0-9-]{1,30})?$/;

export function rememberBoardRequest(route: string, landing: string): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ route, landing }));
  } catch {
    /* sessionStorage unavailable: the login falls back to the role dashboard */
  }
}

export function forgetBoardRequest(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* non-fatal */
  }
}

/** Reads and clears the request. A route outside /dashboard/ is ignored. */
export function consumeBoardRequest(): BoardRequest | null {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
  forgetBoardRequest();
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const { route, landing } = (parsed ?? {}) as { route?: unknown; landing?: unknown };
  if (typeof route !== 'string' || !route.startsWith('/dashboard/')) return null;
  return {
    route,
    landing: typeof landing === 'string' && LANDING_PATH.test(landing) ? landing : '/',
  };
}
