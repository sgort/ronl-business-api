import { AuthenticatedUser, AssuranceLevel, MandateInfo } from '@ronl/shared';

export { AuthenticatedUser, AssuranceLevel, MandateInfo };

/**
 * Authentication and Authorization Type Definitions
 */
export interface JWTPayload {
  sub: string; // Subject (user ID - opaque identifier)
  iss: string; // Issuer (Keycloak URL)
  aud: string | string[]; // Audience
  exp: number; // Expiration timestamp
  iat: number; // Issued at timestamp
  jti?: string; // JWT ID
  municipality: string; // Municipality/tenant identifier
  loa: AssuranceLevel; // Level of Assurance (DigiD level)
  roles: string[]; // User roles
  mandate?: MandateInfo; // Optional mandate information
  name?: string; // User display name
  email?: string; // User email
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

// Extend Express Request with authenticated user
// Using module augmentation instead of namespace
declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthContext;
    user?: AuthenticatedUser;
  }
}
