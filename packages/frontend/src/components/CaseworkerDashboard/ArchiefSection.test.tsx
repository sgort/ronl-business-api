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
