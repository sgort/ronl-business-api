// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { getPaCockpitAuth, getPaCockpitTenant } from '@ronl/pa-cockpit';

const mockKeycloak = vi.hoisted(() => ({
  authenticated: false,
  token: undefined as string | undefined,
  updateToken: vi.fn(),
  logout: vi.fn(),
}));
const mockGetUser = vi.hoisted(() => vi.fn());

vi.mock('../services/keycloak', () => ({
  default: mockKeycloak,
  getUser: mockGetUser,
}));

const mockTenant = vi.hoisted(() => ({
  initializeTenantTheme: vi.fn(),
  loadTenantConfigs: vi.fn(),
  getTenantConfig: vi.fn(),
  getDefaultTenantConfig: vi.fn(),
}));

vi.mock('../services/tenant', () => mockTenant);

import keycloak from '../services/keycloak';
// Side-effecting import: registers the host with @ronl/pa-cockpit via
// configurePaCockpit() at module scope, exactly once for this test file.
import './pa-cockpit-host';

describe('pa-cockpit-host', () => {
  it('wires auth.authenticated to !!keycloak.authenticated', () => {
    mockKeycloak.authenticated = false;
    expect(getPaCockpitAuth().authenticated).toBe(false);

    mockKeycloak.authenticated = true;
    expect(getPaCockpitAuth().authenticated).toBe(true);
  });

  it('reads the token at call time, not at module load', async () => {
    // A plain `token: keycloak.token` passes every other test in this file and
    // then sends a stale bearer after the first silent refresh.
    const before = getPaCockpitAuth().token;
    keycloak.token = 'refreshed-token';
    expect(getPaCockpitAuth().token).not.toBe(before);
    expect(getPaCockpitAuth().token).toBe('refreshed-token');
  });

  it('delegates getUser to the keycloak service module', () => {
    getPaCockpitAuth().getUser();
    expect(mockGetUser).toHaveBeenCalled();
  });

  it('delegates updateToken, defaulting a missing minValidity to 0', async () => {
    mockKeycloak.updateToken.mockResolvedValue(true);

    await getPaCockpitAuth().updateToken();
    expect(mockKeycloak.updateToken).toHaveBeenCalledWith(0);

    await getPaCockpitAuth().updateToken(30);
    expect(mockKeycloak.updateToken).toHaveBeenCalledWith(30);
  });

  it('delegates logout with the caller-supplied options', async () => {
    await getPaCockpitAuth().logout({ redirectUri: 'https://example.test' });
    expect(mockKeycloak.logout).toHaveBeenCalledWith({ redirectUri: 'https://example.test' });
  });

  it('wires the tenant service straight through, unchanged', () => {
    const tenant = getPaCockpitTenant();
    expect(tenant.initializeTenantTheme).toBe(mockTenant.initializeTenantTheme);
    expect(tenant.loadTenantConfigs).toBe(mockTenant.loadTenantConfigs);
    expect(tenant.getTenantConfig).toBe(mockTenant.getTenantConfig);
    expect(tenant.getDefaultTenantConfig).toBe(mockTenant.getDefaultTenantConfig);
  });
});
