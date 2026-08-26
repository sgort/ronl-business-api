/**
 * What a host must supply before the cockpit can run.
 *
 * Two mechanisms, chosen by what each seam is. This module carries the two
 * NON-React services, because services/pa.api.ts and
 * services/dossierbeheer.api.ts read them at module scope and cannot consume a
 * React context. That is sound here specifically because token lookup is not
 * reactive: the value is read when a request is made, not when something
 * renders.
 *
 * React seams go through the `host` prop on PADashboardV2 instead (see
 * PaCockpitHost there). Do not move a React seam into this module. Module
 * state feeding React components is what caused the DemoRoleContext defect
 * during the demo build: a mount-effect snapshot never saw later mutations,
 * so the UI silently kept rendering a stale value.
 */
import type { KeycloakUser } from '@ronl/shared';

/**
 * The only tenant field the cockpit reads is `displayName` (PADashboardV2's
 * tenant label). Kept minimal on purpose so each host can pass its own richer
 * config object unchanged — packages/frontend's TenantConfig carries theme,
 * features and contact blocks the cockpit has no business knowing about.
 */
export interface PaTenantConfig {
  displayName: string;
}

/**
 * The subset of the host's *auth service* the cockpit touches — not all of
 * it is keycloak-js's own surface. `authenticated`, `token`, `updateToken`
 * and `logout` do mirror keycloak-js's signatures, with one deliberate
 * adjustment: `authenticated` is required here, while keycloak-js declares
 * it optional (`authenticated?: boolean`). A host adapter should pass
 * `!!keycloak.authenticated`, exactly as
 * packages/frontend/src/pages/PADashboardV2.tsx:220 already does.
 * `getUser` is not keycloak-js's at all: it is the host's own function (see
 * packages/frontend/src/services/keycloak.ts), which derives a user object
 * from `keycloak.tokenParsed`. Do not go looking for `getUser` in
 * keycloak-js's typings — it isn't there.
 */
export interface PaCockpitAuth {
  authenticated: boolean;
  token: string | undefined;
  getUser(): KeycloakUser | null;
  updateToken(minValidity?: number): Promise<boolean>;
  logout(options?: { redirectUri?: string }): Promise<void>;
}

export interface PaCockpitTenant {
  initializeTenantTheme(municipalityId: string): Promise<boolean>;
  loadTenantConfigs(): Promise<unknown>;
  getTenantConfig(tenantId: string): PaTenantConfig | null;
  getDefaultTenantConfig(): PaTenantConfig | null;
}

export interface PaCockpitServices {
  auth: PaCockpitAuth;
  tenant: PaCockpitTenant;
}

let services: PaCockpitServices | null = null;

/** Call once at startup, before the first render. */
export function configurePaCockpit(next: PaCockpitServices): void {
  services = next;
}

function require_(): PaCockpitServices {
  if (!services) {
    throw new Error(
      'PA-Cockpit is not configured: call configurePaCockpit({ auth, tenant }) at startup, ' +
        'before rendering PADashboardV2.'
    );
  }
  return services;
}

export function getPaCockpitAuth(): PaCockpitAuth {
  return require_().auth;
}

export function getPaCockpitTenant(): PaCockpitTenant {
  return require_().tenant;
}

/**
 * Test-only. Not exported from src/index.ts — the public entry point built in
 * Task 7 must not re-export this. It exists so tests can reset module-global
 * state between cases; a host application has no legitimate reason to call it.
 *
 * Its safety currently rests on Vitest's default per-file module isolation:
 * each test file gets its own fresh copy of the module-level `services`
 * variable, so nothing leaks between files even when a test forgets to call
 * this. If isolation were ever disabled repo-wide for speed, a test file
 * that calls configurePaCockpit and never resets could leak state into a
 * file that runs afterward in the same worker.
 */
export function __resetPaCockpitHostForTests(): void {
  services = null;
}
