import { useNavigate } from 'react-router-dom';

/**
 * Landing page that displays identity provider choices
 * Matches the mockup design for DigiD/eHerkenning/eIDAS selection
 */
export default function LoginChoice() {
  const navigate = useNavigate();

  const handleLogin = (provider: 'digid' | 'eherkenning' | 'eidas') => {
    // Store the selected identity provider in sessionStorage
    sessionStorage.setItem('selected_idp', provider);

    // Navigate to the auth route which will trigger Keycloak
    navigate('/auth');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-gray-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Main Card */}
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-8 text-center">
            <h1 className="text-3xl font-bold mb-2">MijnOmgeving</h1>
            <p className="text-blue-100 text-sm">Demo portaal van Open Regels</p>
          </div>

          {/* Content */}
          <div className="p-8">
            <h2 className="text-2xl font-semibold text-gray-800 mb-2">Welkom</h2>
            <p className="text-gray-600 mb-8">Kies hoe u wilt inloggen:</p>

            {/* DigiD Button */}
            <button
              onClick={() => handleLogin('digid')}
              className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-semibold py-4 px-6 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 transform hover:-translate-y-0.5 mb-4 flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div className="bg-black bg-opacity-20 p-2 rounded-lg">
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm0 2c-4.42 0-8 2.24-8 5v1h10.2a6.5 6.5 0 0 1-1.2-3.8c0-.8.15-1.57.43-2.2H12zm8.3 1.3-3.3 3.3-1.3-1.3-1.4 1.4 2.7 2.7 4.7-4.7z" />
                  </svg>
                </div>
                <span className="text-lg">Inloggen met DigiD</span>
              </div>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>

            {/* eHerkenning Button */}
            <button
              onClick={() => handleLogin('eherkenning')}
              className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold py-4 px-6 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 transform hover:-translate-y-0.5 mb-4 flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div className="bg-white bg-opacity-20 p-2 rounded-lg">
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 3c1.93 0 3.5 1.57 3.5 3.5S13.93 13 12 13s-3.5-1.57-3.5-3.5S10.07 6 12 6zm7 13H5v-.23c0-.62.28-1.2.76-1.58C7.47 15.82 9.64 15 12 15s4.53.82 6.24 2.19c.48.38.76.97.76 1.58V19z" />
                  </svg>
                </div>
                <span className="text-lg">Inloggen met eHerkenning</span>
              </div>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>

            {/* eIDAS Button */}
            <button
              onClick={() => handleLogin('eidas')}
              className="w-full bg-gradient-to-r from-blue-700 to-blue-800 hover:from-blue-800 hover:to-blue-900 text-white font-semibold py-4 px-6 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 transform hover:-translate-y-0.5 flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div className="bg-yellow-400 p-2 rounded-lg">
                  <svg className="w-6 h-6 text-blue-800" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="12" cy="4.5" r="1.5" />
                    <circle cx="7" cy="8" r="1.5" />
                    <circle cx="17" cy="8" r="1.5" />
                    <circle cx="5" cy="13" r="1.5" />
                    <circle cx="12" cy="13" r="1.5" />
                    <circle cx="19" cy="13" r="1.5" />
                    <circle cx="7" cy="18" r="1.5" />
                    <circle cx="17" cy="18" r="1.5" />
                    <circle cx="12" cy="22" r="1.5" />
                  </svg>
                </div>
                <span className="text-lg">Inloggen met eIDAS</span>
              </div>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>

            {/* Footer Info */}
            <div className="mt-8 pt-6 border-t border-gray-200">
              <p className="text-sm text-gray-500 text-center">
                U wordt veilig doorverwezen naar de inlogpagina
              </p>
            </div>
          </div>
        </div>

        {/* Additional Info */}
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600">
            Gemeenten Utrecht, Amsterdam, Rotterdam en Den Haag
          </p>
        </div>
      </div>
    </div>
  );
}
