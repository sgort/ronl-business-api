import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import keycloak from '../services/keycloak';

const POST_LOGIN_KEY = 'post_login_redirect';

function getRoleDashboard(): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const roles: string[] = (keycloak.tokenParsed as any)?.realm_access?.roles ?? [];
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
  if (path === '/dashboard/infra-board') return roles.includes('infra-projectteam');
  if (path === '/dashboard/public-affairs') return roles.includes('public-affairs');
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
 * Citizen flows (digid / eherkenning / eidas):
 *   keycloak.init({ onLoad: 'login-required', idpHint }) — Keycloak immediately
 *   redirects to the external IdP. In dev (no real IdPs configured) it falls back
 *   to the native login form without a context banner.
 *
 * Medewerker flow:
 *   keycloak.init({ onLoad: 'check-sso' }) — does NOT trigger a redirect.
 *   If already authenticated, go straight to dashboard.
 *   Otherwise call keycloak.login({ loginHint: '__medewerker__' }) so the
 *   login.ftl template can detect the sentinel and show the medewerker banner.
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

        if (isMedewerker) {
          const authenticated = await keycloak.init({
            onLoad: 'check-sso',
            checkLoginIframe: false,
          });

          if (authenticated) {
            sessionStorage.removeItem('selected_idp');
            navigateAfterLogin(navigate);
          } else {
            await keycloak.login({ loginHint: '__medewerker__' });
          }
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const initOptions: any = {
            onLoad: 'login-required',
            checkLoginIframe: false,
          };

          if (selectedIdp) {
            initOptions.idpHint = selectedIdp;
          }

          const authenticated = await keycloak.init(initOptions);

          if (authenticated) {
            sessionStorage.removeItem('selected_idp');
            navigateAfterLogin(navigate);
          } else {
            setError('Authenticatie mislukt. Probeer het opnieuw.');
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
