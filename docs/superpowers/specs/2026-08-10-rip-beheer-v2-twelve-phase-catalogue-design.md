# Design: RIP Beheer — patch A–D to the v2 twelve-phase catalogue

## Problem

Sub-projects A–D were built against a v1 handoff (`docs/infra-beheer-handoff/`)
describing nine RIP sub-processes across four stages, with R5.2 modelled as a
tail stub (`beyond: true`, "Start werk buiten") because no Overzichtsplaat had
been supplied for anything past R5.1.

The remaining Overzichtsplaten have since arrived. A v2 handoff
(`docs/infra-beheer-handoff-v2/`) extends the same approved design to **twelve
sub-processes across five stages (R2.1…R6.1)**. Per the v2 prompt, this is
explicitly an extension of the accepted design, not a redesign — the state
model, deployment gate and sequence guard are unchanged; only the catalogue
got longer and R5.2 moved from "tail stub" to "real phase in the middle."

This spec covers patching sub-projects A–D (catalogue, Faseladder overview,
Starten tab, WIP/Gereed tabs) onto the v2 catalogue. Per
[[handoff-specs-are-source-of-truth]], `docs/infra-beheer-handoff-v2/` —
especially `RIP-PHASES.md`, `ARCHITECTURE.md`, and `reference/pb-phases.reference.jsx`
— is authoritative for the twelve-phase content model.

## The delta from v1

- **R5.2** (`Directievoering en toezicht (UAV)`) becomes a real phase: 40-week
  norm, `krediet: true`, full roles/docs/gates from the Overzichtsplaat. The
  `beyond: true` flag moves off it.
- **R5.3** (`(Vervroegde) ingebruikname / oplevering`) is new and becomes the
  placeholder: no Overzichtsplaat exists, so it carries `beyond: true` — the
  exact treatment R5.2 used to get.
- **R5.4** (`Oplevering en onderhoudsperiode`) and **R6.1** (`Projectdecharge`)
  are new real phases, closing out stage R5 and opening a new stage R6
  (`Decharge`).
- `RIP_STAGES` gains a fifth entry: `{ code: 'R6', name: 'Decharge', color: '#b0103c' }`.

## Design

### 1. Phase catalogue (`rip-phases.catalog.ts` + shared `rip-phases.ts`)

Replace the 9-entry `CONTENT` array in
`packages/frontend/src/pages/infra-board/rip-phases.catalog.ts` with the
twelve entries from `RIP-PHASES.md` / `reference/pb-phases.reference.jsx`
(code, stage, name, lead, roles, entry, exit, docs, gates, krediet,
kredietBeslisser, weeks, bron), field-for-field — the reference source is
authoritative for every value including `weeks` (10, 16, 8, 20, 14, 6, 12,
8, 40, 4, 26, 6) and `bron` strings.

**`kredietBeslisser` for R5.2 and R5.4:** unlike the existing `krediet:
true` phases (R2.3/R2.4/R3.2 → "Infra-overleg", R4.1 → "Concerndirecteur"),
R5.2's and R5.4's own decision routes on a € 50.000 threshold to _either_
AO _or_ Concerndirecteur (`RIP-PHASES.md`'s decisions for both phases) —
there is no single fixed decision-maker to name. Since threshold-based
routing logic is explicitly out of scope (§7 of the v2 prompt, "money
routing is configuration") and the existing side-panel UI renders
`kredietBeslisser` as one string (`Ja — ${kredietBeslisser}`), both phases
get a descriptive composite string rather than a single body:
`"AO of Concerndirecteur (afhankelijk van drempel)"`. This keeps the
existing UI correct without inventing routing logic.

`packages/shared/src/rip-phases.ts`'s `RIP_PHASE_KEYS` grows to the same
twelve codes/stages. Only R2.1 carries a `processDefinitionKey`
(`'RipPhase1Process'`) — none of the other eleven have a deployed BPMN yet,
so `getPhaseDeployStatus`'s existing live-registry-query logic already
reports them all as `ontwerp` (or `onbekend` for the `beyond` phase)
correctly, with zero code changes to that function.

**Deploy status stays 2/3-state (`gedeployed` / `ontwerp` / `onbekend`),
queried live from the registry — no `test` state.** The v2 design's
screenshots show a 4th "TEST" pill with Starten enabled for R2.2; this is
explicitly deferred (per user decision during brainstorming, consistent
with [[rip-beheer-validate-after-full-deploy]]'s existing note to revisit
this "once R2.2–R5.2 are actually deployed" — which hasn't happened outside
R2.1). R2.2…R6.1 will show "In ontwerp," matching the real (if not yet
fully populated) registry state, until this is revisited for real.

### 2. Mock ladder-position derivation — drop the legacy-bucket hack

`infra-board.data.ts`'s `pbLadderFor(nr, legacy)` currently maps each mock
project's old-model legacy phase value (1–6) onto a _range_ of ladder
positions via `LADDER_FROM_LEGACY: number[][]`, then hashes within that
range. The v2 prompt is explicit: _"Do not carry over `LADDER_FROM_LEGACY`
or `pbAwaits` from the prototype — they exist only to spread mock projects
across the ladder. Use real phase data."_ — and confirms the v2 reference
prototype itself still does this (only widened), precisely because it's a
static browser demo with no backend; our app has an actual mock/live merge
layer and doesn't need the legacy indirection.

Replace `pbLadderFor` with a direct hash straight onto all twelve
positions:

```ts
function pbLadderFor(nr: string): number {
  return 1 + (pbHash(nr + '|ladder') % RIP_PHASES.length);
}
```

`LADDER_FROM_LEGACY` is deleted. Call sites drop the `legacy`/`phase`
argument. `RAW`'s 42 project rows are untouched — same nr/naam/role/
health/milestone/budget/startYear/startQ; only how the ladder position is
computed from `nr` changes. `pbAwaits(nr)` is unaffected (already
`nr`-only, no legacy dependency).

This reshuffles which of the 42 mock projects land on which of the twelve
phases (more phases, same project count, so density thins from ~4.7/phase
to ~3.5/phase on average). Any existing test that hard-picks a specific
phase and asserts it has ready/out-of-sequence/wip/gereed projects (e.g.
sub-project C's "R2.3 always has ready projects," sub-project D's various
R2.1/R2.3/R2.4-keyed fixtures) must be re-verified against the new
distribution — expect to swap a phase code in a handful of tests the same
way sub-project C swapped R2.2→R2.3 for `getReadyProjects` when R2.1 turned
out structurally empty for that query. This is mechanical verification via
the test suite, not a design question.

### 3. Faseladder / Starten / WIP / Gereed (B/C/D) — no logic changes anticipated

All four already iterate `RIP_PHASES` and `RIP_STAGES` generically:

- Faseladder's KPI row and stage-grouped table derive their shape entirely
  from `RIP_PHASES`/`RIP_STAGES` length and content — twelve rows under
  five stage headers falls out automatically.
- The Starten tab's sequence guard, ready/out-of-sequence lists, and
  R2.1-fallback path are keyed off ladder position and deploy status, not a
  hardcoded phase count.
- `getMockPhaseCounts`'s existing `phase.beyond` branch already implements
  exactly the "geparkeerd" semantics `ARCHITECTURE.md` describes for R5.3
  (excluded from `wip`, counted separately, never `gereed`) — moving the
  `beyond` flag from R5.2 to R5.3 is a pure data change; the counting code
  is untouched.
- WIP/Gereed tabs' mock-row rendering (`getMockWipRows`/`getMockGereedRows`/
  `getMockPhaseInstanceDetail`) is phase-shape-agnostic — R5.2 flips from
  "beyond placeholder" to "normal phase using mock rows" (the same path
  R2.2–R4.1 already use today); R5.3 flips the other way to the placeholder
  banner. R2.1 keeps its unique live-data path, unaffected.

If verification surfaces a genuine gap in this section, it gets fixed as
part of task execution — but no design work is anticipated here beyond
confirming the generic code holds.

## Out of scope for this patch

Confirmed against the v2 prompt and explicit user direction:

- **Alternate WIP metric for R5.2/R5.4.** `ARCHITECTURE.md` and
  `RIP-PHASES.md` gap 5 both flag "dagen in huidige stap" as the wrong
  metric for a weekly-repeating cycle (R5.2) or a timer-driven waiting
  period (R5.4) and suggest alternatives (open afwijkingen + doorlooptijd
  weeks; weeks to einde onderhoudsperiode). User is fine leaving the
  current uniform metric in place — matching what the v2 design itself
  still shows unresolved.
- **R5.3's "geparkeerde projecten" list.** The design screenshot
  (`08-fase-R5.3-geparkeerd-placeholder.png`) shows the placeholder page
  continuing below the banner with a parked-projects list. Per explicit
  user direction, a bare banner placeholder (the same shape R5.2 used to
  get) is sufficient for this patch — the parked-projects list is
  sub-project E's job.
- **Modelling R5.2 as a repeating cycle, R5.4's timer, or R6.1's parallel
  gateway** in any UI-visible way. These are BPMN-authoring/backend
  concerns for whenever those processes actually get modelled and
  deployed; nothing in Beheer's UI needs to represent gateway shape today.
- **Money-routing configuration** (§7 of the v2 prompt — R5.2/R5.4/R4.1
  threshold-based AO-vs-Concerndirecteur routing). No gateway-config UI
  exists anywhere in this app; this is guidance for future BPMN authoring.
- **Between-phase state in Portfolio / Mijn dag / project stepper**, and
  **migrating those three surfaces off the old six-phase model onto
  R2.1…R6.1.** Sub-project F, unchanged from prior scoping.
- **Rail WIP count badges.** Already deferred from sub-projects B/C; v2's
  restating the same requirement doesn't change that.
- **External system integration points** (VISI, Relatics, Better
  Performance, besteksadministratie, DMS/zaakmap, TopDesk, TenderNed,
  webformulier ATB, Qualtrics). Explicitly flagged in the v2 prompt as
  "integration points, not features to build here."

## Testing

- `rip-phases.catalog.test.ts` (or wherever A's catalogue tests live):
  `RIP_PHASES.length === 12`, `RIP_STAGES.length === 5`, R5.2 has
  `beyond` undefined/false and full field data, R5.3 has `beyond: true`
  and the placeholder field shape (empty docs/gates), every phase's `stage`
  resolves to a real `RIP_STAGES` entry.
- `infra-board.data.test.ts`: `getMockPhaseCounts()`'s per-phase counts
  reconcile across all twelve phases. Precisely: every project is at
  exactly one _current_ ladder position, so `sum` over all twelve phases
  of `(wip[i] + geparkeerd[i])` must equal `getMockPortfolio().length`
  exactly (each project counted as currently active — wip or geparkeerd —
  at exactly one phase, never more, never fewer). `gereed[i]` is
  cumulative by construction (a project counts as `gereed` at every phase
  index behind its current position), so it is _not_ part of that sum —
  don't assert a total across `gereed`. R5.3 specifically gets
  `geparkeerd` counts and zero `wip`. `getMockWipRows`/`getMockGereedRows`
  stay reconciled against `getMockPhaseCounts` (already tested generically
  in sub-project D — should hold automatically once the catalogue and
  ladder derivation change, verify it still passes).
- `FaseladderOverview.test.tsx`: five stage headers render, twelve phase
  rows render, KPIs compute over twelve phases (`Deelprocessen inzetbaar`
  shows "N / 12").
- `PhaseDetail.test.tsx`: R5.2 now renders the full three-tab shell (no
  longer the `beyond` placeholder); R5.3 renders the `beyond` placeholder
  banner (same assertions the R5.2-as-beyond test used to make, moved to
  R5.3's phase code).
- Any existing test hard-picking a phase code for its ready/out-of-sequence/
  wip/gereed fixtures gets re-verified against the new ladder distribution
  per §2 above — fix by swapping the phase code the test targets, not by
  special-casing the derivation.
