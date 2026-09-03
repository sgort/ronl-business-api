// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expectMockNamesRealExports } from '@ronl/pa-cockpit/test-utils';

// vi.hoisted: vi.mock factories are hoisted above these consts, so the
// factory-referenced fns must be created inside vi.hoisted (same pattern as
// InfraBoardDashboard.test.tsx / PASectionRouter.test.tsx) or the read
// happens before initialization.
//
// react-router-dom is not run through expectMockNamesRealExports below: the
// hazard the helper guards against — a hand-written mock naming an export the
// real module doesn't have — is about first-party surfaces this repo renames
// or restructures (an npm package's own module, or a sibling service file).
// `useNavigate` is a long-stable public export of a third-party router; the
// package boundaries worth pinning here are the ones this repo owns.
const navigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));

const keycloakMock = vi.hoisted(() => {
  const logout = vi.fn();
  return {
    logout,
    exports: {
      default: { authenticated: true, token: 't', logout, updateToken: vi.fn() },
      getUser: () => null,
    },
  };
});
vi.mock('../services/keycloak', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/keycloak')>()),
  ...keycloakMock.exports,
}));

const cockpitMock = vi.hoisted(() => {
  const cockpit = vi.fn((_props: { host: Record<string, unknown> }) => null);
  return {
    cockpit,
    exports: {
      PADashboardV2: (props: { host: Record<string, unknown> }) => cockpit(props),
    },
  };
});
vi.mock('@ronl/pa-cockpit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@ronl/pa-cockpit')>()),
  ...cockpitMock.exports,
}));

import PaCockpitRoute from './PaCockpitRoute';

beforeEach(() => vi.clearAllMocks());

function hostArg() {
  render(
    <MemoryRouter>
      <PaCockpitRoute />
    </MemoryRouter>
  );
  return (cockpitMock.cockpit.mock.calls[0][0] as { host: Record<string, () => void> }).host;
}

describe('PaCockpitRoute', () => {
  it('mocks only names @ronl/pa-cockpit and ../services/keycloak really export', async () => {
    // vi.importActual, not import(): the path is mocked, so a plain dynamic
    // import would hand back the mock and compare it with itself.
    await expectMockNamesRealExports(
      vi.importActual('@ronl/pa-cockpit'),
      cockpitMock.exports as Record<string, unknown>
    );
    await expectMockNamesRealExports(
      vi.importActual('../services/keycloak'),
      keycloakMock.exports as Record<string, unknown>
    );
  });

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
    expect(keycloakMock.logout).toHaveBeenCalledWith({
      redirectUri: window.location.origin + '/',
    });
  });
  it('does not call Keycloak logout when there is no session to end', () => {
    // The cockpit renders its avatar control whether or not a session is live
    // (an anonymous visitor sees the login prompt beside it), so onLogout can
    // be invoked with nothing to log out of. keycloak.logout() on an
    // uninitialised adapter throws.
    keycloakMock.exports.default.authenticated = false;
    try {
      hostArg().onLogout();
      expect(keycloakMock.logout).not.toHaveBeenCalled();
    } finally {
      keycloakMock.exports.default.authenticated = true;
    }
  });
});
