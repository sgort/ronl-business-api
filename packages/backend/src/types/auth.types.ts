import { AuthenticatedUser, AssuranceLevel, MandateInfo, OrganisationType } from '@ronl/shared';

export { AuthenticatedUser, AssuranceLevel, MandateInfo, OrganisationType };

/**
 * Authentication and Authorization Type Definitions
 */
export interface JWTPayload {
  sub: string;
  iss: string;
  aud: string | string[];
  exp: number;
  iat: number;
  jti?: string;
  azp?: string;
  municipality: string;
  organisation_type: OrganisationType;
  loa: AssuranceLevel;
  realm_access?: {
    roles: string[];
  };
  mandate?: MandateInfo;
  name?: string;
  email?: string;
  // Not on every realm's token: this client's protocol mappers only added
  // these once a real token was checked and found to carry neither `email`
  // nor `name`. Preferred over splitting `name` when both are present; the
  // split stays as the fallback for a realm that maps only `name` (a real
  // possibility on ACC, which this repo does not control).
  given_name?: string;
  family_name?: string;
  preferred_username?: string;
  employeeId?: string;
}

export interface AuthContext extends AuthenticatedUser {
  requestId: string;
  ipAddress?: string;
  userAgent?: string;
  azp?: string;
}

export interface TokenValidationResult {
  valid: boolean;
  payload?: JWTPayload;
  error?: string;
}

export interface KeycloakPublicKey {
  kid: string;
  kty: string;
  alg: string;
  use: string;
  n: string;
  e: string;
}

export interface KeycloakJWKS {
  keys: KeycloakPublicKey[];
}

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthContext;
    user?: AuthenticatedUser;
  }
}
