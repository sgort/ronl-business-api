/**
 * Infra-board — live data layer.
 *
 * Thin React hooks over the EXISTING `businessApi` (services/api.ts). Nothing
 * new on the backend — these are the same endpoints the caseworker dashboard
 * and RipFase1WipViewer already call, so test-infra-flevoland's running
 * RipPhase1Process tasks/instances flow straight in.
 */

import { useEffect, useState } from 'react';
import { businessApi } from './api';
import type { Task, ActivityHistoryItem } from '@ronl/shared';
import type { StatusKey } from '../pages/infra-board/rip-model';

export interface Phase1Instance {
  id: string;
  startTime: string;
  projectNumber: string;
  projectName: string;
  edocsWorkspaceId: string;
}

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: boolean;
  reload: () => void;
}

function useAsync<T>(
  fn: () => Promise<{ success: boolean; data?: T }>,
  deps: unknown[]
): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(false);
    fn()
      .then((res) => {
        if (!alive) return;
        if (res.success && res.data !== undefined) setData(res.data);
        else setError(true);
      })
      .catch(() => alive && setError(true))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { data, loading, error, reload: () => setTick((t) => t + 1) };
}

/** The signed-in user's open engine tasks (the work surface). */
export const useOpenTasks = () => useAsync<Task[]>(() => businessApi.task.list(), []);

/** Running RIP Fase 1 instances (portfolio — live Fase-1 rows). */
export const useActivePhase1 = () =>
  useAsync<Phase1Instance[]>(() => businessApi.rip.phase1Active(), []);

/** Activity-history for a process instance — drives swimlane node status. */
export const useActivityHistory = (instanceId: string | null) =>
  useAsync<ActivityHistoryItem[]>(
    () =>
      instanceId
        ? businessApi.process.activityHistory(instanceId)
        : Promise.resolve({ success: true, data: [] }),
    [instanceId]
  );

/** The three Projectplan documents + variables for a Fase-1 instance. */
export const usePhase1Documents = (instanceId: string | null) =>
  useAsync<{
    variables: Record<string, unknown>;
    intakeReport: Record<string, unknown> | null;
    psuReport: Record<string, unknown> | null;
    pdp: Record<string, unknown> | null;
  }>(
    () =>
      instanceId
        ? businessApi.rip.phase1Documents(instanceId)
        : Promise.resolve({
            success: true,
            data: { variables: {}, intakeReport: null, psuReport: null, pdp: null },
          }),
    [instanceId]
  );

// ── Mapping live tasks → "Mijn to do" rows ──────────────────────────────────
export interface LiveTodo {
  taskId: string;
  prio: StatusKey;
  titel: string;
  proj: string;
  sub: string;
  processInstanceId: string;
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

const PROCESS_DISPLAY_NAMES: Record<string, string> = {
  RipPhase1Process: 'RIP Fase 1 — R2.1 Projectplan Planvoorbereiding',
};

/**
 * Process-definition keys owned by the Infra-board. Single source of truth for
 * "which processes belong to the infra surface" — used both to narrow the live
 * task list and to split the shared Archief between the caseworker and infra
 * boards (infra shows only these; caseworker hides them).
 */
export const INFRA_PROCESS_KEYS: ReadonlySet<string> = new Set(Object.keys(PROCESS_DISPLAY_NAMES));

/** Bucket the user's open tasks into Vandaag / Deze week / Volgende week by `due`. */
export function groupTasksByHorizon(tasks: Task[]): {
  vandaag: LiveTodo[];
  deze_week: LiveTodo[];
  volgende_week: LiveTodo[];
} {
  const today = startOfDay(new Date());
  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + (7 - today.getDay()));
  const nextWeekEnd = new Date(weekEnd);
  nextWeekEnd.setDate(nextWeekEnd.getDate() + 7);
  const out = {
    vandaag: [] as LiveTodo[],
    deze_week: [] as LiveTodo[],
    volgende_week: [] as LiveTodo[],
  };

  for (const t of tasks.filter((t) => INFRA_PROCESS_KEYS.has(t.processDefinitionKey ?? ''))) {
    const due = t.due ? new Date(t.due) : null;
    const overdue = due ? due < today : false;
    const todo: LiveTodo = {
      taskId: t.id,
      processInstanceId: t.processInstanceId,
      titel: PROCESS_DISPLAY_NAMES[t.processDefinitionKey ?? ''] ?? t.name,
      proj: t.processDefinitionKey ?? t.processInstanceId.slice(0, 8),
      sub: t.name,
      prio: overdue ? 'overdue' : t.assignee ? 'active' : 'action',
    };
    if (!due || (due >= today && due <= weekEnd) || overdue)
      out[overdue ? 'vandaag' : due && due <= weekEnd ? 'vandaag' : 'deze_week'].push(todo);
    else if (due <= nextWeekEnd) out.volgende_week.push(todo);
    else out.volgende_week.push(todo);
  }
  return out;
}
