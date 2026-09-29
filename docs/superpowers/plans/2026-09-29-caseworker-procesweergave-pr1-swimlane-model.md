# Caseworker procesweergave — PR 1: definition-scoped swimlane model

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The backend serves a swimlane model for any deployed process definition, not only for a RIP phase. The model carries the node kinds, lane candidate groups and explicit Awb phases that the caseworker procesweergave needs.

**Architecture:** `parseSwimlane` stays the one pure BPMN → model function. It gains three node kinds (`script`, `rule`, `call`), per-node `dmn`/`calls`/`formRef`, per-lane `candidateGroups`, and `awbPhase`. `awbPhase` is read from a new `ronl:awbPhase` attribute and inherited along forward edges. One route, `/v1/process/definition/key/:key/swimlane`, reuses the Infra-board path `getPhaseSwimlaneModel` (key resolved under the caller’s tenant, model cached by definition id). The Awb markers are added to the LDE BPMN (both LDE copies). The engine is **not** redeployed in this PR.

**Tech Stack:** TypeScript, Express, fast-xml-parser, Jest + supertest (backend), `@ronl/shared` (tsc build), Node test runner in LDE (`npm test`).

**Spec:** `caseworker-procesweergave-handoff/CLAUDE-CODE-PROMPT.md` §2 and the marker part of §5, plus `caseworker-procesweergave-handoff/README.md`. The handoff folder is scratch input. Never commit it.

## Decisions already made (2026-09-29, with the user)

- Awb phase source: a **`ronl:awbPhase` attribute** on flow nodes. Only phase-entry nodes carry it, and the others inherit from their predecessor.
- BPMN change: **fixtures only, no deploy.** Edit LDE on its own branch, and copy the result into RBA parser fixtures. Until someone redeploys, live models carry no `awbPhase`. "Waar sta ik" is then hidden (PR 3), and nothing else is affected.
- Business questions 2–4 use the brief's defaults. None of them touch PR 1.
- Tenant scoping: **align with the Infra-board.** The model is resolved by key under the caller’s tenant (`getByKeyWithTenantFallback`), and there is no by-id route and no tenant comparison.
- Execution: native (superpowers:executing-plans).
- Three PRs. This plan is PR 1. PRs 2 and 3 are outlined at the end.

## Global Constraints

- English code and comments. This PR adds no Dutch UI copy.
- Awb phase codes, exactly: `1`, `2`, `3`, `4+5`, `6`, `7`, `8`, `archivering`. Names: Rechtsbetrekking, Ontvangst, Ontvankelijkheid, Behandeling en besluit, Bekendmaking, Betaling, Ketenproces, Archivering.
- Cache by **definition id**, never by key (see the class comment at the top of `OperatonService`).
- Keep the Infra-board pixel-identical: RIP models must not change except for the new optional `processKey`/`processName`/`candidateGroups` fields.
- Don't hard-code `Lane_Behandelaar → caseworker`. Derive lane groups from user tasks.
- Don't derive Awb phases from task names.
- The `__fixtures__/` root must still hold exactly twelve `.bpmn` files, because `bpmn-swimlane.test.ts` asserts that. New fixtures go in `__fixtures__/awb/`.
- Git: branch first, **ask before every commit**, and never merge. The handoff folder stays untracked. Never pass `--no-verify`, and never touch the engine or a dev server.
- Frontend: untouched in this PR, so the e2e handoff is not required. `npm test` across all workspaces is. The frontend compiles against the changed `@ronl/shared` types.

## Review Focus

1. **A process key that is a path**, for example `..%2Fdeployment`. The route must answer 400 before any Operaton call is made. Pinned in Task 7.
2. **A marker value that isn't a known code** (`"4 + 5"`, `"9"`, `""`). Ignore it as if the node had no marker. Never emit an unknown code. Pinned in Task 5.
3. **A rework loop from a later phase back into an earlier node.** The earlier node keeps its own phase: inheritance runs over forward edges only. Pinned in Task 5.
4. **`candidateGroups` holding an expression** (`${assignee}`) or spaces/duplicates. Emit only literal group names, trimmed, unique and sorted. Pinned in Task 4.
5. **A key deployed only under another tenant.** It must not resolve: the lookup is tenant-scoped with an untenanted fallback only, the same as on the Infra-board. Covered by the existing `getByKeyWithTenantFallback` tests, and the route passes `req.user.tenantId` (pinned in Task 7).

---

## File structure

| File                                                                                                                  | Change | Responsibility                                                             |
| --------------------------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------- |
| `linked-data-explorer/e2e-fixtures/flevoland/AwbShellProcess.bpmn`                                                    | modify | + `ronl:awbPhase` markers (deploy source)                                  |
| `linked-data-explorer/e2e-fixtures/flevoland/TreeFellingPermitSubProcessE2E.bpmn`                                     | modify | + marker on `SubStart`                                                     |
| `linked-data-explorer/packages/frontend/public/examples/flevoland/{AwbShellProcess,TreeFellingPermitSubProcess}.bpmn` | modify | the same edit; `public-example-fixture-parity.test.ts` demands byte parity |
| `packages/backend/src/rip-swimlane/__fixtures__/awb/{AwbShellProcess,TreeFellingPermitSubProcess}.bpmn`               | create | parser fixtures, copied from LDE `public/examples` (already de-badged)     |
| `packages/shared/src/awb-phases.ts`                                                                                   | create | `AWB_PHASES`, `AwbPhaseCode`, `isAwbPhaseCode`, `awbPhaseIndex`            |
| `packages/shared/src/rip-swimlane.ts`                                                                                 | modify | new kinds and optional fields                                              |
| `packages/shared/src/index.ts`                                                                                        | modify | export `awb-phases`                                                        |
| `packages/backend/src/rip-swimlane/bpmn-swimlane.ts`                                                                  | modify | kinds, attrs, lane groups, awbPhase                                        |
| `packages/backend/src/rip-swimlane/doc-label.ts`                                                                      | modify | curated label + underscore humanising                                      |
| `packages/backend/src/rip-swimlane/bpmn-swimlane.test.ts`                                                             | modify | Awb fixtures + inline edge cases                                           |
| `packages/backend/src/rip-swimlane/doc-label.test.ts`                                                                 | modify | new cases                                                                  |
| `packages/backend/src/services/operaton.service.ts`                                                                   | modify | doc comments only                                                          |
| `packages/backend/src/services/operaton.service.test.ts`                                                              | modify | Awb model via the existing key path                                        |
| `packages/backend/src/routes/process.routes.ts`                                                                       | modify | one GET route                                                              |
| `packages/backend/src/routes/process.routes.test.ts`                                                                  | modify | route tests + OpenAPI conformance                                          |
| `packages/backend/openapi/openapi.yaml`                                                                               | modify | one operation (the coverage test demands it)                               |

---

### Task 1: Awb markers in the BPMN (LDE) and RBA parser fixtures

**Files:**

- Modify (LDE, on branch `feat/awb-phase-markers` from an up-to-date `acc`): the four BPMN files listed above
- Create (RBA, on branch `feat/caseworker-swimlane-model` from `acc`): `packages/backend/src/rip-swimlane/__fixtures__/awb/AwbShellProcess.bpmn`, `…/awb/TreeFellingPermitSubProcess.bpmn`

**Interfaces:**

- Produces: two fixtures carrying these markers, which Tasks 3–5 assert against:

| Process                     | Node                       | `ronl:awbPhase` |
| --------------------------- | -------------------------- | --------------- |
| AwbShellProcess             | `StartEvent_AWB`           | `1`             |
|                             | `Task_Phase2_Receipt`      | `2`             |
|                             | `Task_Phase3_Completeness` | `3`             |
|                             | `Task_Phase45_Process`     | `4+5`           |
|                             | `Task_Phase6_Notify`       | `6`             |
|                             | `Gateway_Payment`          | `7`             |
|                             | `Gateway_Chain`            | `8`             |
|                             | `Task_ArchivesDMN`         | `archivering`   |
| TreeFellingPermitSubProcess | `SubStart`                 | `4+5`           |

The gateways carry explicit markers because inheritance alone would put `Gateway_Payment` in 6 and `Gateway_Chain` in 7. The design (`CWP_AWB_PHASES` in `reference/mock-proces.reference.jsx`) opens phase 7 and phase 8 at those gateways.

- [ ] **Step 1: Branch both repos.** In LDE: `git fetch --prune origin && git switch acc && git merge --ff-only origin/acc && git switch -c feat/awb-phase-markers`. In RBA: `git switch -c feat/caseworker-swimlane-model` (from `acc`).
- [ ] **Step 2: Add the attribute** to each listed element in all four LDE files, as the last attribute on the element's opening tag, for example:

```xml
<bpmn:startEvent id="StartEvent_AWB" name="Aanvraag ingediend" camunda:formRef="kapvergunning-start" camunda:formRefBinding="deployment" ronl:awbPhase="1">
```

`xmlns:ronl="http://ronl.nl/schema/1.0"` is already declared in both files. Make the same edit in the `e2e-fixtures/` and `public/examples/` copies.

- [ ] **Step 3: Run the LDE fixture tests.** Run: `npm test --workspace=packages/backend -- e2e-fixtures public-example-fixture-parity` (check the workspace name in LDE's root `package.json` first). Expected: PASS. A parity failure means the two copies differ, so fix the copy it names.
- [ ] **Step 4: Copy into RBA.** Copy `linked-data-explorer/packages/frontend/public/examples/flevoland/AwbShellProcess.bpmn` and `…/TreeFellingPermitSubProcess.bpmn` to `packages/backend/src/rip-swimlane/__fixtures__/awb/`. Then verify each one matches the handoff reference except for the markers: `diff caseworker-procesweergave-handoff/reference/bpmn/AwbShellProcess.bpmn packages/backend/src/rip-swimlane/__fixtures__/awb/AwbShellProcess.bpmn` should show only the 8 marker lines, and the subprocess diff only 1.
- [ ] **Step 5: Report staged work in both repos and ask before committing.** Suggested messages: LDE `feat(bpmn): mark Awb phases on the kapvergunning shell and subprocess`; RBA `test(swimlane): add the Awb kapvergunning parser fixtures`.

---

### Task 2: Shared types and the Awb phase table

**Files:**

- Create: `packages/shared/src/awb-phases.ts`
- Modify: `packages/shared/src/rip-swimlane.ts`, `packages/shared/src/index.ts`

**Interfaces:**

- Produces:
  - `AWB_PHASES: readonly { code: AwbPhaseCode; name: string }[]`
  - `type AwbPhaseCode = '1'|'2'|'3'|'4+5'|'6'|'7'|'8'|'archivering'`
  - `isAwbPhaseCode(v: string): v is AwbPhaseCode`, `awbPhaseIndex(code: AwbPhaseCode): number`
  - `NodeKind` + `'script' | 'rule' | 'call'`
  - `SwimLane.candidateGroups?: string[]`
  - `SwimNode.dmn?: string; calls?: string; formRef?: string; awbPhase?: AwbPhaseCode`
  - `PhaseSwimlaneModel.processKey?: string; processName?: string`

- [ ] **Step 1: Write `awb-phases.ts`**

```ts
/**
 * The Awb phases a caseworker process moves through, in order. Phases 4 and 5
 * are one step because the kapvergunning subprocess handles treatment and
 * decision together. The code is what `ronl:awbPhase` carries in the BPMN;
 * the name is the stepper's label.
 */
export const AWB_PHASES = [
  { code: '1', name: 'Rechtsbetrekking' },
  { code: '2', name: 'Ontvangst' },
  { code: '3', name: 'Ontvankelijkheid' },
  { code: '4+5', name: 'Behandeling en besluit' },
  { code: '6', name: 'Bekendmaking' },
  { code: '7', name: 'Betaling' },
  { code: '8', name: 'Ketenproces' },
  { code: 'archivering', name: 'Archivering' },
] as const;

export type AwbPhaseCode = (typeof AWB_PHASES)[number]['code'];

const CODES: readonly string[] = AWB_PHASES.map((p) => p.code);

export function isAwbPhaseCode(value: string): value is AwbPhaseCode {
  return CODES.includes(value);
}

/** Position in AWB_PHASES; later phases compare greater. */
export function awbPhaseIndex(code: AwbPhaseCode): number {
  return CODES.indexOf(code);
}
```

- [ ] **Step 2: Extend `rip-swimlane.ts`.** Change `NodeKind` to

```ts
export type NodeKind =
  | 'start'
  | 'end'
  | 'task'
  | 'service'
  | 'gateway'
  | 'parallel'
  /** scriptTask: runs in the engine, no human involved. */
  | 'script'
  /** businessRuleTask: evaluates a DMN decision (see SwimNode.dmn). */
  | 'rule'
  /** callActivity: starts another process (see SwimNode.calls). */
  | 'call';
```

Add `candidateGroups?: string[]` to `SwimLane`, with a doc comment: _"Literal candidateGroups of the user tasks in this lane, unique and sorted. Absent when the lane has none."_ Add these fields to `SwimNode`, each with a one-line doc comment: `dmn?: string` (decisionRef of a `rule` node), `calls?: string` (calledElement key of a `call` node), `formRef?: string` (`camunda:formRef`), and `awbPhase?: AwbPhaseCode` (_"explicit `ronl:awbPhase`, or inherited from the latest-phase forward predecessor"_). Import the type with `import type { AwbPhaseCode } from './awb-phases';`. Add `processKey?: string; processName?: string` to `PhaseSwimlaneModel` (the `bpmn:process` id and name).

- [ ] **Step 3: Export.** Add `export * from './awb-phases';` to `index.ts`.
- [ ] **Step 4: Build and typecheck.** Run: `npm run build --workspace=@ronl/shared && npm run type-check --workspaces --if-present` (use the typecheck script name the repo defines, with `grep '"type' package.json packages/*/package.json`). Expected: clean. The frontend compares `kind` only with `===`, so the new kinds fall through to the task box and no switch becomes non-exhaustive.

(No separate commit: `@ronl/shared` has no test runner, so this task's deliverable is proven by Tasks 3–5. Commit it with Task 3.)

---

### Task 3: Parser — new kinds, node attributes, process identity, doc labels

**Files:**

- Modify: `packages/backend/src/rip-swimlane/bpmn-swimlane.ts`, `packages/backend/src/rip-swimlane/doc-label.ts`
- Test: `packages/backend/src/rip-swimlane/bpmn-swimlane.test.ts`, `packages/backend/src/rip-swimlane/doc-label.test.ts`

**Interfaces:**

- Consumes: Task 2 types; Task 1 fixtures.
- Produces: `parseSwimlane(xml, phaseCode)` (signature unchanged), which now emits `kind: 'script'|'rule'|'call'`, `dmn`, `calls`, `formRef`, `processKey` and `processName`. The route layer calls it with `phaseCode = processKey`.

- [ ] **Step 1: Write failing tests.** Append to `bpmn-swimlane.test.ts`:

```ts
const AWB = join(FIXTURES, 'awb');
const awbXml = (key: string) => readFileSync(join(AWB, `${key}.bpmn`), 'utf-8');
const node = (m: ReturnType<typeof parseSwimlane>, id: string) => {
  const n = m.nodes.find((x) => x.id === id);
  if (!n) throw new Error(`no node ${id}`);
  return n;
};

describe('parseSwimlane — Awb kapvergunning', () => {
  const shell = parseSwimlane(awbXml('AwbShellProcess'), 'AwbShellProcess');
  const sub = parseSwimlane(awbXml('TreeFellingPermitSubProcess'), 'TreeFellingPermitSubProcess');

  it('names the process it parsed', () => {
    expect(shell.processKey).toBe('AwbShellProcess');
    expect(shell.processName).toBeTruthy();
    expect(sub.processKey).toBe('TreeFellingPermitSubProcess');
  });

  it('reads the lanes in DI order', () => {
    expect(shell.lanes.map((l) => l.key)).toEqual([
      'Lane_Aanvrager',
      'Lane_Behandelaar',
      'Lane_Systeem',
    ]);
    expect(sub.lanes.map((l) => l.key)).toEqual(['Lane_Behandelaar', 'Lane_Systeem']);
  });

  it('classifies script, rule and call nodes', () => {
    expect(node(shell, 'Task_Phase1_Identity').kind).toBe('script');
    expect(node(shell, 'Task_Phase3_Completeness').kind).toBe('rule');
    expect(node(shell, 'Task_Phase45_Process').kind).toBe('call');
    expect(node(shell, 'Task_Phase6_Notify').kind).toBe('task');
    expect(node(sub, 'Sub_AssessPermit').kind).toBe('rule');
  });

  it('carries the decision, the call target and the form', () => {
    expect(node(shell, 'Task_Phase3_Completeness').dmn).toBe('AwbCompletenessCheck');
    expect(node(sub, 'Sub_AssessReplacement').dmn).toBe('ReplacementTreeDecision');
    expect(node(shell, 'Task_Phase45_Process').calls).toBe('TreeFellingPermitSubProcess');
    expect(node(shell, 'StartEvent_AWB').formRef).toBe('kapvergunning-start');
    expect(node(sub, 'Sub_CaseReview').formRef).toBe('tree-felling-review');
    expect(node(shell, 'Task_Phase1_Identity').formRef).toBeUndefined();
    expect(node(shell, 'Task_Phase1_Identity').dmn).toBeUndefined();
  });

  it('resolves the beschikking document to its label', () => {
    expect(node(shell, 'Task_Phase6_Notify').docs).toEqual(['Beschikking kapvergunning']);
  });

  it('stacks the granted and rejected branches in one cell', () => {
    const g = node(sub, 'Sub_SetGranted');
    const r = node(sub, 'Sub_SetRejected');
    expect([g.row, g.col]).toEqual([r.row, r.col]);
  });

  it('finds no back edges in the shell', () => {
    expect(shell.edges.filter((e) => e.back)).toEqual([]);
  });
});

describe('parseSwimlane — RIP models are unaffected by the new kinds', () => {
  it.each(ALL)('%s has no script, rule or call node', (code, key) => {
    const kinds = new Set(parseSwimlane(xml(key), code).nodes.map((n) => n.kind));
    for (const k of ['script', 'rule', 'call'] as const) expect(kinds.has(k)).toBe(false);
  });
});

describe('parseSwimlane — no laneSet', () => {
  it('returns a model without lanes, every node on row 0', () => {
    const model = parseSwimlane(
      `<?xml version="1.0"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <bpmn:process id="P" name="Zonder lanes">
    <bpmn:startEvent id="S"><bpmn:outgoing>F1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:userTask id="T"><bpmn:incoming>F1</bpmn:incoming></bpmn:userTask>
    <bpmn:sequenceFlow id="F1" sourceRef="S" targetRef="T"/>
  </bpmn:process>
</bpmn:definitions>`,
      'P'
    );
    expect(model.lanes).toEqual([]);
    expect(model.nodes.map((n) => n.row)).toEqual([0, 0]);
    expect(model.processKey).toBe('P');
  });
});
```

Extend `doc-label.test.ts`:

```ts
it('labels the kapvergunning beschikking', () => {
  expect(docLabel('example_treefelling_beschikking')).toBe('Beschikking kapvergunning');
});
it('humanises underscores as well as hyphens', () => {
  expect(docLabel('some_other-doc')).toBe('Some other doc');
});
```

- [ ] **Step 2: Run them to see them fail.** Run: `npm test --workspace=@ronl/backend -- rip-swimlane`. Expected: FAIL on kinds (`task` ≠ `script`), `dmn`/`calls`/`formRef`/`processKey` undefined, and the doc label.
- [ ] **Step 3: Implement.** In `bpmn-swimlane.ts`:

  1. In `KINDS`, map `scriptTask: 'script'`, `businessRuleTask: 'rule'`, `callActivity: 'call'` and leave the rest as they are. Update the comment above `KINDS` to say that these three are distinct kinds because the caseworker view labels and styles them differently, and that no RIP phase uses them (pinned by the RIP-unaffected test).
  2. Add after `textOf`:

```ts
/**
 * A (possibly namespaced) attribute by its LOCAL name: removeNSPrefix turns
 * `camunda:decisionRef` into `@_decisionRef` and `ronl:awbPhase` into
 * `@_awbPhase`. Blank counts as absent.
 */
function attr(el: XmlNode, local: string): string | undefined {
  const v = el[`@_${local}`];
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s === '' ? undefined : s;
}
```

3. In the node loop, after `docs`, compute the values and spread them into the pushed node:

```ts
const dmn = kind === 'rule' ? attr(el, 'decisionRef') : undefined;
const calls = kind === 'call' ? attr(el, 'calledElement') : undefined;
const formRef = attr(el, 'formRef');
// …in nodes.push({...}):
...(dmn ? { dmn } : {}),
...(calls ? { calls } : {}),
...(formRef ? { formRef } : {}),
```

4. Return the process identity only when present, so the existing `<foo>` empty-model test still gets its exact four keys:

```ts
const processKey = attr(process, 'id');
const processName = attr(process, 'name');
return {
  phaseCode,
  ...(processKey ? { processKey } : {}),
  ...(processName ? { processName } : {}),
  lanes,
  nodes,
  edges,
};
```

In `doc-label.ts`, add `'example_treefelling_beschikking': 'Beschikking kapvergunning'` to `DOC_LABELS`. Broaden its comment: the table now serves any process view, not only RIP. Change the humaniser to `.replace(/[-_]/g, ' ')`.

- [ ] **Step 4: Run the tests.** Same command. Expected: PASS, including every pre-existing RIP test.
- [ ] **Step 5: Report staged work and ask before committing.** Suggested message: `feat(swimlane): parse script, rule and call nodes with their targets`. This includes Task 2's files.

---

### Task 4: Parser — lane candidateGroups

**Files:**

- Modify: `packages/backend/src/rip-swimlane/bpmn-swimlane.ts`
- Test: `packages/backend/src/rip-swimlane/bpmn-swimlane.test.ts`

**Interfaces:**

- Produces: `SwimLane.candidateGroups`, which PR 3 intersects with the token's groups for JOUW ROL.

- [ ] **Step 1: Write failing tests**

```ts
describe('parseSwimlane — lane candidateGroups', () => {
  it('derives the Behandelaar group from its user tasks, and none for the other lanes', () => {
    const shell = parseSwimlane(awbXml('AwbShellProcess'), 'AwbShellProcess');
    const byKey = Object.fromEntries(shell.lanes.map((l) => [l.key, l.candidateGroups]));
    expect(byKey).toEqual({
      Lane_Aanvrager: undefined,
      Lane_Behandelaar: ['caseworker'],
      Lane_Systeem: undefined,
    });
    const sub = parseSwimlane(awbXml('TreeFellingPermitSubProcess'), 'TreeFellingPermitSubProcess');
    expect(sub.lanes.find((l) => l.key === 'Lane_Behandelaar')?.candidateGroups).toEqual([
      'caseworker',
    ]);
  });

  it('keeps literal groups only: trimmed, unique, sorted, expressions dropped', () => {
    const model = parseSwimlane(
      `<?xml version="1.0"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
  <bpmn:process id="P">
    <bpmn:laneSet><bpmn:lane id="L"><bpmn:flowNodeRef>A</bpmn:flowNodeRef><bpmn:flowNodeRef>B</bpmn:flowNodeRef></bpmn:lane></bpmn:laneSet>
    <bpmn:userTask id="A" camunda:candidateGroups=" zeta , caseworker,\${dyn}"/>
    <bpmn:userTask id="B" camunda:candidateGroups="caseworker"/>
  </bpmn:process>
</bpmn:definitions>`,
      'P'
    );
    expect(model.lanes[0].candidateGroups).toEqual(['caseworker', 'zeta']);
  });
});
```

(Inside a template literal, `\${dyn}` yields the literal `${dyn}`.)

- [ ] **Step 2: Run them to see them fail.** `npm test --workspace=@ronl/backend -- bpmn-swimlane`. Expected: FAIL, `candidateGroups` undefined.
- [ ] **Step 3: Implement.** Add the helper:

```ts
/**
 * Literal group names from a candidateGroups attribute. An expression
 * (`${…}` / `#{…}`) names no group until runtime, so it cannot tell the UI
 * which lane is the user's; it is dropped rather than shown as a group.
 */
function literalGroups(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((g) => g.trim())
    .filter((g) => g !== '' && !/^[$#]\{/.test(g));
}
```

After the node loop, before flows are read:

```ts
// ── lane → candidateGroups, from the user tasks drawn in each lane ───────
const groupsByRow = new Map<number, Set<string>>();
for (const el of childNodes(process, 'userTask')) {
  const row = rowOf.get(String(el['@_id']));
  if (row === undefined) continue;
  const set = groupsByRow.get(row) ?? new Set<string>();
  for (const g of literalGroups(attr(el, 'candidateGroups'))) set.add(g);
  groupsByRow.set(row, set);
}
const lanesWithGroups: SwimLane[] = lanes.map((lane, row) => {
  const groups = [...(groupsByRow.get(row) ?? [])].sort();
  return groups.length > 0 ? { ...lane, candidateGroups: groups } : lane;
});
```

Return `lanes: lanesWithGroups`.

- [ ] **Step 4: Run the tests.** Expected: PASS, with the RIP suites unchanged.
- [ ] **Step 5: Report staged work and ask before committing.** Suggested message: `feat(swimlane): derive each lane's candidate groups from its user tasks`.

---

### Task 5: Parser — `ronl:awbPhase` with inheritance

**Files:**

- Modify: `packages/backend/src/rip-swimlane/bpmn-swimlane.ts`
- Test: `packages/backend/src/rip-swimlane/bpmn-swimlane.test.ts`

**Interfaces:**

- Consumes: `isAwbPhaseCode`, `awbPhaseIndex`, `AwbPhaseCode` from `@ronl/shared`.
- Produces: `SwimNode.awbPhase`. PR 3 builds the stepper from it.

- [ ] **Step 1: Write failing tests**

```ts
describe('parseSwimlane — Awb phases', () => {
  it('puts every shell node in the phase the design groups it under', () => {
    const shell = parseSwimlane(awbXml('AwbShellProcess'), 'AwbShellProcess');
    const phaseOf = Object.fromEntries(shell.nodes.map((n) => [n.id, n.awbPhase]));
    expect(phaseOf).toEqual({
      StartEvent_AWB: '1',
      Task_Phase1_Identity: '1',
      Task_Phase2_Receipt: '2',
      Task_Phase3_Completeness: '3',
      Gateway_Complete: '3',
      Task_RequestMissingInfo: '3',
      Gateway_StillIncomplete: '3',
      Task_RefuseToProcess: '3',
      Task_Phase45_Process: '4+5',
      Task_Phase6_Notify: '6',
      Gateway_Payment: '7',
      Task_Phase7_Payment: '7',
      Gateway_Chain: '8',
      Task_Phase8_Forward: '8',
      Task_ArchivesDMN: 'archivering',
      Task_ArchiveRecord: 'archivering',
      EndEvent_AWB: 'archivering',
    });
  });

  it('puts the whole subprocess in 4+5', () => {
    const sub = parseSwimlane(awbXml('TreeFellingPermitSubProcess'), 'TreeFellingPermitSubProcess');
    expect(new Set(sub.nodes.map((n) => n.awbPhase))).toEqual(new Set(['4+5']));
  });

  it.each(ALL)('%s carries no Awb phase', (code, key) => {
    expect(parseSwimlane(xml(key), code).nodes.some((n) => n.awbPhase !== undefined)).toBe(false);
  });

  const proc = (body: string) =>
    parseSwimlane(
      `<?xml version="1.0"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:ronl="http://ronl.nl/schema/1.0">
  <bpmn:process id="P">${body}</bpmn:process>
</bpmn:definitions>`,
      'P'
    );

  it('ignores a marker that is not a known Awb phase', () => {
    const m = proc(`
      <bpmn:startEvent id="S" ronl:awbPhase="4 + 5"/>
      <bpmn:userTask id="T" ronl:awbPhase="9"/>
      <bpmn:sequenceFlow id="F" sourceRef="S" targetRef="T"/>`);
    expect(m.nodes.map((n) => n.awbPhase)).toEqual([undefined, undefined]);
  });

  it('takes the latest phase where branches join', () => {
    const m = proc(`
      <bpmn:startEvent id="S" ronl:awbPhase="6"/>
      <bpmn:exclusiveGateway id="G" ronl:awbPhase="7"/>
      <bpmn:userTask id="J"/>
      <bpmn:sequenceFlow id="F1" sourceRef="S" targetRef="G"/>
      <bpmn:sequenceFlow id="F2" sourceRef="S" targetRef="J"/>
      <bpmn:sequenceFlow id="F3" sourceRef="G" targetRef="J"/>`);
    expect(m.nodes.find((n) => n.id === 'J')?.awbPhase).toBe('7');
  });

  it('does not let a rework loop pull an earlier node into a later phase', () => {
    const m = proc(`
      <bpmn:startEvent id="S" ronl:awbPhase="1"><bpmn:outgoing>F1</bpmn:outgoing></bpmn:startEvent>
      <bpmn:userTask id="A"><bpmn:outgoing>F2</bpmn:outgoing></bpmn:userTask>
      <bpmn:userTask id="B" ronl:awbPhase="3"><bpmn:outgoing>F3</bpmn:outgoing></bpmn:userTask>
      <bpmn:exclusiveGateway id="G"><bpmn:outgoing>F4</bpmn:outgoing><bpmn:outgoing>F5</bpmn:outgoing></bpmn:exclusiveGateway>
      <bpmn:endEvent id="E"/>
      <bpmn:sequenceFlow id="F1" sourceRef="S" targetRef="A"/>
      <bpmn:sequenceFlow id="F2" sourceRef="A" targetRef="B"/>
      <bpmn:sequenceFlow id="F3" sourceRef="B" targetRef="G"/>
      <bpmn:sequenceFlow id="F4" sourceRef="G" targetRef="E"/>
      <bpmn:sequenceFlow id="F5" sourceRef="G" targetRef="A"/>`);
    const phaseOf = Object.fromEntries(m.nodes.map((n) => [n.id, n.awbPhase]));
    expect(phaseOf).toEqual({ S: '1', A: '1', B: '3', G: '3', E: '3' });
  });
});
```

Inline XML may only use element types that are in `KINDS` (`<bpmn:task>` is not, so it would never become a node).

- [ ] **Step 2: Run them to see them fail.** Expected: FAIL, `awbPhase` undefined everywhere.
- [ ] **Step 3: Implement.** Import `{ awbPhaseIndex, isAwbPhaseCode, type AwbPhaseCode }` from `@ronl/shared`. In the node loop, collect explicit markers:

```ts
const explicitPhases = new Map<string, AwbPhaseCode>(); // declared before the loop
// inside the loop:
const marker = attr(el, 'awbPhase');
if (marker !== undefined && isAwbPhaseCode(marker)) explicitPhases.set(id, marker);
```

Add the function next to `assignColumns`:

```ts
/**
 * Awb phase per node. A node's own `ronl:awbPhase` wins; an unmarked node
 * takes the LATEST phase among its forward predecessors, so a join after an
 * optional step (payment) lands in the later phase. Back edges are excluded
 * for the same reason they are excluded from layering: a rework loop must
 * not drag an earlier step into a later phase.
 *
 * Visits nodes in column order. After assignColumns every forward edge
 * points strictly rightwards, so each predecessor is settled before its
 * successor is read. A process with no markers gets no phases at all,
 * which is how the UI knows to hide the stepper.
 */
function assignAwbPhases(
  nodes: SwimNode[],
  forward: RawFlow[],
  explicit: Map<string, AwbPhaseCode>
): void {
  if (explicit.size === 0) return;
  const byId = new Map<string, SwimNode>(nodes.map((n) => [n.id, n]));
  const preds = new Map<string, string[]>();
  for (const f of forward) preds.set(f.to, [...(preds.get(f.to) ?? []), f.from]);
  for (const n of [...nodes].sort((a, b) => a.col - b.col)) {
    const own = explicit.get(n.id);
    if (own) {
      n.awbPhase = own;
      continue;
    }
    let latest: AwbPhaseCode | undefined;
    for (const p of preds.get(n.id) ?? []) {
      const phase = byId.get(p)?.awbPhase;
      if (phase && (latest === undefined || awbPhaseIndex(phase) > awbPhaseIndex(latest)))
        latest = phase;
    }
    if (latest) n.awbPhase = latest;
  }
}
```

In `parseSwimlane`, name the forward flows once and pass them to both layering and phases:

```ts
const forward = flows.filter((f) => !backIds.has(f.id));
assignColumns(nodes, forward, seeds);
assignAwbPhases(nodes, forward, explicitPhases);
```

- [ ] **Step 4: Run the tests.** `npm test --workspace=@ronl/backend -- rip-swimlane`. Expected: PASS.
- [ ] **Step 5: Report staged work and ask before committing.** Suggested message: `feat(swimlane): read Awb phases from ronl:awbPhase and inherit them forward`.

---

### Task 6: Service — prove the existing key path serves Awb models

Decided 2026-09-29: **align with the Infra-board.** The caseworker model is resolved by key under the caller's tenant, through the method the RIP route already uses: `getPhaseSwimlaneModel(processKey, phaseCode, tenantId)` → `getCurrentDefinitionId` → `getByKeyWithTenantFallback`, cached as `${definitionId}::${phaseCode}`. With `phaseCode = processKey`, no new service method is needed. Accepted trade-off, the same as on the Infra-board: the newest deployed version of a key is drawn, even for a case that started on an older one.

**Files:**

- Modify: `packages/backend/src/services/operaton.service.ts` (doc comments only)
- Test: `packages/backend/src/services/operaton.service.test.ts`

**Interfaces:**

- Consumes: `getPhaseSwimlaneModel(processKey: string, phaseCode: string, tenantId?: string): Promise<PhaseSwimlaneModel>` (unchanged).
- Produces: nothing new. Task 7 calls `getPhaseSwimlaneModel(key, key, req.user.tenantId)`.

- [ ] **Step 1: Write the test** in the existing `describe('getPhaseSwimlaneModel')` block, reusing `routeGet`:

```ts
it('serves a caseworker process under its own key, with the new kinds and phases', async () => {
  const awb = readFileSync(
    join(__dirname, '../rip-swimlane/__fixtures__/awb/AwbShellProcess.bpmn'),
    'utf-8'
  );
  routeGet([
    [
      '/process-definition/key/AwbShellProcess/tenant-id/flevoland',
      { data: { id: 'AwbShellProcess:4:abc' } },
    ],
    ['/process-definition/AwbShellProcess:4:abc/xml', { data: { bpmn20Xml: awb } }],
  ]);
  const model = await svc.getPhaseSwimlaneModel('AwbShellProcess', 'AwbShellProcess', 'flevoland');
  expect(model.phaseCode).toBe('AwbShellProcess');
  expect(model.processKey).toBe('AwbShellProcess');
  const call = model.nodes.find((n) => n.id === 'Task_Phase45_Process');
  expect(call).toMatchObject({
    kind: 'call',
    calls: 'TreeFellingPermitSubProcess',
    awbPhase: '4+5',
  });
});
```

- [ ] **Step 2: Run it.** `npm test --workspace=@ronl/backend -- operaton.service`. Expected: PASS right away, since Tasks 3–5 did the work. This test pins the wiring, so it is not a red/green step.
- [ ] **Step 3: Update the doc comments** on `getPhaseSwimlaneModel` and `phaseSwimlaneCache`: the method now also serves caseworker processes, with `phaseCode` being the process key, via `GET /v1/process/definition/key/:key/swimlane`.
- [ ] **Step 4: Report staged work and ask before committing.** Suggested message: `test(operaton): the phase swimlane path serves caseworker processes by key`.

---

### Task 7: Route and OpenAPI

**Files:**

- Modify: `packages/backend/src/routes/process.routes.ts`, `packages/backend/openapi/openapi.yaml`
- Test: `packages/backend/src/routes/process.routes.test.ts`

**Interfaces:**

- Consumes: `operatonService.getPhaseSwimlaneModel`; `ambiguousDeployment` (already in `process.routes.ts`).
- Produces, for PRs 2/3: `GET /v1/process/definition/key/{key}/swimlane` → `{ success: true, data: PhaseSwimlaneModel }`. Errors: 400 `INVALID_PROCESS_KEY`, 401, 404 `PROCESS_DEFINITION_NOT_FOUND`, 409 `AMBIGUOUS_DEPLOYMENT`, 500 `SWIMLANE_MODEL_FAILED`.

There is no tenant comparison. As on the Infra-board and in `/:key/start-form`, the tenant is part of the lookup, so another tenant's deployment is unreachable.

- [ ] **Step 1: Write failing tests.** First read `process.routes.test.ts` lines 1–80: see how `axios` is mocked (line 50), because the 404 mapping relies on `axios.isAxiosError`. Make the 404 test's rejection satisfy that mock. Add `getPhaseSwimlaneModel: jest.fn()` to the service mock, then:

```ts
describe('GET /definition/key/:key/swimlane', () => {
  const model = { phaseCode: 'TreeFellingPermitSubProcess', lanes: [], nodes: [], edges: [] };
  const path = '/v1/process/definition/key/TreeFellingPermitSubProcess/swimlane';
  const op = ['get', '/process/definition/key/{key}/swimlane'] as const;

  it('resolves the key under the caller tenant, with the key as phase code', async () => {
    svc.getPhaseSwimlaneModel.mockResolvedValue(model);
    const res = await auth(request(app).get(path));
    expect(res.status).toBe(200);
    expectToMatchOperation(res, ...op);
    expect(res.body.data).toEqual(model);
    expect(svc.getPhaseSwimlaneModel).toHaveBeenCalledWith(
      'TreeFellingPermitSubProcess',
      'TreeFellingPermitSubProcess',
      'flevoland'
    );
  });

  it.each(['..%2Fdeployment', 'a%20b', 'x'.repeat(256)])(
    'rejects key %s before calling Operaton',
    async (key) => {
      const res = await auth(request(app).get(`/v1/process/definition/key/${key}/swimlane`));
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_PROCESS_KEY');
      expect(svc.getPhaseSwimlaneModel).not.toHaveBeenCalled();
    }
  );

  it('answers 404 when no deployment matches', async () => {
    svc.getPhaseSwimlaneModel.mockRejectedValue(
      Object.assign(new Error('nf'), { isAxiosError: true, response: { status: 404 } })
    );
    const res = await auth(request(app).get(path));
    expect(res.status).toBe(404);
    expectToMatchOperation(res, ...op);
    expect(res.body.error.code).toBe('PROCESS_DEFINITION_NOT_FOUND');
  });

  it('answers 409 for a key deployed only under other tenants', async () => {
    svc.getPhaseSwimlaneModel.mockRejectedValue(
      new AmbiguousDeploymentError('TreeFellingPermitSubProcess', ['a', 'b'])
    );
    const res = await auth(request(app).get(path));
    expect(res.status).toBe(409);
    expectToMatchOperation(res, ...op);
  });

  it('answers 500 on any other failure, including a non-Error rejection', async () => {
    svc.getPhaseSwimlaneModel.mockRejectedValue('socket hang up');
    const res = await auth(request(app).get(path));
    expect(res.status).toBe(500);
    expectToMatchOperation(res, ...op);
    expect(res.body.error.code).toBe('SWIMLANE_MODEL_FAILED');
  });
});
```

Add the path to the existing 401 `it.each` table near line 536. Check the `AmbiguousDeploymentError` constructor in `@utils/errors`, and whether `getByKeyWithTenantFallback` can throw it at all. If it cannot, drop the 409 test and the 409 response instead of documenting a status that is never served.

- [ ] **Step 2: Run them to see them fail.** `npm test --workspace=@ronl/backend -- process.routes`. Expected: FAIL (Express 404).
- [ ] **Step 3: Implement** in `process.routes.ts`, after the `/:id/activity-history` block:

```ts
/**
 * Operaton process keys are NCName-shaped. The key is concatenated into an
 * engine URL (encoded, but still), so anything else is refused before it can
 * reach one.
 */
const PROCESS_KEY = /^[A-Za-z0-9_.-]{1,255}$/;

/**
 * GET /v1/process/definition/key/:key/swimlane
 * Swimlane model of the definition a key currently resolves to under the
 * caller's tenant -- the Infra-board's path (`/v1/rip/phases/:code/model`),
 * with the key itself as the model's phaseCode. The tenant is part of the
 * lookup, so another tenant's deployment is unreachable and nothing is
 * compared afterwards.
 */
router.get('/definition/key/:key/swimlane', async (req, res) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
  }
  const { key } = req.params;
  if (!PROCESS_KEY.test(key)) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_PROCESS_KEY', message: 'Invalid process definition key' },
    });
  }
  try {
    const model = await operatonService.getPhaseSwimlaneModel(key, key, req.user.tenantId);
    res.json({ success: true, data: model });
  } catch (error) {
    if (error instanceof AmbiguousDeploymentError) return ambiguousDeployment(res, error);
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return res.status(404).json({
        success: false,
        error: { code: 'PROCESS_DEFINITION_NOT_FOUND', message: 'Process definition not found' },
      });
    }
    logger.error('Failed to build process swimlane model', {
      processKey: key,
      tenantId: req.user.tenantId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(500).json({
      success: false,
      error: { code: 'SWIMLANE_MODEL_FAILED', message: 'Failed to build process model' },
    });
  }
});
```

- [ ] **Step 4: Document the operation in `openapi.yaml`**, next to `/process/{id}/activity-history`. Copy the `/rip/phases/{code}/model` 200 schema (`PlainEnvelope` + `data` with `required: [phaseCode, lanes, nodes, edges]`, plus `processKey: { type: string }` and `processName: { type: string }`). Use `operationId: getProcessDefinitionSwimlaneByKey`, `tags: [Process]`, and an inline path parameter `key` (`schema: { type: string, pattern: '^[A-Za-z0-9_.-]{1,255}$' }`). Responses: `401` → `Unauthorized`, `409` → the `AmbiguousDeployment` component (openapi.yaml ~7117), and for 400/404/500 `$ref: '#/components/responses/Error'` with a description naming the code, the same way the existing 500s are written. Run `npm run lint:openapi --workspace=@ronl/backend`. Expected: no errors.
- [ ] **Step 5: Run the tests.** `npm test --workspace=@ronl/backend -- process.routes openapi`. Expected: PASS. Coverage then passes both ways, and conformance passes on every asserted response.
- [ ] **Step 6: Report staged work and ask before committing.** Suggested message: `feat(process): serve a process's swimlane model by key`.

---

### Task 8: Whole-branch verification and hand-off

- [ ] **Step 1:** Run `npm run lint`, `npm run format:check` (or the repo's names) and the typecheck across workspaces. Fix what they name. Don't run prettier on CSS (none is touched here).
- [ ] **Step 2:** Check backend coverage for the touched files: `npm run test:coverage --workspace=@ronl/backend` (or the repo's script). Every touched file must stay at or above the 80% per-file branch floor.
- [ ] **Step 3: Hand off to the user.** Give them `npm test` (all workspaces, from the repo root), the expected result (all suites green, backend count up by the tests added here) and the LDE `npm test`. Wait for their green.
- [ ] **Step 4:** After the green and an explicit go-ahead: push both branches and open two PRs against `acc`, with no attribution lines. The RBA PR body says the engine still runs unmarked BPMN, so `awbPhase` is absent live until someone redeploys. The LDE PR body says it changes deploy content that is not yet deployed. Never merge either PR.

---

## PR 2 (outline — gets its own plan once PR 1 merges)

Shared process components and cross-instance history. Frontend only, so it needs `npm test` + ACC e2e.

- Move `InfraBoardDashboard/PhaseSwimlane.tsx` (+ test) and the `.pb-stepper` markup from `ProjectDetail.tsx` into `components/process/` (`PhaseSwimlane.tsx`, `PhaseStepper.tsx`). The Infra-board imports from there and renders pixel-identically (existing tests green, and the user checks visually).
- `PhaseSwimlane` gets optional props `myLaneKeys`, `onOpenCall(node)` and `scrollToNodeId`, and renders the `script`/`rule`/`call` kinds (dashed + SCRIPT/DMN foot badge; double border + `open ↘`). The props default off, so the Infra-board is unchanged.
- `useProcessSwimlane(processKey)` fetches from the PR 1 route.
- `useTaskProcessContext(task)` → `{ models, history, current: { processKey, nodeId }, awbPhase }`: activity history of the task's instance plus its `superProcessInstanceId` chain, and, for a task in the parent, the finished child instances. Each entry is tagged with its definition and merged in engine order, with `statusById` per process from `nodeStatusFromHistory`. It likely needs a backend addition to expose `superProcessInstanceId` / child instances on the existing tenant-checked history route. Scope that in the PR 2 plan.

## PR 3 (outline)

The caseworker UI (brief §4–§7), following `README.md` §A–§D and screenshots 01–11: the Awb-fase hint in the list item, `CWPWhere` ("Waar sta ik", hidden when no node has `awbPhase`), `CWLaneSteps` (lane groups, transitions, gateway outcomes, Hierna stopping at the first gateway, collapse to 2 groups that resets per task, JOUW ROL from token groups ∩ `lane.candidateGroups`), the overlay (breadcrumb, legend, focus trap, Esc/backdrop, scroll-to-node), the ⌘K entry and the flat-list fallback. New CSS only as `.cwp-*` from `reference/mock-proces.css`, plus a lane-colour map with a neutral fallback. Needs `npm test` + ACC e2e (the e2e only exercises it after the change is deployed), and the user checks it in the browser.
