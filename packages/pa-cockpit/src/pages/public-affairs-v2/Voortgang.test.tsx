// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Voortgang from './Voortgang';
import type { Dossier } from '@ronl/shared';
import { makePaDataStub } from '../../test/paData.stub';

const mockUsePaData = vi.hoisted(() => vi.fn());
vi.mock('./PaDataProvider', () => ({ usePaData: mockUsePaData }));

function makeDossier(overrides: Partial<Dossier> = {}): Dossier {
  return {
    id: 'd1',
    naam: 'Dossier 1',
    onderwerp: '',
    status: 'actief',
    momentum: 'flat',
    waaromNu: '',
    waarover: '',
    kompas: {} as Dossier['kompas'],
    doel: 'Het doel',
    ritme: {} as Dossier['ritme'],
    mijlpalen: [],
    progressPct: 40,
    next: '',
    stakeholders: [],
    narratief: {} as Dossier['narratief'],
    interventies: [],
    timeline: [],
    kompasLog: [],
    intervLog: [],
    overleg: [],
    ...overrides,
  } as Dossier;
}

beforeEach(() => {
  mockUsePaData.mockReturnValue(makePaDataStub());
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('Voortgang — lobbydoelen view (default)', () => {
  it('shows only actief dossiers with their milestones', () => {
    const actief = makeDossier({
      id: 'a1',
      naam: 'Actief dossier',
      mijlpalen: [{ label: 'Stap 1', date: '1 jan', done: true }],
    });
    const sluimerend = makeDossier({ id: 's1', naam: 'Sluimerend dossier', status: 'sluimerend' });
    mockUsePaData.mockReturnValue({ dossiers: { data: [actief, sluimerend], status: 'ok' } });

    render(<Voortgang onOpenDossier={vi.fn()} />);

    expect(screen.getByText('Actief dossier')).toBeInTheDocument();
    expect(screen.getByText('Stap 1')).toBeInTheDocument();
    expect(screen.getByText('Afgerond')).toBeInTheDocument();
    expect(screen.queryByText('Sluimerend dossier')).not.toBeInTheDocument();
  });

  it('marks an unfinished milestone as "Open mijlpaal"', () => {
    const dossier = makeDossier({
      mijlpalen: [{ label: 'Stap 2', date: '2 feb', done: false }],
    });
    mockUsePaData.mockReturnValue({ dossiers: { data: [dossier], status: 'ok' } });

    render(<Voortgang onOpenDossier={vi.fn()} />);

    expect(screen.getByText('Open mijlpaal')).toBeInTheDocument();
  });

  it('"Open dossier" calls onOpenDossier with the dossier id', async () => {
    const onOpenDossier = vi.fn();
    mockUsePaData.mockReturnValue({
      dossiers: { data: [makeDossier({ id: 'd9', naam: 'Klikbaar' })], status: 'ok' },
    });
    const user = userEvent.setup();

    render(<Voortgang onOpenDossier={onOpenDossier} />);
    await user.click(screen.getByRole('button', { name: 'Open dossier' }));

    expect(onOpenDossier).toHaveBeenCalledWith('d9');
  });
});

describe('Voortgang — kompas-log view', () => {
  it('only shows dossiers with kompasLog entries', () => {
    const withLog = makeDossier({
      id: 'k1',
      naam: 'Met log',
      kompasLog: [{ date: '3 mrt', text: 'Score verhoogd na overleg' }],
    });
    const withoutLog = makeDossier({ id: 'k2', naam: 'Zonder log', kompasLog: [] });
    mockUsePaData.mockReturnValue({ dossiers: { data: [withLog, withoutLog], status: 'ok' } });

    render(<Voortgang view="kompas-log" onOpenDossier={vi.fn()} />);

    expect(screen.getByText('Met log')).toBeInTheDocument();
    expect(screen.getByText('Score verhoogd na overleg')).toBeInTheDocument();
    expect(screen.queryByText('Zonder log')).not.toBeInTheDocument();
  });
});

describe('Voortgang — interventie-log view', () => {
  it('only shows dossiers with intervLog entries, including who decided', () => {
    const withLog = makeDossier({
      id: 'i1',
      naam: 'Met interventie',
      intervLog: [
        {
          date: '4 apr',
          who: 'Sanne Bakker',
          what: 'Gesprek gepland',
          ai: 'adviseerde',
          mens: 'besloot',
        },
      ],
    });
    mockUsePaData.mockReturnValue({ dossiers: { data: [withLog], status: 'ok' } });

    render(<Voortgang view="interventie-log" onOpenDossier={vi.fn()} />);

    expect(screen.getByText('Sanne Bakker')).toBeInTheDocument();
    expect(screen.getByText('Gesprek gepland')).toBeInTheDocument();
  });
});
