// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PADashboardV2 from './PADashboardV2';
import type { Dossier } from '@ronl/shared';
import { makePaDataStub } from '../test/paData.stub';

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

const dossiers: Dossier[] = [
  {
    id: 'stikstof',
    naam: 'Stikstof',
    status: 'actief',
    momentum: 'up',
    kompas: {},
  } as unknown as Dossier,
  {
    id: 'jeugdzorg',
    naam: 'Jeugdzorg',
    status: 'actief',
    momentum: 'flat',
    kompas: {},
  } as unknown as Dossier,
  {
    id: 'oud-dossier',
    naam: 'Oud',
    status: 'sluimerend',
    momentum: 'down',
    kompas: {},
  } as unknown as Dossier,
];

const mockUsePaData = vi.hoisted(() => vi.fn());
vi.mock('./public-affairs-v2/PaDataProvider', () => ({
  PaDataProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  usePaData: mockUsePaData,
}));

/** The shared stub, with this file's dossier fixture. */
const defaultPaData = () =>
  makePaDataStub({ dossiers: { data: dossiers, status: 'ok', refetch: vi.fn() } });

vi.mock('../components/PADashboardV2/PASectionRouter', () => ({
  default: (props: {
    sectionId: string;
    onNavigate: (mode: string, sectionId: string) => void;
  }) => (
    <div data-testid="section-router">
      section={props.sectionId}
      <button type="button" onClick={() => props.onNavigate('monitoring', 'europa')}>
        deep-nav-to-europa
      </button>
    </div>
  ),
}));
vi.mock('../components/PADashboardV2/PACommandPalette', () => ({
  default: (props: { open: boolean }) =>
    props.open ? <div data-testid="palette">palette-open</div> : null,
}));
vi.mock('../components/PADashboardV2/PADock', () => ({
  default: () => <div data-testid="dock">dock</div>,
}));
vi.mock('../components/PADashboardV2/PANoAccessPanel', () => ({
  default: () => <div data-testid="no-access">no access</div>,
}));
vi.mock('../components/SessionExpiryWarning', () => ({ default: () => null }));
vi.mock('./ChangelogPanel', () => ({ default: () => null }));
vi.mock('./public-affairs-v2/NotificationsPanel', () => ({ default: () => null }));

describe('PADashboardV2', () => {
  beforeEach(() => {
    mockKeycloak.authenticated = false;
    mockGetUser.mockReturnValue(null);
    mockUsePaData.mockReturnValue(defaultPaData());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows the login prompt when not authenticated', () => {
    render(<PADashboardV2 />);
    expect(screen.getByText('Inloggen vereist')).toBeInTheDocument();
  });

  it('shows the no-access panel for an authenticated user missing the required role/org-type', () => {
    mockKeycloak.authenticated = true;
    mockGetUser.mockReturnValue({
      sub: '1',
      name: 'Test User',
      roles: ['public-affairs'],
      organisation_type: 'municipality', // wrong org type — gate requires 'province'
    });

    render(<PADashboardV2 />);

    expect(screen.getByTestId('no-access')).toBeInTheDocument();
  });

  it('renders the section router on the default section for an authorized user', () => {
    mockKeycloak.authenticated = true;
    mockGetUser.mockReturnValue({
      sub: '1',
      name: 'Test User',
      roles: ['public-affairs'],
      organisation_type: 'province',
    });

    render(<PADashboardV2 />);

    expect(screen.getByTestId('section-router')).toHaveTextContent('section=vandaag');
  });

  it('lists only actief dossiers in the Vandaag rail, ordered as provided', () => {
    mockKeycloak.authenticated = true;
    mockGetUser.mockReturnValue({
      sub: '1',
      name: 'Test User',
      roles: ['public-affairs'],
      organisation_type: 'province',
    });

    render(<PADashboardV2 />);

    expect(screen.getByText('Stikstof')).toBeInTheDocument();
    expect(screen.getByText('Jeugdzorg')).toBeInTheDocument();
    expect(screen.queryByText('Oud')).not.toBeInTheDocument(); // sluimerend, excluded from Vandaag rail
  });

  it('clicking a dossier in the rail jumps to Dossiers mode on that dossier', async () => {
    mockKeycloak.authenticated = true;
    mockGetUser.mockReturnValue({
      sub: '1',
      name: 'Test User',
      roles: ['public-affairs'],
      organisation_type: 'province',
    });
    const user = userEvent.setup();

    render(<PADashboardV2 />);
    await user.click(screen.getByText('Stikstof'));

    expect(screen.getByTestId('section-router')).toHaveTextContent('section=stikstof');
    expect(screen.getByRole('button', { name: 'Dossiers' })).toHaveClass('active');
  });

  it('switching to Monitoring lands on its default section (politiek)', async () => {
    mockKeycloak.authenticated = true;
    mockGetUser.mockReturnValue({
      sub: '1',
      name: 'Test User',
      roles: ['public-affairs'],
      organisation_type: 'province',
    });
    const user = userEvent.setup();

    render(<PADashboardV2 />);
    await user.click(screen.getByRole('button', { name: 'Monitoring' }));

    expect(screen.getByTestId('section-router')).toHaveTextContent('section=politiek');
  });

  it('remembers the last visited section per mode when switching back', async () => {
    mockKeycloak.authenticated = true;
    mockGetUser.mockReturnValue({
      sub: '1',
      name: 'Test User',
      roles: ['public-affairs'],
      organisation_type: 'province',
    });
    const user = userEvent.setup();

    render(<PADashboardV2 />);
    await user.click(screen.getByRole('button', { name: 'Monitoring' }));
    await user.click(screen.getByRole('button', { name: 'deep-nav-to-europa' }));
    expect(screen.getByTestId('section-router')).toHaveTextContent('section=europa');

    await user.click(screen.getByRole('button', { name: 'Vandaag' }));
    expect(screen.getByTestId('section-router')).toHaveTextContent('section=vandaag');

    await user.click(screen.getByRole('button', { name: 'Monitoring' }));
    expect(screen.getByTestId('section-router')).toHaveTextContent('section=europa');
  });

  it('logout calls keycloak.logout with the app origin as redirect', async () => {
    mockKeycloak.authenticated = true;
    mockGetUser.mockReturnValue({
      sub: '1',
      name: 'Test User',
      roles: ['public-affairs'],
      organisation_type: 'province',
    });
    const user = userEvent.setup();

    render(<PADashboardV2 />);
    await waitFor(() => expect(screen.getByTitle('Uitloggen')).toBeInTheDocument());
    await user.click(screen.getByTitle('Uitloggen'));

    expect(mockKeycloak.logout).toHaveBeenCalledWith({ redirectUri: window.location.origin + '/' });
  });

  it('toggles the command palette open via the search button', async () => {
    const user = userEvent.setup();
    render(<PADashboardV2 />);

    expect(screen.queryByTestId('palette')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Snel navigeren' }));
    expect(screen.getByTestId('palette')).toBeInTheDocument();
  });
});
