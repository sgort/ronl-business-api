import Keycloak from 'keycloak-js';
import type { AssuranceLevel, KeycloakUser } from '@ronl/shared';

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
    loa: token.loa as AssuranceLevel,
    roles: realmRoles,
    preferred_username: token.preferred_username as string | undefined,
    bsn: token.bsn as string | undefined,
  };
};

/**
 * Get current access token
 */
export const getToken = (): string | undefined => {
  return keycloak.token;
};
