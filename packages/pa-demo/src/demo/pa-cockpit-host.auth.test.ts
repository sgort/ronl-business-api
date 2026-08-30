// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { getPaCockpitAuth } from '@ronl/pa-cockpit';

/**
 * Pins the demo's PaCockpitAuth adapter.
 *
 * Mirrors packages/frontend/src/pages/pa-cockpit-host.test.ts. Until this
 * existed, only the frontend's adapter was tested, and the demo's could drift
 * to the frontend's shape — or away from it — with nothing noticing.
 *
 * The two adapters differ in exactly two places and both differences are
 * CORRECT, not drift:
 *
 *   authenticated  frontend needs `!!` because keycloak-js types it
 *                  `authenticated?: boolean`; the shim is already `true`.
 *   updateToken    frontend needs `?? 0` because keycloak-js requires a
 *                  number; the shim's parameter is optional.
 *
 * The updateToken assertion below is what would catch this file silently
 * acquiring the frontend's `?? 0`.
 *
 * Separate from pa-cockpit-host.test.ts on purpose: that file's mode-narrowing
 * assertion is the demo's headline safety pin and should keep running against
 * an unmocked module graph. Vitest isolates modules per file, so the mock here
 * cannot reach it.
 */
const mockKeycloak = vi.hoisted(() => ({
  authenticated: true,
  token: '' as string | undefined,
  updateToken: vi.fn(),
}));
const mockGetUser = vi.hoisted(() => vi.fn());
const mockSetDemoRoles = vi.hoisted(() => vi.fn());

// setDemoRoles is not used by the adapter, but DemoRoleContext.tsx imports it
// and is reachable from the host through DemoSectionRouter. A factory that
// omits it breaks the import graph rather than one assertion.
vi.mock('./shims/keycloak', () => ({
  default: mockKeycloak,
  getUser: mockGetUser,
  setDemoRoles: mockSetDemoRoles,
}));

import keycloak from './shims/keycloak';
// Side-effecting import: registers the host with @ronl/pa-cockpit via
// configurePaCockpit() at module scope, exactly once for this test file.
import './pa-cockpit-host';

describe('the demo pa-cockpit auth adapter', () => {
  it('reads authenticated through to the shim rather than snapshotting it', () => {
    mockKeycloak.authenticated = true;
    expect(getPaCockpitAuth().authenticated).toBe(true);

    mockKeycloak.authenticated = false;
    expect(getPaCockpitAuth().authenticated).toBe(false);
  });

  it('reads the token at call time, not at module load', () => {
    // A plain `token: keycloak.token` passes every other assertion here and
    // then serves a value frozen at import — the same trap the frontend's
    // adapter comment calls out.
    const before = getPaCockpitAuth().token;
    keycloak.token = 'demo-token';
    expect(getPaCockpitAuth().token).not.toBe(before);
    expect(getPaCockpitAuth().token).toBe('demo-token');
  });

  it('delegates getUser to the shim', () => {
    getPaCockpitAuth().getUser();
    expect(mockGetUser).toHaveBeenCalled();
  });

  it('passes minValidity through unchanged, including when omitted', async () => {
    // Deliberately NOT the frontend's `?? 0`. The shim's parameter is
    // optional, so the demo forwards exactly what it was given; if this file
    // ever grows the frontend's default, this assertion fails.
    mockKeycloak.updateToken.mockResolvedValue(false);

    await getPaCockpitAuth().updateToken();
    expect(mockKeycloak.updateToken).toHaveBeenCalledWith(undefined);

    await getPaCockpitAuth().updateToken(30);
    expect(mockKeycloak.updateToken).toHaveBeenCalledWith(30);
  });
});
