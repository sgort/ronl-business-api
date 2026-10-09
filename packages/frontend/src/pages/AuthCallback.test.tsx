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
  tokenParsed: null as { realm_access?: { roles: string[] }; name?: string } | null,
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

  it('citizen flow passes a stored username hint along with the idp', async () => {
    sessionStorage.setItem('selected_idp', 'digid');
    sessionStorage.setItem('username_hint', 'test-citizen-amsterdam');
    mockKeycloak.init.mockResolvedValue(false);
    render(<AuthCallback />);

    await vi.waitFor(() =>
      expect(mockKeycloak.login).toHaveBeenCalledWith({
        idpHint: 'digid',
        loginHint: 'test-citizen-amsterdam',
      })
    );
    expect(sessionStorage.getItem('username_hint')).toBeNull();
  });

  it('Flevoland flow calls keycloak.login with the entra-flevoland idp hint when not authenticated', async () => {
    sessionStorage.setItem('selected_idp', 'entra-flevoland');
    mockKeycloak.init.mockResolvedValue(false);

    render(<AuthCallback />);

    await vi.waitFor(() =>
      expect(mockKeycloak.login).toHaveBeenCalledWith({ idpHint: 'entra-flevoland' })
    );
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

  it('honours a chosen caseworker board for a user who also holds infra-projectteam', async () => {
    // The Caseworker card on the landing page stores this redirect. A user with
    // both roles who picks that card lands on it, not on their default board.
    sessionStorage.setItem('post_login_redirect', '/dashboard/caseworker');
    mockKeycloak.init.mockResolvedValue(true);
    setRoles(['caseworker', 'infra-projectteam', 'woo-coordinatie']);

    render(<AuthCallback />);

    await vi.waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard/caseworker', { replace: true })
    );
  });

  it('falls back to the role dashboard when the stored redirect is not allowed for the role', async () => {
    sessionStorage.setItem('post_login_redirect', '/dashboard/caseworker');
    mockKeycloak.init.mockResolvedValue(true);
    setRoles(['infra-projectteam']);

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

  describe('a board chosen on a landing page', () => {
    function choose(route: string, landing = '/') {
      sessionStorage.setItem('post_login_redirect', route);
      sessionStorage.setItem('login_board_request', JSON.stringify({ route, landing }));
    }

    it('opens it when the role allows', async () => {
      choose('/dashboard/public-affairs');
      mockKeycloak.init.mockResolvedValue(true);
      setRoles(['public-affairs']);

      render(<AuthCallback />);

      await vi.waitFor(() =>
        expect(mockNavigate).toHaveBeenCalledWith('/dashboard/public-affairs', { replace: true })
      );
      expect(sessionStorage.getItem('login_board_request')).toBeNull();
    });

    it('goes back to that landing page with the no-access state when the role does not allow', async () => {
      choose('/dashboard/public-affairs');
      mockKeycloak.init.mockResolvedValue(true);
      mockKeycloak.tokenParsed = { realm_access: { roles: ['caseworker'] }, name: 'Steven Gort' };

      render(<AuthCallback />);

      await vi.waitFor(() =>
        expect(mockNavigate).toHaveBeenCalledWith('/', {
          replace: true,
          state: {
            accessDenied: {
              route: '/dashboard/public-affairs',
              name: 'Steven Gort',
              home: '/dashboard/caseworker',
            },
          },
        })
      );
      expect(sessionStorage.getItem('login_board_request')).toBeNull();
    });

    it('offers no dashboard of their own to someone without any staff role', async () => {
      choose('/dashboard/caseworker', '/amsterdam');
      mockKeycloak.init.mockResolvedValue(true);
      setRoles(['citizen']);

      render(<AuthCallback />);

      await vi.waitFor(() =>
        expect(mockNavigate).toHaveBeenCalledWith('/amsterdam', {
          replace: true,
          state: {
            accessDenied: { route: '/dashboard/caseworker', name: undefined, home: null },
          },
        })
      );
    });

    it('works the same after a login through an identity provider', async () => {
      choose('/dashboard/infra-board');
      sessionStorage.setItem('selected_idp', 'entra-flevoland');
      mockKeycloak.init.mockResolvedValue(true);
      setRoles(['caseworker']);

      render(<AuthCallback />);

      await vi.waitFor(() =>
        expect(mockNavigate).toHaveBeenCalledWith('/', expect.objectContaining({ replace: true }))
      );
    });

    it('keeps the quiet fallback when a dashboard, not a landing page, stored the redirect', async () => {
      sessionStorage.setItem('post_login_redirect', '/dashboard/woo');
      sessionStorage.setItem(
        'login_board_request',
        JSON.stringify({ route: '/dashboard/caseworker', landing: '/' })
      );
      mockKeycloak.init.mockResolvedValue(true);
      setRoles(['caseworker']);

      render(<AuthCallback />);

      await vi.waitFor(() =>
        expect(mockNavigate).toHaveBeenCalledWith('/dashboard/caseworker', { replace: true })
      );
    });
  });
});
