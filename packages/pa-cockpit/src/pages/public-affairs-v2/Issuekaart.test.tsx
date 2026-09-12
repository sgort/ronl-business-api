// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Issuekaart from './Issuekaart';
import type { Dossier } from './pa.data';
import { makePaDataStub } from '../../test/paData.stub';
import { expectMockNamesRealExports } from '../../test/mockModule';

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
// Built on the real module so a member nobody stubbed is not silently missing.
vi.mock('../../services/pa.api', async (importActual) => ({
  ...(await importActual<typeof import('../../services/pa.api')>()),
  ...paApi,
}));

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

describe('the pa.api mock', () => {
  it('only names exports the real module has', async () => {
    await expectMockNamesRealExports(vi.importActual('../../services/pa.api'), paApi);
  });
});

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

describe('Issuekaart display variants', () => {
  it('names an empty ritme column instead of leaving it blank', () => {
    render(<Issuekaart dossier={makeDossier()} />);
    // Every column is empty in the base fixture; an empty <ul> would read as a
    // rendering fault rather than "nothing planned".
    expect(screen.getAllByText('Geen geplande acties').length).toBeGreaterThan(0);
  });

  it('labels every stakeholder priority and sentiment', () => {
    render(
      <Issuekaart
        dossier={makeDossier({
          stakeholders: [
            { naam: 'A', rol: 'Rol A', prio: 'nu', laatste: '2 dgn', senti: 'pos' },
            { naam: 'B', rol: 'Rol B', prio: 'kort', laatste: '1 wk', senti: 'neg' },
            { naam: 'C', rol: 'Rol C', prio: 'warm', laatste: '3 wk', senti: 'neu' },
          ],
        } as Partial<Dossier>)}
      />
    );

    expect(screen.getByText('Nu spreken')).toBeInTheDocument();
    expect(screen.getByText('Korte termijn')).toBeInTheDocument();
    expect(screen.getByText('Warm houden')).toBeInTheDocument();
    expect(screen.getByText('Positief')).toBeInTheDocument();
    expect(screen.getByText('Kritisch')).toBeInTheDocument();
    expect(screen.getByText('Neutraal')).toBeInTheDocument();
  });

  it('marks a planned timeline event and lists its documents', async () => {
    const user = userEvent.setup();
    render(
      <Issuekaart
        dossier={makeDossier({
          timeline: [
            { date: '1 jul 2026', title: 'Gebeurd', desc: 'Beschrijving', docs: [], future: false },
            {
              date: '1 sep 2026',
              title: 'Gepland',
              desc: 'Beschrijving',
              docs: ['Notitie.pdf'],
              future: true,
            },
          ],
        } as Partial<Dossier>)}
      />
    );
    await openTab(user, 'Tijdlijn');

    expect(screen.getByText(/gepland/)).toBeInTheDocument();
    expect(screen.getByText('Notitie.pdf')).toBeInTheDocument();
  });
});

describe('Issuekaart signal rendering', () => {
  it('distinguishes an AI concept from a rule candidate in the inbox', async () => {
    paApi.fetchInbox.mockResolvedValue({
      data: [
        makeSignal({
          id: 'i1',
          status: 'ai_drafted',
          bron: 'tk',
          duiding: 'AI-duiding hier',
          impact: 'kans',
          impactLabel: 'Kans',
          ref: { type: 'Motie', nr: '2026Z001', url: 'https://tk.nl/x' },
        }),
        makeSignal({ id: 'i2', status: 'candidate', bron: 'ob', duiding: null, impact: null }),
      ],
      meta: { total: 2, cap: 100, capped: false },
    });
    const user = userEvent.setup();
    render(<Issuekaart dossier={makeDossier()} />);
    await openTab(user, 'Monitoring');

    expect(await screen.findByText('✦ AI-concept')).toBeInTheDocument();
    expect(screen.getByText('Regel-kandidaat')).toBeInTheDocument();
    expect(screen.getAllByText('Tweede Kamer').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Off. Bekendmakingen').length).toBeGreaterThan(0);
    expect(screen.getByText('AI-duiding hier')).toBeInTheDocument();
    // A rule candidate carries no AI reading, and the panel says so rather than
    // leaving an empty block that looks like a loading state.
    expect(screen.getByText(/Handmatige duiding nodig/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /2026Z001/ })).toHaveAttribute(
      'href',
      'https://tk.nl/x'
    );
    expect(screen.getAllByText('Kans').length).toBeGreaterThan(0);
  });

  it('leaves the source chip blank for an inbox signal from a source it has no label for', async () => {
    paApi.fetchInbox.mockResolvedValue({
      data: [makeSignal({ id: 'i3', status: 'candidate', bron: 'eu' })],
      meta: { total: 1, cap: 100, capped: false },
    });
    const user = userEvent.setup();
    const { container } = render(<Issuekaart dossier={makeDossier()} />);
    await openTab(user, 'Monitoring');

    await screen.findByText('Regel-kandidaat');
    expect(container.querySelector('.pac-bron-eu')).toHaveTextContent('');
  });

  it('shows the confirming curator and the reference on a curated signal', async () => {
    paApi.fetchSignals.mockResolvedValue([
      makeSignal({
        id: 'c1',
        bron: 'ob',
        duiding: 'Handmatige duiding',
        confirmedBy: 'Sanne Bakker',
        confirmedAt: '2 jul 2026',
        ref: { type: 'Besluit', nr: 'stcrt-1', url: 'https://ob.nl/y' },
      }),
    ]);
    const user = userEvent.setup();
    render(<Issuekaart dossier={makeDossier()} />);
    await openTab(user, 'Monitoring');

    expect(await screen.findByText(/Bevestigd door Sanne Bakker/)).toBeInTheDocument();
    expect(screen.getByText('Handmatige duiding')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /stcrt-1/ })).toHaveAttribute(
      'href',
      'https://ob.nl/y'
    );
  });
});

describe('Issuekaart overlegbox', () => {
  it('shows the placeholder until the first message is posted', async () => {
    const user = userEvent.setup();
    render(<Issuekaart dossier={makeDossier({ overleg: [] } as Partial<Dossier>)} />);
    await openTab(user, 'OverlegBox');

    const box = screen.getByPlaceholderText(/Schrijf een bericht/);
    await user.type(box, 'Eerste bericht{Enter}');

    expect(screen.getByText('Eerste bericht')).toBeInTheDocument();
  });

  it('ignores an empty or whitespace-only message', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <Issuekaart dossier={makeDossier({ overleg: [] } as Partial<Dossier>)} />
    );
    await openTab(user, 'OverlegBox');

    const box = screen.getByPlaceholderText(/Schrijf een bericht/);
    await user.type(box, '   {Enter}');
    await user.click(screen.getByRole('button', { name: 'Plaats' }));

    expect(container.querySelectorAll('.pac-msg')).toHaveLength(0);
  });

  it('posts via the button as well as the Enter key', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <Issuekaart dossier={makeDossier({ overleg: [] } as Partial<Dossier>)} />
    );
    await openTab(user, 'OverlegBox');

    await user.type(screen.getByPlaceholderText(/Schrijf een bericht/), 'Via de knop');
    await user.click(screen.getByRole('button', { name: 'Plaats' }));

    expect(container.querySelectorAll('.pac-msg')).toHaveLength(1);
    expect(screen.getByText('Via de knop')).toBeInTheDocument();
  });
});

describe('Issuekaart watch toggle', () => {
  it('ignores a second click while the first is still in flight', async () => {
    // The bell is a single control over a network round trip; a double click
    // would otherwise fire watch and unwatch and settle on the wrong state.
    let release!: () => void;
    const watchDossier = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        })
    );
    mockUsePaData.mockReturnValue(
      makePaDataStub({
        watchDossier,
        unwatchDossier: vi.fn().mockResolvedValue(undefined),
      })
    );
    const user = userEvent.setup();
    render(<Issuekaart dossier={makeDossier()} />);

    const bell = await screen.findByRole('button', { name: 'Volgen' });
    await user.click(bell);
    await user.click(bell).catch(() => undefined);

    expect(watchDossier).toHaveBeenCalledTimes(1);
    release();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Volgend' })).toBeEnabled());
  });
});
