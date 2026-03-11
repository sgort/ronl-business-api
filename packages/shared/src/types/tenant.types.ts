/**
 * Multi-tenant Configuration Types
 */

export type OrganisationType = 'municipality' | 'province' | 'national';

export interface TenantTheme {
  primary: string;
  primaryDark: string;
  primaryLight: string;
  secondary: string;
  accent: string;
}

export interface TenantFeatures {
  zorgtoeslag: boolean;
  vergunningen: boolean;
  subsidies: boolean;
  meldingen: boolean;
}

export interface TenantContact {
  phone: string;
  email: string;
  address: string;
  openingHours: string;
}

export interface TenantConfig {
  id: string;
  name: string;
  displayName: string;
  organisationType: OrganisationType;
  municipalityCode?: string;
  organisationCode?: string;
  theme: TenantTheme;
  features: TenantFeatures;
  contact: TenantContact;
  logo?: string;
  enabled: boolean;
}

export interface TenantRegistry {
  tenants: Record<string, TenantConfig>;
  default: string;
}
