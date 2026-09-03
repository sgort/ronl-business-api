# RIP Phase Swimlane Derivation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** render a swimlane process diagram for all twelve modelled RIP phases, derived from the BPMN Operaton has deployed rather than from hand-maintained TypeScript.

**Architecture:** A pure parser in the backend turns BPMN XML into a `PhaseSwimlaneModel` (lanes, nodes, edges — no coordinates). A new `GET /v1/rip/phases/:code/model` endpoint serves it, sourcing XML from Operaton by process-definition key so phases with no running instance still resolve. The frontend renders that model with the existing grid renderer, generalised from R2.1-only constants to props.

**Tech Stack:** TypeScript, Express, `fast-xml-parser` (already a backend dependency), Jest (backend), React + Vitest (frontend), npm workspaces.

**Spec:** `docs/superpowers/specs/2026-09-03-rip-phase-swimlane-derivation-design.md`

## Global Constraints

- **Never bypass a verification gate.** No `--no-verify`, no `SKIP=`, no `HUSKY=0`. If a hook fails, read it and fix what it names.
- **Commit each task.** The user has approved per-task commits for this plan specifically, so a task's final step commits rather than asking. This is a deliberate, scoped exception to the repo's usual ask-first rule — it does not extend to merging, pushing, or any other branch-level operation, which still require the user in the moment.
- **Never merge, push, or force-push.** Those are the user's, always, and are not part of any task here.
- **Never start, stop or restart dev servers.** If a check needs a running server, hand it to the user.
- **A parallel-run test failure is not a finding until it fails in isolation.** Backend is Jest (`--runInBand` for serial); frontend is Vitest (`npm run test:serial --workspace=@ronl/frontend`). Check which runner before reaching for a flag.
- **`@ronl/shared` resolves to `dist/`.** After editing `packages/shared/src/**`, run `npm run build --workspace=@ronl/shared` or the change is invisible to backend and frontend. This has already cost one session a baffling test failure.
- Backend tests are colocated: `testMatch: ['<rootDir>/src/**/*.test.ts']`.
- Phase codes are derived from `processDefinitionKey`, **never** from a process definition's `name`. R2.1's deployed name is `RIP Fase 1 — R2.1 Projectplan Planvoorbereiding` (em dash, legacy prefix, code mid-string) while the other eleven are `RX.Y - Title` with a plain hyphen. Any regex over names mis-parses R2.1.

## Prerequisite (not a task)

PR #70 amends the spec from eleven phases to twelve. It should merge before or during this work. Additionally, §10 "Out of scope" must gain one line — agreed with the user but not yet written:

> - Generalising `getWipStepInfo` beyond R2.1. It looks up the first running activity in `FASE1_NODES` and returns null for every other phase, so the WIP tab renders "—" for Huidige stap, Rol and Dagen on R2.2–R6.1. Fixing it needs a design answer for R5.2 (parallel weekly cycle, recurring task definitions, several tasks active at once) and R6.1 (three labelled streams). Its own brainstorm.

---

### Task 1: Shared swimlane types and the document-label map

Moves the swimlane vocabulary into `@ronl/shared` so the backend parser and the frontend renderer agree by construction, and adds the `ronl:documentRef` slug→label resolution.

**Files:**

- Create: `packages/shared/src/rip-swimlane.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/rip-swimlane.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `NodeKind`, `SwimLane`, `SwimNode`, `SwimEdge`, `PhaseSwimlaneModel`, `docLabel(slug: string): string`.

- [ ] **Step 1: Write the failing test**

`packages/shared/src/rip-swimlane.test.ts`:

```ts
import { docLabel } from './rip-swimlane';

describe('docLabel', () => {
  it('uses the curated label when the slug is known', () => {
    expect(docLabel('rip-intake-report')).toBe('Intake-verslag');
    expect(docLabel('rip-psu-report')).toBe('PSU-verslag');
    expect(docLabel('rip-pdp')).toBe('Uitgangspunten VO-fase');
  });

  it('humanises an unmapped slug rather than showing the raw ref', () => {
    // 77 documentRefs exist across the twelve phases and only a few have
    // curated Dutch labels. An unmapped one must still read as a document
    // name, not as an identifier.
    expect(docLabel('rip-projectraming')).toBe('Projectraming');
    expect(docLabel('rip-nota-besluitvorming-ao')).toBe('Nota besluitvorming ao');
  });

  it('leaves a slug without the rip- prefix alone apart from casing', () => {
    expect(docLabel('weekrapport')).toBe('Weekrapport');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=@ronl/shared -- rip-swimlane`
Expected: FAIL — `Cannot find module './rip-swimlane'`

- [ ] **Step 3: Write the implementation**

`packages/shared/src/rip-swimlane.ts`:

```ts
/**
 * Swimlane vocabulary shared by the BPMN parser (backend) and the renderer
 * (frontend). Both sides use these exact types so a parser change cannot
 * drift from what the renderer expects.
 */

export type NodeKind = 'start' | 'end' | 'task' | 'service' | 'gateway' | 'parallel';

export interface SwimLane {
  key: string;
  label: string;
}

export interface SwimNode {
  id: string;
  kind: NodeKind;
  col: number;
  row: number;
  label: string;
  /** Resolved document label from `ronl:documentRef`, when the task carries one. */
  doc?: string;
  /** BPMN flowNode id — maps live activity history onto the node. */
  bpmnId: string;
}

export interface SwimEdge {
  from: string;
  to: string;
  label?: string;
  /** Target resolves to an earlier column: a rework loop. */
  back?: boolean;
}

export interface PhaseSwimlaneModel {
  phaseCode: string;
  lanes: SwimLane[];
  nodes: SwimNode[];
  edges: SwimEdge[];
}

/**
 * Curated Dutch labels for document refs that have one. The BPMN carries 77
 * `ronl:documentRef` slugs across the twelve phases; only a handful have an
 * agreed display name. Everything else is humanised from the slug rather than
 * invented here — a wrong Dutch label is worse than a plain one.
 */
const DOC_LABELS: Record<string, string> = {
  'rip-intake-report': 'Intake-verslag',
  'rip-psu-report': 'PSU-verslag',
  'rip-pdp': 'Uitgangspunten VO-fase',
};

export function docLabel(slug: string): string {
  const curated = DOC_LABELS[slug];
  if (curated) return curated;
  const words = slug.replace(/^rip-/, '').replace(/-/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
```

Append to `packages/shared/src/index.ts`:

```ts
export * from './rip-swimlane';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace=@ronl/shared -- rip-swimlane`
Expected: PASS (3 tests)

- [ ] **Step 5: Build shared, then stage and ask**

```bash
npm run build --workspace=@ronl/shared
git add packages/shared/src/rip-swimlane.ts packages/shared/src/rip-swimlane.test.ts packages/shared/src/index.ts
```

Report what is staged and ask before committing. Suggested message:

```
feat(shared): swimlane types and documentRef label resolution
```

---

### Task 2: BPMN fixtures and the lane/node half of the parser

**Files:**

- Create: `packages/backend/src/rip-swimlane/__fixtures__/RipR21Process.bpmn` … `RipR61Process.bpmn` (twelve files)
- Create: `packages/backend/src/rip-swimlane/bpmn-swimlane.ts`
- Test: `packages/backend/src/rip-swimlane/bpmn-swimlane.test.ts`

**Interfaces:**

- Consumes: `PhaseSwimlaneModel`, `SwimLane`, `SwimNode`, `NodeKind`, `docLabel` from `@ronl/shared`.
- Produces: `parseSwimlane(xml: string, phaseCode: string): PhaseSwimlaneModel`. This task returns `lanes` and `nodes` with `row` set and `col` set to `0`; Task 3 fills `col` and `edges`.

- [ ] **Step 1: Copy the fixtures**

These are **parser fixtures**, not a source of deployment truth — the engine remains that. They pin parser behaviour against real files.

```bash
mkdir -p packages/backend/src/rip-swimlane/__fixtures__
for d in 21 22 23 24 31 32 41 51 52 53 54 61; do
  cp "../linked-data-explorer/examples/organizations/flevoland/rip-phase-$d"/RipR*.bpmn \
     packages/backend/src/rip-swimlane/__fixtures__/
done
ls packages/backend/src/rip-swimlane/__fixtures__/ | wc -l   # expect 12
```

- [ ] **Step 2: Write the failing test**

`packages/backend/src/rip-swimlane/bpmn-swimlane.test.ts`:

```ts
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test --workspace=@ronl/backend -- bpmn-swimlane`
Expected: FAIL — `Cannot find module './bpmn-swimlane'`

- [ ] **Step 4: Write the implementation**

`packages/backend/src/rip-swimlane/bpmn-swimlane.ts`:

```ts
import { XMLParser } from 'fast-xml-parser';
import {
  docLabel,
  type NodeKind,
  type PhaseSwimlaneModel,
  type SwimLane,
  type SwimNode,
} from '@ronl/shared';

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

/** Element name → node kind. Anything unlisted is treated as a task. */
const KINDS: Record<string, NodeKind> = {
  startEvent: 'start',
  endEvent: 'end',
  userTask: 'task',
  serviceTask: 'service',
  sendTask: 'service',
  exclusiveGateway: 'gateway',
  inclusiveGateway: 'gateway',
  eventBasedGateway: 'gateway',
  parallelGateway: 'parallel',
};

interface Raw {
  process: Record<string, unknown>;
  shapes: Map<string, { y: number }>;
}

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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test --workspace=@ronl/backend -- bpmn-swimlane`
Expected: PASS

If `removeNSPrefix: true` strips `ronl:` from attribute names, the `@_documentRef` fallback in the node loop covers it — the test `resolves ronl:documentRef into a doc label` is what proves which one fires. Do not remove either branch on the assumption that one is dead.

- [ ] **Step 6: Stage and ask**

```bash
git add packages/backend/src/rip-swimlane/
```

Report and ask. Suggested message:

```
feat(rip): parse lanes and nodes out of deployed BPMN
```

---

### Task 3: Edges, layering, and back-edge detection

**Files:**

- Modify: `packages/backend/src/rip-swimlane/bpmn-swimlane.ts`
- Test: `packages/backend/src/rip-swimlane/bpmn-swimlane.test.ts`

**Interfaces:**

- Consumes: `parseSwimlane` from Task 2.
- Produces: the same `parseSwimlane`, now with `edges` populated and `col` assigned by longest-path layering.

- [ ] **Step 1: Write the failing test**

Append to `packages/backend/src/rip-swimlane/bpmn-swimlane.test.ts`:

```ts
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

  it('flags R2.1 rework loops as back edges', () => {
    // R2.1 sends "niet akkoord" back to an earlier task. A back edge is one
    // whose target sits in an earlier column — computed, not hand-flagged.
    const model = parseSwimlane(xml('RipR21Process'), 'R2.1');
    expect(model.edges.some((e) => e.back)).toBe(true);
  });

  it('carries the condition label on a branching edge', () => {
    const model = parseSwimlane(xml('RipR21Process'), 'R2.1');
    expect(model.edges.some((e) => (e.label ?? '') !== '')).toBe(true);
  });

  it('starts the start event at column 0', () => {
    const model = parseSwimlane(xml('RipR22Process'), 'R2.2');
    const start = model.nodes.find((n) => n.kind === 'start')!;
    expect(start.col).toBe(0);
  });

  it('handles R5.3, which has four end events', () => {
    // R5.3 splits on oplevering vs (vervroegde) ingebruikname; three exits
    // return to R5.2 and one leads to R5.4. The renderer must cope with more
    // than the single end event R2.1 has.
    const model = parseSwimlane(xml('RipR53Process'), 'R5.3');
    expect(model.nodes.filter((n) => n.kind === 'end').length).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=@ronl/backend -- bpmn-swimlane`
Expected: FAIL — `edges.length` is 0.

- [ ] **Step 3: Write the implementation**

Add to `bpmn-swimlane.ts`, and replace the `return` at the end of `parseSwimlane`:

```ts
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
```

Then in `parseSwimlane`, replace the final `return`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace=@ronl/backend -- bpmn-swimlane`
Expected: PASS

- [ ] **Step 5: Run the whole backend suite serially**

Run: `npm test --workspace=@ronl/backend -- --runInBand`
Expected: no new failures. Jest rejects Vitest's `--no-file-parallelism`; `--runInBand` is the serial flag here.

- [ ] **Step 6: Stage and ask**

```bash
git add packages/backend/src/rip-swimlane/
```

Suggested message:

```
feat(rip): layer swimlane nodes and detect rework loops
```

---

### Task 4: Serve the model from Operaton

**Files:**

- Modify: `packages/backend/src/services/operaton.service.ts`
- Modify: `packages/backend/src/routes/rip.routes.ts`
- Test: `packages/backend/src/routes/rip.routes.test.ts`

**Interfaces:**

- Consumes: `parseSwimlane` (Task 3); existing private `getByKeyWithTenantFallback<T>(processKey, tenantId, suffix, options?)`; existing `resolvePhaseKey(code, res)` in `rip.routes.ts`.
- Produces: `operatonService.getPhaseBpmnXml(processKey: string, tenantId?: string): Promise<string>` and `GET /v1/rip/phases/:code/model` returning `{ success: true, data: PhaseSwimlaneModel }`.

- [ ] **Step 1: Write the failing test**

Append to `packages/backend/src/routes/rip.routes.test.ts`, following the mocking style already used in that file:

```ts
describe('GET /v1/rip/phases/:code/model', () => {
  it('returns a swimlane model for a modelled phase', async () => {
    const xml = readFileSync(
      join(__dirname, '../rip-swimlane/__fixtures__/RipR22Process.bpmn'),
      'utf-8'
    );
    mockOperatonService.getPhaseBpmnXml.mockResolvedValue(xml);

    const res = await request(app).get('/v1/rip/phases/R2.2/model').set(authHeader);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.phaseCode).toBe('R2.2');
    expect(res.body.data.lanes.length).toBeGreaterThan(0);
    expect(res.body.data.nodes.length).toBeGreaterThan(0);
  });

  it('404s an unknown phase code', async () => {
    const res = await request(app).get('/v1/rip/phases/R9.9/model').set(authHeader);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('UNKNOWN_PHASE');
  });

  it('500s rather than half-rendering when the engine is unreachable', async () => {
    mockOperatonService.getPhaseBpmnXml.mockRejectedValue(new Error('ECONNREFUSED'));
    const res = await request(app).get('/v1/rip/phases/R2.2/model').set(authHeader);
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('PHASE_MODEL_FAILED');
  });
});
```

Add `getPhaseBpmnXml: jest.fn()` to that file's `mockOperatonService`, and the `readFileSync`/`join` imports if absent.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=@ronl/backend -- rip.routes`
Expected: FAIL — 404 from Express, the route does not exist.

- [ ] **Step 3: Add the service method**

In `packages/backend/src/services/operaton.service.ts`, next to the other public phase methods:

```ts
  /**
   * BPMN XML for a phase's process definition, fetched BY KEY so a phase with
   * no running instance still resolves — mock portfolio rows need a diagram
   * too. Cached per key+tenant: Operaton's XML is immutable for a definition,
   * and a redeploy produces a new definition id under the same key, so the
   * cache is refreshed by restart rather than invalidated.
   */
  async getPhaseBpmnXml(processKey: string, tenantId?: string): Promise<string> {
    const cacheKey = `${tenantId ?? '-'}:${processKey}`;
    const cached = this.phaseBpmnCache.get(cacheKey);
    if (cached) return cached;
    const res = await this.getByKeyWithTenantFallback<{ bpmn20Xml: string }>(
      processKey,
      tenantId,
      '/xml'
    );
    const xml = res.data.bpmn20Xml;
    this.phaseBpmnCache.set(cacheKey, xml);
    return xml;
  }
```

And beside `private bpmnXmlCache` (line 38):

```ts
  private phaseBpmnCache = new Map<string, string>();
```

- [ ] **Step 4: Add the route**

In `packages/backend/src/routes/rip.routes.ts`, after the `/phases/:code/completed` route. Import `parseSwimlane` at the top:

```ts
import { parseSwimlane } from '../rip-swimlane/bpmn-swimlane';
```

```ts
/**
 * GET /v1/rip/phases/:code/model
 * Swimlane model for one RIP phase, derived from its deployed BPMN.
 */
router.get('/phases/:code/model', async (req, res) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
  }
  const code = req.params.code;
  const key = resolvePhaseKey(code, res);
  if (!key) return;
  try {
    const xml = await operatonService.getPhaseBpmnXml(key, req.user.tenantId);
    res.json({ success: true, data: parseSwimlane(xml, code) });
  } catch (error) {
    logger.error('Failed to build RIP phase swimlane model', {
      code,
      tenantId: req.user.tenantId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(500).json({
      success: false,
      error: { code: 'PHASE_MODEL_FAILED', message: 'Failed to build phase process model' },
    });
  }
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test --workspace=@ronl/backend -- rip.routes`
Expected: PASS

- [ ] **Step 6: Stage and ask**

```bash
git add packages/backend/src/services/operaton.service.ts packages/backend/src/routes/rip.routes.ts packages/backend/src/routes/rip.routes.test.ts
```

Suggested message:

```
feat(rip): serve a phase swimlane model derived from deployed BPMN
```

---

### Task 5: Frontend API client and hook

**Files:**

- Modify: `packages/frontend/src/services/api.ts`
- Modify: `packages/frontend/src/services/infra.api.ts`
- Test: `packages/frontend/src/services/infra.api.test.ts`

**Interfaces:**

- Consumes: `GET /v1/rip/phases/:code/model` (Task 4); `PhaseSwimlaneModel` from `@ronl/shared`.
- Produces: `businessApi.rip.phaseModel(code)` and `usePhaseSwimlane(code: string | null)` returning `{ data: PhaseSwimlaneModel | null, loading, error, reload }`.

- [ ] **Step 1: Write the failing test**

Append to `packages/frontend/src/services/infra.api.test.ts`:

```ts
describe('usePhaseSwimlane', () => {
  it('fetches the model for a phase code', async () => {
    const model = { phaseCode: 'R2.2', lanes: [], nodes: [], edges: [] };
    vi.mocked(businessApi.rip.phaseModel).mockResolvedValue({ success: true, data: model });

    const { result } = renderHook(() => usePhaseSwimlane('R2.2'));

    await waitFor(() => expect(result.current.data).toEqual(model));
    expect(businessApi.rip.phaseModel).toHaveBeenCalledWith('R2.2');
  });

  it('skips the request for a null code', async () => {
    const { result } = renderHook(() => usePhaseSwimlane(null));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(businessApi.rip.phaseModel).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=@ronl/frontend -- infra.api`
Expected: FAIL — `usePhaseSwimlane is not exported`.

- [ ] **Step 3: Write the implementation**

In `packages/frontend/src/services/api.ts`, inside the `rip: { … }` block:

```ts
    phaseModel: async (phaseCode: string): Promise<ApiResponse<PhaseSwimlaneModel>> => {
      const response = await api.get(`/rip/phases/${encodeURIComponent(phaseCode)}/model`);
      return response.data;
    },
```

with `import type { PhaseSwimlaneModel } from '@ronl/shared';` at the top.

In `packages/frontend/src/services/infra.api.ts`:

```ts
/** Swimlane model for one RIP phase. Pass null to skip the request. */
export const usePhaseSwimlane = (phaseCode: string | null) =>
  useAsync<PhaseSwimlaneModel>(
    () =>
      phaseCode
        ? businessApi.rip.phaseModel(phaseCode)
        : Promise.resolve({ success: true, data: undefined }),
    [phaseCode]
  );
```

Note the `data: undefined` for the null case — `useAsync` sets `error` when `data` is undefined, but `loading` still resolves to false, which is what the second test asserts. If that proves too subtle in review, give `usePhaseSwimlane` its own tiny state rather than bending `useAsync`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace=@ronl/frontend -- infra.api`
Expected: PASS

- [ ] **Step 5: Stage and ask**

```bash
git add packages/frontend/src/services/api.ts packages/frontend/src/services/infra.api.ts packages/frontend/src/services/infra.api.test.ts
```

Suggested message:

```
feat(infra-board): fetch phase swimlane models from the backend
```

---

### Task 6: Generalise the renderer

Turns `Fase1Swimlane` — which imports R2.1 constants at module level — into `PhaseSwimlane`, which takes a model as a prop.

**Files:**

- Create: `packages/frontend/src/components/InfraBoardDashboard/PhaseSwimlane.tsx`
- Create: `packages/frontend/src/components/InfraBoardDashboard/PhaseSwimlane.test.tsx`
- Delete: `packages/frontend/src/components/InfraBoardDashboard/Fase1Swimlane.tsx` and `Fase1Swimlane.test.tsx` (in Task 7, once nothing imports them)

**Interfaces:**

- Consumes: `PhaseSwimlaneModel`, `SwimNode`, `StatusKey`.
- Produces: `<PhaseSwimlane model={…} statusById={…} claimedNodeIds={…} />`.

- [ ] **Step 1: Write the failing test**

`packages/frontend/src/components/InfraBoardDashboard/PhaseSwimlane.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import PhaseSwimlane from './PhaseSwimlane';
import type { PhaseSwimlaneModel } from '@ronl/shared';

const MODEL: PhaseSwimlaneModel = {
  phaseCode: 'R2.2',
  lanes: [
    { key: 'l1', label: 'Projectleider' },
    { key: 'l2', label: 'Ontwerper' },
  ],
  nodes: [
    { id: 's', bpmnId: 's', kind: 'start', col: 0, row: 0, label: 'Start' },
    { id: 't', bpmnId: 't', kind: 'task', col: 1, row: 1, label: 'Opstellen VO' },
    { id: 'p', bpmnId: 'p', kind: 'parallel', col: 2, row: 1, label: 'Split' },
    { id: 'e1', bpmnId: 'e1', kind: 'end', col: 3, row: 0, label: 'Klaar A' },
    { id: 'e2', bpmnId: 'e2', kind: 'end', col: 3, row: 1, label: 'Klaar B' },
  ],
  edges: [
    { from: 's', to: 't' },
    { from: 't', to: 'p', label: 'Ja' },
    { from: 'p', to: 'e1' },
    { from: 'p', to: 'e2' },
  ],
};

describe('PhaseSwimlane', () => {
  it('renders a lane label row per lane', () => {
    const { container } = render(<PhaseSwimlane model={MODEL} statusById={{}} />);
    expect(container.querySelectorAll('.pb-swim-lane-label')).toHaveLength(2);
  });

  it('renders every node', () => {
    const { container } = render(<PhaseSwimlane model={MODEL} statusById={{}} />);
    const drawn = container.querySelectorAll('.pb-swim-node, .pb-swim-event, .pb-swim-gate');
    expect(drawn).toHaveLength(5);
  });

  it('renders both end events', () => {
    // R2.1 has one end event, so the old renderer never met a second.
    // R5.3 has four.
    const { getByText } = render(<PhaseSwimlane model={MODEL} statusById={{}} />);
    expect(getByText('Klaar A')).toBeInTheDocument();
    expect(getByText('Klaar B')).toBeInTheDocument();
  });

  it('marks a parallel gateway differently from an exclusive one', () => {
    const { container } = render(<PhaseSwimlane model={MODEL} statusById={{}} />);
    expect(container.querySelector('.pb-swim-gate.parallel')).not.toBeNull();
  });

  it('applies status by node id', () => {
    const { container } = render(<PhaseSwimlane model={MODEL} statusById={{ t: 'done' }} />);
    expect(container.querySelector('.pb-swim-node.done')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=@ronl/frontend -- PhaseSwimlane`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Copy `Fase1Swimlane.tsx` to `PhaseSwimlane.tsx` and make exactly these changes:

1. Delete the `FASE1_LANES, FASE1_NODES, FASE1_EDGES` import; keep `STATUS` and `type StatusKey`. Add `import type { PhaseSwimlaneModel } from '@ronl/shared';`.
2. Change the signature to:

```tsx
export default function PhaseSwimlane({
  model,
  statusById,
  claimedNodeIds = new Set(),
}: {
  model: PhaseSwimlaneModel;
  statusById: Record<string, StatusKey>;
  claimedNodeIds?: Set<string>;
}) {
  const { lanes, nodes, edges } = model;
```

3. Replace every `FASE1_NODES` with `nodes`, `FASE1_LANES` with `lanes`, `FASE1_EDGES` with `edges`.
4. Guard the empty model so `Math.max(...[])` cannot yield `-Infinity`:

```tsx
const nCols = nodes.length ? Math.max(...nodes.map((n) => n.col)) + 1 : 1;
```

5. Where the gateway is rendered, add the kind to its class so a parallel gateway is distinguishable, and show `+` rather than `×`:

```tsx
                className={`pb-swim-gate ${st(n.id)} ${n.kind}`}
```

```tsx
<span className="gx">{n.kind === 'parallel' ? '+' : '×'}</span>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace=@ronl/frontend -- PhaseSwimlane`
Expected: PASS

- [ ] **Step 5: Stage and ask**

```bash
git add packages/frontend/src/components/InfraBoardDashboard/PhaseSwimlane.tsx packages/frontend/src/components/InfraBoardDashboard/PhaseSwimlane.test.tsx
```

Suggested message:

```
feat(infra-board): render a swimlane from a model instead of R2.1 constants
```

---

### Task 7: Wire it up and delete the hand-maintained model

The task that makes the feature real and removes what it replaces.

**Files:**

- Modify: `packages/frontend/src/components/InfraBoardDashboard/ProjectDetail.tsx`
- Modify: `packages/frontend/src/components/InfraBoardDashboard/ProjectDetail.test.tsx`
- Modify: `packages/frontend/src/pages/infra-board/rip-model.ts`
- Delete: `Fase1Swimlane.tsx`, `Fase1Swimlane.test.tsx`

**Interfaces:**

- Consumes: `usePhaseSwimlane` (Task 5), `PhaseSwimlane` (Task 6).
- Produces: nothing downstream.

- [ ] **Step 1: Write the failing test**

Replace the `live instance past R2.1` block's `opens on the current phase rather than the R2.1 swimlane` test in `ProjectDetail.test.tsx` — a derived R2.2 now HAS a diagram, so the old expectation is wrong — and add:

```tsx
it('renders the selected phase own swimlane, not R2.1 constants', async () => {
  mockUsePhaseSwimlane.mockReturnValue({
    data: {
      phaseCode: 'R2.2',
      lanes: [{ key: 'l1', label: 'Ontwerper' }],
      nodes: [{ id: 'x', bpmnId: 'x', kind: 'task', col: 0, row: 0, label: 'Opstellen VO' }],
      edges: [],
    },
    loading: false,
    error: false,
    reload: vi.fn(),
  });

  render(<ProjectDetail projectRef={liveRef} onBack={vi.fn()} />);

  expect(screen.getByText('Opstellen VO')).toBeInTheDocument();
  expect(screen.queryByText(/nog niet gemodelleerd/)).not.toBeInTheDocument();
});

it('falls back to the not-modelled panel when the model cannot be fetched', () => {
  mockUsePhaseSwimlane.mockReturnValue({
    data: null,
    loading: false,
    error: true,
    reload: vi.fn(),
  });

  render(<ProjectDetail projectRef={liveRef} onBack={vi.fn()} />);

  expect(screen.getByText(/nog niet gemodelleerd/)).toBeInTheDocument();
});
```

Add `usePhaseSwimlane: mockUsePhaseSwimlane` to the existing `vi.mock('../../services/infra.api', …)` block and a default `{ data: null, loading: false, error: false, reload: vi.fn() }` in `beforeEach`.

Also add the spec §9 coupling test, in `packages/backend/src/rip-swimlane/bpmn-swimlane.test.ts` where the derived R2.1 model is available:

```ts
it('every FASE1_DOCS produceNode resolves to a node in the derived R2.1 model', () => {
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
```

Keeping it backend-side avoids importing the frontend's `rip-model.ts` into a Jest suite; the four ids are duplicated deliberately, and the test's own failure message names which one drifted.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=@ronl/frontend -- ProjectDetail`
Expected: FAIL — "Opstellen VO" is not in the document.

- [ ] **Step 3: Rewire ProjectDetail**

Replace the `Fase1Swimlane` import with `PhaseSwimlane`, add `usePhaseSwimlane` to the `infra.api` import, and:

```tsx
const { data: phaseModel } = usePhaseSwimlane(selPhase);
```

Replace the `selPhase === 'R2.1' ? … : …` conditional so the swimlane block renders whenever a model exists, and the "nog niet gemodelleerd" panel is the fallback:

```tsx
      {phaseModel ? (
        <>
          {/* …existing pb-phase-titlebar… */}
          <PhaseSwimlane
            model={phaseModel}
            statusById={statusById}
            claimedNodeIds={activeNodeIds}
          />
          {/* …existing pb-deliverables block, R2.1 only… */}
        </>
      ) : (
        /* …existing pb-phase-empty panel… */
      )}
```

Keep the `pb-deliverables` block gated on `selPhase === 'R2.1'` — it describes the Projectplan's four parts and is R2.1 content, not process structure.

**Delete the `pastFase1` branch** added in `3674f66`, restoring:

```tsx
const statusById: Record<string, StatusKey> =
  isLive && history ? nodeStatusFromHistory(history) : deriveMockStatus(mock);
```

It marked R2.1's nodes done for an instance in a later phase — a workaround that existed only because R2.1 was the sole available model. With every phase modelled, the instance's own history drives its own diagram and the special case is wrong.

- [ ] **Step 4: Re-point `FASE1_DOCS` and delete the constants**

In `packages/frontend/src/pages/infra-board/rip-model.ts`, change `produceNode` to BPMN ids (spec §6.1) — `statusById` is now keyed by `bpmnId`:

```ts
export const FASE1_DOCS = [
  {
    key: 'intakeform',
    nr: '1',
    label: 'Intake-formulier',
    produceNode: 'Task_AanlevrenProjectplan',
  },
  { key: 'intake', nr: '2', label: 'Intake-verslag', produceNode: 'Task_AanvullenProjectplan2' },
  { key: 'psu', nr: '3', label: 'PSU-verslag', produceNode: 'Task_UitvoerenPSU' },
  {
    key: 'vou',
    nr: '4',
    label: 'Uitgangspunten VO-fase',
    produceNode: 'Task_AanvullenProjectplan4',
  },
] as const;
```

Then delete `FASE1_LANES`, `FASE1_NODES`, `FASE1_EDGES`, `ROW`, `ROW_TO_LANE_KEY`, and the now-unused `SwimLane`/`SwimNode`/`SwimEdge`/`NodeKind` local definitions — re-export the shared ones instead so existing importers keep working:

```ts
export type { NodeKind, SwimLane, SwimNode, SwimEdge } from '@ronl/shared';
```

**Four live consumers outlive the constants.** `PhaseDetail.tsx:103,120` calls `getWipStepInfo`, `getDocProgress` and `countReworkLoops`, and `ProjectDetail.tsx:32` has `deriveMockStatus`. Handle each explicitly — do not leave them dangling:

- **`countReworkLoops`** needs back-edge _targets_, which is the only part of `FASE1_EDGES` still earning its keep. Replace the derivation with the two ids directly:

```ts
/** R2.1's rework-loop targets, by BPMN id — the surviving remnant of the
 *  deleted FASE1_EDGES. A task reached more than once means a loop ran. */
export const FASE1_REWORK_TARGETS = [
  'Task_AanvullenProjectplan2',
  'Task_AanvullenProjectplan4',
] as const;

export function countReworkLoops(history: ActivityHistoryItem[]): number {
  let loops = 0;
  for (const bpmnId of FASE1_REWORK_TARGETS) {
    const count = history.filter((h) => h.activityId === bpmnId).length;
    loops += Math.max(0, count - 1);
  }
  return loops;
}
```

- **`getDocProgress`** needs no change beyond §6.1's `produceNode` re-pointing — it reads `FASE1_DOCS` and `nodeStatusFromHistory`, both of which survive.
- **`getWipStepInfo`** is out of scope (see Prerequisite) and must not gain behaviour here. Take its step label from the history item's own `activityName` instead of a node-map lookup, so it stops depending on `FASE1_NODES` without changing what it returns for R2.1. If `activityName` proves absent in the fixtures, leave it returning null — the WIP tab is then no worse than today, which is the bar.
- **`deriveMockStatus`** iterates `FASE1_NODES`. Give it the derived nodes instead: `deriveMockStatus(mock, phaseModel?.nodes ?? [])`, iterating that list and keying the result by `bpmnId`.

Then change `nodeStatusFromHistory` to key off the history's own activity ids:

```ts
export function nodeStatusFromHistory(
  history: ActivityHistoryItem[],
  openTaskBpmnIds: ReadonlySet<string> = new Set()
): Record<string, StatusKey> {
  const out: Record<string, StatusKey> = {};
  for (const h of history) {
    const running = !h.endTime && !h.canceled;
    if (running) out[h.activityId] = openTaskBpmnIds.has(h.activityId) ? 'action' : 'active';
    else if (h.endTime && !h.canceled && out[h.activityId] !== 'active') out[h.activityId] = 'done';
  }
  return out;
}
```

Nodes absent from the map already default to `'todo'` via `st()` in the renderer, so no node needs an explicit entry.

- [ ] **Step 5: Delete the old component**

```bash
git rm packages/frontend/src/components/InfraBoardDashboard/Fase1Swimlane.tsx \
       packages/frontend/src/components/InfraBoardDashboard/Fase1Swimlane.test.tsx
```

- [ ] **Step 6: Run the checks**

```bash
npx tsc --noEmit -p packages/frontend/tsconfig.json
npm test --workspace=@ronl/frontend -- ProjectDetail
```

Expected: typecheck clean, ProjectDetail tests pass.

- [ ] **Step 7: Hand the full suite to the user**

Do not substitute a focused run for the user's own full-suite check. Ask them to run:

```
npm test --workspace=@ronl/frontend
npm test --workspace=@ronl/backend
```

and wait for their green.

- [ ] **Step 8: Stage and ask**

```bash
git add -A packages/frontend/src packages/backend/src
```

Suggested message:

```
feat(infra-board): derive every phase swimlane from deployed BPMN
```

---

## Notes for the reviewer

**What this deliberately changes, all agreed with the user:**

1. **R2.1's diagram looks different.** Its 7 curated lanes become the BPMN's 9; `Intake-overleg / Accordering` was a merge that exists nowhere in the model.
2. **R2.1 shows fewer doc badges.** Only `ronl:documentRef`-tagged tasks get one. A badge now means what the BPMN asserts rather than what someone typed.
3. **The mock "nog niet gemodelleerd" panel mostly disappears.** Fetching by key means mock portfolio rows get a real diagram too. The panel remains as the failure fallback.

**What could go wrong that tests may not catch:**

- Layering quality. Longest-path layering is correct but not necessarily pretty; R6.1 (74 shapes, three parallel streams) and R5.2 (weekly loop) are the phases where a grid may look cramped. Ask the user to look at those two in the browser rather than standing up a headless browser.
- R5.3 can be entered more than once per project, and three of its four exits return to R5.2. Nothing in this plan assumes single entry, but the ladder rendering elsewhere may.
