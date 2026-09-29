import type { NodeKind, PhaseSwimlaneModel, SwimLane, SwimNode } from '@ronl/shared';
import type { ProcessContext } from './processContext';

/**
 * The derivations behind "Processtappen per rol": which steps ran, in which
 * lane, what comes next, and how consecutive lanes hand over to each other.
 * Pure, so the rules the design depends on are tested here and the
 * components only render.
 */

/** Colour and chip text per lane. The three Awb lanes are known; any other lane gets a neutral colour. */
export const LANE_COLOURS: Record<string, { short: string; colour: string }> = {
  Lane_Aanvrager: { short: 'AANV', colour: '#7a5af0' },
  Lane_Behandelaar: { short: 'BEH', colour: '#0046ad' },
  Lane_Systeem: { short: 'SYS', colour: '#6b7280' },
};
// #64707f: white chip text on it clears WCAG AA (5.0:1); a lighter grey did not.
const NEUTRAL_LANE = '#64707f';

export function laneMeta(lane: SwimLane): { short: string; colour: string } {
  return (
    LANE_COLOURS[lane.key] ?? {
      short: lane.label.slice(0, 4).toUpperCase(),
      colour: NEUTRAL_LANE,
    }
  );
}

/**
 * The lanes the user works in: those whose user tasks' candidate groups meet
 * the user's realm roles. BPMN candidate groups are realm role names on this
 * platform -- the task list filters by them the same way.
 */
export function myLaneKeys(model: PhaseSwimlaneModel, roles: readonly string[]): Set<string> {
  return new Set(
    model.lanes
      .filter((l) => (l.candidateGroups ?? []).some((g) => roles.includes(g)))
      .map((l) => l.key)
  );
}

/** Step-type tags, the vocabulary the flat step list already uses. */
export const KIND_TAG: Partial<Record<NodeKind, string>> = {
  task: 'GEBRUIKERSTAAK',
  service: 'SERVICETAAK',
  script: 'SCRIPT',
  rule: 'BESLISSING',
  gateway: 'KEUZE',
  parallel: 'KEUZE',
  call: 'CALLACTIVITY',
};

export type StepState = 'done' | 'running' | 'next';

export interface TrailStep {
  processKey: string;
  nodeId: string;
  label: string;
  kind: NodeKind;
  laneKey: string;
  state: StepState;
  start?: string;
  end?: string | null;
  /** A gateway's taken branch. */
  outcome?: string;
  /** A "Hierna" gateway's branch labels: the branch is not known yet. */
  branches?: string[];
  dmn?: string;
  doc?: string;
  /** The task's own running step. */
  isMine: boolean;
  /** Finished by cancellation (a boundary event, an interrupted flow), not completed. */
  canceled?: boolean;
}

export interface LaneGroup {
  processKey: string;
  laneKey: string;
  steps: TrailStep[];
  /** Every step is still to come. */
  future: boolean;
  /** Runs in a called process, not the top of the chain. */
  sub: boolean;
}

const isGateway = (n: SwimNode) => n.kind === 'gateway' || n.kind === 'parallel';

function stepOf(
  model: PhaseSwimlaneModel,
  processKey: string,
  node: SwimNode,
  state: StepState
): TrailStep {
  return {
    processKey,
    nodeId: node.id,
    label: node.label,
    kind: node.kind,
    laneKey: model.lanes[node.row]?.key ?? '',
    state,
    ...(node.dmn ? { dmn: node.dmn } : {}),
    ...(node.docs?.[0] ? { doc: node.docs[0] } : {}),
    isMine: false,
  };
}

/** How far "Hierna" looks ahead. */
const NEXT_STEPS = 3;

/**
 * "Hierna": walk forward from the task's node along the first forward edge.
 * Stop at the first gateway -- its branch depends on data not decided yet, so
 * its branches are listed rather than guessed. Leaving a called process
 * continues in its caller, after the call activity.
 */
function nextSteps(ctx: ProcessContext): TrailStep[] {
  const out: TrailStep[] = [];
  let processKey = ctx.current.processKey;
  let cur = ctx.current.nodeId;
  for (let hop = 0; hop < 12 && out.length < NEXT_STEPS; hop++) {
    const model = ctx.models[processKey];
    const edge = model?.edges.find((e) => e.from === cur && !e.back);
    const node = edge && model.nodes.find((x) => x.id === edge.to);
    if (!model || !node) break;
    if (node.kind === 'end') {
      const at = ctx.chain.findIndex((c) => c.processKey === processKey);
      const calledFrom = at > 0 ? ctx.chain[at].calledFrom : undefined;
      if (!calledFrom) break;
      processKey = ctx.chain[at - 1].processKey;
      cur = calledFrom;
      continue;
    }
    if (isGateway(node)) {
      const branches = model.edges.filter((e) => e.from === node.id).map((e) => e.label ?? '—');
      out.push({ ...stepOf(model, processKey, node, 'next'), branches });
      break;
    }
    out.push(stepOf(model, processKey, node, 'next'));
    cur = node.id;
  }
  return out;
}

/**
 * What ran, in engine order, followed by what comes next. Start and end
 * events are left out, and so is an entry whose node its model no longer has
 * (the model is the newest deployment; the case may have run an older one).
 */
export function buildTrail(ctx: ProcessContext): TrailStep[] {
  const trail: TrailStep[] = [];
  ctx.history.forEach((entry, i) => {
    const key = entry.processDefinitionKey;
    const model = key ? ctx.models[key] : undefined;
    const node = model?.nodes.find((x) => x.id === entry.activityId);
    if (!key || !model || !node || node.kind === 'start' || node.kind === 'end') return;
    const running = !entry.endTime && !entry.canceled;
    const step: TrailStep = {
      ...stepOf(model, key, node, running ? 'running' : 'done'),
      start: entry.startTime,
      end: entry.endTime,
      isMine: running && key === ctx.current.processKey && node.id === ctx.current.nodeId,
      ...(entry.canceled ? { canceled: true } : {}),
    };
    if (isGateway(node)) {
      // The branch taken is the edge to the next entry of the SAME process:
      // a called process may have run in between.
      const next = ctx.history.slice(i + 1).find((x) => x.processDefinitionKey === key);
      const label =
        next && model.edges.find((e) => e.from === node.id && e.to === next.activityId)?.label;
      if (label) step.outcome = label;
    }
    trail.push(step);
  });
  return [...trail, ...nextSteps(ctx)];
}

/** Consecutive steps in one lane of one process form a group; a change of process always starts a new one. */
export function groupByLane(trail: TrailStep[], ctx: ProcessContext): LaneGroup[] {
  const top = ctx.chain[0]?.processKey ?? ctx.current.processKey;
  const groups: LaneGroup[] = [];
  for (const step of trail) {
    const last = groups[groups.length - 1];
    if (last && last.laneKey === step.laneKey && last.processKey === step.processKey) {
      last.steps.push(step);
    } else {
      groups.push({
        processKey: step.processKey,
        laneKey: step.laneKey,
        steps: [step],
        future: false,
        sub: step.processKey !== top,
      });
    }
  }
  for (const g of groups) g.future = g.steps.every((s) => s.state === 'next');
  return groups;
}

/** The group holding the task's own step; else the last with a running step; else the last. */
export function currentGroupIndex(groups: LaneGroup[]): number {
  const mine = groups.findIndex((g) => g.steps.some((s) => s.isMine));
  if (mine >= 0) return mine;
  for (let i = groups.length - 1; i >= 0; i--) {
    if (groups[i].steps.some((s) => s.state === 'running')) return i;
  }
  return Math.max(0, groups.length - 1);
}

/** Index of the first group to show: by default only the `keep` groups before the current one. */
export function collapseFrom(groups: LaneGroup[], expanded: boolean, keep = 2): number {
  return expanded ? 0 : Math.max(0, currentGroupIndex(groups) - keep);
}

const laneLabel = (ctx: ProcessContext, g: LaneGroup) =>
  ctx.models[g.processKey]?.lanes.find((l) => l.key === g.laneKey)?.label ?? g.laneKey;

/** The line between two groups. */
export function transitionLabel(prev: LaneGroup, g: LaneGroup, ctx: ProcessContext): string {
  if (prev.processKey !== g.processKey) {
    if (!g.sub) return `↗ terug in hoofdproces · ${laneLabel(ctx, g)}`;
    const model = ctx.models[g.processKey];
    return `↘ deelproces ${model?.processName ?? g.processKey}`;
  }
  return g.future && !prev.future ? `↓ daarna: ${laneLabel(ctx, g)}` : `↓ ${laneLabel(ctx, g)}`;
}
