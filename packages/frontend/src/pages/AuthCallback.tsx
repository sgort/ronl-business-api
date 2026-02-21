import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import keycloak from '../services/keycloak';

/**
 * Authentication callback page
 * Initializes Keycloak with the selected identity provider hint
 */
export default function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        // Get the selected identity provider from sessionStorage
        const selectedIdp = sessionStorage.getItem('selected_idp');

        // Build Keycloak init options
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const initOptions: any = {
          onLoad: 'login-required',
          checkLoginIframe: false,
        };

        // Add IDP hint if available
        // This will direct Keycloak to automatically use the selected identity provider
        if (selectedIdp) {
          initOptions.idpHint = selectedIdp;
        }

        // Initialize Keycloak
        const authenticated = await keycloak.init(initOptions);

        if (authenticated) {
          // Clear the stored IDP selection
          sessionStorage.removeItem('selected_idp');

          // Navigate to the main dashboard
          navigate('/dashboard', { replace: true });
        } else {
          setError('Authenticatie mislukt. Probeer het opnieuw.');
        }
      } catch (err) {
        console.error('Keycloak initialization error:', err);
        setError('Er is een fout opgetreden bij het inloggen.');
      }
    };

    initializeAuth();
  }, [navigate]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md">
          <div className="text-red-600 mb-4">
            <svg
              className="w-12 h-12 mx-auto"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-800 text-center mb-2">Inloggen mislukt</h2>
          <p className="text-gray-600 text-center mb-6">{error}</p>
          <button
            onClick={() => navigate('/', { replace: true })}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
          >
            Terug naar inlogpagina
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="text-center">
        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600 text-lg">Inloggen...</p>
        <p className="text-gray-500 text-sm mt-2">U wordt doorverwezen naar Keycloak</p>
      </div>
    </div>
  );
}
