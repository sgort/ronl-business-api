// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { Task } from '@ronl/shared';
import {
  groupTasksByHorizon,
  useActivityHistory,
  useDeployedProcessKeys,
  useLivePhaseCounts,
  useOpenTasks,
  usePhase1Completed,
} from './infra.api';

const mockBusinessApi = vi.hoisted(() => ({
  task: { list: vi.fn() },
  rip: {
    phase1Active: vi.fn(),
    phase1Completed: vi.fn(),
    phase1Documents: vi.fn(),
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

    expect(result.vandaag[0].titel).toBe('RIP Fase 1 — R2.1 Projectplan Planvoorbereiding');
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

describe('usePhase1Completed', () => {
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
    mockBusinessApi.rip.phase1Completed.mockResolvedValue({ success: true, data: completed });

    const { result } = renderHook(() => usePhase1Completed());

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toEqual(completed);
    expect(result.current.error).toBe(false);
  });

  it('sets error state when the call rejects', async () => {
    mockBusinessApi.rip.phase1Completed.mockRejectedValue(new Error('network down'));

    const { result } = renderHook(() => usePhase1Completed());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe(true);
  });
});
