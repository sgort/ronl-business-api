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
  municipality: string;
  organisation_type: OrganisationType;
  loa: AssuranceLevel;
  roles: string[];
  mandate?: MandateInfo;
  name?: string;
  email?: string;
  preferred_username?: string;
  employeeId?: string;
}

export interface AuthContext extends AuthenticatedUser {
  requestId: string;
  ipAddress?: string;
  userAgent?: string;
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
