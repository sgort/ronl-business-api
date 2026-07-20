// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Issuekaart from './Issuekaart';
import type { Dossier } from './pa.data';

const mockUsePaData = vi.hoisted(() => vi.fn());
vi.mock('./PaDataProvider', () => ({ usePaData: mockUsePaData }));

vi.mock('./Kompas', () => ({
  default: () => <div data-testid="kompas-viz" />,
  Trend: () => null,
}));
vi.mock('./FeitenCijfers', () => ({ DossierFeitenStrip: () => null }));
vi.mock('../../components/PADashboardV2/WatchBell', () => ({
  default: (props: { active: boolean; onToggle: () => void; disabled: boolean }) => (
    <button type="button" onClick={props.onToggle} disabled={props.disabled}>
      {props.active ? 'Volgend' : 'Volgen'}
    </button>
  ),
}));

const paApi = vi.hoisted(() => ({
  fetchSignals: vi.fn().mockResolvedValue([]),
  fetchInbox: vi.fn().mockResolvedValue({ data: [], meta: { total: 0, cap: 100, capped: false } }),
  fetchSearches: vi.fn().mockResolvedValue([]),
  signalTag: vi.fn(() => 'nl'),
  signalTagLabel: vi.fn(() => 'Politiek NL'),
}));
vi.mock('../../services/pa.api', () => paApi);

function makeDossier(overrides: Partial<Dossier> = {}): Dossier {
  return {
    id: 'stikstof',
    naam: 'Stikstofdossier',
    onderwerp: 'Onderwerp',
    status: 'actief',
    momentum: 'flat',
    waaromNu: '',
    waarover: '',
    kompas: {} as Dossier['kompas'],
    doel: '',
    ritme: { lobby: [], communicatie: [], events: [] } as unknown as Dossier['ritme'],
    mijlpalen: [],
    progressPct: 0,
    next: '',
    stakeholders: [],
    narratief: { onsVerhaal: '', frames: [], tegenframes: [] } as unknown as Dossier['narratief'],
    interventies: [],
    timeline: [],
    kompasLog: [],
    intervLog: [],
    overleg: [],
    ...overrides,
  } as Dossier;
}

beforeEach(() => {
  mockUsePaData.mockReturnValue({
    watchDossier: vi.fn().mockResolvedValue(undefined),
    unwatchDossier: vi.fn().mockResolvedValue(undefined),
    confirmSignal: vi.fn(),
  });
  paApi.fetchSearches.mockResolvedValue([]);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('Issuekaart', () => {
  it('renders the dossier name and Kompas visualisation on the default tab', () => {
    render(<Issuekaart dossier={makeDossier({ naam: 'Stikstofdossier' })} />);
    expect(screen.getByRole('heading', { name: 'Stikstofdossier' })).toBeInTheDocument();
    expect(screen.getByTestId('kompas-viz')).toBeInTheDocument();
  });

  it('starts unwatched when no matching watch search exists, then toggles to watching', async () => {
    const watchDossier = vi.fn().mockResolvedValue(undefined);
    mockUsePaData.mockReturnValue({
      watchDossier,
      unwatchDossier: vi.fn(),
      confirmSignal: vi.fn(),
    });
    const user = userEvent.setup();

    render(<Issuekaart dossier={makeDossier()} />);
    await waitFor(() => expect(paApi.fetchSearches).toHaveBeenCalled());

    const button = screen.getByRole('button', { name: 'Volgen' });
    await user.click(button);

    expect(watchDossier).toHaveBeenCalledWith('stikstof');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Volgend' })).toBeInTheDocument()
    );
  });

  it('starts watching when a matching dossier-wide watch search already exists', async () => {
    paApi.fetchSearches.mockResolvedValue([
      {
        id: 'w1',
        dossierId: 'stikstof',
        query: { q: '', types: [], source: [] },
        tags: [],
        scope: 'user',
        notify: true,
      },
    ]);

    render(<Issuekaart dossier={makeDossier()} />);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Volgend' })).toBeInTheDocument()
    );
  });

  it('switches to another sub-tab without crashing', async () => {
    const user = userEvent.setup();
    render(<Issuekaart dossier={makeDossier()} />);

    await user.click(screen.getByRole('button', { name: 'Narratief' }));

    expect(screen.queryByTestId('kompas-viz')).not.toBeInTheDocument();
  });
});
