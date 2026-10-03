import type {
  ActivityHistoryItem,
  PhaseSet,
  PhaseSwimlaneModel,
  ProcessLineage,
} from '@ronl/shared';
import { nodeStatusFromHistory, type StatusKey } from '../../pages/infra-board/rip-model';

/**
 * Everything the caseworker procesweergave draws for one task: the models of
 * every process in its call chain, the history of every instance involved
 * merged into one engine-ordered list, and a node status per process.
 */
export interface ProcessContext {
  /** Swimlane model per process key (a key whose fetch failed is absent). */
  models: Record<string, PhaseSwimlaneModel>;
  /** Every entry of every instance involved, in ascending startTime. */
  history: ActivityHistoryItem[];
  /** nodeStatusFromHistory per process key, over that key's entries only. */
  statusByProcess: Record<string, Record<string, StatusKey>>;
  current: { processKey: string; nodeId: string };
  /** The task's own node's phase code, when its BPMN carries markers. */
  phase: string | null;
  /** The phases `phase` belongs to: from the model that placed the node, which may be a caller's. */
  phaseSet: PhaseSet | null;
  /** The call chain, top-most first; a called instance names the call activity it came from. */
  chain: Array<{ instanceId: string; processKey: string; calledFrom?: string }>;
  /** Whether the task's own process has lanes; without them the flat list stays. */
  hasLanes: boolean;
}

export interface ProcessContextInput {
  task: { processInstanceId: string; taskDefinitionKey: string };
  /** The task's own instance first, then each calling instance upwards. */
  lineages: ProcessLineage[];
  /** Activity history per instance id: the chain plus any finished children. */
  histories: Record<string, ActivityHistoryItem[]>;
  /** Swimlane model per process key. */
  models: Record<string, PhaseSwimlaneModel>;
}

const byStartTime = (entries: ActivityHistoryItem[]) =>
  entries
    .map((entry, i) => ({ entry, i, t: Date.parse(entry.startTime) }))
    .sort((a, b) => a.t - b.t || a.i - b.i)
    .map(({ entry }) => entry);

/**
 * One engine-ordered list across the instances of a call chain.
 *
 * Time alone cannot order it: Operaton runs a call activity, its child's start
 * event and the child's first automated steps in ONE transaction, often in the
 * same millisecond, and the child's end and the parent's next step likewise.
 * So each instance's own entries are ordered by time, and a child's entries
 * are spliced in directly after the call activity that started it. Instances
 * no call activity names (the top of the chain, or a run whose caller was not
 * loaded) are roots, taken in order of their first entry.
 */
function mergeHistories(histories: Record<string, ActivityHistoryItem[]>): ActivityHistoryItem[] {
  const called = new Set(
    Object.values(histories)
      .flat()
      .map((e) => e.calledProcessInstanceId)
      .filter((id): id is string => !!id && id in histories)
  );
  const firstStart = (id: string) =>
    Math.min(...histories[id].map((e) => Date.parse(e.startTime)), Number.POSITIVE_INFINITY);
  const roots = Object.keys(histories)
    .filter((id) => !called.has(id))
    .sort((a, b) => firstStart(a) - firstStart(b));

  const out: ActivityHistoryItem[] = [];
  const seen = new Set<string>();
  const emit = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    for (const entry of byStartTime(histories[id])) {
      out.push(entry);
      const child = entry.calledProcessInstanceId;
      if (child && child in histories) emit(child);
    }
  };
  roots.forEach(emit);
  // A cycle of instances naming each other has no root; never drop entries.
  Object.keys(histories).forEach(emit);
  return out;
}

/**
 * The task node's phase, or -- when its process carries no markers or its
 * model did not load -- the phase of the call activity that started it,
 * walking up the chain. A subprocess sits wholly inside its caller's phase.
 * The set comes with it, from the same model, so the stepper always shows
 * the phases the code belongs to.
 */
function phaseOf(
  chain: ProcessContext['chain'],
  models: Record<string, PhaseSwimlaneModel>,
  nodeId: string
): Pick<ProcessContext, 'phase' | 'phaseSet'> {
  let id: string | undefined = nodeId;
  for (let i = chain.length - 1; i >= 0 && id; i--) {
    const model = models[chain[i].processKey];
    const phase = model?.nodes.find((n) => n.id === id)?.phase;
    if (phase && model.phaseSet) return { phase, phaseSet: model.phaseSet };
    id = chain[i].calledFrom;
  }
  return { phase: null, phaseSet: null };
}

/**
 * Pure assembly of a ProcessContext from what useTaskProcessContext fetched.
 *
 * Entries come in engine order (see mergeHistories), which is also what
 * nodeStatusFromHistory needs: when a subprocess ran twice, its later run is
 * processed last and wins. Instances contribute to the status of the process
 * they ran in, taken from each entry's own processDefinitionKey.
 */
export function buildProcessContext(input: ProcessContextInput): ProcessContext {
  const { task, lineages, histories, models } = input;

  const history = mergeHistories(histories);

  const byProcess = new Map<string, ActivityHistoryItem[]>();
  for (const entry of history) {
    const key = entry.processDefinitionKey;
    if (!key) continue;
    byProcess.set(key, [...(byProcess.get(key) ?? []), entry]);
  }
  const statusByProcess: ProcessContext['statusByProcess'] = {};
  for (const [key, entries] of byProcess) statusByProcess[key] = nodeStatusFromHistory(entries);

  // Top-most first. A called instance is found in its caller's history as the
  // call activity whose calledProcessInstanceId names it.
  const chain: ProcessContext['chain'] = [...lineages].reverse().map((l, i, top) => {
    const caller = i > 0 ? top[i - 1] : undefined;
    const call = caller
      ? (histories[caller.processInstanceId] ?? []).find(
          (e) => e.calledProcessInstanceId === l.processInstanceId
        )
      : undefined;
    return {
      instanceId: l.processInstanceId,
      processKey: l.processDefinitionKey,
      ...(call ? { calledFrom: call.activityId } : {}),
    };
  });

  const processKey = lineages[0].processDefinitionKey;
  const own = models[processKey];
  const nodeId = task.taskDefinitionKey;
  return {
    models,
    history,
    statusByProcess,
    current: { processKey, nodeId },
    ...phaseOf(chain, models, nodeId),
    chain,
    hasLanes: (own?.lanes.length ?? 0) > 0,
  };
}
