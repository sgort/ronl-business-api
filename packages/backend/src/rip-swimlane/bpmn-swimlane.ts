import { XMLParser } from 'fast-xml-parser';
import type { NodeKind, PhaseSwimlaneModel, SwimLane, SwimNode } from '@ronl/shared';
import { docLabel } from './doc-label';

interface RawFlow {
  id: string;
  from: string;
  to: string;
  label: string;
}

function readFlows(process: Record<string, any>): RawFlow[] {
  return toArray(process.sequenceFlow).map((f: any) => {
    const cond = f.conditionExpression;
    const condText = typeof cond === 'string' ? cond : (cond?.['#text'] ?? '');
    return {
      id: String(f['@_id']),
      from: String(f['@_sourceRef']),
      to: String(f['@_targetRef']),
      label: String(f['@_name'] ?? condText ?? '').trim(),
    };
  });
}

/**
 * Back edges, found STRUCTURALLY rather than from columns.
 *
 * Order matters and is the whole trick: columns cannot classify an edge,
 * because a cyclic relaxation pushes both endpoints rightwards until the pass
 * cap and no edge is left pointing backwards. So detect the cycles first — a
 * depth-first walk where an edge whose target is already on the current stack
 * closes one — and layer over the remainder, which is a DAG.
 *
 * Returns the ids of the flows that close a cycle.
 */
function findBackEdges(nodes: SwimNode[], flows: RawFlow[], seeds: string[]): Set<string> {
  const outgoing = new Map<string, RawFlow[]>();
  for (const f of flows) {
    const arr = outgoing.get(f.from) ?? [];
    arr.push(f);
    outgoing.set(f.from, arr);
  }
  const back = new Set<string>();
  const state = new Map<string, 'white' | 'grey' | 'black'>();
  for (const n of nodes) state.set(n.id, 'white');

  // Iterative DFS: these graphs are small (max ~74 nodes), but an explicit
  // stack keeps it obvious that no recursion limit is in play.
  const visit = (root: string) => {
    const stack: Array<{ id: string; next: number }> = [{ id: root, next: 0 }];
    state.set(root, 'grey');
    while (stack.length) {
      const frame = stack[stack.length - 1];
      const edges = outgoing.get(frame.id) ?? [];
      if (frame.next >= edges.length) {
        state.set(frame.id, 'black');
        stack.pop();
        continue;
      }
      const f = edges[frame.next++];
      const s = state.get(f.to);
      if (s === 'grey') back.add(f.id);
      else if (s === 'white') {
        state.set(f.to, 'grey');
        stack.push({ id: f.to, next: 0 });
      }
    }
  };

  for (const seed of seeds) if (state.get(seed) === 'white') visit(seed);
  // Anything unreachable from a start event still needs classifying.
  for (const n of nodes) if (state.get(n.id) === 'white') visit(n.id);
  return back;
}

/**
 * Longest-path layering over FORWARD edges only.
 *
 * Longest path rather than shortest so a node never sits to the left of its
 * own predecessor. Because the back edges are already removed, the graph is
 * acyclic and the relaxation settles rather than spinning to the cap.
 */
function assignColumns(
  nodes: SwimNode[],
  forward: RawFlow[],
  seeds: string[]
): Map<string, number> {
  const col = new Map<string, number>(nodes.map((n) => [n.id, 0]));

  // Every node starts at 0, so a node unreachable from a seed simply stays in
  // column 0 rather than being dropped.
  if (seeds.length === 0) return col;

  // Relaxation over forward edges only. The graph is acyclic here, so this
  // settles; the pass cap is a belt-and-braces guard, not the terminator.
  let changed = true;
  let passes = 0;
  while (changed && passes < nodes.length + 1) {
    changed = false;
    passes += 1;
    for (const f of forward) {
      const from = col.get(f.from);
      const to = col.get(f.to);
      if (from === undefined || to === undefined) continue;
      if (to < from + 1) {
        col.set(f.to, from + 1);
        changed = true;
      }
    }
  }
  return col;
}

/**
 * Turn deployed BPMN into a swimlane model.
 *
 * Pure: no I/O, no Operaton, no config. That is what makes it testable
 * directly against the twelve real .bpmn files.
 *
 * The BPMN's own coordinates are read for LANE ORDER ONLY. Node positions are
 * recomputed (Task 3) so all twelve phases share one visual language instead
 * of inheriting the spacing of twelve separately hand-drawn diagrams.
 */

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  // Strip namespace prefixes so lookups are `process`/`lane`/`userTask`
  // rather than `bpmn:process`, and do not depend on which alias the
  // modeller declared. Note this also strips `ronl:` from documentRef —
  // see the attribute fallback in the node loop.
  removeNSPrefix: true,
  isArray: (name) =>
    ['lane', 'flowNodeRef', 'sequenceFlow', 'BPMNShape', 'BPMNEdge'].includes(name),
});

/**
 * Element name → node kind. This is an ALLOWLIST of flow-node element types,
 * not a fallback with a default: the node loop below only visits keys of
 * this map, so a `process` child element outside it (a `sequenceFlow`, the
 * `laneSet`, `extensionElements`, `documentation` — or a flow-node type not
 * yet added here) is omitted from the model rather than defaulted to
 * `'task'`. Everything currently deployed is covered; if a redeployed or
 * future phase introduces an element type not listed here, its id would be
 * silently dropped from `nodes` while still appearing in a lane's
 * `flowNodeRef` — see the cross-fixture invariant test in
 * bpmn-swimlane.test.ts that catches exactly that.
 */
const KINDS: Record<string, NodeKind> = {
  startEvent: 'start',
  endEvent: 'end',
  userTask: 'task',
  manualTask: 'task',
  scriptTask: 'task',
  businessRuleTask: 'task',
  receiveTask: 'task',
  callActivity: 'task',
  subProcess: 'task',
  // No dedicated NodeKind exists for an intermediate event (they render as
  // circles, distinct from both a task box and a start/end circle). 'task'
  // is the least misleading of the existing kinds: unlike 'start'/'end' it
  // does not claim this is a process boundary, and it still renders with
  // the node's own label instead of disappearing.
  intermediateCatchEvent: 'task',
  intermediateThrowEvent: 'task',
  serviceTask: 'service',
  sendTask: 'service',
  exclusiveGateway: 'gateway',
  inclusiveGateway: 'gateway',
  eventBasedGateway: 'gateway',
  parallelGateway: 'parallel',
};

function toArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

/** Read every BPMNShape's bpmnElement → y, for lane ordering. */
function readShapes(definitions: Record<string, any>): Map<string, { y: number }> {
  const out = new Map<string, { y: number }>();
  const diagrams = toArray(definitions.BPMNDiagram);
  for (const d of diagrams) {
    for (const plane of toArray(d?.BPMNPlane)) {
      for (const shape of toArray(plane?.BPMNShape)) {
        const el = shape?.['@_bpmnElement'];
        const y = Number(shape?.Bounds?.['@_y'] ?? 0);
        if (typeof el === 'string') out.set(el, { y });
      }
    }
  }
  return out;
}

export function parseSwimlane(xml: string, phaseCode: string): PhaseSwimlaneModel {
  const doc = parser.parse(xml);
  const definitions = doc.definitions ?? {};
  const process = toArray(definitions.process)[0] ?? {};
  const shapes = readShapes(definitions);

  // ── lanes, ordered by their drawn y ──────────────────────────────────────
  const laneSet = toArray(process.laneSet)[0] ?? {};
  const rawLanes = toArray(laneSet.lane);
  const lanes: SwimLane[] = rawLanes
    .map((l: any) => ({
      key: String(l['@_id']),
      label: String(l['@_name'] ?? l['@_id']),
      y: shapes.get(String(l['@_id']))?.y ?? 0,
    }))
    .sort((a, b) => a.y - b.y)
    .map(({ key, label }) => ({ key, label }));

  const rowOf = new Map<string, number>();
  rawLanes.forEach((l: any) => {
    const laneId = String(l['@_id']);
    const row = lanes.findIndex((x) => x.key === laneId);
    for (const ref of toArray(l.flowNodeRef)) {
      // fast-xml-parser gives a bare string for a text-only element.
      rowOf.set(String(typeof ref === 'object' ? ref['#text'] : ref).trim(), row);
    }
  });

  // ── nodes ────────────────────────────────────────────────────────────────
  const nodes: SwimNode[] = [];
  for (const [elementName, kind] of Object.entries(KINDS)) {
    for (const el of toArray(process[elementName])) {
      const id = String(el['@_id']);
      const ref = el['@_ronl:documentRef'] ?? el['@_documentRef'];
      nodes.push({
        id,
        bpmnId: id,
        kind,
        label: String(el['@_name'] ?? id),
        row: rowOf.get(id) ?? 0,
        col: 0, // filled in by layering
        ...(ref ? { doc: docLabel(String(ref)) } : {}),
      });
    }
  }

  const flows = readFlows(process);

  const starts = nodes.filter((n) => n.kind === 'start').map((n) => n.id);
  const seeds = starts.length > 0 ? starts : nodes.slice(0, 1).map((n) => n.id);

  // Classify first, layer second. Doing it the other way round cannot work:
  // see findBackEdges.
  const backIds = findBackEdges(nodes, flows, seeds);
  const col = assignColumns(
    nodes,
    flows.filter((f) => !backIds.has(f.id)),
    seeds
  );
  for (const n of nodes) n.col = col.get(n.id) ?? 0;

  const edges = flows.map((f) => ({
    from: f.from,
    to: f.to,
    ...(f.label ? { label: f.label } : {}),
    ...(backIds.has(f.id) ? { back: true } : {}),
  }));

  return { phaseCode, lanes, nodes, edges };
}
