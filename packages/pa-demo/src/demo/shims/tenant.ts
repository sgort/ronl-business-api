/**
 * Stands in for packages/frontend/src/services/tenant.
 *
 * The real module fetches tenant configuration and applies a CSS-variable
 * theme. plato is single-tenant and offline, so the Flevoland config is a
 * literal and theme initialisation is a no-op — the vendored
 * dashboard-pa.css already carries the PA-Cockpit chrome.
 *
 * The vendored shell (pages/PADashboardV2.tsx) chains `.then()` off both
 * initializeTenantTheme() and loadTenantConfigs(), so both must resolve to
 * real Promises even though there is nothing to await.
 */
export interface TenantConfig {
  id: string;
  displayName: string;
  organisationType: string;
}

const FLEVOLAND: TenantConfig = {
  id: 'flevoland',
  displayName: 'Provincie Flevoland',
  organisationType: 'province',
};

export function getTenantConfig(_id?: string): TenantConfig {
  return FLEVOLAND;
}

export function getDefaultTenantConfig(): TenantConfig {
  return FLEVOLAND;
}

export function loadTenantConfigs(): Promise<TenantConfig[]> {
  return Promise.resolve([FLEVOLAND]);
}

export function initializeTenantTheme(_municipality?: string): Promise<boolean> {
  // no-op: the theme ships in the vendored CSS
  return Promise.resolve(true);
}
