// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TakenInbox from './TakenInbox';
import type { KeycloakUser, Task } from '@ronl/shared';
import { PaletteActionsProvider } from './PaletteActions';
import { usePaletteActions } from './paletteActionsContext';
import { A, REVIEW, S, SHELL, SUB } from '../../test/kapvergunningFixtures';

const mockBusinessApi = vi.hoisted(() => ({
  task: {
    list: vi.fn(),
    variables: vi.fn(),
    claim: vi.fn(),
  },
  process: {
    activityHistory: vi.fn(),
    lineage: vi.fn(),
    swimlane: vi.fn(),
  },
  validsign: {
    taskSpec: vi.fn(),
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
vi.mock('../signing/SigningPanel', () => ({
  default: ({ taskId, onDeclined }: { taskId: string; onDeclined?: () => void }) => (
    <div>
      signing-panel:{taskId}
      <button onClick={onDeclined}>decline-signature</button>
    </div>
  ),
}));
vi.mock('../CaseworkerDashboard/ProcessVarsSection', () => ({
  default: () => <div>process-vars</div>,
}));

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
  // By default no process context: the inbox falls back to the flat step list.
  mockBusinessApi.process.lineage.mockResolvedValue({ success: false });
  mockBusinessApi.process.swimlane.mockResolvedValue({ success: false });
  // By default no signature required: the claimed task shows its form.
  mockBusinessApi.validsign.taskSpec.mockResolvedValue({
    success: true,
    data: { required: false },
  });
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

  it('shows the signing panel instead of the form for a claimed task that must be signed', async () => {
    const user = userEvent.setup();
    mockBusinessApi.task.list.mockResolvedValue({
      success: true,
      data: [makeTask({ assignee: 'user-1' })],
    });
    mockBusinessApi.validsign.taskSpec.mockResolvedValue({
      success: true,
      data: { required: true, status: 'none', templateId: 'besluit-gb-besluit' },
    });

    render(<TakenInbox user={{ sub: 'user-1' } as never} />);
    await user.click(await screen.findByText('Aanvraag beoordelen'));

    expect(await screen.findByText('signing-panel:t1')).toBeInTheDocument();
    expect(screen.queryByText('task-form')).toBeNull();
    expect(mockBusinessApi.validsign.taskSpec).toHaveBeenCalledWith('t1');
  });

  it('shows neither form nor panel while the signing spec is still loading', async () => {
    const user = userEvent.setup();
    mockBusinessApi.task.list.mockResolvedValue({
      success: true,
      data: [makeTask({ assignee: 'user-1' })],
    });
    mockBusinessApi.validsign.taskSpec.mockReturnValue(new Promise(() => {}));

    render(<TakenInbox user={{ sub: 'user-1' } as never} />);
    await user.click(await screen.findByText('Aanvraag beoordelen'));

    expect(await screen.findByText('Ondertekening controleren…')).toBeInTheDocument();
    expect(screen.queryByText('task-form')).toBeNull();
    expect(screen.queryByText(/signing-panel:/)).toBeNull();
  });

  it('refreshes the list and says so when the signer declines', async () => {
    const user = userEvent.setup();
    mockBusinessApi.task.list.mockResolvedValue({
      success: true,
      data: [makeTask({ assignee: 'user-1' })],
    });
    mockBusinessApi.validsign.taskSpec.mockResolvedValue({
      success: true,
      data: { required: true, status: 'none' },
    });

    render(<TakenInbox user={{ sub: 'user-1' } as never} />);
    await user.click(await screen.findByText('Aanvraag beoordelen'));
    const listCalls = mockBusinessApi.task.list.mock.calls.length;
    await user.click(await screen.findByRole('button', { name: 'decline-signature' }));

    expect(
      await screen.findByText('Niet ondertekend — de taak gaat terug naar de indiener.')
    ).toBeInTheDocument();
    expect(mockBusinessApi.task.list.mock.calls.length).toBeGreaterThan(listCalls);
  });

  it('falls back to the form when the signing spec cannot be fetched', async () => {
    const user = userEvent.setup();
    mockBusinessApi.task.list.mockResolvedValue({
      success: true,
      data: [makeTask({ assignee: 'user-1' })],
    });
    mockBusinessApi.validsign.taskSpec.mockRejectedValue(new Error('500'));

    render(<TakenInbox user={{ sub: 'user-1' } as never} />);
    await user.click(await screen.findByText('Aanvraag beoordelen'));

    expect(await screen.findByText('task-form')).toBeInTheDocument();
    expect(screen.queryByText(/signing-panel:/)).toBeNull();
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

describe('TakenInbox procesweergave', () => {
  // The review task of screenshot 03: in the kapvergunning subprocess.
  const reviewTask = makeTask({
    id: 'rt',
    name: 'Beoordeling behandelaar',
    processInstanceId: 'child',
    processDefinitionKey: S,
    taskDefinitionKey: 'Sub_CaseReview',
    assignee: 'user-1',
  });
  const plainTask = makeTask({ id: 'pt', name: 'Gewone taak', processDefinitionKey: 'Plain' });
  const caseworker = { sub: 'user-1', roles: ['caseworker'] } as unknown as KeycloakUser;

  const lineageOf = (id: string) =>
    id === 'child'
      ? {
          processInstanceId: 'child',
          processDefinitionKey: S,
          processDefinitionId: `${S}:1:x`,
          superProcessInstanceId: 'p',
        }
      : id === 'p'
        ? {
            processInstanceId: 'p',
            processDefinitionKey: A,
            processDefinitionId: `${A}:1:x`,
            superProcessInstanceId: null,
          }
        : {
            // Any other instance: the plain task's process, which has no lanes.
            processInstanceId: id,
            processDefinitionKey: 'Plain',
            processDefinitionId: 'Plain:1:x',
            superProcessInstanceId: null,
          };

  const laned = () => {
    mockBusinessApi.task.list.mockResolvedValue({ success: true, data: [reviewTask, plainTask] });
    mockBusinessApi.task.variables.mockResolvedValue({
      success: true,
      data: { awbDeadlineDate: '2026-09-10T00:00:00Z', dossierReference: 'AWB-2026-164544' },
    });
    mockBusinessApi.process.lineage.mockImplementation((id: string) =>
      Promise.resolve({ success: true, data: lineageOf(id) })
    );
    mockBusinessApi.process.activityHistory.mockImplementation((id: string) =>
      Promise.resolve({
        success: true,
        data:
          id === 'child' || id === 'p'
            ? REVIEW.history.filter((e) => e.processDefinitionKey === (id === 'child' ? S : A))
            : [],
      })
    );
    mockBusinessApi.process.swimlane.mockImplementation((key: string) =>
      Promise.resolve(
        key === A
          ? { success: true, data: SHELL }
          : key === S
            ? { success: true, data: SUB }
            : { success: false }
      )
    );
  };

  it('shows Waar sta ik, the steps per role and the Awb-fase hint for a laned process', async () => {
    const user = userEvent.setup();
    laned();
    const { container } = render(<TakenInbox user={caseworker} />);
    expect(await screen.findByText('Awb-fase 4+5')).toBeInTheDocument();
    await user.click(screen.getByText('Beoordeling behandelaar'));
    expect(
      await screen.findByText('Waar sta ik · Awb-fase 4+5 · stap 4 van 8')
    ).toBeInTheDocument();
    expect(container.querySelector('.cwp-lanesteps')).not.toBeNull();
    expect(container.querySelector('.v2-taken-steps')).toBeNull();
    expect(container.querySelector('.cwp-where-cap')!.textContent).toContain(
      'beslistermijn tot 10 sep'
    );
  });

  it('keeps the flat step list, and offers no process view, for a process without lanes', async () => {
    const user = userEvent.setup();
    mockBusinessApi.task.list.mockResolvedValue({ success: true, data: [plainTask] });
    mockBusinessApi.process.activityHistory.mockResolvedValue({
      success: true,
      data: [
        {
          id: 'a',
          activityId: 'X',
          activityName: 'Stap',
          activityType: 'userTask',
          assignee: null,
          startTime: '2026-07-01T00:00:00Z',
          endTime: null,
          durationInMillis: null,
          canceled: false,
          processDefinitionKey: 'Plain',
          processDefinitionId: 'Plain:1:x',
          calledProcessInstanceId: null,
        },
      ],
    });
    mockBusinessApi.process.lineage.mockResolvedValue({
      success: true,
      data: {
        processInstanceId: 'pi-1',
        processDefinitionKey: 'Plain',
        processDefinitionId: 'Plain:1:x',
        superProcessInstanceId: null,
      },
    });
    mockBusinessApi.process.swimlane.mockResolvedValue({
      success: true,
      data: { phaseCode: 'Plain', lanes: [], nodes: [], edges: [] },
    });
    const { container } = render(<TakenInbox user={caseworker} />);
    await user.click(await screen.findByText('Gewone taak'));
    await waitFor(() => expect(container.querySelector('.v2-taken-steps')).not.toBeNull());
    expect(screen.queryByText(/Waar sta ik/)).toBeNull();
    expect(screen.queryByText('Bekijk proces →')).toBeNull();
    expect(screen.queryByText(/^Awb-fase/)).toBeNull();
  });

  it('shows "Laden…" while the process context is still loading', async () => {
    const user = userEvent.setup();
    laned();
    mockBusinessApi.process.lineage.mockImplementation(() => new Promise(() => {}));
    render(<TakenInbox user={caseworker} />);
    await user.click(await screen.findByText('Beoordeling behandelaar'));
    const steps = screen.getByRole('heading', { name: 'Processtappen' }).parentElement!;
    expect(within(steps).getByText('Laden…')).toBeInTheDocument();
  });

  it('opens the overlay from "Bekijk proces"; Esc closes it and returns focus', async () => {
    const user = userEvent.setup();
    laned();
    render(<TakenInbox user={caseworker} />);
    await user.click(await screen.findByText('Beoordeling behandelaar'));
    const trigger = await screen.findByRole('button', { name: 'Bekijk proces →' });
    await user.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Beoordeling behandelaar' });
    expect(within(dialog).getByText(`AWB-2026-164544 · ${S}`)).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('closes the overlay when another task is selected', async () => {
    const user = userEvent.setup();
    laned();
    render(<TakenInbox user={caseworker} />);
    await user.click(await screen.findByText('Beoordeling behandelaar'));
    await user.click(await screen.findByRole('button', { name: 'Bekijk proces →' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.click(screen.getByText('Gewone taak'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('offers "Proces van deze taak bekijken" to the palette only for a laned task', async () => {
    const user = userEvent.setup();
    laned();
    function Offered() {
      return (
        <ul aria-label="offered">
          {usePaletteActions().map((a) => (
            <li key={a.id}>
              <button onClick={a.run}>{a.label}</button>
            </li>
          ))}
        </ul>
      );
    }
    render(
      <PaletteActionsProvider>
        <TakenInbox user={caseworker} />
        <Offered />
      </PaletteActionsProvider>
    );
    const offered = screen.getByRole('list', { name: 'offered' });
    await user.click(await screen.findByText('Beoordeling behandelaar'));
    const action = await within(offered).findByRole('button', {
      name: 'Proces van deze taak bekijken',
    });
    await user.click(action);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await user.click(screen.getByText('Gewone taak'));
    await waitFor(() => expect(within(offered).queryByRole('button')).toBeNull());
  });

  it('never shows an earlier task’s deadline under the task selected after it', async () => {
    const user = userEvent.setup();
    laned();
    let releaseFirst: (v: unknown) => void = () => {};
    mockBusinessApi.task.variables.mockImplementation((id: string) =>
      id === 'pt'
        ? new Promise((resolve) => {
            releaseFirst = resolve;
          })
        : Promise.resolve({ success: true, data: { awbDeadlineDate: '2026-09-10T00:00:00Z' } })
    );
    const { container } = render(<TakenInbox user={caseworker} />);
    await user.click(await screen.findByText('Gewone taak'));
    await user.click(screen.getByText('Beoordeling behandelaar'));
    await screen.findByText('Waar sta ik · Awb-fase 4+5 · stap 4 van 8');
    releaseFirst({ success: true, data: { awbDeadlineDate: '2026-12-31T00:00:00Z' } });
    await new Promise((r) => setTimeout(r, 0));
    expect(container.querySelector('.cwp-where-cap')!.textContent).toContain(
      'beslistermijn tot 10 sep'
    );
  });
});

describe('TakenInbox Procesgegevens', () => {
  it('is collapsed by default and opens and closes from its heading', async () => {
    const user = userEvent.setup();
    mockBusinessApi.task.list.mockResolvedValue({ success: true, data: [makeTask()] });
    render(<TakenInbox user={null} />);
    await user.click(await screen.findByText('Aanvraag beoordelen'));

    const toggle = screen.getByRole('button', { name: /Procesgegevens/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('process-vars')).toBeNull();
    expect(toggle.textContent).toContain('Gegevens tonen');

    await user.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('process-vars')).toBeInTheDocument();
    expect(toggle.textContent).toContain('Gegevens verbergen');
    expect(document.getElementById(toggle.getAttribute('aria-controls')!)).not.toBeNull();

    await user.click(toggle);
    expect(screen.queryByText('process-vars')).toBeNull();
  });

  it('collapses again when another task is selected', async () => {
    const user = userEvent.setup();
    mockBusinessApi.task.list.mockResolvedValue({
      success: true,
      data: [makeTask({ id: 't1', name: 'Eerste' }), makeTask({ id: 't2', name: 'Tweede' })],
    });
    render(<TakenInbox user={null} />);
    await user.click(await screen.findByText('Eerste'));
    await user.click(screen.getByRole('button', { name: /Procesgegevens/ }));
    expect(screen.getByText('process-vars')).toBeInTheDocument();
    await user.click(screen.getByText('Tweede'));
    expect(screen.queryByText('process-vars')).toBeNull();
    expect(
      screen.getByRole('button', { name: /Procesgegevens/ }).getAttribute('aria-expanded')
    ).toBe('false');
  });
});
