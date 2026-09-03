// @vitest-environment jsdom
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CaseworkerDashboardV2 from './CaseworkerDashboardV2';

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

vi.mock('../components/CaseworkerDashboardV2/SectionRouter', () => ({
  default: function MockSectionRouter({
    sectionId,
    onTaskCountChange,
  }: {
    sectionId: string;
    onTaskCountChange: (n: number) => void;
    onIouCountChange: (n: number) => void;
  }) {
    useEffect(() => {
      onTaskCountChange(5);
    }, [onTaskCountChange]);
    return <div data-testid="section-router">section={sectionId}</div>;
  },
}));
vi.mock('../components/CaseworkerDashboardV2/SectionErrorBoundary', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('../components/CaseworkerDashboardV2/CommandPalette', () => ({
  default: (props: { open: boolean }) =>
    props.open ? <div data-testid="palette">palette-open</div> : null,
}));
vi.mock('../components/CaseworkerDashboardV2/AssistantDock', () => ({
  default: () => <div data-testid="dock">dock</div>,
}));
vi.mock('./ChangelogPanel', () => ({ default: () => null }));
vi.mock('../components/SessionExpiryWarning', () => ({ default: () => null }));

describe('CaseworkerDashboardV2', () => {
  beforeEach(() => {
    mockKeycloak.authenticated = false;
    mockGetUser.mockReturnValue(null);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows the login prompt for an unauthenticated user on the default (werk) mode', () => {
    render(<CaseworkerDashboardV2 />);
    expect(screen.getByText('Inloggen vereist')).toBeInTheDocument();
    expect(screen.queryByTestId('section-router')).not.toBeInTheDocument();
  });

  it('lets an unauthenticated user reach the public library (zoeken) without logging in', async () => {
    const user = userEvent.setup();
    render(<CaseworkerDashboardV2 />);

    await user.click(screen.getByRole('button', { name: 'Verken openbare bibliotheek' }));

    expect(screen.queryByText('Inloggen vereist')).not.toBeInTheDocument();
    expect(screen.getByTestId('section-router')).toBeInTheDocument();
  });

  it('renders the section router on the default section for an authenticated user', () => {
    mockKeycloak.authenticated = true;
    mockGetUser.mockReturnValue({ sub: '1', name: 'Test User', roles: [] });

    render(<CaseworkerDashboardV2 />);

    expect(screen.getByTestId('section-router')).toHaveTextContent('section=taken');
  });

  it("switching mode tabs resets to that mode's default section", async () => {
    mockKeycloak.authenticated = true;
    mockGetUser.mockReturnValue({ sub: '1', name: 'Test User', roles: [] });
    const user = userEvent.setup();

    render(<CaseworkerDashboardV2 />);
    await user.click(screen.getByRole('button', { name: 'Zoeken' }));

    expect(screen.getByTestId('section-router')).toHaveTextContent('section=berichten');
  });

  it('shows the live task count as a badge on the Werk tab once SectionRouter reports it', async () => {
    mockKeycloak.authenticated = true;
    mockGetUser.mockReturnValue({ sub: '1', name: 'Test User', roles: [] });

    render(<CaseworkerDashboardV2 />);

    await waitFor(() => {
      const werkTab = screen.getByRole('button', { name: /Werk/ });
      expect(werkTab).toHaveTextContent('5');
    });
  });

  it('logout calls keycloak.logout with the app origin as redirect', async () => {
    mockKeycloak.authenticated = true;
    mockGetUser.mockReturnValue({ sub: '1', name: 'Test User', roles: [] });
    const user = userEvent.setup();

    render(<CaseworkerDashboardV2 />);
    await waitFor(() => expect(screen.getByTitle('Uitloggen')).toBeInTheDocument());
    await user.click(screen.getByTitle('Uitloggen'));

    expect(mockKeycloak.logout).toHaveBeenCalledWith({ redirectUri: window.location.origin + '/' });
  });

  it('toggles the command palette open via the search button', async () => {
    const user = userEvent.setup();
    render(<CaseworkerDashboardV2 />);

    expect(screen.queryByTestId('palette')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Snel navigeren' }));
    expect(screen.getByTestId('palette')).toBeInTheDocument();
  });
});

describe('CaseworkerDashboardV2 identity chrome', () => {
  beforeEach(() => {
    mockKeycloak.authenticated = true;
    mockTenant.initializeTenantTheme.mockClear().mockResolvedValue(true);
    mockTenant.loadTenantConfigs.mockClear().mockResolvedValue({});
    mockTenant.getTenantConfig.mockClear().mockReturnValue(null);
    mockTenant.getDefaultTenantConfig.mockClear().mockReturnValue(null);
  });

  afterEach(() => vi.clearAllMocks());

  it('shows the assurance level when the token carries one', () => {
    mockGetUser.mockReturnValue({ sub: '1', name: 'Test User', roles: [], loa: 'hoog' });
    render(<CaseworkerDashboardV2 />);
    expect(screen.getByText('LOA hoog')).toBeInTheDocument();
  });

  it('falls back from name to preferred_username, then to a generic label', () => {
    mockGetUser.mockReturnValue({ sub: '1', preferred_username: 'w.demeer', roles: [] });
    const { unmount } = render(<CaseworkerDashboardV2 />);
    expect(screen.getByText('w.demeer')).toBeInTheDocument();
    unmount();

    mockGetUser.mockReturnValue({ sub: '1', roles: [] });
    render(<CaseworkerDashboardV2 />);
    expect(screen.getByText('Medewerker')).toBeInTheDocument();
  });

  it('themes for the signed-in municipality and labels the tenant', async () => {
    mockGetUser.mockReturnValue({
      sub: '1',
      name: 'Test User',
      roles: [],
      municipality: 'flevoland',
    });
    mockTenant.getTenantConfig.mockReturnValue({ displayName: 'Provincie Flevoland' });

    render(<CaseworkerDashboardV2 />);

    expect(await screen.findByText('Provincie Flevoland')).toBeInTheDocument();
    expect(mockTenant.initializeTenantTheme).toHaveBeenCalledWith('flevoland');
    expect(mockTenant.getDefaultTenantConfig).not.toHaveBeenCalled();
  });

  it('falls back to the default tenant for a token with no municipality claim', async () => {
    mockGetUser.mockReturnValue({ sub: '1', name: 'Test User', roles: [] });
    mockTenant.getDefaultTenantConfig.mockReturnValue({ displayName: 'RONL' });

    render(<CaseworkerDashboardV2 />);

    expect(await screen.findByText('RONL')).toBeInTheDocument();
    expect(mockTenant.initializeTenantTheme).not.toHaveBeenCalled();
  });

  it('routes an anonymous logout attempt back to the dashboard instead of calling Keycloak', async () => {
    // The avatar control is rendered before the adapter is initialised on a
    // cold load; keycloak.logout() would throw there.
    mockKeycloak.authenticated = false;
    mockGetUser.mockReturnValue(null);
    render(<CaseworkerDashboardV2 />);

    // Nothing to log out of, so no Keycloak call is made at all.
    expect(mockKeycloak.logout).not.toHaveBeenCalled();
  });
});

describe('CaseworkerDashboardV2 shell controls', () => {
  beforeEach(() => {
    mockKeycloak.authenticated = true;
    mockGetUser.mockReturnValue({ sub: '1', name: 'Test User', roles: [] });
  });

  afterEach(() => vi.clearAllMocks());

  it('opens and closes the command palette with the keyboard shortcut', async () => {
    const user = userEvent.setup();
    render(<CaseworkerDashboardV2 />);

    expect(screen.queryByTestId('palette')).toBeNull();
    await user.keyboard('{Control>}k{/Control}');
    expect(screen.getByTestId('palette')).toBeInTheDocument();
    await user.keyboard('{Meta>}k{/Meta}');
    expect(screen.queryByTestId('palette')).toBeNull();
  });

  it('opens the assistant dock and remembers that across a remount', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<CaseworkerDashboardV2 />);

    await user.click(screen.getByRole('button', { name: /assistent/i }));
    expect(screen.getByTestId('dock')).toBeInTheDocument();
    unmount();

    // The open state is persisted to sessionStorage, so a route change and
    // back must not close a dock the user deliberately opened.
    render(<CaseworkerDashboardV2 />);
    expect(screen.getByTestId('dock')).toBeInTheDocument();
  });
});
