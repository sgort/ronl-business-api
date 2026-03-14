import { useEffect, useState } from 'react';
import keycloak from '../services/keycloak';

// Warn when this many seconds remain on the token
const WARN_BEFORE_SECONDS = 120;
const POLL_INTERVAL_MS = 15_000;

export default function SessionExpiryWarning() {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => {
      if (!keycloak.authenticated || !keycloak.tokenParsed?.exp) return;
      const remaining = keycloak.tokenParsed.exp - Math.floor(Date.now() / 1000);
      setSecondsLeft(remaining <= WARN_BEFORE_SECONDS ? remaining : null);
    };

    tick();
    const id = setInterval(tick, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  const handleExtend = async () => {
    try {
      await keycloak.updateToken(-1); // force refresh regardless of remaining time
      setSecondsLeft(null);
    } catch {
      keycloak.login();
    }
  };

  const handleLogout = () => {
    keycloak.logout();
  };

  if (secondsLeft === null) return null;

  const expired = secondsLeft <= 0;
  const minutes = Math.floor(Math.abs(secondsLeft) / 60);
  const seconds = Math.abs(secondsLeft) % 60;
  const countdown = expired
    ? 'Uw sessie is verlopen.'
    : `Uw sessie verloopt over ${minutes}:${String(seconds).padStart(2, '0')}.`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl p-8 max-w-sm w-full mx-4">
        <div className="text-3xl mb-4 text-center">⏱️</div>
        <h2 className="text-lg font-bold text-gray-800 text-center mb-2">
          Sessie verloopt binnenkort
        </h2>
        <p className="text-sm text-gray-500 text-center mb-6">
          {countdown} Niet-opgeslagen formuliergegevens blijven beschikbaar als u de sessie
          verlengt.
        </p>
        <div className="flex gap-3">
          <button
            onClick={handleExtend}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-white rounded-lg transition-opacity hover:opacity-90"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            Sessie verlengen
          </button>
          <button
            onClick={handleLogout}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Uitloggen
          </button>
        </div>
      </div>
    </div>
  );
}
