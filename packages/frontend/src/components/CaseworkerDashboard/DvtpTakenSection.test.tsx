// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DvtpTakenSection from './DvtpTakenSection';
import type { Task } from '@ronl/shared';

const mockBusinessApi = vi.hoisted(() => ({
  task: { list: vi.fn(), variables: vi.fn(), claim: vi.fn() },
}));
vi.mock('../../services/api', () => ({ businessApi: mockBusinessApi }));

vi.mock('./TaskFormViewer', () => ({ default: () => <div>task-form</div> }));

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    name: 'Toestemming beoordelen',
    created: '2026-07-01T00:00:00Z',
    processInstanceId: 'pi-1',
    processDefinitionId: 'DvtpToestemmingGevenProcess:1:def',
    processDefinitionKey: 'DvtpToestemmingGevenProcess',
    taskDefinitionKey: 'Task_1',
    suspended: false,
    ...overrides,
  } as Task;
}

beforeEach(() => {
  mockBusinessApi.task.list.mockResolvedValue({ success: true, data: [] });
  mockBusinessApi.task.variables.mockResolvedValue({ success: true, data: {} });
  mockBusinessApi.task.claim.mockResolvedValue({ success: true });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('DvtpTakenSection', () => {
  it('loads and shows only tasks for the DvTP process definition', async () => {
    mockBusinessApi.task.list.mockResolvedValue({
      success: true,
      data: [
        makeTask({ id: 't1', name: 'DvTP taak' }),
        makeTask({ id: 't2', name: 'Andere taak', processDefinitionKey: 'OtherProcess' }),
      ],
    });
    render(<DvtpTakenSection user={{ sub: 'u1', roles: [] } as never} />);

    expect(await screen.findByText('DvTP taak')).toBeInTheDocument();
    expect(screen.queryByText('Andere taak')).not.toBeInTheDocument();
  });

  it('shows an error state when the task list fails to load', async () => {
    mockBusinessApi.task.list.mockResolvedValue({ success: false });
    render(<DvtpTakenSection user={null} />);
    expect(await screen.findByText('Taken konden niet worden geladen.')).toBeInTheDocument();
  });

  it('shows an empty state with no DvTP tasks', async () => {
    render(<DvtpTakenSection user={null} />);
    expect(await screen.findByText('Geen openstaande taken.')).toBeInTheDocument();
  });

  it('selecting an unclaimed task auto-claims it, then shows the task form', async () => {
    mockBusinessApi.task.list.mockResolvedValue({ success: true, data: [makeTask()] });
    const user = userEvent.setup();
    render(<DvtpTakenSection user={{ sub: 'u1', roles: [] } as never} />);

    await user.click(await screen.findByText('Toestemming beoordelen'));

    await waitFor(() => expect(mockBusinessApi.task.claim).toHaveBeenCalledWith('t1'));
    expect(await screen.findByText('task-form')).toBeInTheDocument();
  });

  it('selecting an already-claimed task shows the form immediately without claiming', async () => {
    mockBusinessApi.task.list.mockResolvedValue({
      success: true,
      data: [makeTask({ assignee: 'u1' })],
    });
    const user = userEvent.setup();
    render(<DvtpTakenSection user={{ sub: 'u1', roles: [] } as never} />);

    await user.click(await screen.findByText('Toestemming beoordelen'));

    expect(await screen.findByText('task-form')).toBeInTheDocument();
    expect(mockBusinessApi.task.claim).not.toHaveBeenCalled();
  });

  it('shows an error message when claiming fails', async () => {
    mockBusinessApi.task.list.mockResolvedValue({ success: true, data: [makeTask()] });
    mockBusinessApi.task.claim.mockResolvedValue({ success: false });
    const user = userEvent.setup();
    render(<DvtpTakenSection user={{ sub: 'u1', roles: [] } as never} />);

    await user.click(await screen.findByText('Toestemming beoordelen'));

    expect(await screen.findByText('Taak kon niet worden geclaimd.')).toBeInTheDocument();
  });

  it('"Vernieuwen" reloads the task list', async () => {
    const user = userEvent.setup();
    render(<DvtpTakenSection user={null} />);
    await screen.findByText('Geen openstaande taken.');

    mockBusinessApi.task.list.mockClear();
    await user.click(screen.getByRole('button', { name: /Vernieuwen/ }));

    expect(mockBusinessApi.task.list).toHaveBeenCalledTimes(1);
  });
});
