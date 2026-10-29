# ProcessView Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One BPMN rendering, `ProcessView`, that the Caseworker overlay, the Infra-board and every future dashboard use by design, with the Caseworker's improved look as the only look.

**Architecture:** A public `components/process/ProcessView.tsx` composes the title bar, a stepper slot, a legend and the (now internal) `PhaseSwimlane`. Pure functions in `processMarks.ts` derive task marks, gateway kinds and legend entries from data; `useViewer()` reads who is viewing from the Keycloak token. Two PRs: PR 1 builds the view and moves the Caseworker onto it without touching the Infra-board; PR 2 moves the Infra-board, removes the old opt-in path, adds gateway shapes, the guard test, the step-list gateway fixes and the folded Procesgegevens.

**Tech Stack:** React 18 + TypeScript, Vite, Vitest + Testing Library (jsdom), Playwright, plain scoped CSS.

**Spec:** `docs/superpowers/specs/2026-10-12-process-view-design.md`

## Global Constraints

- **Ask before every `git commit`.** Steps say "stage"; commits happen only at the two PR checkpoints, after the user's own verification and explicit approval. No attribution lines in commits, PR bodies or code.
- **Never `--no-verify`, `HUSKY=0` or any hook bypass.** A failing hook is reported, not silenced.
- **Never start, stop or restart dev servers.** If localhost serves stale code, ask the user to restart or hard-refresh.
- **Never self-drive a browser to verify UI.** Unit tests, type-check, lint and a production build are yours; the browser look is the user's.
- **Frontend changes need the ACC e2e run** (the user runs it) plus `npm test` from the repo root, both green, before each PR's commit.
- **`acc`/`main` change only via a PR the user merges.** Branch: `feat/process-view` (exists; the spec is committed on it as `89599d0`).
- **CSS:** never run Prettier on a `.css` file. `caseworker-process.css` uses one-line rules on purpose. No new hex values: use `--rba-*`, `--v2-*` or `--pb-*`. Moving an existing hex value unchanged is allowed; the hex count from `npm run lint:css:summary` must not rise (baseline: 369 hex warnings). Do not change `#0046ad` literals: they wait on Flevoland's decision under #374 3b.
- **Copy (Dutch, exact):** tabs "jouw taak" / "geclaimd" (rendered uppercase by CSS); legend labels "Afgerond", "Loopt", "Jouw taak", "Geclaimd", "Jouw rol", "Automatisch (script / DMN)", "Beslissing", "Tegelijk / alles klaar", "Nog niet / niet doorlopen"; bar captions "tegelijk" / "alles klaar"; step-list gateway names "Beslissing", "Tegelijk", "Alles klaar", "Samenkomst"; disclosure "Procesgegevens", "Gegevens tonen", "Gegevens verbergen".
- **Sizes (roomy, the only grid from PR 2):** column 240, row 132, node 184×84, gateway diamond 52; slim empty lane 44; bar 8×72; merge dot 14.
- **Test commands:** single file `npx vitest run <path>` from `packages/frontend`; workspace `npm test --workspace=@ronl/frontend`; type-check `npm run type-check --workspace=@ronl/frontend`; lint `npm run lint --workspace=@ronl/frontend`; build `npx vite build --outDir "$TEMP/pv-build" --emptyOutDir` from `packages/frontend` (then delete the folder).

## Review Focus

1. **Assignee form.** `task.assignee` is the Keycloak `sub` (as `TakenInbox`'s "mine" filter assumes). A viewer with no token (`userId: null`) must never get "jouw taak", only "geclaimd" for assigned tasks. Pinned in Task 2.
2. **Overlay on an unassigned task.** Today the overlay always says "jouw taak" for the task it was opened on. Under the assignee rule an unassigned task gets no tab, so its node gets a focus outline (`pv-focus`) instead and is scrolled into view. Pinned in Tasks 4 and 6.
3. **Every lane empty, or no lanes at all.** Slim lanes everywhere and an empty model must not produce NaN or negative SVG sizes. Pinned in Task 4.
4. **The overlay switched to another process.** Tasks belong to the task's own process; on the main process or subprocess view no tab may appear. Pinned in Task 6.
5. **A mock (non-live) Infra-board project.** No tasks, statuses derived: the legend shows only what is there (no "Jouw taak"), and "(live)" is absent. Pinned in Task 9.

---

## File Structure

| File                                                                     | Status                  | Responsibility                                                        |
| ------------------------------------------------------------------------ | ----------------------- | --------------------------------------------------------------------- |
| `packages/frontend/src/components/process/status.ts`                     | create (T1)             | `StatusKey`, `STATUS`: the node status vocabulary                     |
| `packages/frontend/src/pages/infra-board/rip-model.ts`                   | modify (T1)             | re-exports `StatusKey`, `STATUS` from `status.ts`                     |
| `packages/frontend/src/components/process/processMarks.ts`               | create (T2, T8)         | pure: `nodeMarks`, `isIdLabel`, `gatewayKind`, `legendEntries`, types |
| `packages/frontend/src/components/process/useViewer.ts`                  | create (T3)             | `readViewer()`, `useViewer()` from `keycloak.tokenParsed`             |
| `packages/frontend/src/components/process/PhaseSwimlane.tsx`             | modify (T4, T8, T9)     | the drawing; internal to `process/` after T10                         |
| `packages/frontend/src/components/process/ProcessView.tsx`               | create (T5)             | public: title bar, stepper slot, legend, swimlane                     |
| `packages/frontend/src/components/process/process-view.css`              | modify (T4, T5, T8, T9) | swimlane, legend, gateway shapes                                      |
| `packages/frontend/src/components/process/ProcessOverlay.tsx`            | modify (T6)             | Caseworker modal on `ProcessView`                                     |
| `packages/frontend/src/components/CaseworkerDashboardV2/TakenInbox.tsx`  | modify (T6, T11)        | drops `roles` to the overlay; uses `ProcessVarsDisclosure`            |
| `packages/frontend/src/components/process/caseworker-process.css`        | modify (T6, T11, T12)   | old legend and disclosure rules leave; step-list bar dot              |
| `packages/frontend/e2e/process-view.spec.ts`                             | create (T7, T13)        | e2e rules (test 1) and controlled marks (test 2)                      |
| `packages/frontend/src/components/InfraBoardDashboard/ProjectDetail.tsx` | modify (T9, T11)        | Infra-board on `ProcessView`; disclosure                              |
| `packages/frontend/src/components/process/process-view-guard.test.ts`    | create (T10)            | no `PhaseSwimlane` import outside `process/`                          |
| `packages/frontend/src/components/process/ProcessVarsDisclosure.tsx`     | create (T11)            | folded Procesgegevens                                                 |
| `packages/frontend/src/components/process/process-disclosure.css`        | create (T11)            | the disclosure's rules, moved                                         |
| `packages/frontend/src/components/process/laneSteps.ts`                  | modify (T12)            | `gateway`, `idLabel` on steps; gateway names and tags                 |
| `packages/frontend/src/components/process/ProcessLaneSteps.tsx`          | modify (T12)            | renders the gateway names                                             |
| `packages/frontend/src/pages/changelog-data.ts`                          | modify (T13)            | release note                                                          |

---

# PR 1 — the shared view, Caseworker on it

### Task 1: Move the status vocabulary into `process/`

**Files:**

- Create: `packages/frontend/src/components/process/status.ts`
- Modify: `packages/frontend/src/pages/infra-board/rip-model.ts` (the `StatusKey` type and `STATUS` const, currently lines 18–31)
- Modify: `packages/frontend/src/components/process/PhaseSwimlane.tsx:2`, `processContext.ts:7`, `ProcessOverlay.tsx:3`

**Interfaces:**

- Produces: `export type StatusKey = 'done' | 'active' | 'wachtend' | 'risk' | 'overdue' | 'action' | 'todo'` and `export const STATUS: Record<StatusKey, { label: string; short: string; color: string; glyph: string }>` from `components/process/status.ts`. `rip-model.ts` keeps exporting both names.

- [ ] **Step 1: Create `status.ts`** with the type and table moved verbatim:

```ts
/**
 * Node status vocabulary for process diagrams: what a node's status key
 * means and how it is drawn. Moved from pages/infra-board/rip-model.ts so
 * the shared process view does not depend on one dashboard; rip-model
 * re-exports both names for its own importers.
 */
export type StatusKey = 'done' | 'active' | 'wachtend' | 'risk' | 'overdue' | 'action' | 'todo';

export const STATUS: Record<
  StatusKey,
  { label: string; short: string; color: string; glyph: string }
> = {
  done: { label: 'Afgerond', short: 'Afgerond', color: '#3fa535', glyph: '✓' },
  active: { label: 'Loopt', short: 'Loopt', color: '#0046ad', glyph: '●' },
  wachtend: { label: 'Wachtend', short: 'Wacht', color: '#7a5af0', glyph: '○' },
  risk: { label: 'Risico', short: 'Risico', color: '#e5b700', glyph: '▲' },
  overdue: { label: 'Te laat', short: 'Te laat', color: '#b0103c', glyph: '■' },
  action: { label: 'Actie nodig', short: 'Actie', color: '#e70077', glyph: '!' },
  todo: { label: 'Niet gestart', short: 'Gepland', color: '#c2c7d0', glyph: '' },
};
```

- [ ] **Step 2: In `rip-model.ts`**, delete the `StatusKey` type and the `STATUS` const and put this where they were:

```ts
// The status vocabulary lives with the shared process view; re-exported so
// the Infra-board's own importers keep working unchanged.
export { STATUS, type StatusKey } from '../../components/process/status';
```

If anything else in `rip-model.ts` uses `StatusKey` or `STATUS` internally, also add `import { STATUS, type StatusKey } from '../../components/process/status';` at the top (the re-export alone does not bring the names into scope).

- [ ] **Step 3: Point the three `process/` files at `./status`**: in `PhaseSwimlane.tsx` replace `import { STATUS, type StatusKey } from '../../pages/infra-board/rip-model';` with `import { STATUS, type StatusKey } from './status';`; in `ProcessOverlay.tsx` replace the `StatusKey` import with `import type { StatusKey } from './status';`; in `processContext.ts` keep `nodeStatusFromHistory` from rip-model and take `StatusKey` from `./status`:

```ts
import { nodeStatusFromHistory } from '../../pages/infra-board/rip-model';
import type { StatusKey } from './status';
```

- [ ] **Step 4: Type-check and run the affected tests**

Run: `npm run type-check --workspace=@ronl/frontend` → no errors.
Run (from `packages/frontend`): `npx vitest run src/components/process src/components/InfraBoardDashboard src/pages/infra-board` → all pass.

- [ ] **Step 5: Stage**

```bash
git add packages/frontend/src/components/process/status.ts packages/frontend/src/pages/infra-board/rip-model.ts packages/frontend/src/components/process/PhaseSwimlane.tsx packages/frontend/src/components/process/processContext.ts packages/frontend/src/components/process/ProcessOverlay.tsx
```

---

### Task 2: `processMarks.ts` — marks, id labels, gateway kinds, legend

**Files:**

- Create: `packages/frontend/src/components/process/processMarks.ts`
- Test: `packages/frontend/src/components/process/processMarks.test.ts`

**Interfaces:**

- Consumes: `StatusKey` from `./status` (Task 1); `PhaseSwimlaneModel`, `SwimNode`, `SwimEdge`, `Task` from `@ronl/shared`.
- Produces:
  - `export type NodeMark = 'mine' | 'claimed' | 'open'`
  - `export type GatewayKind = 'decision' | 'merge' | 'split' | 'join'`
  - `export interface Viewer { userId: string | null; roles: readonly string[] }`
  - `export type ProcessTask = Pick<Task, 'taskDefinitionKey' | 'assignee'>`
  - `export type LegendKey = 'done' | 'active' | 'mine' | 'claimed' | 'role' | 'auto' | 'decision' | 'parallel' | 'todo'`
  - `export interface LegendEntry { key: LegendKey; label: string }`
  - `export function nodeMarks(model: PhaseSwimlaneModel, tasks: readonly ProcessTask[], viewer: Viewer): Map<string, NodeMark>`
  - `export function isIdLabel(node: SwimNode): boolean`
  - `export function gatewayKind(node: SwimNode, edges: readonly SwimEdge[]): GatewayKind | null`
  - `export function legendEntries(input: { model: PhaseSwimlaneModel; statusById: Record<string, StatusKey>; marks: ReadonlyMap<string, NodeMark>; myLanes: ReadonlySet<string>; roles: readonly string[] }): LegendEntry[]` (shape entries `decision`/`parallel` are added in Task 8)

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import type { PhaseSwimlaneModel, SwimEdge, SwimNode } from '@ronl/shared';
import { gatewayKind, isIdLabel, legendEntries, nodeMarks } from './processMarks';

const node = (id: string, kind: SwimNode['kind'], label = id, row = 0, col = 0): SwimNode => ({
  id,
  bpmnId: id,
  kind,
  label,
  row,
  col,
});

const MODEL: PhaseSwimlaneModel = {
  phaseCode: 'X',
  lanes: [
    { key: 'pl', label: 'Projectleider', candidateGroups: ['rip-projectleider'] },
    { key: 'sys', label: 'Systeem' },
  ],
  nodes: [
    node('a', 'task', 'Taak A', 0, 1),
    node('b', 'task', 'Taak B', 0, 2),
    node('c', 'script', 'Script C', 1, 3),
  ],
  edges: [],
};

const ME = { userId: 'sub-me', roles: ['rip-projectleider'] };

describe('nodeMarks', () => {
  it('marks a task assigned to the viewer mine, to someone else claimed, unassigned open', () => {
    const marks = nodeMarks(
      MODEL,
      [
        { taskDefinitionKey: 'a', assignee: 'sub-me' },
        { taskDefinitionKey: 'b', assignee: 'sub-colleague' },
        { taskDefinitionKey: 'c', assignee: undefined },
      ],
      ME
    );
    expect(Object.fromEntries(marks)).toEqual({ a: 'mine', b: 'claimed', c: 'open' });
  });

  it('takes the strongest mark when a node has several tasks: mine > claimed > open', () => {
    const marks = nodeMarks(
      MODEL,
      [
        { taskDefinitionKey: 'a', assignee: undefined },
        { taskDefinitionKey: 'a', assignee: 'sub-colleague' },
        { taskDefinitionKey: 'a', assignee: 'sub-me' },
        { taskDefinitionKey: 'b', assignee: 'sub-colleague' },
        { taskDefinitionKey: 'b', assignee: undefined },
      ],
      ME
    );
    expect(marks.get('a')).toBe('mine');
    expect(marks.get('b')).toBe('claimed');
  });

  it('ignores a task whose node is not in the model', () => {
    const marks = nodeMarks(MODEL, [{ taskDefinitionKey: 'elsewhere', assignee: 'sub-me' }], ME);
    expect(marks.size).toBe(0);
  });

  it('never marks anything mine for a viewer without a user id', () => {
    const marks = nodeMarks(MODEL, [{ taskDefinitionKey: 'a', assignee: 'sub-me' }], {
      userId: null,
      roles: [],
    });
    expect(marks.get('a')).toBe('claimed');
  });
});

describe('isIdLabel', () => {
  it('is true when the label is the element id (an unnamed BPMN element)', () => {
    expect(isIdLabel(node('Gateway_OnderzoekenSplit', 'parallel'))).toBe(true);
    expect(isIdLabel({ ...node('n1', 'gateway'), bpmnId: 'Gateway_1', label: 'Gateway_1' })).toBe(
      true
    );
  });
  it('is false for a real name', () => {
    expect(isIdLabel(node('g', 'gateway', 'Akkoord?'))).toBe(false);
  });
});

describe('gatewayKind', () => {
  const edges = (from: string[], to: string[], g = 'g'): SwimEdge[] => [
    ...from.map((f) => ({ from: f, to: g })),
    ...to.map((t) => ({ from: g, to: t })),
  ];
  it('exclusive with 2+ outgoing is a decision', () => {
    expect(gatewayKind(node('g', 'gateway'), edges(['x'], ['y', 'z']))).toBe('decision');
  });
  it('exclusive with 1 outgoing and 2+ incoming is a merge', () => {
    expect(gatewayKind(node('g', 'gateway'), edges(['x', 'y'], ['z']))).toBe('merge');
  });
  it('parallel with 2+ outgoing is a split', () => {
    expect(gatewayKind(node('g', 'parallel'), edges(['x'], ['y', 'z']))).toBe('split');
  });
  it('parallel with 2+ incoming and 1 outgoing is a join', () => {
    expect(gatewayKind(node('g', 'parallel'), edges(['x', 'y'], ['z']))).toBe('join');
  });
  it('parallel with 2+ in and 2+ out is a split', () => {
    expect(gatewayKind(node('g', 'parallel'), edges(['w', 'x'], ['y', 'z']))).toBe('split');
  });
  it('exclusive with at most one in and one out is a merge', () => {
    expect(gatewayKind(node('g', 'gateway'), edges(['x'], ['y']))).toBe('merge');
  });
  it('exclusive with 2+ in and 2+ out is a decision', () => {
    expect(gatewayKind(node('g', 'gateway'), edges(['w', 'x'], ['y', 'z']))).toBe('decision');
  });
  it('is null for a non-gateway', () => {
    expect(gatewayKind(node('t', 'task'), [])).toBeNull();
  });
});

describe('legendEntries', () => {
  const keys = (e: { key: string }[]) => e.map((x) => x.key);

  it('lists only the states present, in the fixed order', () => {
    const entries = legendEntries({
      model: MODEL,
      statusById: { a: 'done', b: 'active' },
      marks: new Map([['b', 'claimed' as const]]),
      myLanes: new Set(['pl']),
      roles: ['rip-projectleider', 'other'],
    });
    expect(keys(entries)).toEqual(['done', 'active', 'claimed', 'role', 'auto', 'todo']);
  });

  it('names only the matching groups under "Jouw rol"', () => {
    const entries = legendEntries({
      model: MODEL,
      statusById: {},
      marks: new Map(),
      myLanes: new Set(['pl']),
      roles: ['rip-projectleider', 'unrelated'],
    });
    expect(entries.find((e) => e.key === 'role')?.label).toBe('Jouw rol (rip-projectleider)');
  });

  it('shows "Jouw taak" only when a node is mine, and no role entry without my lanes', () => {
    const entries = legendEntries({
      model: MODEL,
      statusById: { a: 'active' },
      marks: new Map([['a', 'mine' as const]]),
      myLanes: new Set(),
      roles: [],
    });
    expect(keys(entries)).toContain('mine');
    expect(keys(entries)).not.toContain('role');
    expect(keys(entries)).not.toContain('claimed');
  });

  it('has no todo entry when every node has a non-todo status', () => {
    const entries = legendEntries({
      model: MODEL,
      statusById: { a: 'done', b: 'done', c: 'done' },
      marks: new Map(),
      myLanes: new Set(),
      roles: [],
    });
    expect(keys(entries)).toEqual(['done', 'auto']);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run (from `packages/frontend`): `npx vitest run src/components/process/processMarks.test.ts`
Expected: FAIL — cannot resolve `./processMarks`.

- [ ] **Step 3: Implement `processMarks.ts`**

```ts
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/components/process/processMarks.test.ts` → all pass.

- [ ] **Step 5: Stage**

```bash
git add packages/frontend/src/components/process/processMarks.ts packages/frontend/src/components/process/processMarks.test.ts
```

---

### Task 3: `useViewer` — who is viewing, from the token

**Files:**

- Create: `packages/frontend/src/components/process/useViewer.ts`
- Test: `packages/frontend/src/components/process/useViewer.test.ts`

**Interfaces:**

- Consumes: `Viewer` from `./processMarks` (Task 2); the default export of `../../services/keycloak` (a `Keycloak` instance with `tokenParsed`).
- Produces: `export function readViewer(): Viewer` and `export function useViewer(): Viewer`.

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const kc = vi.hoisted(() => ({ tokenParsed: undefined as Record<string, unknown> | undefined }));
vi.mock('../../services/keycloak', () => ({ default: kc }));

import { readViewer, useViewer } from './useViewer';

afterEach(() => {
  kc.tokenParsed = undefined;
  vi.restoreAllMocks();
});

describe('useViewer', () => {
  it('reads sub and realm roles from the token', () => {
    kc.tokenParsed = { sub: 'sub-1', realm_access: { roles: ['caseworker', 'rip-projectleider'] } };
    expect(readViewer()).toEqual({ userId: 'sub-1', roles: ['caseworker', 'rip-projectleider'] });
    const { result } = renderHook(() => useViewer());
    expect(result.current.userId).toBe('sub-1');
  });

  it('is anonymous with no roles without a token', () => {
    expect(readViewer()).toEqual({ userId: null, roles: [] });
  });

  it('logs nothing', () => {
    const log = vi.spyOn(console, 'log');
    kc.tokenParsed = { sub: 'sub-1', bsn: '999993653', realm_access: { roles: [] } };
    readViewer();
    expect(log).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/process/useViewer.test.ts` → FAIL, cannot resolve `./useViewer`.

- [ ] **Step 3: Implement `useViewer.ts`**

```ts
import { useMemo } from 'react';
import keycloak from '../../services/keycloak';
import type { Viewer } from './processMarks';

/**
 * Who is looking at a process view: the Keycloak `sub` (the form a task's
 * `assignee` takes) and the realm roles. Read from the token directly rather
 * than through getUser(), which logs the whole token to the console.
 */
export function readViewer(): Viewer {
  const token = keycloak.tokenParsed as
    { sub?: string; realm_access?: { roles?: string[] } } | undefined;
  return { userId: token?.sub ?? null, roles: token?.realm_access?.roles ?? [] };
}

/** readViewer, memoised on the token's subject. */
export function useViewer(): Viewer {
  const sub = (keycloak.tokenParsed as { sub?: string } | undefined)?.sub;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- re-read when the subject changes
  return useMemo(readViewer, [sub]);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/components/process/useViewer.test.ts` → all pass.

- [ ] **Step 5: Stage**

```bash
git add packages/frontend/src/components/process/useViewer.ts packages/frontend/src/components/process/useViewer.test.ts
```

---

### Task 4: `PhaseSwimlane` takes marks — slim lanes, tabs, id labels, focus (new path only)

The Infra-board still calls `PhaseSwimlane` the old way until PR 2, so every change here applies only when the new `marks` prop is given. Without it the output must stay byte-for-byte what it is today (the existing tests prove that).

**Files:**

- Modify: `packages/frontend/src/components/process/PhaseSwimlane.tsx`
- Modify: `packages/frontend/src/components/process/process-view.css` (append rules)
- Test: `packages/frontend/src/components/process/PhaseSwimlane.test.tsx` (append a describe block)

**Interfaces:**

- Consumes: `NodeMark`, `isIdLabel` from `./processMarks` (Task 2).
- Produces (new optional props on `PhaseSwimlane`, used by `ProcessView` in Task 5):
  - `marks?: ReadonlyMap<string, NodeMark>` — presence switches on the new path
  - `myLanes?: ReadonlySet<string>`
  - `focusNodeId?: string | null` — scrolled into view and outlined (`pv-focus`) unless it is `mine`
  - data attributes on the new path: `data-node-id` on every node, gate and event; `data-mark` on marked nodes; `data-lane-empty` on slim lane labels and bands.

- [ ] **Step 1: Write the failing tests** (append to `PhaseSwimlane.test.tsx`):

```tsx
describe('PhaseSwimlane — marks path (ProcessView)', () => {
  const LANES_MODEL: PhaseSwimlaneModel = {
    phaseCode: 'X',
    lanes: [
      { key: 'a', label: 'Lane A' },
      { key: 'empty', label: 'Lege lane' },
      { key: 'b', label: 'Lane B' },
    ],
    nodes: [
      { id: 't1', bpmnId: 't1', kind: 'task', col: 0, row: 0, label: 'Taak 1' },
      { id: 't2', bpmnId: 't2', kind: 'task', col: 1, row: 2, label: 'Taak 2' },
      { id: 't3', bpmnId: 't3', kind: 'task', col: 2, row: 2, label: 'Taak 3' },
      { id: 'Gateway_X', bpmnId: 'Gateway_X', kind: 'gateway', col: 3, row: 0, label: 'Gateway_X' },
      { id: 'g2', bpmnId: 'g2', kind: 'gateway', col: 4, row: 0, label: 'Akkoord?' },
    ],
    edges: [
      { from: 't1', to: 't2' },
      { from: 't2', to: 't3' },
    ],
  };
  const marks = new Map([
    ['t1', 'mine' as const],
    ['t2', 'claimed' as const],
    ['t3', 'open' as const],
  ]);
  const draw = (extra: Partial<Parameters<typeof PhaseSwimlane>[0]> = {}) =>
    render(<PhaseSwimlane model={LANES_MODEL} statusById={{}} marks={marks} {...extra} />);

  it('gives a lane without nodes a slim 44px row, marked data-lane-empty', () => {
    const { container } = draw();
    const labels = [...container.querySelectorAll<HTMLElement>('.pb-swim-lane-label')];
    expect(labels.map((l) => l.style.height)).toEqual(['132px', '44px', '132px']);
    expect(labels[1].hasAttribute('data-lane-empty')).toBe(true);
    expect(labels[0].hasAttribute('data-lane-empty')).toBe(false);
  });

  it('keeps edges on their nodes across a slim lane', () => {
    const { container } = draw();
    const t2 = container.querySelector<HTMLElement>('[data-node-id="t2"]')!;
    const centreY = parseFloat(t2.style.top) + parseFloat(t2.style.height) / 2;
    const path = container.querySelector('.pb-swim-svg path')!.getAttribute('d')!;
    // t1 → t2: ends with "H <x>" at t2's centre line, reached by "V <centreY>".
    expect(path).toContain(`V ${centreY}`);
  });

  it('tabs mine "jouw taak" and claimed "geclaimd"; open gets no tab', () => {
    const { container } = draw();
    const tab = (id: string) =>
      container.querySelector(`[data-node-id="${id}"] .pb-swim-inprogress`)?.textContent;
    expect(tab('t1')).toBe('jouw taak');
    expect(tab('t2')).toBe('geclaimd');
    expect(tab('t3')).toBeUndefined();
    expect(container.querySelector('[data-node-id="t1"]')!.getAttribute('data-mark')).toBe('mine');
    expect(container.querySelector('[data-node-id="t2"] .pb-swim-inprogress')!.classList).toContain(
      'other'
    );
  });

  it('outlines the focus node unless it is mine', () => {
    const { container, rerender } = draw({ focusNodeId: 't3' });
    expect(container.querySelector('[data-node-id="t3"]')!.classList).toContain('pv-focus');
    rerender(<PhaseSwimlane model={LANES_MODEL} statusById={{}} marks={marks} focusNodeId="t1" />);
    expect(container.querySelector('[data-node-id="t1"]')!.classList).not.toContain('pv-focus');
  });

  it('hides a gateway label that is only its element id, keeps a real name', () => {
    const { container } = draw();
    expect(container.querySelector('[data-node-id="Gateway_X"] .gl')).toBeNull();
    expect(container.querySelector('[data-node-id="g2"] .gl')!.textContent).toBe('Akkoord?');
  });

  it('tints my lanes and tags them "jouw rol"', () => {
    const { container } = draw({ myLanes: new Set(['b']) });
    const labels = container.querySelectorAll('.pb-swim-lane-label');
    expect(labels[2].classList).toContain('cwp-mine');
    expect(labels[2].querySelector('.cwp-jij')!.textContent).toBe('jouw rol');
  });

  it('draws an all-empty model with slim lanes and no NaN', () => {
    const { container } = render(
      <PhaseSwimlane
        model={{
          phaseCode: 'X',
          lanes: [
            { key: 'a', label: 'A' },
            { key: 'b', label: 'B' },
          ],
          nodes: [],
          edges: [],
        }}
        statusById={{}}
        marks={new Map()}
      />
    );
    const canvas = container.querySelector<HTMLElement>('.pb-swim-canvas')!;
    expect(canvas.style.height).toBe('88px');
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
  });

  it('uses the roomy grid on the marks path', () => {
    const { container } = draw();
    const t1 = container.querySelector<HTMLElement>('[data-node-id="t1"]')!;
    expect(t1.style.width).toBe('184px');
    expect(t1.style.height).toBe('84px');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/process/PhaseSwimlane.test.tsx` → the new block fails (unknown prop `marks`, no `data-node-id`); the existing tests pass.

- [ ] **Step 3: Implement in `PhaseSwimlane.tsx`**

3a. Imports and constants — add below the existing imports:

```tsx
import { isIdLabel, type NodeMark } from './processMarks';

/** Row height of a lane with no nodes in this process. */
const SLIM_H = 44;
```

3b. Props — add to the destructuring and its type (keep every existing prop):

```tsx
  marks,
  myLanes,
  focusNodeId,
```

```tsx
  /** ProcessView's marks per node. Its presence selects the shared look: roomy grid, slim empty lanes, tabs by mark. */
  marks?: ReadonlyMap<string, NodeMark>;
  /** ProcessView's lanes to tint, replacing myLaneKeys on the marks path. */
  myLanes?: ReadonlySet<string>;
  /** Scrolled into view and outlined (unless it is the viewer's own task). */
  focusNodeId?: string | null;
```

3c. Mode switches — replace the lines from `const { COL_W, ROW_H, NODE_W, NODE_H, GATE } = DENSITY[density];` through `const mine = (key: string) => myLaneKeys?.has(key) ?? false;` with:

```tsx
const shared = marks !== undefined;
const { COL_W, ROW_H, NODE_W, NODE_H, GATE } = DENSITY[shared ? 'roomy' : density];
const { lanes, nodes, edges } = model;
const caseworker =
  shared ||
  myLaneKeys !== undefined ||
  claimedLabel !== undefined ||
  onOpenCall !== undefined ||
  scrollToNodeId !== undefined;
const lanesMine = shared ? myLanes : myLaneKeys;
const mine = (key: string) => lanesMine?.has(key) ?? false;
const scrollTarget = shared ? focusNodeId : scrollToNodeId;
```

3d. Slim lanes — replace `const laneHeights = slotsPerRow.map((slots) => slots * ROW_H);` with:

```tsx
const rowsWithNodes = new Set(nodes.map((n) => n.row));
const isEmptyLane = (row: number) => shared && !rowsWithNodes.has(row);
const laneHeights = slotsPerRow.map((slots, row) => (isEmptyLane(row) ? SLIM_H : slots * ROW_H));
```

3e. Scrolling — in the `useEffect`, replace both uses of `scrollToNodeId` (the guard, the lookup and the dependency array) with `scrollTarget`:

```tsx
useEffect(() => {
  if (scrollTarget === undefined || !scrollRef.current) return;
  const target = scrollTarget === null ? undefined : nodeById[scrollTarget];
  const el = scrollRef.current;
  el.scrollLeft = target ? Math.max(0, cx(target) - el.clientWidth / 2) : 0;
  // cx and nodeById derive from model, which is in the deps.
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [scrollTarget, model]);
```

3f. Lane labels and bands — add `data-lane-empty` and a `slim` class on the shared path:

```tsx
{
  lanes.map((l, i) => (
    <div
      className={`pb-swim-lane-label${mine(l.key) ? ' cwp-mine' : ''}${isEmptyLane(i) ? ' slim' : ''}`}
      key={l.key}
      style={{ height: laneHeights[i] }}
      {...(isEmptyLane(i) ? { 'data-lane-empty': '' } : {})}
    >
      {l.label}
      {mine(l.key) && <span className="cwp-jij">jouw rol</span>}
    </div>
  ));
}
```

and in the band map add `{...(isEmptyLane(i) ? { 'data-lane-empty': '' } : {})}` to the band `<div>`.

3g. Node id attribute — on the event `<div>`, the gate `<div>` and the task `<div>`, add `{...(shared ? { 'data-node-id': n.id } : {})}`.

3h. Gateway label — replace `<span className="gl">{n.label}</span>` with:

```tsx
{
  !(shared && isIdLabel(n)) && <span className="gl">{n.label}</span>;
}
```

3i. Task tabs and focus — replace the line `const claimed = claimedNodeIds.has(n.id);` with:

```tsx
const mark = shared ? marks.get(n.id) : undefined;
const claimed = shared ? mark === 'mine' : claimedNodeIds.has(n.id);
const tab = shared
  ? mark === 'mine'
    ? 'jouw taak'
    : mark === 'claimed'
      ? 'geclaimd'
      : null
  : claimed
    ? (claimedLabel ?? '✏')
    : null;
const focus = shared && focusNodeId === n.id && mark !== 'mine';
```

On the task `<div>`: extend the className with `${focus ? ' pv-focus' : ''}` and add `{...(mark ? { 'data-mark': mark } : {})}`. Replace the existing `{claimed && (<span className="pb-swim-inprogress" …>{claimedLabel ?? '✏'}</span>)}` with:

```tsx
{
  tab && (
    <span
      className={`pb-swim-inprogress${mark === 'claimed' ? ' other' : ''}`}
      title={mark === 'claimed' ? 'Geclaimd door een collega' : 'In behandeling'}
    >
      {tab}
    </span>
  );
}
```

3j. Docs on the shared path go to a footer row so they cannot push the label out — wrap the existing docs map:

```tsx
{
  shared ? (
    n.docs?.length ? (
      <span className="nfoot">
        {n.docs.map((doc) => (
          <span key={doc} className="ndoc">
            {doc}
          </span>
        ))}
      </span>
    ) : null
  ) : (
    n.docs?.map((doc) => (
      <span key={doc} className="ndoc">
        {doc}
      </span>
    ))
  );
}
```

- [ ] **Step 4: Append the CSS** to the end of `process-view.css` (one-line rules, no Prettier):

```css
/* ProcessView (shared path): slim empty lanes, the "geclaimd" tab, the focus
   outline and the docs footer. Scoped like the caseworker rules above. */
.pbd .cwp-swim .pb-swim-lane-label.slim {
  flex-direction: row;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
}
.pbd .cwp-swim .pb-swim-lane-label.slim .cwp-jij {
  margin: 0;
}
.pbd .cwp-swim .pb-swim-inprogress.other {
  color: var(--v2-ink-2);
  background: var(--v2-paper);
  border: 1px solid var(--v2-ink-3);
}
.pbd .cwp-swim .pb-swim-node.pv-focus {
  outline: 2px dashed var(--v2-accent);
  outline-offset: 2px;
}
.pbd .cwp-swim .pb-swim-node .nfoot {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
.pbd .cwp-swim .pb-swim-node .nfoot .ndoc {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run src/components/process/PhaseSwimlane.test.tsx` → all pass, old and new.
Run: `npm run lint:css` (repo root) → exit 0; `npm run lint:css:summary` → hex total still 369.

- [ ] **Step 6: Stage**

```bash
git add packages/frontend/src/components/process/PhaseSwimlane.tsx packages/frontend/src/components/process/PhaseSwimlane.test.tsx packages/frontend/src/components/process/process-view.css
```

---

### Task 5: `ProcessView` — the public block

**Files:**

- Create: `packages/frontend/src/components/process/ProcessView.tsx`
- Modify: `packages/frontend/src/components/process/process-view.css` (append legend rules)
- Test: `packages/frontend/src/components/process/ProcessView.test.tsx`

**Interfaces:**

- Consumes: `nodeMarks`, `legendEntries`, `Viewer`, `ProcessTask` (Task 2); `useViewer` (Task 3); `PhaseSwimlane` marks path (Task 4); `myLaneKeys` from `./laneSteps`; `StatusKey` from `./status`.
- Produces:

```ts
export interface ProcessViewTitle {
  name: string;
  code: string;
  /** Adds "(live)" to the meta line. */
  live?: boolean;
  /** Rendered before the name inside the heading (the overlay's main › subprocess buttons). */
  crumbs?: ReactNode;
}
export default function ProcessView(props: {
  model: PhaseSwimlaneModel;
  statusById: Record<string, StatusKey>;
  tasks?: readonly ProcessTask[];
  title: ProcessViewTitle;
  stepper?: ReactNode;
  focusNodeId?: string | null;
  onOpenCall?: (node: SwimNode) => void;
  viewer?: Viewer;
  /** Focus target for the heading (the overlay moves focus here when its process changes). */
  titleRef?: Ref<HTMLHeadingElement>;
}): JSX.Element;
```

The root is `<div className="pv pbd">`; the legend is `<ul className="pv-legend" aria-label="Legenda">` with `<li data-legend={key}>`.

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { PhaseSwimlaneModel } from '@ronl/shared';

const kc = vi.hoisted(() => ({
  tokenParsed: { sub: 'sub-me', realm_access: { roles: ['rip-projectleider'] } } as Record<
    string,
    unknown
  >,
}));
vi.mock('../../services/keycloak', () => ({ default: kc }));

import ProcessView from './ProcessView';

const MODEL: PhaseSwimlaneModel = {
  phaseCode: 'R2.4',
  lanes: [{ key: 'pl', label: 'Projectleider', candidateGroups: ['rip-projectleider'] }],
  nodes: [
    { id: 'a', bpmnId: 'a', kind: 'task', col: 0, row: 0, label: 'Taak A' },
    { id: 'b', bpmnId: 'b', kind: 'task', col: 1, row: 0, label: 'Taak B' },
  ],
  edges: [{ from: 'a', to: 'b' }],
};

const legend = (c: HTMLElement) =>
  [...c.querySelectorAll('[data-legend]')].map((e) => e.getAttribute('data-legend'));

describe('ProcessView', () => {
  it('renders the title bar with code, live meta, crumbs and the stepper slot', () => {
    render(
      <ProcessView
        model={MODEL}
        statusById={{}}
        title={{
          name: 'DO en -raming',
          code: 'R2.4',
          live: true,
          crumbs: <span>Hoofdproces ›</span>,
        }}
        stepper={<div data-testid="stepper" />}
      />
    );
    expect(screen.getByRole('heading', { level: 3 }).textContent).toBe(
      'Hoofdproces ›DO en -raming R2.4'
    );
    expect(screen.getByText(/procesmodel \(live\)/)).toBeTruthy();
    expect(screen.getByTestId('stepper')).toBeTruthy();
  });

  it('omits "(live)" when not live', () => {
    render(<ProcessView model={MODEL} statusById={{}} title={{ name: 'X', code: 'R2.4' }} />);
    expect(screen.queryByText(/\(live\)/)).toBeNull();
  });

  it('marks tasks from the token viewer and builds the legend from what is shown', () => {
    const { container } = render(
      <ProcessView
        model={MODEL}
        statusById={{ a: 'active' }}
        tasks={[
          { taskDefinitionKey: 'a', assignee: 'sub-me' },
          { taskDefinitionKey: 'b', assignee: 'sub-colleague' },
        ]}
        title={{ name: 'X', code: 'R2.4' }}
      />
    );
    expect(container.querySelector('[data-node-id="a"]')!.getAttribute('data-mark')).toBe('mine');
    expect(container.querySelector('[data-node-id="b"]')!.getAttribute('data-mark')).toBe(
      'claimed'
    );
    expect(legend(container)).toEqual(['active', 'mine', 'claimed', 'role', 'todo']);
    expect(screen.getByText('Jouw rol (rip-projectleider)')).toBeTruthy();
  });

  it('lets the viewer prop override the token', () => {
    const { container } = render(
      <ProcessView
        model={MODEL}
        statusById={{}}
        tasks={[{ taskDefinitionKey: 'a', assignee: 'sub-me' }]}
        title={{ name: 'X', code: 'R2.4' }}
        viewer={{ userId: 'someone-else', roles: [] }}
      />
    );
    expect(container.querySelector('[data-node-id="a"]')!.getAttribute('data-mark')).toBe(
      'claimed'
    );
    expect(legend(container)).not.toContain('role');
  });

  it('roots itself in .pbd so it styles on any dashboard', () => {
    const { container } = render(
      <ProcessView model={MODEL} statusById={{}} title={{ name: 'X', code: 'R2.4' }} />
    );
    expect(container.firstElementChild!.classList).toContain('pbd');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/process/ProcessView.test.tsx` → FAIL, cannot resolve `./ProcessView`.

- [ ] **Step 3: Implement `ProcessView.tsx`**

```tsx
import { useMemo, type ReactNode, type Ref } from 'react';
import type { PhaseSwimlaneModel, SwimNode } from '@ronl/shared';
import PhaseSwimlane from './PhaseSwimlane';
import { myLaneKeys } from './laneSteps';
import { legendEntries, nodeMarks, type ProcessTask, type Viewer } from './processMarks';
import type { StatusKey } from './status';
import { useViewer } from './useViewer';
import './process-view.css';

export interface ProcessViewTitle {
  name: string;
  code: string;
  /** Adds "(live)" to the meta line. */
  live?: boolean;
  /** Rendered before the name inside the heading (the overlay's main › subprocess buttons). */
  crumbs?: ReactNode;
}

const NO_TASKS: readonly ProcessTask[] = [];

/**
 * The one way a dashboard shows a BPMN process: an optional stepper, the
 * title bar, a legend and the swimlane. A dashboard passes data; who is
 * looking comes from the token (useViewer), and the marks on open tasks, the
 * viewer's lanes and the legend are derived here, so a new dashboard gets the
 * whole rendering by using this component. Nothing outside components/process
 * may render PhaseSwimlane directly (process-view-guard.test.ts).
 */
export default function ProcessView({
  model,
  statusById,
  tasks = NO_TASKS,
  title,
  stepper,
  focusNodeId,
  onOpenCall,
  viewer: viewerOverride,
  titleRef,
}: {
  model: PhaseSwimlaneModel;
  statusById: Record<string, StatusKey>;
  tasks?: readonly ProcessTask[];
  title: ProcessViewTitle;
  stepper?: ReactNode;
  focusNodeId?: string | null;
  onOpenCall?: (node: SwimNode) => void;
  viewer?: Viewer;
  titleRef?: Ref<HTMLHeadingElement>;
}) {
  const tokenViewer = useViewer();
  const viewer = viewerOverride ?? tokenViewer;
  const marks = useMemo(() => nodeMarks(model, tasks, viewer), [model, tasks, viewer]);
  const myLanes = useMemo(() => myLaneKeys(model, viewer.roles), [model, viewer.roles]);
  const entries = legendEntries({ model, statusById, marks, myLanes, roles: viewer.roles });

  return (
    <div className="pv pbd">
      {stepper}
      <div className="pb-phase-titlebar">
        <h3 ref={titleRef} {...(titleRef ? { tabIndex: -1 } : {})}>
          {title.crumbs}
          {title.name} <span className="rcode">{title.code}</span>
        </h3>
        <span className="meta">
          Processtappen &amp; rollen — procesmodel{title.live ? ' (live)' : ''}
        </span>
      </div>
      <ul className="pv-legend" aria-label="Legenda">
        {entries.map((e) => (
          <li key={e.key} data-legend={e.key}>
            <i className={`sw ${e.key}`} aria-hidden="true" />
            {e.label}
          </li>
        ))}
      </ul>
      <PhaseSwimlane
        model={model}
        statusById={statusById}
        marks={marks}
        myLanes={myLanes}
        focusNodeId={focusNodeId}
        onOpenCall={onOpenCall}
      />
    </div>
  );
}
```

- [ ] **Step 4: Append the legend CSS** to `process-view.css`. The swatch colours are moved unchanged from the old `.cwp-legend` rules (removed in Task 6); `#0046ad` stays a literal (it waits on #374 3b):

```css
/* ProcessView legend (moved from caseworker-process.css's .cwp-legend). */
.pbd .pv-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 18px;
  margin: 0 0 12px;
  padding: 0;
  list-style: none;
  font-size: 11.5px;
  color: var(--v2-ink-2);
}
.pbd .pv-legend li {
  display: flex;
  align-items: center;
  gap: 6px;
}
.pbd .pv-legend .sw {
  display: inline-block;
  box-sizing: border-box;
  width: 14px;
  height: 10px;
  border: 1px solid var(--v2-rule);
  border-top-width: 3px;
  background: var(--v2-paper);
}
.pbd .pv-legend .sw.done {
  background: #f3faf2;
  border-top-color: var(--rba-ok);
}
.pbd .pv-legend .sw.active {
  background: #eef4fd;
  border-top-color: #0046ad;
}
.pbd .pv-legend .sw.mine {
  background: #eef4fd;
  border: 2px solid var(--v2-accent);
}
.pbd .pv-legend .sw.claimed {
  background: var(--v2-paper);
  border: 2px solid var(--v2-ink-3);
}
.pbd .pv-legend .sw.role {
  background: #eaf1fb;
  border-color: #cbd9ee;
}
.pbd .pv-legend .sw.auto {
  border-style: dashed;
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run src/components/process/ProcessView.test.tsx` → all pass.

- [ ] **Step 6: Stage**

```bash
git add packages/frontend/src/components/process/ProcessView.tsx packages/frontend/src/components/process/ProcessView.test.tsx packages/frontend/src/components/process/process-view.css
```

---

### Task 6: The Caseworker overlay on `ProcessView`

**Files:**

- Modify: `packages/frontend/src/components/process/ProcessOverlay.tsx`
- Modify: `packages/frontend/src/components/CaseworkerDashboardV2/TakenInbox.tsx:562-570` (the `<ProcessOverlay>` call)
- Modify: `packages/frontend/src/components/process/caseworker-process.css` (remove the old legend rules)
- Test: `packages/frontend/src/components/process/ProcessOverlay.test.tsx`

**Interfaces:**

- Consumes: `ProcessView`, `ProcessViewTitle` (Task 5).
- Produces: `ProcessOverlay` without the `roles` prop: `{ task, ctx, initialPhase?, dossierRef?, returnFocus?, onClose }`.

- [ ] **Step 1: Update the overlay tests first.** At the top of `ProcessOverlay.test.tsx`, mock the token (roles now come from the viewer) and drop `roles` from `open()`:

```tsx
const kc = vi.hoisted(() => ({
  tokenParsed: { sub: 'sub-me', realm_access: { roles: ['caseworker'] } } as Record<
    string,
    unknown
  >,
}));
vi.mock('../../services/keycloak', () => ({ default: kc }));
```

```tsx
const open = (props: Partial<Parameters<typeof ProcessOverlay>[0]> = {}) =>
  render(<ProcessOverlay task={task} ctx={REVIEW} onClose={vi.fn()} {...props} />);
```

Change the fixture task so it is the viewer's own: `const task = { id: 'task-1', name: 'Beoordeling behandelaar', assignee: 'sub-me' } as Task;`. Existing tests that expect "jouw taak" on the own node and "jouw rol" on its lane keep passing through `ProcessView`. Replace any assertion that reads `.cwp-legend` with the `[data-legend]` equivalent, and add:

```tsx
it('takes its legend from ProcessView', () => {
  const { container } = open();
  expect(container.querySelector('.cwp-legend')).toBeNull();
  const keys = [...container.querySelectorAll('[data-legend]')].map((e) =>
    e.getAttribute('data-legend')
  );
  expect(keys).toContain('mine');
  expect(keys).toContain('role');
});

it('on an unassigned task shows no tab but outlines and focuses its node', () => {
  const { container } = open({ task: { ...task, assignee: undefined } as Task });
  expect(container.querySelector('.pb-swim-inprogress')).toBeNull();
  expect(container.querySelector(`[data-node-id="${REVIEW.current.nodeId}"]`)!.classList).toContain(
    'pv-focus'
  );
});

it('on a task a colleague holds shows "geclaimd"', () => {
  const { container } = open({ task: { ...task, assignee: 'sub-colleague' } as Task });
  expect(container.querySelector('.pb-swim-inprogress')!.textContent).toBe('geclaimd');
});

it('shows no tab on the other process of the chain', async () => {
  const user = userEvent.setup();
  const { container } = open();
  const crumb = screen.queryByRole('button', { name: 'Hoofdproces' });
  if (crumb) {
    await user.click(crumb);
    expect(container.querySelector('.pb-swim-inprogress')).toBeNull();
  }
});
```

(If `REVIEW` has no subprocess the last test is a no-op by construction; the existing fixture `A` or `NOTIFY` may be the one with a chain — use whichever fixture the existing breadcrumb test uses.)

- [ ] **Step 2: Run to verify the new tests fail**

Run: `npx vitest run src/components/process/ProcessOverlay.test.tsx` → the new tests fail (`.cwp-legend` still rendered, no `pv-focus`).

- [ ] **Step 3: Rewrite the overlay's view part.** In `ProcessOverlay.tsx`:
- remove `roles` from the props and its type;
- remove the imports of `PhaseSwimlane`, `myLaneKeys`, `useMemo` (if now unused), `NOTHING`;
- remove the `claimed`, `mine` and `myGroups` constants;
- add `import ProcessView from './ProcessView';`;
- replace everything from `<div className="pb-phase-titlebar">` down to the closing `)}` of the `{model && (<PhaseSwimlane … />)}` block with:

```tsx
{
  model && (
    <ProcessView
      model={model}
      statusById={ctx.statusByProcess[proc] ?? NO_STATUS}
      tasks={onOwnProcess ? [{ taskDefinitionKey: ownNodeId, assignee: task.assignee }] : []}
      titleRef={titleRef}
      title={{
        name: model.processName ?? proc,
        code: proc,
        live: true,
        crumbs: sub && (
          <span className="cwp-crumbs">
            <button
              type="button"
              className={proc === top ? 'on' : ''}
              aria-current={proc === top ? 'true' : undefined}
              onClick={() => setProc(top)}
            >
              Hoofdproces
            </button>
            <span aria-hidden="true">›</span>
            <button
              type="button"
              className={proc === sub.key ? 'on' : ''}
              aria-current={proc === sub.key ? 'true' : undefined}
              onClick={() => {
                setProc(sub.key);
                if (sub.phase) setSel(sub.phase);
              }}
            >
              Deelproces fase{' '}
              {sub.phase && topSet ? phaseRef(topSet, sub.phase) : (sub.phase ?? '')}
            </button>
          </span>
        ),
      }}
      focusNodeId={scrollTo}
      onOpenCall={(n) => {
        if (n.calls && ctx.models[n.calls]) {
          setProc(n.calls);
          if (n.phase) setSel(n.phase);
        }
      }}
    />
  );
}
```

The `PhaseStepper` above it stays where it is (it is rendered before `ProcessView`, which matches the stepper-then-title order). `ownNodeId`, `onOwnProcess`, `scrollTo`, `sub`, `top`, `topSet`, `titleRef` stay as they are.

- [ ] **Step 4: Update the caller.** In `TakenInbox.tsx`, delete the `roles={roles}` line from the `<ProcessOverlay … />` call (around line 565). `roles` stays in use for `ProcessLaneSteps`.

- [ ] **Step 5: Remove the old legend rules** from `caseworker-process.css` (edit by hand, no Prettier): delete the lines starting with `.cwd-v2 .cwp-legend` — the eight rules `.cwp-legend{…}`, `.cwp-legend span{…}`, `.cwp-legend .sw{…}`, `.sw.done`, `.sw.active`, `.sw.claimed`, `.sw.mine`, `.sw.todo` — and the earlier `.cwd-v2 .cwp-legend .sw.auto{…}`.

- [ ] **Step 6: Run the tests, type-check, lint**

Run: `npx vitest run src/components/process src/components/CaseworkerDashboardV2` → all pass.
Run: `npm run type-check --workspace=@ronl/frontend` and `npm run lint --workspace=@ronl/frontend` → clean.
Run (repo root): `npm run lint:css:summary` → hex total ≤ 369.

- [ ] **Step 7: Stage**

```bash
git add packages/frontend/src/components/process/ProcessOverlay.tsx packages/frontend/src/components/process/ProcessOverlay.test.tsx packages/frontend/src/components/CaseworkerDashboardV2/TakenInbox.tsx packages/frontend/src/components/process/caseworker-process.css
```

---

### Task 7: e2e test 1 for the Caseworker, then the PR 1 checkpoint

**Files:**

- Create: `packages/frontend/e2e/process-view.spec.ts`

**Interfaces:**

- Consumes: the data attributes from Tasks 4–5 (`.pv`, `[data-legend]`, `[data-node-id]`, `[data-mark]`, `[data-lane-empty]`); `loginAsMedewerker`, `watchForRateLimit` helpers.
- Produces: `assertProcessViewRules(view: Locator): Promise<void>` in the spec file, reused by Task 13.

- [ ] **Step 1: Write the spec**

```ts
import { expect, test, type Locator } from '@playwright/test';
import { loginAsMedewerker } from './helpers/auth';
import { watchForRateLimit } from './helpers/rate-limit';

/**
 * The shared process view (ProcessView) on every dashboard that shows one.
 *
 * Test 1 asserts rules rather than counts: whatever diagram the shared engine
 * happens to produce, the legend matches it, labels fit their boxes, nodes do
 * not overlap, no element id is shown as a label and empty lanes stay slim.
 * The same reasoning as infra-board-journey.spec.ts: a count here would assert
 * the mood of a shared engine, a rule holds in any state.
 */

async function assertProcessViewRules(view: Locator) {
  await expect(view.locator('.pb-swim')).toBeVisible();

  // The legend matches the diagram, both ways, for the entries that depend on what is drawn.
  const legend = await view
    .locator('[data-legend]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-legend')!));
  const present = await view.evaluate((root) => {
    const keys = new Set<string>();
    root.querySelectorAll('[data-mark]').forEach((e) => {
      const m = e.getAttribute('data-mark');
      if (m === 'mine' || m === 'claimed') keys.add(m);
    });
    if (root.querySelector('.pb-swim-lane-label.cwp-mine')) keys.add('role');
    root.querySelectorAll('[data-gateway]').forEach((e) => {
      const g = e.getAttribute('data-gateway');
      if (g === 'decision') keys.add('decision');
      if (g === 'split' || g === 'join') keys.add('parallel');
    });
    return [...keys];
  });
  for (const key of present) expect(legend, `legend entry for "${key}"`).toContain(key);
  for (const key of legend) {
    if (['mine', 'claimed', 'role', 'decision', 'parallel'].includes(key)) {
      expect(present, `diagram shows "${key}" from the legend`).toContain(key);
    }
  }

  // Every clamped label fits its box.
  const overflowing = await view
    .locator('.pb-swim-node .nlabel')
    .evaluateAll((els) =>
      els.filter((e) => e.scrollHeight > e.clientHeight + 1).map((e) => e.textContent)
    );
  expect(overflowing, 'labels spilling out of their node').toEqual([]);

  // No two nodes overlap.
  const boxes = await view.locator('.pb-swim-node').evaluateAll((els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height, name: e.getAttribute('data-node-id') };
    })
  );
  const overlaps: string[] = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) {
        overlaps.push(`${a.name} × ${b.name}`);
      }
    }
  }
  expect(overlaps, 'overlapping nodes').toEqual([]);

  // No gateway shows its element id; bars and dots show only their caption.
  const gates = await view
    .locator('.pb-swim-gate, .pb-swim-bar, .pb-swim-merge')
    .evaluateAll((els) =>
      els.map((e) => ({
        id: e.getAttribute('data-node-id'),
        kind: e.getAttribute('data-gateway'),
        text: (e.textContent ?? '').replace(/[×+?]/g, '').trim(),
      }))
    );
  for (const g of gates) {
    expect(g.text, `gateway ${g.id} shows its id`).not.toBe(g.id);
    if (g.kind === 'split') expect(g.text).toBe('tegelijk');
    if (g.kind === 'join') expect(g.text).toBe('alles klaar');
    if (g.kind === 'merge') expect(g.text).toBe('');
  }

  // Empty lanes stay slim.
  const slim = await view
    .locator('.pb-swim-lane-label[data-lane-empty]')
    .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  for (const h of slim) expect(h).toBeLessThanOrEqual(48);
}

test.describe('ProcessView', () => {
  let rateLimit: ReturnType<typeof watchForRateLimit>;
  test.afterEach(() => {
    const throttled = rateLimit?.hit();
    if (throttled) throw new Error(throttled);
  });

  test('test 1 — Caseworker overlay follows the shared rules', async ({ page }) => {
    rateLimit = watchForRateLimit(page);
    await loginAsMedewerker(page, 'test-caseworker-flevoland', 'test123');
    await expect(page).toHaveURL(/\/dashboard\/caseworker$/);

    const first = page.locator('.v2-taken-item-name').first();
    if ((await first.count()) === 0) {
      test.skip(
        true,
        'No task in the caseworker inbox on this tier; nothing to open the overlay on.'
      );
    }
    await first.click();

    const link = page.getByRole('button', { name: /Hele proces als swimlane bekijken/ });
    if ((await link.count()) === 0) {
      test.skip(true, 'The selected task has no process model; the overlay is not offered.');
    }
    await link.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await assertProcessViewRules(dialog.locator('.pv'));

    // The overlay's own task: tab by assignee, never more than one.
    expect(await dialog.locator('.pb-swim-inprogress').count()).toBeLessThanOrEqual(1);
  });
});
```

Before relying on the selectors, confirm in `TakenInbox.tsx` that the task rows render `.v2-taken-item-name` (line ~344) and that the swimlane link's accessible name is "Hele proces als swimlane bekijken" (grep the file). If the link is an `<a>`, use `getByRole('link', …)` instead.

- [ ] **Step 2: Type-check the spec**

Run (from `packages/frontend`): `npx tsc --noEmit -p e2e` if an e2e tsconfig exists; otherwise `npx playwright test --config=e2e/playwright.config.ts --list --grep ProcessView` → lists the test without a compile error. Do not run the suite: the user runs e2e.

- [ ] **Step 3: Stage**

```bash
git add packages/frontend/e2e/process-view.spec.ts
```

- [ ] **Step 4: PR 1 checks (yours)**

Run: `npm test --workspace=@ronl/frontend` → all pass; type-check and lint clean; from `packages/frontend`: `npx vite build --outDir "$TEMP/pv-build" --emptyOutDir` succeeds (then `rm -rf "$TEMP/pv-build"`); repo root `npm run lint:css:summary` → hex ≤ 369, and `npm run check-format` passes.

- [ ] **Step 5: Hand off and STOP.** Report what is staged and ask the user for:

1. a browser look at the Caseworker overlay on localhost (hard refresh first): legend shows only present entries, own task "jouw taak", an unassigned task outlined without a tab, slim empty lanes, no gateway ids; and the Infra-board unchanged;
2. `npm test` from the repo root;
3. the ACC e2e run including `process-view.spec.ts`.

Wait for "green".

- [ ] **Step 6: After explicit approval — commit, push, PR.** No attribution lines.

```bash
git commit -m "feat(process): add the shared ProcessView and move the Caseworker overlay onto it"
git push -u origin feat/process-view
gh pr create --base acc --head feat/process-view --title "feat(process): shared ProcessView, Caseworker overlay on it (PR 1 of 2)" --body-file <body>
```

The PR body: what changed, the visible change (Caseworker only: legend by presence, "geclaimd", focus outline for unassigned tasks, slim empty lanes, no gateway ids), the verification, "Infra-board unchanged; PR 2 follows". After the user merges: housekeeping, then branch `feat/process-view-infra` from the updated `acc` for PR 2.

---

# PR 2 — the Infra-board on it; the old path removed

Branch `feat/process-view-infra` from `acc` after PR 1 is merged.

### Task 8: Gateway shapes — diamond, bar, dot — and their legend entries

**Files:**

- Modify: `packages/frontend/src/components/process/processMarks.ts` (`legendEntries`)
- Modify: `packages/frontend/src/components/process/PhaseSwimlane.tsx` (gateway branch, edge half-widths)
- Modify: `packages/frontend/src/components/process/process-view.css` (append)
- Test: `processMarks.test.ts`, `PhaseSwimlane.test.tsx`

**Interfaces:**

- Consumes: `gatewayKind`, `isIdLabel` (Task 2).
- Produces: on the shared path, `.pb-swim-gate[data-gateway="decision"]` (diamond, `?`), `.pb-swim-bar[data-gateway="split"|"join"]` with caption `.bl`, `.pb-swim-merge[data-gateway="merge"]`; legend keys `decision` ("Beslissing"), `parallel` ("Tegelijk / alles klaar"), placed after `auto` and before `todo`.

- [ ] **Step 1: Write the failing tests.** In `processMarks.test.ts`:

```ts
describe('legendEntries — gateway shapes', () => {
  it('adds Beslissing and Tegelijk / alles klaar when the diagram has them, before todo', () => {
    const model: PhaseSwimlaneModel = {
      phaseCode: 'X',
      lanes: [{ key: 'l', label: 'L' }],
      nodes: [
        node('t', 'task', 'T', 0, 0),
        node('d', 'gateway', 'Akkoord?', 0, 1),
        node('s', 'parallel', 's', 0, 2),
      ],
      edges: [
        { from: 't', to: 'd' },
        { from: 'd', to: 's' },
        { from: 'd', to: 't' },
        { from: 's', to: 't' },
        { from: 's', to: 'd' },
      ],
    };
    const entries = legendEntries({
      model,
      statusById: {},
      marks: new Map(),
      myLanes: new Set(),
      roles: [],
    });
    expect(entries.map((e) => e.key)).toEqual(['decision', 'parallel', 'todo']);
    expect(entries[0].label).toBe('Beslissing');
    expect(entries[1].label).toBe('Tegelijk / alles klaar');
  });
});
```

In `PhaseSwimlane.test.tsx` (inside the marks-path describe):

```tsx
it('draws a decision as a ? diamond, split and join as captioned bars, a merge as a dot', () => {
  const model: PhaseSwimlaneModel = {
    phaseCode: 'X',
    lanes: [{ key: 'l', label: 'L' }],
    nodes: [
      { id: 'd', bpmnId: 'd', kind: 'gateway', col: 0, row: 0, label: 'Akkoord?' },
      { id: 's', bpmnId: 's', kind: 'parallel', col: 1, row: 0, label: 's' },
      { id: 'a', bpmnId: 'a', kind: 'task', col: 2, row: 0, label: 'A' },
      { id: 'b', bpmnId: 'b', kind: 'task', col: 2, row: 0, label: 'B' },
      { id: 'j', bpmnId: 'j', kind: 'parallel', col: 3, row: 0, label: 'j' },
      { id: 'm', bpmnId: 'm', kind: 'gateway', col: 4, row: 0, label: 'm' },
    ],
    edges: [
      { from: 'd', to: 's' },
      { from: 'd', to: 'm' },
      { from: 's', to: 'a' },
      { from: 's', to: 'b' },
      { from: 'a', to: 'j' },
      { from: 'b', to: 'j' },
      { from: 'j', to: 'm' },
    ],
  };
  const { container } = render(<PhaseSwimlane model={model} statusById={{}} marks={new Map()} />);
  const g = (id: string) => container.querySelector(`[data-node-id="${id}"]`)!;
  expect(g('d').getAttribute('data-gateway')).toBe('decision');
  expect(g('d').querySelector('.gx')!.textContent).toBe('?');
  expect(g('s').classList).toContain('pb-swim-bar');
  expect(g('s').textContent).toBe('tegelijk');
  expect(g('j').textContent).toBe('alles klaar');
  expect(g('m').classList).toContain('pb-swim-merge');
  expect(g('m').textContent).toBe('');
});

it('attaches edges to a bar edge, not a diamond tip', () => {
  const model: PhaseSwimlaneModel = {
    phaseCode: 'X',
    lanes: [{ key: 'l', label: 'L' }],
    nodes: [
      { id: 's', bpmnId: 's', kind: 'parallel', col: 0, row: 0, label: 's' },
      { id: 'a', bpmnId: 'a', kind: 'task', col: 1, row: 0, label: 'A' },
      { id: 'b', bpmnId: 'b', kind: 'task', col: 1, row: 0, label: 'B' },
    ],
    edges: [
      { from: 's', to: 'a' },
      { from: 's', to: 'b' },
    ],
  };
  const { container } = render(<PhaseSwimlane model={model} statusById={{}} marks={new Map()} />);
  const d = container.querySelector('.pb-swim-svg path')!.getAttribute('d')!;
  // column 0 centre is 120 (COL_W 240 / 2); the bar is 8 wide, so the edge starts at 124.
  expect(d.startsWith('M 124 ')).toBe(true);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/components/process/processMarks.test.ts src/components/process/PhaseSwimlane.test.tsx` → the new tests fail.

- [ ] **Step 3: Extend `legendEntries`.** Before the `todo` push add:

```ts
const kinds = new Set(model.nodes.map((n) => gatewayKind(n, model.edges)));
if (kinds.has('decision')) entries.push({ key: 'decision', label: 'Beslissing' });
if (kinds.has('split') || kinds.has('join')) {
  entries.push({ key: 'parallel', label: 'Tegelijk / alles klaar' });
}
```

- [ ] **Step 4: Draw the shapes in `PhaseSwimlane.tsx`.**

4a. Import `gatewayKind` alongside `isIdLabel`, and add constants:

```tsx
/** Parallel split/join bar and exclusive-merge dot. */
const BAR_W = 8;
const BAR_H = 72;
const MERGE = 14;
```

4b. A half-width helper above `paths` (replacing the two inline `aw`/`bw` expressions):

```tsx
const halfW = (n: SwimNode) => {
  if (n.kind !== 'gateway' && n.kind !== 'parallel') return NODE_W / 2;
  if (!shared) return GATE / 2;
  const g = gatewayKind(n, edges);
  return g === 'split' || g === 'join' ? BAR_W / 2 : g === 'merge' ? MERGE / 2 : GATE / 2;
};
```

and in the non-back branch: `const aw = halfW(a), bw = halfW(b);`.

4c. Replace the gateway branch of the node map with:

```tsx
if (n.kind === 'gateway' || n.kind === 'parallel') {
  const g = shared ? gatewayKind(n, edges) : null;
  if (g === 'split' || g === 'join') {
    return (
      <div
        key={n.id}
        className={`pb-swim-bar ${st(n.id)} ${g}`}
        data-node-id={n.id}
        data-gateway={g}
        style={{ left: cx(n) - BAR_W / 2, top: cy(n) - BAR_H / 2, width: BAR_W, height: BAR_H }}
      >
        <span className="bl">{g === 'split' ? 'tegelijk' : 'alles klaar'}</span>
      </div>
    );
  }
  if (g === 'merge') {
    return (
      <div
        key={n.id}
        className={`pb-swim-merge ${st(n.id)}`}
        data-node-id={n.id}
        data-gateway="merge"
        style={{ left: cx(n) - MERGE / 2, top: cy(n) - MERGE / 2, width: MERGE, height: MERGE }}
      />
    );
  }
  return (
    <div
      key={n.id}
      className={`pb-swim-gate ${st(n.id)} ${n.kind}`}
      {...(shared ? { 'data-node-id': n.id, 'data-gateway': 'decision' } : {})}
      style={{ left: cx(n) - GATE / 2, top: cy(n) - GATE / 2, width: GATE, height: GATE }}
    >
      <span className="gx">{shared ? '?' : n.kind === 'parallel' ? '+' : '×'}</span>
      {!(shared && isIdLabel(n)) && <span className="gl">{n.label}</span>}
    </div>
  );
}
```

- [ ] **Step 5: Append the shape CSS** to `process-view.css`:

```css
/* Gateway shapes (shared path): decision diamond with "?", parallel bar, merge dot. */
.pbd .pb-swim-bar {
  position: absolute;
  box-sizing: border-box;
  background: var(--v2-ink-2);
}
.pbd .pb-swim-bar.done {
  background: var(--pb-green);
}
.pbd .pb-swim-bar .bl {
  position: absolute;
  top: calc(100% + 4px);
  left: 50%;
  transform: translateX(-50%);
  white-space: nowrap;
  font-family: var(--v2-mono);
  font-size: 9.5px;
  font-weight: 600;
  color: var(--v2-ink-3);
}
.pbd .pb-swim-merge {
  position: absolute;
  box-sizing: border-box;
  background: var(--v2-ink-3);
  transform: rotate(45deg);
}
.pbd .pb-swim-merge.done {
  background: var(--pb-green);
}
.pbd .cwp-swim .pb-swim-gate .gl {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.pbd .pv-legend .sw.decision {
  width: 10px;
  height: 10px;
  border: 2px solid var(--rba-warn);
  transform: rotate(45deg);
  margin: 0 2px;
}
.pbd .pv-legend .sw.parallel {
  width: 4px;
  height: 14px;
  border: 0;
  background: var(--v2-ink-2);
  margin: 0 5px;
}
```

- [ ] **Step 6: Run to verify they pass**

Run: `npx vitest run src/components/process` → all pass. `npm run lint:css` → exit 0, hex ≤ 369.

- [ ] **Step 7: Stage**

```bash
git add packages/frontend/src/components/process/processMarks.ts packages/frontend/src/components/process/processMarks.test.ts packages/frontend/src/components/process/PhaseSwimlane.tsx packages/frontend/src/components/process/PhaseSwimlane.test.tsx packages/frontend/src/components/process/process-view.css
```

---

### Task 9: The Infra-board on `ProcessView`; the old path removed

**Files:**

- Modify: `packages/frontend/src/components/InfraBoardDashboard/ProjectDetail.tsx:338-359`
- Modify: `packages/frontend/src/components/process/PhaseSwimlane.tsx` (final form below)
- Modify: `packages/frontend/src/components/process/process-view.css` (merge the `.cwp-swim` rules)
- Test: `ProjectDetail.test.tsx`, `PhaseSwimlane.test.tsx`

**Interfaces:**

- Consumes: `ProcessView` (Task 5); gateway shapes (Task 8).
- Produces: `PhaseSwimlane` props, final: `{ model, statusById, marks = EMPTY_MARKS, myLanes = EMPTY_LANES, focusNodeId, onOpenCall }`. No `claimedNodeIds`, `myLaneKeys`, `claimedLabel`, `scrollToNodeId`, `density`; no `cwp-swim` class.

- [ ] **Step 1: Update `ProjectDetail.test.tsx` first.** Mock the token near the other mocks:

```tsx
const kc = vi.hoisted(() => ({
  tokenParsed: { sub: 'sub-me', realm_access: { roles: ['rip-projectleider'] } } as Record<
    string,
    unknown
  >,
}));
vi.mock('../../services/keycloak', () => ({ default: kc }));
```

Keep the existing swimlane assertions (`.pb-swim` `.done`/`.active` counts: the legend sits outside `.pb-swim`, so they hold). Replace any ✏ / `.pb-swim-node-claimed` expectation with mark-based ones, and add (using the file's existing live-instance setup with two instance tasks — one with `assignee: 'sub-me'`, one with `assignee: 'sub-colleague'`):

```tsx
it('tabs the viewer’s task "jouw taak" and a colleague’s "geclaimd"', async () => {
  // arrange the live instance with the two tasks as described above, then:
  const tabs = [...container.querySelectorAll('.pb-swim-inprogress')].map((t) => t.textContent);
  expect(tabs.sort()).toEqual(['geclaimd', 'jouw taak']);
});

it('shows a mock project without "(live)" and without a "Jouw taak" legend entry', async () => {
  // arrange a mock (non-live) project, as the existing R2.1 test does, then:
  expect(screen.queryByText(/\(live\)/)).toBeNull();
  const keys = [...container.querySelectorAll('[data-legend]')].map((e) =>
    e.getAttribute('data-legend')
  );
  expect(keys).not.toContain('mine');
});
```

Write each arrange block by copying the nearest existing test's `mockUsePhaseSwimlane` / instance-task setup in the same file and adjusting only the `assignee` fields; the assertions above are the new part.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/components/InfraBoardDashboard/ProjectDetail.test.tsx` → the new tests fail (still ✏, no legend).

- [ ] **Step 3: Move `ProjectDetail` onto `ProcessView`.** Replace the `<PhaseStepper …/>` element and the `phaseModel ? (<> … <PhaseSwimlane … /> …` title-and-swimlane part with:

```tsx
      {phaseModel ? (
        <>
          <ProcessView
            model={phaseModel}
            statusById={statusById}
            tasks={instanceTasks}
            title={{ name: phaseInfo.name, code: phaseInfo.code, live: isLive }}
            stepper={
              <PhaseStepper
                phases={RIP_PHASES}
                stepClass={stepClass}
                selected={selPhase}
                onSelect={setSelPhase}
              />
            }
          />
```

keeping everything that followed the old `<PhaseSwimlane … />` inside the fragment (the R2.1 deliverables block and the rest) unchanged. When there is no `phaseModel`, the stepper still has to render: in the `: (` branch for the no-model case, render `<PhaseStepper phases={RIP_PHASES} stepClass={stepClass} selected={selPhase} onSelect={setSelPhase} />` before whatever it shows today. Replace the `PhaseSwimlane` import with `import ProcessView from '../process/ProcessView';` and delete `activeNodeIds` (line ~274) if nothing else uses it.

- [ ] **Step 4: Final `PhaseSwimlane.tsx`.** Replace the whole file with:

```tsx
import './process-view.css';
import { STATUS, type StatusKey } from './status';
import { useEffect, useRef } from 'react';
import { edgeLabelText } from './swimlaneText';
import { gatewayKind, isIdLabel, type NodeMark } from './processMarks';
import type { NodeKind, PhaseSwimlaneModel, SwimNode } from '@ronl/shared';

/**
 * The swimlane drawing behind ProcessView. Internal to components/process:
 * dashboards use ProcessView (process-view-guard.test.ts enforces it), which
 * derives `marks` and `myLanes` from the data and the viewer.
 */

/** The one grid. */
const COL_W = 240;
const ROW_H = 132;
const NODE_W = 184;
const NODE_H = 84;
const GATE = 52;
/** Row height of a lane with no nodes in this process. */
const SLIM_H = 44;
/** Parallel split/join bar and exclusive-merge dot. */
const BAR_W = 8;
const BAR_H = 72;
const MERGE = 14;

/** Foot badge per node kind; the other kinds carry none. */
const KIND_BADGE: Partial<Record<NodeKind, string>> = {
  script: 'script',
  rule: 'DMN',
  call: 'deelproces',
};

const EMPTY_MARKS: ReadonlyMap<string, NodeMark> = new Map();
const EMPTY_LANES: ReadonlySet<string> = new Set();

export default function PhaseSwimlane({
  model,
  statusById,
  marks = EMPTY_MARKS,
  myLanes = EMPTY_LANES,
  focusNodeId,
  onOpenCall,
}: {
  model: PhaseSwimlaneModel;
  statusById: Record<string, StatusKey>;
  /** Mark per node with an open task: mine → "jouw taak", claimed → "geclaimd", open → no tab. */
  marks?: ReadonlyMap<string, NodeMark>;
  /** Lanes the viewer works in: tinted and tagged "jouw rol". */
  myLanes?: ReadonlySet<string>;
  /** Centred horizontally on mount and change; outlined unless it is the viewer's own task. */
  focusNodeId?: string | null;
  /** Adds an "open ↘" button to each call node. */
  onOpenCall?: (node: SwimNode) => void;
}) {
  const { lanes, nodes, edges } = model;
  const scrollRef = useRef<HTMLDivElement>(null);
  const nodeById = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const nCols = nodes.length ? Math.max(...nodes.map((n) => n.col)) + 1 : 1;
  const W = nCols * COL_W;

  // Parallel branches can share a (row, col) cell; occupants stack within the
  // lane in document order, and a lane's slot count is its worst cell.
  const slotsPerRow: number[] = new Array(lanes.length).fill(1);
  const cellOccupancy = new Map<string, number>();
  for (const n of nodes) {
    const key = `${n.row}:${n.col}`;
    cellOccupancy.set(key, (cellOccupancy.get(key) ?? 0) + 1);
  }
  for (const [key, count] of cellOccupancy) {
    const row = Number(key.split(':')[0]);
    if (row >= 0 && row < slotsPerRow.length) slotsPerRow[row] = Math.max(slotsPerRow[row], count);
  }
  const slotByNodeId: Record<string, number> = {};
  const seenInCell = new Map<string, number>();
  for (const n of nodes) {
    const key = `${n.row}:${n.col}`;
    const slot = seenInCell.get(key) ?? 0;
    slotByNodeId[n.id] = slot;
    seenInCell.set(key, slot + 1);
  }
  const rowsWithNodes = new Set(nodes.map((n) => n.row));
  const isEmptyLane = (row: number) => !rowsWithNodes.has(row);
  const laneHeights = slotsPerRow.map((slots, row) => (isEmptyLane(row) ? SLIM_H : slots * ROW_H));
  const laneTop: number[] = [];
  {
    let acc = 0;
    for (const h of laneHeights) {
      laneTop.push(acc);
      acc += h;
    }
  }
  const totalLaneHeight = laneHeights.reduce((sum, h) => sum + h, 0);

  // Rework (back) edges route through a band below every node row.
  const backEdgeCount = edges.filter((e) => e.back).length;
  const bandReserve = backEdgeCount ? backEdgeCount * 14 + 10 : 0;
  const H = totalLaneHeight + bandReserve;
  const cx = (n: { col: number }) => n.col * COL_W + COL_W / 2;
  const cy = (n: { id: string; row: number }) =>
    (laneTop[n.row] ?? n.row * ROW_H) + (slotByNodeId[n.id] ?? 0) * ROW_H + ROW_H / 2;
  const st = (id: string): StatusKey => statusById[id] ?? 'todo';
  const halfW = (n: SwimNode) => {
    if (n.kind !== 'gateway' && n.kind !== 'parallel') return NODE_W / 2;
    const g = gatewayKind(n, edges);
    return g === 'split' || g === 'join' ? BAR_W / 2 : g === 'merge' ? MERGE / 2 : GATE / 2;
  };

  useEffect(() => {
    if (focusNodeId === undefined || !scrollRef.current) return;
    const target = focusNodeId === null ? undefined : nodeById[focusNodeId];
    const el = scrollRef.current;
    el.scrollLeft = target ? Math.max(0, cx(target) - el.clientWidth / 2) : 0;
    // cx and nodeById derive from model, which is in the deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusNodeId, model]);
  const edgeColor = (from: string) => (st(from) === 'done' ? '#3fa535' : '#c2c7d0');

  let backCount = 0;
  const paths = edges
    .map((e, i) => {
      const a = nodeById[e.from],
        b = nodeById[e.to];
      if (!a || !b) return null;
      const ax = cx(a),
        ay = cy(a),
        bx = cx(b),
        by = cy(b);
      let d: string;
      if (e.back) {
        const bandY = totalLaneHeight + 10 + backCount * 14;
        backCount++;
        d = `M ${ax} ${ay + NODE_H / 2} V ${bandY} H ${bx} V ${by + NODE_H / 2}`;
      } else {
        const sx = ax + halfW(a),
          tx = bx - halfW(b);
        const midX = a.col === b.col ? ax : (sx + tx) / 2;
        d =
          a.col === b.col
            ? `M ${ax} ${ay + NODE_H / 2} V ${by - NODE_H / 2}`
            : `M ${sx} ${ay} H ${midX} V ${by} H ${tx}`;
      }
      return {
        d,
        color: edgeColor(e.from),
        label: e.label,
        key: i,
        lx: (ax + bx) / 2,
        ly: (ay + by) / 2 - 8,
      };
    })
    .filter(Boolean) as {
    d: string;
    color: string;
    label?: string;
    key: number;
    lx: number;
    ly: number;
  }[];

  const laneMine = (key: string) => myLanes.has(key);
  const emptyAttr = (row: number) => (isEmptyLane(row) ? { 'data-lane-empty': '' } : {});

  return (
    <div className="pb-swim">
      <div className="pb-swim-lanes">
        {lanes.map((l, i) => (
          <div
            className={`pb-swim-lane-label${laneMine(l.key) ? ' cwp-mine' : ''}${isEmptyLane(i) ? ' slim' : ''}`}
            key={l.key}
            style={{ height: laneHeights[i] }}
            {...emptyAttr(i)}
          >
            {l.label}
            {laneMine(l.key) && <span className="cwp-jij">jouw rol</span>}
          </div>
        ))}
      </div>
      <div className="pb-swim-scroll" ref={scrollRef}>
        <div className="pb-swim-canvas" style={{ width: W, height: H }}>
          {lanes.map((l, i) => (
            <div
              key={l.key}
              className={`pb-swim-band ${i % 2 ? 'alt' : ''}${laneMine(l.key) ? ' cwp-mine' : ''}`}
              style={{ top: laneTop[i], height: laneHeights[i], width: W }}
              {...emptyAttr(i)}
            />
          ))}
          <svg className="pb-swim-svg" width={W} height={H}>
            <defs>
              <marker
                id="pb-arrow"
                markerWidth="8"
                markerHeight="8"
                refX="6"
                refY="3"
                orient="auto"
              >
                <path d="M0,0 L6,3 L0,6 Z" fill="#9aa1ad" />
              </marker>
            </defs>
            {paths.map((p) => (
              <path
                key={p.key}
                d={p.d}
                fill="none"
                stroke={p.color}
                strokeWidth="2"
                markerEnd="url(#pb-arrow)"
              />
            ))}
          </svg>
          {paths
            .filter((p) => p.label)
            .map((p) => (
              <span
                key={'l' + p.key}
                className="pb-swim-edgelabel"
                style={{ left: p.lx, top: p.ly }}
                title={p.label}
              >
                {edgeLabelText(p.label!)}
              </span>
            ))}
          {nodes.map((n) => {
            const s = STATUS[st(n.id)];
            if (n.kind === 'start' || n.kind === 'end') {
              return (
                <div
                  key={n.id}
                  className={`pb-swim-event ${st(n.id)}`}
                  data-node-id={n.id}
                  style={{ left: cx(n) - 34, top: cy(n) - 22 }}
                >
                  <span className="ev-dot" style={{ borderColor: s.color }} />
                  <span className="ev-label">{n.label}</span>
                </div>
              );
            }
            if (n.kind === 'gateway' || n.kind === 'parallel') {
              const g = gatewayKind(n, edges);
              if (g === 'split' || g === 'join') {
                return (
                  <div
                    key={n.id}
                    className={`pb-swim-bar ${st(n.id)} ${g}`}
                    data-node-id={n.id}
                    data-gateway={g}
                    style={{
                      left: cx(n) - BAR_W / 2,
                      top: cy(n) - BAR_H / 2,
                      width: BAR_W,
                      height: BAR_H,
                    }}
                  >
                    <span className="bl">{g === 'split' ? 'tegelijk' : 'alles klaar'}</span>
                  </div>
                );
              }
              if (g === 'merge') {
                return (
                  <div
                    key={n.id}
                    className={`pb-swim-merge ${st(n.id)}`}
                    data-node-id={n.id}
                    data-gateway="merge"
                    style={{
                      left: cx(n) - MERGE / 2,
                      top: cy(n) - MERGE / 2,
                      width: MERGE,
                      height: MERGE,
                    }}
                  />
                );
              }
              return (
                <div
                  key={n.id}
                  className={`pb-swim-gate ${st(n.id)} ${n.kind}`}
                  data-node-id={n.id}
                  data-gateway="decision"
                  style={{
                    left: cx(n) - GATE / 2,
                    top: cy(n) - GATE / 2,
                    width: GATE,
                    height: GATE,
                  }}
                >
                  <span className="gx">?</span>
                  {!isIdLabel(n) && <span className="gl">{n.label}</span>}
                </div>
              );
            }
            const mark = marks.get(n.id);
            const tab = mark === 'mine' ? 'jouw taak' : mark === 'claimed' ? 'geclaimd' : null;
            const focus = focusNodeId === n.id && mark !== 'mine';
            // Script and rule tasks run without a person: drawn dashed like a service task.
            const kindClass = n.kind === 'script' || n.kind === 'rule' ? 'service' : n.kind;
            const badge = KIND_BADGE[n.kind];
            return (
              <div
                key={n.id}
                title={n.dmn ? `${n.label} (${n.dmn})` : n.label}
                className={`pb-swim-node ${st(n.id)} ${kindClass}${mark === 'mine' ? ' pb-swim-node-claimed' : ''}${focus ? ' pv-focus' : ''}`}
                data-node-id={n.id}
                {...(mark ? { 'data-mark': mark } : {})}
                style={{
                  left: cx(n) - NODE_W / 2,
                  top: cy(n) - NODE_H / 2,
                  width: NODE_W,
                  height: NODE_H,
                  borderTopColor: s.color,
                }}
              >
                <span className="nlabel">{n.label}</span>
                {n.docs?.length ? (
                  <span className="nfoot">
                    {n.docs.map((doc) => (
                      <span key={doc} className="ndoc">
                        {doc}
                      </span>
                    ))}
                  </span>
                ) : null}
                {n.kind === 'service' && <span className="nauto">automatisch</span>}
                {badge && <span className="cwp-kind">{badge}</span>}
                {n.kind === 'call' && onOpenCall && (
                  <button
                    type="button"
                    className="cwp-callbtn"
                    aria-label={`open deelproces ${n.label}`}
                    onClick={() => onOpenCall(n)}
                  >
                    open ↘
                  </button>
                )}
                {tab && (
                  <span
                    className={`pb-swim-inprogress${mark === 'claimed' ? ' other' : ''}`}
                    title={mark === 'claimed' ? 'Geclaimd door een collega' : 'In behandeling'}
                  >
                    {tab}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
```

Run Prettier on it: `npx prettier --write packages/frontend/src/components/process/PhaseSwimlane.tsx` (a `.tsx`, in Prettier's scope).

- [ ] **Step 5: Merge the CSS.** In `process-view.css` replace everything from the line `/* In-progress badge on claimed swimlane nodes */` to the end of the file with:

```css
/* Shared swimlane look (ProcessView). Formerly scoped under .cwp-swim, which
   only the Caseworker overlay carried; the Infra-board now shares it. */
.pbd .pb-swim-inprogress {
  position: absolute;
  top: -10px;
  right: 6px;
  padding: 1px 5px;
  font-family: var(--v2-mono);
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--rba-ink-inverse);
  background: var(--v2-accent);
  pointer-events: none;
}
.pbd .pb-swim-inprogress.other {
  color: var(--v2-ink-2);
  background: var(--v2-paper);
  border: 1px solid var(--v2-ink-3);
}
.pbd .pb-swim-node.pb-swim-node-claimed {
  outline: 2px solid var(--v2-accent);
  outline-offset: 2px;
}
.pbd .pb-swim-node.pv-focus {
  outline: 2px dashed var(--v2-accent);
  outline-offset: 2px;
}
.pbd .cwp-jij {
  display: block;
  margin: 4px 0 0;
  width: max-content;
  padding: 1px 6px;
  font-family: var(--v2-mono);
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--rba-ink-inverse);
  background: var(--v2-chrome, #0046ad);
}
.pbd .pb-swim-lane-label {
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
}
.pbd .pb-swim-lane-label.cwp-mine {
  background: #eaf1fb;
  color: var(--v2-ink);
}
.pbd .pb-swim-lane-label.slim {
  flex-direction: row;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
}
.pbd .pb-swim-lane-label.slim .cwp-jij {
  margin: 0;
}
.pbd .pb-swim-band.cwp-mine {
  background: rgba(0, 70, 173, 0.045);
}
.pbd .pb-swim-node {
  padding: 12px 10px 14px;
}
.pbd .pb-swim-node .nlabel {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 12px;
}
.pbd .pb-swim-node .nfoot {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
.pbd .pb-swim-node .nfoot .ndoc {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pbd .pb-swim-node .cwp-kind {
  position: absolute;
  bottom: -8px;
  left: 8px;
  padding: 0 4px;
  font-family: var(--v2-mono);
  font-size: 8.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--v2-ink-3);
  background: var(--v2-paper);
  border: 1px solid var(--v2-rule);
}
.pbd .pb-swim-node.call {
  border-width: 1px 1px 1px 1px;
  border-top-width: 3px;
  box-shadow:
    inset 0 0 0 3px var(--v2-paper),
    inset 0 0 0 4px var(--v2-rule);
}
.pbd .cwp-callbtn {
  position: absolute;
  bottom: -9px;
  right: 8px;
  padding: 0 6px;
  font: inherit;
  font-family: var(--v2-mono);
  font-size: 9.5px;
  font-weight: 700;
  color: var(--rba-ink-inverse);
  background: var(--v2-chrome, #0046ad);
  border: 0;
  cursor: pointer;
}
.pbd .cwp-callbtn:focus-visible {
  outline: 2px solid var(--v2-accent);
  outline-offset: 2px;
}
.pbd .pb-swim-edgelabel {
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pbd .pb-swim-gate .gl {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
```

then re-append, unchanged, the legend block from Task 5 and the gateway-shape block from Task 8 minus its `.cwp-swim .pb-swim-gate .gl` line (now in the block above), and delete the separate "ProcessView (shared path)" block from Task 4 (its rules are in the block above). Every hex value in this block existed before (`#eaf1fb`, `#0046ad`); confirm with `npm run lint:css:summary` that hex ≤ 369.

- [ ] **Step 6: Move `PhaseSwimlane.test.tsx` to the final props.** Mechanical rules:
  - delete the describe blocks "PhaseSwimlane — caseworker additions" and "PhaseSwimlane — roomy density and readable edge labels" and the test "marks a claimed node with the claimed class and an in-progress indicator": their behaviour is now covered by the marks-path block (tabs, roomy sizes, lane tint, focus) and by `edgeLabelText`'s own tests;
  - in the remaining tests replace `claimedNodeIds={…}` with `marks={new Map([[id, 'mine']])}` where a claimed node was meant, and drop `density`/`myLaneKeys`/`claimedLabel`/`scrollToNodeId` props (use `myLanes` / `focusNodeId`);
  - sizes: every hard-coded compact number (`88` row, `152`/`54` node, `190` column, `46` gate) becomes the roomy one (`132`, `184`/`84`, `240`, `52`); lanes without nodes in a fixture now get `44`;
  - "marks a parallel gateway differently from an exclusive one" and "renders an exclusive gateway with the × marker": rewrite to the shapes — the `MODEL` fixture's `p` (parallel, two outgoing) is a `.pb-swim-bar` with text `tegelijk`; `RICH_MODEL`'s `g1`/`g2` (exclusive) are merges or decisions by their edges — assert `data-gateway` accordingly;
  - "shows the Infra-board's edge labels verbatim": delete; edge labels are always shortened with the full label as tooltip — keep/adapt "shortens expression labels … with the full expression as tooltip" without the caseworker prop;
  - add one test that the root has no `cwp-swim` class.
    Also add `outerHTML`-free regression: the existing "no NaN" tests stay.

- [ ] **Step 7: Run everything touched**

Run: `npx vitest run src/components/process src/components/InfraBoardDashboard src/components/CaseworkerDashboardV2` → all pass.
Run: type-check, lint → clean. `grep -rn "cwp-swim\|claimedNodeIds\|claimedLabel\|density=" packages/frontend/src` → no matches.

- [ ] **Step 8: Stage**

```bash
git add packages/frontend/src/components/InfraBoardDashboard/ProjectDetail.tsx packages/frontend/src/components/InfraBoardDashboard/ProjectDetail.test.tsx packages/frontend/src/components/process/PhaseSwimlane.tsx packages/frontend/src/components/process/PhaseSwimlane.test.tsx packages/frontend/src/components/process/process-view.css
```

---

### Task 10: The guard — nothing outside `process/` renders `PhaseSwimlane`

**Files:**

- Create: `packages/frontend/src/components/process/process-view-guard.test.ts`

**Interfaces:**

- Consumes: the file tree only.
- Produces: a CI failure naming any file outside `components/process/` that imports `PhaseSwimlane`.

- [ ] **Step 1: Write the test**

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ProcessView is the one way to show a process (see its header). This guard
 * fails when a file outside components/process imports PhaseSwimlane, so a
 * new dashboard cannot draw a swimlane around the shared rendering. It
 * asserts that it finds ProcessView's own import, so a broken scan cannot
 * pass by finding nothing.
 */
const PROCESS_DIR = dirname(fileURLToPath(import.meta.url));
const FRONTEND_SRC = join(PROCESS_DIR, '..', '..');
const COCKPIT_SRC = join(FRONTEND_SRC, '..', '..', 'pa-cockpit', 'src');
const IMPORTS_SWIMLANE = /(?:from\s+|import\s*\(\s*)['"][^'"]*\/PhaseSwimlane['"]/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'node_modules' ? [] : sourceFiles(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('process view guard', () => {
  const importers = [FRONTEND_SRC, COCKPIT_SRC]
    .flatMap(sourceFiles)
    .filter((f) => IMPORTS_SWIMLANE.test(readFileSync(f, 'utf8')));
  const inProcessDir = (f: string) =>
    !relative(PROCESS_DIR, f).startsWith('..') && !relative(PROCESS_DIR, f).includes(`..${sep}`);

  it('finds ProcessView’s own import (the scan works)', () => {
    expect(importers.some((f) => f.endsWith(`${sep}ProcessView.tsx`))).toBe(true);
  });

  it('finds no PhaseSwimlane import outside components/process', () => {
    const outside = importers.filter((f) => !inProcessDir(f)).map((f) => relative(FRONTEND_SRC, f));
    expect(outside).toEqual([]);
  });
});
```

- [ ] **Step 2: Prove it can fail.** Temporarily add `import PhaseSwimlane from '../process/PhaseSwimlane';` to the top of `ProjectDetail.tsx`, run `npx vitest run src/components/process/process-view-guard.test.ts` → FAIL naming `components/InfraBoardDashboard/ProjectDetail.tsx`. Remove the line again.

- [ ] **Step 3: Run to verify it passes**

Run: `npx vitest run src/components/process/process-view-guard.test.ts` → both pass.

- [ ] **Step 4: Stage**

```bash
git add packages/frontend/src/components/process/process-view-guard.test.ts
```

---

### Task 11: Procesgegevens folded by default — `ProcessVarsDisclosure`

**Files:**

- Create: `packages/frontend/src/components/process/ProcessVarsDisclosure.tsx`
- Create: `packages/frontend/src/components/process/process-disclosure.css`
- Modify: `packages/frontend/src/components/CaseworkerDashboardV2/TakenInbox.tsx` (lines ~109-110, ~240, ~430-453)
- Modify: `packages/frontend/src/components/InfraBoardDashboard/ProjectDetail.tsx` (lines ~137-140)
- Modify: `packages/frontend/src/components/process/caseworker-process.css` (remove the disclosure rules)
- Test: `packages/frontend/src/components/process/ProcessVarsDisclosure.test.tsx`; update `TakenInbox.test.tsx` if it touches the disclosure

**Interfaces:**

- Consumes: `ProcessVarsSection` default export from `../CaseworkerDashboard/ProcessVarsSection` (props `{ variables, loading }`).
- Produces: `export default function ProcessVarsDisclosure(props: ComponentProps<typeof ProcessVarsSection>): JSX.Element`. Callers pass `key={task.id}`.

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../CaseworkerDashboard/ProcessVarsSection', () => ({
  default: () => <table data-testid="vars" />,
}));

import ProcessVarsDisclosure from './ProcessVarsDisclosure';

const draw = (key: string) => <ProcessVarsDisclosure key={key} variables={[]} loading={false} />;

describe('ProcessVarsDisclosure', () => {
  it('starts folded', () => {
    render(draw('t1'));
    const button = screen.getByRole('button', { name: /Procesgegevens/ });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.textContent).toContain('Gegevens tonen');
    expect(screen.queryByTestId('vars')).toBeNull();
  });

  it('opens and closes, naming the region it controls', async () => {
    const user = userEvent.setup();
    render(draw('t1'));
    const button = screen.getByRole('button', { name: /Procesgegevens/ });
    await user.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(button.textContent).toContain('Gegevens verbergen');
    const region = document.getElementById(button.getAttribute('aria-controls')!);
    expect(region?.querySelector('[data-testid="vars"]')).toBeTruthy();
    await user.click(button);
    expect(screen.queryByTestId('vars')).toBeNull();
  });

  it('folds again for a new task (a new key)', async () => {
    const user = userEvent.setup();
    const { rerender } = render(draw('t1'));
    await user.click(screen.getByRole('button', { name: /Procesgegevens/ }));
    rerender(draw('t2'));
    expect(
      screen.getByRole('button', { name: /Procesgegevens/ }).getAttribute('aria-expanded')
    ).toBe('false');
  });
});
```

Check `ProcessVarsSection`'s `variables` prop type first; if it is not an array, pass whatever empty value its type accepts (e.g. `{}`) in `draw`.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/process/ProcessVarsDisclosure.test.tsx` → FAIL, cannot resolve.

- [ ] **Step 3: Implement the component**

```tsx
import { useId, useState, type ComponentProps } from 'react';
import ProcessVarsSection from '../CaseworkerDashboard/ProcessVarsSection';
import './process-disclosure.css';

/**
 * "Procesgegevens" as a disclosure, folded until asked for, on every
 * dashboard's task panel. Callers key it by task, so it folds again for each
 * new task. Imports its own CSS so it styles wherever it is used.
 */
export default function ProcessVarsDisclosure(props: ComponentProps<typeof ProcessVarsSection>) {
  const [open, setOpen] = useState(false);
  const regionId = useId();
  return (
    <section className="v2-taken-section">
      <h3>
        <button
          type="button"
          className="cwp-disclosure"
          aria-expanded={open}
          aria-controls={regionId}
          onClick={() => setOpen((o) => !o)}
        >
          <span>Procesgegevens</span>
          <span className="cwp-disclosure-hint">
            {open ? 'Gegevens verbergen' : 'Gegevens tonen'}
            <span className="cwp-disclosure-icon" aria-hidden="true">
              {open ? '▲' : '▼'}
            </span>
          </span>
        </button>
      </h3>
      {open && (
        <div id={regionId}>
          <ProcessVarsSection {...props} />
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Move the CSS.** Create `process-disclosure.css` with the six `.cwd-v2 .cwp-disclosure…` rules cut verbatim from the end of `caseworker-process.css` (the block headed `/* Procesgegevens folds away behind its heading … */`), with this header:

```css
/* Procesgegevens disclosure (ProcessVarsDisclosure). Moved from
   caseworker-process.css so any dashboard's task panel can use it.
   One-line rules: never run prettier on this file. */
```

Delete that block from `caseworker-process.css`.

- [ ] **Step 5: Use it in both panels.**
      In `TakenInbox.tsx`: delete the `varsOpen` state (and its comment), the `setVarsOpen(false);` call, and replace the whole `<section className="v2-taken-section">…Procesgegevens…</section>` with:

```tsx
<ProcessVarsDisclosure key={selected.id} variables={taskVariables} loading={detailLoading} />
```

In `ProjectDetail.tsx` replace

```tsx
<section className="v2-taken-section">
  <h3>Procesgegevens</h3>
  <ProcessVarsSection variables={variables} loading={detailLoading} />
</section>
```

with

```tsx
<ProcessVarsDisclosure key={task.id} variables={variables} loading={detailLoading} />
```

Add `import ProcessVarsDisclosure from '../process/ProcessVarsDisclosure';` to both; remove the now-unused `ProcessVarsSection` imports.

- [ ] **Step 6: Update the panel tests.** In `TakenInbox.test.tsx`, any test that clicked the old disclosure keeps working (same button text and role). In `ProjectDetail.test.tsx`, `ProcessVarsSection` is mocked to `null`; add a test that the "Procesgegevens" button exists with `aria-expanded="false"`.

- [ ] **Step 7: Run**

Run: `npx vitest run src/components/process src/components/CaseworkerDashboardV2 src/components/InfraBoardDashboard` → all pass. `npm run lint:css:summary` → hex ≤ 369.

- [ ] **Step 8: Stage**

```bash
git add packages/frontend/src/components/process/ProcessVarsDisclosure.tsx packages/frontend/src/components/process/ProcessVarsDisclosure.test.tsx packages/frontend/src/components/process/process-disclosure.css packages/frontend/src/components/process/caseworker-process.css packages/frontend/src/components/CaseworkerDashboardV2/TakenInbox.tsx packages/frontend/src/components/CaseworkerDashboardV2/TakenInbox.test.tsx packages/frontend/src/components/InfraBoardDashboard/ProjectDetail.tsx packages/frontend/src/components/InfraBoardDashboard/ProjectDetail.test.tsx
```

---

### Task 12: The step list reads gateways by kind

**Files:**

- Modify: `packages/frontend/src/components/process/laneSteps.ts`
- Modify: `packages/frontend/src/components/process/ProcessLaneSteps.tsx`
- Modify: `packages/frontend/src/components/process/caseworker-process.css` (append one rule)
- Test: `laneSteps.test.ts`, `ProcessLaneSteps.test.tsx`

**Interfaces:**

- Consumes: `gatewayKind`, `isIdLabel`, `GatewayKind` (Task 2); `edgeLabelText`.
- Produces: `TrailStep` gains `gateway?: GatewayKind` and `idLabel?: boolean`; `export const GATEWAY_STEP: Record<GatewayKind, string>`; `export const GATEWAY_TAG: Record<GatewayKind, string>`; `export function stepName(step: TrailStep): string`; `export function nextMeta(step: TrailStep): string`.

- [ ] **Step 1: Write the failing tests** in `laneSteps.test.ts`:

```ts
import { GATEWAY_TAG, nextMeta, stepName, type TrailStep } from './laneSteps';

const step = (over: Partial<TrailStep>): TrailStep => ({
  processKey: 'P',
  nodeId: 'n',
  label: 'n',
  kind: 'gateway',
  laneKey: 'l',
  state: 'next',
  isMine: false,
  ...over,
});

describe('gateway steps', () => {
  it('names an unnamed gateway by its kind, a named decision by its question', () => {
    expect(
      stepName(
        step({
          gateway: 'split',
          idLabel: true,
          kind: 'parallel',
          label: 'Gateway_OnderzoekenSplit',
        })
      )
    ).toBe('Tegelijk');
    expect(stepName(step({ gateway: 'join', idLabel: true, kind: 'parallel' }))).toBe(
      'Alles klaar'
    );
    expect(stepName(step({ gateway: 'merge', idLabel: true }))).toBe('Samenkomst');
    expect(stepName(step({ gateway: 'decision', idLabel: true }))).toBe('Beslissing');
    expect(stepName(step({ gateway: 'decision', idLabel: false, label: 'Akkoord?' }))).toBe(
      'Akkoord?'
    );
    expect(stepName(step({ kind: 'task', label: 'Taak' }))).toBe('Taak');
  });

  it('tags gateways by kind', () => {
    expect(GATEWAY_TAG).toEqual({
      decision: 'KEUZE',
      split: 'TEGELIJK',
      join: 'SAMENKOMST',
      merge: 'SAMENKOMST',
    });
  });

  it('describes what comes next per kind', () => {
    expect(nextMeta(step({ gateway: 'split', branches: ['—', '—'] }))).toBe(
      'Hierna · tegelijk verder'
    );
    expect(nextMeta(step({ gateway: 'decision', branches: ['ja', '${x == false}'] }))).toBe(
      'Hierna · keuze: ja / x = false'
    );
    expect(nextMeta(step({ gateway: 'decision', branches: ['—', '—'] }))).toBe('Hierna · keuze');
    expect(nextMeta(step({ gateway: 'join' }))).toBe('Hierna');
    expect(nextMeta(step({ kind: 'task', gateway: undefined }))).toBe('Hierna');
  });

  it('carries gateway kind and id-label flag onto trail steps', () => {
    // Build a ctx with a parallel split after the current node, as the existing
    // buildTrail tests do, and assert the "Hierna" step has gateway 'split' and idLabel true.
  });
});
```

For the last test, copy the nearest existing `buildTrail` test's context, give its model a `parallel` node `Gateway_S` (label `Gateway_S`) with two outgoing edges right after the current node, and assert `buildTrail(ctx).at(-1)` has `gateway: 'split'` and `idLabel: true`.

In `ProcessLaneSteps.test.tsx`, add a test rendering a context whose "Hierna" step is that split: the step name reads "Tegelijk", the type tag "TEGELIJK", the meta "Hierna · tegelijk verder", and the text `Gateway_S` appears nowhere.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/components/process/laneSteps.test.ts src/components/process/ProcessLaneSteps.test.tsx` → FAIL (no exports).

- [ ] **Step 3: Implement in `laneSteps.ts`.**

```ts
import { gatewayKind, isIdLabel, type GatewayKind } from './processMarks';
import { edgeLabelText } from './swimlaneText';
```

Add to `TrailStep`:

```ts
  /** The gateway's kind (decision, merge, split, join); absent for other steps. */
  gateway?: GatewayKind;
  /** The label is only the element id (an unnamed BPMN element). */
  idLabel?: boolean;
```

In `stepOf`, after `isMine: false,` add:

```ts
    ...(isGateway(node)
      ? { gateway: gatewayKind(node, model.edges) ?? undefined, idLabel: isIdLabel(node) }
      : {}),
```

And export:

```ts
/** How a gateway step reads when its own label says nothing. */
export const GATEWAY_STEP: Record<GatewayKind, string> = {
  decision: 'Beslissing',
  split: 'Tegelijk',
  join: 'Alles klaar',
  merge: 'Samenkomst',
};

/** Step-type tag per gateway kind, replacing the one "KEUZE" for every gateway. */
export const GATEWAY_TAG: Record<GatewayKind, string> = {
  decision: 'KEUZE',
  split: 'TEGELIJK',
  join: 'SAMENKOMST',
  merge: 'SAMENKOMST',
};

/** A step's display name: a decision by its question when it has one, other gateways by their kind. */
export function stepName(step: TrailStep): string {
  if (!step.gateway) return step.label;
  if (step.gateway === 'decision' && !step.idLabel) return step.label;
  return GATEWAY_STEP[step.gateway];
}

/** The meta line of a "Hierna" step. */
export function nextMeta(step: TrailStep): string {
  if (step.gateway === 'split') return 'Hierna · tegelijk verder';
  if (step.gateway === 'decision') {
    const named = (step.branches ?? []).filter((b) => b !== '—').map(edgeLabelText);
    return named.length > 0 ? `Hierna · keuze: ${named.join(' / ')}` : 'Hierna · keuze';
  }
  return 'Hierna';
}
```

- [ ] **Step 4: Render it in `ProcessLaneSteps.tsx`.** Import `GATEWAY_TAG`, `nextMeta`, `stepName`. In `StepMeta` replace

```tsx
text = step.branches ? `Hierna · splitst: ${step.branches.join(' / ')}` : 'Hierna';
```

with `text = nextMeta(step);`. In the step row replace

```tsx
{
  s.outcome ? `${s.label} → ${edgeLabelText(s.outcome)}` : s.label;
}
```

with

```tsx
{
  s.outcome ? `${stepName(s)} → ${edgeLabelText(s.outcome)}` : stepName(s);
}
```

and replace `{KIND_TAG[s.kind] ?? ''}` with `{s.gateway ? GATEWAY_TAG[s.gateway] : (KIND_TAG[s.kind] ?? '')}`. Add `s.gateway ?? ''` to the `<li>` class list (so `split`/`join` can style the dot).

- [ ] **Step 5: Bar dot for parallel steps.** Append to `caseworker-process.css` (one line, no Prettier):

```css
.cwd-v2 .cwp-st.split .cwp-st-dot,
.cwd-v2 .cwp-st.join .cwp-st-dot {
  width: 3px;
  height: 12px;
  margin-top: 3px;
  border: 0;
  border-radius: 0;
  transform: none;
  background: var(--v2-ink-2);
}
```

- [ ] **Step 6: Run**

Run: `npx vitest run src/components/process` → all pass.

- [ ] **Step 7: Stage**

```bash
git add packages/frontend/src/components/process/laneSteps.ts packages/frontend/src/components/process/laneSteps.test.ts packages/frontend/src/components/process/ProcessLaneSteps.tsx packages/frontend/src/components/process/ProcessLaneSteps.test.tsx packages/frontend/src/components/process/caseworker-process.css
```

---

### Task 13: e2e for the Infra-board (tests 1 and 2), changelog, then the PR 2 checkpoint

**Files:**

- Modify: `packages/frontend/e2e/process-view.spec.ts`
- Modify: `packages/frontend/src/pages/changelog-data.ts`

**Interfaces:**

- Consumes: `assertProcessViewRules` (Task 7); `OPERATON_URL` from `./helpers/target`; `recordPendingCleanup` from `./helpers/operaton-cleanup`.
- Produces: tests "test 1 — Infra-board follows the shared rules" and "test 2 — marks in a controlled setup".

- [ ] **Step 1: Check the start path for test 2 (read-only).** From the repo root, against the local stack:

```bash
curl -s "http://localhost:8081/engine-rest/process-definition?key=RipR24Process&latestVersion=true" | head -c 400
```

Note whether the definition has a `tenantId` (expected `flevoland`). Then confirm the test user can work Projectleider tasks: `grep -n "rip-projectleider" packages/frontend/e2e/*.ts deployment/ -r | head` and the realm export for `test-infra-flevoland`. If R2.4 is not deployed, test 2 must skip with that reason (built into the code below).

- [ ] **Step 2: Add test 1 for the Infra-board** inside the `test.describe('ProcessView', …)` block:

```ts
test('test 1 — Infra-board follows the shared rules', async ({ page }) => {
  rateLimit = watchForRateLimit(page);
  await loginAsMedewerker(page, 'test-infra-flevoland', 'test123');
  await page.locator('.v2-tabs button', { hasText: 'Mijn dag' }).first().click();

  const item = page.locator('.pb-todo-item').first();
  if ((await item.count()) === 0) {
    test.skip(true, 'No live project in the Mijn dag queue on this tier; nothing to open.');
  }
  await item.click();

  const view = page.locator('.pv');
  await expect(view).toBeVisible({ timeout: 30_000 });
  await assertProcessViewRules(view);

  // Tabs agree with the page's own "Open taken" list.
  const pills = await page.locator('.v2-taken-pill').allTextContents();
  const claimedPills = pills.filter((p) => /Geclaimd/i.test(p)).length;
  const tabs = await view.locator('.pb-swim-inprogress').count();
  expect(tabs > 0, 'a claimed task shows a tab in the diagram').toBe(claimedPills > 0);

  // Procesgegevens starts folded.
  const task = page.locator('.v2-taken-item, .pb-open-task').first();
  if ((await task.count()) > 0) {
    await task.click();
    const disclosure = page.getByRole('button', { name: /Procesgegevens/ });
    await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
    await disclosure.click();
    await expect(disclosure).toHaveAttribute('aria-expanded', 'true');
  }
});
```

Confirm the open-task row selector in `ProjectDetail.tsx` (the element rendering each "Open taken" entry around line 400–425) and use it in place of `.v2-taken-item, .pb-open-task`.

- [ ] **Step 3: Add the Caseworker step-list check** at the end of the Caseworker test 1 (before opening the overlay):

```ts
// The step list shows no gateway element id.
const stepNames = await page.locator('.cwp-st-name').allTextContents();
expect(stepNames.filter((n) => /^Gateway_/.test(n.trim()))).toEqual([]);
```

- [ ] **Step 4: Add test 2**, at the end of the file:

```ts
import { OPERATON_URL } from './helpers/target';
import { recordPendingCleanup } from './helpers/operaton-cleanup';

const OPERATON = OPERATON_URL;
const COLLEAGUE = 'e2e-collega';

/** The targets of the deployed R2.4 process's parallel split, read from its BPMN XML. */
async function parallelBranchTargets(definitionId: string): Promise<string[]> {
  const res = await fetch(`${OPERATON}/process-definition/${definitionId}/xml`);
  const { bpmn20Xml } = (await res.json()) as { bpmn20Xml: string };
  const splits = [...bpmn20Xml.matchAll(/<(?:bpmn:)?parallelGateway[^>]*\bid="([^"]+)"/g)].map(
    (m) => m[1]
  );
  for (const id of splits) {
    const targets = [
      ...bpmn20Xml.matchAll(
        new RegExp(
          `sourceRef="${id}"[^>]*targetRef="([^"]+)"|targetRef="([^"]+)"[^>]*sourceRef="${id}"`,
          'g'
        )
      ),
    ].map((m) => m[1] ?? m[2]);
    if (targets.length >= 2) return targets;
  }
  return [];
}

test.describe('ProcessView — controlled marks', () => {
  let instanceId: string | null = null;

  test.afterEach(async () => {
    if (!instanceId) return;
    await fetch(`${OPERATON}/process-instance/${instanceId}?skipCustomListeners=true`, {
      method: 'DELETE',
    });
    await fetch(`${OPERATON}/history/process-instance/${instanceId}`, { method: 'DELETE' });
    instanceId = null;
  });

  test('test 2 — mine, claimed and open marks, and parallel bars', async ({ page }) => {
    const defs = (await (
      await fetch(`${OPERATON}/process-definition?key=RipR24Process&latestVersion=true`)
    ).json()) as Array<{ id: string; tenantId: string | null }>;
    const def = defs.find((d) => d.tenantId === 'flevoland') ?? defs[0];
    if (!def) test.skip(true, 'RipR24Process is not deployed on this tier.');
    const targets = await parallelBranchTargets(def!.id);
    if (targets.length < 2)
      test.skip(true, 'RipR24Process has no parallel split with two branches.');

    const businessKey = `e2e-process-view-${Date.now()}`;
    const started = await fetch(`${OPERATON}/process-definition/${def!.id}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        businessKey,
        variables: {
          municipality: { value: 'flevoland', type: 'String' },
          projectNumber: { value: 'E2E-PV', type: 'String' },
          projectName: { value: 'E2E ProcessView', type: 'String' },
        },
        startInstructions: targets.map((activityId) => ({
          type: 'startBeforeActivity',
          activityId,
        })),
      }),
    });
    expect(started.ok, `start failed: HTTP ${started.status}`).toBe(true);
    instanceId = ((await started.json()) as { id: string }).id;
    recordPendingCleanup(businessKey);

    const tasks = (await (
      await fetch(`${OPERATON}/task?processInstanceId=${instanceId}`)
    ).json()) as Array<{ id: string; taskDefinitionKey: string; name: string }>;
    expect(tasks.length, 'both parallel branches are open tasks').toBeGreaterThanOrEqual(2);
    const [mineTask, colleagueTask] = tasks;
    await fetch(`${OPERATON}/task/${colleagueTask.id}/assignee`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: COLLEAGUE }),
    });

    rateLimit = watchForRateLimit(page);
    await loginAsMedewerker(page, 'test-infra-flevoland', 'test123');
    await page.locator('.v2-tabs button', { hasText: 'Mijn dag' }).first().click();
    await page
      .locator('.pb-todo-item', { hasText: 'E2E ProcessView' })
      .first()
      .click({ timeout: 60_000 });

    // Claim the other task through the UI, so its assignee is the logged-in user's sub.
    await page.locator('.v2-taken-item, .pb-open-task', { hasText: mineTask.name }).first().click();
    const claim = page.getByRole('button', { name: 'Taak claimen' });
    if (await claim.isVisible()) await claim.click();

    const view = page.locator('.pv');
    await expect(view.locator(`[data-node-id="${mineTask.taskDefinitionKey}"]`)).toHaveAttribute(
      'data-mark',
      'mine',
      { timeout: 30_000 }
    );
    await expect(
      view.locator(`[data-node-id="${colleagueTask.taskDefinitionKey}"]`)
    ).toHaveAttribute('data-mark', 'claimed');
    await expect(
      view.locator(`[data-node-id="${mineTask.taskDefinitionKey}"] .pb-swim-inprogress`)
    ).toHaveText('jouw taak');
    await expect(
      view.locator(`[data-node-id="${colleagueTask.taskDefinitionKey}"] .pb-swim-inprogress`)
    ).toHaveText('geclaimd');
    await expect(view.locator('[data-legend="mine"]')).toBeVisible();
    await expect(view.locator('[data-legend="claimed"]')).toBeVisible();
    await expect(view.locator('.pb-swim-lane-label.cwp-mine')).toHaveCount(1);
    await expect(
      view.locator('[data-gateway="split"], [data-gateway="join"]').first()
    ).toBeVisible();
    await assertProcessViewRules(view);
  });
});
```

Move the two new imports to the top of the file with the others. If the open-task rows in `ProjectDetail` have a different class than `.v2-taken-item, .pb-open-task` (confirmed in Step 2), use that class here too. If the board shows the project under a different label than `projectName`, use the label confirmed in Step 1.

- [ ] **Step 5: Changelog.** Add an entry at the top of the versions list in `pages/changelog-data.ts`, following the newest existing entry's shape exactly (version string, `status`, `scope: ['frontend']`, sections). Content (Dutch, as the existing entries):
  - "Procesweergave: één gedeelde weergave voor Caseworker en Infra-board"
  - "Infra-board toont nu een legenda, 'jouw rol', 'jouw taak' en 'geclaimd' bij taken van collega's"
  - "Splitsingen en samenkomsten tonen als balk, beslissingen als ruit; geen technische namen meer"
  - "Lege rollen nemen minder ruimte in"
  - "Procesgegevens is standaard ingeklapt"
    Use the version label the user gives at release time; if the file requires one now, ask the user which.

- [ ] **Step 6: PR 2 checks (yours)**

Run: `npm test --workspace=@ronl/frontend`, type-check, lint → clean; frontend production build → succeeds; repo root `npm run lint:css:summary` → hex ≤ 369; `npm run check-format` → passes; `npx playwright test --config=e2e/playwright.config.ts --list --grep ProcessView` (from `packages/frontend`) → lists four tests.

- [ ] **Step 7: Hand off and STOP.** Report what is staged and ask the user for:

1. a browser look (hard refresh): the Infra-board on a live project and on a mock one (legend, tabs, bars and diamonds, slim lanes, labels inside their boxes, Procesgegevens folded); the Caseworker overlay (gateway shapes) and its step list (no `Gateway_…`);
2. `npm test` from the repo root;
3. the ACC e2e run including `process-view.spec.ts` (test 2 creates and deletes its own R2.4 instance).

Wait for "green".

- [ ] **Step 8: After explicit approval — commit, push, PR.** No attribution lines.

```bash
git commit -m "feat(process): move the Infra-board onto ProcessView; gateway shapes, folded Procesgegevens"
git push -u origin feat/process-view-infra
gh pr create --base acc --head feat/process-view-infra --title "feat(process): Infra-board on ProcessView (PR 2 of 2)" --body-file <body>
```

The PR body lists the visible changes per dashboard (the spec's table), the guard, the e2e tests, and that merging redeploys the frontend on ACC.

---

## Self-Review

**Spec coverage:** ProcessView (T5) · useViewer (T3) · processMarks: marks, gateway kinds, legend (T2, T8) · status.ts move (T1) · PhaseSwimlane internal, roomy, slim lanes, id labels, tabs, docs footer (T4, T9) · edge labels shortened everywhere (T9) · gateway shapes and legend entries (T8) · CSS merge, no `cwp-swim` (T9) · test hooks (T4, T8) · overlay on ProcessView (T6) · Infra-board on ProcessView (T9) · guard (T10) · Procesgegevens disclosure (T11) · step-list gateways (T12) · e2e test 1 Caseworker (T7) and Infra-board (T13), test 2 (T13) · changelog (T13) · two PRs with checkpoints (T7, T13). Out-of-scope items untouched.

**Deviation from the spec, to confirm with the user:** the spec's `focusNodeId` only scrolls; this plan also outlines the focus node (`pv-focus`) unless it is the viewer's own task, so the overlay still shows which node an unassigned or colleague-held task is on (Review Focus 2).

**Type consistency:** `NodeMark`, `GatewayKind`, `Viewer`, `ProcessTask`, `LegendKey`, `LegendEntry` defined in T2 and used unchanged in T3–T13; `PhaseSwimlane` props `marks`/`myLanes`/`focusNodeId`/`onOpenCall` from T4 to the final form in T9; `ProcessView` props defined in T5 and used in T6 and T9; `assertProcessViewRules` defined in T7, used in T13.
