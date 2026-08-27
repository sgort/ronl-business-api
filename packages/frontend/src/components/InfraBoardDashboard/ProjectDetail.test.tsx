// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProjectDetail from './ProjectDetail';
import { getMockPortfolio } from '../../pages/infra-board/infra-board.data';
import { RIP_PHASES } from '../../pages/infra-board/rip-phases.catalog';

const mockUseActivityHistory = vi.hoisted(() => vi.fn());
const mockUsePhase1Documents = vi.hoisted(() => vi.fn());
const mockUseOpenTasks = vi.hoisted(() => vi.fn());
vi.mock('../../services/infra.api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/infra.api')>();
  return {
    ...actual,
    useActivityHistory: mockUseActivityHistory,
    usePhase1Documents: mockUsePhase1Documents,
    useOpenTasks: mockUseOpenTasks,
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
  mockUsePhase1Documents.mockReturnValue({
    data: null,
    loading: false,
    error: false,
    reload: vi.fn(),
  });
  mockUseOpenTasks.mockReturnValue({ data: null, loading: false, error: false, reload: vi.fn() });
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
