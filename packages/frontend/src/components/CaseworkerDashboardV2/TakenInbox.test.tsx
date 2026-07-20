// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TakenInbox from './TakenInbox';
import type { Task } from '@ronl/shared';

const mockBusinessApi = vi.hoisted(() => ({
  task: {
    list: vi.fn(),
    variables: vi.fn(),
    claim: vi.fn(),
  },
  process: {
    activityHistory: vi.fn(),
  },
}));
vi.mock('../../services/api', () => ({ businessApi: mockBusinessApi }));

vi.mock('../CaseworkerDashboard/TaskFormViewer', () => ({ default: () => <div>task-form</div> }));
vi.mock('../CaseworkerDashboard/ProcessVarsSection', () => ({ default: () => null }));

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    name: 'Aanvraag beoordelen',
    created: '2026-07-01T00:00:00Z',
    processInstanceId: 'pi-1',
    processDefinitionId: 'Proc:1:def',
    processDefinitionKey: 'Proc',
    taskDefinitionKey: 'Task_1',
    suspended: false,
    ...overrides,
  } as Task;
}

beforeEach(() => {
  mockBusinessApi.task.list.mockResolvedValue({ success: true, data: [] });
  mockBusinessApi.task.variables.mockResolvedValue({ success: true, data: {} });
  mockBusinessApi.task.claim.mockResolvedValue({ success: true });
  mockBusinessApi.process.activityHistory.mockResolvedValue({ success: true, data: [] });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('TakenInbox', () => {
  it('loads tasks on mount and reports the count via onCountChange', async () => {
    const onCountChange = vi.fn();
    mockBusinessApi.task.list.mockResolvedValue({ success: true, data: [makeTask()] });

    render(<TakenInbox user={null} onCountChange={onCountChange} />);

    await screen.findByText('Aanvraag beoordelen');
    expect(onCountChange).toHaveBeenCalledWith(1);
  });

  it('shows an error state when loading tasks fails', async () => {
    mockBusinessApi.task.list.mockResolvedValue({ success: false });

    render(<TakenInbox user={null} />);

    expect(await screen.findByText('Taken konden niet worden geladen.')).toBeInTheDocument();
  });

  it('the "Mijn claim" filter only shows tasks assigned to the current user', async () => {
    const user = userEvent.setup();
    mockBusinessApi.task.list.mockResolvedValue({
      success: true,
      data: [
        makeTask({ id: 't1', name: 'Mijn taak', assignee: 'user-1' }),
        makeTask({ id: 't2', name: 'Andermans taak', assignee: 'user-2' }),
      ],
    });

    render(<TakenInbox user={{ sub: 'user-1' } as never} />);
    await screen.findByText('Mijn taak');

    await user.click(screen.getByRole('button', { name: /Mijn claim/ }));

    expect(screen.getByText('Mijn taak')).toBeInTheDocument();
    expect(screen.queryByText('Andermans taak')).not.toBeInTheDocument();
  });

  it('selecting a task loads its variables and activity history', async () => {
    const user = userEvent.setup();
    mockBusinessApi.task.list.mockResolvedValue({ success: true, data: [makeTask()] });

    render(<TakenInbox user={null} />);
    await user.click(await screen.findByText('Aanvraag beoordelen'));

    await waitFor(() => expect(mockBusinessApi.task.variables).toHaveBeenCalledWith('t1'));
    expect(mockBusinessApi.process.activityHistory).toHaveBeenCalledWith('pi-1');
  });

  it('claiming an unassigned task shows a success message and enables the form', async () => {
    const user = userEvent.setup();
    mockBusinessApi.task.list.mockResolvedValue({ success: true, data: [makeTask()] });

    render(<TakenInbox user={{ sub: 'user-1' } as never} />);
    await user.click(await screen.findByText('Aanvraag beoordelen'));

    const claimButton = await screen.findByRole('button', { name: 'Taak claimen' });
    await user.click(claimButton);

    expect(await screen.findByText('Taak geclaimd.')).toBeInTheDocument();
    expect(mockBusinessApi.task.claim).toHaveBeenCalledWith('t1');
  });

  it('an already-claimed task shows the task form instead of the claim button', async () => {
    const user = userEvent.setup();
    mockBusinessApi.task.list.mockResolvedValue({
      success: true,
      data: [makeTask({ assignee: 'user-1' })],
    });

    render(<TakenInbox user={{ sub: 'user-1' } as never} />);
    await user.click(await screen.findByText('Aanvraag beoordelen'));

    expect(await screen.findByText('task-form')).toBeInTheDocument();
  });
});
