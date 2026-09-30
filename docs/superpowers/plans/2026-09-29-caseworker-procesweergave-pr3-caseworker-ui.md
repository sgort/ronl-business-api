# Caseworker procesweergave — PR 3: the caseworker UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (the user chose native execution) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Caseworker Dashboard V2 Taken inbox shows, for a task whose process has lanes:

- an Awb-fase hint in the list;
- a "Waar sta ik" stepper;
- "Processtappen per rol" instead of the flat step list;
- an on-demand swimlane overlay, with a ⌘K entry to open it.

Tasks without lanes render exactly as today.

**Architecture:** One pure derivation module, `laneSteps.ts`, turns the PR 2 `ProcessContext` into lane groups, transitions and "Hierna" steps. It carries all the rules, so the components stay thin. Three components (`ProcessWhere`, `LaneSteps`, `ProcessOverlay`) render from it and from the shared `PhaseStepper` / `PhaseSwimlane`. `TakenInbox` calls `useTaskProcessContext` and switches between the new views and today's flat list. A small palette-action context lets `TakenInbox` register the ⌘K entry with the shell's `CommandPalette`.

**Spec:**

- `caseworker-procesweergave-handoff/CLAUDE-CODE-PROMPT.md` §4–§7, the constraints and the definition of done;
- `caseworker-procesweergave-handoff/README.md` §A–§D and "Interactions & behaviour";
- `design/screenshots/01–11`;
- `reference/mock-proces.reference.jsx` (`cwpTrail`, `CWPWhere`, `CWLaneSteps`, `CWProcesOverlay`) and `reference/mock-proces.css`.

PR 1 is #276 and PR 2 is #278.

## Decisions carried

- **Business defaults:**
  - collapse to the **2** groups before the current one;
  - "Hierna" **stops at the first gateway** and lists its branch labels;
  - lanes without candidateGroups show **the chip only**.
- "Jouw rol" means `lane.candidateGroups ∩ user.roles` is non-empty. The task list already filters by roles, because BPMN candidate groups map 1:1 onto realm roles (`task.routes.ts`).
- Awb codes: `1, 2, 3, 4+5, 6, 7, 8, archivering`. The dot text is the phase's position number; the code text is `Fase <code>` (`Archiefwet` for archivering).
- Nothing is deployed to the ACC engine before the local stack (localhost:8081) is validated. Live ACC models carry no markers yet, so "Waar sta ik" stays hidden there by design.

## Global Constraints

- **Dutch UI, English code and comments.** This copy is exact: Waar sta ik, Bekijk proces, Processtappen, jouw rol, jouw taak, Hierna, splitst, deelproces, hoofdproces, overgedragen, eerdere stappen tonen, beslistermijn. The rest comes from README §B–§D.
- **CSS:**
  - Reuse `.v2-*` and `.pb-*`. The only new classes are `.cwp-*`, from `reference/mock-proces.css`.
  - No new tokens except the lane colours: Aanvrager `#7a5af0`, Behandelaar `#0046ad`, Systeem `#6b7280`, plus a neutral fallback.
  - **Never run prettier on CSS.** Keep the one-line rule style, and run prettier only on ts/tsx/md paths.
  - Put `.pbd` on the process-view wrappers only (`cwp-where`, the overlay panel), never on the dashboard root. `dashboard-infra.css` has global `.pbd …` rules.
- **Layout:** don't widen the detail pane and don't add a column. Everything fits `200px 320px 1fr` at 1440px.
- **WCAG 2.1 AA:**
  - Every state is carried by text as well as colour.
  - Stepper dots are buttons named `Fase 4+5 · Behandeling en besluit`.
  - The overlay is a modal dialog with a focus trap and Esc/backdrop close, and returns focus to its trigger.
- **Fallback:** no lanes, or a failed context, gives today's flat list, with no "Waar sta ik" and no "Bekijk proces".
- **No derivation from task names.** Don't hard-code a lane → group mapping, and don't hand-write col/row.
- **Process:** frontend change, so `npm test` **and** the ACC e2e run are required before commit (multi-line command, see memory). Ask the user to look at it in the browser; don't self-drive a browser. Never run dev servers, bypass hooks or merge without approval.

## Review Focus

1. **A task whose context is still loading or failed.** Today's flat list and its "Laden…" / "Processtappen konden niet worden geladen." states show, never a half-built lane view and never the previous task's steps. Pinned in Task 6.
2. **A group hidden by the collapse that contains the current step.** It never happens: collapse only hides groups _before_ the current one. Pinned in Task 2.
3. **"Hierna" at the end of a subprocess.** The walk continues in the parent after the call activity, and stops at the parent's end with fewer than 3 steps and no error. Pinned in Task 2.
4. **A gateway whose next history entry is in another process** (a child ran in between). The outcome comes from the next entry **in the same process**. Pinned in Task 2.
5. **Keyboard only.** Every control is reachable by keyboard: stepper dots, "Bekijk proces", the expand button, the overlay (focus trapped, Esc closes, focus returns to the trigger) and `open ↘`. Pinned in Tasks 3–5.

---

## File structure

| File                                                           | Responsibility                                                                                             |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `components/process/laneSteps.ts` (+ test)                     | pure: trail with outcomes, "Hierna", lane groups, transitions, collapse bounds, my-lane keys, lane colours |
| `components/process/ProcessWhere.tsx` (+ test)                 | §B "Waar sta ik"                                                                                           |
| `components/process/LaneSteps.tsx` (+ test)                    | §C Processtappen per rol                                                                                   |
| `components/process/ProcessOverlay.tsx` (+ test)               | §D overlay dialog                                                                                          |
| `components/process/caseworker-process.css`                    | the `.cwp-*` rules from `mock-proces.css`, section by section, plus the stepper variants                   |
| `components/CaseworkerDashboardV2/PaletteActions.tsx` (+ test) | context: register and unregister dynamic palette actions                                                   |
| `components/CaseworkerDashboardV2/CommandPalette.tsx`          | list registered actions above sections                                                                     |
| `pages/CaseworkerDashboardV2.tsx`                              | provide the context                                                                                        |
| `components/CaseworkerDashboardV2/TakenInbox.tsx` (+ test)     | wire it all in; the list hint; the fallback                                                                |

---

### Task 1: Lane colours and "jouw rol"

**Produces** (`laneSteps.ts`):

```ts
export const LANE_COLOURS: Record<string, { short: string; colour: string }> = {
  Lane_Aanvrager: { short: 'AANV', colour: '#7a5af0' },
  Lane_Behandelaar: { short: 'BEH', colour: '#0046ad' },
  Lane_Systeem: { short: 'SYS', colour: '#6b7280' },
};
export function laneMeta(lane: SwimLane): { short: string; colour: string };
// unknown key → { short: first 4 letters of label, upper-cased, colour: '#8a94a6' }
export function myLaneKeys(model: PhaseSwimlaneModel, roles: readonly string[]): Set<string>;
```

- [ ] Tests: the known keys; the fallback for an unknown lane; `myLaneKeys` for `caseworker` against a lane with `candidateGroups: ['caseworker']`; no candidateGroups → never mine; no roles → empty. Red, then implement, then green.

### Task 2: The trail, "Hierna", groups and transitions (pure)

**Produces:**

```ts
export type StepState = 'done' | 'running' | 'next';
export interface TrailStep {
  processKey: string;
  nodeId: string;
  label: string;
  kind: NodeKind;
  laneKey: string;
  state: StepState;
  start?: string;
  end?: string | null;
  outcome?: string; // gateway, taken edge label
  branches?: string[]; // "Hierna" gateway, its branch labels
  dmn?: string;
  doc?: string;
  isMine: boolean; // the task's own running node
}
export interface LaneGroup {
  processKey: string;
  laneKey: string;
  steps: TrailStep[];
  future: boolean;
  sub: boolean;
}
export function buildTrail(ctx: ProcessContext): TrailStep[];
export function groupByLane(trail: TrailStep[], ctx: ProcessContext): LaneGroup[];
export function currentGroupIndex(groups: LaneGroup[]): number;
export function collapseFrom(groups: LaneGroup[], expanded: boolean, keep = 2): number;
export function transitionLabel(prev: LaneGroup, g: LaneGroup, ctx: ProcessContext): string;
export const KIND_TAG: Record<string, string>; // task GEBRUIKERSTAAK, script SCRIPT, rule BESLISSING, gateway KEUZE, parallel KEUZE, call CALLACTIVITY, service SERVICETAAK
```

Rules, ported from `cwpTrail` / `CWLaneSteps` and taken from real models, not the mock:

- **The trail** is `ctx.history` in order, minus start/end events and minus entries whose node is not in their process's model. Each entry is mapped to its model node (lane = `model.lanes[node.row].key`).
  - A **gateway's outcome** is the edge label from the gateway to the _next history entry of the same process_.
  - A step is **running** while it has no `endTime` and isn't canceled; otherwise it is done.
  - `isMine` means running, in `ctx.current.processKey`, on `ctx.current.nodeId`.
  - `doc` is `node.docs?.[0]`.
- **"Hierna"** starts at `current`. Follow the first forward (non-`back`) outgoing edge, for at most 3 steps. When it reaches a gateway, push it with `branches` (labels of its outgoing edges, unlabelled ones as `'—'`) and stop.
  - When it reaches an `end` in a called process, continue in the parent after the calling node (`ctx.chain` gives the parent key and `calledFrom`). At the parent's `end`, stop.
  - A guard stops it after 12 hops.
- **Groups:** consecutive steps with the same `(processKey, laneKey)`. A change of process always starts a new group.
  - `future` means every step is `next`.
  - `sub` means the process is not the top of `ctx.chain`.
- **`currentGroupIndex`** is the group holding the `isMine` step. When none does, it is the last group holding any running step, else the last group.
- **`collapseFrom`** is `expanded ? 0 : max(0, current − keep)`.
- **Transitions:**
  - into a called process: `↘ deelproces <model.processName ?? key>`;
  - back to the top: `↗ terug in hoofdproces · <lane label>`;
  - same process, into the first future group: `↓ daarna: <lane label>`;
  - otherwise: `↓ <lane label>`.

- [ ] Tests (hand-written models shaped like the parsed kapvergunning shell and sub, including the prototype's timelines from `mock-proces.reference.jsx`):
  - screenshot 03: a task in the sub, with the DMNs in Systeem, a handover to Behandelaar, the task running, then Hierna stopping at `Vergunning verleend?` with `verleend / geweigerd`;
  - screenshot 06: a Fase-6 task, the sub closed on `verleend`, `↗ terug in hoofdproces · Behandelaar`, next `Betaling vereist?`;
  - screenshot 07: `Aanvraag volledig? → nee`, then "Aanvullende gegevens opvragen";
  - Review Focus 2: collapse never hides the current group, and `collapseFrom` gives 0 when current < keep;
  - Review Focus 3: Hierna continues after the call activity, and stops cleanly at the parent's end;
  - Review Focus 4: the outcome is taken across an interleaved child;
  - `↓ daarna:` only on the first future group;
  - a node missing from its model is skipped, not thrown on.

### Task 3: `ProcessWhere` ("Waar sta ik", §B)

**Props:** `{ ctx: ProcessContext; deadline?: string | null; onOpen: (phase: AwbPhaseCode) => void }`. It renders nothing when `ctx.awbPhase` is null.

- Wrapper `div.cwp-where.pbd`.
- Head: the eyebrow `Waar sta ik · Awb-fase N van 8` and a `Bekijk proces →` button.
- `PhaseStepper variant="compact"` over `AWB_PHASES`, with `stepClass` done/active/'' relative to the current phase, `stepTitle` = `Fase ${code} · ${name}`, `codeLabel` = `Fase ${code}` (`Archiefwet` for archivering), and `onSelect` = `onOpen`.
- Caption: `<b>Fase X · Name</b>`, plus ` · in deelproces <i>{processName}</i>` when `current.processKey` isn't the top of the chain, plus ` · beslistermijn tot {d MMM}` when `deadline` is set.
- CSS: port `.cwp-where*`, `.cwp-eyebrow`, `.cwp-link` and the stepper-variant rules (mock-proces.css lines 1–23), scoped as there (`.cwd-v2 …` / `.pbd …`).
- [ ] Tests:
  - nothing without a phase;
  - "4 van 8" for 4+5;
  - the dots done/active/todo;
  - the accessible names;
  - the caption with and without the subprocess, and with and without the deadline;
  - a dot click and the button call `onOpen`.

### Task 4: `LaneSteps` (Processtappen per rol, §C)

**Props:** `{ ctx: ProcessContext; roles: readonly string[]; onOpen: (phase?: AwbPhaseCode) => void }`. `expanded` is internal state, reset on the task change (`key` by the task id from the parent).

- Render exactly as `CWLaneSteps`:
  - the `▸ N eerdere stappen tonen` button;
  - the handover lines;
  - `section.cwp-lg` with `--lane` from `laneMeta`, `mine` / `current` / `future` / `sub`;
  - the head: chip, name, `deelproces {calling node's awbPhase}` for `sub`, and `jouw rol`;
  - rows `li.cwp-st`;
  - the meta texts `16 jul, 10:12 · Afgerond`, `Jouw taak — loopt nog`, `Deelproces loopt`, `Loopt nog`, `Hierna`, `Hierna · splitst: a / b`;
  - `DMN key` / the doc in `.cwp-doc`;
  - the `KIND_TAG`;
  - the footer `Hele proces als swimlane bekijken →`.
- Dates: `toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })`.
- CSS: port the `(1)` section of mock-proces.css.
- [ ] Tests:
  - collapsed by default, with the right count, and expanding shows all;
  - it collapses again when re-keyed;
  - a `jouw rol` group for a caseworker, none without the role;
  - the transitions texts;
  - a gateway `label → outcome`;
  - the Hierna meta;
  - state text is present for every state (text as well as colour).

### Task 5: `ProcessOverlay` (§D)

**Props:** `{ task: Task; ctx: ProcessContext; roles: readonly string[]; initialPhase?: AwbPhaseCode; dossierRef?: string; onClose: () => void }`.

- `div.cwp-overlay` with `role="dialog"`, `aria-modal="true"` and `aria-labelledby` pointing at the h2. The backdrop click closes it.
- Inside, `div.cwp-ov-panel.pbd` stops propagation.
- Head: the eyebrow `{dossierRef ?? task.id} · {processKey upper}`, the h2 task name, and a ghost button `Sluiten <kbd>Esc</kbd>`.
- Body:
  - `PhaseStepper variant="full"`;
  - `.pb-phase-titlebar` with `.cwp-crumbs`: `Hoofdproces › Deelproces fase {phase}`, only when the chain or model has a called process;
  - the process name + `rcode` key, and the meta `Processtappen & rollen — procesmodel (live)`;
  - `.cwp-legend`: Afgerond · Loopt · Jouw taak · Jouw rol ({roles that match}) · Automatisch (script / DMN) · Nog niet / niet doorlopen;
  - `PhaseSwimlane` with:
    - `model = ctx.models[proc]` (**a stable reference**, since the scroll effect keys on it);
    - `statusById = ctx.statusByProcess[proc] ?? {}`;
    - `claimedNodeIds` = the current node when `proc` is the task's process;
    - `claimedLabel="jouw taak"`;
    - `myLaneKeys`;
    - `onOpenCall = (n) => n.calls && ctx.models[n.calls] && setProc(n.calls)`;
    - `scrollToNodeId` = the current node when on its process and phase, else the first node of the selected phase (`nodes.find(n => n.awbPhase === sel)`).
- **Phase select:** 4+5 switches to the called process when the model has a `call` node with `awbPhase` `4+5` and a loaded target; any other phase switches to the top process.
- **Focus:**
  - on open, focus the close button;
  - trap Tab/Shift+Tab inside the panel;
  - Esc closes;
  - on unmount, return focus to `document.activeElement` as it was at open.
- CSS: port the `(4)` section and the legend/crumbs rules.
- [ ] Tests:
  - the role, name and modal attributes;
  - Esc and a backdrop click close it, a panel click doesn't;
  - focus starts on close, Tab wraps both ways, and focus returns to the trigger;
  - the crumb switches the model;
  - `open ↘` switches;
  - phase 4+5 switches to the sub and 6 back to the top;
  - the legend's text is present;
  - `claimedLabel` shows on the current node only on its own process.

### Task 6: `TakenInbox` integration, list hint and fallback (§A, §7)

- `const proc = useTaskProcessContext(selected)`. The existing `activity` fetch and flat list stay as the fallback.
- **Detail pane:**
  - `ProcessWhere` goes under `<header>`, when `proc.data?.hasLanes && proc.data.awbPhase`.
  - "Processtappen" section:
    - `proc.data?.hasLanes` → `<LaneSteps key={selected.id} …/>`;
    - while `proc.loading` → the existing `Laden…`;
    - otherwise → today's flat list, unchanged.
- **Overlay state** is `overlayPhase: AwbPhaseCode | 'open' | null`, reset on task select.
- **Deadline:** `taskVariables?.awbDeadlineDate`, if a string.
- **List hint (§A):** per distinct `processDefinitionKey` in `visible`, fetch the model once. Use `businessApi.process.swimlane`, kept in a `Map` state and optional (failures ignored). Show `<span className="v2-taken-item-rip">Awb-fase {awbPhase}</span>` when that model has lanes and the task's `taskDefinitionKey` node has an `awbPhase`. CSS per README §A: mono 10.5px, `--v2-ink-3`, `margin-left: 8px`.
- **Roles** come from `user?.roles ?? []`.
- [ ] Tests (`TakenInbox.test.tsx`, mocking `businessApi.process.lineage/activityHistory/swimlane`):
  - a laned task shows Waar sta ik, the lane steps and the hint;
  - a task without lanes shows today's flat list and no Waar sta ik or Bekijk proces;
  - a failed context falls back;
  - while loading, `Laden…` shows;
  - "Bekijk proces" opens the overlay, and Esc closes it and returns focus;
  - on task change, the overlay closes and the collapse resets.

### Task 7: ⌘K entry "Proces van deze taak bekijken"

- `PaletteActions.tsx` provides `{ actions, register(action) → unregister }`, with `action = { id, label, hint?, run }`.
- `CaseworkerDashboardV2` wraps its tree in the provider.
- `CommandPalette` lists the actions first (filtered by the query), and running one closes the palette.
- `TakenInbox` registers `{ id: 'cwp-open-process', label: 'Proces van deze taak bekijken', run: () => setOverlayPhase('open') }` while the selected task's context `hasLanes`, and unregisters otherwise and on unmount.
- [ ] Tests:
  - the provider's register/unregister;
  - the palette shows and runs an action, and it's absent without one;
  - TakenInbox registers only for a laned task.

### Task 8: Verification and hand-off

- [ ] Root `npm test`, type-check and lint; prettier **on ts/tsx/md paths only**. Check the frontend coverage floor holds (per-file 80% branches).
- [ ] Check contrast for every new text/background pair (white on `#0046ad`, `#7a5af0`, `#6b7280`, the accent; `--v2-ink-3` on the paper) and record the ratios in the PR.
- [ ] Final whole-branch review by a fresh reviewer, with this Review Focus.
- [ ] Hand-off:
  - `npm test`;
  - the ACC e2e command (multi-line form);
  - the user checks in the browser against screenshots 01–11 on the local stack (localhost:8081 has the markers).

  Commit after their green.
