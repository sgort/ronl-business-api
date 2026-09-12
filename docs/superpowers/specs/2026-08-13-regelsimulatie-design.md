# Design: Regelsimulatie (subsidy budget-exhaustion simulation)

## Problem

Add a new **Regelsimulatie** section to the Caseworker Dashboard V2: a deterministic,
day-by-day simulation of the Flevoland home-battery subsidy (CVDR750157) across its full
2026–2027 application window, run against a synthetic population, with budget exhaustion
as the primary lens. A caseworker or policy officer scrubs a timeline and watches the
programme budget deplete, sees which valid applications ended up unpaid and why (an
information request shifted their priority, or someone else's successful appeal took
their budget), and can tweak the scenario's parameters to see the effect.

A complete, high-fidelity handoff already exists at `docs/regelsimulatie-handoff/`
(README, screenshots, `docs/Rules and behaviour.md` — normative for the rules — and
editable JSX/CSS reference sources). Per [[handoff-specs-are-source-of-truth]], the
handoff overrides this spec on any rule, layout, or copy detail; this spec is
authoritative on the technical breakdown (files, types, integration, testing) for this
specific repo.

## Design

### Placement in the shell

A new mode `'simulatie'`, inserted between the existing `'zoeken'` and `'beheer'` modes
in `packages/frontend/src/pages/caseworker-v2/modes.config.ts`'s `ModeId` union and
`MODES` array, with a single rail item:

```ts
{
  id: 'simulatie',
  label: 'Simulatie',
  defaultSectionId: 'regelsimulatie',
  groups: [{ items: [{ id: 'regelsimulatie', label: 'Regelsimulatie', authRequired: true }] }],
}
```

`authRequired: true` — **confirmed explicitly with the owner**: the section is
caseworker-only, not part of the anonymous "Verken openbare bibliotheek" public library
tier the six `Zoeken` sections sit in, even though the underlying data is entirely
synthetic.

`regelsimulatie` also needs adding to `modes.config.ts`'s `SHELL_GLOBAL_SECTION_IDS` set.
This is independent of the auth decision: it's a **tenant gate**, not an auth gate — any
section id absent from a tenant's `tenants.json` `leftPanelSections` is hidden once
`tenantSectionIds` has loaded, unless it's shell-global. Every existing V2-native section
(`taken`, `filter-*`, `dvtp-*`) is in this set for exactly this reason; `regelsimulatie`
is new-in-V2 the same way and needs the same treatment. Skipping this would ship a
feature that's invisible to every real tenant once their tenant config loads — the brief
this spec is based on didn't mention this constant at all.

Breadcrumb: `Simulatie · Regelsimulatie` (rendered by the section itself via
`p.v2-crumb`, matching the existing V2 pattern — not a shell-level breadcrumb component).

### File structure

```
packages/frontend/src/components/CaseworkerDashboardV2/
  RegelSimulatie.tsx              — section component
  RegelSimulatie.test.tsx
  regelsimulatie/
    types.ts                      — SimConfig, SimResult, SimDaySnapshot, SimApp,
                                     SimEvent, and every other shape the engine produces
    simEngine.ts                  — pure engine, run(cfg): SimResult
    simEngine.test.ts
    SimChart.tsx                  — saw-tooth SVG chart
    SimMissedPanel.tsx            — "Geldige aanvragen die misliepen" (3-filter timeline)
    SimPot.tsx                    — one budget pot bar
    SimOutcomeRow.tsx             — one outcome bar row
    SimTweak.tsx                  — one parameter slider
packages/frontend/src/pages/caseworker-v2/
  regelsimulatie.css              — reference/shared/sim.css, unchanged content
```

A dedicated subfolder per section is new for `CaseworkerDashboardV2/` (everything else
there is flat) — justified by size: the engine alone is ~600 lines and the UI ~740,
larger than any existing V2 section.

### Files changed

1. **`modes.config.ts`** — `ModeId` union gains `'simulatie'`; `MODES` array gains the
   mode above, positioned after `zoeken`, before `beheer`; `SHELL_GLOBAL_SECTION_IDS`
   gains `'regelsimulatie'`. `modes.config.test.ts` updated: mode count, id list,
   `defaultSectionId`, and a new assertion that `regelsimulatie` is both `authRequired`
   and shell-global.
2. **`SectionRouter.tsx`** — one dispatch line, `if (sectionId === 'regelsimulatie')
return <RegelSimulatie />;`. The source brief suggested the "Public / shared library
   (no props)" block, which no longer fits now that the section is auth-required — but
   `RegelSimulatie` also takes no `user`/other props (unlike the "Beheer / projects
   (require user)" block's members, which all consume `user`), so neither existing
   block is a perfect categorical match. Place it as its own one-line block with a
   comment noting why (auth-required, but no props needed), rather than forcing it into
   either existing grouping.
3. **`pages/CaseworkerDashboardV2.tsx:55`** — add `import
'./caseworker-v2/regelsimulatie.css';` alongside the existing `dashboard-v2.css`
   import (confirmed exact line/pattern in the real file).
4. **`pages/changelog-data.ts`** — new entry once this ships, current format
   (`format: 'commits'`), scope `['frontend']`.

### Data flow

`simEngine.run(cfg: SimConfig): SimResult` is pure: no React, no `Date.now()`, no
`localStorage`, no network, deterministic via `mulberry32(cfg.seed)`. Dates at
day-resolution UTC, day 0 = 2026-01-12, through 2027-12-31 (`TOTAL_DAYS` computed from
that span). `RegelSimulatie.tsx` calls `run(cfg)` inside `useMemo` keyed on `cfg` only
(never on `day`) — dragging the timeline re-derives which day's already-computed snapshot
to show (`result.days[day]`), it never re-runs the simulation. This is the single most
important performance property of the design and must not regress.

State owned by `RegelSimulatie.tsx`: `cfg` (the 15 scenario parameters), `day` (current
playback position), `running`/`speed` (playback), `tweaksOpen` (panel collapse). `cfg` and
`day` persist to one `localStorage` key (`sim-thuisbatterij-v2`, debounced 200ms) and
restore on mount; "Reset" clears only that key and resets `day`/`running` (not `cfg` —
matching the reference's own `reset()`, which does not touch parameters).

`SimMissedPanel` owns its own local state (`selId`, `mode`) — which application is
selected and which of the three filters is active — independent of the parent's `day`,
matching the reference's `SimMissedTimeline`.

### Engine — porting approach and rule summary

Port `reference/preview/mock-sim-engine.jsx` to `simEngine.ts` **mechanically**: same
constants, same branches, same function shapes, typed, in this repo's TS/naming
conventions (e.g. `beslisRecht` → keep the Dutch name, since it mirrors the DMN rule
name directly, matching how `Rules and behaviour.md` and the rest of this codebase refer
to DMN concepts in Dutch). Do not restructure the algorithm — the reference is the
specification for exact behavior, verified only by `docs/Rules and behaviour.md`'s prose
description and the test list below, not by independently retyping the logic into this
document (same content-fidelity discipline as this session's other large-port features —
transcribing ~600 lines of stateful simulation logic by hand into a plan risks silent
bugs with no independent ground truth to catch them against).

Rule summary (normative detail lives in `docs/Rules and behaviour.md`; this is the
shape an implementer needs to know exists, not a restatement of the rules themselves):

- **Entitlement** — 5 rejection grounds checked in order, first match wins: bankrupt →
  outside Flevoland → neither owner nor renter → renter without owner's permission →
  name ≠ energy bill.
- **Amount** — 25% of subsidisable costs; < €750 → €0; otherwise capped at €1,250.
- **Budget year** = year of **submission**, not decision.
- **Ceiling** — per budget year, two €437,500 pots (eigenaren/huurders) that merge into
  one pool on 1 October of that budget year (measured against the request's budget year,
  not the calendar day of its decision): €875,000 merged in 2026, €1,000,000 + 2026's
  carry-over merged in 2027.
- **Allocation** — reserve on submission, all-or-nothing, first-come-first-served by
  **effective priority date** (submission date normally; the date information came back,
  for an RFI request), sealing with no back-fill once a pool is exhausted.
- **RFI (aanvullende info)** — a share of applications pause processing and have their
  effective priority date shifted to when the information arrives, which can push them
  behind later-submitted non-RFI applications for the same pool.
- **Appeal (bezwaar/beroep)** — an upheld appeal is honoured at its **original**
  priority, paid from the pool active on its appeal-decision day, and can displace an
  otherwise-payable application.
- **Two counterfactual re-runs** — the allocator (`makeResolver`/`resolve`, a separate
  pure function from `run`) executes three times total: the real world (with appeals),
  a world without appeals (isolates appeal-caused losses), and — per unpaid RFI
  application — a world where that one application's priority is its submission date
  instead of its info-received date (isolates RFI-caused losses).

### UI — porting approach

Port `reference/preview/mock-simulatie.jsx` to `RegelSimulatie.tsx` + the 6 sub-components
listed above, 1:1: same DOM structure, same `sim-*` class names (so `sim.css` applies
unchanged — ported as `regelsimulatie.css` with no content edits), same inline styles
where the reference uses them (mostly in `SimMissedPanel`'s timeline segments, which are
computed positions, not static styling — appropriate to keep inline rather than
extracting to CSS). Card order — left column: Budgetuitputting → Beschikbaar budget over
tijd → Geldige aanvragen die misliepen; right column: Uitkomsten → Aanvragen (feed) —
exactly as the brief and `00-header-en-tijdbalk.png`/`01-overzicht-volledige-run.png`
show. All labels Dutch, amounts `nl-NL` formatted, dates `d mmm 'yy`. No new colors —
every token comes from the existing `.cwd-v2` design tokens already in `dashboard-v2.css`.
No charting library — the saw-tooth chart is hand-rolled SVG, matching the reference.

Every interactive control: the timeline is a labelled `input[type=range]`, filter buttons
in `SimMissedPanel` are real `<button type="button">`s, every button in the file gets an
explicit `type="button"` (React's implicit default inside a form-less div is already
`"button"`, but the brief calls this out explicitly and the reference is inconsistent
about it in a few spots — worth being deliberate here rather than copying the gaps).

### Testing

**`simEngine.test.ts`** (vitest, existing conventions):

- Determinism: two runs with identical config produce a byte-for-byte identical
  `SimResult`; a different seed does not.
- Amount boundaries: costs €2,950 → €0, €3,000 → €750, €5,000 → €1,250, €9,000 → €1,250
  (cap holds above it too).
- Entitlement MC/DC: each of the 5 grounds independently triggers rejection; precedence
  confirmed (bankrupt + outside-province together → "failliet", the first-checked
  ground); renter-without-permission does not misfire for an owner.
- Ceiling: an application effective 30 Sep lands in the split pot, 1 Oct in the merged
  one; a Dec-2026-submitted / Jan-2027-decided application is paid from the **2026**
  budget; 2026→2027 carry-over equals 2026's actual unspent euros.
- Sealing: a reservation released after a pool seals does not revive a previously
  refused application in that pool.
- Priority: an RFI application whose effective (info-received) date is later loses to a
  later-submitted non-RFI application, in a pool that can pay exactly one of them.
- Counterfactuals: `missedDueToRFI` and `missedDueToBeroep` are both 0 when their
  respective chance parameters are 0; both > 0 under the default config; neither ever
  exceeds the total unpaid count.
- Bookkeeping invariant: for every simulated day, paid + reserved + free = ceiling (per
  pool), and every application resolves to exactly one final class.
- Performance: `run(defaultCfg)` (3,200 applications) completes in < 250ms on CI
  hardware — verified empirically as part of this task, not assumed; if it doesn't hold,
  flag it and propose a web worker rather than shipping a silent miss (per the source
  brief's own instruction).

**`RegelSimulatie.test.tsx`**: renders with no API calls (engine is pure, local data
only); all 5 cards present; the 3 `SimMissedPanel` filter buttons switch the selected
application set; dragging the timeline `input[type=range]` changes the displayed
day/snapshot without re-running the simulation (assert `run`/`useMemo` isn't
re-invoked — a spy on the engine's `run` export, called once per config change, not once
per day change); "Reset" restores day 0 and stops playback without touching `cfg`.

**`modes.config.test.ts`**: mode count, `ModeId` list, and `defaultSectionId` updated for
the new mode; new assertion that the `regelsimulatie` rail item is both `authRequired:
true` and present in `SHELL_GLOBAL_SECTION_IDS` (regression guard for the gap this spec
found — without it, the feature silently disappears for every real tenant).

## Out of scope

Per the source brief's own explicit scope: real data or API wiring, multiple schemes
side by side, exporting/saving scenarios, and editing the DMN rules from this screen.
`simEngine.run(cfg)` is deliberately a pure, swappable function so a second scheme can be
plugged in later without touching the UI shell.

## Open items carried into implementation (not blocking design approval)

- **Performance budget** (<250ms at 3,200 applications) — verified empirically during
  the engine task, per the brief's own instruction to flag rather than silently miss it.
- **Reference JSX inconsistencies, if any are found during the literal port** — e.g. a
  minor prose/code default mismatch already spotted (`design/screenshots/README.md`
  describes the default population as "3,200"; the actual `SIM_DEFAULTS.populatie`
  constant in `mock-simulatie.jsx` is `3150`) — the code constant governs, since it's
  the literal 1:1 port target and the prose is describing it approximately. Any other
  such mismatch found during implementation gets named and flagged, not silently
  resolved either way, per the source brief's own instruction.
