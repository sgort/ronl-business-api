# Design: Rail stats panel — Mijn dag / Portfolio / Beheer

## Problem

The app shell's rail (`InfraBoardDashboard.tsx`'s `<aside className="v2-rail">`)
only ever renders navigable link items from `INFRA_MODES`
(`modes.config.ts`). Comparing the live app against the v2 design
screenshots and `reference/pb-shell.reference.jsx`'s `PBRail` function
shows three gaps, all in the same mechanism:

- **Beheer**: the rail card header is missing its subtitle ("RIP-faseladder
  · N in uitvoering"), and phase items carry no WIP/geparkeerd count badge.
- **Portfolio**: the rail is a single bare "Alle projecten" link — none of
  the design's stage-grouped phase counts, "Wacht op start" transition
  count, or Gezondheid (groen/geel/rood) breakdown exist.
- **Mijn dag**: no stats at all (Taken vandaag / Urgent-te laat / Mijn
  projecten), though this mode does correctly keep its two navigable items
  (Overzicht, Project-updates — the reference has neither, since its mock
  shell has no separate Project-updates page).

Per [[handoff-specs-are-source-of-truth]], `reference/pb-shell.reference.jsx`
(the `PBRail` function) and `docs/infra-beheer-handoff-v2/reference/project-board.css`
are authoritative for shape and styling.

**Confirmed before writing this spec:** most of the CSS this needs already
exists in `dashboard-infra.css` (`.pb-rail-stat`, `.pb-rail-sub`,
`.pb-rail-stats`) — apparently scaffolded early on but never consumed by
any JSX. `.v2-rail-group`/`.v2-rail-group-label`/`.v2-rail-list`/
`.v2-rail-item` already exist in `dashboard-v2.css` under the `.cwd-v2`
prefix, which the Infra-board root wrapper already carries alongside
`.pbd`. Only `.pb-rail-code`, `.pb-rail-badge`, `.pb-rail-badge.parked`,
and `.v2-rail-item.muted` are missing, and the reference's own CSS gives
their exact rules to port.

## Design

### 1. `InfraRailItem` gains optional badge fields

```ts
export interface InfraRailItem {
  id: string;
  label: string;
  authRequired?: boolean;
  requiredRoles?: string[];
  /** WIP count badge (Beheer phase items only). */
  count?: number;
  /** Geparkeerd count badge — R5.3 only, mutually exclusive with `count`. */
  parkedCount?: number;
  /** Dims the item — set when the phase isn't deployable yet. */
  muted?: boolean;
}
```

`modes.config.ts`'s static `INFRA_MODES` array can't carry live counts (it's
built once, outside React) — Beheer's phase items keep their static
shape there, and `InfraBoardDashboard.tsx` merges in `count`/`parkedCount`/
`muted` at render time from the same combined mock+live counts
`FaseladderOverview.tsx` already computes
(`combinePhaseCounts(getMockPhaseCounts(), normalizeLiveCounts(...))`,
`getPhaseDeployStatus`) — no new counting logic, this reuses sub-project
B's existing functions.

### 2. New rail-stats module

`packages/frontend/src/pages/infra-board/rail-stats.ts` — one pure function
per mode, each taking already-fetched data as arguments (no hooks inside;
`InfraBoardDashboard.tsx` calls the existing hooks and passes results in,
matching how every other Infra-board component already sources live data):

```ts
export interface RailStat {
  label: string;
  value: number;
  dotColor?: string;
}

export function mijnDagRailStats(
  liveTasks: Task[] | null,
  mockTodos: ReturnType<typeof getMockTodos>,
  allProjects: PortfolioProject[]
): RailStat[];

export function portfolioRailStageGroups(
  projects: PortfolioProject[]
): { stage: RipStage; phases: { phase: RipPhase; count: number }[] }[];

export function portfolioRailTransitions(projects: PortfolioProject[]): RailStat[]; // "Wacht op start"

export function portfolioRailHealth(projects: PortfolioProject[]): RailStat[]; // groen/geel/rood

export function beheerRailSubtitle(combined: Record<string, AnnotatedPhaseCounts>): string; // "RIP-faseladder · N in uitvoering"
```

**Mijn dag stats** — "Taken vandaag" and "Urgent / te laat" are **not** a
literal port of the reference's `t.prio === 'rood'` check: the reference's
own mock model uses HEALTH's groen/geel/rood taxonomy for todo priority,
but our real `LiveTodo.prio`/`StatusKey` type has no `'rood'` value (it's
done/active/wachtend/risk/overdue/action/todo — a different vocabulary
entirely, established back when `groupTasksByHorizon` was built). The
honest equivalent, computed from the same live+mock data `MijnDag.tsx`
already assembles:

- **Taken vandaag**: count of today's bucket (live `groupTasksByHorizon(...).vandaag.length` + mock `getMockTodos().vandaag.length` — same total `MijnDag.tsx`'s own lead paragraph already shows via `liveCount`, extended to include the mock count for parity with the rest of this stat block).
- **Urgent / te laat**: live todos with `prio === 'overdue'` + mock todos with `prio === 'overdue'` + projects with `health === 'rood'` (health is genuinely present on `PortfolioProject`, so that half of the reference's formula ports directly).
- **Mijn projecten**: `MIJN_PROJECT_NRS.length` — identical to what `MijnDag.tsx` already shows in its own lead paragraph and side card header.

**Portfolio stats** — computed from the same combined mock+live project
list `Portfolio.tsx` already builds (`all` in that component); the rail
needs its own call to `useActivePhase1()` to build the equivalent list,
matching how other Infra-board components independently re-fetch shared
live data rather than lifting state (e.g. `FaseladderOverview.tsx` and
`PhaseDetail.tsx` both call `useDeployedProcessKeys()`/`useLivePhaseCounts()`
independently today).

- Stage-grouped phase counts: for each `RIP_STAGES` entry, each `RIP_PHASES`
  entry in that stage, count of projects with that `ripPhaseCode`.
- "Wacht op start": count of projects with `ripPhaseState === 'wachtend'`.
- Gezondheid: count of projects per `health` value (groen/geel/rood).

**Beheer subtitle** — sum of `wip` across every non-`beyond` phase in the
combined counts (mirrors `FaseladderOverview.tsx`'s "Fasen in uitvoering"
KPI exactly — same number, shown in a different place).

### 3. `InfraBoardDashboard.tsx` rail rendering

The `<div className="v2-rail-card">` block gains a stats section per mode,
inserted between the header and the existing `visibleGroups.map(...)` nav
rendering:

- **mijn-dag**: `pb-rail-sub` line unchanged ("Persoonlijk · {name}"), then
  a `.pb-rail-stats` block (three `RailStat` rows) above the existing
  Overzicht/Project-updates nav group.
- **portfolio**: `pb-rail-sub` line added ("{total} projecten · 2022–2027"
  — same numbers `Portfolio.tsx`'s own lead paragraph shows), then one
  `.v2-rail-group` per stage (phase counts as `.pb-rail-stat` rows, **not**
  navigable — matches the reference exactly, no `onClick`), then an
  "Overgangen" group (Wacht op start) and a "Gezondheid" group, both
  `.pb-rail-stat` rows.
- **beheer**: `pb-rail-sub` subtitle added to the existing header; each
  existing phase `<li>` gains its badge (`count`/`parkedCount`) and
  `muted` styling, rendered conditionally exactly as the reference does
  (`{wip > 0 && <span className="pb-rail-badge">{wip}</span>}`).

### 4. Portfolio's `INFRA_MODES` entry loses its rail item

```ts
{
  id: 'portfolio',
  label: 'Portfolio',
  defaultSectionId: 'portfolio',
  groups: [{ items: [{ id: 'portfolio', label: 'Alle projecten', authRequired: true }] }],
},
```

becomes:

```ts
{
  id: 'portfolio',
  label: 'Portfolio',
  defaultSectionId: 'portfolio',
  groups: [],
},
```

`InfraSectionRouter.tsx`'s routing for `p.mode === 'portfolio'` is
unaffected (it doesn't switch on `section`, just mode) — the top nav
"Portfolio" tab still routes there via `setMode('portfolio')`, matching
how the design has no in-rail portfolio link at all.

### 5. CSS

Port these four rules directly from the v2 reference's `project-board.css`
(the only pieces missing — everything else this needs already exists):

```css
.pbd .v2-rail-item.pb-rail-phase {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: space-between;
}
.pbd .pb-rail-code {
  font-family: var(--v2-mono);
  font-size: 10px;
  font-weight: 700;
  color: var(--v2-ink-3);
  margin-right: 8px;
  letter-spacing: 0.04em;
}
.pbd .v2-rail-item.active .pb-rail-code {
  color: inherit;
  opacity: 0.75;
}
.pbd .v2-rail-item.muted {
  opacity: 0.62;
}
.pbd .pb-rail-badge {
  font-family: var(--v2-mono);
  font-size: 10px;
  font-weight: 700;
  background: var(--pb-blue);
  color: #fff;
  padding: 1px 5px;
  min-width: 16px;
  text-align: center;
}
.pbd .pb-rail-badge.parked {
  background: #eceef1;
  color: var(--v2-ink-2);
  border: 1px solid var(--v2-rule);
}
```

## Out of scope

- Any click/filter interaction on the Portfolio or Mijn dag stat rows —
  the reference has none (no `onClick` anywhere in `PBRail`'s stats
  blocks); these are display-only, matching it exactly.
- Any change to `FaseladderOverview.tsx`'s own KPI row or table — this
  reuses its counting functions, doesn't touch its rendering.
- Rail content for any mode beyond these three, or any change to the
  top-level mode tabs.
- Deployment-state distinctions beyond the existing `gedeployed`/`ontwerp`/
  `onbekend` model — `muted` reads the same `getPhaseDeployStatus` result
  already used elsewhere, no new state.

## Testing

- `rail-stats.ts` gets its own test file: each function tested against
  constructed `PortfolioProject`/`Task`/counts fixtures — stage grouping
  sums correctly, wachtend/health buckets partition the input exactly
  (every project counted once), Beheer subtitle sum matches
  `FaseladderOverview.test.tsx`'s existing "Fasen in uitvoering" invariant
  (same combined-counts input, same total).
- `InfraBoardDashboard.test.tsx`: for each mode, the rail shows the
  expected stat rows/badges/subtitle with mocked hook data; Portfolio's
  rail has no "Alle projecten" item; Beheer's phase items show a badge
  only when count/parkedCount is nonzero (matching the reference's
  conditional rendering) and `muted` only for non-deployable phases.
