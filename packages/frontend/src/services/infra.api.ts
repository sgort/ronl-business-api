/**
 * Infra-board — live data layer.
 *
 * Thin React hooks over the EXISTING `businessApi` (services/api.ts). Nothing
 * new on the backend — these are the same endpoints the caseworker dashboard
 * and RipFase1WipViewer already call, so test-infra-flevoland's running
 * RipR21Process tasks/instances flow straight in.
 */

import { useEffect, useState } from 'react';
import { businessApi } from './api';
import type { Task, ActivityHistoryItem } from '@ronl/shared';
import { RIP_PHASE_KEYS } from '@ronl/shared';
import type { StatusKey } from '../pages/infra-board/rip-model';
import { RIP_PHASES } from '../pages/infra-board/rip-phases.catalog';

export interface RipPhaseInstance {
  id: string;
  startTime: string;
  projectNumber: string;
  projectName: string;
  edocsWorkspaceId: string;
  /** Declared portfolio lead role (rip-model key); '' when the instance predates the contract. */
  leadRole: string;
}

/** A running instance carrying the phase it belongs to — the shape the
 *  portfolio and command palette need, since their rows span phases. */
export interface RipPhaseInstanceRow extends RipPhaseInstance {
  phaseCode: string;
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

/** Live "is this phase's process deployed here?" data for the RIP catalogue. */
export const useDeployedProcessKeys = () =>
  useAsync<{ deployedKeys: string[] }>(() => businessApi.rip.deploymentStatus(), []);

/** Live per-phase WIP/Gereed instance counts for the Faseladder overview. */
export const useLivePhaseCounts = () =>
  useAsync<{ counts: Record<string, { wip: number; gereed: number }> }>(
    () => businessApi.rip.phasesCounts(),
    []
  );

/** Phase codes whose process is modelled as BPMN — the only ones the
 *  phase endpoints accept. An unmodelled code answers 409, deliberately:
 *  callers must not confuse "not deployed" with "deployed, no instances". */
const modelledPhaseCodes = () =>
  RIP_PHASE_KEYS.filter((p) => p.processDefinitionKey).map((p) => p.code);

/** Running instances of one RIP phase. Pass null to skip the request —
 *  for a phase with no process model there is nothing to ask for. */
export const useRipPhaseActive = (phaseCode: string | null) =>
  useAsync<RipPhaseInstance[]>(
    () =>
      phaseCode
        ? businessApi.rip.phaseActive(phaseCode)
        : Promise.resolve({ success: true, data: [] }),
    [phaseCode]
  );

export interface RipPhaseCompletedInstance {
  id: string;
  startTime: string;
  endTime: string;
  projectNumber: string;
  projectName: string;
  edocsWorkspaceId: string;
}

/** Completed instances of one RIP phase (Gereed tab). Null skips, as above. */
export const useRipPhaseCompleted = (phaseCode: string | null) =>
  useAsync<RipPhaseCompletedInstance[]>(
    () =>
      phaseCode
        ? businessApi.rip.phaseCompleted(phaseCode)
        : Promise.resolve({ success: true, data: [] }),
    [phaseCode]
  );

/**
 * Running instances across every modelled phase, flattened and tagged.
 *
 * One phase failing does not blank the others — the portfolio showing R2.1's
 * projects is strictly better than showing none because R2.2's request
 * timed out. Only an across-the-board failure is reported as an error.
 */
async function fetchActiveAcrossPhases(): Promise<{
  success: boolean;
  data?: RipPhaseInstanceRow[];
}> {
  const codes = modelledPhaseCodes();
  if (codes.length === 0) return { success: true, data: [] };
  const results = await Promise.all(
    codes.map((code) =>
      // The per-request catch is what actually makes one phase survivable:
      // a non-2xx rejects the axios promise rather than resolving
      // { success: false }, so without it a single failing phase rejects the
      // whole Promise.all and the portfolio renders no live rows at all.
      businessApi.rip.phaseActive(code).catch(() => ({ success: false as const, data: undefined }))
    )
  );
  const rows = results.flatMap((res, i) =>
    res.success && res.data ? res.data.map((inst) => ({ ...inst, phaseCode: codes[i] })) : []
  );
  return { success: results.some((r) => r.success), data: rows };
}

/** Running instances portfolio-wide, across every deployed phase. */
export const useRipActiveAcrossPhases = () =>
  useAsync<RipPhaseInstanceRow[]>(fetchActiveAcrossPhases, []);

/** Activity-history for a process instance — drives swimlane node status. */
export const useActivityHistory = (instanceId: string | null) =>
  useAsync<ActivityHistoryItem[]>(
    () =>
      instanceId
        ? businessApi.process.activityHistory(instanceId)
        : Promise.resolve({ success: true, data: [] }),
    [instanceId]
  );

/** An instance's documents + variables. The three names are R2.1's document
 *  set; instances of a phase that ships none get null for all three. */
export const useInstanceDocuments = (instanceId: string | null) =>
  useAsync<{
    variables: Record<string, unknown>;
    intakeReport: Record<string, unknown> | null;
    psuReport: Record<string, unknown> | null;
    pdp: Record<string, unknown> | null;
  }>(
    () =>
      instanceId
        ? businessApi.rip.instanceDocuments(instanceId)
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

/**
 * Human label per infra process-definition key, derived from the phase
 * catalogue rather than listed by hand: a phase that gains a
 * processDefinitionKey becomes an infra process in the same edit, with no
 * second place to remember. Hand-listing it is what previously left an
 * R2.2 task nameless and, worse, filtered out of the infra task list
 * entirely by INFRA_PROCESS_KEYS below.
 */
const PROCESS_DISPLAY_NAMES: Record<string, string> = Object.fromEntries(
  RIP_PHASES.filter((p) => p.processDefinitionKey).map((p) => [
    p.processDefinitionKey as string,
    `RIP ${p.code} — ${p.name}`,
  ])
);

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
