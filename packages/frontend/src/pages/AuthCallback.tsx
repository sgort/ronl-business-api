import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import keycloak from '../services/keycloak';

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
          // check-sso: returns true if SSO session already exists, false otherwise
          // — crucially, does NOT trigger a login redirect by itself.
          const authenticated = await keycloak.init({
            onLoad: 'check-sso',
            checkLoginIframe: false,
          });

          if (authenticated) {
            sessionStorage.removeItem('selected_idp');
            navigate('/dashboard', { replace: true });
          } else {
            // Trigger login with sentinel so login.ftl shows the medewerker banner.
            await keycloak.login({ loginHint: '__medewerker__' });
          }
        } else {
          // Citizen IdP flow — idpHint redirects straight to DigiD / eHerkenning / eIDAS.
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
            navigate('/dashboard', { replace: true });
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
