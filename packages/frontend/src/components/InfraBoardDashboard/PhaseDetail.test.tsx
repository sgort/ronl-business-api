// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PhaseDetail from './PhaseDetail';
import { ripPhaseByCode } from '../../pages/infra-board/rip-phases.catalog';
import {
  getReadyProjects,
  getOutOfSequenceProjects,
  getMockPortfolio,
} from '../../pages/infra-board/infra-board.data';

const mockUseDeployedProcessKeys = vi.hoisted(() => vi.fn());
const mockUseLivePhaseCounts = vi.hoisted(() => vi.fn());
vi.mock('../../services/infra.api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/infra.api')>();
  return {
    ...actual,
    useDeployedProcessKeys: mockUseDeployedProcessKeys,
    useLivePhaseCounts: mockUseLivePhaseCounts,
  };
});

// getPhaseDeployStatus is overridden per-test so the Starten tab's
// enabled/disabled behavior can be exercised for a phase other than
// R2.1 — no other phase has a real processDefinitionKey today, so this
// is the only way to test the "deployed, non-first phase" path at all.
const mockGetPhaseDeployStatus = vi.hoisted(() => vi.fn());
vi.mock('../../pages/infra-board/rip-phases.catalog', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../pages/infra-board/rip-phases.catalog')>();
  return { ...actual, getPhaseDeployStatus: mockGetPhaseDeployStatus };
});

const mockStart = vi.hoisted(() => vi.fn());
const mockPhase1Active = vi.hoisted(() => vi.fn());
const mockActivityHistory = vi.hoisted(() => vi.fn());
vi.mock('../../services/api', () => ({
  businessApi: {
    process: { start: mockStart, activityHistory: mockActivityHistory },
    rip: { phase1Active: mockPhase1Active },
  },
}));

beforeEach(() => {
  mockUseDeployedProcessKeys.mockReturnValue({
    data: { deployedKeys: ['RipPhase1Process'] },
    loading: false,
    error: false,
    reload: vi.fn(),
  });
  mockUseLivePhaseCounts.mockReturnValue({
    data: { counts: {} },
    loading: false,
    error: false,
    reload: vi.fn(),
  });
  mockGetPhaseDeployStatus.mockImplementation((phase: { code: string }) =>
    phase.code === 'R2.1' ? 'gedeployed' : 'ontwerp'
  );
  mockStart.mockResolvedValue({ success: true, data: { processInstanceId: 'pi-1' } });
  mockPhase1Active.mockResolvedValue({ success: true, data: [] });
  mockActivityHistory.mockResolvedValue({ success: true, data: [] });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('PhaseDetail — header and side panel', () => {
  it('renders the header meta strip and side panel figures from the catalogue', () => {
    const { container } = render(<PhaseDetail phaseCode="R2.3" onBack={vi.fn()} />);
    const phase = ripPhaseByCode('R2.3')!;
    // Scoped to the meta strip: phase.exit and phase.lead are also echoed
    // in the side panel's "what happens when you start" narrative, so an
    // unscoped getByText would match twice and throw.
    const metaStrip = within(container.querySelector('.pb-meta-strip')!);
    expect(metaStrip.getByText(phase.entry, { exact: false })).toBeInTheDocument();
    expect(metaStrip.getByText(phase.exit, { exact: false })).toBeInTheDocument();
    expect(metaStrip.getByText(phase.lead, { exact: false })).toBeInTheDocument();
    expect(metaStrip.getByText(String(phase.roles.length), { exact: false })).toBeInTheDocument();
    expect(screen.getByText(`${phase.weeks} weken`, { exact: false })).toBeInTheDocument();
    // phase.gates.length renders as a bare digit ("2"), which as an
    // exact:false substring collides with digits elsewhere on the page
    // (e.g. the "R2.3" phase chip) — read the dd next to its dt instead.
    expect(screen.getByText('Review-loops').nextElementSibling?.textContent).toBe(
      String(phase.gates.length)
    );
    expect(screen.getByText('Ja — Infra-overleg', { exact: false })).toBeInTheDocument();
    expect(screen.getByText(phase.bron, { exact: false })).toBeInTheDocument();
  });

  it('shows "Nee" for kredietbesluit when the phase has none', () => {
    render(<PhaseDetail phaseCode="R2.1" onBack={vi.fn()} />);
    expect(screen.getByText('Nee', { exact: false })).toBeInTheDocument();
  });
});

describe('PhaseDetail — R5.2 (beyond)', () => {
  it('renders a placeholder instead of the tab shell', () => {
    render(<PhaseDetail phaseCode="R5.2" onBack={vi.fn()} />);
    expect(screen.queryByText('Starten')).not.toBeInTheDocument();
    expect(screen.queryByText('WIP')).not.toBeInTheDocument();
    expect(screen.getByText('Niet gemodelleerd', { exact: false })).toBeInTheDocument();
  });
});

describe('PhaseDetail — Starten tab, R2.1 fallback', () => {
  it('shows the single-button fallback when the ready-list is empty and there is no predecessor', () => {
    render(<PhaseDetail phaseCode="R2.1" onBack={vi.fn()} />);
    expect(getReadyProjects('R2.1')).toEqual([]);
    expect(screen.getByRole('button', { name: 'R2.1 starten' })).toBeInTheDocument();
  });

  it('starts RipPhase1Process on click and shows success', async () => {
    const user = userEvent.setup();
    render(<PhaseDetail phaseCode="R2.1" onBack={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'R2.1 starten' }));

    expect(mockStart).toHaveBeenCalledWith('RipPhase1Process', {});
    expect(await screen.findByText('R2.1 gestart', { exact: false })).toBeInTheDocument();
  });

  it('guards against double-submit', async () => {
    const user = userEvent.setup();
    render(<PhaseDetail phaseCode="R2.1" onBack={vi.fn()} />);

    const button = screen.getByRole('button', { name: 'R2.1 starten' });
    await user.dblClick(button);

    expect(mockStart).toHaveBeenCalledTimes(1);
  });

  it('shows the error detail on failure', async () => {
    mockStart.mockResolvedValue({
      success: false,
      error: { details: 'Proces niet gevonden', instance: 'http://localhost:8081' },
    });
    const user = userEvent.setup();
    render(<PhaseDetail phaseCode="R2.1" onBack={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'R2.1 starten' }));

    expect(await screen.findByText('Proces niet gevonden')).toBeInTheDocument();
  });
});

describe('PhaseDetail — Starten tab, undeployed phase', () => {
  it('shows the not-deployed banner with the ready-count and disables checkboxes', () => {
    render(<PhaseDetail phaseCode="R2.3" onBack={vi.fn()} />);
    const readyCount = getReadyProjects('R2.3').length;
    expect(
      screen.getByText(`Er staan wel ${readyCount} projecten klaar voor deze fase.`, {
        exact: false,
      })
    ).toBeInTheDocument();
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes.length).toBeGreaterThan(0);
    checkboxes.forEach((cb) => expect(cb).toBeDisabled());
  });
});

describe('PhaseDetail — Starten tab, deployed phase with ready projects', () => {
  beforeEach(() => {
    mockGetPhaseDeployStatus.mockReturnValue('gedeployed');
  });

  it('enables checkboxes and the start button once a ready project is selected', async () => {
    const user = userEvent.setup();
    render(<PhaseDetail phaseCode="R2.3" onBack={vi.fn()} />);

    // R2.2 is used elsewhere in this file, but its predecessor phase
    // (R2.1, the first rung) can never carry a 'wachtend' project in the
    // mock data model — getMockPortfolio() only marks a project
    // 'wachtend' past ladder position 1 — so getReadyProjects('R2.2') is
    // always empty. R2.3 is the first phase with a real ready list.
    const ready = getReadyProjects('R2.3');
    expect(ready.length).toBeGreaterThan(0);

    const startButton = screen.getByRole('button', { name: 'R2.3 starten' });
    expect(startButton).toBeDisabled();

    const firstCheckbox = screen.getAllByRole('checkbox')[0];
    expect(firstCheckbox).not.toBeDisabled();
    await user.click(firstCheckbox);

    expect(startButton).not.toBeDisabled();
  });

  it('reveals out-of-sequence projects and requires an afwijkingsreden before their checkbox enables', async () => {
    const user = userEvent.setup();
    render(<PhaseDetail phaseCode="R2.3" onBack={vi.fn()} />);

    const outOfSequence = getOutOfSequenceProjects('R2.3');
    expect(outOfSequence.length).toBeGreaterThan(0);

    await user.click(screen.getByText(`Toon ${outOfSequence.length} projecten`, { exact: false }));

    // Scope both queries to the same row (by the first out-of-sequence
    // project's own <li>) — with more than one out-of-sequence project,
    // picking the reason input and checkbox independently could pair up
    // two different projects' elements.
    const reasonInput = screen.getAllByLabelText('Afwijkingsreden')[0];
    const row = reasonInput.closest('li')!;
    const outOfSequenceCheckbox = within(row).getByRole('checkbox');
    expect(outOfSequenceCheckbox).toBeDisabled();

    await user.type(reasonInput, 'ab');
    expect(outOfSequenceCheckbox).toBeDisabled();

    await user.type(reasonInput, 'cd');
    expect(outOfSequenceCheckbox).not.toBeDisabled();
  });
});

describe('PhaseDetail — WIP tab', () => {
  it('renders a real R2.1 row with a LIVE badge, using the live activity history', async () => {
    mockPhase1Active.mockResolvedValue({
      success: true,
      data: [
        {
          id: 'live-1',
          startTime: '2026-08-10T10:54:47.658+0200',
          projectNumber: '99999',
          projectName: 'Live testproject',
          edocsWorkspaceId: 'w1',
        },
      ],
    });
    mockActivityHistory.mockResolvedValue({
      success: true,
      data: [
        {
          id: 'a1',
          activityId: 'Task_OrganiserenIntakeoverleg',
          activityName: 'Organiseren intake-overleg',
          activityType: 'userTask',
          assignee: null,
          startTime: '2026-08-10T10:55:38.009+0200',
          endTime: null,
          durationInMillis: null,
          canceled: false,
        },
      ],
    });
    const user = userEvent.setup();
    render(<PhaseDetail phaseCode="R2.1" onBack={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /WIP/ }));

    expect(await screen.findByText('Live testproject', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Organiseren intake-overleg', { exact: false })).toBeInTheDocument();
    expect(screen.getAllByText('LIVE', { exact: false }).length).toBeGreaterThan(0);
  });

  it('renders mock rows for a phase with wip projects, unbadged', async () => {
    mockGetPhaseDeployStatus.mockReturnValue('gedeployed');
    const user = userEvent.setup();
    render(<PhaseDetail phaseCode="R2.3" onBack={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /WIP/ }));

    const wipProject = getMockPortfolio().find(
      (p) => p.ripPhaseCode === 'R2.3' && p.ripPhaseState === 'wip'
    );
    expect(wipProject).toBeDefined();
    expect(screen.getByText(wipProject!.naam, { exact: false })).toBeInTheDocument();
    expect(screen.queryByText('LIVE')).not.toBeInTheDocument();
  });
});
