// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WooDashboard from './WooDashboard';

const mockNavigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }));

const mockKeycloak = vi.hoisted(() => ({
  authenticated: false,
  logout: vi.fn(),
}));
const mockGetUser = vi.hoisted(() => vi.fn());
vi.mock('../services/keycloak', () => ({ default: mockKeycloak, getUser: mockGetUser }));

vi.mock('../services/tenant', () => ({
  initializeTenantTheme: vi.fn().mockResolvedValue(true),
  loadTenantConfigs: vi.fn().mockResolvedValue({}),
  getTenantConfig: vi.fn().mockReturnValue(null),
  getDefaultTenantConfig: vi.fn().mockReturnValue(null),
}));

vi.mock('../components/WooDashboard/WooSectionRouter', () => ({
  default: (props: { tab: string; registerOpen: boolean; filters: Record<string, string> }) => (
    <div data-testid="section-router">
      tab={props.tab} registerOpen={String(props.registerOpen)} status={props.filters.status}
    </div>
  ),
}));
vi.mock('../components/WooDashboard/WooCommandPalette', () => ({
  default: (props: { open: boolean }) =>
    props.open ? <div data-testid="palette">palette-open</div> : null,
}));
vi.mock('../components/WooDashboard/WooDock', () => ({
  default: () => <div data-testid="dock">dock</div>,
}));
vi.mock('../components/WooDashboard/WooNoAccessPanel', () => ({
  default: () => <div data-testid="no-access">no access</div>,
}));
vi.mock('../components/SessionExpiryWarning', () => ({ default: () => null }));
vi.mock('./ChangelogPanel', () => ({ default: () => null }));

describe('WooDashboard', () => {
  beforeEach(() => {
    mockKeycloak.authenticated = false;
    mockGetUser.mockReturnValue(null);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows the login prompt when not authenticated', () => {
    render(<WooDashboard />);
    expect(screen.getByText('Inloggen vereist')).toBeInTheDocument();
  });

  it('logging in stores the redirect target and navigates to /auth', async () => {
    const user = userEvent.setup();
    render(<WooDashboard />);

    await user.click(screen.getByRole('button', { name: 'Inloggen als medewerker' }));

    expect(window.sessionStorage.getItem('post_login_redirect')).toBe('/dashboard/woo');
    expect(mockNavigate).toHaveBeenCalledWith('/auth');
  });

  it('shows the no-access panel for an authenticated user without the gate role', () => {
    mockKeycloak.authenticated = true;
    mockGetUser.mockReturnValue({ sub: '1', name: 'Test User', roles: ['other-role'] });

    render(<WooDashboard />);

    expect(screen.getByTestId('no-access')).toBeInTheDocument();
  });

  it('renders the section router on the default tab, register closed', () => {
    mockKeycloak.authenticated = true;
    mockGetUser.mockReturnValue({ sub: '1', name: 'Test User', roles: ['woo-coordinatie'] });

    render(<WooDashboard />);

    expect(screen.getByTestId('section-router')).toHaveTextContent(
      'tab=overzicht registerOpen=false'
    );
  });

  it('switching tabs updates the section router and closes the register', async () => {
    mockKeycloak.authenticated = true;
    mockGetUser.mockReturnValue({ sub: '1', name: 'Test User', roles: ['woo-coordinatie'] });
    const user = userEvent.setup();

    render(<WooDashboard />);
    await user.click(screen.getByRole('button', { name: 'Verzoeken' }));

    expect(screen.getByTestId('section-router')).toHaveTextContent('tab=verzoeken');
  });

  it('changing a rail filter updates state, auto-opens the register, and shows the reset button', async () => {
    mockKeycloak.authenticated = true;
    mockGetUser.mockReturnValue({ sub: '1', name: 'Test User', roles: ['woo-coordinatie'] });
    const user = userEvent.setup();

    render(<WooDashboard />);
    const rail = screen.getByLabelText('Filters en register');

    await user.selectOptions(within(rail).getByLabelText('Status'), 'Gesloten');

    expect(screen.getByTestId('section-router')).toHaveTextContent('registerOpen=true');
    expect(screen.getByTestId('section-router')).toHaveTextContent('status=Gesloten');
    expect(screen.getByRole('button', { name: 'Wissen' })).toBeInTheDocument();
  });

  it('"Wissen" resets filters back to defaults', async () => {
    mockKeycloak.authenticated = true;
    mockGetUser.mockReturnValue({ sub: '1', name: 'Test User', roles: ['woo-coordinatie'] });
    const user = userEvent.setup();

    render(<WooDashboard />);
    const rail = screen.getByLabelText('Filters en register');
    await user.selectOptions(within(rail).getByLabelText('Status'), 'Gesloten');
    await user.click(screen.getByRole('button', { name: 'Wissen' }));

    expect(screen.queryByRole('button', { name: 'Wissen' })).not.toBeInTheDocument();
    expect(screen.getByTestId('section-router')).toHaveTextContent('status=Alle statussen');
  });

  it('logout calls keycloak.logout with the app origin as redirect', async () => {
    mockKeycloak.authenticated = true;
    mockGetUser.mockReturnValue({ sub: '1', name: 'Test User', roles: ['woo-coordinatie'] });
    const user = userEvent.setup();

    render(<WooDashboard />);
    await waitFor(() => expect(screen.getByTitle('Uitloggen')).toBeInTheDocument());
    await user.click(screen.getByTitle('Uitloggen'));

    expect(mockKeycloak.logout).toHaveBeenCalledWith({ redirectUri: window.location.origin + '/' });
  });

  it('toggles the command palette open via the search button', async () => {
    const user = userEvent.setup();
    render(<WooDashboard />);

    expect(screen.queryByTestId('palette')).not.toBeInTheDocument();
    await user.click(screen.getByText('Spring naar weergave of verzoek…'));
    expect(screen.getByTestId('palette')).toBeInTheDocument();
  });
});
