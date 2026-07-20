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

vi.mock('../services/tenant', () => ({
  initializeTenantTheme: vi.fn().mockResolvedValue(true),
  loadTenantConfigs: vi.fn().mockResolvedValue({}),
  getTenantConfig: vi.fn().mockReturnValue(null),
  getDefaultTenantConfig: vi.fn().mockReturnValue(null),
}));

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
