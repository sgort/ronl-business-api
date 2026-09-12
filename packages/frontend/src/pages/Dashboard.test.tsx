// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Dashboard from './Dashboard';

const mockNavigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }));

const mockKeycloak = vi.hoisted(() => ({
  authenticated: true,
  logout: vi.fn(),
}));
const mockGetUser = vi.hoisted(() => vi.fn());
vi.mock('../services/keycloak', () => ({ default: mockKeycloak, getUser: mockGetUser }));

const mockEvaluateDecision = vi.hoisted(() => vi.fn());
const mockProcessHistory = vi.hoisted(() => vi.fn());
vi.mock('../services/api', () => ({
  businessApi: {
    evaluateDecision: mockEvaluateDecision,
    process: { history: mockProcessHistory },
  },
}));

const TENANT_UTRECHT = {
  displayName: 'Gemeente Utrecht',
  features: {
    zorgtoeslag: true,
    vergunningen: true,
    subsidies: true,
    meldingen: false,
    dvtp: false,
  },
};
const mockTenant = vi.hoisted(() => ({
  initializeTenantTheme: vi.fn().mockResolvedValue(true),
  loadTenantConfigs: vi.fn().mockResolvedValue({}),
  getTenantConfig: vi.fn(),
  getDefaultTenantConfig: vi.fn().mockReturnValue(null),
}));
vi.mock('../services/tenant', () => mockTenant);

const mockBrp = vi.hoisted(() => ({
  getPersonTimeline: vi.fn(),
  calculateHistoricalState: vi.fn(() => ({})),
}));
vi.mock('../services/brp.timeline', () => mockBrp);

const mockBsn = vi.hoisted(() => ({ getUserBSN: vi.fn() }));
vi.mock('../services/bsn.mapping', () => mockBsn);

vi.mock('../components/TimeLine', () => ({
  Timeline: ({ isLoading }: { isLoading?: boolean }) => (
    <div data-testid="timeline">{isLoading ? 'timeline-loading' : 'timeline-ready'}</div>
  ),
}));
vi.mock('../components/PersonalDataPanel', () => ({
  PersonalDataPanel: () => <div data-testid="personal-data" />,
}));

vi.mock('../components/ProcessStartFormViewer', () => ({
  default: function MockProcessStartFormViewer(props: {
    processKey: string;
    onStarted: (dossier: string) => void;
    onError: () => void;
  }) {
    return (
      <div data-testid="process-start-form">
        processKey={props.processKey}
        <button type="button" onClick={() => props.onStarted('D-123')}>
          simulate-success
        </button>
        <button type="button" onClick={() => props.onError()}>
          simulate-error
        </button>
      </div>
    );
  },
}));
vi.mock('../components/DecisionViewer', () => ({ default: () => null }));
vi.mock('../components/CaseworkerDashboard/DvtpStartSection', () => ({ default: () => null }));
vi.mock('../components/CaseworkerDashboard/DvtpTakenSection', () => ({ default: () => null }));

beforeEach(() => {
  mockKeycloak.authenticated = true;
  mockGetUser.mockReturnValue({
    sub: 'user-1',
    name: 'Test User',
    preferred_username: 'test-citizen-utrecht',
    municipality: 'utrecht',
    roles: [],
  });
  mockEvaluateDecision.mockResolvedValue({ success: true, data: [] });
  mockProcessHistory.mockResolvedValue({ success: true, data: [] });
  mockTenant.getTenantConfig.mockReturnValue(TENANT_UTRECHT);
  mockTenant.getDefaultTenantConfig.mockReturnValue(null);
  mockBsn.getUserBSN.mockReturnValue('999993653');
  mockBrp.getPersonTimeline.mockResolvedValue({
    currentState: { naam: 'Test' },
    events: [],
    earliestDate: new Date(2000, 0, 1),
    latestDate: new Date(2026, 0, 1),
  });
  // Dashboard fetches /timeline-config.json for the panel beside the timeline.
  global.fetch = vi.fn().mockResolvedValue({
    json: async () => ({ fields: [] }),
  }) as unknown as typeof fetch;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('Dashboard', () => {
  it('redirects to / when the user is not authenticated', () => {
    mockKeycloak.authenticated = false;

    render(<Dashboard />);

    expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
  });

  it('lists the services enabled for the tenant', async () => {
    render(<Dashboard />);

    expect(await screen.findByText('Zorgtoeslag')).toBeInTheDocument();
    expect(screen.getByText('Vergunningen')).toBeInTheDocument();
    expect(screen.queryByText('Meldingen')).not.toBeInTheDocument();
  });

  it('opening the Vergunningen service mounts the form for AwbShellProcess', async () => {
    const user = userEvent.setup();
    render(<Dashboard />);

    await user.click(await screen.findByText('Vergunningen'));

    expect(screen.getByTestId('process-start-form')).toHaveTextContent(
      'processKey=AwbShellProcess'
    );
  });

  it('a successful permit submission shows the confirmation, then switches to "Mijn aanvragen" and reloads it', async () => {
    const user = userEvent.setup();
    render(<Dashboard />);

    await user.click(await screen.findByText('Vergunningen'));
    await user.click(screen.getByRole('button', { name: 'simulate-success' }));

    // VergunningForm's own confirmation screen, before the Dashboard-level tab switch.
    expect(screen.getByText('Aanvraag ingediend')).toBeInTheDocument();
    expect(screen.getByText('D-123')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Naar mijn aanvragen' }));

    await waitFor(() => expect(mockProcessHistory).toHaveBeenCalledWith('user-1'));
    expect(screen.getByRole('button', { name: /Mijn aanvragen/ })).toHaveClass('text-white');
  });

  it('Mijn aanvragen shows an empty state when there are no applications', async () => {
    const user = userEvent.setup();
    render(<Dashboard />);

    await user.click(screen.getByRole('button', { name: 'Mijn aanvragen' }));

    await waitFor(() =>
      expect(screen.getByText('U heeft nog geen aanvragen ingediend.')).toBeInTheDocument()
    );
  });

  it('Mijn aanvragen shows an error message when loading fails', async () => {
    mockProcessHistory.mockResolvedValue({ success: false });
    const user = userEvent.setup();
    render(<Dashboard />);

    await user.click(screen.getByRole('button', { name: 'Mijn aanvragen' }));

    await waitFor(() =>
      expect(screen.getByText('Aanvragen konden niet worden geladen.')).toBeInTheDocument()
    );
  });

  it('the zorgtoeslag calculator evaluates the decision and shows an eligible result', async () => {
    mockEvaluateDecision.mockResolvedValue({
      success: true,
      data: [{ eligible: { value: true }, amountYear: { value: 1200 } }],
    });
    const user = userEvent.setup();
    render(<Dashboard />);

    await user.click(await screen.findByText('Zorgtoeslag'));
    await user.click(screen.getByRole('button', { name: 'Berekenen' }));

    await waitFor(() => expect(screen.getByText('✓ Recht op zorgtoeslag')).toBeInTheDocument());
    expect(mockEvaluateDecision).toHaveBeenCalledWith(
      'zorgtoeslag_resultaat',
      expect.objectContaining({
        geboortedatum: { value: '2000-01-10', type: 'String' },
        woonachtigNL: { value: true, type: 'Boolean' },
      })
    );
  });

  it('logout calls keycloak.logout with the app origin as redirect', async () => {
    const user = userEvent.setup();
    render(<Dashboard />);

    await user.click(screen.getByRole('button', { name: 'Uitloggen' }));

    expect(mockKeycloak.logout).toHaveBeenCalledWith({ redirectUri: window.location.origin });
  });
});

describe('Dashboard header and tabs', () => {
  it('falls back to the municipality claim when no tenant config resolved', () => {
    mockTenant.getTenantConfig.mockReturnValue(null);
    render(<Dashboard />);
    expect(screen.getByText('Gemeente utrecht')).toBeInTheDocument();
  });

  it('shows the assurance level and every realm role the token carries', () => {
    mockGetUser.mockReturnValue({
      sub: 'user-1',
      preferred_username: 'test-citizen-utrecht',
      municipality: 'utrecht',
      loa: 'substantieel',
      roles: ['citizen', 'beta-tester'],
    });

    render(<Dashboard />);

    expect(screen.getByText('LoA: substantieel')).toBeInTheDocument();
    expect(screen.getByText('citizen')).toBeInTheDocument();
    expect(screen.getByText('beta-tester')).toBeInTheDocument();
  });

  it('falls back to a generic label for a token with no username, loa or roles', () => {
    mockGetUser.mockReturnValue({ sub: 'user-1', municipality: 'utrecht' });

    render(<Dashboard />);

    expect(screen.getByText('Ingelogd')).toBeInTheDocument();
    expect(screen.queryByText(/LoA:/)).not.toBeInTheDocument();
  });

  it('does not offer the consent tab to a tenant without dvtp', async () => {
    render(<Dashboard />);
    await screen.findByText('Gemeente Utrecht');
    expect(screen.queryByRole('button', { name: 'Mijn toestemming' })).toBeNull();
  });

  it('adds the consent tab for a tenant with dvtp enabled', async () => {
    mockTenant.getTenantConfig.mockReturnValue({
      ...TENANT_UTRECHT,
      features: { ...TENANT_UTRECHT.features, dvtp: true },
    });
    const user = userEvent.setup();
    render(<Dashboard />);

    const tab = await screen.findByRole('button', { name: 'Mijn toestemming' });
    await user.click(tab);
    expect(tab).toBeInTheDocument();
  });
});

describe('Dashboard service forms', () => {
  it('reports a permit submission that the engine refused', async () => {
    const user = userEvent.setup();
    render(<Dashboard />);

    await user.click(await screen.findByText('Vergunningen'));
    await user.click(screen.getByRole('button', { name: 'simulate-error' }));

    expect(
      screen.getByText('De aanvraag kon niet worden ingediend. Probeer het opnieuw.')
    ).toBeInTheDocument();
  });

  it('starts the subsidy process under its own process key, and reports its failures', async () => {
    const user = userEvent.setup();
    render(<Dashboard />);

    await user.click(await screen.findByText('Subsidies'));
    expect(screen.getByTestId('process-start-form')).toHaveTextContent(
      'processKey=ThuisbatterijSubsidieAanvraagProcess'
    );

    await user.click(screen.getByRole('button', { name: 'simulate-error' }));
    expect(
      screen.getByText('De aanvraag kon niet worden ingediend. Probeer het opnieuw.')
    ).toBeInTheDocument();
  });

  it('confirms a successful subsidy submission with its dossier number', async () => {
    const user = userEvent.setup();
    render(<Dashboard />);

    await user.click(await screen.findByText('Subsidies'));
    await user.click(screen.getByRole('button', { name: 'simulate-success' }));

    expect(screen.getByText(/D-123/)).toBeInTheDocument();
  });
});

describe('Dashboard zorgtoeslag calculator', () => {
  const openCalculator = async () => {
    const user = userEvent.setup();
    render(<Dashboard />);
    await user.click(await screen.findByText('Zorgtoeslag'));
    return user;
  };

  it('states plainly that there is no entitlement when the rule says so', async () => {
    mockEvaluateDecision.mockResolvedValue({
      success: true,
      data: [{ eligible: { value: false }, amountYear: { value: 0 } }],
    });
    const user = await openCalculator();

    await user.click(screen.getByRole('button', { name: /Bereken/ }));

    expect(await screen.findByText(/Geen recht op zorgtoeslag/)).toBeInTheDocument();
  });

  it('treats a decision row with neither field as no entitlement', async () => {
    // A rule table can return a row that matched nothing; defaulting to
    // "eligible" there would tell a citizen they get money they will not get.
    mockEvaluateDecision.mockResolvedValue({ success: true, data: [{}] });
    const user = await openCalculator();

    await user.click(screen.getByRole('button', { name: /Bereken/ }));

    expect(await screen.findByText(/Geen recht op zorgtoeslag/)).toBeInTheDocument();
  });

  it('reports a refused evaluation as a notice rather than as a decision', async () => {
    mockEvaluateDecision.mockResolvedValue({
      success: false,
      data: null,
      error: { code: 'X', message: 'boom' },
    });
    const user = await openCalculator();

    await user.click(screen.getByRole('button', { name: /Bereken/ }));

    expect(await screen.findByText(/kon niet worden afgerond/)).toBeInTheDocument();
  });

  it('reports a request that never reached the engine the same way', async () => {
    mockEvaluateDecision.mockRejectedValue(new Error('network down'));
    const user = await openCalculator();

    await user.click(screen.getByRole('button', { name: /Bereken/ }));

    expect(await screen.findByText(/kon niet worden afgerond/)).toBeInTheDocument();
  });

  it('sends a date of death only when one was entered', async () => {
    const user = await openCalculator();

    await user.click(screen.getByRole('button', { name: /Bereken/ }));
    await waitFor(() => expect(mockEvaluateDecision).toHaveBeenCalled());
    expect(mockEvaluateDecision.mock.calls[0][1]).not.toHaveProperty('overlijdensdatum');
  });
});

describe('Dashboard timeline tab', () => {
  it('loads the person timeline for a citizen with a mapped BSN', async () => {
    const user = userEvent.setup();
    render(<Dashboard />);

    await user.click(await screen.findByRole('button', { name: 'Tijdlijn' }));

    await waitFor(() => expect(mockBrp.getPersonTimeline).toHaveBeenCalledWith('999993653'));
    expect(await screen.findByTestId('timeline')).toBeInTheDocument();
  });

  it('does not call the BRP at all for a citizen with no mapped BSN', async () => {
    mockBsn.getUserBSN.mockReturnValue(undefined);
    const user = userEvent.setup();
    render(<Dashboard />);

    await user.click(await screen.findByRole('button', { name: 'Tijdlijn' }));

    expect(mockBrp.getPersonTimeline).not.toHaveBeenCalled();
  });

  it('stops loading when the BRP call fails, rather than spinning forever', async () => {
    mockBrp.getPersonTimeline.mockRejectedValue(new Error('brp down'));
    const user = userEvent.setup();
    render(<Dashboard />);

    await user.click(await screen.findByRole('button', { name: 'Tijdlijn' }));

    await waitFor(() => expect(mockBrp.getPersonTimeline).toHaveBeenCalled());
    expect(screen.queryByText('timeline-loading')).not.toBeInTheDocument();
  });
});

describe('Dashboard applications tab', () => {
  it('lists the applications the process history returned', async () => {
    mockProcessHistory.mockResolvedValue({
      success: true,
      data: [
        {
          id: 'pi-1',
          processDefinitionKey: 'AwbShellProcess',
          startTime: '2026-07-01T00:00:00Z',
          endTime: null,
          state: 'ACTIVE',
          businessKey: 'D-123',
        },
      ],
    });
    const user = userEvent.setup();
    render(<Dashboard />);

    await user.click(await screen.findByRole('button', { name: 'Mijn aanvragen' }));

    expect(await screen.findByText(/D-123/)).toBeInTheDocument();
  });
});

describe('Dashboard zorgtoeslag application', () => {
  const openApplication = async () => {
    const user = userEvent.setup();
    render(<Dashboard />);
    await user.click(await screen.findByText('Zorgtoeslag'));
    await user.click(screen.getByRole('button', { name: 'Aanvragen' }));
    return user;
  };

  it('starts the Awb process for a zorgtoeslag application', async () => {
    await openApplication();

    expect(screen.getByTestId('process-start-form')).toHaveTextContent(
      'processKey=AwbZorgtoeslagProcess'
    );
    expect(screen.getByText('Zorgtoeslag aanvragen')).toBeInTheDocument();
  });

  it('confirms a submitted application with its dossier number', async () => {
    const user = await openApplication();

    await user.click(screen.getByRole('button', { name: 'simulate-success' }));

    expect(screen.getByText('Aanvraag ingediend')).toBeInTheDocument();
    expect(screen.getByText('D-123')).toBeInTheDocument();
  });

  it('reports a refused application and clears the notice on the way back', async () => {
    const user = await openApplication();

    await user.click(screen.getByRole('button', { name: 'simulate-error' }));
    expect(
      screen.getByText('De aanvraag kon niet worden ingediend. Probeer het opnieuw.')
    ).toBeInTheDocument();

    // Going back to the calculator and forward again must not carry the old
    // failure notice with it.
    await user.click(screen.getByRole('button', { name: /Terug naar berekening/ }));
    await user.click(screen.getByRole('button', { name: 'Aanvragen' }));
    expect(
      screen.queryByText('De aanvraag kon niet worden ingediend. Probeer het opnieuw.')
    ).not.toBeInTheDocument();
  });
});
