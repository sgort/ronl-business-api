# Design: RIP Beheer — R5.3 Geparkeerde projecten list (sub-project E)

## Problem

`PhaseDetail.tsx`'s `beyond`-phase branch (R5.3 since the v2 catalogue patch)
currently renders only a bare "Niet gemodelleerd" banner. Both the v2 design
screenshot (`08-fase-R5.3-geparkeerd-placeholder.png`) and the v2 reference
prototype (`reference/pb-beheer.reference.jsx`'s `ph.beyond` branch) show
this page continuing below the banner with a list of every project currently
"geparkeerd" on R5.3 — deliberately deferred out of the catalogue patch per
explicit user direction ("R5.3 is still missing. For that one a placeholder
is fine" / "the parked-projects list is sub-project E's job"). This spec is
that sub-project.

Per [[handoff-specs-are-source-of-truth]], `docs/infra-beheer-handoff-v2/`
is authoritative — specifically `reference/pb-beheer.reference.jsx` lines
327-348 for the exact shape, and `ARCHITECTURE.md`'s "four states" table for
the `geparkeerd` semantics.

## Design

### 1. New selector — `getMockGeparkeerdRows`

Add to `infra-board.data.ts`, alongside `getMockWipRows`/`getMockGereedRows`:

```ts
/**
 * Mock projects currently sitting on a `beyond` phase (R5.3) — every
 * project at this ladder position, regardless of ripPhaseState. Unlike
 * getMockWipRows, this does NOT exclude 'wachtend' projects: a project
 * that hasn't "started" R5.3 in the wip sense is still, in the real
 * sense that matters here, sitting there unwatched — matching
 * getMockPhaseCounts's own `geparkeerd` count, which counts both states.
 * Only meaningful for a `beyond` phase; called only from PhaseDetail's
 * beyond branch.
 */
export function getMockGeparkeerdRows(phase: RipPhase): PortfolioProject[] {
  const idx = RIP_PHASES.findIndex((p) => p.code === phase.code);
  return getMockPortfolio().filter((p) => {
    const curIdx = RIP_PHASES.findIndex((rp) => rp.code === p.ripPhaseCode);
    return curIdx === idx;
  });
}
```

This is the `curIdx === i` counterpart to `getMockPhaseCounts`'s existing
`if (phase.beyond) { if (curIdx === i) geparkeerd++; }` branch — same
classification, exposed as rows instead of a count, following the exact
precedent `getMockWipRows`/`getMockGereedRows` set for sub-project D's
tabs (including their generic parity test against `getMockPhaseCounts`).

### 2. `PhaseDetail.tsx`'s `beyond` branch

Replace the bare banner with the banner (copy updated, see below) plus a
"Geparkeerde projecten" section:

```tsx
if (phase.beyond) {
  const geparkeerd = getMockGeparkeerdRows(phase);
  return (
    <div className="pb-view">
      {header}
      <div className="pb-banner">
        Niet gemodelleerd — voor {phase.code} is geen overzichtsplaat aangeleverd en dus geen
        procesmodel opgesteld. Dit deelproces kent daarom geen start, WIP of gereed: projecten die
        hier staan worden niet bewaakt tot het deelproces is uitgewerkt en gedeployed.
      </div>
      <div className="pb-sec-head">
        <h3>Geparkeerde projecten</h3>
        <span className="c">{geparkeerd.length}</span>
      </div>
      <ul className="pb-parked-list">
        {geparkeerd.map((p) => (
          <li key={p.id}>
            <span className="pb-proj-nr">{p.nr}</span> {p.naam}
            <div className="sub">
              Buiten de gemodelleerde workflow — voortgang wordt hier niet bewaakt
            </div>
            <span
              className="pb-health-dot"
              style={{ background: HEALTH[p.health].color }}
              title={HEALTH[p.health].label}
            />
          </li>
        ))}
      </ul>
      <p className="pb-bron">{phase.bron}</p>
    </div>
  );
}
```

**Banner copy**: the current text ("...is alleen benoemd als vervolgstap...")
was written for R5.2's old v1 framing (a phase known only as a mention in
its predecessor) and no longer fits R5.3, which now has its own full
catalogue row (entry/exit/roles/bron). Replace it with the v2 reference's
fuller, more accurate copy (translated from `{ph.code}` to `{phase.code}`
for this codebase's existing convention) — it explains _why_ there's no
start/WIP/gereed, not just that there's no plaat.

**Health**: `p.health` is a direct `PortfolioProject` field (`HealthKey`,
already ported from `RAW`), not computed — unlike the WIP tab's
`computeHealth(blocked, daysInStep)`, there's no step/blocked concept for
an unmodelled phase. Reuses the existing `.pb-health-dot` class (added in
sub-project D) with an inline background color, same pattern as the WIP
tab's health cell, plus a `title` attribute carrying the text label (WCAG:
color is never the only signal — the WIP tab pairs its dot with visible
text; here there's no room for a text label in a compact row, so `title`
carries it as an accessible-name equivalent for the icon-only indicator).

**No interactivity**: no click handler on rows — matches the reference
exactly (no `onOpenProject` wiring in its geparkeerd branch). Project-detail
navigation from Beheer is out of scope regardless (sub-project F's
territory, and Portfolio/project-detail don't exist on the twelve-phase
ladder yet).

**No loading/error state**: `getMockPortfolio()` is synchronous mock data,
no live fetch — R5.3 has no `processDefinitionKey` and never will while
it's a placeholder, so there's no live path to gate on, unlike sub-project
D's WIP/Gereed tabs.

### 3. CSS

New `.pb-parked-list` rules in `dashboard-infra.css`, matching the visual
weight of the existing `.pb-ready-list` (Starten tab) — a plain list, each
row: project number + name, a muted subtitle line, health dot pinned to
the row's trailing edge. No checkbox (unlike `.pb-ready-list`, nothing here
is selectable).

## Out of scope

- Anything that makes R5.3 more than a placeholder (still not startable,
  still no WIP/Gereed tabs) — it stays exactly as unmodelled as before,
  this only adds visibility into who's parked there.
- Live-data path for R5.3 — no BPMN exists for it; if a real Overzichtsplaat
  ever arrives, that's a new sub-project replacing the placeholder
  (matching how R5.2 itself was un-stubbed in the v2 catalogue patch).
- Click-through to project detail, sorting, filtering, or search on the
  parked list — the reference has none of these, and Portfolio/project-
  detail integration is sub-project F's territory regardless.
- Any change to `getMockPhaseCounts`, `getMockWipRows`, or `getMockGereedRows`
  — this adds one new, analogous selector; the existing three are untouched.

## Testing

- `infra-board.data.test.ts`: `getMockGeparkeerdRows(R5.3).length` equals
  `getMockPhaseCounts()['R5.3'].geparkeerd` (parity test, same pattern as
  sub-project D's `getMockWipRows`/`getMockGereedRows` check). No
  beyond-guard test is needed: unlike `getMockWipRows` (which explicitly
  excludes `beyond` phases since WIP is meaningless there),
  `getMockGeparkeerdRows` has no such special case to test — it's a plain
  "projects at this ladder position" filter, only ever called from
  `PhaseDetail.tsx`'s `beyond` branch. Calling it on a non-`beyond` phase
  would correctly return whatever projects sit at that position, not `[]`
  — there's nothing to assert there.
- `PhaseDetail.test.tsx`: the existing `'PhaseDetail — R5.3 (beyond)'` test
  still passes unchanged (banner still renders, Starten/WIP tab labels
  still absent); new tests: the "Geparkeerde projecten" count matches
  `getMockGeparkeerdRows(R5.3).length`, at least one parked project's
  nr/naam renders, its health dot carries the right `title`, and `phase.bron`
  renders. No test needed for absence of an `Openen`/click affordance — the
  reference has none, so there's nothing to guard against regressing.
