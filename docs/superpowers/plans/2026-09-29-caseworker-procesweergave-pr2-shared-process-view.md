# Caseworker procesweergave — PR 2: shared process components and cross-instance history

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** For a selected caseworker task, the frontend can load everything the procesweergave draws: the swimlane model of every process in the call chain, the merged activity history across a call activity, a status per node for each process, and the task's own Awb phase. The swimlane and stepper become shared components that both dashboards use.

**Architecture:** The backend adds three fields to each activity-history entry (its process definition and, for a call activity, the child instance it started), plus one small lineage route that exposes the super instance. The frontend moves `PhaseSwimlane` and the `.pb-stepper` markup (with their CSS) to `components/process/`, extends `PhaseSwimlane` with optional props, and adds a pure `buildProcessContext` and a hook, `useTaskProcessContext(task)`, that assemble models, history and status. No caseworker UI changes yet; that is PR 3.

**Tech Stack:** Express + Jest (backend), React + Vitest + Testing Library (frontend), `@ronl/shared`.

**Spec:** `caseworker-procesweergave-handoff/CLAUDE-CODE-PROMPT.md` §1, §3 and the `PhaseSwimlane` props of §6; `caseworker-procesweergave-handoff/README.md` §D. PR 1 (#276): `docs/superpowers/plans/2026-09-29-caseworker-procesweergave-pr1-swimlane-model.md`.

## Decisions carried from PR 1

- Models come from `GET /v1/process/definition/key/{key}/swimlane`, resolved by key under the caller's tenant, like the Infra-board. The newest version is drawn.
- Awb codes: `1, 2, 3, 4+5, 6, 7, 8, archivering` (`AWB_PHASES` in `@ronl/shared`).
- Execution: native, a feature branch in the main checkout, and a commit only after the user's green and approval.

## Global Constraints

- The Infra-board stays **pixel-identical**. `PhaseSwimlane.test.tsx` and `ProjectDetail.test.tsx` must stay green. Move CSS selectors verbatim, keeping their `.pbd` scope.
- Caseworker code must not import from `InfraBoardDashboard/`. Shared pieces live in `components/process/`.
- Don't fork `PhaseSwimlane`. Every new prop is optional and defaults off.
- Tenant checks on the new route use `caseReadAllowed` + `denyTenant` with the instance's historic `municipality`, exactly as `/:id/activity-history` does. A called subprocess inherits `municipality` through `camunda:in variables="all"`.
- English code and comments. The only Dutch copy in this PR is `JOUW ROL`, `JOUW TAAK`, `open ↘`, `SCRIPT` and `DMN`.
- New CSS classes are `.cwp-*` only, taken from `reference/mock-proces.css`.
- A frontend change requires the ACC e2e run as well as `npm test` before any commit (see memory `frontend-changes-need-e2e`).
- Never run dev servers, never bypass hooks, and never merge without approval.

## Review Focus

1. **A task in the child whose parent has already ended, or whose super lookup is refused (403) or fails.** The context still renders the child alone; nothing throws. Pinned in Task 6.
2. **A task in the parent after the child ended:** the child's history is fetched through the call activity's `calledProcessInstanceId` and shown as done. Pinned in Task 6.
3. **The same subprocess called twice** (a rework loop around a call activity): both children's histories merge in engine order, and the later run wins the status. Pinned in Task 6.
4. **A model fetch that fails for one process in the chain:** that process is left out of `models`, with no error for the whole context. `hasLanes` reflects only the task's own process. Pinned in Task 6.
5. **The Infra-board rendered with no new props:** its DOM is identical to today, with no JOUW badges, no `open ↘` and no scroll side effect. Pinned in Task 4.

---

## File structure

| File                                                                         | Change        | Responsibility                                                                                                         |
| ---------------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `packages/shared/src/types/operaton.types.ts`                                | modify        | `ActivityHistoryItem` + `processDefinitionKey`, `processDefinitionId`, `calledProcessInstanceId`; new `ProcessLineage` |
| `packages/backend/src/services/operaton.service.ts`                          | modify        | map the three fields; `getProcessLineage(id)`                                                                          |
| `packages/backend/src/routes/process.routes.ts`                              | modify        | `GET /v1/process/:id/lineage`                                                                                          |
| `packages/backend/openapi/openapi.yaml`                                      | modify        | `ActivityHistoryEntry` fields; lineage operation                                                                       |
| backend tests                                                                | modify        | service + route + conformance                                                                                          |
| `packages/frontend/src/components/process/PhaseSwimlane.tsx` (+ `.test.tsx`) | move + modify | from `InfraBoardDashboard/`; new optional props and kinds                                                              |
| `packages/frontend/src/components/process/PhaseStepper.tsx` (+ `.test.tsx`)  | create        | the `.pb-stepper` markup, extracted from `ProjectDetail.tsx`                                                           |
| `packages/frontend/src/components/process/process-view.css`                  | create        | stepper, titlebar and swimlane rules moved from `dashboard-infra.css`, plus the `.cwp-*` swimlane additions            |
| `packages/frontend/src/components/InfraBoardDashboard/ProjectDetail.tsx`     | modify        | import from `components/process/`                                                                                      |
| `packages/frontend/src/pages/infra-board/dashboard-infra.css`                | modify        | the moved rules removed                                                                                                |
| `packages/frontend/src/services/api.ts` (+ test)                             | modify        | `process.swimlane(key)`, `process.lineage(id)`                                                                         |
| `packages/frontend/src/components/process/processContext.ts` (+ test)        | create        | pure `buildProcessContext`                                                                                             |
| `packages/frontend/src/components/process/useTaskProcessContext.ts` (+ test) | create        | the hook that fetches and calls `buildProcessContext`                                                                  |

---

### Task 1: Activity history carries its process and the child it called

**Interfaces — Produces:** `ActivityHistoryItem` gains `processDefinitionKey: string | null`, `processDefinitionId: string | null` and `calledProcessInstanceId: string | null`. Operaton's `/history/activity-instance` already returns these fields; `getActivityHistory` currently drops them.

- [ ] **Step 1 (test):** in `operaton.service.test.ts`, extend the existing `getActivityHistory` test's Operaton rows with `processDefinitionKey: 'AwbShellProcess'`, `processDefinitionId: 'AwbShellProcess:4:abc'` and `calledProcessInstanceId: 'child-1'` on a `callActivity` row, and assert they come through. Add a row without them and assert each is `null`, not `undefined`.
- [ ] **Step 2:** run `npx jest --config packages/backend/jest.config.js packages/backend/src/services/operaton.service --coverage=false`. Expected: FAIL.
- [ ] **Step 3 (impl):** add the three fields to the shared type, each with a doc comment. In `getActivityHistory`, add them to the row type and map each with `?? null`.
- [ ] **Step 4:** in `openapi.yaml`, add the three properties to `components/schemas/ActivityHistoryEntry` as `type: [string, 'null']`, **not** required, so older cached shapes still conform. Rebuild shared (`npm run build --workspace=@ronl/shared`), then run the service, `process.routes` and `openapi` tests plus `npm run lint:openapi --workspace=@ronl/backend`. Expected: PASS.

### Task 2: `GET /v1/process/:id/lineage`

**Interfaces — Produces:**

```ts
export interface ProcessLineage {
  processInstanceId: string;
  processDefinitionKey: string;
  processDefinitionId: string;
  /** The instance that called this one through a call activity; null at the top. */
  superProcessInstanceId: string | null;
}
```

The service method is `getProcessLineage(id): Promise<ProcessLineage>`, reading Operaton `GET /history/process-instance/{id}`. The history endpoint, unlike runtime `/process-instance/{id}`, carries `superProcessInstanceId` and works for ended instances too.

- [ ] **Step 1 (tests):**
  - Service: maps the history row, and `superProcessInstanceId` defaults to `null`.
  - Route:
    - 200 for the owning tenant, with conformance;
    - 403 `TENANT_MISMATCH` when `getHistoricVariables` returns another municipality, and `getProcessLineage` is not called;
    - 404 `PROCESS_NOT_FOUND` on an axios 404;
    - 500 `PROCESS_LINEAGE_FAILED` otherwise, including a non-Error rejection;
    - 401 in the no-user table.
- [ ] **Step 2:** run them and see them fail.
- [ ] **Step 3 (impl):** place the route next to `/:id/activity-history` and copy its tenant check verbatim: `getHistoricVariables` → `caseReadAllowed(req.user, vars.municipality, vars['applicantId'])` → `denyTenant`. Document it in `openapi.yaml`, reusing `ProcessInstanceId`, `Unauthorized`, `TenantMismatch` and `Error`, with a `ProcessLineage` schema.
- [ ] **Step 4:** run service + route + openapi tests and `lint:openapi`. Expected: PASS. Then run the backend suite.

### Task 3: Move `PhaseSwimlane`, extract `PhaseStepper`, move their CSS

**Interfaces — Produces:**

```ts
// components/process/PhaseStepper.tsx
export interface StepperPhase {
  code: string;
  name: string;
  codeLabel?: string;
}
export default function PhaseStepper(props: {
  phases: StepperPhase[];
  stepClass: (code: string) => string; // e.g. 'done', 'active', 'risk', ''
  selected?: string | null;
  onSelect?: (code: string) => void;
  variant?: 'default' | 'compact' | 'full'; // default = Infra-board
  stepTitle?: (p: StepperPhase) => string; // tooltip + accessible name
}): JSX.Element;
```

The markup is exactly today's in `ProjectDetail.tsx` (`.pb-stepper > button.pb-step.{class}[.selected] > .pb-step-dot + .pb-step-name > .pb-step-code`). The dot shows `✓` when the class includes `done`, and `index + 1` otherwise. `codeLabel ?? code` fills `.pb-step-code`. `variant` adds `cwp-stepper-compact` / `cwp-stepper-full` to the root and `gridTemplateColumns: repeat(n, minmax(0,1fr))`. It adds neither for `default`, so the Infra-board keeps its CSS grid. `aria-label` = `stepTitle?.(p)` when given.

- [ ] **Step 1:** `git mv` `InfraBoardDashboard/PhaseSwimlane.tsx` and `PhaseSwimlane.test.tsx` to `components/process/`. Fix the imports: `STATUS`/`StatusKey` still come from `pages/infra-board/rip-model`, so re-export nothing and keep that import. Update `ProjectDetail.tsx`.
- [ ] **Step 2 (tests):** `PhaseStepper.test.tsx`:
  - renders one button per phase with the right classes and dot text;
  - `onSelect` fires with the code;
  - `selected` adds `.selected`;
  - `compact` adds the class and the inline grid;
  - `default` adds neither;
  - `stepTitle` sets `aria-label` and `title`.
    Run them and see them fail.
- [ ] **Step 3 (impl):** write `PhaseStepper`, and replace the stepper block in `ProjectDetail.tsx` with `<PhaseStepper phases={RIP_PHASES} stepClass={stepClass} selected={selPhase} onSelect={setSelPhase} />`.
- [ ] **Step 4 (CSS):** cut these blocks from `dashboard-infra.css` into `components/process/process-view.css`, unchanged:
  - the "Phase stepper" rules, including "stepper extra states";
  - the `.pb-phase-titlebar` / `.pb-phase-empty` rules;
  - the `.pb-swim*` rules;
  - the `.pbd` token block. **Copy** this one rather than cut it: `dashboard-infra.css` keeps its own too.

  Import `./process-view.css` from `PhaseSwimlane.tsx` and `PhaseStepper.tsx`. Diff the selector list before and after (`grep -o '^\.pbd[^{]*' | sort`) to prove nothing was lost or changed.

- [ ] **Step 5:** run `npm test --workspace=@ronl/frontend -- PhaseSwimlane PhaseStepper ProjectDetail`, plus type-check and lint. Expected: PASS. Then **ask the user to look at the Infra-board project page**, both stepper and swimlane, and confirm it is unchanged.

### Task 4: `PhaseSwimlane` — new kinds and optional caseworker props

**Interfaces — Produces:** new optional props on `PhaseSwimlane`:

- `myLaneKeys?: ReadonlySet<string>`: tints those lanes (`.cwp-mylane` on label and band) and shows a `JOUW ROL` badge in the lane label.
- `claimedLabel?: string`: when set, a claimed node gets that label as a tab (`.cwp-mytask-tab`, e.g. `JOUW TAAK`) and the outline class `.cwp-mytask`, instead of the ✏ glyph.
- `onOpenCall?: (node: SwimNode) => void`: a `call` node gets `<button class="cwp-callbtn" aria-label="Deelproces {label} openen">open ↘</button>`.
- `scrollToNodeId?: string | null`: after mount, and whenever the value changes, set `.pb-swim-scroll`'s `scrollLeft` so that node's centre sits mid-viewport. Clamp at 0.

For kinds: `script` → `.cwp-kind` foot badge `SCRIPT`; `rule` → `DMN` (plus `n.dmn` in `title`); `call` gets the `call` class, which the CSS draws with a double inner border. `script` and `rule` nodes are dashed, like `service`. Every task label gets `title={n.label}` (labels clamp to 3 lines).

- [ ] **Step 1 (tests):** in `PhaseSwimlane.test.tsx`:
  - an Infra-board render with none of the new props has no `.cwp-*` element and no `button` (Review Focus 5);
  - `myLaneKeys` tints and badges exactly those lanes;
  - `claimedLabel` shows the tab and hides ✏;
  - `onOpenCall` fires with the node;
  - a `script`/`rule` node shows its badge;
  - `scrollToNodeId` sets `scrollLeft`. Stub `clientWidth` on the scroll element; jsdom has no layout.
- [ ] **Step 2:** run them and see them fail.
- [ ] **Step 3 (impl + CSS):** implement. Append the swimlane `.cwp-*` rules from `reference/mock-proces.css` (lines 55–68: lane tint, badge, mytask outline/tab, kind badge, call border, callbtn, and label clamp) to `process-view.css`. **Do not** append the clamp rule on `.pbd .pb-swim-node .nlabel` unscoped: scope it `.cwp-swim .pb-swim-node .nlabel`. Add `cwp-swim` to the root only when any caseworker prop is given, so the Infra-board's labels don't start clamping.
- [ ] **Step 4:** run tests, type-check and lint. Expected: PASS.

### Task 5: API client — `swimlane(key)` and `lineage(id)`

- [ ] **Step 1 (tests, `api.test.ts`):** `businessApi.process.swimlane('AwbShellProcess')` GETs `/process/definition/key/AwbShellProcess/swimlane` (URL-encoded); `businessApi.process.lineage('pi-1')` GETs `/process/pi-1/lineage`. Follow the file's existing `phaseModel` test.
- [ ] **Step 2:** run them and see them fail. **Step 3:** implement next to `activityHistory`. **Step 4:** PASS.

### Task 6: `buildProcessContext` + `useTaskProcessContext`

**Interfaces — Produces:**

```ts
export interface ProcessContext {
  /** Swimlane model per process key in the chain (a key whose fetch failed is absent). */
  models: Record<string, PhaseSwimlaneModel>;
  /** All entries of every instance in the chain, ascending startTime. */
  history: ActivityHistoryItem[];
  /** nodeStatusFromHistory per process key, over that key's entries only. */
  statusByProcess: Record<string, Record<string, StatusKey>>;
  current: { processKey: string; nodeId: string };
  /** The task's own node's awbPhase, when the model has markers. */
  awbPhase: AwbPhaseCode | null;
  /** The chain, top-most first: [{ instanceId, processKey, calledFrom?: nodeId }]. */
  chain: Array<{ instanceId: string; processKey: string; calledFrom?: string }>;
  /** True when the task's own process model has lanes (else PR 3 falls back to the flat list). */
  hasLanes: boolean;
}

export function buildProcessContext(input: {
  task: { processInstanceId: string; taskDefinitionKey: string };
  lineages: ProcessLineage[]; // the task's instance first, then each super
  histories: Record<string, ActivityHistoryItem[]>; // by instance id
  models: Record<string, PhaseSwimlaneModel>; // by process key
}): ProcessContext;

export function useTaskProcessContext(
  task: { id: string; processInstanceId: string; taskDefinitionKey: string } | null
): { data: ProcessContext | null; loading: boolean; error: boolean };
```

**Fetch order in the hook:**

1. Call `lineage(task.processInstanceId)`, then walk `superProcessInstanceId` upwards (max depth 5). A failed or refused super lookup stops the walk.
2. Fetch `activityHistory` for every instance in the chain.
3. For each `callActivity` entry whose `calledProcessInstanceId` is not already in the chain (a finished child), fetch that child's history as well.
4. Fetch `swimlane(key)` once per distinct `processDefinitionKey`, keeping only the successful ones.
5. Pass it all to `buildProcessContext`.

The hook cancels on task change: check the task id on resolve, the pattern `useAsync` uses. `error` is true only when the task's **own** lineage or history fails.

- [ ] **Step 1 (tests, `processContext.test.ts`):** build inputs from small hand-written `ActivityHistoryItem` arrays over the PR 1 kapvergunning shape (a shell `S` calling sub `T` from `Task_Phase45_Process`):
  - a task in the child, with the parent running: `chain` = [S, T], `calledFrom` = `Task_Phase45_Process`, the history merged by startTime, `statusByProcess.S.Task_Phase45_Process` = `active`, and `awbPhase` = the model node's value;
  - a task in the parent after the child ended: the child's entries are included, and every `T` node is `done`;
  - the same sub called twice: both children are merged, and the later running entry wins;
  - the super lineage is missing: the child alone, with no throw;
  - the own model is missing: `hasLanes` false and `awbPhase` null;
  - a model without markers: `awbPhase` null.
- [ ] **Step 2:** run them and see them fail. **Step 3:** implement `buildProcessContext`, which is pure: it tags nothing (entries already carry `processDefinitionKey` from Task 1), sorts stably by `startTime` and groups by key for `nodeStatusFromHistory`.
- [ ] **Step 4 (hook tests, `useTaskProcessContext.test.ts`):** mock `businessApi.process`:
  - the happy path produces the context;
  - a super lookup rejected with 403 still yields data;
  - a failed own lineage gives `error`;
  - a task change mid-flight doesn't let stale data land.
- [ ] **Step 5:** implement the hook, and run all frontend tests, type-check and lint. Expected: PASS.

### Task 7: Verification and hand-off

- [ ] Run the root `npm test`, `npm run type-check` and `npm run lint`, and prettier on the changed files. **Never** run prettier on CSS: repo prettier covers ts/tsx/json/md only, and `process-view.css` keeps the one-line rule style.
- [ ] Final whole-branch review by a fresh reviewer, with this plan's Review Focus.
- [ ] Hand-off to the user:
  - `npm test`;
  - the ACC e2e command from memory `frontend-changes-need-e2e`;
  - a visual check of the Infra-board project page.

  Commit only after their green, in batches: backend (Tasks 1–2) and frontend (Tasks 3–6).
