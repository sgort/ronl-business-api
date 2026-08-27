// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// vi.hoisted: vi.mock factories are hoisted above these consts, so the
// factory-referenced fns must be created inside vi.hoisted (same pattern as
// InfraBoardDashboard.test.tsx / PASectionRouter.test.tsx) or the read
// happens before initialization.
const navigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));

const logout = vi.hoisted(() => vi.fn());
vi.mock('../services/keycloak', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/keycloak')>()),
  default: { authenticated: true, token: 't', logout, updateToken: vi.fn() },
  getUser: () => null,
}));

const cockpit = vi.hoisted(() => vi.fn((_props: { host: Record<string, unknown> }) => null));
vi.mock('@ronl/pa-cockpit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@ronl/pa-cockpit')>()),
  PADashboardV2: (props: { host: Record<string, unknown> }) => cockpit(props),
}));

import PaCockpitRoute from './PaCockpitRoute';

beforeEach(() => vi.clearAllMocks());

function hostArg() {
  render(
    <MemoryRouter>
      <PaCockpitRoute />
    </MemoryRouter>
  );
  return (cockpit.mock.calls[0][0] as { host: Record<string, () => void> }).host;
}

describe('PaCockpitRoute', () => {
  it('supplies both session callbacks to the cockpit', () => {
    const host = hostArg();
    expect(typeof host.onLogin).toBe('function');
    expect(typeof host.onLogout).toBe('function');
  });

  it('onLogin writes the two keys its sibling dashboards write, then routes to /auth', () => {
    // Same protocol as LoginChoice.tsx:19, WooDashboard.tsx:103,
    // InfraBoardDashboard.tsx:216 and CaseworkerDashboardV2.tsx:170 —
    // AuthCallback.tsx reads both back. Moved here, not invented.
    hostArg().onLogin();
    expect(sessionStorage.getItem('selected_idp')).toBe('medewerker');
    expect(sessionStorage.getItem('post_login_redirect')).toBe('/dashboard/public-affairs');
    expect(navigate).toHaveBeenCalledWith('/auth');
  });

  it('onLogout ends the real session', () => {
    hostArg().onLogout();
    expect(logout).toHaveBeenCalledWith({ redirectUri: window.location.origin + '/' });
  });
});
