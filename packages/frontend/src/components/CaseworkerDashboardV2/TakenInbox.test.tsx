// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
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

vi.mock('../CaseworkerDashboard/TaskFormViewer', () => ({
  default: ({ onCompleted }: { onCompleted: () => void }) => (
    <div>
      task-form
      <button onClick={onCompleted}>complete-task</button>
    </div>
  ),
}));
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

  it('completing a task shows the success message before the detail pane clears', async () => {
    const user = userEvent.setup();
    mockBusinessApi.task.list.mockResolvedValueOnce({
      success: true,
      data: [makeTask({ assignee: 'user-1' })],
    });

    // A real completed task drops out of the refetched list. Use a
    // manually-controlled promise (not mockResolvedValueOnce) so the test
    // can observe the state in between — an eagerly-resolved mock settles
    // within the same act() flush as the click, which would hide a
    // regression where setSelectedId(null) clears the message before it
    // ever paints, the same way a real (slower) network round-trip would
    // NOT hide it.
    let resolveRefetch!: (value: { success: true; data: Task[] }) => void;
    mockBusinessApi.task.list.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRefetch = resolve;
        })
    );

    render(<TakenInbox user={{ sub: 'user-1' } as never} />);
    await user.click(await screen.findByText('Aanvraag beoordelen'));
    await screen.findByText('task-form');

    await user.click(screen.getByRole('button', { name: 'complete-task' }));

    // Regression check: setSelectedId(null) used to run in the same batched
    // render as setActionMessage, so this text never actually painted.
    expect(await screen.findByText('Taak voltooid.')).toBeInTheDocument();

    resolveRefetch({ success: true, data: [] });
    await waitFor(() =>
      expect(screen.getByText('Selecteer een taak om de details te bekijken.')).toBeInTheDocument()
    );
  });
});

describe('TakenInbox deadline filters', () => {
  const iso = (ms: number) => new Date(Date.now() + ms).toISOString();
  const DAY = 24 * 60 * 60 * 1000;

  // Noon today rather than "a minute from now": the latter lands on tomorrow
  // when the suite happens to run just before midnight, which made the
  // "Vandaag" case fail on the clock rather than on the code.
  const noonToday = () => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    return d.toISOString();
  };

  const dated = () => [
    makeTask({ id: 'laat', name: 'Al te laat', due: iso(-2 * DAY) }),
    makeTask({ id: 'vandaag', name: 'Vandaag af', due: noonToday() }),
    makeTask({ id: 'week', name: 'Deze week af', due: iso(3 * DAY) }),
    makeTask({ id: 'later', name: 'Volgende maand', due: iso(30 * DAY) }),
    makeTask({ id: 'geen', name: 'Zonder deadline' }),
  ];

  // The filter labels also appear on the task rows ("Te laat — <datum>"), so
  // scope the lookup to the filter rail rather than the whole document.
  const openFilter = async (label: string) => {
    const user = userEvent.setup();
    mockBusinessApi.task.list.mockResolvedValue({ success: true, data: dated() });
    render(<TakenInbox user={{ sub: 'u1' } as never} onCountChange={vi.fn()} />);
    await screen.findByText('Al te laat');
    const rail = screen.getByLabelText('Taakfilters');
    await user.click(within(rail).getByRole('button', { name: new RegExp(label) }));
    return user;
  };

  it('"Te laat" holds only tasks whose deadline has passed', async () => {
    await openFilter('Te laat');
    expect(screen.getByText('Al te laat')).toBeInTheDocument();
    expect(screen.queryByText('Deze week af')).not.toBeInTheDocument();
    expect(screen.queryByText('Volgende maand')).not.toBeInTheDocument();
    expect(screen.queryByText('Zonder deadline')).not.toBeInTheDocument();
  });

  it('"Vandaag" holds only tasks due on the current calendar day', async () => {
    await openFilter('Vandaag');
    expect(screen.getByText('Vandaag af')).toBeInTheDocument();
    expect(screen.queryByText('Deze week af')).not.toBeInTheDocument();
    expect(screen.queryByText('Zonder deadline')).not.toBeInTheDocument();
  });

  it('"Deze week" spans the next seven days and excludes what is already late', async () => {
    await openFilter('Deze week');
    expect(screen.getByText('Deze week af')).toBeInTheDocument();
    // Whether noon-today is still ahead depends on the time of day, so it is
    // deliberately not asserted here; what the window must exclude is fixed.
    expect(screen.queryByText('Al te laat')).not.toBeInTheDocument();
    expect(screen.queryByText('Volgende maand')).not.toBeInTheDocument();
  });

  it('sorts by deadline, soonest first, with undated tasks last', async () => {
    mockBusinessApi.task.list.mockResolvedValue({ success: true, data: dated() });
    render(<TakenInbox user={{ sub: 'u1' } as never} onCountChange={vi.fn()} />);
    await screen.findByText('Al te laat');

    const names = Array.from(document.querySelectorAll('.v2-taken-item-name')).map(
      (el) => el.textContent
    );
    expect(names).toEqual([
      'Al te laat',
      'Vandaag af',
      'Deze week af',
      'Volgende maand',
      'Zonder deadline',
    ]);
  });

  it('breaks a deadline tie by newest first', async () => {
    // Two tasks can share a deadline (a batch created by one process); the
    // list still has to be deterministic rather than following fetch order.
    const due = iso(2 * DAY);
    mockBusinessApi.task.list.mockResolvedValue({
      success: true,
      data: [
        makeTask({ id: 'oud', name: 'Ouder', due, created: '2026-07-01T00:00:00Z' }),
        makeTask({ id: 'nieuw', name: 'Nieuwer', due, created: '2026-07-05T00:00:00Z' }),
      ],
    });
    render(<TakenInbox user={{ sub: 'u1' } as never} onCountChange={vi.fn()} />);
    await screen.findByText('Nieuwer');

    const names = Array.from(document.querySelectorAll('.v2-taken-item-name')).map(
      (el) => el.textContent
    );
    expect(names).toEqual(['Nieuwer', 'Ouder']);
  });

  it('says the filter is empty rather than showing a blank column', async () => {
    mockBusinessApi.task.list.mockResolvedValue({
      success: true,
      data: [makeTask({ id: 'geen', name: 'Zonder deadline' })],
    });
    const user = userEvent.setup();
    render(<TakenInbox user={{ sub: 'u1' } as never} onCountChange={vi.fn()} />);
    await screen.findByText('Zonder deadline');

    await user.click(
      within(screen.getByLabelText('Taakfilters')).getByRole('button', { name: /Te laat/ })
    );
    expect(screen.getByText('Geen taken in dit filter.')).toBeInTheDocument();
  });
});

describe('TakenInbox task rows and detail pane', () => {
  const iso = (ms: number) => new Date(Date.now() + ms).toISOString();
  const DAY = 24 * 60 * 60 * 1000;

  it('marks a claimed task and an open one differently, and flags a passed deadline', async () => {
    mockBusinessApi.task.list.mockResolvedValue({
      success: true,
      data: [
        makeTask({ id: 'a', name: 'Geclaimde taak', assignee: 'u1', due: iso(-DAY) }),
        makeTask({ id: 'b', name: 'Open taak', due: iso(DAY) }),
      ],
    });

    render(<TakenInbox user={{ sub: 'u1' } as never} onCountChange={vi.fn()} />);

    expect(await screen.findByText('Geclaimd')).toBeInTheDocument();
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.getByText(/^Te laat —/)).toBeInTheDocument();
    expect(screen.getByText(/^Deadline /)).toBeInTheDocument();
  });

  it('falls back to the process definition id when the task carries no key', async () => {
    mockBusinessApi.task.list.mockResolvedValue({
      success: true,
      data: [makeTask({ id: 'a', processDefinitionKey: undefined })],
    });

    render(<TakenInbox user={{ sub: 'u1' } as never} onCountChange={vi.fn()} />);

    expect(await screen.findByText('Proc:1:def')).toBeInTheDocument();
  });

  it('shows the description and the deadline in the detail pane', async () => {
    const user = userEvent.setup();
    mockBusinessApi.task.list.mockResolvedValue({
      success: true,
      data: [
        makeTask({
          id: 'a',
          name: 'Met omschrijving',
          description: 'Beoordeel de aanvraag binnen de termijn.',
          due: iso(-DAY),
        }),
      ],
    });

    render(<TakenInbox user={{ sub: 'u1' } as never} onCountChange={vi.fn()} />);
    await user.click(await screen.findByText('Met omschrijving'));

    expect(screen.getByText('Beoordeel de aanvraag binnen de termijn.')).toBeInTheDocument();
    expect(screen.getByText('Deadline')).toBeInTheDocument();
    expect(document.querySelector('.v2-taken-overdue')).not.toBeNull();
  });

  it('reports a failed claim rather than pretending it worked', async () => {
    const user = userEvent.setup();
    mockBusinessApi.task.list.mockResolvedValue({
      success: true,
      data: [makeTask({ id: 'a', name: 'Te claimen' })],
    });
    mockBusinessApi.task.claim.mockResolvedValue({ success: false });

    render(<TakenInbox user={{ sub: 'u1' } as never} onCountChange={vi.fn()} />);
    await user.click(await screen.findByText('Te claimen'));
    await user.click(await screen.findByRole('button', { name: 'Taak claimen' }));

    expect(await screen.findByText('Claimen mislukt.')).toBeInTheDocument();
  });

  it('reports a claim that never reached the backend the same way', async () => {
    const user = userEvent.setup();
    mockBusinessApi.task.list.mockResolvedValue({
      success: true,
      data: [makeTask({ id: 'a', name: 'Te claimen' })],
    });
    mockBusinessApi.task.claim.mockRejectedValue(new Error('network'));

    render(<TakenInbox user={{ sub: 'u1' } as never} onCountChange={vi.fn()} />);
    await user.click(await screen.findByText('Te claimen'));
    await user.click(await screen.findByRole('button', { name: 'Taak claimen' }));

    expect(await screen.findByText('Claimen mislukt.')).toBeInTheDocument();
  });

  it('marks each process step as running, cancelled or done', async () => {
    const user = userEvent.setup();
    mockBusinessApi.task.list.mockResolvedValue({
      success: true,
      data: [makeTask({ id: 'a', name: 'Met stappen' })],
    });
    mockBusinessApi.process.activityHistory.mockResolvedValue({
      success: true,
      data: [
        {
          id: 'act1',
          activityId: 'Start',
          activityName: 'Start',
          activityType: 'startEvent',
          startTime: '2026-07-01T09:00:00Z',
          endTime: '2026-07-01T09:00:01Z',
          canceled: false,
        },
        {
          id: 'act2',
          activityId: 'Service',
          activityName: null,
          activityType: 'serviceTask',
          startTime: '2026-07-01T09:00:02Z',
          endTime: null,
          canceled: false,
        },
        {
          id: 'act3',
          activityId: 'Afgebroken',
          activityName: 'Afgebroken stap',
          activityType: 'userTask',
          startTime: '2026-07-01T09:00:03Z',
          endTime: '2026-07-01T09:00:04Z',
          canceled: true,
        },
      ],
    });

    render(<TakenInbox user={{ sub: 'u1' } as never} onCountChange={vi.fn()} />);
    await user.click(await screen.findByText('Met stappen'));

    expect(await screen.findByText('Afgerond')).toBeInTheDocument();
    expect(screen.getByText('Loopt nog')).toBeInTheDocument();
    expect(screen.getByText('Afgebroken')).toBeInTheDocument();
    // A step with no display name falls back to its activity id.
    expect(screen.getByText('Service')).toBeInTheDocument();
  });
});
