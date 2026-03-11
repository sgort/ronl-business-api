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
