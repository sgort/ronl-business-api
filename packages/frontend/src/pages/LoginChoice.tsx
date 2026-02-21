import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ChangelogPanel from './ChangelogPanel';

export default function LoginChoice() {
  const navigate = useNavigate();
  const [changelogOpen, setChangelogOpen] = useState(false);

  const handleIDPSelection = (idp: 'digid' | 'eherkenning' | 'eidas') => {
    // Store selected IDP in session storage
    sessionStorage.setItem('selectedIDP', idp);

    // Navigate to auth callback which will initialize Keycloak
    navigate('/auth');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 flex items-center justify-center p-4 relative">
      {/* Changelog Toggle Button */}
      <button
        onClick={() => setChangelogOpen(true)}
        className="fixed top-4 right-4 z-30 flex items-center gap-2 px-4 py-2 bg-white text-blue-600 rounded-lg shadow-md hover:shadow-lg transition-all hover:bg-blue-50 border border-blue-200"
        aria-label="Open changelog"
      >
        <span className="text-xl">📋</span>
        <span className="font-semibold text-sm hidden sm:inline">Changelog</span>
      </button>

      {/* Main Card */}
      <div className="w-full max-w-md">
        {/* Header Card */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-t-2xl p-8 text-white text-center shadow-lg">
          <h1 className="text-3xl font-bold mb-2">MijnOmgeving</h1>
          <p className="text-blue-100">Demo portaal van Open Regels</p>
        </div>

        {/* Content Card */}
        <div className="bg-white rounded-b-2xl shadow-xl p-8">
          {/* Welcome Text */}
          <div className="text-center mb-8">
            <h2 className="text-2xl font-semibold text-gray-800 mb-2">Welkom</h2>
            <p className="text-gray-600">Kies hoe u wilt inloggen:</p>
          </div>

          {/* IDP Buttons */}
          <div className="space-y-4">
            {/* DigiD Button */}
            <button
              onClick={() => handleIDPSelection('digid')}
              className="w-full flex items-center justify-between px-6 py-4 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-xl shadow-md hover:shadow-lg transition-all transform hover:-translate-y-0.5"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white bg-opacity-20 rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" />
                  </svg>
                </div>
                <span className="font-semibold text-lg">Inloggen met DigiD</span>
              </div>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
              onClick={() => handleIDPSelection('eherkenning')}
              className="w-full flex items-center justify-between px-6 py-4 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-xl shadow-md hover:shadow-lg transition-all transform hover:-translate-y-0.5"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white bg-opacity-20 rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
                  </svg>
                </div>
                <span className="font-semibold text-lg">Inloggen met eHerkenning</span>
              </div>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
              onClick={() => handleIDPSelection('eidas')}
              className="w-full flex items-center justify-between px-6 py-4 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white rounded-xl shadow-md hover:shadow-lg transition-all transform hover:-translate-y-0.5"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white bg-opacity-20 rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM4.332 8.027a6.012 6.012 0 011.912-2.706C6.512 5.73 6.974 6 7.5 6A1.5 1.5 0 019 7.5V8a2 2 0 004 0 2 2 0 011.523-1.943A5.977 5.977 0 0116 10c0 .34-.028.675-.083 1H15a2 2 0 00-2 2v2.197A5.973 5.973 0 0110 16v-2a2 2 0 00-2-2 2 2 0 01-2-2 2 2 0 00-1.668-1.973z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <span className="font-semibold text-lg">Inloggen met eIDAS</span>
              </div>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          </div>

          {/* Footer Note */}
          <div className="mt-8 pt-6 border-t border-gray-200 text-center">
            <p className="text-sm text-gray-500">U wordt veilig doorverwezen naar de inlogpagina</p>
          </div>
        </div>

        {/* Municipality Footer */}
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600">Gemeente Utrecht, Amsterdam, Rotterdam, Den Haag</p>
        </div>
      </div>

      {/* Changelog Panel */}
      <ChangelogPanel isOpen={changelogOpen} onClose={() => setChangelogOpen(false)} />
    </div>
  );
}
