# Design: Cross-app RIP ladder migration — Portfolio, Mijn dag, ProjectDetail stepper (sub-project F)

## Problem

Sub-projects A–E rebuilt Beheer entirely on the real twelve-phase RIP ladder
(`RIP_PHASES`/`ripPhaseCode`/`ripPhaseState`). Three other surfaces never
migrated and still run on a placeholder six-phase model (`PHASES` in
`rip-model.ts`, `PortfolioProject.phase`/`.phaseStatuses`/`.segments`,
`PHASE_DUR`) whose names don't match the RIP source material at all
(`PHASES[4].name === 'Uitvoering'`, collapsing R3.1+R3.2 into one step;
`PHASES[5].name === 'Decharge'`, collapsing R4.1 into another) — this is
exactly the "Fase 1…6 placeholder model" the project has deliberately
deferred migrating since sub-project B.

Confirmed by grepping the whole frontend before writing this spec: the old
model has exactly three consumers — `Portfolio.tsx` (Gantt + Kanban),
`MijnDag.tsx` (one "Mijn projecten" side-card), `ProjectDetail.tsx` (the
project stepper) — plus its definition in `rip-model.ts`/`infra-board.data.ts`.
Nothing else touches it.

Per [[handoff-specs-are-source-of-truth]], `docs/infra-beheer-handoff-v2/`
is authoritative — specifically `ARCHITECTURE.md`'s "Between-phase state"
paragraph and `reference/pb-portfolio.reference.jsx`, which shows the
intended shape: the same Gantt/Kanban/legend mechanics, rebuilt directly on
the twelve-phase ladder, with a `wachtend` status now in the legend and
surfaced on cards ("Wacht op start van R2.4").

## Design

### 1. `infra-board.data.ts` — new twelve-phase segment/status model

**Retire, don't parallel-track:** `PortfolioProject.phase: number`,
`.phaseStatuses: StatusKey[]`, `.segments: GanttSegment[]`, `PHASE_DUR`, and
`rip-model.ts`'s `PHASES`/`Phase` are all removed, not kept alongside the
new fields — every consumer migrates in this same sub-project, so nothing
is left depending on the old shape. `ripPhaseCode`/`ripPhaseState` (added
in sub-project B) already carry "where is this project now"; this task adds
the piece Portfolio/stepper need beyond that: the full timeline.

**New segment type**, replacing `GanttSegment`:

```ts
export interface RipGanttSegment {
  phaseCode: string;
  from: number; // quarter index into the TL window
  len: number; // quarters
  status: StatusKey; // done | active | wachtend | risk | overdue | action | todo
}
```

`PortfolioProject.segments: RipGanttSegment[]` — one entry per `RIP_PHASES`
entry (twelve), built the same walk-forward way the old code did (start at
the project's own start quarter, accumulate durations), just over the real
ladder instead of the old six-phase one.

**Durations**: derived from each phase's own `weeks` (already in the
catalogue) instead of a hand-authored `PHASE_DUR` array —
`Math.max(1, Math.round(phase.weeks / 13))` quarters per phase (13
weeks/quarter). Computed once at module load from `RIP_PHASES`, so it can
never drift out of sync with the catalogue the way a parallel hardcoded
array could.

**Status derivation** replaces `phaseStatuses(current, flags)`. The old
`flags: Partial<Record<number, StatusKey>>` (`RAW`'s 6th tuple field) was a
hand-authored per-legacy-phase override map — the same kind of "spread mock
variety via a legacy indirection" mechanism the v2 catalogue patch already
retired for ladder positioning (`LADDER_FROM_LEGACY`). Same fix here: no
override map, a deterministic hash instead —

```ts
function ripPhaseStatuses(nr: string, curIdx: number, awaiting: boolean): StatusKey[] {
  return RIP_PHASES.map((_, i) => {
    if (i < curIdx) return 'done';
    if (i > curIdx) return 'todo';
    if (awaiting) return 'wachtend';
    const r = pbHash(`${nr}|status|${i}`) % 100;
    if (r < 8) return 'overdue';
    if (r < 18) return 'action';
    if (r < 30) return 'risk';
    return 'active';
  });
}
```

(Thresholds are illustrative, matching the rough variety the old flags-based
mock data produced — not a business rule.)

**`RAW`/`Raw` cleanup**: with `phase` (legacy 1-6 value) already unused for
ladder positioning since the v2 catalogue patch (Task 3 dropped it from
`pbLadderFor`'s signature) and now unused for status/segments too, it has
**no remaining consumer anywhere in the app**. Same for the `flags` tuple
field, replaced by the hash above. Both are dropped from the `Raw` tuple
type and all 42 `RAW` row literals — a bounded, mechanical edit (removing
two known-position elements per row, not hand-authoring new content).
Every other `RAW` field (nr, naam, role, health, milestone, budget,
startYear, startQ) is untouched.

**Not touched**: `getMockPhaseCounts`, `getMockWipRows`/`getMockGereedRows`/
`getMockGeparkeerdRows`, `getMockPhaseInstanceDetail`, `pbLadderFor`,
`pbAwaits` — all already operate on `ripPhaseCode`/`ripPhaseState` and stay
exactly as they are.

### 2. `Portfolio.tsx` — Gantt + Kanban on the real ladder

Both views already receive `rows: PortfolioProject[]` and only need their
internals repointed at the new fields:

- **Gantt**: bars iterate `p.segments` (now `RipGanttSegment[]`), bar label
  and tooltip use `phaseCode` + `ripPhaseByCode(phaseCode).name` directly
  (no more `F{n}` / `PHASES[n-1]`).
- **Kanban**: columns iterate `RIP_PHASES` (twelve) instead of the old
  `PHASES` (six), grouped under a stage header row exactly like Beheer's
  Faseladder table and the v2 reference (`pb-kan-stage`, shown once per
  stage transition) — reuses `RIP_STAGES` the same way `FaseladderOverview.tsx`
  already does. Cards filter on `p.ripPhaseCode === phase.code` (replacing
  `p.phase === ph.n`); a card's status pill reads
  `p.segments[i].status` for that column's phase index.
- **Wachtend surfacing** (`ARCHITECTURE.md`'s explicit requirement): the
  legend gains a `wachtend` swatch alongside done/active/risk/overdue/action;
  a Kanban card whose column status is `'wachtend'` shows "Wacht op start
  van {phaseCode}" in place of its normal milestone line (matching the
  reference exactly — `st === 'wachtend' ? \`Wacht op start van ${ph.code}\` : p.milestone`).
- **Role filter, scope tabs (alle/mijn/risico), `onOpenProject` wiring,
  live-instance merge (`useActivePhase1`/`makePhase1Row`)**: unchanged —
  none of this depended on the six-phase model. The risico filter's
  `p.phaseStatuses[p.phase - 1]` becomes `p.segments[curIdx].status` where
  `curIdx` is `p.ripPhaseCode`'s index in `RIP_PHASES`.

### 3. `MijnDag.tsx` — "Mijn projecten" card

Small, isolated change: the card's phase label
(`` `F${ph.n} · ${ph.name}` `` via `PHASES.find(x => x.n === p.phase)`)
becomes `` `${phase.code} · ${phase.name}` `` via `ripPhaseByCode(p.ripPhaseCode)`.
Nothing else in this file touches the six-phase model.

### 4. `ProjectDetail.tsx` — stepper on the real ladder

- The `.pb-stepper` renders `RIP_PHASES` (twelve steps) instead of `PHASES`
  (six) — each step already shows a code and a name; `phase.code` is now
  the real RIP code directly, no `phaseLabels` indirection needed.
- `phaseLabels: string[]` prop is **removed** — from this component, from
  `Portfolio.tsx`, from `InfraSectionRouter.tsx`'s `Props`, and from
  `InfraBoardDashboard.tsx`'s `useState<string[]>(PHASES.map(...))` +
  unused `_setPhaseLabels`. This was scaffolding for an admin-editable-names
  feature that was never built (the setter was never called) — components
  now import `RIP_PHASES` directly, same as every Beheer component already
  does.
- `currentPhase`/`stepClass`/`deriveMockStatus` are re-derived from
  `mock?.ripPhaseCode`/`mock?.ripPhaseState` instead of `mock?.phase`/
  `mock?.phaseStatuses[0]`. Live instances stay "always R2.1" (unchanged —
  only R2.1 is ever live).
- **Only R2.1 gets real step detail** (the swimlane) — this was already
  true (`selPhase === 1` gated the swimlane; every other step showed "nog
  niet gemodelleerd"). That gate becomes `selPhase === 'R2.1'` (comparing
  codes instead of the number `1`) with identical behavior — eleven of
  twelve steps still show the placeholder message, now correctly worded for
  twelve phases instead of six.

### 5. Cleanup

- `rip-model.ts`: remove `PHASES`, `Phase` interface. `STATUS`, `HEALTH`,
  `ROLES`, `roleByKey`, `FASE1_*`, `nodeStatusFromHistory` are unrelated
  (R2.1-swimlane / general vocabulary) and stay untouched.
- `infra-board.data.ts`: remove `PHASE_DUR`, `phaseStatuses()`,
  `GanttSegment` (replaced by `RipGanttSegment`).

## Out of scope

- Any change to Beheer (`FaseladderOverview.tsx`, `PhaseDetail.tsx`) — those
  are already fully on the real ladder from sub-projects B–E.
- Rail WIP badges, the deferred TEST deploy-state — unchanged deferrals
  from prior sub-projects.
- Money-routing configuration, R5.2/R5.4's alternate WIP metric — unrelated
  to this migration, still deferred per the v2 catalogue patch's scope
  notes.
- Any change to `Fase1Swimlane.tsx` — confirmed it never referenced `PHASES`
  in the first place (it's R2.1-swimlane-specific, keyed off `bpmnId`, not
  the six/twelve-phase ladder).

## Testing

- `infra-board.data.test.ts`: `getMockPortfolio()` — every project's
  `segments` has exactly twelve entries in `RIP_PHASES` order; segment
  status is `'done'` for every index before the project's `ripPhaseCode`
  index, `'todo'` for every index after, `'wachtend'` exactly when
  `ripPhaseState === 'wachtend'` at the current index, and one of
  active/risk/overdue/action at the current index otherwise; segment
  durations are deterministic and match the `weeks`-derived formula.
- `Portfolio.test.tsx` (already exists — its current assertions are on the
  six-phase model and need updating alongside the implementation, not
  created from scratch): Gantt renders a bar per phase with the real RIP
  code as its label; Kanban renders twelve columns under the right stage
  headers with the right per-column counts; a `wachtend` card shows "Wacht
  op start van {code}" instead of its milestone; the wachtend legend
  swatch renders.
- `MijnDag.test.tsx` (already exists, needs the same kind of update): a
  "Mijn projecten" card shows the real RIP code + name for its project's
  current phase.
- `ProjectDetail.test.tsx` (already exists, needs the same kind of update):
  the stepper renders twelve steps with real RIP codes; selecting a
  non-R2.1 step shows the "nog niet gemodelleerd" placeholder; selecting
  R2.1 shows the swimlane, unchanged from today's behavior.
