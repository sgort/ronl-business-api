# Design: Beheer — Faseladder overview (sub-project B)

## Problem

The Beheer page currently hardcodes RIP Fase 1: one "RIP Fase 1 starten"
button with no project picker, plus three fixed rail items. Nine
sub-processes now exist (R2.1…R5.2, catalogued in sub-project A). This spec
covers the read-only Faseladder overview — rail, KPIs, and the stage-grouped
table — the second of the six sub-projects the handoff was decomposed into
(see `docs/superpowers/specs/2026-08-10-rip-phase-catalogue-deployment-status-design.md`'s
"Decomposition" table). Sub-projects C/D (Starten / WIP / Gereed detail
tabs) build on top of this and are out of scope here.

## Handoff package is authoritative

Per standing project guidance, `docs/infra-beheer-handoff/` — especially its
`reference/` folder — is the single point of truth for this work, taking
precedence over any similar-looking file already in the app codebase. This
matters concretely for sub-project B: the mock-data design below lifts from
`reference/pb-data.reference.jsx` (42 projects + a working phase-spreading
mechanism), not from the app's own smaller, independently-authored
`infra-board.data.ts` dataset that predates this handoff.

## Scope

Both real (live Operaton) and mock data, shown **separately and clearly
labelled**, never blended — this is a transition period; mock data is
deleted phase-by-phase as each phase goes live, per the existing "Decision
1" in `ARCHITECTURE.md`. `packages/backend` (two additions to
`OperatonService`/`rip.routes.ts`) and `packages/frontend` (mock-data
expansion, live-data hooks, the new Faseladder overview page + rail
entries).

## Design

### 1. Backend — `OperatonService.getPhaseInstanceCounts`

New method in `operaton.service.ts`, alongside `getDeployedProcessKeys`:

```ts
/**
 * For each given process-definition key, the count of active (WIP) and
 * completed (Gereed) instances on this environment's Operaton instance.
 * Count-only queries — no instance payloads.
 */
async getPhaseInstanceCounts(
  keys: string[]
): Promise<Record<string, { wip: number; gereed: number }>> {
  const entries = await Promise.all(
    keys.map(async (key) => {
      const [wipRes, gereedRes] = await Promise.all([
        this.client.get('/process-instance/count', { params: { processDefinitionKey: key } }),
        this.client.get('/history/process-instance/count', {
          params: { processDefinitionKey: key, finished: true },
        }),
      ]);
      return [key, { wip: wipRes.data.count, gereed: gereedRes.data.count }] as const;
    })
  );
  return Object.fromEntries(entries);
}
```

Errors propagate like the other read-only queries (rethrow, logged
upstream by the route).

### 2. Backend — `GET /v1/rip/phases/counts`

New route in `rip.routes.ts`, same shape as sub-project A's
`/phases/deployment-status`: 401 unauthenticated, otherwise queries
`getDeployedProcessKeys` first (only deployed keys are worth counting —
skip the round trip for phases with no key or not deployed here), then
`getPhaseInstanceCounts` for that subset. Response:
`{ success: true, data: { counts: Record<processDefinitionKey, {wip, gereed}> } }`.
Phases with no entry in `counts` are implicitly `{wip: 0, gereed: 0}` —
the frontend fills the gap.

### 3. Frontend — live counts

`useLivePhaseCounts()` hook in `infra.api.ts`, same `useAsync` pattern as
`useDeployedProcessKeys`, calling a new `businessApi.rip.phasesCounts()` in
`api.ts` (same shape as `deploymentStatus()`). The backend only ever
returns `{wip, gereed}` per key (Operaton has no concept of `geparkeerd` —
that's a ladder-position derivation, not an engine fact); the consuming
component normalizes each entry to the frontend's `PhaseCounts` shape (§4)
by adding `geparkeerd: 0`, which is always correct for live data today
since nothing can reach R5.2 while only R2.1 is deployed.

### 4. Frontend — the Klaar (ready-to-start) formula

New file `packages/frontend/src/pages/infra-board/rip-phase-counts.ts`:

```ts
export interface PhaseCounts {
  wip: number;
  gereed: number;
  /** R5.2 only (beyond: true) — projects sitting there, tracked separately
   *  from wip per ARCHITECTURE.md's "never counts as WIP" rule. Always 0
   *  for every other phase; always 0 for live counts today (no phase past
   *  R2.1 is deployed, so nothing can reach R5.2 yet). */
  geparkeerd: number;
}

/**
 * klaar[N] = max(0, gereed[N-1] - wip[N] - gereed[N]) — projects that
 * finished the previous phase but haven't reached this one yet. R2.1 has no
 * predecessor on the ladder, so it never has a "klaar" queue (undefined —
 * render as "—", not 0; there's nothing to be ready *for*).
 */
export function getKlaarCounts(
  phases: RipPhase[], // from rip-phases.catalog.ts, in ladder order
  counts: Record<string, PhaseCounts>
): Record<string, number | undefined> {
  const out: Record<string, number | undefined> = {};
  phases.forEach((phase, i) => {
    if (i === 0) {
      out[phase.code] = undefined;
      return;
    }
    const prev = counts[phases[i - 1].code] ?? { wip: 0, gereed: 0, geparkeerd: 0 };
    const cur = counts[phase.code] ?? { wip: 0, gereed: 0, geparkeerd: 0 };
    out[phase.code] = Math.max(0, prev.gereed - cur.wip - cur.gereed);
  });
  return out;
}
```

Used identically for live counts and mock counts (same function, different
input) — this is the mechanism that keeps the two comparable and prevents
two disagreeing "ready" computations from ever existing.

### 5. Frontend — mock data (lifted from the handoff reference)

Extends `packages/frontend/src/pages/infra-board/infra-board.data.ts`
additively — nothing existing is removed or retargeted, so `Portfolio.tsx`
and everything else consuming `getMockPortfolio()`/`PortfolioProject.phase`
(the old 6-phase field) keeps working unchanged.

- `RAW` grows from 18 to the full 42 entries, copied verbatim from
  `reference/pb-data.reference.jsx`'s `RAW` (`23102`…`24188`).
- `LADDER_FROM_LEGACY`, `pbHash`, `pbLadderFor`, `pbAwaits` ported to
  TypeScript verbatim from the same reference file (new code, additive).
- Two new fields on `PortfolioProject`:
  - `ripPhaseCode: string` — `RIP_PHASES[pbLadderFor(nr, legacyPhase) - 1].code`
    (retargeted from the reference's bare 1–9 number onto sub-project A's
    actual `RIP_PHASES` catalogue codes).
  - `ripPhaseState: 'wip' | 'wachtend'` — from the reference's own
    `awaiting` logic: `phase > 1 && phase < 9 && pbAwaits(nr)` ⇒
    `'wachtend'`, else `'wip'`.
- `getMockPhaseCounts(): Record<string, PhaseCounts>` — for each of the 9
  `RIP_PHASES`, derives `{wip, gereed}` from all 42 mock projects' ladder
  position vs. that phase's ladder index, mirroring
  `reference/pb-instances.reference.jsx`'s status derivation: earlier ⇒
  counts toward `gereed`, exactly-at with state `'wip'` ⇒ counts toward
  `wip`, exactly-at with state `'wachtend'` ⇒ counts toward neither (it
  surfaces via `getKlaarCounts` instead), later ⇒ counts toward neither.
  R5.2 (`beyond: true`) is `geparkeerd` whenever a project has reached it —
  tracked in the same counts shape but reported as a **separate** `geparkeerd`
  field, never folded into `wip`, matching `ARCHITECTURE.md`'s "excluded
  from WIP" rule.

### 6. KPI semantics

Four KPIs, each computed once for mock and once for live, rendered
side-by-side and separately labelled:

| KPI                     | Meaning                                                        | Formula                                                                                                                                                            |
| ----------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Fasen in uitvoering     | count of _phases_ (out of 9) with ≥1 WIP project               | `RIP_PHASES.filter(p => counts[p.code]?.wip > 0).length`                                                                                                           |
| Deelprocessen inzetbaar | count of _phases_ (out of 9) that are deployed                 | `RIP_PHASES.filter(p => getPhaseDeployStatus(p, deployedKeys) === 'gedeployed').length` (sub-project A; not mock/live-split — deployment state isn't project data) |
| Klaar om te starten     | sum of `klaar[N]` over _deployed_ phases (actionable now)      | `sum(klaar[N] for N where deployed)`                                                                                                                               |
| Wacht op deployment     | sum of `klaar[N]` over _non-deployed_ phases (blocked backlog) | `sum(klaar[N] for N where !deployed)`                                                                                                                              |

### 7. UI

- `modes.config.ts`: replace the three hardcoded `rip-fase1*` rail items
  under "Projecten" with one entry per phase (grouped by stage, matching
  `RIP_STAGES`), each carrying a WIP count badge, plus "Faseladder" (the
  overview itself) and "Archief" (unchanged).
- New component `FaseladderOverview.tsx` in `InfraBoardDashboard/`: KPI row
  (§6) + table with a stage sub-header row per stage and one row per
  sub-process — deployment pill (`RIP_DEPLOY_META`, sub-project A), lead
  role, `phase.exit` (closing accorderingsmoment), and Klaar/WIP/Gereed as
  mock+live pairs (§4/§5).
- Wired into `InfraSectionRouter.tsx` under the `beheer` mode's new
  `faseladder` section id.
- Table rows are **not** clickable in this sub-project — "row click → phase
  detail" is sub-projects C/D's job. No dead-end affordance: rows simply
  render as static data, no hover/pointer cursor styling implying
  interactivity.

## Testing

- `operaton.service.test.ts` — `getPhaseInstanceCounts`: correct params on
  both calls per key, correct `{wip, gereed}` mapping, multiple keys in
  parallel, rethrows on failure.
- `rip.routes.test.ts` — `GET /phases/counts`: 200 with the counts keyed by
  deployed process key only, 401 unauthenticated, 500 on service failure.
- `rip-phase-counts.test.ts` (new) — `getKlaarCounts`: R2.1 always
  `undefined`; correct arithmetic for a hand-built counts fixture including
  the `max(0, …)` floor.
- `infra-board.data.test.ts` (extend existing, or new if none exists) —
  `getMockPortfolio()` still returns 42 rows with the old `phase` field
  intact; `ripPhaseCode`/`ripPhaseState` assigned to every project;
  `getMockPhaseCounts()` totals reconcile (every project counted exactly
  once across gereed/wip/wachtend/geparkeerd buckets for its own phase).
- `infra.api.test.ts` — `useLivePhaseCounts` hook, same pattern as
  `useDeployedProcessKeys`'s tests.
- `FaseladderOverview.test.tsx` (new) — renders 9 rows grouped by 4 stages,
  KPI row shows mock and live figures separately, deployment pill matches
  `RIP_DEPLOY_META`, rows are not clickable.

## Out of scope

- Row click → phase detail (Starten/WIP/Gereed tabs) — sub-projects C/D.
- Any change to `Portfolio.tsx`, `MijnDag`, or the project stepper actually
  rendering the 9-phase ladder — the rest of sub-project F, deferred. This
  spec only _adds_ `ripPhaseCode`/`ripPhaseState` fields; nothing consumes
  them outside the new Faseladder overview.
- Geparkeerd handling beyond what §5/§6 already needs — sub-project E covers
  any further nuance (e.g. a dedicated "geparkeerd" explanation view).
- Sequence guard / afwijkingsreden — sub-project C.
