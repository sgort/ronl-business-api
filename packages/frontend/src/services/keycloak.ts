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

  return {
    sub: keycloak.tokenParsed.sub as string,
    name: keycloak.tokenParsed.name as string,
    municipality: keycloak.tokenParsed.municipality as string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    loa: (keycloak.tokenParsed as any).loa as AssuranceLevel,
    roles: (keycloak.tokenParsed.roles as string[]) || [],
  };
};

export const getToken = (): string | undefined => {
  return keycloak.token;
};
