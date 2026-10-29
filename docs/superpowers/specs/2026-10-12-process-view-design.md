# ProcessView: one BPMN rendering for every dashboard — design

Branch: `feat/process-view`
Date: 2026-10-12

## Problem

The Caseworker's process overlay draws BPMN processes with a set of visual
improvements: a legend, the viewer's own lane marked "JOUW ROL", a "JOUW
TAAK" tab, kind badges (`SCRIPT`, `DMN`), clamped labels and shortened edge
labels. The Infra-board draws the same kind of diagram without any of them:
labels overflow their boxes, unnamed gateways show their element id
(`Gateway_OnderzoekenSplit`), and every open task carries the same ✏ glyph
whoever holds it.

Both already use one component, `components/process/PhaseSwimlane.tsx`. The
improvements are opt-in props there (`myLaneKeys`, `claimedLabel`,
`onOpenCall`, `scrollToNodeId`, `density="roomy"`); any of them adds a
`cwp-swim` class that scopes the improved CSS. The legend is not in the
component at all but hand-written in `ProcessOverlay.tsx`. The Infra-board
passes none of the props, so it keeps the old look. The component also imports
its status table from `pages/infra-board/rip-model`.

Raised during design:

- A parallel split, a parallel join and a decision ("Akkoord?") are all drawn
  as the same diamond.
- The Caseworker's flat step list (`ProcessLaneSteps`, "Processtappen") shows
  the same raw gateway ids, as "Gateway_OnderzoekenSplit · KEUZE · splitst:
  – / –".
- The Infra-board's task panel shows the "Procesgegevens" table open; the
  Caseworker folds it behind a "Gegevens tonen ▼" disclosure, closed by
  default. Both use the same table (`ProcessVarsSection`); only the fold is
  Caseworker-only, hand-written in `TakenInbox.tsx`.

## Goal

One BPMN rendering that every dashboard uses by design:

- the improved look is the only look; a dashboard cannot get the old one;
- a dashboard passes data, not presentation choices; who is viewing is read
  automatically;
- a new dashboard adopts it without extra work, and cannot go around it;
- split, join and decision gateways are visually distinct, in the diagram and
  in the step list;
- "Procesgegevens" is folded by default on every dashboard.

## Decisions

Made with the user during design, 12 October 2026:

| Question              | Decision                                                                                                                                                                                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| What a dashboard gets | A drop-in **process view block**: title bar, stepper slot, legend and swimlane, improved look always on, plus a guard test. Not a self-loading view: data loading stays with each dashboard.                                                                 |
| Task marks            | **Mine / claimed / open**, from the task's assignee: assigned to the viewer → "JOUW TAAK"; to someone else → "GECLAIMD"; unassigned → running style only.                                                                                                    |
| Size                  | **Roomy everywhere, slim empty lanes.** One grid; lanes with no nodes in the process shrink to a slim row.                                                                                                                                                   |
| Architecture          | **Approach A**: one public `ProcessView` component with the viewer read from the token; `PhaseSwimlane` internal. Not "defaults in PhaseSwimlane" (B, leaves the viewer to each dashboard) nor a dashboard shell (C, touches every header for no gain here). |
| Gateways              | **Bars for parallel**: decisions stay a diamond, parallel split/join become a vertical bar, an exclusive merge a small dot.                                                                                                                                  |
| Step list             | **Included**: `ProcessLaneSteps` uses the same label rule and gateway kinds, in PR 2.                                                                                                                                                                        |
| Procesgegevens        | **Included**: one shared disclosure, closed by default, used by both task panels, in PR 2.                                                                                                                                                                   |

## Components

All under `packages/frontend/src/components/process/`.

### Public: `ProcessView.tsx`

The one way a dashboard shows a process.

```tsx
<ProcessView
  model={model}                    // PhaseSwimlaneModel
  statusById={statusById}          // node id → StatusKey
  tasks={openTasks}                // { taskDefinitionKey, assignee }[]
  title={{ name, code, live?, crumbs? }}
  stepper={<PhaseStepper … />}     // optional slot
  focusNodeId={nodeId}             // optional: scroll into view
  onOpenCall={(node) => …}         // optional: "open ↘" on call nodes
  viewer={…}                       // optional override; defaults to useViewer()
/>
```

- `title.crumbs` renders the main process › subprocess buttons the Caseworker
  overlay has today; `title.live` adds "(live)" to the meta line.
- The stepper is a slot because "which phase is selected" means different
  things per dashboard (the Infra-board's RIP phases, the Caseworker's Awb
  phases with a subprocess). Phase selection stays with the dashboard.
- It computes the node marks, the viewer's lanes and the legend itself, and
  renders `PhaseSwimlane`.

### Internal

- **`useViewer.ts`** — `{ userId, roles }` from `keycloak.tokenParsed`
  (`sub`, `realm_access.roles`), memoised. No logging. It does not call
  `getUser()`, which logs the whole token to the console (see Out of scope).
- **`processMarks.ts`** — pure functions:
  - `nodeMarks(tasks, viewer)` → `Map<nodeId, 'mine' | 'claimed' | 'open'>`.
    A node with several tasks takes the strongest mark: mine > claimed > open.
    Tasks whose `taskDefinitionKey` is not a node in the model are ignored.
  - `gatewayKind(node, edges)` → `'decision' | 'merge' | 'split' | 'join'`
    (rules below).
  - `legendEntries(model, statusById, marks, myLanes, roles)` → the entries
    present in this diagram, in a fixed order.
- **`status.ts`** — `STATUS` and `StatusKey`, moved from
  `pages/infra-board/rip-model.ts`. `rip-model.ts` re-exports both, so its
  other importers do not change.
- **`PhaseSwimlane.tsx`** — the drawing. It takes `model`, `statusById`,
  `marks`, `myLanes`, `focusNodeId` and `onOpenCall`. The opt-in props
  (`claimedNodeIds`, `myLaneKeys`, `claimedLabel`, `density`) and the
  `cwp-swim` switch are removed.

### Callers

- **`ProcessOverlay.tsx`** (Caseworker) keeps the modal, focus trap, phase
  picking and breadcrumbs. Its legend and its `PhaseSwimlane` call are
  replaced by `<ProcessView>`, with `tasks=[task]`. That task is assigned to
  the viewer, so it is `mine`, as "JOUW TAAK" is today.
- **`ProjectDetail.tsx`** (Infra-board) replaces its title bar and
  `PhaseSwimlane` call with `<ProcessView>`: title from the phase name and
  code plus `live`, `tasks = instanceTasks`, and its `PhaseStepper` in the
  `stepper` slot.
- **`ProcessLaneSteps`** (the Taken inbox's flat step list) is not a swimlane
  and keeps its layout, but uses `processMarks.ts` for gateways: a label equal
  to the element id is not shown, and the step reads by its kind — a decision
  by its question, a parallel split "Tegelijk", a parallel join "Alles klaar",
  an exclusive merge "Samenkomst" — instead of "KEUZE · splitst: – / –".

### Procesgegevens: `ProcessVarsDisclosure.tsx`

A disclosure around the existing `ProcessVarsSection` table: a full-width
button "Procesgegevens" with "Gegevens tonen ▼" / "Gegevens verbergen ▲",
`aria-expanded` and `aria-controls`, closed by default. It imports its own CSS
(the `.cwp-disclosure*` rules, moved from `caseworker-process.css`), so it works
on any dashboard. Callers render it with `key={task.id}`, so it folds again
for every new task; that replaces the explicit reset `TakenInbox` does today.
`TakenInbox.tsx` and `ProjectDetail.tsx` both use it; the hand-written
disclosure in `TakenInbox` goes.

### Guard

A test in `components/process/` reads every `.ts`/`.tsx` file under
`packages/frontend/src` and `packages/pa-cockpit/src` and fails if a file
outside `components/process/` imports `PhaseSwimlane`. It asserts that it
finds at least one legitimate importer (`ProcessView.tsx`), so a broken scan
cannot pass. Same pattern as `css-tokens.test.ts`.

## Data flow

```
dashboard (already loads model, statusById, tasks)
   └─ <ProcessView model statusById tasks title stepper …>
        ├─ useViewer()                        → { userId, roles }
        ├─ nodeMarks(tasks, viewer)           → nodeId → mine | claimed | open
        ├─ myLaneKeys(model, roles)           → lanes to tint (existing)
        ├─ legendEntries(…)                   → entries present
        └─ <PhaseSwimlane model statusById marks myLanes focusNodeId onOpenCall>
```

No new fetching. A node's status colour still comes from `statusById`; marks
are a layer on top, never a replacement. `assignee` is the Keycloak `sub`, as
the Taken inbox's "mine" filter already assumes.

## Visuals

The Caseworker look becomes the only look.

- **Grid:** roomy everywhere — 240px columns, 132px rows, 184×84 nodes. The
  `density` prop goes.
- **Slim empty lanes:** a lane with no nodes gets a 44px row. The label stays
  on one line with the "JOUW ROL" tag beside it. Lane offsets are already
  computed per lane, so this is one change there; edges only run between
  their own nodes' lanes.
- **Nodes:** three-line label clamp, kind badge (`SCRIPT` / `DMN` /
  `DEELPROCES`), dashed border for automatic tasks, green tint when done, the
  full label as tooltip. The Infra-board's document lines (`ndoc`) move into
  the node's footer and are clamped too, so they no longer push the label out.
- **Tabs:** "JOUW TAAK" in the accent colour with an outline, as today. New:
  "GECLAIMD", neutral (dark grey on white, grey border, no outline). The ✏
  glyph goes.
- **Edge labels:** shortened with the existing `edgeLabelText`, full text as
  tooltip, for every dashboard.
- **Call nodes:** "open ↘" only when the dashboard passes `onOpenCall`.
- **Labels equal to the element id** are not shown.

### Gateways

Classified from the model's kind and the edge counts:

| Kind            | Rule                                | Drawn as                                                                                               |
| --------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Decision        | exclusive (`gateway`), 2+ outgoing  | Diamond with "?". Its name (e.g. "Akkoord?") as label, two-line clamp. Edge condition labels as today. |
| Exclusive merge | exclusive, 1 outgoing, 2+ incoming  | A small filled ◆ dot, no label.                                                                        |
| Parallel split  | `parallel`, 2+ outgoing             | A vertical bar, about 8×72px, caption "tegelijk".                                                      |
| Parallel join   | `parallel`, 2+ incoming, 1 outgoing | The same bar, caption "alles klaar".                                                                   |

Edge cases: a parallel gateway with 2+ in and 2+ out is a split ("tegelijk");
an exclusive gateway with at most one in and one out is a merge dot. Edges
attach to the bar's or dot's edge; the routing needs only the per-shape half
width it already uses for diamonds. Bars and dots never show a label, which
also removes the raw `Gateway_…` ids by design.

### Legend

The Caseworker's swatches move from `caseworker-process.css` into
`process-view.css`, plus "Geclaimd" and two shape entries. Only entries
present in the diagram are shown, in this order: Afgerond, Loopt, Jouw taak,
Geclaimd, Jouw rol (with the matching groups), Automatisch (script / DMN),
◇ Beslissing, ┃ Tegelijk / alles klaar, Nog niet / niet doorlopen.

### CSS

The `.cwp-swim` rules merge into the base `.pbd .pb-swim*` rules in
`process-view.css`; the class goes. Colours use the shared `--rba-*` tokens or
the existing `--v2-*` / `--pb-*` variables, with no new hex values. No colour
changes, so this does not touch the decisions paused under #374.

### Test hooks

Data attributes with no visual effect: `data-node-id` and
`data-mark="mine|claimed|open"` on nodes, `data-gateway="decision|merge|split|join"`
on gateways, `data-lane-empty` on slim lanes, and
`data-legend="done|active|mine|claimed|role|auto|decision|parallel|todo"` on
legend entries.

## Delivery: two PRs

**PR 1 — the shared view, Caseworker on it.** `status.ts` move;
`processMarks.ts`, `useViewer.ts` and `ProcessView.tsx` with tests;
`PhaseSwimlane` takes `marks` and `myLanes` and gets slim empty lanes and the
id-label rule, keeping its old props for one PR because the Infra-board still
uses them; `ProcessOverlay` on `<ProcessView>`; e2e test 1 for the Caseworker.
Visible change: Caseworker only, and small — slim empty lanes where a process
has them, no id labels.

**PR 2 — the Infra-board on it, the old path removed.** `ProjectDetail` on
`<ProcessView>`; `PhaseSwimlane`'s opt-in props and `cwp-swim` removed; CSS
merged; the gateway shapes; the step-list gateway fixes in `ProcessLaneSteps`;
`ProcessVarsDisclosure` in both task panels; the guard test; e2e test 1 for
the Infra-board and e2e test 2; the changelog entry in
`pages/changelog-data.ts`. Visible change: the Infra-board gets the full look
and a folded "Procesgegevens"; gateway shapes change on both dashboards; the
Caseworker's step list loses its raw gateway ids.

| Dashboard                    | Before                  | After                                                                                        |
| ---------------------------- | ----------------------- | -------------------------------------------------------------------------------------------- |
| Caseworker overlay           | improved look           | the same, plus slim empty lanes, gateway shapes, no id labels                                |
| Infra-board project detail   | old compact look        | the improved look, "Geclaimd" for colleagues' tasks, gateway shapes, "Procesgegevens" folded |
| Taken inbox (flat step list) | `ProcessLaneSteps`      | same layout; gateways read by kind, no raw ids                                               |
| Taken inbox (task panel)     | folded "Procesgegevens" | the same, through the shared disclosure                                                      |
| WOO, PA-Cockpit              | no process diagram      | unchanged; they get `ProcessView` when they add one                                          |
| A new dashboard              | —                       | `ProcessView` is the only way in                                                             |

## Testing

### Unit (Vitest, in CI)

- `processMarks.test.ts` — marks (mine, claimed, open, precedence, unknown
  node ignored); gateway kinds (all four plus both edge cases); legend
  (exactly the entries present; "Jouw rol" lists only matching groups).
- `useViewer.test.ts` — `sub` and roles from the token; anonymous without a
  token; no console output.
- `ProcessView.test.tsx` — title, crumbs, live meta, stepper slot; legend
  matches the diagram; the `viewer` override wins.
- `PhaseSwimlane.test.tsx` — moved to the new props; slim lanes have the slim
  height and edges still meet their nodes; id labels hidden, real names shown;
  each tab; each gateway shape and its edge attachment.
- The guard test.
- `ProcessVarsDisclosure.test.tsx` — closed by default; opens and closes with
  `aria-expanded`; a new `key` folds it again.
- `ProcessLaneSteps.test.tsx` — no id labels; each gateway kind reads as
  above.
- `ProcessOverlay.test.tsx`, `ProjectDetail.test.tsx` and
  `TakenInbox.test.tsx` updated (legend from `ProcessView`; JOUW TAAK /
  GECLAIMD instead of ✏; the disclosure).

### E2E (Playwright, `packages/frontend/e2e/process-view.spec.ts`)

**Test 1 — rules that hold whatever the engine state.** On the Infra-board
(the first live project, as `infra-board-journey` opens) and in the Caseworker
overlay (on the task in the inbox), for whatever diagram is shown:

- every legend entry has a matching node, lane or gateway, and every mark,
  role lane and gateway kind present has its legend entry;
- every `.nlabel` fits: `scrollHeight ≤ clientHeight + 1`;
- no two node bounding boxes intersect;
- no gateway shows its element id; bars and dots show only their caption;
- every `data-lane-empty` lane is at most 48px high;
- the tabs match the page's own task list (Infra-board "Open taken"; the
  Caseworker's own task): assigned to the viewer → JOUW TAAK, to someone else
  → GECLAIMD;
- "Procesgegevens" starts folded (`aria-expanded="false"`) and opens on click,
  on both dashboards;
- the Caseworker's step list shows no gateway element id.

These are invariants, not counts, so the shared engine's state does not
matter — the same reasoning as `infra-board-journey.spec.ts`.

**Test 2 — the marks in a controlled setup.** Start an own instance of a
phase with two tasks open in parallel; through the Operaton REST API (as
`helpers/operaton-cleanup.ts` does) assign one to the logged-in test user and
one to a fictitious `e2e-collega`; leave a third unassigned if there is one.
Assert JOUW TAAK, GECLAIMD and no tab respectively; the legend shows "Jouw
taak" and "Geclaimd"; the test user's lane is "JOUW ROL"; the split and join
are bars. Remove the instance afterwards with the existing cleanup helper.

To settle while planning: which phase has parallel tasks and can be started
cleanly. The DO-raming phase (R2.4) has a parallel split but may need
preceding data. Fallback: an R2.1 instance through `rip-r21-journey`'s
helpers, with the two claims on sequential tasks (test 2 then asserts the
marks without the bar).

Both run against localhost and ACC, with `watchForRateLimit`.

### Verification per PR, before commit

1. Unit tests, type-check, eslint, `lint:css` (no new hex), a frontend
   production build.
2. The user: a browser look (PR 1: Caseworker overlay; PR 2: Infra-board on a
   live and a mock project, and the Caseworker overlay for the gateway
   shapes), `npm test` from the repo root, and the ACC e2e run including the
   new spec.

## Out of scope

- The backend parser and any new data.
- The Infra-board's phase logic and stepper; the Caseworker's phase picking.
- `ProcessLaneSteps`' layout (only its gateway labels change).
- The contents of the "Procesgegevens" table (only the fold changes).
- The colour decisions paused under #374.
- `getUser()` in `services/keycloak.ts` logs the whole token, including `bsn`
  when present, to the browser console on every call. A separate issue;
  `useViewer` avoids it.
