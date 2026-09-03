// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import App, { ProtectedRoute } from './App';

const mockKeycloak = vi.hoisted(() => ({
  authenticated: false,
  tokenParsed: null as { realm_access?: { roles: string[] } } | null,
}));
const mockInitializeKeycloak = vi.hoisted(() => vi.fn());
// getUser is unused by anything this file exercises (ProtectedRoute never
// calls it) but is required: importing './App' also loads
// './pages/pa-cockpit-host' for its side-effecting configurePaCockpit() call,
// and that module destructures getUser from this same mock.
const mockGetUser = vi.hoisted(() => vi.fn());
vi.mock('./services/keycloak', () => ({
  default: mockKeycloak,
  initializeKeycloak: mockInitializeKeycloak,
  getUser: mockGetUser,
}));

function renderAt(initialPath: string) {
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/" element={<div>login-choice</div>} />
        <Route
          path="/dashboard/citizen"
          element={
            <ProtectedRoute requiredRole="citizen">
              <div>citizen-dashboard</div>
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/caseworker"
          element={
            <ProtectedRoute requiredRole="caseworker">
              <div>caseworker-dashboard</div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    mockKeycloak.authenticated = false;
    mockKeycloak.tokenParsed = null;
    mockInitializeKeycloak.mockReset();
  });

  it('checks for an existing SSO session via check-sso on mount, not just a stale in-memory flag', async () => {
    // Regression case: on a fresh page load (URL bar/bookmark/refresh),
    // keycloak.authenticated was never set at all — ProtectedRoute used to
    // read it synchronously and always bounce to '/', even with a live SSO
    // session, because nothing had ever called keycloak.init().
    mockInitializeKeycloak.mockImplementation(async () => {
      mockKeycloak.authenticated = true;
      mockKeycloak.tokenParsed = { realm_access: { roles: [] } };
      return true;
    });

    renderAt('/dashboard/citizen');

    expect(await screen.findByText('citizen-dashboard')).toBeInTheDocument();
    expect(mockInitializeKeycloak).toHaveBeenCalled();
  });

  it('redirects to / when check-sso finds no session', async () => {
    mockInitializeKeycloak.mockResolvedValue(false);

    renderAt('/dashboard/citizen');

    expect(await screen.findByText('login-choice')).toBeInTheDocument();
  });

  it('redirects an authenticated caseworker away from /dashboard/citizen', async () => {
    mockInitializeKeycloak.mockImplementation(async () => {
      mockKeycloak.authenticated = true;
      mockKeycloak.tokenParsed = { realm_access: { roles: ['caseworker'] } };
      return true;
    });

    renderAt('/dashboard/citizen');

    expect(await screen.findByText('caseworker-dashboard')).toBeInTheDocument();
  });

  it('redirects an authenticated citizen away from /dashboard/caseworker', async () => {
    // Found-not-fixed gap this closes: /dashboard/caseworker used to be a
    // public route with no ProtectedRoute at all, so a citizen who
    // navigated there directly just stayed.
    mockInitializeKeycloak.mockImplementation(async () => {
      mockKeycloak.authenticated = true;
      mockKeycloak.tokenParsed = { realm_access: { roles: [] } };
      return true;
    });

    renderAt('/dashboard/caseworker');

    expect(await screen.findByText('citizen-dashboard')).toBeInTheDocument();
  });

  it('renders nothing while the check-sso call is still pending', () => {
    mockInitializeKeycloak.mockReturnValue(new Promise(() => {}));

    renderAt('/dashboard/citizen');

    expect(screen.queryByText('citizen-dashboard')).not.toBeInTheDocument();
    expect(screen.queryByText('login-choice')).not.toBeInTheDocument();
  });
  it('lets a matching role through', async () => {
    mockInitializeKeycloak.mockResolvedValue(true);
    mockKeycloak.authenticated = true;
    mockKeycloak.tokenParsed = { realm_access: { roles: ['caseworker'] } };

    renderAt('/dashboard/caseworker');

    expect(await screen.findByText('caseworker-dashboard')).toBeInTheDocument();
  });

  it('treats a token with no realm roles as a citizen rather than throwing', async () => {
    // A token minted by a client with no realm-role mapper has no
    // realm_access at all; reading .roles off it directly would throw before
    // any redirect could happen.
    mockInitializeKeycloak.mockResolvedValue(true);
    mockKeycloak.authenticated = true;
    mockKeycloak.tokenParsed = {};

    renderAt('/dashboard/citizen');

    expect(await screen.findByText('citizen-dashboard')).toBeInTheDocument();
  });

  it('still decides once check-sso itself fails', async () => {
    // A dead Keycloak must not leave the route rendering nothing forever; the
    // guard falls through to "not authenticated" and sends the user to /.
    mockInitializeKeycloak.mockRejectedValue(new Error('keycloak unreachable'));

    renderAt('/dashboard/citizen');

    expect(await screen.findByText('login-choice')).toBeInTheDocument();
  });
});

describe('the legacy /dashboard redirect', () => {
  // Kept for bookmarks and links minted before the role-specific routes
  // existed. It reads the token directly rather than going through
  // ProtectedRoute, so it needs its own coverage.
  const at = (path: string) => {
    window.history.pushState({}, '', path);
    render(<App />);
  };

  beforeEach(() => {
    mockKeycloak.authenticated = false;
    mockKeycloak.tokenParsed = null;
    mockInitializeKeycloak.mockReset().mockResolvedValue(true);
  });

  it('sends a caseworker to the caseworker dashboard', async () => {
    mockKeycloak.authenticated = true;
    mockKeycloak.tokenParsed = { realm_access: { roles: ['caseworker'] } };

    at('/dashboard');

    await waitFor(() => expect(window.location.pathname).toBe('/dashboard/caseworker'));
  });

  it('sends any other signed-in user to the citizen dashboard', async () => {
    mockKeycloak.authenticated = true;
    mockKeycloak.tokenParsed = { realm_access: { roles: ['citizen'] } };

    at('/dashboard');

    await waitFor(() => expect(window.location.pathname).toBe('/dashboard/citizen'));
  });

  it('sends an anonymous visitor to the login page', async () => {
    at('/dashboard');

    await waitFor(() => expect(window.location.pathname).toBe('/'));
  });

  it('sends an unknown path to the login page too', async () => {
    at('/geen-idee');

    await waitFor(() => expect(window.location.pathname).toBe('/'));
  });
});
