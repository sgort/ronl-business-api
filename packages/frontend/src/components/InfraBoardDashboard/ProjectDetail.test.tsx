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
vi.mock('../../services/infra.api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/infra.api')>();
  return {
    ...actual,
    useActivityHistory: mockUseActivityHistory,
    useInstanceDocuments: mockUseInstanceDocuments,
    useOpenTasks: mockUseOpenTasks,
    useRipActiveAcrossPhases: mockUseRipActiveAcrossPhases,
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
    const user = userEvent.setup();
    render(<ProjectDetail projectRef={{ nr: getMockPortfolio()[0].nr }} onBack={vi.fn()} />);

    await user.click(
      screen.getByRole('button', { name: (name) => name.includes(RIP_PHASES[0].name) })
    );

    expect(screen.queryByText(/nog niet gemodelleerd/)).not.toBeInTheDocument();
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

  it('opens on the current phase rather than the R2.1 swimlane', () => {
    render(<ProjectDetail projectRef={liveRef} onBack={vi.fn()} />);

    expect(screen.getByText(/nog niet gemodelleerd/)).toBeInTheDocument();
  });

  it('shows R2.1 as completed when its rung is selected, not as never-started', async () => {
    const user = userEvent.setup();
    const { container } = render(<ProjectDetail projectRef={liveRef} onBack={vi.fn()} />);

    await user.click(
      screen.getByRole('button', { name: (name) => name.includes(RIP_PHASES[0].name) })
    );

    // Reaching R2.2 is itself proof R2.1 ran to completion. Deriving the
    // swimlane from THIS instance's (R2.2) history would paint every node
    // 'todo' and claim the phase never started.
    const swim = container.querySelector('.pb-swim') as HTMLElement;
    expect(swim).not.toBeNull();
    expect(swim.querySelectorAll('.todo').length).toBe(0);
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
