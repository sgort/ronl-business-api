/**
 * Stands in for packages/frontend/src/services/tenant.
 *
 * The real module fetches tenant configuration and applies a CSS-variable
 * theme (services/tenant.ts:63-97 — loadTenantConfigs() fetches
 * /tenants.json, applyTenantTheme() calls document.documentElement.style.
 * setProperty for --color-primary/-primary-dark/-primary-light/-secondary/
 * -accent). plato is single-tenant and offline, so tenant *config* here is
 * a literal — but the *theme* still has to be applied the same way the real
 * service applies it, at runtime, via setProperty. It cannot be left to CSS
 * alone: the vendored .pac stylesheets read `var(--color-primary, #0046ad)`
 * — Flevoland blue as a fallback that only fires while the variable is
 * undefined. index.css (also vendored, also correctly — it is the generic
 * RONL shell style, not PA-Cockpit-specific) sets --color-primary/-secondary
 * to generic RONL blue/orange at :root, which satisfies that var() and
 * silently overrides the Flevoland fallback everywhere. Only an explicit
 * setProperty call — inline style, which wins the cascade over an inherited
 * :root custom property — reproduces what the real app does.
 *
 * FLEVOLAND_THEME below is copied verbatim from the `theme` key of the
 * flevoland entry in packages/frontend/public/tenants.json (now vendored to
 * packages/pa-demo/public/tenants.json and covered by vendor:check's asset
 * root — see scripts/vendor-manifest.mjs). It is a literal rather than a
 * fetch of that same file for the same offline-by-design reason the rest of
 * this shim is: plato issues no runtime data fetches (see e2e/
 * plato-demo.spec.ts's "no backend" test and playwright.config.ts's header),
 * and importing public/tenants.json as a JS module instead is not a safe
 * alternative — Vite explicitly does not process imports of files under
 * public/. A drift check aside, if tenants.json ever changes upstream,
 * vendor:check's asset-drift check flags the vendored tenants.json file
 * itself (byte comparison), which is the prompt to re-copy the values below
 * by hand; there is no silent way for the two to diverge undetected.
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

// Verbatim copy of tenants.json -> tenants.flevoland.theme. Hand-copied, not
// auto-applied from the vendored file (see the file header for why); a
// divergence can't ship silently — tenant.test.ts cross-checks this literal
// against public/tenants.json, and vendor:check independently flags any
// upstream change to that file. Auto-applying from the fetched/imported JSON
// instead remains the unimplemented alternative, tracked as a follow-up.
const FLEVOLAND_THEME = {
  primary: '#0046ad',
  primaryDark: '#134F7D',
  primaryLight: '#4A8FC0',
  secondary: '#e70077',
  accent: '#F5A623',
} as const;

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
  // Same setProperty sequence as the real applyTenantTheme() — see the file
  // header for why a CSS-only fallback isn't enough and why this is a
  // literal rather than a fetch of the vendored tenants.json.
  const root = document.documentElement;
  root.style.setProperty('--color-primary', FLEVOLAND_THEME.primary);
  root.style.setProperty('--color-primary-dark', FLEVOLAND_THEME.primaryDark);
  root.style.setProperty('--color-primary-light', FLEVOLAND_THEME.primaryLight);
  root.style.setProperty('--color-secondary', FLEVOLAND_THEME.secondary);
  root.style.setProperty('--color-accent', FLEVOLAND_THEME.accent);
  return Promise.resolve(true);
}
