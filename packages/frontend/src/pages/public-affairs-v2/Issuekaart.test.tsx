// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Issuekaart from './Issuekaart';
import type { Dossier } from './pa.data';
import { makePaDataStub } from '../../test/paData.stub';

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
  mockUsePaData.mockReturnValue(
    makePaDataStub({
      watchDossier: vi.fn().mockResolvedValue(undefined),
      unwatchDossier: vi.fn().mockResolvedValue(undefined),
      confirmSignal: vi.fn(),
      dismissSignal: vi.fn().mockResolvedValue(undefined),
    })
  );
  paApi.fetchSearches.mockResolvedValue([]);
});

afterEach(() => {
  vi.clearAllMocks();
});

function makeSignal(over: Record<string, unknown> = {}) {
  return {
    id: 'sig-1',
    tab: 'politiek',
    dossierId: 'stikstof',
    title: 'Motie over stikstof',
    src: 'Tweede Kamer · Motie',
    bron: 'tk',
    ref: null,
    rel: 8,
    impact: 'kans',
    impactLabel: 'Kans',
    duiding: 'Duiding',
    status: 'confirmed',
    ...over,
  } as never;
}

/** Opens one of the sub-tabs on a freshly rendered Issuekaart. */
async function openTab(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(screen.getByRole('button', { name: label }));
}

describe('Issuekaart', () => {
  it('renders the dossier name and Kompas visualisation on the default tab', () => {
    render(<Issuekaart dossier={makeDossier({ naam: 'Stikstofdossier' })} />);
    expect(screen.getByRole('heading', { name: 'Stikstofdossier' })).toBeInTheDocument();
    expect(screen.getByTestId('kompas-viz')).toBeInTheDocument();
  });

  it('starts unwatched when no matching watch search exists, then toggles to watching', async () => {
    const watchDossier = vi.fn().mockResolvedValue(undefined);
    mockUsePaData.mockReturnValue(
      makePaDataStub({
        watchDossier,
        unwatchDossier: vi.fn(),
        confirmSignal: vi.fn(),
      })
    );
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

describe('Monitoring sub-tab', () => {
  it('shows the saved query, the curated signals and the inbox', async () => {
    paApi.fetchSignals.mockResolvedValue([makeSignal({ title: 'Bevestigd signaal' })]);
    paApi.fetchInbox.mockResolvedValue({
      data: [makeSignal({ id: 'in-1', title: 'Kandidaat signaal', status: 'candidate' })],
      meta: { total: 1, cap: 100, capped: false },
    });
    paApi.fetchSearches.mockResolvedValue([
      {
        id: 'seed-stikstof',
        dossierId: 'stikstof',
        query: { q: 'stikstof OR gebiedsproces', types: [], source: ['tk'] },
        tags: ['stikstof'],
        scope: 'tenant',
        notify: false,
      },
    ]);
    const user = userEvent.setup();
    render(<Issuekaart dossier={makeDossier()} />);

    await openTab(user, 'Monitoring');

    expect(await screen.findByText('Opgeslagen zoekvraag')).toBeInTheDocument();
    expect(screen.getByText('stikstof OR gebiedsproces')).toBeInTheDocument();
    expect(screen.getByText('Bevestigd signaal')).toBeInTheDocument();
    expect(screen.getByText('Kandidaat signaal')).toBeInTheDocument();
  });

  it('confirming an inbox item moves it into the curated list', async () => {
    const inbox = makeSignal({ id: 'in-1', title: 'Kandidaat signaal', status: 'candidate' });
    paApi.fetchInbox.mockResolvedValue({
      data: [inbox],
      meta: { total: 1, cap: 100, capped: false },
    });
    const confirmSignal = vi
      .fn()
      .mockResolvedValue(makeSignal({ id: 'in-1', title: 'Kandidaat signaal' }));
    mockUsePaData.mockReturnValue(
      makePaDataStub({
        watchDossier: vi.fn(),
        unwatchDossier: vi.fn(),
        confirmSignal,
        dismissSignal: vi.fn().mockResolvedValue(undefined),
      })
    );
    const user = userEvent.setup();
    render(<Issuekaart dossier={makeDossier()} />);
    await openTab(user, 'Monitoring');
    await screen.findByText('Kandidaat signaal');

    await user.click(screen.getByRole('button', { name: 'Bevestigen' }));

    await waitFor(() => expect(confirmSignal).toHaveBeenCalledWith('in-1'));
  });

  it('ignoring an inbox item hides it and persists the dismissal', async () => {
    // This surface had the same client-only bug as Monitoring: the row vanished
    // but nothing recorded it, so it came back on the next load.
    paApi.fetchInbox.mockResolvedValue({
      data: [makeSignal({ id: 'in-1', title: 'Kandidaat signaal', status: 'candidate' })],
      meta: { total: 1, cap: 100, capped: false },
    });
    const dismissSignal = vi.fn().mockResolvedValue(undefined);
    mockUsePaData.mockReturnValue(
      makePaDataStub({
        watchDossier: vi.fn(),
        unwatchDossier: vi.fn(),
        confirmSignal: vi.fn(),
        dismissSignal,
      })
    );
    const user = userEvent.setup();
    render(<Issuekaart dossier={makeDossier()} />);
    await openTab(user, 'Monitoring');
    await screen.findByText('Kandidaat signaal');

    await user.click(screen.getByRole('button', { name: 'Negeren' }));

    await waitFor(() => expect(dismissSignal).toHaveBeenCalledWith('in-1'));
    expect(screen.queryByText('Kandidaat signaal')).not.toBeInTheDocument();
  });

  it('puts an ignored item back when persisting fails', async () => {
    paApi.fetchInbox.mockResolvedValue({
      data: [makeSignal({ id: 'in-1', title: 'Kandidaat signaal', status: 'candidate' })],
      meta: { total: 1, cap: 100, capped: false },
    });
    mockUsePaData.mockReturnValue(
      makePaDataStub({
        watchDossier: vi.fn(),
        unwatchDossier: vi.fn(),
        confirmSignal: vi.fn(),
        dismissSignal: vi.fn().mockRejectedValue(new Error('offline')),
      })
    );
    const user = userEvent.setup();
    render(<Issuekaart dossier={makeDossier()} />);
    await openTab(user, 'Monitoring');
    await screen.findByText('Kandidaat signaal');

    await user.click(screen.getByRole('button', { name: 'Negeren' }));

    await waitFor(() => expect(screen.getByText('Kandidaat signaal')).toBeInTheDocument());
  });
});

describe('the other sub-tabs render their content', () => {
  const rich = () =>
    makeDossier({
      narratief: {
        onsVerhaal: 'Onze lijn in één zin.',
        frames: [{ text: 'Frame een', meta: 'bron', kind: 'frame' }],
        tegenframes: [{ text: 'Tegenframe een', meta: 'bron', kind: 'tegen' }],
      } as never,
      interventies: [{ titel: 'Werkbezoek', motiv: 'Motivatie', kompas: 'invloed' }] as never,
      mijlpalen: [{ label: 'Besluit', date: '1 sep', done: false, soon: true }] as never,
      stakeholders: [
        { naam: 'Gedeputeerde', rol: 'bestuurlijk', prio: 'hoog', laatste: 'mei', senti: 'pos' },
      ] as never,
      timeline: [{ date: '1 jun', title: 'Startbesluit', desc: 'Toelichting', docs: [] }] as never,
      next: 'Volgende stap',
      doel: 'Ons doel voor dit dossier',
    });

  it('Narratief shows the story and both frame lists', async () => {
    const user = userEvent.setup();
    render(<Issuekaart dossier={rich()} />);

    await openTab(user, 'Narratief');

    expect(screen.getByText('Dominante frames in het debat')).toBeInTheDocument();
    expect(screen.getByText('Onze tegenframes')).toBeInTheDocument();
    expect(screen.getByText('Frame een')).toBeInTheDocument();
    expect(screen.getByText('Tegenframe een')).toBeInTheDocument();
  });

  it('Actie & co-creatie shows the interventions', async () => {
    const user = userEvent.setup();
    render(<Issuekaart dossier={rich()} />);

    await openTab(user, 'Actie & co-creatie');

    expect(screen.getByText('Samenwerken')).toBeInTheDocument();
    // The plan section lists stakeholders that are not merely 'warm'.
    expect(screen.getByText('Gedeputeerde')).toBeInTheDocument();
  });

  it('OverlegBox renders', async () => {
    const user = userEvent.setup();
    render(<Issuekaart dossier={rich()} />);

    await openTab(user, 'OverlegBox');

    expect(screen.queryByText('Dominante frames in het debat')).not.toBeInTheDocument();
  });

  it('Tijdlijn shows the events', async () => {
    const user = userEvent.setup();
    render(<Issuekaart dossier={rich()} />);

    await openTab(user, 'Tijdlijn');

    expect(screen.getByText('Startbesluit')).toBeInTheDocument();
  });

  it('the overview shows the goal and the ritme lists', () => {
    render(<Issuekaart dossier={rich()} />);

    expect(screen.getByText('Ons doel voor dit dossier')).toBeInTheDocument();
    expect(screen.getByText('Lobby')).toBeInTheDocument();
    expect(screen.getByText('Communicatie')).toBeInTheDocument();
    expect(screen.getByText('Events')).toBeInTheDocument();
  });
});
