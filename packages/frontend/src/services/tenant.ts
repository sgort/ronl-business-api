import type { TenantConfig, TenantRegistry, TenantTheme } from '@ronl/shared';

let tenantRegistry: TenantRegistry | null = null;

/**
 * Load tenant configurations from JSON file
 */
export async function loadTenantConfigs(): Promise<TenantRegistry> {
  if (tenantRegistry) {
    return tenantRegistry;
  }

  try {
    const response = await fetch('/tenants.json');
    if (!response.ok) {
      throw new Error(`Failed to load tenants.json: ${response.statusText}`);
    }
    tenantRegistry = await response.json();
    return tenantRegistry;
  } catch (error) {
    console.error('Failed to load tenant configurations:', error);
    // Return default minimal config
    return {
      default: 'utrecht',
      tenants: {},
    };
  }
}

/**
 * Get configuration for a specific tenant
 */
export function getTenantConfig(tenantId: string): TenantConfig | null {
  if (!tenantRegistry) {
    console.warn('Tenant registry not loaded yet');
    return null;
  }

  const tenant = tenantRegistry.tenants[tenantId];
  if (!tenant) {
    console.warn(`Tenant '${tenantId}' not found, using default`);
    return tenantRegistry.tenants[tenantRegistry.default] || null;
  }

  if (!tenant.enabled) {
    console.warn(`Tenant '${tenantId}' is disabled`);
    return null;
  }

  return tenant;
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
 * Reset theme to defaults
 */
export function resetTheme(): void {
  const root = document.documentElement;
  root.style.setProperty('--color-primary', '#01689b');
  root.style.setProperty('--color-primary-dark', '#014d73');
  root.style.setProperty('--color-primary-light', '#4da6e0');
  root.style.setProperty('--color-secondary', '#e17000');
  root.style.setProperty('--color-accent', '#ff6b00');
}
