// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './App';

const mockKeycloak = vi.hoisted(() => ({
  authenticated: false,
  tokenParsed: null as { realm_access?: { roles: string[] } } | null,
}));
const mockInitializeKeycloak = vi.hoisted(() => vi.fn());
vi.mock('./services/keycloak', () => ({
  default: mockKeycloak,
  initializeKeycloak: mockInitializeKeycloak,
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
});
