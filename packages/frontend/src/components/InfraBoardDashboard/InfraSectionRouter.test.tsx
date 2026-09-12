// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import InfraSectionRouter from './InfraSectionRouter';
import { getMockUpdates } from '../../pages/infra-board/infra-board.data';
import { INFRA_PROCESS_KEYS } from '../../services/infra.api';

vi.mock('./MijnDag', () => ({ default: () => <div>mijn-dag</div> }));
vi.mock('./Portfolio', () => ({ default: () => <div>portfolio</div> }));

const mockProjectDetail = vi.hoisted(() => vi.fn());
vi.mock('./ProjectDetail', () => ({
  default: (props: never) => {
    mockProjectDetail(props);
    return <div>project-detail</div>;
  },
}));

vi.mock('./FaseladderOverview', () => ({ default: () => <div>faseladder</div> }));

const mockPhaseDetail = vi.hoisted(() => vi.fn());
vi.mock('./PhaseDetail', () => ({
  default: (props: never) => {
    mockPhaseDetail(props);
    return <div>phase-detail</div>;
  },
}));

const mockArchiefSection = vi.hoisted(() => vi.fn());
vi.mock('../CaseworkerDashboard/ArchiefSection', () => ({
  default: (props: never) => {
    mockArchiefSection(props);
    return <div>archief</div>;
  },
}));

vi.mock('../CaseworkerDashboard/ProfielSection', () => ({ default: () => <div>profiel</div> }));
vi.mock('../CaseworkerDashboard/RollenSection', () => ({ default: () => <div>rollen</div> }));
vi.mock('../CaseworkerDashboard/IouGebruiksscenarioSection', () => ({
  default: () => <div>iou-gebruiksscenario</div>,
}));
vi.mock('../CaseworkerDashboard/IouFeedbackSection', () => ({
  default: () => <div>iou-feedback</div>,
}));

const mockIouZakenSection = vi.hoisted(() => vi.fn());
vi.mock('../CaseworkerDashboard/IouZakenSection', () => ({
  default: (props: never) => {
    mockIouZakenSection(props);
    return <div>iou-zaken</div>;
  },
}));

vi.mock('../CaseworkerDashboard/GereedschapSection', () => ({
  default: () => <div>gereedschap</div>,
}));

const baseProps = {
  mode: 'mijn-dag' as const,
  section: '',
  openProject: null,
  user: null,
  tenantConfig: null,
  onOpenProject: vi.fn(),
  onBack: vi.fn(),
  onGotoPortfolio: vi.fn(),
  onOpenPhase: vi.fn(),
  onBackToFaseladder: vi.fn(),
};

describe('InfraSectionRouter', () => {
  it('an open project always wins, regardless of mode', () => {
    render(<InfraSectionRouter {...baseProps} mode="portfolio" openProject={{ nr: '123' }} />);
    expect(screen.getByText('project-detail')).toBeInTheDocument();
    expect(mockProjectDetail).toHaveBeenCalledWith(
      expect.objectContaining({ projectRef: { nr: '123' } })
    );
  });

  it('mijn-dag mode with the project-updates section shows the real mock updates', () => {
    render(<InfraSectionRouter {...baseProps} mode="mijn-dag" section="project-updates" />);

    const updates = getMockUpdates();
    expect(screen.getByText('Project-updates')).toBeInTheDocument();
    expect(screen.getByText(new RegExp(updates[0].tekst))).toBeInTheDocument();
  });

  it('mijn-dag mode with any other section shows MijnDag', () => {
    render(<InfraSectionRouter {...baseProps} mode="mijn-dag" section="anders" />);
    expect(screen.getByText('mijn-dag')).toBeInTheDocument();
  });

  it('portfolio mode shows Portfolio', () => {
    render(<InfraSectionRouter {...baseProps} mode="portfolio" />);
    expect(screen.getByText('portfolio')).toBeInTheDocument();
  });

  it.each([
    ['profiel', 'profiel'],
    ['rollen', 'rollen'],
    ['faseladder', 'faseladder'],
    ['iou-gebruiksscenario', 'iou-gebruiksscenario'],
    ['iou-feedback', 'iou-feedback'],
    ['gereedschap-overzicht', 'gereedschap'],
  ])('beheer section "%s" routes to its component', (section, text) => {
    render(<InfraSectionRouter {...baseProps} mode="beheer" section={section} />);
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('a fase-* section renders PhaseDetail with the matching phase code', () => {
    render(<InfraSectionRouter {...baseProps} mode="beheer" section="fase-r2-1" />);
    expect(screen.getByText('phase-detail')).toBeInTheDocument();
    expect(mockPhaseDetail).toHaveBeenCalledWith(expect.objectContaining({ phaseCode: 'R2.1' }));
  });

  it('an unrecognised beheer section falls back to ProfielSection', () => {
    render(<InfraSectionRouter {...baseProps} mode="beheer" section="unknown" />);
    expect(screen.getByText('profiel')).toBeInTheDocument();
  });

  it('archief passes the infra-board board id and allowed process keys', () => {
    render(<InfraSectionRouter {...baseProps} mode="beheer" section="archief" />);
    expect(mockArchiefSection).toHaveBeenCalledWith(
      expect.objectContaining({ boardId: 'infra-board', allowProcessKeys: INFRA_PROCESS_KEYS })
    );
  });

  it('iou-actieve-zaken and iou-archief pass the right state to IouZakenSection', () => {
    const { rerender } = render(
      <InfraSectionRouter {...baseProps} mode="beheer" section="iou-actieve-zaken" />
    );
    expect(mockIouZakenSection).toHaveBeenLastCalledWith(
      expect.objectContaining({ state: 'opened' })
    );

    rerender(<InfraSectionRouter {...baseProps} mode="beheer" section="iou-archief" />);
    expect(mockIouZakenSection).toHaveBeenLastCalledWith(
      expect.objectContaining({ state: 'closed' })
    );
  });
});
