// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { ActivityHistoryItem, PhaseSwimlaneModel, ProcessLineage } from '@ronl/shared';

const mockBusinessApi = vi.hoisted(() => ({
  process: { lineage: vi.fn(), activityHistory: vi.fn(), swimlane: vi.fn() },
}));
vi.mock('../../services/api', () => ({ businessApi: mockBusinessApi }));

import { useTaskProcessContext } from './useTaskProcessContext';

const api = mockBusinessApi.process;
const ok = <T>(data: T) => Promise.resolve({ success: true, data });

const S = 'AwbShellProcess';
const T = 'TreeFellingPermitSubProcess';
const lineage = (id: string, key: string, sup: string | null): ProcessLineage => ({
  processInstanceId: id,
  processDefinitionKey: key,
  processDefinitionId: `${key}:1:x`,
  superProcessInstanceId: sup,
});
const entry = (
  activityId: string,
  key: string,
  extra: Partial<ActivityHistoryItem> = {}
): ActivityHistoryItem => ({
  id: `${key}-${activityId}`,
  activityId,
  activityName: activityId,
  activityType: 'userTask',
  assignee: null,
  startTime: '2026-07-16T10:00:00Z',
  endTime: null,
  durationInMillis: null,
  canceled: false,
  processDefinitionKey: key,
  processDefinitionId: `${key}:1:x`,
  calledProcessInstanceId: null,
  ...extra,
});
const model = (key: string): PhaseSwimlaneModel => ({
  phaseCode: key,
  lanes: [{ key: 'L', label: 'Behandelaar' }],
  nodes: [],
  edges: [],
});

const childTask = { id: 't1', processInstanceId: 'child', taskDefinitionKey: 'Sub_CaseReview' };

beforeEach(() => {
  vi.clearAllMocks();
  api.lineage.mockImplementation((id: string) =>
    id === 'child' ? ok(lineage('child', T, 'parent')) : ok(lineage('parent', S, null))
  );
  api.activityHistory.mockImplementation((id: string) =>
    id === 'child'
      ? ok([entry('Sub_CaseReview', T)])
      : ok([
          entry('Task_Phase45_Process', S, {
            activityType: 'callActivity',
            calledProcessInstanceId: 'child',
          }),
        ])
  );
  api.swimlane.mockImplementation((key: string) => ok(model(key)));
});

describe('useTaskProcessContext', () => {
  it('stays idle without a task', () => {
    const { result } = renderHook(() => useTaskProcessContext(null));
    expect(result.current).toEqual({ data: null, loading: false, error: false });
    expect(api.lineage).not.toHaveBeenCalled();
  });

  it('walks up the call chain and loads every model once', async () => {
    const { result } = renderHook(() => useTaskProcessContext(childTask));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(false);
    expect(result.current.data?.chain.map((c) => c.instanceId)).toEqual(['parent', 'child']);
    expect(Object.keys(result.current.data!.models).sort()).toEqual([S, T]);
    expect(api.swimlane).toHaveBeenCalledTimes(2);
    // The child is in the chain already: its history is fetched once.
    expect(api.activityHistory.mock.calls.filter(([id]) => id === 'child')).toHaveLength(1);
  });

  it('fetches a finished child through the parent’s call activity', async () => {
    api.lineage.mockImplementation(() => ok(lineage('parent', S, null)));
    const { result } = renderHook(() =>
      useTaskProcessContext({
        id: 't2',
        processInstanceId: 'parent',
        taskDefinitionKey: 'Task_Phase6_Notify',
      })
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(api.activityHistory).toHaveBeenCalledWith('child');
    expect(result.current.data?.statusByProcess[T]).toBeDefined();
  });

  it('still shows the child when the parent lookup is refused', async () => {
    api.lineage.mockImplementation((id: string) =>
      id === 'child'
        ? ok(lineage('child', T, 'parent'))
        : Promise.reject(Object.assign(new Error('403'), { response: { status: 403 } }))
    );
    const { result } = renderHook(() => useTaskProcessContext(childTask));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(false);
    expect(result.current.data?.chain.map((c) => c.instanceId)).toEqual(['child']);
  });

  it('drops a model whose fetch fails, without failing the context', async () => {
    api.swimlane.mockImplementation((key: string) =>
      key === S ? Promise.resolve({ success: false }) : ok(model(key))
    );
    const { result } = renderHook(() => useTaskProcessContext(childTask));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(Object.keys(result.current.data!.models)).toEqual([T]);
    expect(result.current.data?.hasLanes).toBe(true);
  });

  it('reports an error when the task’s own lineage cannot be read', async () => {
    api.lineage.mockImplementation(() => Promise.reject(new Error('down')));
    const { result } = renderHook(() => useTaskProcessContext(childTask));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toEqual({ data: null, loading: false, error: true });
  });

  it('reports an error when the task’s own history cannot be read', async () => {
    api.activityHistory.mockImplementation(() => Promise.resolve({ success: false }));
    const { result } = renderHook(() => useTaskProcessContext(childTask));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(true);
  });

  it('never lets a slower, earlier task’s result land after the task changed', async () => {
    let release: () => void = () => {};
    api.lineage.mockImplementation((id: string) =>
      id === 'slow'
        ? new Promise((resolve) => {
            release = () => resolve({ success: true, data: lineage('slow', 'Slow', null) });
          })
        : ok(lineage('child', T, null))
    );
    const { result, rerender } = renderHook(({ task }) => useTaskProcessContext(task), {
      initialProps: {
        task: { id: 'ts', processInstanceId: 'slow', taskDefinitionKey: 'X' } as typeof childTask,
      },
    });
    rerender({ task: childTask });
    await waitFor(() => expect(result.current.data?.current.processKey).toBe(T));
    release();
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current.data?.current.processKey).toBe(T);
  });

  it('loads the model of a subprocess the case has not reached yet', async () => {
    api.lineage.mockImplementation(() => ok(lineage('parent', S, null)));
    api.activityHistory.mockImplementation(() => ok([entry('Task_Phase3_Completeness', S)]));
    api.swimlane.mockImplementation((key: string) =>
      ok(
        key === S
          ? {
              ...model(S),
              nodes: [
                {
                  id: 'Task_Phase45_Process',
                  bpmnId: 'Task_Phase45_Process',
                  kind: 'call' as const,
                  col: 1,
                  row: 0,
                  label: 'Fase 4+5',
                  calls: T,
                },
              ],
            }
          : model(key)
      )
    );
    const { result } = renderHook(() =>
      useTaskProcessContext({
        id: 't3',
        processInstanceId: 'parent',
        taskDefinitionKey: 'Task_Phase3_Completeness',
      })
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(Object.keys(result.current.data!.models).sort()).toEqual([S, T]);
  });

  it('reports loading, never the previous task’s data, on the very render the task changes', async () => {
    const { result, rerender } = renderHook(({ task }) => useTaskProcessContext(task), {
      initialProps: { task: childTask },
    });
    await waitFor(() => expect(result.current.data).not.toBeNull());
    const renders: Array<{ loading: boolean; data: unknown }> = [];
    api.lineage.mockImplementation(() => new Promise(() => {}));
    rerender({ task: { id: 't9', processInstanceId: 'other', taskDefinitionKey: 'X' } });
    renders.push({ loading: result.current.loading, data: result.current.data });
    expect(renders[0]).toEqual({ loading: true, data: null });
  });

  it('reports loading on the first render, before any effect has run', () => {
    api.lineage.mockImplementation(() => new Promise(() => {}));
    const seen: boolean[] = [];
    renderHook(() => {
      const s = useTaskProcessContext(childTask);
      seen.push(s.loading);
      return s;
    });
    expect(seen[0]).toBe(true);
  });
});
