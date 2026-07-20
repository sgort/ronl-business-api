// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProjectDetail from './ProjectDetail';
import { getMockPortfolio } from '../../pages/infra-board/infra-board.data';
import { PHASES } from '../../pages/infra-board/rip-model';

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

const mockBusinessApi = vi.hoisted(() => ({
  task: {
    variables: vi.fn().mockResolvedValue({ success: true, data: {} }),
    claim: vi.fn(),
  },
}));
vi.mock('../../services/api', () => ({ businessApi: mockBusinessApi }));

vi.mock('../CaseworkerDashboard/TaskFormViewer', () => ({ default: () => <div>task-form</div> }));
vi.mock('../CaseworkerDashboard/ProcessVarsSection', () => ({ default: () => null }));

const phaseLabels = PHASES.map((p) => p.name);

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
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('ProjectDetail — mock project', () => {
  it('renders the mock project header info', () => {
    const project = getMockPortfolio()[0];
    render(
      <ProjectDetail projectRef={{ nr: project.nr }} phaseLabels={phaseLabels} onBack={vi.fn()} />
    );

    expect(screen.getByRole('heading', { name: project.naam })).toBeInTheDocument();
    expect(screen.getByText(project.budget)).toBeInTheDocument();
  });

  it('"Terug naar portfolio" calls onBack', async () => {
    const onBack = vi.fn();
    const user = userEvent.setup();
    render(
      <ProjectDetail
        projectRef={{ nr: getMockPortfolio()[0].nr }}
        phaseLabels={phaseLabels}
        onBack={onBack}
      />
    );

    await user.click(screen.getByRole('button', { name: /Terug naar portfolio/ }));

    expect(onBack).toHaveBeenCalled();
  });

  it('selecting a phase other than 1 shows the "not modelled" message', async () => {
    const user = userEvent.setup();
    render(
      <ProjectDetail
        projectRef={{ nr: getMockPortfolio()[0].nr }}
        phaseLabels={phaseLabels}
        onBack={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: (name) => name.includes(phaseLabels[1]) }));

    expect(screen.getByText(/nog niet gemodelleerd/)).toBeInTheDocument();
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
          processDefinitionId: 'RipPhase1Process:1:def',
          processDefinitionKey: 'RipPhase1Process',
          processInstanceId: 'pi-1',
          taskDefinitionKey: 'Task_AanlevrenProjectplan',
          suspended: false,
        },
      ],
      loading: false,
      error: false,
      reload: vi.fn(),
    });

    render(
      <ProjectDetail
        projectRef={{ nr: '99999', instanceId: 'pi-1' }}
        phaseLabels={phaseLabels}
        onBack={vi.fn()}
      />
    );

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
});
