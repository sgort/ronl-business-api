import Keycloak from 'keycloak-js';
import type { AssuranceLevel, KeycloakUser } from '@ronl/shared';

// Initialize Keycloak instance
const keycloak = new Keycloak({
  url: 'http://localhost:8080',
  realm: 'ronl',
  clientId: 'ronl-business-api',
});

export default keycloak;

export { KeycloakUser };

export const getUser = (): KeycloakUser | null => {
  if (!keycloak.tokenParsed) return null;

  // Debug: Log the entire token structure as JSON
  console.log('🔍 Full token as JSON:', JSON.stringify(keycloak.tokenParsed, null, 2));

  // Extract roles from realm_access (where Keycloak stores them)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const token = keycloak.tokenParsed as any;

  console.log('🔍 realm_access:', token.realm_access);
  console.log('🔍 resource_access:', token.resource_access);

  const realmRoles = token.realm_access?.roles || [];

  console.log('🔍 Extracted roles:', realmRoles);

  return {
    sub: keycloak.tokenParsed.sub as string,
    name: keycloak.tokenParsed.name as string,
    municipality: keycloak.tokenParsed.municipality as string,
    loa: token.loa as AssuranceLevel,
    roles: realmRoles,
  };
};

export const getToken = (): string | undefined => {
  return keycloak.token;
};
