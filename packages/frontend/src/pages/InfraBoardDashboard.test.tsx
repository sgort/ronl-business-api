// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InfraBoardDashboard from './InfraBoardDashboard';

const mockNavigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }));

const mockKeycloak = vi.hoisted(() => ({
  authenticated: false,
  logout: vi.fn(),
}));
const mockGetUser = vi.hoisted(() => vi.fn());
vi.mock('../services/keycloak', () => ({ default: mockKeycloak, getUser: mockGetUser }));

const mockTenant = vi.hoisted(() => ({
  initializeTenantTheme: vi.fn().mockResolvedValue(true),
  loadTenantConfigs: vi.fn().mockResolvedValue({}),
  getTenantConfig: vi.fn().mockReturnValue(null),
  getDefaultTenantConfig: vi.fn().mockReturnValue(null),
}));
vi.mock('../services/tenant', () => mockTenant);

vi.mock('../components/InfraBoardDashboard/InfraSectionRouter', () => ({
  default: (props: { mode: string; section: string }) => (
    <div data-testid="section-router">
      {props.mode}:{props.section}
    </div>
  ),
}));
vi.mock('../components/InfraBoardDashboard/InfraCommandPalette', () => ({
  default: (props: { open: boolean }) =>
    props.open ? <div data-testid="palette">palette-open</div> : null,
}));
vi.mock('../components/InfraBoardDashboard/InfraDock', () => ({
  default: () => <div data-testid="dock">dock</div>,
}));
vi.mock('../components/InfraBoardDashboard/InfraNoAccessPanel', () => ({
  default: () => <div data-testid="no-access">no access</div>,
}));
vi.mock('../components/SessionExpiryWarning', () => ({ default: () => null }));
vi.mock('./ChangelogPanel', () => ({ default: () => null }));

describe('InfraBoardDashboard', () => {
  beforeEach(() => {
    mockKeycloak.authenticated = false;
    mockGetUser.mockReturnValue(null);
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows the login prompt when not authenticated', () => {
    render(<InfraBoardDashboard />);
    expect(screen.getByText('Inloggen vereist')).toBeInTheDocument();
  });

  it('logging in stores the redirect target and navigates to /auth', async () => {
    const user = userEvent.setup();
    render(<InfraBoardDashboard />);

    await user.click(screen.getByRole('button', { name: 'Inloggen als medewerker' }));

    expect(window.sessionStorage.getItem('selected_idp')).toBe('medewerker');
    expect(window.sessionStorage.getItem('post_login_redirect')).toBe('/dashboard/infra-board');
    expect(mockNavigate).toHaveBeenCalledWith('/auth');
  });

  it('shows the no-access panel for an authenticated user without the gate role', async () => {
    mockKeycloak.authenticated = true;
    mockGetUser.mockReturnValue({ sub: '1', name: 'Test User', roles: ['other-role'] });

    render(<InfraBoardDashboard />);

    await waitFor(() => expect(screen.getByTestId('no-access')).toBeInTheDocument());
  });

  it('renders the section router with the default mode/section for a gated user', async () => {
    mockKeycloak.authenticated = true;
    mockGetUser.mockReturnValue({ sub: '1', name: 'Test User', roles: ['infra-projectteam'] });

    render(<InfraBoardDashboard />);

    await waitFor(() =>
      expect(screen.getByTestId('section-router')).toHaveTextContent('mijn-dag:overzicht')
    );
  });

  it("switching mode tabs resets to that mode's default section", async () => {
    mockKeycloak.authenticated = true;
    mockGetUser.mockReturnValue({ sub: '1', name: 'Test User', roles: ['infra-projectteam'] });
    const user = userEvent.setup();

    render(<InfraBoardDashboard />);
    await waitFor(() => expect(screen.getByTestId('section-router')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Portfolio' }));

    await waitFor(() =>
      expect(screen.getByTestId('section-router')).toHaveTextContent('portfolio:portfolio')
    );
  });

  it('logout calls keycloak.logout with the app origin as redirect', async () => {
    mockKeycloak.authenticated = true;
    mockGetUser.mockReturnValue({ sub: '1', name: 'Test User', roles: ['infra-projectteam'] });
    const user = userEvent.setup();

    render(<InfraBoardDashboard />);
    await waitFor(() => expect(screen.getByTitle('Uitloggen')).toBeInTheDocument());

    await user.click(screen.getByTitle('Uitloggen'));

    expect(mockKeycloak.logout).toHaveBeenCalledWith({ redirectUri: window.location.origin + '/' });
  });

  it('toggles the command palette open via the search button', async () => {
    const user = userEvent.setup();
    render(<InfraBoardDashboard />);

    expect(screen.queryByTestId('palette')).not.toBeInTheDocument();
    await user.click(screen.getByText('Spring naar weergave of project…'));
    expect(screen.getByTestId('palette')).toBeInTheDocument();
  });

  it('persists the dock-open state to sessionStorage', async () => {
    const user = userEvent.setup();
    render(<InfraBoardDashboard />);

    await user.click(screen.getByRole('button', { name: 'Vraag de assistent' }));

    expect(screen.getByTestId('dock')).toBeInTheDocument();
    expect(window.sessionStorage.getItem('infraBoard.dock.open')).toBe('1');
  });
});
