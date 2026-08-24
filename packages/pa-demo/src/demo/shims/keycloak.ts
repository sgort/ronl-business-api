/**
 * Stands in for packages/frontend/src/services/keycloak.
 *
 * plato is unauthenticated, so there is no token, no realm and no login. The
 * cockpit reads its user through getUser() and derives permissions from
 * user.roles — see deriveDossierRole in dossierbeheer.data.ts — so switching
 * the demo's role means rewriting this array rather than patching components.
 * That is also how it works in production, which is why the vendored
 * permission UI needs no changes.
 */
import type { KeycloakUser } from '@ronl/shared';

/** The realm role the whole cockpit is gated on; always present. */
const BASE_ROLES = ['public-affairs'];

let paRole: string | null = 'pa-admin';

export function setDemoRoles(next: string | null): void {
  paRole = next;
}

export function getUser(): KeycloakUser {
  return {
    sub: 'demo-pa-001',
    name: 'Marieke de Vries',
    email: 'm.devries@demo.open-regels.nl',
    preferred_username: 'm.devries',
    employeeId: 'FL-2291',
    municipality: 'flevoland',
    organisation_type: 'province',
    loa: 'substantieel',
    roles: paRole ? [...BASE_ROLES, paRole] : [...BASE_ROLES],
  };
}

/**
 * The vendored shell and API services read members off keycloak's default
 * export directly (keycloak.authenticated, keycloak.token,
 * keycloak.updateToken(minValidity), keycloak.logout({ redirectUri })) — see
 * pages/PADashboardV2.tsx, services/pa.api.ts and
 * services/dossierbeheer.api.ts. Every method here is a no-op that keeps
 * their happy path: authenticated, never expiring, never redirecting. The
 * parameters mirror keycloak-js's real signatures so the vendored call
 * sites type-check unchanged.
 */
const keycloak = {
  authenticated: true,
  token: '',
  tokenParsed: {},
  login: () => Promise.resolve(),
  logout: (_options?: { redirectUri?: string }) => Promise.resolve(),
  updateToken: (_minValidity?: number) => Promise.resolve(false),
  isTokenExpired: () => false,
};

export default keycloak;
