// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AuthCallback from './AuthCallback';

const mockNavigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }));

const mockKeycloak = vi.hoisted(() => ({
  init: vi.fn(),
  login: vi.fn(),
  tokenParsed: null as { realm_access?: { roles: string[] } } | null,
}));
vi.mock('../services/keycloak', () => ({
  default: mockKeycloak,
  // Real initializeKeycloak() always uses fixed check-sso options now,
  // regardless of caller — see services/keycloak.ts for why.
  initializeKeycloak: () => mockKeycloak.init({ onLoad: 'check-sso', checkLoginIframe: false }),
}));

function setRoles(roles: string[]) {
  mockKeycloak.tokenParsed = { realm_access: { roles } };
}

beforeEach(() => {
  sessionStorage.clear();
  mockKeycloak.tokenParsed = null;
  mockKeycloak.login.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
});

describe('AuthCallback', () => {
  it('shows a loading indicator initially', () => {
    mockKeycloak.init.mockReturnValue(new Promise(() => {}));
    render(<AuthCallback />);
    expect(screen.getByText('Verbinding maken...')).toBeInTheDocument();
  });

  it('medewerker flow, already authenticated: clears session keys and navigates by role', async () => {
    sessionStorage.setItem('selected_idp', 'medewerker');
    sessionStorage.setItem('username_hint', 'jan');
    mockKeycloak.init.mockResolvedValue(true);
    setRoles(['caseworker']);

    render(<AuthCallback />);

    await vi.waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard/caseworker', { replace: true })
    );
    expect(mockKeycloak.init).toHaveBeenCalledWith(
      expect.objectContaining({ onLoad: 'check-sso' })
    );
    expect(sessionStorage.getItem('selected_idp')).toBeNull();
    expect(sessionStorage.getItem('username_hint')).toBeNull();
  });

  it('medewerker flow, not yet authenticated: logs in with the stored username hint', async () => {
    sessionStorage.setItem('selected_idp', 'medewerker');
    sessionStorage.setItem('username_hint', 'jan.jansen');
    mockKeycloak.init.mockResolvedValue(false);

    render(<AuthCallback />);

    await vi.waitFor(() =>
      expect(mockKeycloak.login).toHaveBeenCalledWith({ loginHint: 'jan.jansen' })
    );
    expect(sessionStorage.getItem('username_hint')).toBeNull();
  });

  it('medewerker flow with no username hint falls back to the sentinel login hint', async () => {
    sessionStorage.setItem('selected_idp', 'medewerker');
    mockKeycloak.init.mockResolvedValue(false);

    render(<AuthCallback />);

    await vi.waitFor(() =>
      expect(mockKeycloak.login).toHaveBeenCalledWith({ loginHint: '__medewerker__' })
    );
  });

  it('citizen flow already authenticated navigates without ever calling keycloak.login', async () => {
    sessionStorage.setItem('selected_idp', 'digid');
    mockKeycloak.init.mockResolvedValue(true);
    setRoles([]);

    render(<AuthCallback />);

    await vi.waitFor(() => expect(mockNavigate).toHaveBeenCalled());
    // Only ever check-sso — login-required would have been wrong the moment
    // anything else (e.g. ProtectedRoute) already called the shared,
    // memoized init first with different options; see services/keycloak.ts.
    expect(mockKeycloak.init).toHaveBeenCalledWith(
      expect.objectContaining({ onLoad: 'check-sso' })
    );
    expect(mockKeycloak.login).not.toHaveBeenCalled();
  });

  it('citizen flow calls keycloak.login with the selected idp when not authenticated', async () => {
    sessionStorage.setItem('selected_idp', 'digid');
    mockKeycloak.init.mockResolvedValue(false);

    render(<AuthCallback />);

    await vi.waitFor(() => expect(mockKeycloak.login).toHaveBeenCalledWith({ idpHint: 'digid' }));
  });

  it('citizen flow with no stored idp calls keycloak.login with no idpHint when not authenticated', async () => {
    mockKeycloak.init.mockResolvedValue(false);

    render(<AuthCallback />);

    await vi.waitFor(() => expect(mockKeycloak.login).toHaveBeenCalledWith(undefined));
  });

  it('a thrown init error shows the generic error message with a way back', async () => {
    mockKeycloak.init.mockRejectedValue(new Error('network down'));
    const user = userEvent.setup();

    render(<AuthCallback />);

    expect(
      await screen.findByText('Er is een fout opgetreden bij het inloggen. Probeer het opnieuw.')
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Terug naar inlogkeuze' }));
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it.each([
    [['woo-coordinatie'], '/dashboard/woo'],
    [['infra-projectteam'], '/dashboard/infra-board'],
    [['public-affairs'], '/dashboard/public-affairs'],
    [['caseworker'], '/dashboard/caseworker'],
    [[], '/dashboard/citizen'],
  ])('routes roles %s to %s when there is no stored redirect', async (roles, expected) => {
    mockKeycloak.init.mockResolvedValue(true);
    setRoles(roles);

    render(<AuthCallback />);

    await vi.waitFor(() => expect(mockNavigate).toHaveBeenCalledWith(expected, { replace: true }));
  });

  it('honours a stored post-login redirect the role is allowed to access', async () => {
    sessionStorage.setItem('post_login_redirect', '/dashboard/woo');
    mockKeycloak.init.mockResolvedValue(true);
    setRoles(['woo-coordinatie']);

    render(<AuthCallback />);

    await vi.waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard/woo', { replace: true })
    );
    expect(sessionStorage.getItem('post_login_redirect')).toBeNull();
  });

  it('falls back to the role dashboard when the stored redirect is not allowed for the role', async () => {
    // infra-projectteam members carry caseworker too, but their home stays infra-board.
    sessionStorage.setItem('post_login_redirect', '/dashboard/caseworker');
    mockKeycloak.init.mockResolvedValue(true);
    setRoles(['caseworker', 'infra-projectteam']);

    render(<AuthCallback />);

    await vi.waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard/infra-board', { replace: true })
    );
  });

  it('ignores a stored redirect that does not point at a /dashboard/ path', async () => {
    sessionStorage.setItem('post_login_redirect', '/some/other/path');
    mockKeycloak.init.mockResolvedValue(true);
    setRoles([]);

    render(<AuthCallback />);

    await vi.waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard/citizen', { replace: true })
    );
  });
});
