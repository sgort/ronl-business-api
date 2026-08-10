// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Portfolio from './Portfolio';
import { getMockPortfolio, MIJN_PROJECT_NRS } from '../../pages/infra-board/infra-board.data';
import { RIP_PHASES, RIP_STAGES } from '../../pages/infra-board/rip-phases.catalog';

const mockUseActivePhase1 = vi.hoisted(() => vi.fn());
vi.mock('../../services/infra.api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/infra.api')>();
  return { ...actual, useActivePhase1: mockUseActivePhase1 };
});

beforeEach(() => {
  mockUseActivePhase1.mockReturnValue({
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

  it('clicking a project row calls onOpenProject with its project number', async () => {
    const onOpenProject = vi.fn();
    const user = userEvent.setup();
    render(<Portfolio onOpenProject={onOpenProject} />);

    const first = getMockPortfolio()[0];
    await user.click(screen.getByText(first.naam));

    expect(onOpenProject).toHaveBeenCalledWith({ nr: first.nr, instanceId: first.instanceId });
  });

  it('mentions the live RIP Fase 1 instance count when there are live instances', () => {
    mockUseActivePhase1.mockReturnValue({
      data: [
        {
          id: 'i1',
          startTime: '2026-01-01T00:00:00Z',
          projectNumber: '99999',
          projectName: 'Live project',
          edocsWorkspaceId: 'w1',
          leadRole: 'projectleider',
        },
      ],
      loading: false,
      error: false,
      reload: vi.fn(),
    });

    render(<Portfolio onOpenProject={vi.fn()} />);

    expect(screen.getByText(/actieve RIP Fase 1 instanties/)).toBeInTheDocument();
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

  it('shows Kanban cards with status wachtend as "Wacht op start van {code}" instead of their milestone', async () => {
    const user = userEvent.setup();
    render(<Portfolio onOpenProject={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Per fase' }));

    const wachtendProject = getMockPortfolio().find((p) => p.ripPhaseState === 'wachtend');
    expect(wachtendProject).toBeDefined();
    expect(
      screen.getAllByText(`Wacht op start van ${wachtendProject!.ripPhaseCode}`, { exact: false })
        .length
    ).toBeGreaterThan(0);
  });

  it('shows a wachtend swatch in the legend', () => {
    render(<Portfolio onOpenProject={vi.fn()} />);
    expect(screen.getByText('Wachtend')).toBeInTheDocument();
  });
});
