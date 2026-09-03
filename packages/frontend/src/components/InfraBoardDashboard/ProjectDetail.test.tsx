// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProjectDetail from './ProjectDetail';
import { getMockPortfolio } from '../../pages/infra-board/infra-board.data';
import { RIP_PHASES } from '../../pages/infra-board/rip-phases.catalog';

const mockUseActivityHistory = vi.hoisted(() => vi.fn());
const mockUseInstanceDocuments = vi.hoisted(() => vi.fn());
const mockUseOpenTasks = vi.hoisted(() => vi.fn());
const mockUseRipActiveAcrossPhases = vi.hoisted(() => vi.fn());
const mockUsePhaseSwimlane = vi.hoisted(() => vi.fn());
vi.mock('../../services/infra.api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/infra.api')>();
  return {
    ...actual,
    useActivityHistory: mockUseActivityHistory,
    useInstanceDocuments: mockUseInstanceDocuments,
    useOpenTasks: mockUseOpenTasks,
    useRipActiveAcrossPhases: mockUseRipActiveAcrossPhases,
    usePhaseSwimlane: mockUsePhaseSwimlane,
  };
});

const mockTaskSpec = vi.hoisted(() => vi.fn());
const mockBusinessApi = vi.hoisted(() => ({
  task: {
    variables: vi.fn().mockResolvedValue({ success: true, data: {} }),
    claim: vi.fn(),
  },
  validsign: {
    taskSpec: mockTaskSpec,
    createPackage: vi.fn(),
    status: vi.fn(),
  },
}));
vi.mock('../../services/api', () => ({ businessApi: mockBusinessApi }));

vi.mock('../CaseworkerDashboard/TaskFormViewer', () => ({
  default: ({ onCompleted }: { onCompleted: () => void }) => (
    <div data-testid="task-form-viewer">
      task-form
      <button onClick={onCompleted}>stub-complete</button>
    </div>
  ),
}));
vi.mock('../CaseworkerDashboard/ProcessVarsSection', () => ({ default: () => null }));

beforeEach(() => {
  mockUseActivityHistory.mockReturnValue({
    data: null,
    loading: false,
    error: false,
    reload: vi.fn(),
  });
  mockUseInstanceDocuments.mockReturnValue({
    data: null,
    loading: false,
    error: false,
    reload: vi.fn(),
  });
  mockUseOpenTasks.mockReturnValue({ data: null, loading: false, error: false, reload: vi.fn() });
  mockUseRipActiveAcrossPhases.mockReturnValue({
    data: null,
    loading: false,
    error: false,
    reload: vi.fn(),
  });
  mockUsePhaseSwimlane.mockReturnValue({
    data: null,
    loading: false,
    error: false,
    reload: vi.fn(),
  });
  mockBusinessApi.task.claim.mockResolvedValue({ success: true });
  mockTaskSpec.mockResolvedValue({ success: true, data: { required: false } });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('ProjectDetail — mock project', () => {
  it('renders the mock project header info', () => {
    const project = getMockPortfolio()[0];
    render(<ProjectDetail projectRef={{ nr: project.nr }} onBack={vi.fn()} />);

    expect(screen.getByRole('heading', { name: project.naam })).toBeInTheDocument();
    expect(screen.getByText(project.budget)).toBeInTheDocument();
  });

  it('"Terug naar portfolio" calls onBack', async () => {
    const onBack = vi.fn();
    const user = userEvent.setup();
    render(<ProjectDetail projectRef={{ nr: getMockPortfolio()[0].nr }} onBack={onBack} />);

    await user.click(screen.getByRole('button', { name: /Terug naar portfolio/ }));

    expect(onBack).toHaveBeenCalled();
  });

  it('selecting a phase other than R2.1 shows the "not modelled" message', async () => {
    const user = userEvent.setup();
    render(<ProjectDetail projectRef={{ nr: getMockPortfolio()[0].nr }} onBack={vi.fn()} />);

    await user.click(
      screen.getByRole('button', { name: (name) => name.includes(RIP_PHASES[1].name) })
    );

    expect(screen.getByText(/nog niet gemodelleerd/)).toBeInTheDocument();
  });

  it('renders twelve stepper steps with real RIP codes', () => {
    const { container } = render(
      <ProjectDetail projectRef={{ nr: getMockPortfolio()[0].nr }} onBack={vi.fn()} />
    );
    // Scoped to the stepper: the current phase's code also legitimately
    // appears in the meta strip and the phase-detail panel, so an
    // unscoped getByText would find multiple matches for it.
    const stepper = container.querySelector('.pb-stepper') as HTMLElement;
    RIP_PHASES.forEach((p) => {
      expect(within(stepper).getByText(p.code, { exact: false })).toBeInTheDocument();
    });
  });

  it('selecting R2.1 shows the swimlane', async () => {
    mockUsePhaseSwimlane.mockReturnValue({
      data: {
        phaseCode: 'R2.1',
        lanes: [{ key: 'l1', label: 'Aandrager' }],
        nodes: [
          {
            id: 'Task_AanlevrenProjectplan',
            bpmnId: 'Task_AanlevrenProjectplan',
            kind: 'task',
            col: 0,
            row: 0,
            label: 'Aanleveren Projectplan',
          },
        ],
        edges: [],
      },
      loading: false,
      error: false,
      reload: vi.fn(),
    });
    const user = userEvent.setup();
    render(<ProjectDetail projectRef={{ nr: getMockPortfolio()[0].nr }} onBack={vi.fn()} />);

    await user.click(
      screen.getByRole('button', { name: (name) => name.includes(RIP_PHASES[0].name) })
    );

    expect(screen.queryByText(/nog niet gemodelleerd/)).not.toBeInTheDocument();
  });

  it('derives status across a phase not currently reached, spanning done/active/todo', () => {
    // deriveMockStatus now walks whatever nodes the derived model for the
    // SELECTED phase supplies (not the fixed 18-node R2.1 layout), so this
    // pins its column-threshold bucketing directly: a project not on R2.1
    // (getMockPortfolio()[0] sits on R5.3) reads its every-phase-but-current
    // node as 'done', except the one node exactly AT the (illustrative,
    // always-reached) threshold, which reads 'active'.
    const project = getMockPortfolio()[0];
    mockUsePhaseSwimlane.mockReturnValue({
      data: {
        phaseCode: project.ripPhaseCode,
        lanes: [{ key: 'l1', label: 'Ontwerper' }],
        nodes: [
          { id: 'n-before', bpmnId: 'n-before', kind: 'task', col: 0, row: 0, label: 'Before' },
          { id: 'n-at', bpmnId: 'n-at', kind: 'task', col: 99, row: 0, label: 'At threshold' },
          { id: 'n-after', bpmnId: 'n-after', kind: 'task', col: 150, row: 0, label: 'After' },
        ],
        edges: [],
      },
      loading: false,
      error: false,
      reload: vi.fn(),
    });

    const { container } = render(
      <ProjectDetail projectRef={{ nr: project.nr }} onBack={vi.fn()} />
    );

    const swim = container.querySelector('.pb-swim') as HTMLElement;
    expect(swim).not.toBeNull();
    expect(swim.querySelectorAll('.done').length).toBe(2);
    expect(swim.querySelectorAll('.active').length).toBe(1);
  });

  it("derives status for a project currently ON R2.1, keying by the node's own bpmnId", () => {
    // nr 22119 is the one mock portfolio row genuinely on R2.1 with an
    // 'active' illustrative flag — isOnR21/flag are otherwise unreachable
    // from this suite, since every other fixture sits on a later phase.
    const nr = '22119';
    mockUsePhaseSwimlane.mockReturnValue({
      data: {
        phaseCode: 'R2.1',
        lanes: [{ key: 'l1', label: 'Aandrager' }],
        nodes: [
          { id: 'n0', bpmnId: 'n0', kind: 'task', col: 0, row: 0, label: 'Before' },
          { id: 'n5', bpmnId: 'n5', kind: 'task', col: 5, row: 0, label: 'At threshold' },
          { id: 'n10', bpmnId: 'n10', kind: 'task', col: 10, row: 0, label: 'Not yet' },
        ],
        edges: [],
      },
      loading: false,
      error: false,
      reload: vi.fn(),
    });

    const { container } = render(<ProjectDetail projectRef={{ nr }} onBack={vi.fn()} />);

    const swim = container.querySelector('.pb-swim') as HTMLElement;
    expect(swim).not.toBeNull();
    expect(swim.querySelectorAll('.done').length).toBe(1);
    expect(swim.querySelectorAll('.active').length).toBe(1);
    expect(swim.querySelectorAll('.todo').length).toBe(1);
  });
});

describe('ProjectDetail — live instance with open tasks', () => {
  it('lists open tasks for the instance and claiming one shows the completion form', async () => {
    const user = userEvent.setup();
    mockUseOpenTasks.mockReturnValue({
      data: [
        {
          id: 'task-1',
          name: 'Aanleveren Projectplan',
          created: '2026-01-01T00:00:00Z',
          executionId: 'e1',
          processDefinitionId: 'RipR21Process:1:def',
          processDefinitionKey: 'RipR21Process',
          processInstanceId: 'pi-1',
          taskDefinitionKey: 'Task_AanlevrenProjectplan',
          suspended: false,
        },
      ],
      loading: false,
      error: false,
      reload: vi.fn(),
    });

    render(<ProjectDetail projectRef={{ nr: '99999', instanceId: 'pi-1' }} onBack={vi.fn()} />);

    expect(screen.getByText('Open taken (1)')).toBeInTheDocument();
    // The swimlane also renders a node labelled "Aanleveren Projectplan", so
    // scope the click to the task-list item specifically.
    await user.click(
      screen.getByText('Aanleveren Projectplan', { selector: '.pb-taken-item-name' })
    );

    const claimButton = await screen.findByRole('button', { name: 'Taak claimen' });
    await user.click(claimButton);

    await waitFor(() => expect(mockBusinessApi.task.claim).toHaveBeenCalledWith('task-1'));
    expect(await screen.findByText('task-form')).toBeInTheDocument();
  });

  it('keeps the completion confirmation visible after the task panel closes', async () => {
    // Completing a task unmounts the panel it was worked in. The confirmation
    // used to be set inside that panel, so it was destroyed in the same tick
    // and never painted — a user completed a task and saw nothing acknowledge
    // it. It now lives on the parent, which survives.
    const user = userEvent.setup();
    mockUseOpenTasks.mockReturnValue({
      data: [
        {
          id: 'task-1',
          name: 'Aanleveren Projectplan',
          created: '2026-01-01T00:00:00Z',
          executionId: 'e1',
          processDefinitionId: 'RipR21Process:1:def',
          processDefinitionKey: 'RipR21Process',
          processInstanceId: 'pi-1',
          taskDefinitionKey: 'Task_AanlevrenProjectplan',
          assignee: 'test-infra-flevoland',
          suspended: false,
        },
      ],
      loading: false,
      error: false,
      reload: vi.fn(),
    });

    render(<ProjectDetail projectRef={{ nr: '99999', instanceId: 'pi-1' }} onBack={vi.fn()} />);
    await user.click(
      screen.getByText('Aanleveren Projectplan', { selector: '.pb-taken-item-name' })
    );

    await user.click(await screen.findByRole('button', { name: 'stub-complete' }));

    // The panel is gone...
    await waitFor(() => expect(screen.queryByText('task-form')).not.toBeInTheDocument());
    // ...and the confirmation naming the task is not.
    expect(screen.getByText(/Taak voltooid: Aanleveren Projectplan/)).toBeInTheDocument();
  });

  it('clears a stale confirmation when another task is opened', async () => {
    const user = userEvent.setup();
    mockUseOpenTasks.mockReturnValue({
      data: [
        {
          id: 'task-1',
          name: 'Aanleveren Projectplan',
          created: '2026-01-01T00:00:00Z',
          executionId: 'e1',
          processDefinitionId: 'RipR21Process:1:def',
          processDefinitionKey: 'RipR21Process',
          processInstanceId: 'pi-1',
          taskDefinitionKey: 'Task_AanlevrenProjectplan',
          assignee: 'test-infra-flevoland',
          suspended: false,
        },
      ],
      loading: false,
      error: false,
      reload: vi.fn(),
    });

    render(<ProjectDetail projectRef={{ nr: '99999', instanceId: 'pi-1' }} onBack={vi.fn()} />);
    const item = screen.getByText('Aanleveren Projectplan', { selector: '.pb-taken-item-name' });

    await user.click(item);
    await user.click(await screen.findByRole('button', { name: 'stub-complete' }));
    expect(screen.getByText(/Taak voltooid:/)).toBeInTheDocument();

    // Reopening leaves the previous task's confirmation standing over the new
    // one's form, which would read as "this one is done" when it is not.
    await user.click(item);
    await waitFor(() => expect(screen.queryByText(/Taak voltooid:/)).not.toBeInTheDocument());
  });

  it('still renders the ordinary task form when the task needs no signature', async () => {
    // Every non-signing task in the app flows through this branch — breaking
    // it breaks the whole board, not just the signing feature.
    const user = userEvent.setup();
    mockTaskSpec.mockResolvedValue({ success: true, data: { required: false } });
    mockUseOpenTasks.mockReturnValue({
      data: [
        {
          id: 'task-1',
          name: 'Aanleveren Projectplan',
          created: '2026-01-01T00:00:00Z',
          executionId: 'e1',
          processDefinitionId: 'RipR21Process:1:def',
          processDefinitionKey: 'RipR21Process',
          processInstanceId: 'pi-1',
          taskDefinitionKey: 'Task_AanlevrenProjectplan',
          suspended: false,
        },
      ],
      loading: false,
      error: false,
      reload: vi.fn(),
    });
    const liveRef = { nr: '99999', instanceId: 'pi-1' };

    render(<ProjectDetail projectRef={liveRef} onBack={vi.fn()} />);
    await user.click(
      screen.getByText('Aanleveren Projectplan', { selector: '.pb-taken-item-name' })
    );
    await user.click(await screen.findByRole('button', { name: 'Taak claimen' }));

    await waitFor(() => expect(screen.getByTestId('task-form-viewer')).toBeTruthy());
    expect(document.querySelector('.pb-sign-frame')).toBeNull();
  });
});

describe('ProjectDetail — live instance past R2.1', () => {
  const R22_ROW = {
    id: 'pi-22',
    businessKey: 'MANUAL-20260902-222824',
    startTime: '2026-09-02T22:28:24Z',
    projectNumber: 'MANUAL-20260902-222824',
    projectName: 'ValidSign handmatige testrun',
    edocsWorkspaceId: '',
    leadRole: 'projectleider',
    phaseCode: 'R2.2',
  };
  const liveRef = { nr: 'MANUAL-20260902-222824', instanceId: 'pi-22' };

  beforeEach(() => {
    mockUseRipActiveAcrossPhases.mockReturnValue({
      data: [R22_ROW],
      loading: false,
      error: false,
      reload: vi.fn(),
    });
    // The instance's OWN history: R2.2 activity ids, which share nothing
    // with R2.1's model. Feeding these to the R2.1 swimlane is exactly the
    // mistake the fix has to avoid.
    mockUseActivityHistory.mockReturnValue({
      data: [
        {
          id: 'a1',
          activityId: 'Task_OpstellenVO',
          activityName: 'Opstellen VO',
          startTime: '2026-09-02T22:30:00Z',
          endTime: null,
          canceled: false,
        },
      ],
      loading: false,
      error: false,
      reload: vi.fn(),
    });
  });

  it('reports the instance own phase in the meta strip, not R2.1', () => {
    const { container } = render(<ProjectDetail projectRef={liveRef} onBack={vi.fn()} />);

    const strip = container.querySelector('.pb-proj-meta-strip') as HTMLElement;
    expect(within(strip).getByText('R2.2')).toBeInTheDocument();
    expect(within(strip).queryByText('R2.1')).not.toBeInTheDocument();
  });

  it('marks the passed rung done and the current one active in the ladder', () => {
    const { container } = render(<ProjectDetail projectRef={liveRef} onBack={vi.fn()} />);

    const steps = container.querySelectorAll('.pb-stepper .pb-step');
    expect(steps[0].className).toContain('done');
    expect(steps[1].className).toContain('active');
  });

  it('renders the selected phase own swimlane, not R2.1 constants', async () => {
    mockUsePhaseSwimlane.mockReturnValue({
      data: {
        phaseCode: 'R2.2',
        lanes: [{ key: 'l1', label: 'Ontwerper' }],
        nodes: [{ id: 'x', bpmnId: 'x', kind: 'task', col: 0, row: 0, label: 'Opstellen VO' }],
        edges: [],
      },
      loading: false,
      error: false,
      reload: vi.fn(),
    });

    render(<ProjectDetail projectRef={liveRef} onBack={vi.fn()} />);

    expect(screen.getByText('Opstellen VO')).toBeInTheDocument();
    expect(screen.queryByText(/nog niet gemodelleerd/)).not.toBeInTheDocument();
  });

  it('falls back to the not-modelled panel when the model cannot be fetched', () => {
    mockUsePhaseSwimlane.mockReturnValue({
      data: null,
      loading: false,
      error: true,
      reload: vi.fn(),
    });

    render(<ProjectDetail projectRef={liveRef} onBack={vi.fn()} />);

    expect(screen.getByText(/nog niet gemodelleerd/)).toBeInTheDocument();
  });

  it('shows the R2.1 swimlane when its rung is selected, driven by the current instance history', async () => {
    // pastFase1 special-casing is gone: with every phase modelled, a past
    // rung's swimlane is now driven by the SAME instance history this
    // component already has (for its CURRENT phase, R2.2) — which shares no
    // activity ids with R2.1's model, so R2.1's nodes read 'todo' here
    // rather than a fabricated 'done'. Fetching a DIFFERENT phase's own
    // instance history to back-fill a past rung is out of scope for this
    // task; this test pins the accepted (not fabricated) behaviour instead
    // of the deleted workaround's claim that R2.1 has no todo nodes.
    mockUsePhaseSwimlane.mockReturnValue({
      data: {
        phaseCode: 'R2.1',
        lanes: [{ key: 'l1', label: 'Aandrager' }],
        nodes: [
          {
            id: 'Task_AanlevrenProjectplan',
            bpmnId: 'Task_AanlevrenProjectplan',
            kind: 'task',
            col: 0,
            row: 0,
            label: 'Aanleveren Projectplan',
          },
        ],
        edges: [],
      },
      loading: false,
      error: false,
      reload: vi.fn(),
    });
    const user = userEvent.setup();
    const { container } = render(<ProjectDetail projectRef={liveRef} onBack={vi.fn()} />);

    await user.click(
      screen.getByRole('button', { name: (name) => name.includes(RIP_PHASES[0].name) })
    );

    const swim = container.querySelector('.pb-swim') as HTMLElement;
    expect(swim).not.toBeNull();
    expect(within(swim).getByText('Aanleveren Projectplan')).toBeInTheDocument();
  });

  it('falls back to R2.1 when the instance is not in the active list', () => {
    mockUseRipActiveAcrossPhases.mockReturnValue({
      data: [],
      loading: false,
      error: false,
      reload: vi.fn(),
    });
    const { container } = render(<ProjectDetail projectRef={liveRef} onBack={vi.fn()} />);

    const strip = container.querySelector('.pb-proj-meta-strip') as HTMLElement;
    expect(within(strip).getByText('R2.1')).toBeInTheDocument();
  });
});
