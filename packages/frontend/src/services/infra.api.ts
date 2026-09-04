/**
 * Infra-board — live data layer.
 *
 * Thin React hooks over the EXISTING `businessApi` (services/api.ts). Nothing
 * new on the backend — these are the same endpoints the caseworker dashboard
 * and RipFase1WipViewer already call, so test-infra-flevoland's running
 * RipR21Process tasks/instances flow straight in.
 */

import { createContext, useContext, useEffect, useState } from 'react';
import { businessApi } from './api';
import type { Task, ActivityHistoryItem, PhaseSwimlaneModel } from '@ronl/shared';
import type { StatusKey } from '../pages/infra-board/rip-model';
import { RIP_PHASES } from '../pages/infra-board/rip-phases.catalog';

export interface RipPhaseInstance {
  id: string;
  /** Identifies the project's journey across phases, not just this instance:
   *  the originating R2.1 run mints it and every later phase inherits it. */
  businessKey: string | null;
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
  businessKey: string | null;
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
 * Running instances across every modelled phase, tagged with the phase each
 * row belongs to.
 *
 * One phase failing does not blank the others — the portfolio showing R2.1's
 * projects is strictly better than showing none because R2.2's request timed
 * out. That property now lives entirely on the backend: GET
 * /v1/rip/phases/active fans out to every modelled phase itself
 * (rip.routes.ts), omits a phase that rejects, tags every surviving row with
 * `phaseCode` and only answers non-2xx when every phase failed. This used to
 * be twelve requests issued from here, one per phase, each wrapped in its own
 * `.catch` to keep a single failure from rejecting the whole `Promise.all` —
 * see rip.routes.test.ts's "omits a failing phase rather than blanking the
 * rest of the aggregate" for the property's new home. The rows the backend
 * returns are already `RipPhaseInstanceRow`s, so nothing here reshapes them.
 */
async function fetchActiveAcrossPhases(): Promise<{
  success: boolean;
  data?: RipPhaseInstanceRow[];
}> {
  return businessApi.rip.phasesActive();
}

/**
 * The actual fetch behind `useRipActiveAcrossPhases`, exposed only so
 * `RipActiveAcrossPhasesProvider` can run it once and publish the result via
 * `RipActiveAcrossPhasesContext` — not meant to be called directly by a
 * component, which is why it lives here rather than being exported as a
 * second public hook name.
 */
export const useRipActiveAcrossPhasesResource = () =>
  useAsync<RipPhaseInstanceRow[]>(fetchActiveAcrossPhases, []);

/** Context backing `useRipActiveAcrossPhases` — see
 *  `RipActiveAcrossPhasesProvider` (components/InfraBoardDashboard) for the
 *  component that populates it. */
export const RipActiveAcrossPhasesContext = createContext<AsyncState<RipPhaseInstanceRow[]> | null>(
  null
);

/**
 * Running instances portfolio-wide, across every deployed phase.
 *
 * Reads a single shared fetch out of `RipActiveAcrossPhasesContext` rather
 * than triggering its own request: Portfolio, InfraCommandPalette,
 * ProjectDetail and the Infra-board page root all called this hook
 * independently, and since `useAsync` has no cache or dedup that meant four
 * separate requests for the same data on every render of the board.
 * `RipActiveAcrossPhasesProvider`, mounted once at the Infra-board root,
 * fetches once and every one of those four now reads the same result here.
 *
 * Called with no provider in scope, this throws rather than silently falling
 * back to its own fetch — the same choice `usePaData` makes in
 * `PaDataProvider.tsx`. Every real consumer today is inside the provider (see
 * `RipActiveAcrossPhasesProvider`'s own comment for how that was checked:
 * Portfolio/ProjectDetail only ever render via `InfraSectionRouter`, which
 * only `InfraBoardDashboard` imports, and `InfraCommandPalette` is mounted
 * directly by it too), so a call outside the provider is a wiring mistake —
 * a new consumer added somewhere else in the tree — worth failing loudly on
 * immediately rather than quietly reintroducing the fan-out this hook exists
 * to remove.
 */
export const useRipActiveAcrossPhases = (): AsyncState<RipPhaseInstanceRow[]> => {
  const ctx = useContext(RipActiveAcrossPhasesContext);
  if (!ctx) {
    throw new Error('useRipActiveAcrossPhases must be used inside RipActiveAcrossPhasesProvider');
  }
  return ctx;
};

/** A project that finished the preceding phase and can start this one. */
export interface RipPhaseCandidate {
  /** The completed predecessor instance this candidate came from. */
  instanceId: string;
  businessKey: string | null;
  projectNumber: string;
  projectName: string;
  endTime: string;
}

export interface RipPhaseReadiness {
  candidates: RipPhaseCandidate[];
  loading: boolean;
  error: boolean;
  reload: () => void;
}

/**
 * Projects whose completed predecessor-phase instance makes them ready to
 * start `phaseCode`, minus those already started.
 *
 * "Already started" is decided on businessKey rather than project number: the
 * key travels with the project from its originating R2.1 run, so an instance
 * of this phase carrying it is proof the project is past this rung. A
 * candidate whose predecessor has no businessKey at all (an instance started
 * before the convention, or by hand) is kept rather than dropped -- offering
 * a duplicate start is recoverable, silently hiding a project is not.
 */
export function useRipPhaseReadiness(
  phaseCode: string | null,
  predecessorCode: string | null
): RipPhaseReadiness {
  const completed = useRipPhaseCompleted(predecessorCode);
  const active = useRipPhaseActive(phaseCode);
  const started = useRipPhaseCompleted(phaseCode);

  const taken = new Set(
    [...(active.data ?? []), ...(started.data ?? [])]
      .map((i) => i.businessKey)
      .filter((k): k is string => !!k)
  );

  const candidates = (completed.data ?? [])
    .filter((i) => !(i.businessKey && taken.has(i.businessKey)))
    .map((i) => ({
      instanceId: i.id,
      businessKey: i.businessKey,
      projectNumber: i.projectNumber,
      projectName: i.projectName,
      endTime: i.endTime,
    }));

  return {
    candidates,
    loading: completed.loading || active.loading || started.loading,
    error: completed.error || active.error || started.error,
    reload: () => {
      completed.reload();
      active.reload();
      started.reload();
    },
  };
}

/**
 * A defined, neutral model for the null-code branch below -- it exists ONLY
 * to land that branch's fetch in `useAsync`'s SUCCESS path (`data !==
 * undefined`), the same trick every sibling null-skippable hook above plays
 * with `[]`/`{}`. Its `phaseCode` is `''`, a value no real phase code is ever
 * equal to -- that is what makes it structurally unable to leak through
 * `usePhaseSwimlane`'s `matches` check below and be rendered as if it were a
 * real phase's model. Frozen (including its arrays) because it is a shared
 * singleton stored, by reference, into every null-state hook instance --
 * freezing removes the whole class of "something mutated the shared empty
 * model" bug rather than relying on nothing ever doing so.
 */
const EMPTY_SWIMLANE = Object.freeze({
  phaseCode: '',
  lanes: Object.freeze([]),
  nodes: Object.freeze([]),
  edges: Object.freeze([]),
}) as unknown as PhaseSwimlaneModel;

/**
 * Swimlane model for one RIP phase. Pass null to skip the request -- e.g.
 * while nothing is selected yet.
 *
 * The null-code fetch resolves to `EMPTY_SWIMLANE`, a genuinely defined
 * value, so `useAsync` treats it as a normal success -- its `error` state is
 * never set for that branch at all.
 *
 * A first fix stopped there, overriding only `data` back to `null` whenever
 * `phaseCode` was null and passing `loading`/`error` through unmodified. That
 * fixed the *error* leak (see the note on the earlier, whole-object-override
 * version below) but left a second, structurally identical leak in `data`:
 * `asyncState.data` carries no indication of which phase it is FOR, so
 * keying the override on `phaseCode` alone cannot tell "the model we were
 * just given" from "leftover data from whatever the code used to be". On the
 * render where `phaseCode` first becomes real, `asyncState.data` is still
 * whatever the null branch last resolved to (`EMPTY_SWIMLANE`) -- or, real
 * code A -> real code B, still A's model -- and that first-fix override,
 * keying only on the new `phaseCode`, let it straight through: one committed
 * render reporting `{ data: EMPTY_SWIMLANE, loading: false, error: false }`,
 * or A's model under B's code. Read literally that is a *complete-looking*
 * model for a phase nothing was fetched for -- worse than the error leak it
 * replaced, since a consumer's ordinary `!loading && !error` check would
 * accept it as legitimate content.
 *
 * The fix: `PhaseSwimlaneModel` already carries `phaseCode`, so the data can
 * answer "am I for the code currently being asked about?" directly, without
 * inferring it from `phaseCode` alone. `matches` is that direct check.
 *  - `data: matches ? asyncState.data : null` -- a mismatched or absent model
 *    (including `EMPTY_SWIMLANE`, whose `phaseCode` can never equal a real
 *    code) is reported as `null`, never rendered.
 *  - `loading` is widened to also be true whenever a real code is requested
 *    but its data has not arrived yet (and nothing has errored): without
 *    this, that same render would read `{ data: null, loading: false, error:
 *    false }` -- "settled, no model" -- which would flash a not-modelled /
 *    empty-state panel for a phase that is simply still in flight. The `&&
 *    !asyncState.error` guard stops a failed fetch from being reported as
 *    perpetually loading.
 *
 * A side effect, deliberately kept: this also prevents a real-code-A ->
 * real-code-B transition from briefly showing A's model while B's fetch is
 * still in flight, since A's model no longer matches B's code either. That
 * staleness would otherwise be ordinary, pre-existing `useAsync` behaviour
 * (every other hook built on it has the same gap), not a regression this fix
 * was required to close -- but it is a genuine improvement available here for
 * free, because this hook alone has data that can identify itself.
 *
 * An earlier version overrode the *whole* returned object whenever
 * `phaseCode` was null, resolving the null branch to `{ success: true, data:
 * undefined }` -- which *does* land in `useAsync`'s error branch internally.
 * That internal `error: true` was invisible only for as long as `phaseCode`
 * stayed null; on the transition to a real code it was NOT masked or
 * harmless -- it leaked. The render that processes the new prop stopped
 * overriding (since `phaseCode` was now truthy) and returned `useAsync`'s raw
 * state directly, one render before the re-triggered effect (deps
 * `[phaseCode, tick]`) got to run its own `setError(false)`. So every null ->
 * real-code transition deterministically produced one committed render
 * reporting `{ data: null, loading: false, error: true }` before
 * self-correcting -- a real, visible spurious error a consumer keyed on
 * `error` (a toast, a boundary) could act on.
 *
 * See the transition tests in infra.api.test.ts for both leaks, pinned per
 * committed render rather than only at the settled end state.
 */
export const usePhaseSwimlane = (phaseCode: string | null): AsyncState<PhaseSwimlaneModel> => {
  const asyncState = useAsync<PhaseSwimlaneModel>(
    () =>
      phaseCode
        ? businessApi.rip.phaseModel(phaseCode)
        : Promise.resolve({ success: true, data: EMPTY_SWIMLANE }),
    [phaseCode]
  );
  const matches = !!phaseCode && asyncState.data?.phaseCode === phaseCode;
  return {
    ...asyncState,
    data: matches ? asyncState.data : null,
    loading: asyncState.loading || (!!phaseCode && !matches && !asyncState.error),
  };
};

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
