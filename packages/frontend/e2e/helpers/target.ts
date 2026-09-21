/**
 * Resolves which environment the E2E suite runs against.
 *
 * Default is the local dev stack, exactly as before — every URL below falls
 * back to the localhost value the harness used to hard-code, so a plain
 * `npm run test:e2e --workspace=@ronl/frontend` behaves identically.
 *
 * To point the suite at ACC:
 *
 *   FRONTEND_URL=https://acc.mijn.open-regels.nl \
 *   BACKEND_URL=https://acc.api.open-regels.nl \
 *   KEYCLOAK_URL=https://acc.keycloak.open-regels.nl \
 *   OPERATON_URL=https://operaton.open-regels.nl/engine-rest \
 *     npm run test:e2e --workspace=@ronl/frontend
 *
 * Note that the browser talks to whichever FRONTEND_URL is given, and that
 * frontend reaches its own backend and Keycloak through its own build-time
 * VITE_* config — BACKEND_URL and KEYCLOAK_URL here are what the suite's
 * own precondition checks probe, not a way to repoint someone else's app.
 */

const DEFAULTS = {
  FRONTEND_URL: 'http://localhost:5173',
  BACKEND_URL: 'http://localhost:3002',
  KEYCLOAK_URL: 'http://localhost:8080',
  LDE_URL: 'http://localhost:3001',
  OPERATON_URL: 'http://localhost:8081/engine-rest',
} as const;

function resolve(name: keyof typeof DEFAULTS): string {
  const value = process.env[name];
  return (value && value.trim().length > 0 ? value.trim() : DEFAULTS[name]).replace(/\/+$/, '');
}

export const FRONTEND_URL = resolve('FRONTEND_URL');
export const BACKEND_URL = resolve('BACKEND_URL');
export const KEYCLOAK_URL = resolve('KEYCLOAK_URL');
export const LDE_URL = resolve('LDE_URL');
export const OPERATON_URL = resolve('OPERATON_URL');

const isLoopback = (url: string) => /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(url);

/**
 * Local means the fixture bundle from linked-data-explorer/e2e-fixtures is
 * what's deployed — which matters because those fixtures deliberately carry
 * their own `...E2E` sub-process keys, distinct from the keys a shared tier
 * runs. See REQUIRED_PROCESSES in required-processes.ts.
 */
export const isLocalTarget = isLoopback(FRONTEND_URL);

/**
 * The LDE backend has no counterpart on a shared tier under a predictable
 * name, so its precondition check only runs locally — or when LDE_URL is set
 * explicitly, which is the way to opt back in.
 */
export const checkLde = isLocalTarget || Boolean(process.env.LDE_URL);

/**
 * Production hosts, named exactly. operaton.open-regels.nl is deliberately
 * NOT in this list: ACC and PROD share one engine (see
 * docs/promote-ACC-to-PROD.md section 4.4), so its hostname says nothing
 * about which tier is under test.
 */
const PRODUCTION_HOSTS = ['mijn.open-regels.nl', 'api.open-regels.nl', 'keycloak.open-regels.nl'];

function host(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

export const isProductionTarget = [FRONTEND_URL, BACKEND_URL, KEYCLOAK_URL].some((url) =>
  PRODUCTION_HOSTS.includes(host(url))
);

export const targetLabel = isLocalTarget ? 'local dev stack' : host(FRONTEND_URL);

/**
 * These journeys are not read-only: they start real process instances and
 * complete real tasks. Against production that is real case data, so it takes
 * the same deliberate opt-in scripts/test-smoke-live.sh requires.
 */
export function assertTargetAllowed(): void {
  if (isProductionTarget && process.env.CONFIRM_PROD !== '1') {
    throw new Error(
      [
        '',
        `Refusing to run the E2E journeys against production (${targetLabel}).`,
        '',
        'These specs submit applications and complete caseworker tasks — against',
        'production that is real case data in the audit log, not a test artefact.',
        '',
        'If you genuinely mean it, set CONFIRM_PROD=1, the same gate',
        'scripts/test-smoke-live.sh uses.',
        '',
      ].join('\n')
    );
  }
}
