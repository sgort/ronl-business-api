# Design: Beheer — phase detail, WIP + Gereed tabs (sub-project D)

## Problem

`PhaseDetail` (sub-project C) has working Starten tab content but its
WIP/Gereed tabs are placeholder text. This spec builds them — the fourth of
the six sub-projects the handoff was decomposed into (see sub-project A's
spec's "Decomposition" table).

## Handoff package is authoritative — validated against real data

Per standing project guidance, the design/screenshots (`02-fase-R2.1-wip.png`,
`03-fase-R2.1-gereed.png`) are the authoritative target shape for these
tabs, cross-checked here against **actual live Operaton data** — the user
has started 5 real `RipPhase1Process` instances during testing (visible in
Portfolio's Tijdlijn view, tagged `LIVE`). A direct Operaton query against
one of them
(`GET /history/activity-instance?processInstanceId=...`) confirmed the
activity-history shape matches exactly what `nodeStatusFromHistory`/
`FASE1_NODES` (already built for the swimlane view) expect: `activityId`
maps 1:1 to each node's `bpmnId`, and the currently-running task has
`endTime: null` with no other running siblings — so "find the node with no
`endTime`" is a valid, tested way to find the current step against real
data, not just a theoretical BPMN-shape assumption.

## Scope

`packages/frontend` only. No new backend routes — `getActivityHistory`
(`businessApi.process.activityHistory`) and the existing
`businessApi.rip.phase1Active()`/`phase1Completed()`/`phase1Documents()`
already provide everything needed for R2.1's real data.

Two components are retired, one is reused:

- `RipFase1WipSection`, `RipFase1GereedSection` (list/accordion wrappers) —
  folded into `PhaseDetail`'s WIP/Gereed tabs. Removed from
  `CaseworkerDashboardV2` too (rail items + routes), matching sub-project
  C's precedent for `RipFase1Section` — confirmed by the user as consistent
  with that decision, not just an InfraBoard-side change.
- `RipFase1WipViewer` (the document renderer: intake-verslag, PSU-verslag,
  PDP) **stays** — reused by the new Gereed tab's "Dossier → Openen"
  action. Nothing else in the app renders these documents.

## Design

### 1. R2.1 WIP derivation (real data)

New function in `rip-model.ts` (alongside the existing `FASE1_NODES`,
`FASE1_EDGES`, `nodeStatusFromHistory`):

```ts
export interface WipStepInfo {
  step: string; // current node's label
  stepRole: string; // roleByKey(lane).label
  daysInStep: number;
  blocked: string | null; // originating gateway's label, if this node is a rework target
}

/**
 * Derives the current-step summary for one process instance from its
 * activity history. The running node (no endTime) is the current step;
 * if it's the target of a `back: true` edge, the gateway that sent it
 * back is surfaced as `blocked`. R2.1-specific — FASE1_NODES/FASE1_EDGES
 * model only R2.1's BPMN.
 */
export function getWipStepInfo(history: ActivityHistoryItem[]): WipStepInfo | null {
  const running = history.find((h) => !h.endTime && !h.canceled);
  if (!running) return null;
  const node = FASE1_NODES.find((n) => n.bpmnId === running.activityId);
  if (!node) return null;
  const backEdge = FASE1_EDGES.find((e) => e.back && e.to === node.id);
  const blocked = backEdge
    ? (FASE1_NODES.find((n) => n.id === backEdge.from)?.label ?? null)
    : null;
  const daysInStep = Math.floor(
    (Date.now() - new Date(running.startTime).getTime()) / (1000 * 60 * 60 * 24)
  );
  return {
    step: node.label,
    stepRole: roleByKey(ROW_TO_LANE_KEY[node.row]).label,
    daysInStep,
    blocked,
  };
}
```

(`ROW_TO_LANE_KEY` — a small reverse lookup from a node's numeric `row`
back to its lane key, since `SwimNode.row` is an index today, not the lane
key itself. Add alongside the existing `ROW` map:
`const ROW_TO_LANE_KEY: string[] = FASE1_LANES.map((l) => l.key);` —
`ROW_TO_LANE_KEY[node.row]` then gives the lane key directly.)

**Health** (a simple, documented-as-illustrative heuristic, since no
per-step norm exists in the catalogue at that granularity): `groen` when
not blocked and `daysInStep <= 14`; `geel` when blocked, or `daysInStep`
in `(14, 28]`; `rood` when `daysInStep > 28`, or blocked and `daysInStep >
14`.

**Product progress** (`docsDone/docsTotal`): count of `FASE1_DOCS` whose
`produceNode` has already finished (per `nodeStatusFromHistory`), out of
`FASE1_DOCS.length`.

### 2. R2.1 Gereed derivation (real data)

From `businessApi.rip.phase1Completed()` (already returns `startTime`,
`endTime`) plus `getActivityHistory` for loop-count and `phase1Documents`
for the accorderer:

- **Doorlooptijd** = `endTime - startTime`, in weeks, vs. `phase.weeks`
  (R2.1's catalogue norm).
- **Loops** = count of traversals over `FASE1_EDGES` entries with
  `back: true` in that instance's activity history (each rework loop
  re-executes the target node, so count activity-history rows whose
  `activityId` matches a `back`-edge target beyond the first occurrence).
- **Geaccordeerd door** = the assignee of the final `Task_AccorderenProjectplan4`
  activity (the last accordering task before the end event).
- **Dossier** = "Openen" reveals `RipFase1WipViewer` inline for that
  instance (reused as-is).

### 3. Mock WIP/Gereed data (ported from the reference prototype)

New function in `infra-board.data.ts`, alongside `getMockPhaseCounts`:

```ts
export interface MockPhaseInstanceDetail {
  step: string | null;
  stepRole: string | null;
  daysInStep: number;
  blocked: string | null;
  docsDone: number;
  docsTotal: number;
  loops: number;
  plannedWeeks: number;
  actualWeeks: number | null;
  doneBy: string | null;
  doneDate: string | null; // simplified: a plausible deterministic date,
  // not the reference's full walk-forward
  // cross-phase consistency computation
}

/**
 * Deterministic per-project-per-phase illustrative detail, ported from
 * reference/pb-instances.reference.jsx. Only meaningful when the project's
 * ripPhaseState/position matches — callers filter to the right project set
 * first (getMockPhaseCounts-style ladder-position logic).
 */
export function getMockPhaseInstanceDetail(
  project: PortfolioProject,
  phase: RipPhase
): MockPhaseInstanceDetail {
  const seed = pbHash(`${project.nr}|${phase.code}|detail`);
  const rnd = (salt: number) => ((seed * (salt + 1)) % 10000) / 10000;
  const isWip = project.ripPhaseCode === phase.code && project.ripPhaseState === 'wip';
  return {
    step: isWip ? (phase.docs[Math.floor(rnd(1) * phase.docs.length)] ?? phase.exit) : null,
    stepRole: isWip ? phase.roles[Math.floor(rnd(2) * phase.roles.length)] : null,
    daysInStep: isWip ? 1 + Math.floor(rnd(3) * 34) : 0,
    blocked:
      isWip && phase.gates.length && rnd(4) > 0.72
        ? phase.gates[Math.floor(rnd(5) * phase.gates.length)]
        : null,
    docsDone: isWip ? Math.floor(rnd(6) * (phase.docs.length + 1)) : phase.docs.length,
    docsTotal: phase.docs.length,
    loops: Math.floor(rnd(7) * 3),
    plannedWeeks: phase.weeks,
    actualWeeks: Math.max(2, Math.round(phase.weeks * (0.75 + rnd(8) * 0.8))),
    doneBy: ['AO', 'Aandrager', 'Projectleider', 'Concerndirecteur'][Math.floor(rnd(9) * 4)],
    doneDate: formatDeterministicDate(seed),
  };
}
```

`formatDeterministicDate` — a small helper producing a plausible date
within the app's existing timeline window (`TL.startYear`…`TL.startYear +
TL.quarters/4`), seeded the same way; no cross-phase consistency guarantee
(unlike the reference's walk-forward), since D only needs one phase's
table to look plausible at a time, not a globally coherent timeline.

### 4. UI

- **WIP tab**: table — Project | Huidige stap | Rol | Dagen | Producten |
  Blokkade | Gezondheid. Rows = live R2.1 instances (via
  `businessApi.rip.phase1Active()` + `getWipStepInfo` per instance) merged
  with mock rows for every phase's `ripPhaseState === 'wip'` projects
  (via `getMockPhaseInstanceDetail`), same merge-and-badge pattern as
  `Portfolio.tsx` (`LIVE` badge on real rows, no badge on mock — never a
  combined total, since these are individual project rows, not
  aggregates).
- **Gereed tab**: summary line ("N afgerond · Gemiddelde doorlooptijd X wk
  · norm Y wk · Z met review-loop") then table — Project | Afgerond |
  Geaccordeerd door | Doorlooptijd | Loops | Producten | Dossier. Same
  merge pattern; "Dossier → Openen" only appears on rows with a real
  `instanceId` (mock rows show a dash — there's no document set to open
  for illustrative data).
- Both tabs replace `PhaseDetail`'s current `pb-placeholder` text for
  `tab === 'wip'`/`'gereed'`.

## Testing

- `rip-model.test.ts` (extend or create) — `getWipStepInfo`: correctly
  identifies the running node from a fixture matching the real Operaton
  shape observed above; `blocked` is set only when the running node is a
  `back`-edge target, using the real fixture's rework scenario; returns
  `null` when every activity has an `endTime` (process complete) or the
  history is empty.
- `infra-board.data.test.ts` — `getMockPhaseInstanceDetail`: deterministic
  across calls (same seed → same output); `isWip`-gated fields are
  null/zero when the project isn't at that phase in `wip` state;
  `docsDone === docsTotal` when not wip (implying "done" for phases
  already passed).
- `PhaseDetail.test.tsx` (extend) — WIP tab renders real R2.1 rows (mocked
  `phase1Active` + `activityHistory`) with a `LIVE` badge, plus mock rows
  for other wip projects at that phase, unbadged; Gereed tab renders the
  summary line with correct arithmetic and the doorlooptijd/norm
  comparison; "Dossier → Openen" reveals `RipFase1WipViewer` only for rows
  with an `instanceId`.
- `CaseworkerDashboardV2/SectionRouter.test.tsx` — remove the
  `rip-fase1-wip`/`rip-fase1-gereed` route assertions, matching their
  removal from that dashboard.

## Out of scope

- `TEST`-vs-`LIVE` deploy-state distinction, rail WIP badges — same
  deferral as B/C, per `rip-beheer-validate-after-full-deploy`.
- Cross-phase-consistent mock timelines (the reference's full walk-forward
  date computation) — simplified per §3.
- Any change to `Portfolio.tsx`'s own Gantt/kanban rendering — sub-project
  F.
