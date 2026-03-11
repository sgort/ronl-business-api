/**
 * Tenant Management Service
 * Handles multi-tenant theming and configuration
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
  kinderbijslag: boolean;
  huurtoeslag: boolean;
  processes: string[];
}

export interface TenantContact {
  phone: string;
  email: string;
  address: string;
  postalCode: string;
  city: string;
}

export interface LeftPanelSection {
  id: string;
  label: string;
  isPublic?: boolean;
}

export interface LeftPanelSections {
  [pageId: string]: LeftPanelSection[];
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
  enabled: boolean;
  leftPanelSections?: LeftPanelSections;
}

export interface TenantRegistry {
  [tenantId: string]: TenantConfig;
}

let cachedTenants: TenantRegistry = {};
let cachedDefaultTenantId: string = '';

export async function loadTenantConfigs(): Promise<TenantRegistry> {
  try {
    const response = await fetch('/tenants.json');
    if (!response.ok) {
      console.error('Failed to load tenant configs:', response.statusText);
      return {};
    }
    const data = await response.json();
    cachedTenants = data.tenants || {};
    cachedDefaultTenantId = data.default || '';
    console.log('📋 Loaded tenant configurations:', Object.keys(cachedTenants));
    return cachedTenants;
  } catch (error) {
    console.error('Error loading tenant configs:', error);
    return {};
  }
}

export function getTenantConfig(tenantId: string): TenantConfig | null {
  return cachedTenants[tenantId] || null;
}

export function getDefaultTenantConfig(): TenantConfig | null {
  if (!cachedDefaultTenantId) return null;
  return cachedTenants[cachedDefaultTenantId] || null;
}

export function applyTenantTheme(theme: TenantTheme): void {
  const root = document.documentElement;
  root.style.setProperty('--color-primary', theme.primary);
  root.style.setProperty('--color-primary-dark', theme.primaryDark);
  root.style.setProperty('--color-primary-light', theme.primaryLight);
  root.style.setProperty('--color-secondary', theme.secondary);
  root.style.setProperty('--color-accent', theme.accent);
  console.log('🎨 Applied tenant theme:', theme);
}

export async function initializeTenantTheme(municipalityId: string): Promise<boolean> {
  try {
    if (Object.keys(cachedTenants).length === 0) {
      await loadTenantConfigs();
    }
    const config = getTenantConfig(municipalityId);
    if (!config) {
      console.warn(`⚠️ No tenant config found for: ${municipalityId}`);
      return false;
    }
    if (!config.enabled) {
      console.warn(`⚠️ Tenant disabled: ${municipalityId}`);
      return false;
    }
    applyTenantTheme(config.theme);
    console.log(`🏛️ Loaded tenant config: ${config.displayName}`);
    return true;
  } catch (error) {
    console.error('Failed to initialize tenant theme:', error);
    return false;
  }
}
