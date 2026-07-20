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

vi.mock('../services/tenant', () => ({
  initializeTenantTheme: vi.fn().mockResolvedValue(true),
  loadTenantConfigs: vi.fn().mockResolvedValue({}),
  getTenantConfig: vi.fn().mockReturnValue({
    displayName: 'Gemeente Utrecht',
    features: {
      zorgtoeslag: true,
      vergunningen: true,
      subsidies: true,
      meldingen: false,
      dvtp: false,
    },
  }),
  getDefaultTenantConfig: vi.fn().mockReturnValue(null),
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
