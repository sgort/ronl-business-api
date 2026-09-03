// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ArchiefSection from './ArchiefSection';
import type { HistoricTask } from '@ronl/shared';

const mockBusinessApi = vi.hoisted(() => ({
  task: { history: vi.fn() },
  process: { historicVariables: vi.fn() },
}));
vi.mock('../../services/api', () => ({ businessApi: mockBusinessApi }));

function makeTask(overrides: Partial<HistoricTask> = {}): HistoricTask {
  return {
    id: 't1',
    name: 'Aanvraag afgehandeld',
    assignee: null,
    taskDefinitionKey: 'Task_1',
    processDefinitionKey: 'ProcA',
    processInstanceId: 'pi-1',
    businessKey: null,
    startTime: '2026-06-01T00:00:00Z',
    endTime: '2026-06-02T00:00:00Z',
    duration: 1000,
    boardOwner: null,
    ...overrides,
  };
}

beforeEach(() => {
  mockBusinessApi.task.history.mockResolvedValue({ success: true, data: [] });
  mockBusinessApi.process.historicVariables.mockResolvedValue({ success: true, data: {} });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('ArchiefSection', () => {
  it('shows a loading skeleton, then an empty state with no archived tasks', async () => {
    render(<ArchiefSection />);
    expect(await screen.findByText('Geen afgeronde taken gevonden.')).toBeInTheDocument();
  });

  it('shows an error state and "Opnieuw proberen" retries the load', async () => {
    mockBusinessApi.task.history.mockResolvedValue({ success: false });
    const user = userEvent.setup();
    render(<ArchiefSection />);

    expect(await screen.findByText('Archieftaken konden niet worden geladen.')).toBeInTheDocument();

    mockBusinessApi.task.history.mockResolvedValue({ success: true, data: [makeTask()] });
    await user.click(screen.getByRole('button', { name: 'Opnieuw proberen' }));

    expect(await screen.findByText(/Aanvraag afgehandeld/)).toBeInTheDocument();
  });

  it('with a boardId, filters to tasks tagged with a matching boardOwner', async () => {
    mockBusinessApi.task.history.mockResolvedValue({
      success: true,
      data: [
        makeTask({ id: 't1', name: 'Infra taak', boardOwner: 'infra-board' }),
        makeTask({ id: 't2', name: 'Caseworker taak', boardOwner: 'caseworker' }),
      ],
    });
    render(<ArchiefSection boardId="infra-board" />);

    expect(await screen.findByText(/Infra taak/)).toBeInTheDocument();
    expect(screen.queryByText(/Caseworker taak/)).not.toBeInTheDocument();
  });

  it('untagged tasks fall back to the allow/deny processDefinitionKey split', async () => {
    mockBusinessApi.task.history.mockResolvedValue({
      success: true,
      data: [
        makeTask({ id: 't1', name: 'Allowed', processDefinitionKey: 'ProcA', boardOwner: null }),
        makeTask({ id: 't2', name: 'Denied', processDefinitionKey: 'ProcB', boardOwner: null }),
      ],
    });
    render(<ArchiefSection denyProcessKeys={new Set(['ProcB'])} />);

    expect(await screen.findByText(/Allowed/)).toBeInTheDocument();
    expect(screen.queryByText(/Denied/)).not.toBeInTheDocument();
  });

  it('groups tasks by processDefinitionKey and sorts groups by most recent endTime', async () => {
    mockBusinessApi.task.history.mockResolvedValue({
      success: true,
      data: [
        makeTask({
          id: 't1',
          name: 'Oud',
          processDefinitionKey: 'ProcOld',
          endTime: '2026-01-01T00:00:00Z',
        }),
        makeTask({
          id: 't2',
          name: 'Nieuw',
          processDefinitionKey: 'ProcNew',
          endTime: '2026-06-01T00:00:00Z',
        }),
      ],
    });
    const { container } = render(<ArchiefSection />);

    await screen.findByText(/Nieuw/);
    const groupLabels = Array.from(container.querySelectorAll('.font-mono.mb-1')).map(
      (el) => el.textContent
    );
    expect(groupLabels).toEqual(['ProcNew', 'ProcOld']);
  });

  it('expanding a task loads and shows its variables, filtering out excluded ones', async () => {
    mockBusinessApi.task.history.mockResolvedValue({ success: true, data: [makeTask()] });
    mockBusinessApi.process.historicVariables.mockResolvedValue({
      success: true,
      data: { municipality: 'Almere', aanvraagNummer: '12345' },
    });
    const user = userEvent.setup();
    render(<ArchiefSection />);

    await user.click(await screen.findByText(/Aanvraag afgehandeld/));

    expect(mockBusinessApi.process.historicVariables).toHaveBeenCalledWith('pi-1');
    expect(await screen.findByText('aanvraagNummer')).toBeInTheDocument();
    expect(screen.getByText('12345')).toBeInTheDocument();
    expect(screen.queryByText('municipality')).not.toBeInTheDocument();
  });

  it('collapsing and re-expanding a task does not refetch already-loaded variables', async () => {
    mockBusinessApi.task.history.mockResolvedValue({ success: true, data: [makeTask()] });
    const user = userEvent.setup();
    render(<ArchiefSection />);

    const toggle = await screen.findByText(/Aanvraag afgehandeld/);
    await user.click(toggle);
    await user.click(toggle);
    await user.click(toggle);

    expect(mockBusinessApi.process.historicVariables).toHaveBeenCalledTimes(1);
  });
});

describe('ArchiefSection task rows', () => {
  it('keeps every board-tagged task when no board is named', async () => {
    // The shared archive view (no boardId) is the caseworker's own list: a
    // task tagged for a board must still show there, not be filtered out.
    mockBusinessApi.task.history.mockResolvedValue({
      success: true,
      data: [
        makeTask({ id: 'a', name: 'Van infra-board', boardOwner: 'infra' }),
        makeTask({ id: 'b', name: 'Van woo-board', boardOwner: 'woo' }),
      ],
    });

    render(<ArchiefSection />);

    expect(await screen.findByText('Van infra-board')).toBeInTheDocument();
    expect(screen.getByText('Van woo-board')).toBeInTheDocument();
  });

  it('drops an untagged task whose process key is not on the allow list', async () => {
    mockBusinessApi.task.history.mockResolvedValue({
      success: true,
      data: [
        makeTask({ id: 'a', name: 'Toegestaan', processDefinitionKey: 'ProcA' }),
        makeTask({ id: 'b', name: 'Niet toegestaan', processDefinitionKey: 'ProcB' }),
      ],
    });

    render(<ArchiefSection allowProcessKeys={new Set(['ProcA'])} />);

    expect(await screen.findByText('Toegestaan')).toBeInTheDocument();
    expect(screen.queryByText('Niet toegestaan')).not.toBeInTheDocument();
  });

  it('groups an untagged task with no process key under its task key instead', async () => {
    // Historic tasks from an older engine version carry no
    // processDefinitionKey; grouping them under `undefined` would collapse
    // unrelated processes into one card.
    mockBusinessApi.task.history.mockResolvedValue({
      success: true,
      data: [makeTask({ id: 'a', name: 'Zonder proceskey', processDefinitionKey: null })],
    });

    render(<ArchiefSection />);

    expect(await screen.findByText('Zonder proceskey')).toBeInTheDocument();
  });

  it('falls back to the task key when the task has no display name', async () => {
    mockBusinessApi.task.history.mockResolvedValue({
      success: true,
      data: [makeTask({ id: 'a', name: '', taskDefinitionKey: 'Task_Review' })],
    });

    render(<ArchiefSection />);

    expect(await screen.findAllByText(/Task_Review/)).not.toHaveLength(0);
  });

  it('shows a business key when the process has one', async () => {
    mockBusinessApi.task.history.mockResolvedValue({
      success: true,
      data: [makeTask({ id: 'a', businessKey: 'ZAAK-2026-001' })],
    });

    render(<ArchiefSection />);

    expect(await screen.findByText('ZAAK-2026-001')).toBeInTheDocument();
  });

  it('shows a human assignee but hides a raw user id and a worker account', async () => {
    // A bare Keycloak UUID and the external-task worker account are machine
    // identities; printing them in the archive tells the reader nothing and
    // looks like leaked internals.
    mockBusinessApi.task.history.mockResolvedValue({
      success: true,
      data: [
        makeTask({ id: 'a', name: 'Mens', assignee: 'w.demeer' }),
        makeTask({
          id: 'b',
          name: 'UUID',
          assignee: '3f1a2b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b',
        }),
        makeTask({ id: 'c', name: 'Worker', assignee: 'ronl-worker-rip' }),
      ],
    });

    render(<ArchiefSection />);

    expect(await screen.findByText('w.demeer')).toBeInTheDocument();
    expect(screen.queryByText('3f1a2b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b')).not.toBeInTheDocument();
    expect(screen.queryByText('ronl-worker-rip')).not.toBeInTheDocument();
  });

  it('renders each variable value by its type, with an em dash for an empty one', async () => {
    mockBusinessApi.task.history.mockResolvedValue({
      success: true,
      data: [makeTask({ id: 'a', name: 'Met variabelen' })],
    });
    mockBusinessApi.process.historicVariables.mockResolvedValue({
      success: true,
      data: {
        tekst: 'waarde',
        getal: 42,
        leeg: null,
        ontbreekt: undefined,
        object: { a: 1 },
      },
    });
    const user = userEvent.setup();

    render(<ArchiefSection />);
    await user.click(await screen.findByText('Met variabelen'));

    expect(await screen.findByText('waarde')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    expect(screen.getByText('{"a":1}')).toBeInTheDocument();
  });
});
