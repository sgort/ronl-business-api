/**
 * Tenant Management Service
 * Handles multi-tenant theming and configuration
 */

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

export interface TenantConfig {
  id: string;
  name: string;
  displayName: string;
  municipalityCode: string;
  theme: TenantTheme;
  features: TenantFeatures;
  contact: TenantContact;
  enabled: boolean;
}

export interface TenantRegistry {
  [tenantId: string]: TenantConfig;
}

// Cache for loaded configurations
let cachedTenants: TenantRegistry = {};

/**
 * Load all tenant configurations from JSON file
 */
export async function loadTenantConfigs(): Promise<TenantRegistry> {
  try {
    const response = await fetch('/tenants.json');
    if (!response.ok) {
      console.error('Failed to load tenant configs:', response.statusText);
      return {};
    }

    const data = await response.json();
    cachedTenants = data.tenants || {};
    console.log('📋 Loaded tenant configurations:', Object.keys(cachedTenants));
    return cachedTenants;
  } catch (error) {
    console.error('Error loading tenant configs:', error);
    return {};
  }
}

/**
 * Get configuration for specific tenant
 */
export function getTenantConfig(tenantId: string): TenantConfig | null {
  return cachedTenants[tenantId] || null;
}

/**
 * Apply tenant theme to document root
 */
export function applyTenantTheme(theme: TenantTheme): void {
  const root = document.documentElement;

  root.style.setProperty('--color-primary', theme.primary);
  root.style.setProperty('--color-primary-dark', theme.primaryDark);
  root.style.setProperty('--color-primary-light', theme.primaryLight);
  root.style.setProperty('--color-secondary', theme.secondary);
  root.style.setProperty('--color-accent', theme.accent);

  console.log('🎨 Applied tenant theme:', theme);
}

/**
 * Initialize tenant theme based on municipality
 */
export async function initializeTenantTheme(municipalityId: string): Promise<boolean> {
  try {
    // Load configs if not already cached
    if (Object.keys(cachedTenants).length === 0) {
      await loadTenantConfigs();
    }

    // Get tenant config
    const config = getTenantConfig(municipalityId);

    if (!config) {
      console.warn(`⚠️ No tenant config found for: ${municipalityId}`);
      return false;
    }

    if (!config.enabled) {
      console.warn(`⚠️ Tenant disabled: ${municipalityId}`);
      return false;
    }

    // Apply theme
    applyTenantTheme(config.theme);
    console.log(`🏛️ Loaded tenant config: ${config.displayName}`);

    return true;
  } catch (error) {
    console.error('Failed to initialize tenant theme:', error);
    return false;
  }
}
