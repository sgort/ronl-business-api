import { useEffect, useRef, useState } from 'react';
import keycloak from '../services/keycloak';

// Warn when this many seconds remain on the token
const WARN_BEFORE_SECONDS = 120;
const POLL_INTERVAL_MS = 15_000;
// While the user is actively interacting with the page we silently refresh the
// token once it drops below this many seconds — deliberately a bit above the
// warning threshold so an active user never sees the modal at all. Only genuine
// idleness lets the countdown reach WARN_BEFORE_SECONDS. updateToken() only
// hits the network when the token is actually inside this window, so listening
// on high-frequency events like mousemove stays cheap.
const ACTIVITY_REFRESH_FLOOR = WARN_BEFORE_SECONDS + 60;
// Don't attempt a refresh more than once per this window, no matter how many
// activity events fire.
const ACTIVITY_THROTTLE_MS = 30_000;
const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = ['keydown', 'pointerdown', 'mousemove', 'scroll'];

export default function SessionExpiryWarning() {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  // Mirror the modal's visibility into a ref so the activity listener (bound
  // once, with no deps) can read the current state without re-subscribing on
  // every countdown tick.
  const modalVisibleRef = useRef(false);
  modalVisibleRef.current = secondsLeft !== null;

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

  // Treat real interaction (typing, clicking, scrolling, moving the mouse) as a
  // reason to keep the session alive. Filling in a long form makes no API calls,
  // so without this the token silently expires under an active user and the
  // modal pops up mid-typing.
  //
  // Once the modal IS showing, activity is intentionally ignored: the user must
  // dismiss it with an explicit choice (Sessie verlengen / Uitloggen).
  // Otherwise merely moving the mouse toward the button would auto-refresh and
  // yank the dialog away before the click lands.
  useEffect(() => {
    let lastRefresh = 0;
    const onActivity = () => {
      if (modalVisibleRef.current) return;
      if (!keycloak.authenticated) return;
      const now = Date.now();
      if (now - lastRefresh < ACTIVITY_THROTTLE_MS) return;
      lastRefresh = now;
      keycloak.updateToken(ACTIVITY_REFRESH_FLOOR).catch(() => {
        // Refresh token / SSO session is gone — leave the countdown and modal
        // to handle re-authentication rather than forcing a redirect here.
      });
    };

    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    return () => ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, onActivity));
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
    keycloak.logout({ redirectUri: window.location.origin });
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
