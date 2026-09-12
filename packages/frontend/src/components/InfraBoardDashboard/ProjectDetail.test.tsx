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
const mockUseRipPhaseCompleted = vi.hoisted(() => vi.fn());
vi.mock('../../services/infra.api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/infra.api')>();
  return {
    ...actual,
    useActivityHistory: mockUseActivityHistory,
    useInstanceDocuments: mockUseInstanceDocuments,
    useOpenTasks: mockUseOpenTasks,
    useRipActiveAcrossPhases: mockUseRipActiveAcrossPhases,
    usePhaseSwimlane: mockUsePhaseSwimlane,
    useRipPhaseCompleted: mockUseRipPhaseCompleted,
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
  mockUseRipPhaseCompleted.mockReturnValue({
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

  it('shows a loading affordance, not the "not modelled" failure panel, while the phase model fetch is in flight', () => {
    // usePhaseSwimlane reports loading:true whenever a phase is requested
    // but its model isn't held yet -- including the very first render after
    // opening a project, and every phase-rung click, before the response
    // arrives. Only once the fetch has actually settled without a usable
    // model should the failure panel appear.
    mockUsePhaseSwimlane.mockReturnValue({
      data: null,
      loading: true,
      error: false,
      reload: vi.fn(),
    });

    render(<ProjectDetail projectRef={{ nr: getMockPortfolio()[0].nr }} onBack={vi.fn()} />);

    expect(screen.queryByText(/nog niet gemodelleerd/)).not.toBeInTheDocument();
    expect(screen.getByText('Bezig met laden…')).toBeInTheDocument();
  });

  it('derives status across a phase not currently reached, spanning done/active', () => {
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

  /** The CURRENT instance's own activity history (R2.2 ids). */
  const R22_HISTORY = [
    {
      id: 'a1',
      activityId: 'Task_OpstellenVO',
      activityName: 'Opstellen VO',
      startTime: '2026-09-02T22:30:00Z',
      endTime: null,
      canceled: false,
    },
  ];

  beforeEach(() => {
    mockUseRipActiveAcrossPhases.mockReturnValue({
      data: [R22_ROW],
      loading: false,
      error: false,
      reload: vi.fn(),
    });
    // ProjectDetail now calls useActivityHistory twice — once for the
    // CURRENT instance (R2.2) and once for whatever past-phase instance the
    // fix resolves (or null, when there is none) — both routed through this
    // one mock, so it has to answer per instanceId rather than statically.
    // Anything other than the current instance's own id (including null)
    // gets an empty history, matching the real hook's null-skip behaviour.
    mockUseActivityHistory.mockImplementation((instanceId: string | null) =>
      instanceId === R22_ROW.id
        ? { data: R22_HISTORY, loading: false, error: false, reload: vi.fn() }
        : { data: [], loading: false, error: false, reload: vi.fn() }
    );
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

  it("derives the R2.1 rung's status from R2.1's OWN completed instance when its businessKey matches this project's", async () => {
    // The fix: R2.1's swimlane, selected while the project is on R2.2, is no
    // longer read off the CURRENT (R2.2) instance's history — it never
    // contains R2.1's activity ids, which is the bug. It is read off the
    // completed R2.1 instance that shares this project's businessKey.
    const r21Completed = {
      id: 'pi-21-done',
      businessKey: R22_ROW.businessKey,
      startTime: '2026-08-20T09:00:00Z',
      endTime: '2026-08-25T09:00:00Z',
      projectNumber: R22_ROW.projectNumber,
      projectName: R22_ROW.projectName,
      edocsWorkspaceId: '',
    };
    mockUseRipPhaseCompleted.mockReturnValue({
      data: [r21Completed],
      loading: false,
      error: false,
      reload: vi.fn(),
    });
    mockUseActivityHistory.mockImplementation((instanceId: string | null) => {
      if (instanceId === R22_ROW.id)
        return { data: R22_HISTORY, loading: false, error: false, reload: vi.fn() };
      if (instanceId === r21Completed.id)
        return {
          data: [
            {
              id: 'h1',
              activityId: 'Task_AanlevrenProjectplan',
              activityName: 'Aanleveren Projectplan',
              startTime: '2026-08-20T09:05:00Z',
              endTime: '2026-08-20T10:00:00Z',
              canceled: false,
            },
          ],
          loading: false,
          error: false,
          reload: vi.fn(),
        };
      return { data: [], loading: false, error: false, reload: vi.fn() };
    });
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
    expect(within(swim).getByText('Aanleveren Projectplan').closest('.pb-swim-node')).toHaveClass(
      'done'
    );
  });

  it('shows an uncoloured R2.1 diagram, not a fabricated green one, when no completed instance shares this businessKey', async () => {
    // Guards against resurrecting `pastFase1`'s blanket-'done': a completed
    // R2.1 instance exists, but for a DIFFERENT project (different
    // businessKey), so it must not be treated as this project's own R2.1 run.
    mockUseRipPhaseCompleted.mockReturnValue({
      data: [
        {
          id: 'pi-someone-elses-r21',
          businessKey: 'SOME-OTHER-BUSINESS-KEY',
          startTime: '2026-08-20T09:00:00Z',
          endTime: '2026-08-25T09:00:00Z',
          projectNumber: '00001',
          projectName: 'Ander project',
          edocsWorkspaceId: '',
        },
      ],
      loading: false,
      error: false,
      reload: vi.fn(),
    });
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
    expect(within(swim).getByText('Aanleveren Projectplan').closest('.pb-swim-node')).toHaveClass(
      'todo'
    );
  });

  it("still derives the CURRENT phase's status from the live instance's own history (regression guard)", () => {
    // The fix must not disturb the ordinary, already-working path: the
    // CURRENT phase (R2.2, selected by default here) keeps deriving from
    // projectRef.instanceId's own history exactly as before.
    mockUsePhaseSwimlane.mockReturnValue({
      data: {
        phaseCode: 'R2.2',
        lanes: [{ key: 'l1', label: 'Ontwerper' }],
        nodes: [
          {
            id: 'Task_OpstellenVO',
            bpmnId: 'Task_OpstellenVO',
            kind: 'task',
            col: 0,
            row: 0,
            label: 'Opstellen VO',
          },
        ],
        edges: [],
      },
      loading: false,
      error: false,
      reload: vi.fn(),
    });

    const { container } = render(<ProjectDetail projectRef={liveRef} onBack={vi.fn()} />);

    const swim = container.querySelector('.pb-swim') as HTMLElement;
    expect(within(swim).getByText('Opstellen VO').closest('.pb-swim-node')).toHaveClass('active');
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
