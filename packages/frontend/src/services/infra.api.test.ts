// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { Task } from '@ronl/shared';
import { ripPhaseByCode } from '../pages/infra-board/rip-phases.catalog';
import {
  groupTasksByHorizon,
  useActivityHistory,
  useDeployedProcessKeys,
  useLivePhaseCounts,
  useOpenTasks,
  usePhaseSwimlane,
  useRipActiveAcrossPhases,
  useRipPhaseReadiness,
  useRipPhaseCompleted,
} from './infra.api';

const mockBusinessApi = vi.hoisted(() => ({
  task: { list: vi.fn() },
  rip: {
    phaseActive: vi.fn(),
    phaseCompleted: vi.fn(),
    phaseModel: vi.fn(),
    instanceDocuments: vi.fn(),
    deploymentStatus: vi.fn(),
    phasesCounts: vi.fn(),
  },
  process: { activityHistory: vi.fn() },
}));

vi.mock('./api', () => ({ businessApi: mockBusinessApi }));

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    name: 'Beoordeel projectplan',
    created: '2026-01-01T00:00:00',
    executionId: 'exec-1',
    processDefinitionId: 'RipR21Process:1:def',
    processDefinitionKey: 'RipR21Process',
    processInstanceId: 'proc-1',
    taskDefinitionKey: 'task-def-1',
    suspended: false,
    ...overrides,
  };
}

/** Builds a `due` string that `new Date()` re-parses as the same local wall-clock time, regardless of the runner's timezone. */
function localDateTime(year: number, month: number, day: number, hour = 12): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${year}-${pad(month + 1)}-${pad(day)}T${pad(hour)}:00:00`;
}

describe('groupTasksByHorizon', () => {
  // Monday 2026-01-05 10:00 local time. getDay() === 1, so weekEnd (Sunday) is
  // 6 days out (2026-01-11) and nextWeekEnd is 2026-01-18.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 5, 10, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('excludes tasks whose processDefinitionKey is not owned by the infra board', () => {
    const result = groupTasksByHorizon([makeTask({ processDefinitionKey: 'SomeOtherProcess' })]);

    expect(result).toEqual({ vandaag: [], deze_week: [], volgende_week: [] });
  });

  it('buckets an overdue task into vandaag with prio "overdue"', () => {
    const result = groupTasksByHorizon([
      makeTask({ id: 'overdue-1', due: localDateTime(2026, 0, 4) }),
    ]);

    expect(result.vandaag).toHaveLength(1);
    expect(result.vandaag[0]).toMatchObject({ taskId: 'overdue-1', prio: 'overdue' });
  });

  it('buckets a task due within this week into vandaag, prio by assignee', () => {
    const result = groupTasksByHorizon([
      makeTask({ id: 'assigned-1', due: localDateTime(2026, 0, 8), assignee: 'user-1' }),
      makeTask({ id: 'unassigned-1', due: localDateTime(2026, 0, 8) }),
    ]);

    expect(result.vandaag).toHaveLength(2);
    expect(result.vandaag.find((t) => t.taskId === 'assigned-1')?.prio).toBe('active');
    expect(result.vandaag.find((t) => t.taskId === 'unassigned-1')?.prio).toBe('action');
  });

  it('buckets a task with no due date into deze_week, not vandaag', () => {
    const result = groupTasksByHorizon([makeTask({ id: 'no-due-1', due: undefined })]);

    expect(result.vandaag).toHaveLength(0);
    expect(result.deze_week).toHaveLength(1);
    expect(result.deze_week[0].taskId).toBe('no-due-1');
  });

  it('buckets a task due next week into volgende_week', () => {
    const result = groupTasksByHorizon([
      makeTask({ id: 'next-week-1', due: localDateTime(2026, 0, 14) }),
    ]);

    expect(result.volgende_week).toHaveLength(1);
    expect(result.volgende_week[0].taskId).toBe('next-week-1');
  });

  it('buckets a task due beyond two weeks out into volgende_week as well', () => {
    const result = groupTasksByHorizon([
      makeTask({ id: 'far-future-1', due: localDateTime(2026, 1, 1) }),
    ]);

    expect(result.volgende_week).toHaveLength(1);
    expect(result.volgende_week[0].taskId).toBe('far-future-1');
  });

  it('uses the friendly process display name for the title', () => {
    const result = groupTasksByHorizon([
      makeTask({ id: 'titled-1', due: localDateTime(2026, 0, 8) }),
    ]);

    expect(result.vandaag[0].titel).toBe('RIP R2.1 — Projectplan planvoorbereiding');
  });
});

describe('useOpenTasks', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads the task list and exposes it once resolved', async () => {
    const tasks = [makeTask()];
    mockBusinessApi.task.list.mockResolvedValue({ success: true, data: tasks });

    const { result } = renderHook(() => useOpenTasks());

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toEqual(tasks);
    expect(result.current.error).toBe(false);
  });

  it('sets error state when the response is unsuccessful', async () => {
    mockBusinessApi.task.list.mockResolvedValue({ success: false });

    const { result } = renderHook(() => useOpenTasks());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe(true);
    expect(result.current.data).toBeNull();
  });

  it('sets error state when the call rejects', async () => {
    mockBusinessApi.task.list.mockRejectedValue(new Error('network down'));

    const { result } = renderHook(() => useOpenTasks());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe(true);
  });
});

describe('useDeployedProcessKeys', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads the deployed keys and exposes them once resolved', async () => {
    mockBusinessApi.rip.deploymentStatus.mockResolvedValue({
      success: true,
      data: { deployedKeys: ['RipR21Process'] },
    });

    const { result } = renderHook(() => useDeployedProcessKeys());

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toEqual({ deployedKeys: ['RipR21Process'] });
    expect(result.current.error).toBe(false);
  });

  it('sets error state when the call rejects', async () => {
    mockBusinessApi.rip.deploymentStatus.mockRejectedValue(new Error('network down'));

    const { result } = renderHook(() => useDeployedProcessKeys());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe(true);
  });
});

describe('useLivePhaseCounts', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads the phase counts and exposes them once resolved', async () => {
    mockBusinessApi.rip.phasesCounts.mockResolvedValue({
      success: true,
      data: { counts: { RipR21Process: { wip: 3, gereed: 7 } } },
    });

    const { result } = renderHook(() => useLivePhaseCounts());

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toEqual({
      counts: { RipR21Process: { wip: 3, gereed: 7 } },
    });
  });

  it('sets error state when the call rejects', async () => {
    mockBusinessApi.rip.phasesCounts.mockRejectedValue(new Error('network down'));

    const { result } = renderHook(() => useLivePhaseCounts());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe(true);
  });
});

describe('useActivityHistory', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not call the API and resolves an empty list when instanceId is null', async () => {
    const { result } = renderHook(() => useActivityHistory(null));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toEqual([]);
    expect(mockBusinessApi.process.activityHistory).not.toHaveBeenCalled();
  });

  it('loads activity history for a given instanceId', async () => {
    mockBusinessApi.process.activityHistory.mockResolvedValue({ success: true, data: [] });

    const { result } = renderHook(() => useActivityHistory('proc-1'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockBusinessApi.process.activityHistory).toHaveBeenCalledWith('proc-1');
  });
});

describe('useRipActiveAcrossPhases', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const inst = (id: string) => ({
    id,
    startTime: '2026-01-01T00:00:00Z',
    projectNumber: '11111',
    projectName: 'Live',
    edocsWorkspaceId: 'w1',
    leadRole: 'projectleider',
  });

  it('tags each instance with the phase it came from', async () => {
    mockBusinessApi.rip.phaseActive.mockClear();
    mockBusinessApi.rip.phaseActive.mockImplementation((code: string) =>
      Promise.resolve({ success: true, data: [inst(`i-${code}`)] })
    );

    const { result } = renderHook(() => useRipActiveAcrossPhases());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const rows = result.current.data ?? [];

    // Two concrete pairings, so the assertion is not purely derived from the
    // same catalogue the hook reads.
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'i-R2.1', phaseCode: 'R2.1' }),
        expect.objectContaining({ id: 'i-R2.2', phaseCode: 'R2.2' }),
      ])
    );

    // The invariant that actually matters and does not churn as phases deploy:
    // every row is tagged with the phase whose request produced it. The mock
    // ids embed the requested code, so a mis-paired codes[i] shows up here --
    // which an exact-list assertion could only catch by being rewritten on
    // every deployment.
    for (const row of rows) {
      expect(row.id).toBe(`i-${row.phaseCode}`);
      expect(ripPhaseByCode(row.phaseCode)?.processDefinitionKey).toBeDefined();
    }

    // ...and no phase without a process model was asked for at all.
    const asked = mockBusinessApi.rip.phaseActive.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(asked).toEqual(rows.map((r) => r.phaseCode));
    for (const code of asked) {
      expect(ripPhaseByCode(code)?.processDefinitionKey).toBeDefined();
    }

    expect(result.current.error).toBe(false);
  });

  it('keeps the phases that answered when another one rejects', async () => {
    // A non-2xx rejects the axios promise, it does not resolve
    // { success: false } -- so an unguarded Promise.all would reject here and
    // the portfolio would show no live rows at all. This is the regression
    // that made R2.1's live project vanish while the backend still served
    // the old routes.
    mockBusinessApi.rip.phaseActive.mockClear();
    mockBusinessApi.rip.phaseActive.mockImplementation((code: string) =>
      code === 'R2.1'
        ? Promise.resolve({ success: true, data: [inst('i-1')] })
        : Promise.reject(new Error('404'))
    );

    const { result } = renderHook(() => useRipActiveAcrossPhases());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toEqual([
      expect.objectContaining({ id: 'i-1', phaseCode: 'R2.1' }),
    ]);
    expect(result.current.error).toBe(false);
  });

  it('reports an error only when every phase fails', async () => {
    mockBusinessApi.rip.phaseActive.mockClear();
    mockBusinessApi.rip.phaseActive.mockRejectedValue(new Error('backend down'));

    const { result } = renderHook(() => useRipActiveAcrossPhases());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe(true);
  });
});

describe('useRipPhaseReadiness', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const done = (nr: string, key: string | null) => ({
    id: 'done-' + nr,
    businessKey: key,
    startTime: '2026-01-01T00:00:00Z',
    endTime: '2026-02-01T00:00:00Z',
    projectNumber: nr,
    projectName: 'Project ' + nr,
    edocsWorkspaceId: 'w1',
  });

  const running = (key: string | null) => ({
    id: 'run-' + key,
    businessKey: key,
    startTime: '2026-03-01T00:00:00Z',
    projectNumber: '00000',
    projectName: 'Running',
    edocsWorkspaceId: 'w1',
    leadRole: '',
  });

  function arrange(opts: {
    predecessorDone?: ReturnType<typeof done>[];
    thisActive?: ReturnType<typeof running>[];
    thisDone?: ReturnType<typeof done>[];
  }) {
    mockBusinessApi.rip.phaseCompleted.mockClear();
    mockBusinessApi.rip.phaseActive.mockClear();
    mockBusinessApi.rip.phaseCompleted.mockImplementation((code: string) =>
      Promise.resolve({
        success: true,
        data: code === 'R2.1' ? (opts.predecessorDone ?? []) : (opts.thisDone ?? []),
      })
    );
    mockBusinessApi.rip.phaseActive.mockResolvedValue({
      success: true,
      data: opts.thisActive ?? [],
    });
  }

  it('offers projects whose predecessor instance completed', async () => {
    arrange({ predecessorDone: [done('24011', 'flevoland-1'), done('24056', 'flevoland-2')] });

    const { result } = renderHook(() => useRipPhaseReadiness('R2.2', 'R2.1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.candidates.map((c) => c.projectNumber)).toEqual(['24011', '24056']);
    expect(result.current.candidates[0].businessKey).toBe('flevoland-1');
  });

  it('drops a project whose business key already has a running instance of this phase', async () => {
    arrange({
      predecessorDone: [done('24011', 'flevoland-1'), done('24056', 'flevoland-2')],
      thisActive: [running('flevoland-1')],
    });

    const { result } = renderHook(() => useRipPhaseReadiness('R2.2', 'R2.1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.candidates.map((c) => c.projectNumber)).toEqual(['24056']);
  });

  it('drops a project whose business key already has a completed instance of this phase', async () => {
    arrange({
      predecessorDone: [done('24011', 'flevoland-1')],
      thisDone: [done('24011', 'flevoland-1')],
    });

    const { result } = renderHook(() => useRipPhaseReadiness('R2.2', 'R2.1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.candidates).toEqual([]);
  });

  it('keeps a candidate that carries no business key rather than hiding it', async () => {
    // An instance predating the convention, or started by hand. Offering a
    // possibly-duplicate start is recoverable; silently dropping a project
    // from the board is not.
    arrange({
      predecessorDone: [done('24011', null)],
      thisActive: [running(null)],
    });

    const { result } = renderHook(() => useRipPhaseReadiness('R2.2', 'R2.1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.candidates.map((c) => c.projectNumber)).toEqual(['24011']);
  });

  it('asks for nothing when the predecessor phase has no process model', async () => {
    arrange({});

    const { result } = renderHook(() => useRipPhaseReadiness('R2.3', null));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.candidates).toEqual([]);
    expect(mockBusinessApi.rip.phaseCompleted).not.toHaveBeenCalledWith(null);
  });
});

describe('useRipPhaseCompleted', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads completed instances and exposes them once resolved', async () => {
    const completed = [
      {
        id: 'done-1',
        startTime: '2026-01-01T00:00:00Z',
        endTime: '2026-03-15T00:00:00Z',
        projectNumber: '88888',
        projectName: 'Afgerond testproject',
        edocsWorkspaceId: 'w2',
      },
    ];
    mockBusinessApi.rip.phaseCompleted.mockResolvedValue({ success: true, data: completed });

    const { result } = renderHook(() => useRipPhaseCompleted('R2.1'));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toEqual(completed);
    expect(result.current.error).toBe(false);
    expect(mockBusinessApi.rip.phaseCompleted).toHaveBeenCalledWith('R2.1');
  });

  it('makes no request at all for a null phase code', async () => {
    // vi.restoreAllMocks() does not reset a vi.hoisted() vi.fn(), so the
    // previous test's call would otherwise still be on the record here.
    mockBusinessApi.rip.phaseCompleted.mockClear();

    const { result } = renderHook(() => useRipPhaseCompleted(null));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockBusinessApi.rip.phaseCompleted).not.toHaveBeenCalled();
    expect(result.current.data).toEqual([]);
    expect(result.current.error).toBe(false);
  });

  it('sets error state when the call rejects', async () => {
    mockBusinessApi.rip.phaseCompleted.mockRejectedValue(new Error('network down'));

    const { result } = renderHook(() => useRipPhaseCompleted('R2.1'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe(true);
  });
});

describe('usePhaseSwimlane', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches the swimlane model for the phase code it is given', async () => {
    const model = { phaseCode: 'R2.2', lanes: [], nodes: [], edges: [] };
    mockBusinessApi.rip.phaseModel.mockResolvedValue({ success: true, data: model });

    const { result } = renderHook(() => usePhaseSwimlane('R2.2'));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Envelope unwrapped -- data is the model itself, not `{ success, data }`.
    expect(result.current.data).toEqual(model);
    expect(result.current.error).toBe(false);
    // Pins that the exact code passed to the hook is the one forwarded --
    // catches a swapped argument or a hard-coded phase.
    expect(mockBusinessApi.rip.phaseModel).toHaveBeenCalledWith('R2.2');
  });

  it('makes no request and reports a clean idle state for a null phase code', async () => {
    // vi.restoreAllMocks() does not reset a vi.hoisted() vi.fn(), so the
    // previous test's call would otherwise still be on the record here.
    mockBusinessApi.rip.phaseModel.mockClear();

    const { result } = renderHook(() => usePhaseSwimlane(null));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockBusinessApi.rip.phaseModel).not.toHaveBeenCalled();
    // Pins the ACTUAL resulting state deliberately: "no phase selected" is a
    // clean idle state, not a fetch failure. See the doc comment on
    // `usePhaseSwimlane` -- a straight delegate to `useAsync` would resolve
    // this case to `{ success: true, data: undefined }`, which `useAsync`
    // treats as `error: true`; this hook overrides that outward-facing
    // result rather than bending `useAsync` itself.
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBe(false);
  });

  it('sets error state when the call rejects', async () => {
    mockBusinessApi.rip.phaseModel.mockRejectedValue(new Error('network down'));

    const { result } = renderHook(() => usePhaseSwimlane('R2.1'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe(true);
    expect(result.current.data).toBeNull();
  });
});
