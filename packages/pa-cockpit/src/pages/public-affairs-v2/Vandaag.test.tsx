// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Vandaag from './Vandaag';
import type { Dossier, KompasScores, Momentum, Signal } from '@ronl/shared';
import { makePaDataStub } from '../../test/paData.stub';

const mockUsePaData = vi.hoisted(() => vi.fn());
vi.mock('./PaDataProvider', () => ({ usePaData: mockUsePaData }));

function makeKompas(overrides: Partial<Record<string, number>> = {}): KompasScores {
  const keys = [
    'opgaven',
    'momentum',
    'coalitie',
    'uitvoering',
    'reputatie',
    'synergie',
    'opbrengst',
    'risico',
  ];
  const scores = Object.fromEntries(keys.map((k) => [k, { score: overrides[k] ?? 0 }]));
  return scores as unknown as KompasScores;
}

function makeDossier(overrides: Partial<Dossier> = {}): Dossier {
  return {
    id: 'd1',
    naam: 'Dossier 1',
    onderwerp: 'Onderwerp 1',
    status: 'actief',
    momentum: 'flat' as Momentum,
    waaromNu: '',
    waarover: '',
    kompas: makeKompas(),
    doel: '',
    ritme: {} as Dossier['ritme'],
    mijlpalen: [],
    progressPct: 50,
    next: 'Volgende stap',
    stakeholders: [],
    narratief: {} as Dossier['narratief'],
    interventies: [],
    timeline: [],
    kompasLog: [],
    intervLog: [],
    overleg: [],
    ...overrides,
  };
}

/** The shared stub, so a new context member cannot be missed here. */
const defaultPaData = makePaDataStub;

describe('Vandaag', () => {
  beforeEach(() => {
    mockUsePaData.mockReturnValue(defaultPaData());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('ranks top issues by Kompas score by default', () => {
    const low = makeDossier({ id: 'low', naam: 'Low score', kompas: makeKompas({ opgaven: 1 }) });
    const high = makeDossier({
      id: 'high',
      naam: 'High score',
      kompas: makeKompas({ opgaven: 2, momentum: 2 }),
    });
    mockUsePaData.mockReturnValue(defaultPaData({ dossiers: { data: [low, high], status: 'ok' } }));

    const { container } = render(<Vandaag onOpenDossier={vi.fn()} />);

    const titles = Array.from(container.querySelectorAll('.pac-issue-title')).map(
      (el) => el.textContent
    );
    expect(titles).toEqual(['High score', 'Low score']);
  });

  it('ranks by momentum when prioritering is "momentum"', () => {
    const risingLowKompas = makeDossier({
      id: 'rising',
      naam: 'Rising',
      momentum: 'up',
      kompas: makeKompas({ opgaven: 1 }),
    });
    const stableHighKompas = makeDossier({
      id: 'stable',
      naam: 'Stable',
      momentum: 'flat',
      kompas: makeKompas({ opgaven: 2, momentum: 2, coalitie: 2 }),
    });
    mockUsePaData.mockReturnValue(
      defaultPaData({ dossiers: { data: [stableHighKompas, risingLowKompas], status: 'ok' } })
    );

    const { container } = render(<Vandaag onOpenDossier={vi.fn()} prioritering="momentum" />);

    const titles = Array.from(container.querySelectorAll('.pac-issue-title')).map(
      (el) => el.textContent
    );
    expect(titles).toEqual(['Rising', 'Stable']);
  });

  it('clicking a top-issue card calls onOpenDossier with its id', async () => {
    const onOpenDossier = vi.fn();
    // sluimerend, not actief: keeps this dossier out of the progress-glance
    // section below, so its title only appears once in the DOM.
    const dossier = makeDossier({ id: 'd1', naam: 'Clickable dossier', status: 'sluimerend' });
    mockUsePaData.mockReturnValue(defaultPaData({ dossiers: { data: [dossier], status: 'ok' } }));
    const user = userEvent.setup();

    render(<Vandaag onOpenDossier={onOpenDossier} />);
    await user.click(screen.getByText('Clickable dossier'));

    expect(onOpenDossier).toHaveBeenCalledWith('d1');
  });

  it('hides the "Signalen vandaag" section when there are no signals or inbox items', () => {
    render(<Vandaag onOpenDossier={vi.fn()} />);
    expect(screen.queryByText(/Signalen vandaag/)).not.toBeInTheDocument();
  });

  it('shows the inbox banner using the summed per-tab inboxCounts once seeded', () => {
    const signal: Signal = {
      id: 's1',
      tab: 'politiek',
      dossierId: 'd1',
      title: 'Signal 1',
      src: 'TK',
      bron: 'tk',
      rel: 9,
      impact: 'kans',
      impactLabel: 'Kans',
      duiding: null,
      status: 'confirmed',
    };
    mockUsePaData.mockReturnValue(
      defaultPaData({
        signals: { data: [signal], status: 'ok' },
        inbox: { data: [{ ...signal, id: 'in1' }], status: 'ok' },
        inboxCounts: { politiek: 3, europa: 2 },
      })
    );

    render(<Vandaag onOpenDossier={vi.fn()} />);

    expect(screen.getByText('5 nieuwe signalen', { exact: false })).toBeInTheDocument();
  });

  it('shows at most 3 interventies, only from dossiers that have them', () => {
    const withIv = makeDossier({
      id: 'd-iv',
      naam: 'Heeft interventie',
      interventies: [{ titel: 'Doe iets', motiv: 'Omdat', kompas: 'Opgaven' }],
    });
    const withoutIv = makeDossier({ id: 'd-no-iv', naam: 'Geen interventie', interventies: [] });
    mockUsePaData.mockReturnValue(
      defaultPaData({ dossiers: { data: [withIv, withoutIv], status: 'ok' } })
    );

    render(<Vandaag onOpenDossier={vi.fn()} />);

    expect(screen.getByText('Doe iets')).toBeInTheDocument();
  });

  it('only lists actief dossiers in the progress glance', () => {
    const actief = makeDossier({ id: 'a1', naam: 'Actief dossier', status: 'actief' });
    const sluimerend = makeDossier({ id: 's1', naam: 'Sluimerend dossier', status: 'sluimerend' });
    mockUsePaData.mockReturnValue(
      defaultPaData({ dossiers: { data: [actief, sluimerend], status: 'ok' } })
    );

    const { container } = render(<Vandaag onOpenDossier={vi.fn()} />);

    // Scoped to .pac-prog-name: both dossiers also appear in the Top-issues
    // section above regardless of status, so an unscoped query would find
    // "Sluimerend dossier" there and give a false negative.
    const progressNames = Array.from(container.querySelectorAll('.pac-prog-name')).map(
      (el) => el.textContent
    );
    expect(progressNames).toEqual(['Actief dossier']);
  });

  it("opening an agenda item calls onOpenDossier with that item's dossier id", async () => {
    const onOpenDossier = vi.fn();
    const user = userEvent.setup();

    render(<Vandaag onOpenDossier={onOpenDossier} />);
    const openButtons = screen.getAllByRole('button', { name: 'Open' });
    await user.click(openButtons[0]);

    expect(onOpenDossier).toHaveBeenCalledWith('lelystad');
  });
});
