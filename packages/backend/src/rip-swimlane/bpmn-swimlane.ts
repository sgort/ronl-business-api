import { XMLParser } from 'fast-xml-parser';
import type { NodeKind, PhaseSwimlaneModel, SwimLane, SwimNode } from '@ronl/shared';
import { docLabel } from './doc-label';

interface RawFlow {
  id: string;
  from: string;
  to: string;
  label: string;
}

/**
 * What fast-xml-parser hands back: an untyped tree of bags. An element is a
 * record of `@_`-prefixed attributes, child elements, and `#text` for its text
 * content, and any value may be a node, a bare string, or an array of either.
 *
 * Typed as `unknown` rather than `any` so every read below has to say how it
 * narrows. That is not ceremony here: the whole file's job is to believe a
 * document it did not write, and `any` would let a malformed one produce a
 * confidently wrong model instead of a compile error.
 */
type XmlNode = Record<string, unknown>;

const isNode = (v: unknown): v is XmlNode => typeof v === 'object' && v !== null;

/**
 * Children of `parent` under `name`. fast-xml-parser gives a bare value for a
 * single occurrence and an array for repeats; anything that is not an element
 * is dropped rather than coerced into one.
 */
function childNodes(parent: XmlNode, name: string): XmlNode[] {
  return toArray(parent[name]).filter(isNode);
}

/**
 * Text of a child that fast-xml-parser may give either way: a bare string for
 * a text-only element, or a node carrying `#text` when the element also has
 * attributes.
 */
function textOf(v: unknown): string {
  return (isNode(v) ? String(v['#text'] ?? '') : String(v ?? '')).trim();
}

function readFlows(process: XmlNode): RawFlow[] {
  return childNodes(process, 'sequenceFlow').map((f) => {
    const cond = f.conditionExpression;
    const condText = textOf(cond);
    return {
      id: String(f['@_id']),
      from: String(f['@_sourceRef']),
      to: String(f['@_targetRef']),
      // condText is always a string (never nullish — see its own `?? ''`
      // above), so a trailing `?? ''` here could never fire.
      label: String(f['@_name'] ?? condText).trim(),
    };
  });
}

/**
 * Each flow-node element declares its own outgoing branch order via
 * repeated <bpmn:outgoing> children — the order BPMN tooling itself uses,
 * and not necessarily the order its <bpmn:sequenceFlow> siblings happen to
 * appear in the flat process body (that position is free for a modeller or
 * formatter to reorder without changing the diagram's meaning). findBackEdges
 * walks each node's branches in THIS declared order, so which edge closes a
 * cycle matches the diagram's own branch order rather than an accident of
 * where each sequenceFlow was typed in the file.
 */
function readOutgoingOrder(process: XmlNode): Map<string, string[]> {
  const order = new Map<string, string[]>();
  for (const elementName of Object.keys(KINDS)) {
    for (const el of childNodes(process, elementName)) {
      // Every flow node has an `@_id` (required by BPMN, and already assumed
      // unguarded elsewhere in this file — see the node-building loop below).
      const declared = toArray(el.outgoing).map(textOf);
      if (declared.length > 0) order.set(String(el['@_id']), declared);
    }
  }
  return order;
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
function findBackEdges(
  nodes: SwimNode[],
  flows: RawFlow[],
  seeds: string[],
  declaredOrder: Map<string, string[]>
): Set<string> {
  const byId = new Map<string, RawFlow>();
  const grouped = new Map<string, RawFlow[]>();
  for (const f of flows) {
    byId.set(f.id, f);
    const arr = grouped.get(f.from) ?? [];
    arr.push(f);
    grouped.set(f.from, arr);
  }

  // Reorder each node's outgoing flows to match its own declared
  // <bpmn:outgoing> order. A flow that declaration omits — malformed input,
  // since real BPMN tooling keeps both in sync — is not dropped: it is
  // still traversed, appended after the declared ones in the flat list's
  // original order.
  const outgoing = new Map<string, RawFlow[]>();
  for (const [from, group] of grouped) {
    const declared = declaredOrder.get(from) ?? [];
    const seen = new Set<string>();
    const ordered: RawFlow[] = [];
    for (const flowId of declared) {
      const f = byId.get(flowId);
      if (f && f.from === from && !seen.has(flowId)) {
        ordered.push(f);
        seen.add(flowId);
      }
    }
    for (const f of group) {
      if (!seen.has(f.id)) {
        ordered.push(f);
        seen.add(f.id);
      }
    }
    outgoing.set(from, ordered);
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
 * Longest-path layering over FORWARD edges only. Mutates each node's `col`
 * in place — callers rely on nodes already carrying `col: 0` from their
 * construction, so there is no separate id→column map to fall back through
 * on a lookup miss; every id this function's own `byId` is built from is a
 * real node's id by construction.
 *
 * Longest path rather than shortest so a node never sits to the left of its
 * own predecessor. Because the back edges are already removed, the graph is
 * acyclic and the relaxation settles rather than spinning to the cap.
 */
function assignColumns(nodes: SwimNode[], forward: RawFlow[], seeds: string[]): void {
  // Every node starts at col 0 already, so a node unreachable from a seed
  // simply stays there rather than being dropped.
  if (seeds.length === 0) return;

  const byId = new Map<string, SwimNode>(nodes.map((n) => [n.id, n]));

  // Relaxation over forward edges only. The graph is acyclic here, so this
  // settles; the pass cap is a belt-and-braces guard, not the terminator.
  let changed = true;
  let passes = 0;
  while (changed && passes < nodes.length + 1) {
    changed = false;
    passes += 1;
    for (const f of forward) {
      const from = byId.get(f.from);
      const to = byId.get(f.to);
      if (from === undefined || to === undefined) continue;
      if (to.col < from.col + 1) {
        to.col = from.col + 1;
        changed = true;
      }
    }
  }
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
function readShapes(definitions: XmlNode): Map<string, { y: number }> {
  const out = new Map<string, { y: number }>();
  for (const d of childNodes(definitions, 'BPMNDiagram')) {
    for (const plane of childNodes(d, 'BPMNPlane')) {
      for (const shape of childNodes(plane, 'BPMNShape')) {
        const el = shape['@_bpmnElement'];
        const bounds = shape.Bounds;
        const y = Number((isNode(bounds) ? bounds['@_y'] : undefined) ?? 0);
        if (typeof el === 'string') out.set(el, { y });
      }
    }
  }
  return out;
}

export function parseSwimlane(xml: string, phaseCode: string): PhaseSwimlaneModel {
  // parser.parse is typed `any` by the library, so it is narrowed here at the
  // single point it enters — everything downstream reads through XmlNode.
  const doc = parser.parse(xml) as XmlNode;
  const definitions = isNode(doc.definitions) ? doc.definitions : {};
  const process = childNodes(definitions, 'process')[0] ?? {};
  const shapes = readShapes(definitions);

  // ── lanes, ordered by their drawn y ──────────────────────────────────────
  const laneSet = childNodes(process, 'laneSet')[0] ?? {};
  const rawLanes = childNodes(laneSet, 'lane');
  const lanes: SwimLane[] = rawLanes
    .map((l) => ({
      key: String(l['@_id']),
      label: String(l['@_name'] ?? l['@_id']),
      y: shapes.get(String(l['@_id']))?.y ?? 0,
    }))
    .sort((a, b) => a.y - b.y)
    .map(({ key, label }) => ({ key, label }));

  const rowOf = new Map<string, number>();
  rawLanes.forEach((l) => {
    const laneId = String(l['@_id']);
    const row = lanes.findIndex((x) => x.key === laneId);
    for (const ref of toArray(l.flowNodeRef)) {
      rowOf.set(textOf(ref), row);
    }
  });

  // ── nodes ────────────────────────────────────────────────────────────────
  const nodes: SwimNode[] = [];
  for (const [elementName, kind] of Object.entries(KINDS)) {
    for (const el of childNodes(process, elementName)) {
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
  const declaredOrder = readOutgoingOrder(process);

  const starts = nodes.filter((n) => n.kind === 'start').map((n) => n.id);
  const seeds = starts.length > 0 ? starts : nodes.slice(0, 1).map((n) => n.id);

  // Classify first, layer second. Doing it the other way round cannot work:
  // see findBackEdges.
  const backIds = findBackEdges(nodes, flows, seeds, declaredOrder);
  assignColumns(
    nodes,
    flows.filter((f) => !backIds.has(f.id)),
    seeds
  );

  const edges = flows.map((f) => ({
    from: f.from,
    to: f.to,
    ...(f.label ? { label: f.label } : {}),
    ...(backIds.has(f.id) ? { back: true } : {}),
  }));

  return { phaseCode, lanes, nodes, edges };
}
