import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { parseSwimlane } from './bpmn-swimlane';

const FIXTURES = join(__dirname, '__fixtures__');
const xml = (key: string) => readFileSync(join(FIXTURES, `${key}.bpmn`), 'utf-8');

const ALL: Array<[string, string]> = [
  ['R2.1', 'RipR21Process'],
  ['R2.2', 'RipR22Process'],
  ['R2.3', 'RipR23Process'],
  ['R2.4', 'RipR24Process'],
  ['R3.1', 'RipR31Process'],
  ['R3.2', 'RipR32Process'],
  ['R4.1', 'RipR41Process'],
  ['R5.1', 'RipR51Process'],
  ['R5.2', 'RipR52Process'],
  ['R5.3', 'RipR53Process'],
  ['R5.4', 'RipR54Process'],
  ['R6.1', 'RipR61Process'],
];

describe('parseSwimlane — fixtures', () => {
  it('has all twelve fixtures', () => {
    expect(readdirSync(FIXTURES).filter((f) => f.endsWith('.bpmn'))).toHaveLength(12);
  });
});

describe('parseSwimlane — lanes', () => {
  it('reads R2.2 lanes in top-to-bottom DI order', () => {
    const model = parseSwimlane(xml('RipR22Process'), 'R2.2');
    expect(model.lanes.map((l) => l.label)).toEqual([
      'Projectleider',
      'Ontwerper',
      'RIP-team, Aandrager, Adviseur',
      'Omgevingsmanager',
    ]);
  });

  it.each(ALL)('%s has at least one lane', (code, key) => {
    expect(parseSwimlane(xml(key), code).lanes.length).toBeGreaterThan(0);
  });
});

describe('parseSwimlane — nodes', () => {
  it.each(ALL)('%s assigns every node to a real lane row', (code, key) => {
    const model = parseSwimlane(xml(key), code);
    expect(model.nodes.length).toBeGreaterThan(0);
    for (const n of model.nodes) {
      expect(n.row).toBeGreaterThanOrEqual(0);
      expect(n.row).toBeLessThan(model.lanes.length);
    }
  });

  it.each(ALL)('%s gives every node a non-empty bpmnId', (code, key) => {
    for (const n of parseSwimlane(xml(key), code).nodes) {
      expect(n.bpmnId).not.toBe('');
    }
  });

  it.each(ALL)(
    '%s: every id a lane declares via flowNodeRef appears as a node in the model',
    (code, key) => {
      // KINDS is an allowlist of flow-node element types (see the comment on
      // it in bpmn-swimlane.ts). If a deployed phase ever introduces an
      // element type absent from that allowlist, its id is silently dropped
      // from `nodes` while a lane's own <bpmn:flowNodeRef> still declares it
      // — the model would quietly shrink instead of failing loudly. This
      // reads flowNodeRef ids straight out of the source XML with a regex,
      // independently of the parser under test, so it can't be fooled by a
      // shared bug in how both sides extract an id.
      const raw = xml(key);
      const model = parseSwimlane(raw, code);
      const nodeIds = new Set(model.nodes.map((n) => n.bpmnId));
      const flowNodeRefIds = [
        ...raw.matchAll(/<[\w-]*:?flowNodeRef\b[^>]*>([^<]*)<\/[\w-]*:?flowNodeRef>/g),
      ].map((m) => m[1].trim());
      expect(flowNodeRefIds.length).toBeGreaterThan(0);
      for (const id of flowNodeRefIds) {
        expect(nodeIds.has(id)).toBe(true);
      }
    }
  );

  it('classifies parallel gateways distinctly from exclusive ones', () => {
    // 32 parallel gateways exist across the phases. Rendering them as
    // exclusive diamonds would assert the wrong semantics.
    const kinds = ALL.flatMap(([code, key]) =>
      parseSwimlane(xml(key), code).nodes.map((n) => n.kind)
    );
    expect(kinds).toContain('parallel');
    expect(kinds).toContain('gateway');
  });

  it('resolves ronl:documentRef into a doc label', () => {
    const model = parseSwimlane(xml('RipR21Process'), 'R2.1');
    const withDocs = model.nodes.filter((n) => n.doc);
    expect(withDocs.length).toBeGreaterThan(0);
    expect(withDocs.every((n) => !n.doc!.startsWith('rip-'))).toBe(true);
  });

  it('leaves untagged nodes without a doc badge', () => {
    const model = parseSwimlane(xml('RipR22Process'), 'R2.2');
    expect(model.nodes.some((n) => n.doc === undefined)).toBe(true);
  });
});

// The twelve real fixtures are internally consistent BPMN — every lane is
// named, every lane has DI, every node sits in some lane, and flowNodeRef is
// always a bare text element. None of them exercise the parser's defensive
// fallbacks (`?? {}`, `?? 0`, the flowNodeRef object/string branch). These
// synthetic documents are not fixtures pinning real deployed behaviour — they
// pin the parser's behaviour on inputs the real files never contain.
describe('parseSwimlane — defensive parsing', () => {
  it('returns an empty model instead of throwing on non-BPMN input', () => {
    const model = parseSwimlane('<foo></foo>', 'X.0');
    expect(model).toEqual({ phaseCode: 'X.0', lanes: [], nodes: [], edges: [] });
  });

  // Lane_NoName and Lane_NoShape both lack DI in a different way (no
  // <dc:Bounds>, and no BPMNShape at all) and so both default their y to 0.
  // Lane_WithY carries a real, known, nonzero y (500) so the fallback value
  // itself is observable: if either fallback produced anything other than a
  // real `0` (undefined, NaN, ...), the sort below would not reliably place
  // them ahead of Lane_WithY.
  const EDGE_CASE_BPMN = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" id="Definitions_Edge">
  <bpmn:process id="EdgeProcess">
    <bpmn:laneSet id="LaneSet_Edge">
      <bpmn:lane id="Lane_NoName">
        <bpmn:flowNodeRef>Task_1</bpmn:flowNodeRef>
      </bpmn:lane>
      <bpmn:lane id="Lane_NoShape" name="No Shape Lane">
        <bpmn:flowNodeRef foo="bar">StartEvent_1</bpmn:flowNodeRef>
      </bpmn:lane>
      <bpmn:lane id="Lane_WithY" name="With Y Lane">
      </bpmn:lane>
    </bpmn:laneSet>
    <bpmn:startEvent id="StartEvent_1" name="Start" />
    <bpmn:userTask id="Task_1" name="Task" />
    <bpmn:endEvent id="EndEvent_Orphan" name="Orphan" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_Edge">
    <bpmndi:BPMNPlane id="BPMNPlane_Edge" bpmnElement="EdgeProcess">
      <bpmndi:BPMNShape id="Lane_NoName_di" bpmnElement="Lane_NoName" isHorizontal="true" />
      <bpmndi:BPMNShape id="Lane_WithY_di" bpmnElement="Lane_WithY" isHorizontal="true">
        <dc:Bounds x="0" y="500" width="10" height="10" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

  it('labels an unnamed lane with its id', () => {
    const model = parseSwimlane(EDGE_CASE_BPMN, 'X.1');
    expect(model.lanes.map((l) => l.label)).toEqual([
      'Lane_NoName',
      'No Shape Lane',
      'With Y Lane',
    ]);
  });

  it('defaults a lane with no DI shape, or a shape without Bounds, to a real y=0 — ordering both before a lane with a known y', () => {
    const model = parseSwimlane(EDGE_CASE_BPMN, 'X.1');
    const labels = model.lanes.map((l) => l.label);
    const withY = labels.indexOf('With Y Lane');
    // Lane_NoName: BPMNShape present, no <dc:Bounds> child.
    expect(labels.indexOf('Lane_NoName')).toBeLessThan(withY);
    // Lane_NoShape: no BPMNShape entry in the DI at all.
    expect(labels.indexOf('No Shape Lane')).toBeLessThan(withY);
  });

  it('resolves a flowNodeRef parsed as an object (attribute present) to its text', () => {
    const model = parseSwimlane(EDGE_CASE_BPMN, 'X.1');
    const start = model.nodes.find((n) => n.bpmnId === 'StartEvent_1');
    // StartEvent_1 sits in Lane_NoShape, row 1 — deliberately not row 0, so
    // this proves the object-form flowNodeRef actually resolved to the right
    // lane. Row 0 is also EndEvent_Orphan's fallback value below; asserting
    // row 0 here would pass identically if the object branch were broken and
    // the id silently fell through to that same fallback instead.
    expect(start?.row).toBe(1);
  });

  it('assigns row 0 to a node that no lane references', () => {
    const model = parseSwimlane(EDGE_CASE_BPMN, 'X.1');
    const orphan = model.nodes.find((n) => n.bpmnId === 'EndEvent_Orphan');
    expect(orphan?.row).toBe(0);
  });
});
