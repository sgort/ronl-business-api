// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Portfolio from './Portfolio';
import { getMockPortfolio, MIJN_PROJECT_NRS } from '../../pages/infra-board/infra-board.data';
import { RIP_PHASES, RIP_STAGES } from '../../pages/infra-board/rip-phases.catalog';

const mockUseRipActiveAcrossPhases = vi.hoisted(() => vi.fn());
const mockUseRipCompletedAcrossPhases = vi.hoisted(() => vi.fn());
vi.mock('../../services/infra.api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/infra.api')>();
  return {
    ...actual,
    useRipActiveAcrossPhases: mockUseRipActiveAcrossPhases,
    useRipCompletedAcrossPhases: mockUseRipCompletedAcrossPhases,
  };
});

beforeEach(() => {
  mockUseRipActiveAcrossPhases.mockReturnValue({
    data: null,
    loading: false,
    error: false,
    reload: vi.fn(),
  });
  mockUseRipCompletedAcrossPhases.mockReturnValue({
    data: null,
    loading: false,
    error: false,
    reload: vi.fn(),
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('Portfolio', () => {
  it('shows the total project count and defaults to the Tijdlijn (Gantt) view', () => {
    const { container } = render(<Portfolio onOpenProject={vi.fn()} />);
    const total = getMockPortfolio().length;
    expect(screen.getByText(`${total} projecten`, { exact: false })).toBeInTheDocument();
    expect(container.querySelector('.pb-gantt')).not.toBeNull();
    expect(container.querySelector('.pb-kanban')).toBeNull();
  });

  it('switches to the Kanban view', async () => {
    const user = userEvent.setup();
    const { container } = render(<Portfolio onOpenProject={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Per fase' }));

    expect(container.querySelector('.pb-kanban')).not.toBeNull();
    expect(container.querySelector('.pb-gantt')).toBeNull();
  });

  it('"Mijn" scope filters to only MIJN_PROJECT_NRS', async () => {
    const user = userEvent.setup();
    render(<Portfolio onOpenProject={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: `Mijn · ${MIJN_PROJECT_NRS.length}` }));

    const shown = getMockPortfolio().filter((p) => MIJN_PROJECT_NRS.includes(p.nr));
    expect(screen.getByText(shown[0].naam)).toBeInTheDocument();
    const notShown = getMockPortfolio().find((p) => !MIJN_PROJECT_NRS.includes(p.nr));
    expect(screen.queryByText(notShown!.naam)).not.toBeInTheDocument();
  });

  it('"Risico" scope keeps only red-health projects or those whose current phase needs attention', async () => {
    const user = userEvent.setup();
    render(<Portfolio onOpenProject={vi.fn()} />);

    const atRisk = (p: ReturnType<typeof getMockPortfolio>[number]) =>
      p.health === 'rood' ||
      ['risk', 'overdue', 'action'].includes(
        p.segments[RIP_PHASES.findIndex((rp) => rp.code === p.ripPhaseCode)].status
      );
    const risky = getMockPortfolio().filter(atRisk);
    const safe = getMockPortfolio().find((p) => !atRisk(p));
    expect(risky.length).toBeGreaterThan(0);
    expect(safe).toBeDefined();

    const risicoButton = screen.getByRole('button', { name: `Risico · ${risky.length}` });
    await user.click(risicoButton);

    expect(risicoButton).toHaveClass('active');
    expect(screen.getByText(risky[0].naam)).toBeInTheDocument();
    expect(screen.queryByText(safe!.naam)).not.toBeInTheDocument();
  });

  it('clicking a project row calls onOpenProject with its project number', async () => {
    const onOpenProject = vi.fn();
    const user = userEvent.setup();
    render(<Portfolio onOpenProject={onOpenProject} />);

    const first = getMockPortfolio()[0];
    await user.click(screen.getByText(first.naam));

    expect(onOpenProject).toHaveBeenCalledWith({ nr: first.nr, instanceId: first.instanceId });
  });

  it('mentions the live RIP instance count when there are live instances', () => {
    mockUseRipActiveAcrossPhases.mockReturnValue({
      data: [
        {
          id: 'i1',
          startTime: '2026-01-01T00:00:00Z',
          projectNumber: '99999',
          projectName: 'Live project',
          edocsWorkspaceId: 'w1',
          leadRole: 'projectleider',
          phaseCode: 'R2.1',
        },
      ],
      loading: false,
      error: false,
      reload: vi.fn(),
    });

    render(<Portfolio onOpenProject={vi.fn()} />);

    expect(screen.getByText(/actieve RIP-instanties/)).toBeInTheDocument();
    expect(screen.getByText('Live project')).toBeInTheDocument();
  });

  it("a Gantt bar for a project's current phase carries the real RIP code as its label", () => {
    const { container } = render(<Portfolio onOpenProject={vi.fn()} />);
    const first = getMockPortfolio()[0];
    const currentBar = container.querySelector('.pb-gantt-bar.current');
    expect(currentBar).not.toBeNull();
    expect(currentBar!.textContent).toContain(first.ripPhaseCode);
  });

  it('Kanban renders twelve columns grouped under five stage headers', async () => {
    const user = userEvent.setup();
    const { container } = render(<Portfolio onOpenProject={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Per fase' }));

    const columns = container.querySelectorAll('.pb-kan-col');
    expect(columns.length).toBe(RIP_PHASES.length);
    RIP_STAGES.forEach((s) => {
      expect(screen.getByText(`${s.code} · ${s.name}`)).toBeInTheDocument();
    });
  });

  it('shows a wachtend Kanban card as waiting for the NEXT phase, not the one it finished', async () => {
    const user = userEvent.setup();
    render(<Portfolio onOpenProject={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Per fase' }));

    const wachtendProject = getMockPortfolio().find((p) => p.ripPhaseState === 'wachtend');
    expect(wachtendProject).toBeDefined();
    const idx = RIP_PHASES.findIndex((p) => p.code === wachtendProject!.ripPhaseCode);
    const card = screen.getByText(wachtendProject!.naam).closest('.pb-kan-card')!;
    expect(card.querySelector('.ms')!.textContent).toBe(
      `Wacht op start van ${RIP_PHASES[idx + 1].code}`
    );
  });

  it('shows a live project that finished a phase and has not started the next one', async () => {
    mockUseRipCompletedAcrossPhases.mockReturnValue({
      data: [
        {
          id: 'c1',
          businessKey: 'k-wait',
          startTime: '2026-09-01T10:00:00Z',
          endTime: '2026-10-08T10:00:00Z',
          projectNumber: 'MANUAL-1',
          projectName: 'Wacht op R2.2',
          edocsWorkspaceId: 'w1',
          leadRole: '',
          phaseCode: 'R2.1',
        },
      ],
      loading: false,
      error: false,
      reload: vi.fn(),
    });
    const onOpenProject = vi.fn();
    const user = userEvent.setup();
    const { container } = render(<Portfolio onOpenProject={onOpenProject} />);

    const row = screen.getByText('Wacht op R2.2').closest('.pb-gantt-row')!;
    expect(row.querySelector('.pb-live-badge')).not.toBeNull();
    expect(row.querySelector('.pb-gantt-bar.current')!.classList).toContain('wachtend');
    expect(
      screen.getByText(`${getMockPortfolio().length + 1} projecten`, { exact: false })
    ).toBeInTheDocument();

    await user.click(screen.getByText('Wacht op R2.2'));
    expect(onOpenProject).toHaveBeenCalledWith({ nr: 'MANUAL-1', instanceId: 'c1' });

    await user.click(screen.getByRole('button', { name: 'Per fase' }));
    const card = screen.getByText('Wacht op R2.2').closest('.pb-kan-card')!;
    expect(card.querySelector('.ms')!.textContent).toBe('Wacht op start van R2.2');
    expect(container.querySelector('.pb-kanban')).not.toBeNull();
  });

  it('marks a live instance on its Kanban card and shows "—" in phases without projects', async () => {
    mockUseRipActiveAcrossPhases.mockReturnValue({
      data: [
        {
          id: 'i1',
          startTime: '2026-01-01T00:00:00Z',
          projectNumber: '99999',
          projectName: 'Live project',
          edocsWorkspaceId: 'w1',
          leadRole: 'projectleider',
          phaseCode: 'R2.1',
        },
      ],
      loading: false,
      error: false,
      reload: vi.fn(),
    });
    const user = userEvent.setup();
    const { container } = render(<Portfolio onOpenProject={vi.fn()} />);

    // Narrow to the live project's role so most phase columns end up empty.
    await user.selectOptions(screen.getByRole('combobox'), 'projectleider');
    await user.click(screen.getByRole('button', { name: 'Per fase' }));

    const liveCard = screen.getByText('Live project').closest('.pb-kan-card')!;
    expect(liveCard.querySelector('.pb-live-badge')).not.toBeNull();
    expect(container.querySelectorAll('.pb-kan-empty').length).toBeGreaterThan(0);
  });

  it('shows a wachtend swatch in the legend', () => {
    render(<Portfolio onOpenProject={vi.fn()} />);
    expect(screen.getByText('Wachtend')).toBeInTheDocument();
  });
});
