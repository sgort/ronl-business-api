import { XMLParser } from 'fast-xml-parser';
import type { NodeKind, PhaseSwimlaneModel, SwimLane, SwimNode } from '@ronl/shared';
import { docLabel } from './doc-label';

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

  return { phaseCode, lanes, nodes, edges: [] };
}
