// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PADashboardV2, { type PaCockpitHost } from './PADashboardV2';
import type { Dossier, KeycloakUser } from '@ronl/shared';
import { makePaDataStub } from '../test/paData.stub';
import { configurePaCockpit, __resetPaCockpitHostForTests } from '../host';
import { PA_MODES } from './public-affairs-v2/modes.config';

const mockNavigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }));

/**
 * Host registration is a plain top-level import plus a beforeEach here, unlike
 * services/pa.api.test.ts which must take `configurePaCockpit` from a dynamic
 * import inside freshApi(). The difference is vi.resetModules(): that file
 * resets the registry per case, so a statically-bound configurePaCockpit would
 * write to the pre-reset copy of ../host while pa.api read the post-reset one.
 * This file never resets modules, so the shell and this test share one instance
 * of ../host and a static import is the honest, simpler thing.
 *
 * The auth object reads through `authState` via a getter rather than capturing
 * values at registration time, because the cases below flip authentication
 * *after* beforeEach has run and before render.
 */
const authState = {
  authenticated: false,
  user: null as KeycloakUser | null,
};
const logoutMock = vi.fn();

function configureHost() {
  configurePaCockpit({
    auth: {
      get authenticated() {
        return authState.authenticated;
      },
      token: 'test-token',
      getUser: () => authState.user,
      updateToken: async () => false,
      logout: logoutMock,
    },
    tenant: {
      initializeTenantTheme: async () => true,
      loadTenantConfigs: async () => ({}),
      getTenantConfig: () => null,
      getDefaultTenantConfig: () => null,
    },
  });
}

/**
 * The React half of the contract. The four components stand in for the host's
 * own; `modes` is the full set, so a case that narrows it is visibly narrowing
 * something that would otherwise be there.
 */
const testHost: PaCockpitHost = {
  modes: PA_MODES,
  SectionRouter: (props) => (
    <div data-testid="section-router">
      section={props.sectionId}
      <button type="button" onClick={() => props.onNavigate?.('monitoring', 'europa')}>
        deep-nav-to-europa
      </button>
    </div>
  ),
  Dock: () => <div data-testid="dock">dock</div>,
  SessionExpiryWarning: () => null,
  ChangelogPanel: () => null,
};

const authorizedUser: KeycloakUser = {
  sub: '1',
  name: 'Test User',
  roles: ['public-affairs'],
  organisation_type: 'province',
} as unknown as KeycloakUser;

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

vi.mock('../components/PADashboardV2/PACommandPalette', () => ({
  default: (props: { open: boolean }) =>
    props.open ? <div data-testid="palette">palette-open</div> : null,
}));
vi.mock('../components/PADashboardV2/PANoAccessPanel', () => ({
  default: () => <div data-testid="no-access">no access</div>,
}));
vi.mock('./public-affairs-v2/NotificationsPanel', () => ({ default: () => null }));

describe('PADashboardV2', () => {
  beforeEach(() => {
    authState.authenticated = false;
    authState.user = null;
    __resetPaCockpitHostForTests();
    configureHost();
    mockUsePaData.mockReturnValue(defaultPaData());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows the login prompt when not authenticated', () => {
    render(<PADashboardV2 host={testHost} />);
    expect(screen.getByText('Inloggen vereist')).toBeInTheDocument();
  });

  it('shows the no-access panel for an authenticated user missing the required role/org-type', () => {
    authState.authenticated = true;
    authState.user = {
      sub: '1',
      name: 'Test User',
      roles: ['public-affairs'],
      organisation_type: 'municipality', // wrong org type — gate requires 'province'
    } as unknown as KeycloakUser;

    render(<PADashboardV2 host={testHost} />);

    expect(screen.getByTestId('no-access')).toBeInTheDocument();
  });

  it('renders the section router on the default section for an authorized user', () => {
    authState.authenticated = true;
    authState.user = authorizedUser;

    render(<PADashboardV2 host={testHost} />);

    expect(screen.getByTestId('section-router')).toHaveTextContent('section=vandaag');
  });

  it('lists only actief dossiers in the Vandaag rail, ordered as provided', () => {
    authState.authenticated = true;
    authState.user = authorizedUser;

    render(<PADashboardV2 host={testHost} />);

    expect(screen.getByText('Stikstof')).toBeInTheDocument();
    expect(screen.getByText('Jeugdzorg')).toBeInTheDocument();
    expect(screen.queryByText('Oud')).not.toBeInTheDocument(); // sluimerend, excluded from Vandaag rail
  });

  it('clicking a dossier in the rail jumps to Dossiers mode on that dossier', async () => {
    authState.authenticated = true;
    authState.user = authorizedUser;
    const user = userEvent.setup();

    render(<PADashboardV2 host={testHost} />);
    await user.click(screen.getByText('Stikstof'));

    expect(screen.getByTestId('section-router')).toHaveTextContent('section=stikstof');
    expect(screen.getByRole('button', { name: 'Dossiers' })).toHaveClass('active');
  });

  it('switching to Monitoring lands on its default section (politiek)', async () => {
    authState.authenticated = true;
    authState.user = authorizedUser;
    const user = userEvent.setup();

    render(<PADashboardV2 host={testHost} />);
    await user.click(screen.getByRole('button', { name: 'Monitoring' }));

    expect(screen.getByTestId('section-router')).toHaveTextContent('section=politiek');
  });

  it('remembers the last visited section per mode when switching back', async () => {
    authState.authenticated = true;
    authState.user = authorizedUser;
    const user = userEvent.setup();

    render(<PADashboardV2 host={testHost} />);
    await user.click(screen.getByRole('button', { name: 'Monitoring' }));
    await user.click(screen.getByRole('button', { name: 'deep-nav-to-europa' }));
    expect(screen.getByTestId('section-router')).toHaveTextContent('section=europa');

    await user.click(screen.getByRole('button', { name: 'Vandaag' }));
    expect(screen.getByTestId('section-router')).toHaveTextContent('section=vandaag');

    await user.click(screen.getByRole('button', { name: 'Monitoring' }));
    expect(screen.getByTestId('section-router')).toHaveTextContent('section=europa');
  });

  it("logout calls the host auth's logout with the app origin as redirect", async () => {
    authState.authenticated = true;
    authState.user = authorizedUser;
    const user = userEvent.setup();

    render(<PADashboardV2 host={testHost} />);
    await waitFor(() => expect(screen.getByTitle('Uitloggen')).toBeInTheDocument());
    await user.click(screen.getByTitle('Uitloggen'));

    expect(logoutMock).toHaveBeenCalledWith({ redirectUri: window.location.origin + '/' });
  });

  it('toggles the command palette open via the search button', async () => {
    const user = userEvent.setup();
    render(<PADashboardV2 host={testHost} />);

    expect(screen.queryByTestId('palette')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Snel navigeren' }));
    expect(screen.getByTestId('palette')).toBeInTheDocument();
  });

  it('renders only the modes the host supplied', () => {
    // Deny-by-default made observable: a host narrowing its mode set must not
    // find the full rail rendered anyway. This is the guarantee that replaces
    // pa-demo's Vite alias, and the reason `modes` is required rather than
    // defaulted to PA_MODES.
    //
    // The full-set render first is not decoration: it is what makes the second
    // assertion capable of failing. Without it, a shell that ignored
    // host.modes entirely and rendered nothing would still "pass".
    const full = render(<PADashboardV2 host={testHost} />);
    expect(screen.getByRole('button', { name: 'Beheer' })).toBeInTheDocument();
    full.unmount();

    const narrowed = PA_MODES.filter((m) => m.id === 'vandaag');
    render(<PADashboardV2 host={{ ...testHost, modes: narrowed }} />);

    expect(screen.getByRole('button', { name: 'Vandaag' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Beheer' })).not.toBeInTheDocument();
  });
});
