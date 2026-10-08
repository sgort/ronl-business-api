/**
 * Tenant Management Service
 * Handles multi-tenant theming and configuration
 */

import type { BoardId } from '../pages/login-choice/boards.config';

export type OrganisationType = 'municipality' | 'province' | 'national' | 'commercial';

export interface TenantTheme {
  primary: string;
  primaryDark: string;
  primaryLight: string;
  secondary: string;
  accent: string;
  /** Landing-page background (--color-background). Without it the page keeps its default. */
  background?: string;
}

export interface TenantFeatures {
  zorgtoeslag: boolean;
  vergunningen: boolean;
  subsidies: boolean;
  meldingen: boolean;
  dvtp: boolean;
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

/** 'wide' logos carry the name in the artwork; 'square' ones get the name beside them. */
export interface TenantLogo {
  src: string;
  shape: 'wide' | 'square';
  /** Height in the landing top bar, in px. Defaults to 44. */
  height?: number;
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
  /** Boards shown on the landing page. Missing means all of them. */
  boards?: BoardId[];
  logo?: TenantLogo;
  /** Link-preview copy for the tenant's /<id> page, written into its HTML at build time. */
  share?: { title: string; description: string };
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

/**
 * Top-level paths that can never be a tenant's landing page: the app's own
 * routes, folders the static host serves, and names kept free for later.
 * A tenant with one of these ids gets no /<id> page.
 */
export const RESERVED_TENANT_IDS: readonly string[] = [
  'auth',
  'dashboard',
  'assets',
  'tenants',
  'api',
  't',
  'pa',
];

/** What a tenant id must look like to be a landing path. */
export const TENANT_ID_PATTERN = /^[a-z][a-z0-9-]{1,30}$/;

export type LandingResolution =
  | { kind: 'grid'; tenant: TenantConfig | null }
  | { kind: 'single'; tenant: TenantConfig }
  | { kind: 'redirect'; to: string };

/** The enabled tenant with exactly one board that owns the landing path /<id>, if any. */
function singleBoardTenant(id: string): TenantConfig | null {
  if (!TENANT_ID_PATTERN.test(id) || RESERVED_TENANT_IDS.includes(id)) return null;
  if (!Object.prototype.hasOwnProperty.call(cachedTenants, id)) return null;
  const tenant = cachedTenants[id];
  return tenant.enabled && tenant.boards?.length === 1 ? tenant : null;
}

function firstSegment(pathname: string): string | null {
  const segment = pathname.split('/')[1] ?? '';
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

/**
 * What the unauthenticated landing page shows for a URL.
 *
 * - `/<id>` is a single-board tenant's page. Any other id (unknown, disabled,
 *   several boards, reserved) goes to `/`, so Flevoland is never rendered
 *   under a foreign URL; a mixed-case id goes to its lower-case path.
 * - `/?tenant=<id>`, the URL before tenants had paths, redirects to `/<id>`.
 * - Anything else is the default tenant's board grid.
 */
export function resolveLandingTenant(pathname: string, search: string): LandingResolution {
  const segment = firstSegment(pathname);
  if (segment === null) return { kind: 'redirect', to: '/' };
  if (segment) {
    const id = segment.toLowerCase();
    const tenant = singleBoardTenant(id);
    if (!tenant) return { kind: 'redirect', to: '/' };
    if (segment !== id) return { kind: 'redirect', to: `/${id}` };
    return { kind: 'single', tenant };
  }

  const legacy = new URLSearchParams(search).get('tenant')?.toLowerCase();
  if (legacy && singleBoardTenant(legacy)) return { kind: 'redirect', to: `/${legacy}` };

  return { kind: 'grid', tenant: getDefaultTenantConfig() };
}

export function applyTenantTheme(theme: TenantTheme): void {
  const root = document.documentElement;
  root.style.setProperty('--color-primary', theme.primary);
  root.style.setProperty('--color-primary-dark', theme.primaryDark);
  root.style.setProperty('--color-primary-light', theme.primaryLight);
  root.style.setProperty('--color-secondary', theme.secondary);
  root.style.setProperty('--color-accent', theme.accent);
  // Removed when absent, so a tenant without one does not keep the previous
  // tenant's background.
  if (theme.background) root.style.setProperty('--color-background', theme.background);
  else root.style.removeProperty('--color-background');
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
