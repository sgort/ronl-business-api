// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { Task } from '@ronl/shared';
import { RipActiveAcrossPhasesProvider } from '../components/InfraBoardDashboard/RipActiveAcrossPhasesProvider';
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
    phasesActive: vi.fn(),
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

  const inst = (id: string, phaseCode: string) => ({
    id,
    startTime: '2026-01-01T00:00:00Z',
    projectNumber: '11111',
    projectName: 'Live',
    edocsWorkspaceId: 'w1',
    leadRole: 'projectleider',
    phaseCode,
  });

  const renderInProvider = () =>
    renderHook(() => useRipActiveAcrossPhases(), { wrapper: RipActiveAcrossPhasesProvider });

  it('throws when rendered outside RipActiveAcrossPhasesProvider', () => {
    // Suppress the noisy React error-boundary console.error this triggers --
    // the throw itself is what the test asserts on.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useRipActiveAcrossPhases())).toThrow(
      'useRipActiveAcrossPhases must be used inside RipActiveAcrossPhasesProvider'
    );
    consoleError.mockRestore();
  });

  it('fetches once, via the aggregate endpoint, and passes the rows through unchanged', async () => {
    // The backend (GET /v1/rip/phases/active) does the per-phase fan-out and
    // tagging now -- see rip.routes.ts and its "aggregates active instances
    // across every modelled phase, tagging each row with its phaseCode" test.
    // The frontend's job shrinks to one request with no reshaping, which this
    // pins via reference equality: if anything downstream started mapping the
    // rows again, this would catch it.
    mockBusinessApi.rip.phasesActive.mockClear();
    const rows = [inst('i-1', 'R2.1'), inst('i-2', 'R2.2')];
    mockBusinessApi.rip.phasesActive.mockResolvedValue({ success: true, data: rows });

    const { result } = renderInProvider();
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toBe(rows);
    expect(result.current.error).toBe(false);
    expect(mockBusinessApi.rip.phasesActive).toHaveBeenCalledTimes(1);
    expect(mockBusinessApi.rip.phaseActive).not.toHaveBeenCalled();
  });

  it('reports an error when the aggregate request fails', async () => {
    // One phase failing without blanking the rest is now the backend's
    // property (rip.routes.ts's Promise.allSettled + anySucceeded), pinned in
    // rip.routes.test.ts's "omits a failing phase rather than blanking the
    // rest of the aggregate". This request is a single call: if it fails at
    // all, there is nothing partial left to keep.
    mockBusinessApi.rip.phasesActive.mockClear();
    mockBusinessApi.rip.phasesActive.mockRejectedValue(new Error('backend down'));

    const { result } = renderInProvider();
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
    // `usePhaseSwimlane` -- the null branch resolves to a genuinely defined
    // empty model so it lands in `useAsync`'s own success path; only `data`
    // is then overridden back to `null` here, `error` is never touched.
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

  // Regression tests for a real, deterministic bug in an earlier version of
  // this hook: it overrode the *whole* returned object while `phaseCode` was
  // null, which meant `useAsync`'s internal `error: true` (set for that
  // branch, since it used to resolve `data: undefined`) stayed masked only
  // for as long as the code stayed null. On the render that processed the
  // code turning real, the hook stopped overriding and returned `useAsync`'s
  // raw state directly -- one render before the re-triggered effect got to
  // reset `error` -- so every null -> real-code transition produced exactly
  // one committed render reporting a spurious `error: true`. A test that
  // only checks the final settled state would never see this: it needs to
  // inspect every render committed during the transition, not just the last
  // one.
  describe('across a phaseCode transition', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    interface Snapshot {
      code: string | null;
      data: { phaseCode: string } | null;
      loading: boolean;
      error: boolean;
    }

    /**
     * Invariants every single committed render must satisfy, regardless of
     * which render in a transition it is:
     *  - asked for nothing (code null) => never hand back a model.
     *  - asked for a phase and holding a model => it MUST be that phase's
     *    model, never a previous code's leftover (the round-2 bug: the
     *    round-1 fix let `EMPTY_SWIMLANE`, or a prior real code's model,
     *    leak through for one render after `phaseCode` changed but before
     *    `asyncState.data` caught up).
     *  - asked for a phase, holding no model, and not errored => must still
     *    say `loading: true` -- otherwise it reads as "settled, no model",
     *    which would flash a not-modelled/empty panel for a phase that is
     *    simply still in flight.
     */
    function assertSnapshotValid(s: Snapshot) {
      if (s.code === null) {
        expect(s.data).toBeNull();
        return;
      }
      if (s.data !== null) {
        expect(s.data.phaseCode).toBe(s.code);
      } else if (!s.error) {
        expect(s.loading).toBe(true);
      }
    }

    function trackedRender(initialCode: string | null) {
      const snapshots: Snapshot[] = [];
      const hook = renderHook(
        ({ code }: { code: string | null }) => {
          const state = usePhaseSwimlane(code);
          snapshots.push({ code, data: state.data, loading: state.loading, error: state.error });
          return state;
        },
        { initialProps: { code: initialCode } }
      );
      return { ...hook, snapshots };
    }

    it('never reports error:true, a mismatched model, or a false "settled" on any committed render, null -> real code', async () => {
      mockBusinessApi.rip.phaseModel.mockClear();
      const model = { phaseCode: 'R2.2', lanes: [], nodes: [], edges: [] };
      mockBusinessApi.rip.phaseModel.mockResolvedValue({ success: true, data: model });

      const { result, rerender, snapshots } = trackedRender(null);

      await waitFor(() => expect(result.current.loading).toBe(false));
      snapshots.forEach(assertSnapshotValid);
      expect(snapshots.map((s) => s.error)).not.toContain(true);

      rerender({ code: 'R2.2' });

      // Checked synchronously, immediately after the transition commits --
      // this is exactly the render both earlier implementations got wrong
      // (round 1: a stale `error: true`; round 2: a stale/mismatched `data`
      // reported as settled).
      snapshots.forEach(assertSnapshotValid);
      expect(snapshots.map((s) => s.error)).not.toContain(true);

      await waitFor(() => expect(result.current.data).toEqual(model));
      snapshots.forEach(assertSnapshotValid);
      expect(snapshots.map((s) => s.error)).not.toContain(true);
    });

    it('never reports error:true, a mismatched model, or a false "settled" on any committed render, real code -> null', async () => {
      mockBusinessApi.rip.phaseModel.mockClear();
      const model = { phaseCode: 'R2.1', lanes: [], nodes: [], edges: [] };
      mockBusinessApi.rip.phaseModel.mockResolvedValue({ success: true, data: model });

      const { result, rerender, snapshots } = trackedRender('R2.1');

      await waitFor(() => expect(result.current.data).toEqual(model));
      snapshots.forEach(assertSnapshotValid);
      expect(snapshots.map((s) => s.error)).not.toContain(true);

      rerender({ code: null });

      snapshots.forEach(assertSnapshotValid);
      expect(snapshots.map((s) => s.error)).not.toContain(true);
      expect(result.current.data).toBeNull();

      await waitFor(() => expect(result.current.loading).toBe(false));
      snapshots.forEach(assertSnapshotValid);
      expect(snapshots.map((s) => s.error)).not.toContain(true);
    });

    it("never exposes phase A's model once phase B has been requested, real code -> different real code", async () => {
      mockBusinessApi.rip.phaseModel.mockClear();
      const modelA = { phaseCode: 'R2.1', lanes: [], nodes: [], edges: [] };
      const modelB = { phaseCode: 'R2.2', lanes: [], nodes: [], edges: [] };
      mockBusinessApi.rip.phaseModel.mockImplementation((code: string) =>
        Promise.resolve({ success: true, data: code === 'R2.1' ? modelA : modelB })
      );

      const { result, rerender, snapshots } = trackedRender('R2.1');

      await waitFor(() => expect(result.current.data).toEqual(modelA));
      snapshots.forEach(assertSnapshotValid);

      rerender({ code: 'R2.2' });

      snapshots.forEach(assertSnapshotValid);
      // Explicit, on top of the general invariant above: once R2.2 has been
      // requested, no render reports R2.1's (A's) model while B loads.
      expect(
        snapshots.filter((s) => s.code === 'R2.2').some((s) => s.data?.phaseCode === 'R2.1')
      ).toBe(false);

      await waitFor(() => expect(result.current.data).toEqual(modelB));
      snapshots.forEach(assertSnapshotValid);
      expect(mockBusinessApi.rip.phaseModel).toHaveBeenCalledWith('R2.1');
      expect(mockBusinessApi.rip.phaseModel).toHaveBeenCalledWith('R2.2');
    });
  });
});
