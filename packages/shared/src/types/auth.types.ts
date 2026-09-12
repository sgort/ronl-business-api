import { OrganisationType } from './tenant.types';

export type AssuranceLevel = 'basis' | 'midden' | 'hoog' | 'substantieel';

export interface MandateInfo {
  type: 'legal' | 'voluntary' | 'professional';
  representedBy: string;
  representedName?: string;
  scope?: string[];
  validUntil?: string;
}

export interface AuthenticatedUser {
  userId: string;
  tenantId: string;
  organisationType: OrganisationType;
  roles: string[];
  assuranceLevel: AssuranceLevel;
  mandate?: MandateInfo;
  displayName?: string;
  preferredUsername?: string;
  employeeId?: string;
  // Not present on every token; ValidSign package creation depends on it
  // and must refuse (422) rather than guess when it is missing.
  email?: string;
  // Derived from displayName (or preferredUsername as fallback), not carried
  // by the token itself. Split on the FIRST space so a Dutch surname with
  // internal spaces ("van der Berg") stays intact in lastName.
  givenName?: string;
  familyName?: string;
}

export interface KeycloakUser {
  sub: string;
  name?: string;
  email?: string;
  municipality: string;
  organisation_type: OrganisationType;
  loa: AssuranceLevel;
  roles: string[];
  mandate?: MandateInfo;
  preferred_username?: string;
  bsn?: string;
  employeeId?: string;
}
