import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import keycloak, { initializeKeycloak } from '../services/keycloak';

const POST_LOGIN_KEY = 'post_login_redirect';

function getRoleDashboard(): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const roles: string[] = (keycloak.tokenParsed as any)?.realm_access?.roles ?? [];
  if (roles.includes('woo-coordinatie')) return '/dashboard/woo';
  if (roles.includes('infra-projectteam')) return '/dashboard/infra-board';
  if (roles.includes('public-affairs')) return '/dashboard/public-affairs';
  return roles.includes('caseworker') ? '/dashboard/caseworker' : '/dashboard/citizen';
}

/**
 * Read & clear the post-login redirect target.
 *
 * V2 (and any future dashboards) write this key before navigating to /auth so
 * users come back to the dashboard they started in instead of always landing
 * on V1. We whitelist `/dashboard/...` paths to prevent open-redirect abuse.
 */
function consumePostLoginRedirect(): string | null {
  let target: string | null = null;
  try {
    target = sessionStorage.getItem(POST_LOGIN_KEY);
    sessionStorage.removeItem(POST_LOGIN_KEY);
  } catch {
    /* sessionStorage unavailable */
  }
  if (target && target.startsWith('/dashboard/')) {
    return target;
  }
  return null;
}

function canAccessRedirect(path: string, roles: string[]): boolean {
  if (path === '/dashboard/woo') return roles.includes('woo-coordinatie');
  if (path === '/dashboard/infra-board') return roles.includes('infra-projectteam');
  if (path === '/dashboard/public-affairs') return roles.includes('public-affairs');
  // A stored redirect is a board the user chose (a landing-page card, or the
  // dashboard they logged in from), so it wins over the default board. An
  // earlier exception refused /dashboard/caseworker to infra-projectteam
  // members: it dated from when the caseworker dashboard was the only login
  // entry and stored that redirect on every login.
  if (path === '/dashboard/caseworker') return roles.includes('caseworker');
  return true;
}

function navigateAfterLogin(navigate: (to: string, opts?: { replace?: boolean }) => void) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const roles: string[] = (keycloak.tokenParsed as any)?.realm_access?.roles ?? [];
  const stored = consumePostLoginRedirect();
  const target = stored && canAccessRedirect(stored, roles) ? stored : getRoleDashboard();
  navigate(target, { replace: true });
}

/**
 * Authentication callback page.
 *
 * Both flows now start the same way: `initializeKeycloak()` — a passive
 * `check-sso`, never triggers a redirect by itself — then explicitly call
 * `keycloak.login(...)` if that comes back unauthenticated. (An earlier
 * version had the citizen flow call `keycloak.init({ onLoad:
 * 'login-required', idpHint })` directly; that broke the moment anything
 * else in the app — e.g. ProtectedRoute on a protected route visited while
 * logged out — had already called the shared, memoized init first with
 * different options. `.init()` can only run once ever; `.login()` has no
 * such restriction, so it's the only safe way to trigger a real redirect
 * from more than one call site.)
 *
 * External-IdP flows (digid / eherkenning / eidas / entra-flevoland):
 *   Not authenticated → keycloak.login({ idpHint }) redirects to the
 *   external IdP. entra-flevoland is Provincie Flevoland's Entra ID, brokered
 *   by Keycloak (scripts/keycloak-add-entra-idp.sh). Where the hinted
 *   provider is not configured, Keycloak falls back to its native login form
 *   without a context banner.
 *
 * Medewerker flow:
 *   Not authenticated → keycloak.login({ loginHint: '__medewerker__' }) so
 *   the login.ftl template can detect the sentinel and show the medewerker
 *   banner.
 *
 * Post-login redirect:
 *   If sessionStorage holds a `post_login_redirect` value (set by the calling
 *   dashboard, e.g. /v2 before sending the user to /auth), and it points at a
 *   /dashboard/... path, we honour that instead of the default role dashboard.
 *   This is what lets users log in from /v2 and land back on /v2.
 */
export default function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const selectedIdp = sessionStorage.getItem('selected_idp');
        const isMedewerker = selectedIdp === 'medewerker';
        const authenticated = await initializeKeycloak();

        if (isMedewerker) {
          if (authenticated) {
            sessionStorage.removeItem('selected_idp');
            sessionStorage.removeItem('username_hint');
            navigateAfterLogin(navigate);
          } else {
            const usernameHint = sessionStorage.getItem('username_hint') ?? undefined;
            sessionStorage.removeItem('username_hint');
            await keycloak.login({ loginHint: usernameHint ?? '__medewerker__' });
          }
        } else {
          if (authenticated) {
            sessionStorage.removeItem('selected_idp');
            navigateAfterLogin(navigate);
          } else {
            await keycloak.login(selectedIdp ? { idpHint: selectedIdp } : undefined);
          }
        }
      } catch (err) {
        console.error('Keycloak initialization error:', err);
        setError('Er is een fout opgetreden bij het inloggen. Probeer het opnieuw.');
      }
    };

    initializeAuth();
  }, [navigate]);

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-t-2xl p-8 text-white text-center shadow-lg">
            <h1 className="text-3xl font-bold mb-2">MijnOmgeving</h1>
            <p className="text-blue-100">Demo portaal van Open Regels</p>
          </div>
          <div className="bg-white rounded-b-2xl shadow-xl p-8 text-center">
            <div className="text-red-500 text-4xl mb-4">⚠</div>
            <p className="text-gray-700 mb-6">{error}</p>
            <button
              onClick={() => navigate('/')}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold"
            >
              Terug naar inlogkeuze
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-t-2xl p-8 text-white text-center shadow-lg">
          <h1 className="text-3xl font-bold mb-2">MijnOmgeving</h1>
          <p className="text-blue-100">Demo portaal van Open Regels</p>
        </div>
        <div className="bg-white rounded-b-2xl shadow-xl p-8 text-center">
          <div className="flex items-center justify-center gap-3 text-gray-500">
            <svg className="animate-spin w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <span>Verbinding maken...</span>
          </div>
        </div>
      </div>
    </div>
  );
}
