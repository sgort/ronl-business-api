import type { PhaseSwimlaneModel, SwimEdge, SwimNode, Task } from '@ronl/shared';
import type { StatusKey } from './status';

/**
 * What the shared process view derives from data, as pure functions: the
 * marks on open tasks, which labels are only element ids, what kind of
 * gateway a node is, and which legend entries the diagram needs. Kept apart
 * from the components so each rule is tested on its own.
 */

export type NodeMark = 'mine' | 'claimed' | 'open';
export type GatewayKind = 'decision' | 'merge' | 'split' | 'join';

/** Who is looking: `userId` is the Keycloak `sub`, the form `task.assignee` uses. */
export interface Viewer {
  userId: string | null;
  roles: readonly string[];
}

export type ProcessTask = Pick<Task, 'taskDefinitionKey' | 'assignee'>;

export type LegendKey =
  'done' | 'active' | 'mine' | 'claimed' | 'role' | 'auto' | 'decision' | 'parallel' | 'todo';

export interface LegendEntry {
  key: LegendKey;
  label: string;
}

const RANK: Record<NodeMark, number> = { open: 0, claimed: 1, mine: 2 };

/** One mark per node with an open task; several tasks on one node keep the strongest. */
export function nodeMarks(
  model: PhaseSwimlaneModel,
  tasks: readonly ProcessTask[],
  viewer: Viewer
): Map<string, NodeMark> {
  const ids = new Set(model.nodes.map((n) => n.id));
  const marks = new Map<string, NodeMark>();
  for (const t of tasks) {
    if (!ids.has(t.taskDefinitionKey)) continue;
    const mark: NodeMark = !t.assignee
      ? 'open'
      : viewer.userId !== null && t.assignee === viewer.userId
        ? 'mine'
        : 'claimed';
    const prev = marks.get(t.taskDefinitionKey);
    if (!prev || RANK[mark] > RANK[prev]) marks.set(t.taskDefinitionKey, mark);
  }
  return marks;
}

/** The parser labels an unnamed element with its id; such a label says nothing to a reader. */
export function isIdLabel(node: SwimNode): boolean {
  const label = node.label.trim();
  return label === node.id || label === node.bpmnId;
}

/** Decision, merge, split or join, from the gateway's kind and its edge counts; null for other nodes. */
export function gatewayKind(node: SwimNode, edges: readonly SwimEdge[]): GatewayKind | null {
  if (node.kind !== 'gateway' && node.kind !== 'parallel') return null;
  const outgoing = edges.filter((e) => e.from === node.id).length;
  const incoming = edges.filter((e) => e.to === node.id).length;
  if (node.kind === 'parallel') return outgoing >= 2 || incoming < 2 ? 'split' : 'join';
  return outgoing >= 2 ? 'decision' : 'merge';
}

const AUTO_KINDS = new Set<SwimNode['kind']>(['script', 'rule', 'service']);
const FLOW_KINDS = new Set<SwimNode['kind']>(['start', 'end', 'gateway', 'parallel']);

/** The legend entries this diagram needs, in a fixed order; an entry only when the diagram shows it. */
export function legendEntries(input: {
  model: PhaseSwimlaneModel;
  statusById: Record<string, StatusKey>;
  marks: ReadonlyMap<string, NodeMark>;
  myLanes: ReadonlySet<string>;
  roles: readonly string[];
}): LegendEntry[] {
  const { model, statusById, marks, myLanes, roles } = input;
  const steps = model.nodes.filter((n) => !FLOW_KINDS.has(n.kind));
  const status = (id: string): StatusKey => statusById[id] ?? 'todo';
  const markValues = new Set(marks.values());
  const groups = [
    ...new Set(
      model.lanes
        .filter((l) => myLanes.has(l.key))
        .flatMap((l) => (l.candidateGroups ?? []).filter((g) => roles.includes(g)))
    ),
  ];

  const entries: LegendEntry[] = [];
  if (steps.some((n) => status(n.id) === 'done')) entries.push({ key: 'done', label: 'Afgerond' });
  if (steps.some((n) => status(n.id) === 'active')) entries.push({ key: 'active', label: 'Loopt' });
  if (markValues.has('mine')) entries.push({ key: 'mine', label: 'Jouw taak' });
  if (markValues.has('claimed')) entries.push({ key: 'claimed', label: 'Geclaimd' });
  if (myLanes.size > 0) {
    entries.push({
      key: 'role',
      label: groups.length > 0 ? `Jouw rol (${groups.join(', ')})` : 'Jouw rol',
    });
  }
  if (model.nodes.some((n) => AUTO_KINDS.has(n.kind))) {
    entries.push({ key: 'auto', label: 'Automatisch (script / DMN)' });
  }
  if (steps.some((n) => status(n.id) === 'todo')) {
    entries.push({ key: 'todo', label: 'Nog niet / niet doorlopen' });
  }
  return entries;
}
