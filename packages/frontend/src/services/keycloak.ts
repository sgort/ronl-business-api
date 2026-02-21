import Keycloak from 'keycloak-js';
import type { AssuranceLevel, KeycloakUser } from '@ronl/shared';

// Check if we're in production based on hostname
const isProduction =
  typeof window !== 'undefined' && window.location.hostname === 'mijn.open-regels.nl';

const isAcceptance =
  typeof window !== 'undefined' && window.location.hostname.includes('acc.mijn.open-regels.nl');

// Determine Keycloak URL based on environment
let KEYCLOAK_URL = 'http://localhost:8080';
if (isProduction) {
  KEYCLOAK_URL = 'https://keycloak.open-regels.nl';
} else if (isAcceptance) {
  KEYCLOAK_URL = 'https://acc.keycloak.open-regels.nl';
}

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
  };
};

/**
 * Get current access token
 */
export const getToken = (): string | undefined => {
  return keycloak.token;
};

/**
 * Get environment-specific redirect URLs for Keycloak configuration
 */
export const getRedirectUris = () => {
  if (isProduction) {
    return ['https://mijn.open-regels.nl/*'];
  } else if (isAcceptance) {
    return ['https://acc.mijn.open-regels.nl/*'];
  }
  return ['http://localhost:5173/*'];
};
