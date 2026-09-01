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

const mockUseOpenTasks = vi.hoisted(() => vi.fn());
const mockUseRipActiveAcrossPhases = vi.hoisted(() => vi.fn());
const mockUseDeployedProcessKeys = vi.hoisted(() => vi.fn());
const mockUseLivePhaseCounts = vi.hoisted(() => vi.fn());
vi.mock('../services/infra.api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/infra.api')>();
  return {
    ...actual,
    useOpenTasks: mockUseOpenTasks,
    useRipActiveAcrossPhases: mockUseRipActiveAcrossPhases,
    useDeployedProcessKeys: mockUseDeployedProcessKeys,
    useLivePhaseCounts: mockUseLivePhaseCounts,
  };
});

describe('InfraBoardDashboard', () => {
  beforeEach(() => {
    mockKeycloak.authenticated = false;
    mockGetUser.mockReturnValue(null);
    window.sessionStorage.clear();
    mockUseOpenTasks.mockReturnValue({ data: null, loading: false, error: false, reload: vi.fn() });
    mockUseRipActiveAcrossPhases.mockReturnValue({
      data: null,
      loading: false,
      error: false,
      reload: vi.fn(),
    });
    mockUseDeployedProcessKeys.mockReturnValue({
      data: { deployedKeys: ['RipR21Process'] },
      loading: false,
      error: false,
      reload: vi.fn(),
    });
    mockUseLivePhaseCounts.mockReturnValue({
      data: { counts: {} },
      loading: false,
      error: false,
      reload: vi.fn(),
    });
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

  it('shows Mijn dag rail stats for a gated user', async () => {
    mockKeycloak.authenticated = true;
    mockGetUser.mockReturnValue({ sub: '1', name: 'Test User', roles: ['infra-projectteam'] });

    render(<InfraBoardDashboard />);

    await waitFor(() => expect(screen.getByText('Taken vandaag')).toBeInTheDocument());
    expect(screen.getByText('Urgent / te laat')).toBeInTheDocument();
    expect(screen.getByText('Mijn projecten')).toBeInTheDocument();
  });

  it('Portfolio rail has no "Alle projecten" nav item, and shows stage/health stats instead', async () => {
    mockKeycloak.authenticated = true;
    mockGetUser.mockReturnValue({ sub: '1', name: 'Test User', roles: ['infra-projectteam'] });
    const user = userEvent.setup();

    render(<InfraBoardDashboard />);
    await user.click(screen.getByRole('button', { name: 'Portfolio' }));

    await waitFor(() => expect(screen.getByText('Op schema')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Alle projecten' })).not.toBeInTheDocument();
    expect(screen.getByText('Aandacht')).toBeInTheDocument();
    expect(screen.getByText('Risico')).toBeInTheDocument();
    expect(screen.getByText('Wacht op start')).toBeInTheDocument();
  });

  it('Beheer rail shows the faseladder subtitle and a deployed-phase item with no muted class', async () => {
    mockKeycloak.authenticated = true;
    mockGetUser.mockReturnValue({ sub: '1', name: 'Test User', roles: ['infra-projectteam'] });
    const user = userEvent.setup();

    render(<InfraBoardDashboard />);
    await user.click(screen.getByRole('button', { name: 'Beheer' }));

    await waitFor(() => expect(screen.getByText(/RIP-faseladder ·/)).toBeInTheDocument());
    const r21Item = screen.getByRole('button', { name: /Projectplan planvoorbereiding/ });
    expect(r21Item.className).not.toContain('muted');
  });

  it('Beheer rail mutes an undeployed phase item', async () => {
    mockKeycloak.authenticated = true;
    mockGetUser.mockReturnValue({ sub: '1', name: 'Test User', roles: ['infra-projectteam'] });
    mockUseDeployedProcessKeys.mockReturnValue({
      data: { deployedKeys: [] },
      loading: false,
      error: false,
      reload: vi.fn(),
    });
    const user = userEvent.setup();

    render(<InfraBoardDashboard />);
    await user.click(screen.getByRole('button', { name: 'Beheer' }));

    const r21Item = await screen.findByRole('button', { name: /Projectplan planvoorbereiding/ });
    expect(r21Item.className).toContain('muted');
  });

  it('Beheer rail groups phase items under stage headers, and keeps Faseladder/Archief navigable', async () => {
    mockKeycloak.authenticated = true;
    mockGetUser.mockReturnValue({ sub: '1', name: 'Test User', roles: ['infra-projectteam'] });
    const user = userEvent.setup();

    render(<InfraBoardDashboard />);
    await user.click(screen.getByRole('button', { name: 'Beheer' }));

    await waitFor(() => expect(screen.getByText(/R2 · Planvoorbereiding/)).toBeInTheDocument());
    expect(screen.getByText(/R6 · Decharge/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Faseladder' })).toBeInTheDocument();
    // Two "Archief" buttons legitimately coexist — the Projecten section's
    // own Archief item, and the unrelated IOU group's "Archief" item
    // (id: 'iou-archief', pre-existing, untouched by this task).
    expect(screen.getAllByRole('button', { name: 'Archief' })).toHaveLength(2);
  });

  it('hides Beheer phase items (but not Faseladder/Archief) from an authenticated user without the gate role', async () => {
    mockKeycloak.authenticated = true;
    mockGetUser.mockReturnValue({ sub: '1', name: 'Test User', roles: ['other-role'] });
    const user = userEvent.setup();

    render(<InfraBoardDashboard />);
    await user.click(screen.getByRole('button', { name: 'Beheer' }));

    expect(await screen.findByRole('button', { name: 'Faseladder' })).toBeInTheDocument();
    // Two "Archief" buttons legitimately coexist here too — the Projecten
    // section's own Archief item (gated on isAuth) and the unrelated IOU
    // group's "Archief" item (id: 'iou-archief', also gated on isAuth only,
    // not hasGateRole) — see the sibling "groups phase items..." test above.
    expect(screen.getAllByRole('button', { name: 'Archief' })).toHaveLength(2);
    expect(screen.queryByText(/R2 · Planvoorbereiding/)).not.toBeInTheDocument();
  });
});
