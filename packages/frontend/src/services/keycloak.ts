import Keycloak from 'keycloak-js';
import type { AssuranceLevel, KeycloakUser, OrganisationType } from '@ronl/shared';

const KEYCLOAK_URL = import.meta.env.VITE_KEYCLOAK_URL as string;

/**
 * Keycloak instance
 *
 * This is initialized manually in AuthCallback component with the selected
 * identity provider hint, allowing users to choose DigiD/eHerkenning/eIDAS
 * from the landing page before being redirected to Keycloak
 */
const keycloak = new Keycloak({
  url: KEYCLOAK_URL,
  realm: 'ronl',
  clientId: 'ronl-business-api',
});

export default keycloak;

export { KeycloakUser };

/**
 * A `Keycloak` instance can only be `.init()`d once ever — calling it twice
 * throws. `AuthCallback` and `ProtectedRoute` can each be the first thing to
 * touch it in a given page load (AuthCallback on the normal login flow;
 * ProtectedRoute on a direct/bookmarked/refreshed dashboard URL), so this
 * memoizes the first call's promise and hands the same one to everyone
 * after it.
 *
 * Deliberately takes no options and always uses passive `check-sso` —
 * an earlier version accepted caller-supplied options, which meant whichever
 * caller happened to init() first silently decided them for everyone, for
 * the lifetime of the page. In practice: visiting a protected route while
 * unauthenticated (ProtectedRoute's check-sso, resolves `false`) followed by
 * clicking "Login met DigiD" (which wanted `onLoad: 'login-required',
 * idpHint: 'digid'`) got AuthCallback back the *already-resolved* `false`
 * from ProtectedRoute's call instead — DigiD's real init never happened, no
 * redirect ever fired, and the citizen flow reported "Authenticatie
 * mislukt" even though nothing had actually gone wrong yet. Every real
 * login (medewerker or citizen) must now go through this same passive
 * check, then trigger the actual redirect via `keycloak.login(...)`
 * explicitly if it comes back unauthenticated — that method has no
 * "only once" restriction, unlike `.init()`.
 */
let initPromise: Promise<boolean> | null = null;

export const initializeKeycloak = (): Promise<boolean> => {
  if (!initPromise) {
    initPromise = keycloak.init({ onLoad: 'check-sso', checkLoginIframe: false });
  }
  return initPromise;
};

/**
 * Extract user information from Keycloak token
 */
export const getUser = (): KeycloakUser | null => {
  if (!keycloak.tokenParsed) return null;

  console.log('🔍 Full token as JSON:', JSON.stringify(keycloak.tokenParsed, null, 2));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const token = keycloak.tokenParsed as any;

  console.log('🔍 realm_access:', token.realm_access);
  console.log('🔍 resource_access:', token.resource_access);

  const realmRoles = token.realm_access?.roles || [];

  console.log('🔍 Extracted roles:', realmRoles);

  return {
    sub: keycloak.tokenParsed.sub as string,
    name: keycloak.tokenParsed.name as string,
    municipality: token.municipality as string,
    organisation_type: token.organisation_type as OrganisationType,
    loa: token.loa as AssuranceLevel,
    roles: realmRoles,
    preferred_username: token.preferred_username as string | undefined,
    bsn: token.bsn as string | undefined,
    employeeId: token.employeeId as string | undefined,
  };
};

/**
 * Get current access token
 */
export const getToken = (): string | undefined => {
  return keycloak.token;
};
