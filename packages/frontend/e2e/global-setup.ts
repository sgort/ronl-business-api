const FRONTEND_URL = 'http://localhost:5173';
const BACKEND_HEALTH_URL = 'http://localhost:3002/v1/health';
const LDE_HEALTH_URL = 'http://localhost:3001/v1/health';

async function checkReachable(url: string, timeoutMs = 3000): Promise<boolean> {
  // Not AbortSignal.timeout() — its internal timer isn't always cleaned up
  // before the fetch settles, which crashes Node on Windows with a libuv
  // "UV_HANDLE_CLOSING" assertion during process exit. A manually managed
  // controller + explicit clearTimeout avoids that.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res.ok || res.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// Fails fast with a clear message instead of a confusing mid-test connection
// error. This project does not start the dev stack itself — see
// docs/TESTING-FRONTEND-UI.md's Environment section: run `npm run dev`
// (root) yourself, and start the sibling linked-data-explorer repo's
// `npm run dev:backend` separately.
export default async function globalSetup() {
  const [frontendUp, backendUp, ldeUp] = await Promise.all([
    checkReachable(FRONTEND_URL),
    checkReachable(BACKEND_HEALTH_URL),
    checkReachable(LDE_HEALTH_URL),
  ]);

  const missing: string[] = [];
  if (!frontendUp) missing.push(`- Frontend not reachable at ${FRONTEND_URL}`);
  if (!backendUp) missing.push(`- Backend not reachable at ${BACKEND_HEALTH_URL}`);
  if (!ldeUp) missing.push(`- LDE backend not reachable at ${LDE_HEALTH_URL}`);

  if (missing.length > 0) {
    throw new Error(
      [
        '',
        'E2E preconditions not met — the dev stack must already be running.',
        ...missing,
        '',
        'Start it yourself first:',
        '  docker compose up -d          (repo root — Keycloak/Postgres/Redis)',
        '  npm run dev                   (repo root — frontend :5173 + backend :3002)',
        '  npm run dev:backend           (linked-data-explorer repo root — LDE backend :3001)',
        '',
        'See docs/TESTING-FRONTEND-UI.md for the full environment setup.',
        '',
      ].join('\n')
    );
  }
}
