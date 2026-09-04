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

describe('parseSwimlane — edges and layering', () => {
  it.each(ALL)('%s reads sequence flows', (code, key) => {
    expect(parseSwimlane(xml(key), code).edges.length).toBeGreaterThan(0);
  });

  it.each(ALL)('%s places every forward edge left-to-right', (code, key) => {
    const model = parseSwimlane(xml(key), code);
    const col = new Map(model.nodes.map((n) => [n.id, n.col]));
    for (const e of model.edges) {
      if (e.back) continue;
      const from = col.get(e.from);
      const to = col.get(e.to);
      if (from === undefined || to === undefined) continue;
      expect(to).toBeGreaterThan(from);
    }
  });

  // Known-answer back-edge counts for all twelve fixtures, verified against
  // the actual DFS output (not guessed): R2.2, R2.3 and R5.3 are pure DAGs
  // with no rework loop at all, while R3.1 and R5.2 chain several
  // independent "niet akkoord" loops. A bare `length > 0` smoke test would
  // pass identically whether the algorithm found the right number of loops
  // or just one; this pins the exact count per phase.
  it.each<[string, string, number]>([
    ['R2.1', 'RipR21Process', 2],
    ['R2.2', 'RipR22Process', 0],
    ['R2.3', 'RipR23Process', 0],
    ['R2.4', 'RipR24Process', 1],
    ['R3.1', 'RipR31Process', 3],
    ['R3.2', 'RipR32Process', 1],
    ['R4.1', 'RipR41Process', 2],
    ['R5.1', 'RipR51Process', 1],
    ['R5.2', 'RipR52Process', 4],
    ['R5.3', 'RipR53Process', 0],
    ['R5.4', 'RipR54Process', 2],
    ['R6.1', 'RipR61Process', 1],
  ])('%s (%s) detects exactly %i back edge(s)', (code, key, expected) => {
    const model = parseSwimlane(xml(key), code);
    expect(model.edges.filter((e) => e.back).length).toBe(expected);
  });

  it('flags exactly the two known R2.1 rework loops on their rejection edges', () => {
    // R2.1 has two independent "niet akkoord" gateway loops — Gateway_Akkoord2
    // back to Task_AanvullenProjectplan2, and Gateway_Akkoord4 back to
    // Task_AanvullenProjectplan4. A back edge is one whose target sits in an
    // earlier column — computed structurally by findBackEdges, not
    // hand-flagged. findBackEdges walks each node's branches in that node's
    // own declared <bpmn:outgoing> order (not the flat sequenceFlow list's
    // position), matching the order BPMN tooling itself uses — Gateway2's
    // "niet akkoord" branch is visited before its sibling "Ja"/"Nee" detour
    // reaches the same target from the other side, so both loops now close
    // exactly on their rejection edge, matching the hand-authored model this
    // parser replaces.
    const model = parseSwimlane(xml('RipR21Process'), 'R2.1');
    const backEdges = model.edges.filter((e) => e.back);
    expect(backEdges).toEqual([
      {
        from: 'Gateway_Akkoord2',
        to: 'Task_AanvullenProjectplan2',
        label: 'niet akkoord',
        back: true,
      },
      {
        from: 'Gateway_Akkoord4',
        to: 'Task_AanvullenProjectplan4',
        label: 'niet akkoord',
        back: true,
      },
    ]);
  });

  it('carries the condition label on branching edges, with the exact text', () => {
    const model = parseSwimlane(xml('RipR21Process'), 'R2.1');
    const label = (from: string, to: string) =>
      model.edges.find((e) => e.from === from && e.to === to)?.label;
    expect(label('Gateway_IntakeAkkoord', 'Task_VerberenKwaliteit')).toBe('Nee');
    expect(label('Gateway_IntakeAkkoord', 'Task_AanvullenProjectplan2')).toBe('Ja');
    expect(label('Gateway_Akkoord2', 'Task_AanvullenProjectplan2')).toBe('niet akkoord');
    expect(label('Gateway_Akkoord4', 'EndEvent_Phase1Complete')).toBe('akkoord');
    // A plain, unconditional flow carries no label at all.
    expect(label('Task_AanlevrenProjectplan', 'Task_OrganiserenIntakeoverleg')).toBeUndefined();
  });

  it('starts the start event at column 0', () => {
    const model = parseSwimlane(xml('RipR22Process'), 'R2.2');
    const start = model.nodes.find((n) => n.kind === 'start')!;
    expect(start.col).toBe(0);
  });

  it('handles R5.3, which has exactly four end events', () => {
    // R5.3 splits on oplevering vs (vervroegde) ingebruikname; three exits
    // return to R5.2 and one leads to R5.4. The renderer must cope with more
    // than the single end event R2.1 has.
    const model = parseSwimlane(xml('RipR53Process'), 'R5.3');
    expect(model.nodes.filter((n) => n.kind === 'end').length).toBe(4);
  });
});

// None of the twelve real fixtures exercise a bare-text conditionExpression
// (every one carries an xsi:type attribute, making fast-xml-parser return an
// object rather than a string), and none contains a sequenceFlow whose
// sourceRef/targetRef names an id outside the KINDS allowlist (no boundary
// events are deployed today). Both are reachable in principle, so — matching
// the "defensive parsing" pattern above for lanes/nodes — a synthetic
// document pins the parser's and layering's behaviour on them.
describe('parseSwimlane — edge/layering defensive parsing', () => {
  const FLOW_EDGE_CASE_BPMN = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_FlowEdge">
  <bpmn:process id="FlowEdgeProcess">
    <bpmn:startEvent id="StartEvent_1" name="Start" />
    <bpmn:userTask id="Task_1" name="Task One" />
    <bpmn:endEvent id="EndEvent_1" name="End" />
    <bpmn:sequenceFlow id="Flow_BareCondition" sourceRef="StartEvent_1" targetRef="Task_1">
      <bpmn:conditionExpression>bare-text-condition</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="Flow_Dangling" sourceRef="Task_1" targetRef="BoundaryEvent_NotAFlowNode" />
    <bpmn:sequenceFlow id="Flow_ToEnd" sourceRef="Task_1" targetRef="EndEvent_1" />
  </bpmn:process>
</bpmn:definitions>`;

  it('falls back to a bare-text conditionExpression as the label when no name is set', () => {
    // fast-xml-parser returns a plain string (not an object with '#text')
    // for an attribute-less, text-only element — the branch none of the
    // real fixtures' xsi:type-bearing conditions ever take.
    const model = parseSwimlane(FLOW_EDGE_CASE_BPMN, 'X.2');
    const flow = model.edges.find((e) => e.from === 'StartEvent_1' && e.to === 'Task_1');
    expect(flow?.label).toBe('bare-text-condition');
  });

  it('does not crash layering on a sequenceFlow whose target is outside the node set', () => {
    // Flow_Dangling targets an id no KINDS-allowlisted element declares.
    // assignColumns must skip it (its id→node lookup misses) rather than
    // corrupting or halting the relaxation — the real edge to EndEvent_1
    // still lays out one column past Task_1.
    const model = parseSwimlane(FLOW_EDGE_CASE_BPMN, 'X.2');
    expect(model.edges.some((e) => e.to === 'BoundaryEvent_NotAFlowNode')).toBe(true);
    const task = model.nodes.find((n) => n.id === 'Task_1')!;
    const end = model.nodes.find((n) => n.id === 'EndEvent_1')!;
    expect(end.col).toBeGreaterThan(task.col);
  });

  it("still traverses a sequenceFlow its source's <bpmn:outgoing> omits, appending it after the declared ones", () => {
    // Gateway_1 declares only Flow_3 ("declared") in its own <bpmn:outgoing>
    // list; Flow_4 ("undeclared") is a second real sequenceFlow sourced from
    // Gateway_1 that the declaration leaves out — malformed input, since
    // real BPMN tooling keeps both in sync, but findBackEdges must not treat
    // an omission as absence. If Flow_4 were dropped instead of appended,
    // Task_B (and its own outgoing Flow_5, which closes the cycle back to
    // Task_A) would never be reached from the main traversal; by the time
    // the leftover-node sweep reached the orphaned Task_B, Task_A would
    // already be black, so Flow_5 would go unflagged too and the cycle would
    // vanish entirely (0 back edges here, instead of the 1 there really is).
    //
    // Gateway_1's single declared <bpmn:outgoing> also carries a stray
    // attribute — mirroring the attribute-bearing <bpmn:flowNodeRef> already
    // covered above — so fast-xml-parser returns it as an object with
    // '#text' rather than a bare string, exercising that branch too.
    const MALFORMED_OUTGOING_BPMN = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_Malformed">
  <bpmn:process id="MalformedProcess">
    <bpmn:startEvent id="StartEvent_1" name="Start">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:userTask id="Task_A" name="Task A">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:exclusiveGateway id="Gateway_1" name="Gateway">
      <bpmn:incoming>Flow_2</bpmn:incoming>
      <bpmn:outgoing foo="bar">Flow_3</bpmn:outgoing>
    </bpmn:exclusiveGateway>
    <bpmn:endEvent id="EndEvent_1" name="End">
      <bpmn:incoming>Flow_3</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:userTask id="Task_B" name="Task B">
      <bpmn:incoming>Flow_4</bpmn:incoming>
      <bpmn:outgoing>Flow_5</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_A" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_A" targetRef="Gateway_1" />
    <bpmn:sequenceFlow id="Flow_3" sourceRef="Gateway_1" targetRef="EndEvent_1" name="declared" />
    <bpmn:sequenceFlow id="Flow_4" sourceRef="Gateway_1" targetRef="Task_B" name="undeclared" />
    <bpmn:sequenceFlow id="Flow_5" sourceRef="Task_B" targetRef="Task_A" name="closes the cycle" />
  </bpmn:process>
</bpmn:definitions>`;

    const model = parseSwimlane(MALFORMED_OUTGOING_BPMN, 'X.4');
    const backEdges = model.edges.filter((e) => e.back);
    expect(backEdges).toEqual([
      { from: 'Task_B', to: 'Task_A', label: 'closes the cycle', back: true },
    ]);
  });
});

// FIX 2: an order-independent correctness check, deliberately NOT built on
// findBackEdges' own machinery. The per-fixture back-edge counts above are a
// strong regression lock but weak correctness evidence — they were derived
// by running the implementation and recording its output, so a systematic
// flaw present at authoring time would pass silently, and FIX 1 changing
// traversal order could in principle have changed how many edges a DFS
// finds. What actually matters for layering is order-invariant: removing
// the back edges must always leave an acyclic graph. This checks that with
// a fresh Kahn's-algorithm topological sort over `edges.filter(e => !e.back)`,
// written independently of findBackEdges.
function isAcyclic(nodeIds: string[], edges: Array<{ from: string; to: string }>): boolean {
  const indegree = new Map<string, number>(nodeIds.map((id) => [id, 0]));
  const adjacency = new Map<string, string[]>(nodeIds.map((id) => [id, []]));
  for (const e of edges) {
    if (!indegree.has(e.from) || !indegree.has(e.to)) continue;
    adjacency.get(e.from)!.push(e.to);
    indegree.set(e.to, (indegree.get(e.to) ?? 0) + 1);
  }
  const queue = nodeIds.filter((id) => indegree.get(id) === 0);
  let visited = 0;
  while (queue.length > 0) {
    const id = queue.shift()!;
    visited += 1;
    for (const next of adjacency.get(id) ?? []) {
      const remaining = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, remaining);
      if (remaining === 0) queue.push(next);
    }
  }
  return visited === nodeIds.length;
}

describe('parseSwimlane — back-edge removal always leaves an acyclic graph', () => {
  it('sanity check: the Kahn topological sort actually detects a cycle when back edges stay in', () => {
    // Proves isAcyclic is a real check, not a tautology that would pass for
    // any input — R2.1 with its back edges left in is genuinely cyclic.
    const model = parseSwimlane(xml('RipR21Process'), 'R2.1');
    const nodeIds = model.nodes.map((n) => n.id);
    expect(isAcyclic(nodeIds, model.edges)).toBe(false);
  });

  it.each(ALL)('%s: edges.filter(e => !e.back) is acyclic', (code, key) => {
    const model = parseSwimlane(xml(key), code);
    const nodeIds = model.nodes.map((n) => n.id);
    const forward = model.edges.filter((e) => !e.back);
    expect(isAcyclic(nodeIds, forward)).toBe(true);
  });
});

// Both tests below check a HAND-COPIED TRANSCRIPTION of rip-model.ts's
// FASE1_DOCS/FASE1_NODE_ROLE ids against the real, deployed R2.1 BPMN — they
// exist because the backend cannot import the frontend module to check its
// real, live tables directly. A copy checked against a copy would rot
// silently (edit rip-model.ts's table, both hardcoded lists here keep
// passing since neither reads the table itself), so `rip-model.test.ts`
// (frontend) carries the other half: it imports FASE1_DOCS/FASE1_NODE_ROLE
// themselves and checks THEM against a checked-in expected id set derived
// from this same BPMN. Together the two suites triangulate the coupling
// from both ends — this file confirms the transcribed ids are real BPMN
// nodes, the frontend file confirms the real tables match the transcription
// — and editing either the BPMN or the tables without updating the other
// side breaks one of them. Neither file alone can catch every drift.
describe('parseSwimlane — FASE1_DOCS coupling (spec §9)', () => {
  it('every FASE1_DOCS produceNode (transcribed) resolves to a node in the derived R2.1 model', () => {
    // FASE1_DOCS drives the "Projectplan — onderdelen" strip via
    // docOk(d.produceNode). Its ids used to be synthetic and local to
    // FASE1_NODES; they are BPMN ids now. If a task is ever renamed in the
    // BPMN, this fails instead of the strip silently reading "Nog niet".
    const ids = new Set(parseSwimlane(xml('RipR21Process'), 'R2.1').nodes.map((n) => n.bpmnId));
    for (const produceNode of [
      'Task_AanlevrenProjectplan',
      'Task_AanvullenProjectplan2',
      'Task_UitvoerenPSU',
      'Task_AanvullenProjectplan4',
    ]) {
      expect(ids).toContain(produceNode);
    }
  });

  // FASE1_NODE_ROLE (rip-model.ts, frontend) is the surviving remnant of the
  // deleted FASE1_NODES kept ONLY for getWipStepInfo's stepRole/blocked
  // fields on the WIP tab — a small hand-maintained bpmnId -> role table the
  // reviewer confirmed should stay, since deriving it instead would require
  // threading the phase model into getWipStepInfo and land in the R5.2/R6.1
  // redesign this plan explicitly deferred.
  //
  // This test guards ONLY that every one of its 19 TRANSCRIBED ids still
  // names a real node in the deployed R2.1 BPMN — it catches a renamed or
  // deleted task, turning a silent miss (stepRole/blocked quietly going
  // blank) into a loud failure. It does NOT read FASE1_NODE_ROLE itself (see
  // the file-level comment above), so it cannot catch an id edited in that
  // table without this list being updated to match — that half is
  // `rip-model.test.ts`'s job. It also does NOT check that the role each id
  // maps to still matches that node's actual BPMN lane: if a task is moved
  // to a different lane, this test keeps passing while the WIP tab's role
  // column goes stale. That gap is real and is not covered anywhere else —
  // do not read a passing run of this test as confirmation the role table
  // is still correct.
  it('every FASE1_NODE_ROLE id (transcribed) resolves to a node in the derived R2.1 model (existence only, not lane)', () => {
    const ids = new Set(parseSwimlane(xml('RipR21Process'), 'R2.1').nodes.map((n) => n.bpmnId));
    const fase1NodeRoleIds = [
      'StartEvent_RipPhase1',
      'Task_AanlevrenProjectplan',
      'Task_OrganiserenIntakeoverleg',
      'Task_UitvoerenIntakeoverleg',
      'Gateway_IntakeAkkoord',
      'Task_VerberenKwaliteit',
      'Task_AanvullenProjectplan2',
      'Task_AccorderenProjectplan2',
      'Gateway_Akkoord2',
      'Task_InitierenPSU',
      'Task_AanmakenWorkspaceRelatics',
      'Task_OpstellenRisicodossier',
      'Task_UitvoerenPSU',
      'Task_OpstellenPlanning',
      'Task_AanvullenProjectplan4',
      'Task_HoudenOverlegVO',
      'Task_AccorderenProjectplan4',
      'Gateway_Akkoord4',
      'EndEvent_Phase1Complete',
    ];
    for (const id of fase1NodeRoleIds) {
      expect(ids).toContain(id);
    }
  });
});
