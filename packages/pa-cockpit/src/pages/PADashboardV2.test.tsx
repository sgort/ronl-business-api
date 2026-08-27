// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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

function configureHost() {
  configurePaCockpit({
    auth: {
      get authenticated() {
        return authState.authenticated;
      },
      token: 'test-token',
      getUser: () => authState.user,
      updateToken: async () => false,
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

  it('renders both login controls when the host supplies onLogin, and each calls it', async () => {
    const onLogin = vi.fn();
    const user = userEvent.setup();
    render(<PADashboardV2 host={{ ...testHost, onLogin }} />);

    const headerButton = screen.getByRole('button', { name: 'Inloggen' });
    const panelButton = screen.getByRole('button', { name: 'Inloggen als medewerker' });
    expect(headerButton).toBeInTheDocument();
    expect(panelButton).toBeInTheDocument();

    await user.click(headerButton);
    expect(onLogin).toHaveBeenCalledTimes(1);

    await user.click(panelButton);
    expect(onLogin).toHaveBeenCalledTimes(2);
  });

  it('renders neither login control without onLogin, but keeps the login-required text', () => {
    // The gate this pins is exactly the one the design spec rejected doing with
    // CSS (§2): pinned by no package test, caught only by ACC E2E. testHost
    // supplies no onLogin, so both controls must be absent — while the
    // explanatory panel text (already covered above only by coincidence) must
    // still render for an unauthenticated visitor.
    render(<PADashboardV2 host={testHost} />);

    expect(screen.getByRole('heading', { name: 'Inloggen vereist' })).toBeInTheDocument();
    expect(
      screen.getByText(/De PA-Cockpit bevat strategische dossierinformatie/)
    ).toBeInTheDocument();

    expect(screen.queryByRole('button', { name: 'Inloggen' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Inloggen als medewerker' })
    ).not.toBeInTheDocument();
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

  it('renders the avatar as a button and calls onLogout when a host supplies it', async () => {
    authState.authenticated = true;
    authState.user = authorizedUser;
    const onLogout = vi.fn();
    const user = userEvent.setup();
    render(<PADashboardV2 host={{ ...testHost, onLogout }} />);

    const avatar = screen.getByTitle('Uitloggen');
    expect(avatar.tagName).toBe('BUTTON');
    await user.click(avatar);
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('renders the avatar inert when the host supplies no onLogout', () => {
    // The avatar is the identity display, not a labelled logout button — a public
    // demo still wants the initials. What it must not have is a control that does
    // nothing, which is what the shimmed logout produced before this seam existed.
    authState.authenticated = true;
    authState.user = authorizedUser;
    render(<PADashboardV2 host={testHost} />);

    const avatar = document.querySelector('.pac-avatar');
    expect(avatar).not.toBeNull();
    expect(avatar!.tagName).not.toBe('BUTTON');
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

  it('renders for a host whose set does not contain vandaag', () => {
    // The initial mode used to be hardcoded to 'vandaag' and looked up with a
    // non-null assertion, so any host that dropped that mode crashed on first
    // render at currentMode.label. Nothing about 'vandaag' is special to the
    // shell; it is just what PA_MODES happens to list first.
    authState.authenticated = true;
    authState.user = authorizedUser;

    const narrowed = PA_MODES.filter((m) => m.id === 'monitoring');
    render(<PADashboardV2 host={{ ...testHost, modes: narrowed }} />);

    expect(screen.getByRole('button', { name: 'Monitoring' })).toHaveClass('active');
    expect(screen.queryByRole('button', { name: 'Vandaag' })).not.toBeInTheDocument();
    // Seeded from the mode's own defaultSectionId, not from the old 'vandaag'.
    expect(screen.getByTestId('section-router')).toHaveTextContent('section=politiek');
  });

  it('falls back to the first supplied mode when navigated outside the set', async () => {
    // The host's SectionRouter chooses the mode it passes to onNavigate, and it
    // has no obligation to pick one the host also put in `modes`. Here it jumps
    // to 'monitoring' against a vandaag-only set. That lands in the static-rail
    // branch, which reads currentMode.label — the exact dereference the old
    // non-null assertion turned into a crash. It must degrade, not throw.
    authState.authenticated = true;
    authState.user = authorizedUser;
    const user = userEvent.setup();

    const narrowed = PA_MODES.filter((m) => m.id === 'vandaag');
    render(<PADashboardV2 host={{ ...testHost, modes: narrowed }} />);

    await user.click(screen.getByRole('button', { name: 'deep-nav-to-europa' }));

    expect(screen.getByTestId('section-router')).toHaveTextContent('section=europa');
    // Rail fell back to the only mode the host supplied.
    expect(screen.getByText('Vandaag', { selector: '.pac-rail-card' })).toBeInTheDocument();
  });
});
