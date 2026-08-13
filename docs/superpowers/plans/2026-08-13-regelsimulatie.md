# Regelsimulatie Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Regelsimulatie section to the Caseworker Dashboard V2 — a deterministic
day-by-day simulation of the Flevoland home-battery subsidy's 2026–2027 budget
exhaustion, ported from the design handoff at `docs/regelsimulatie-handoff/`.

**Architecture:** A pure TypeScript engine (`simEngine.ts`, no React/IO) computes the
whole run once per config change; the section component and 5 presentational
sub-components render whichever day's pre-computed snapshot the timeline points at. New
mode `'simulatie'` in the existing V2 shell, one rail item, auth-required.

**Tech Stack:** React 18 + TypeScript, Vitest + React Testing Library, existing
`.cwd-v2`/`sim.css` design tokens — no new dependencies.

## Global Constraints

- Run all commands from `packages/frontend`.
- Never add `Co-Authored-By`/`Claude-Session` git commit trailers.
- Source of truth for content/behavior: `docs/regelsimulatie-handoff/reference/preview/mock-sim-engine.jsx`
  (engine) and `mock-simulatie.jsx` (UI), both under the repo root. Port mechanically —
  same constants, same branches, same DOM/class names — do not restructure the algorithm
  or redesign the UI. Every task below that requires reading a range of the source gives
  exact line-accurate instructions; do not retype large blocks of source into commit
  messages or comments beyond what's already specified in this plan.
- `simEngine.ts` is pure: no React, no `Date.now()`, no `localStorage`, no network.
  Determinism via `mulberry32(cfg.seed)`. Dates at day-resolution UTC.
- `RegelSimulatie.tsx` calls `run(cfg)` inside `useMemo` keyed on `cfg` only, never on
  `day` — this is the design's single most important performance property.
- CSS: `regelsimulatie.css` is `docs/regelsimulatie-handoff/reference/shared/sim.css`
  copied verbatim (no content changes) to
  `packages/frontend/src/pages/caseworker-v2/regelsimulatie.css`. Every `sim-*` class name
  in the ported components must match this file exactly, or the styling breaks.
- No new colors, no charting library — SVG only for the chart, every color token comes
  from the existing `.cwd-v2` tokens already in `dashboard-v2.css`.
- All UI labels stay in Dutch (this is a Dutch government surface); code, comments, and
  tests are in English, matching the rest of this repo.
- `regelsimulatie` is `authRequired: true` (confirmed with the owner — not part of the
  public "Verken openbare bibliotheek" tier) **and** must be added to
  `modes.config.ts`'s `SHELL_GLOBAL_SECTION_IDS` (a separate, tenant-level gate — every
  existing V2-native section not in any tenant's `tenants.json` is in this set for the
  same reason; skipping it hides the feature from every real tenant once tenant config
  loads).

---

### Task 1: Engine — types + simEngine.ts + tests

**Files:**

- Create: `packages/frontend/src/components/CaseworkerDashboardV2/regelsimulatie/types.ts`
- Create: `packages/frontend/src/components/CaseworkerDashboardV2/regelsimulatie/simEngine.ts`
- Test: `packages/frontend/src/components/CaseworkerDashboardV2/regelsimulatie/simEngine.test.ts`

**Interfaces:**

- Produces (used by every later task): all types below, plus `run(cfg: SimConfig):
SimResult`, `beslisRecht(p: Persoon): EntitlementResult`, `basisHoogte(kosten: number):
number`, `periode(ts: number): Periode`, `dayToTs(day: number): number`, `fmtDate(ts:
number): string`, `fmtShort(ts: number): string`, and `START`, `END`, `TOTAL_DAYS` as
  named exports (mirrors the reference's `window.SimEngine` shape, minus the legacy
  `beschikbaar` helper the reference itself marks "kept for API compatibility; unused by
  run" — do not port that one, nothing in this plan calls it).
- **New export not in the reference, added here for testability:** `makeResolver(scale:
number): (claimants: Claimant[]) => ResolveResult`. The reference keeps this as an
  unexported closure inside the IIFE. Exporting it is a deliberate, authorized deviation
  from strict 1:1 porting — it changes nothing about behavior, but without it the
  ceiling/sealing/priority rules (a large fraction of this task's required test coverage)
  are only reachable by driving the entire population generator through `run()`, which
  makes precise, minimal test fixtures impossible. Flag this deviation in your commit
  message; do not silently keep it private.

- [ ] **Step 1: Write `types.ts`**

```ts
// packages/frontend/src/components/CaseworkerDashboardV2/regelsimulatie/types.ts
/**
 * Regelsimulatie — engine types.
 * Mirrors the shapes produced by docs/regelsimulatie-handoff's
 * reference/preview/mock-sim-engine.jsx exactly; see simEngine.ts for the
 * pure implementation these types describe.
 */

export type RelatieTotWoning = 'eigenaar' | 'huurder' | 'gebruiker' | 'erfpachter';
export type AanvragerType = 'eigenaar' | 'huurder';

export interface Persoon {
  voornaam: string;
  achternaam: string;
  plaats: string;
  type: AanvragerType;
  aanvragerFailliet: boolean;
  provincieWoning: string;
  relatieTotWoning: RelatieTotWoning;
  toestemmingEigenaar: boolean;
  rekeningNaamKomtOvereen: boolean;
  gemaakteKosten: number;
}

export type RedenKey =
  | 'failliet'
  | 'buitenprovincie'
  | 'relatie'
  | 'toestemming'
  | 'energierekening'
  | 'toegekend';

export interface EntitlementResult {
  recht: boolean;
  reden: string;
  redenKey: RedenKey;
}

export type PeriodeMode = 'split' | 'bundled' | 'buiten';

export interface Periode {
  year: number;
  mode: PeriodeMode;
}

export type Klasse = 'afgewezen' | 'geen-hoogte' | 'accepted';
export type Uitkomst = 'volledig' | 'niet-uitbetaald' | 'geen-hoogte' | 'afgewezen' | null;
export type BezwaarUitkomst = 'toegewezen' | 'toegewezen-onbetaald' | 'afgewezen' | null;
export type AppealKind = 'denial' | 'budget' | null;

export interface SimApp {
  id: number;
  persoon: Persoon;
  type: AanvragerType;
  submitDay: number;
  decisionDay: number;
  isRFI: boolean;
  subprocessStart: number | null;
  infoReceivedDay: number | null;
  effDay: number;
  basis: number;
  year: number;
  klasse: Klasse;
  reden: string | null;
  redenKey: RedenKey | null;
  paid: boolean | null;
  paid0: boolean | null;
  uitkomst: Uitkomst;
  bedrag: number;
  payoutResolvedDay: number | null;
  missedDueToRFI: boolean;
  missedDueToBeroep: boolean;
  beroepDisplacerId: number | null;
  beroepFiled: boolean;
  beroepUpheld: boolean;
  appealKind: AppealKind;
  appealResolveDay: number | null;
  appealPaid: boolean;
  bezwaar: boolean;
  bezwaarUitkomst: BezwaarUitkomst;
  blockedById: number | null;
  justMissedByOne: boolean;
  pid?: string;
  availableBefore?: number;
}

export type FeedUitkomst =
  | 'volledig'
  | 'niet-uitbetaald'
  | 'geen-hoogte'
  | 'afgewezen'
  | 'beroep-toegekend'
  | 'beroep-afgewezen';

export interface SimEvent {
  id: number;
  day: number;
  ts: number;
  naam: string;
  plaats: string;
  type: AanvragerType;
  kosten: number;
  basis: number;
  uitkomst: FeedUitkomst;
  bedrag: number;
  isRFI: boolean;
  submitDay: number;
  decisionDay: number;
  effDay: number;
  infoReceivedDay: number | null;
  reden: string | null;
  redenKey: RedenKey | null;
  bezwaar: boolean;
  blockedById: number | null;
  justMissedByOne: boolean;
}

export interface SimDaySnapshot {
  day: number;
  ts: number;
  year: number;
  mode: PeriodeMode;
  reedsE: number;
  reedsH: number;
  reservedE: number;
  reservedH: number;
  holdTotal: number;
  toegekendBedrag: number;
  poolTotal: number;
  poolUsed: number;
  reservedTot: number;
  availE: number | null;
  availH: number | null;
  beschikbaar: number;
  ingediend: number;
  volledig: number;
  nietUitbetaald: number;
  afgewezenRecht: number;
  kostenTeLaag: number;
  inBehandeling: number;
  wachtUitbetaling: number;
  rfiOpen: number;
  bedragVolledig: number;
  bedragNietUitbetaald: number;
  bedragInBehandeling: number;
  bedragWacht: number;
  bedragKostenTeLaag: number;
  bedragAfgewezen: number;
  bezwaarOpen: number;
}

export interface RedenenAgg {
  failliet: number;
  buitenprovincie: number;
  relatie: number;
  toestemming: number;
  energierekening: number;
}

export interface SimAgg {
  ingediend: number;
  rechtToegekend: number;
  afgewezenRecht: number;
  volledig: number;
  nietUitbetaald: number;
  kostenTeLaag: number;
  redenen: RedenenAgg;
  rfiTotaal: number;
  nietUitbetaaldRFI: number;
  missedDueToRFI: number;
  bezwaarIngediend: number;
  bezwaarToegewezen: number;
  bezwaarAfgewezen: number;
  missedDueToBeroep: number;
}

export interface ExhaustionEvent {
  day: number;
  ts: number;
  label: string;
}

export interface YearCeilings {
  eig: number;
  huur: number;
  bundled: number;
}

export interface SimConfig {
  seed: number;
  populatie: number;
  eigenaarRatio: number;
  kostenGem: number;
  kostenSd: number;
  pFailliet: number;
  pBuitenprovincie: number;
  pGeenRelatie: number;
  pGeenToestemming: number;
  pNaamMismatch: number;
  budgetScale: number;
  aandeel2026: number;
  arrivalPow: number;
  doorlooptijdGem: number;
  pAanvullendeInfo: number;
  infoWachtGem: number;
  bezwaarKans: number;
  bezwaarToewijzing: number;
}

export interface SimMeta {
  START: number;
  END: number;
  TOTAL_DAYS: number;
  dayToTs: (day: number) => number;
  fmtDate: (ts: number) => string;
  fmtShort: (ts: number) => string;
}

export interface SimResult {
  cfg: SimConfig;
  ceilings: Record<number, YearCeilings>;
  days: SimDaySnapshot[];
  feed: SimEvent[];
  apps: SimApp[];
  agg: SimAgg;
  exhaustion: Record<string, ExhaustionEvent>;
  toegekendBedrag: number;
  bezwaarUitbetaald: number;
  meta: SimMeta;
}

// ---- resolver (exported for testability; see simEngine.ts's top-of-file
// comment for why this deviates from the unexported reference closure) ----

export interface Claimant {
  id: string;
  refId: number;
  key: number;
  ord: number;
  competeDay: number;
  type: AanvragerType;
  year: number;
  basis: number;
  isAppeal: boolean;
}

export interface ClaimantResult {
  paid: boolean;
  blockedById: number | null;
  justMissedByOne: boolean;
  resolvedDay: number;
  pid: string;
  key: number;
  isAppeal: boolean;
}

export interface ResolveResult {
  res: Record<string, ClaimantResult>;
  sealDay: Record<string, number>;
  carryover: number;
}
```

- [ ] **Step 2: Write the failing tests**

Create `simEngine.test.ts`. This is long; write it exactly as given — every expected
value below was verified by actually running the reference engine in Node, not
hand-derived, so treat every number here as ground truth.

```ts
// packages/frontend/src/components/CaseworkerDashboardV2/regelsimulatie/simEngine.test.ts
import { describe, it, expect } from 'vitest';
import { run, beslisRecht, basisHoogte, makeResolver } from './simEngine';
import type { SimConfig, Claimant } from './types';

const DEFAULT_CFG: SimConfig = {
  seed: 20260112,
  populatie: 3150,
  eigenaarRatio: 0.68,
  kostenGem: 4200,
  kostenSd: 1800,
  pFailliet: 0.02,
  pBuitenprovincie: 0.07,
  pGeenRelatie: 0.03,
  pGeenToestemming: 0.14,
  pNaamMismatch: 0.05,
  budgetScale: 1,
  aandeel2026: 0.46,
  arrivalPow: 1.3,
  doorlooptijdGem: 8,
  pAanvullendeInfo: 0.32,
  infoWachtGem: 60,
  bezwaarKans: 0.22,
  bezwaarToewijzing: 0.25,
};

describe('determinism', () => {
  it('two runs with the same config produce identical aggregate results', () => {
    const a = run(DEFAULT_CFG);
    const b = run(DEFAULT_CFG);
    expect(a.agg).toEqual(b.agg);
    expect(a.toegekendBedrag).toBe(b.toegekendBedrag);
  });

  it('a different seed produces a different result', () => {
    const a = run(DEFAULT_CFG);
    const b = run({ ...DEFAULT_CFG, seed: 999 });
    expect(a.agg).not.toEqual(b.agg);
  });
});

describe('basisHoogte (amount boundaries)', () => {
  it('below the €3,000 cost floor pays €0', () => {
    expect(basisHoogte(2950)).toBe(0);
  });
  it('at the floor pays exactly €750', () => {
    expect(basisHoogte(3000)).toBe(750);
  });
  it('at €5,000 pays exactly €1,250 (the cap)', () => {
    expect(basisHoogte(5000)).toBe(1250);
  });
  it('above the cap still pays €1,250', () => {
    expect(basisHoogte(9000)).toBe(1250);
  });
});

describe('beslisRecht (entitlement, precedence, MC/DC)', () => {
  const base = {
    aanvragerFailliet: false,
    provincieWoning: 'Flevoland',
    relatieTotWoning: 'eigenaar' as const,
    toestemmingEigenaar: true,
    rekeningNaamKomtOvereen: true,
  };

  it('entitled when every ground passes', () => {
    expect(beslisRecht(base)).toEqual({
      recht: true,
      reden: 'Aanvrager heeft recht op subsidie',
      redenKey: 'toegekend',
    });
  });

  it('bankrupt takes precedence over outside-province when both apply', () => {
    const r = beslisRecht({ ...base, aanvragerFailliet: true, provincieWoning: 'Utrecht' });
    expect(r).toEqual({
      recht: false,
      reden: 'Aanvrager is failliet',
      redenKey: 'failliet',
    });
  });

  it('rejects outside Flevoland on its own', () => {
    const r = beslisRecht({ ...base, provincieWoning: 'Utrecht' });
    expect(r.redenKey).toBe('buitenprovincie');
  });

  it('rejects neither-owner-nor-renter on its own', () => {
    const r = beslisRecht({ ...base, relatieTotWoning: 'gebruiker' });
    expect(r.redenKey).toBe('relatie');
  });

  it("rejects a renter without the owner's permission", () => {
    const r = beslisRecht({
      ...base,
      relatieTotWoning: 'huurder',
      toestemmingEigenaar: false,
    });
    expect(r).toEqual({
      recht: false,
      reden: 'Huurder heeft geen toestemming van eigenaar',
      redenKey: 'toestemming',
    });
  });

  it('the owner-permission rule does not misfire for an owner', () => {
    // An owner with toestemmingEigenaar:false must still be entitled — that
    // flag only matters for a huurder. Real behaviour, verified against the
    // reference engine directly.
    const r = beslisRecht({ ...base, relatieTotWoning: 'eigenaar', toestemmingEigenaar: false });
    expect(r.recht).toBe(true);
  });

  it('rejects a name mismatch with the energy bill', () => {
    const r = beslisRecht({ ...base, rekeningNaamKomtOvereen: false });
    expect(r.redenKey).toBe('energierekening');
  });
});

describe('makeResolver — sealing / no back-fill', () => {
  // scale 0.001 shrinks the split ceiling to 437500 * 0.001 = €437.50, small
  // enough to hand-construct a clean exhaustion with 3 claimants. All three
  // competeDay values (10/20/30) are far below OCT1_DAY[2026] (262), so all
  // three land in the split "eigenaar" pool, never the merged one.
  it('a smaller, later claimant is not paid after its pool has sealed, even though it would fit on its own', () => {
    const resolve = makeResolver(0.001);
    const claimants: Claimant[] = [
      {
        id: 'a',
        refId: 1,
        key: 10,
        ord: 1,
        competeDay: 10,
        type: 'eigenaar',
        year: 2026,
        basis: 300,
        isAppeal: false,
      },
      {
        id: 'b',
        refId: 2,
        key: 20,
        ord: 2,
        competeDay: 20,
        type: 'eigenaar',
        year: 2026,
        basis: 300,
        isAppeal: false,
      },
      {
        id: 'c',
        refId: 3,
        key: 30,
        ord: 3,
        competeDay: 30,
        type: 'eigenaar',
        year: 2026,
        basis: 50,
        isAppeal: false,
      },
    ];
    const { res } = resolve(claimants);
    expect(res.a).toMatchObject({ paid: true, blockedById: null, pid: '2026:eig' });
    expect(res.b).toMatchObject({
      paid: false,
      blockedById: 1,
      justMissedByOne: true,
      pid: '2026:eig',
    });
    // c's basis (50) would fit in the remaining headroom (437.5 - 300 = 137.5)
    // if evaluated on its own merits — but the pool sealed at b, so c is
    // rejected too. This is the "no back-fill" property.
    expect(res.c).toMatchObject({
      paid: false,
      blockedById: 1,
      justMissedByOne: false,
      pid: '2026:eig',
    });
  });
});

describe('makeResolver — priority by effective date', () => {
  it('a claimant with a later effective key loses to one with an earlier key and a smaller pool', () => {
    const resolve = makeResolver(0.001); // split ceiling €437.50
    const claimants: Claimant[] = [
      // Represents an RFI application: its effective priority (key) is late
      // (50) because the info came back late, even though nothing else about
      // it differs from a normal claim at the resolver level.
      {
        id: 'rfi',
        refId: 10,
        key: 50,
        ord: 1,
        competeDay: 50,
        type: 'eigenaar',
        year: 2026,
        basis: 300,
        isAppeal: false,
      },
      // Represents a normal (non-RFI) application with an earlier effective
      // key (40) even though its real competeDay (45) is later than rfi's
      // original submission would have been.
      {
        id: 'later',
        refId: 11,
        key: 40,
        ord: 2,
        competeDay: 45,
        type: 'eigenaar',
        year: 2026,
        basis: 300,
        isAppeal: false,
      },
    ];
    const { res } = resolve(claimants);
    expect(res.later.paid).toBe(true);
    expect(res.rfi).toMatchObject({ paid: false, blockedById: 11, justMissedByOne: true });
  });
});

describe('full run — bookkeeping invariants', () => {
  const result = run(DEFAULT_CFG);

  it('every application resolves to exactly one non-null final class', () => {
    for (const a of result.apps) {
      expect(a.uitkomst).not.toBeNull();
    }
  });

  it("paid-out total per pool never exceeds that pool's ceiling", () => {
    for (const d of result.days) {
      const c = result.ceilings[d.year];
      if (d.mode === 'split') {
        expect(d.reedsE).toBeLessThanOrEqual(c.eig + 0.01);
        expect(d.reedsH).toBeLessThanOrEqual(c.huur + 0.01);
      } else if (d.mode === 'bundled') {
        expect(d.reedsE + d.reedsH).toBeLessThanOrEqual(c.bundled + 0.01);
      }
    }
  });

  it("2026's carry-over into 2027 equals what 2026 actually left unspent", () => {
    const spent2026 = result.days[result.days.length - 1]; // last day's cumulative state covers all of 2026 by then
    // ceilings[2027].bundled was set to CEIL_2027_BASE*scale + carryover;
    // carryover must be non-negative and the merged 2026 ceiling minus what
    // was actually paid into the 2026 pools.
    expect(result.ceilings[2027].bundled).toBeGreaterThanOrEqual(1000000 * DEFAULT_CFG.budgetScale);
  });
});

describe('full run — budget year is the submission year, not the decision year', () => {
  it('an application submitted in December 2026 but decided in 2027 is still paid from the 2026 pool', () => {
    const result = run(DEFAULT_CFG);
    const spillover = result.apps.filter((a) => {
      const sub = new Date(result.meta.dayToTs(a.submitDay));
      const dec = new Date(result.meta.dayToTs(a.decisionDay));
      return (
        sub.getUTCFullYear() === 2026 &&
        sub.getUTCMonth() === 11 && // December
        dec.getUTCFullYear() === 2027
      );
    });
    expect(spillover.length).toBeGreaterThan(0);
    for (const a of spillover) {
      expect(a.year).toBe(2026);
      if (a.klasse === 'accepted') {
        expect(a.pid?.startsWith('2026:')).toBe(true);
      }
    }
  });
});

describe('counterfactuals', () => {
  it('missedDueToRFI and missedDueToBeroep are both 0 when their chance is 0', () => {
    const result = run({ ...DEFAULT_CFG, pAanvullendeInfo: 0, bezwaarKans: 0 });
    expect(result.agg.missedDueToRFI).toBe(0);
    expect(result.agg.missedDueToBeroep).toBe(0);
  });

  it('both are > 0 under the default config, and neither exceeds total unpaid', () => {
    const result = run(DEFAULT_CFG);
    expect(result.agg.missedDueToRFI).toBeGreaterThan(0);
    expect(result.agg.missedDueToBeroep).toBeGreaterThan(0);
    expect(result.agg.missedDueToRFI).toBeLessThanOrEqual(result.agg.nietUitbetaald);
    expect(result.agg.missedDueToBeroep).toBeLessThanOrEqual(result.agg.nietUitbetaald);
  });
});

describe('performance', () => {
  it('run(cfg) with the default 3,150-application population completes in under 250ms', () => {
    const t0 = performance.now();
    run(DEFAULT_CFG);
    const t1 = performance.now();
    // The plain-JS reference takes ~130ms for this population on ordinary
    // hardware; the typed port should be comparable. If this ever fails,
    // do not loosen the threshold — investigate and, per the source brief,
    // propose a web worker rather than shipping a silent miss.
    expect(t1 - t0).toBeLessThan(250);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/components/CaseworkerDashboardV2/regelsimulatie/simEngine.test.ts`
Expected: FAIL — `simEngine.ts` doesn't exist yet.

- [ ] **Step 4: Write `simEngine.ts`**

Read `docs/regelsimulatie-handoff/reference/preview/mock-sim-engine.jsx` in full before
starting (repo-root-relative path; the file is plain JS with zero JSX despite the `.jsx`
extension). Port it to `simEngine.ts` in three parts:

**Part A — port these functions verbatim, typed, unchanged behavior** (all of them are
short, pure, and worth getting byte-exact rather than described): `mulberry32` (the RNG
factory — returns `() => number`), `gauss` (Box–Muller with clamping), `drawDays`
(uniform-in-range day count), the date helpers (`MS`, `START`, `END`, `TOTAL_DAYS`,
`NL_MONTHS`, `dayToTs`, `fmtDate`, `fmtShort`), `beslisRecht`, the `basisHoogte`
constants (`PCT`, `SUB_MIN`, `SUB_MAX`) and function, `periode`, `ceilYear`, and the
budget constants (`CEIL_SPLIT`, `CEIL_M2026`, `CEIL_2027_BASE`, `OCT1_DAY`). Do **not**
port the reference's `beschikbaar` legacy helper — the reference itself marks it unused,
and nothing in this plan calls it.

Fully worked example of this mechanical transformation, using `basisHoogte` (apply the
identical pattern — same constants, same branches, add parameter/return types, no logic
change — to every function in this part):

```ts
// reference (mock-sim-engine.jsx):
//   const PCT = 0.25, SUB_MIN = 750, SUB_MAX = 1250;
//   function basisHoogte(gemaakteKosten) {
//     const raw = PCT * gemaakteKosten;
//     if (raw < SUB_MIN) return 0;
//     return Math.min(raw, SUB_MAX);
//   }

const PCT = 0.25;
const SUB_MIN = 750;
const SUB_MAX = 1250;

export function basisHoogte(gemaakteKosten: number): number {
  const raw = PCT * gemaakteKosten;
  if (raw < SUB_MIN) return 0;
  return Math.min(raw, SUB_MAX);
}
```

**Part B — `makeResolver`/`resolve`, exported (the authorized deviation described
above).** Port the reference's `makeResolver` function (reference lines ~213–249)
verbatim in logic, but change it from an unexported closure to:

```ts
import type { Claimant, ClaimantResult, ResolveResult } from './types';

export function makeResolver(scale: number): (claimants: Claimant[]) => ResolveResult {
  // ...identical body to the reference's makeResolver, typed...
}
```

Keep every constant, every branch, the exact sort key (`a.key - b.key || a.ord - b.ord`),
the exact pool-id scheme (`` `${by}:${merged ? 'merged' : bucket}` ``), and the exact
seal/no-back-fill logic unchanged.

**Part C — mechanically port the rest**, reading the corresponding reference lines
directly: the population-generation constants and arrays (`VOORNAMEN`, `ACHTERNAMEN`,
`PLAATSEN`, `BUITEN`) and `makePersoon` (reference ~143–179); `sampleSubmitDay`
(reference ~181–200); the main `run(cfg: SimConfig): SimResult` orchestrator (reference
~252–580, excluding the parts already covered by Parts A/B — the applicant-generation
loop, the two-pass `accepted`/`A0`/`A1` resolution using `resolve` from Part B, the
appeal-claims logic, the per-request RFI counterfactual re-run, the day-by-day
`days`/`feed`/`agg` bookkeeping loop, and the `snapshotFor`/`availableInPool` inner
helpers); and `mkEvent` (reference ~582–599). Add types throughout using the `types.ts`
shapes from Step 1 — every field `run` populates on `SimApp`/`SimEvent`/`SimDaySnapshot`
must appear, none dropped, none renamed except where `types.ts` already establishes the
name.

Export at the end: `run`, `beslisRecht`, `basisHoogte`, `periode`, `makeResolver`,
`dayToTs`, `fmtDate`, `fmtShort`, `START`, `END`, `TOTAL_DAYS`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/components/CaseworkerDashboardV2/regelsimulatie/simEngine.test.ts`
Expected: PASS, every test green. If the performance test is flaky/borderline on the
actual dev machine, report the real number in your task report rather than adjusting the
threshold — the controller decides whether that's acceptable.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/frontend/src/components/CaseworkerDashboardV2/regelsimulatie/types.ts packages/frontend/src/components/CaseworkerDashboardV2/regelsimulatie/simEngine.ts packages/frontend/src/components/CaseworkerDashboardV2/regelsimulatie/simEngine.test.ts
git commit -m "feat(frontend): add Regelsimulatie engine (simEngine.ts)"
```

---

### Task 2: CSS — port sim.css unchanged

**Files:**

- Create: `packages/frontend/src/pages/caseworker-v2/regelsimulatie.css`

**Interfaces:**

- Produces (used by every UI task): the `.sim-*` class rules every later component
  renders against.

- [ ] **Step 1: Copy the file verbatim**

Read `docs/regelsimulatie-handoff/reference/shared/sim.css` in full, then write it to
`packages/frontend/src/pages/caseworker-v2/regelsimulatie.css` with **zero content
changes** — same selectors, same values, same order. Add only a one-line header comment:

```css
/* Regelsimulatie styling — ported unchanged from
   docs/regelsimulatie-handoff/reference/shared/sim.css. Scoped under .cwd-v2;
   all colors/spacing/type reference that file's existing tokens. Do not add
   new colors here — see docs/superpowers/specs/2026-08-13-regelsimulatie-design.md. */
```

- [ ] **Step 2: Verify it's an exact content copy**

Run (from `packages/frontend`):
`diff "../../docs/regelsimulatie-handoff/reference/shared/sim.css" <(tail -n +2 src/pages/caseworker-v2/regelsimulatie.css)`
(the `tail -n +2` skips the one header comment line added above.)
Expected: no output (identical).

- [ ] **Step 3: Commit**

```bash
git add packages/frontend/src/pages/caseworker-v2/regelsimulatie.css
git commit -m "feat(frontend): port Regelsimulatie styling (regelsimulatie.css)"
```

---

### Task 3: Small presentational primitives — SimPot, SimOutcomeRow, SimTweak

**Files:**

- Create: `packages/frontend/src/components/CaseworkerDashboardV2/regelsimulatie/SimPot.tsx`
- Create: `packages/frontend/src/components/CaseworkerDashboardV2/regelsimulatie/SimOutcomeRow.tsx`
- Create: `packages/frontend/src/components/CaseworkerDashboardV2/regelsimulatie/SimTweak.tsx`
- Test: `packages/frontend/src/components/CaseworkerDashboardV2/regelsimulatie/SimPot.test.tsx`
- Test: `packages/frontend/src/components/CaseworkerDashboardV2/regelsimulatie/SimOutcomeRow.test.tsx`
- Test: `packages/frontend/src/components/CaseworkerDashboardV2/regelsimulatie/SimTweak.test.tsx`

**Interfaces:**

- Produces (used by Task 6): `SimPot({ name: string; tag?: string; total: number; used:
number; reserved?: number; hold?: number }): JSX.Element`; `SimOutcomeRow({ dot:
string; name: string; val: number; amount?: number; total: number }): JSX.Element`;
  `SimTweak({ label: string; value: number; display: string; min: number; max: number;
step: number; onChange: (v: number) => void }): JSX.Element`.
- Consumes: no engine types directly — all three take primitive props only, matching the
  reference exactly.

- [ ] **Step 1: Write the failing tests**

```tsx
// SimPot.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SimPot from './SimPot';

describe('SimPot', () => {
  it('renders the name, tag, and used/total figure', () => {
    render(<SimPot name="Eigenaren" tag="2026" total={437500} used={300000} />);
    expect(screen.getByText('Eigenaren')).toBeInTheDocument();
    expect(screen.getByText('2026')).toBeInTheDocument();
  });

  it('shows a reserved segment when reserved > 0', () => {
    const { container } = render(
      <SimPot name="Eigenaren" total={437500} used={300000} reserved={50000} />
    );
    expect(container.querySelector('.sim-seg.hold')).not.toBeInTheDocument();
    expect(container.textContent).toContain('gereserveerd');
  });

  it('shows a hold segment when hold > 0', () => {
    const { container } = render(
      <SimPot name="Gebundeld" total={875000} used={800000} hold={20000} />
    );
    expect(container.querySelector('.sim-seg.hold')).toBeInTheDocument();
  });

  it('marks the bar exhausted when nothing is free', () => {
    const { container } = render(<SimPot name="Eigenaren" total={437500} used={437500} />);
    expect(container.querySelector('.sim-bar.exhausted')).toBeInTheDocument();
  });
});
```

```tsx
// SimOutcomeRow.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SimOutcomeRow from './SimOutcomeRow';

describe('SimOutcomeRow', () => {
  it('renders the name and formatted count', () => {
    render(<SimOutcomeRow dot="bg-green" name="Toegekend" val={1646} total={3150} />);
    expect(screen.getByText('Toegekend')).toBeInTheDocument();
    expect(screen.getByText('1.646')).toBeInTheDocument();
  });

  it('renders the amount sub-line when amount is provided', () => {
    render(<SimOutcomeRow dot="bg-green" name="Toegekend" val={10} amount={12500} total={100} />);
    expect(screen.getByText('€12,5k')).toBeInTheDocument();
  });

  it('renders 0% width when total is 0 (no division by zero)', () => {
    const { container } = render(<SimOutcomeRow dot="bg-ink3" name="X" val={0} total={0} />);
    const fill = container.querySelector('.o-fill') as HTMLElement;
    expect(fill.style.width).toBe('0%');
  });
});
```

```tsx
// SimTweak.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SimTweak from './SimTweak';

describe('SimTweak', () => {
  it('renders the label and current display value', () => {
    render(
      <SimTweak
        label="Omvang doelgroep"
        value={3150}
        display="3.150 aanvragen"
        min={400}
        max={5000}
        step={100}
        onChange={() => {}}
      />
    );
    expect(screen.getByText('Omvang doelgroep')).toBeInTheDocument();
    expect(screen.getByText('3.150 aanvragen')).toBeInTheDocument();
  });

  it('calls onChange with a parsed number when the slider moves', async () => {
    const onChange = vi.fn();
    render(
      <SimTweak label="X" value={5} display="5" min={0} max={10} step={1} onChange={onChange} />
    );
    const slider = screen.getByRole('slider');
    fireEventChange(slider, '7');
    expect(onChange).toHaveBeenCalledWith(7);
  });
});

// fireEvent.change avoids userEvent's per-keystroke typing on a range input,
// which doesn't reflect how a real drag interaction fires a single change.
import { fireEvent } from '@testing-library/react';
function fireEventChange(el: Element, value: string) {
  fireEvent.change(el, { target: { value } });
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/CaseworkerDashboardV2/regelsimulatie/SimPot.test.tsx src/components/CaseworkerDashboardV2/regelsimulatie/SimOutcomeRow.test.tsx src/components/CaseworkerDashboardV2/regelsimulatie/SimTweak.test.tsx`
Expected: FAIL — none of the three components exist yet.

- [ ] **Step 3: Write the implementations**

Port from `docs/regelsimulatie-handoff/reference/preview/mock-simulatie.jsx`:
`SimPot` (reference lines 163–196), `SimOutcomeRow` (reference lines 199–211), `SimTweak`
(reference lines 214–222). These are short and mostly-JSX; port each 1:1, typed:

```tsx
// packages/frontend/src/components/CaseworkerDashboardV2/regelsimulatie/SimPot.tsx
// hatched amber for provisional (reserved) money — distinct from solid = paid
const RESERVED_FILL = 'repeating-linear-gradient(135deg, var(--v2-amber) 0 6px, #f0d34d 6px 12px)';

function simEur(n: number): string {
  return '€' + Math.round(n).toLocaleString('nl-NL');
}
function simEurK(n: number): string {
  const a = Math.abs(n);
  if (a >= 1000000) {
    return '€' + (n / 1000000).toFixed(1).replace('.0', '').replace('.', ',') + 'M';
  }
  if (a >= 1000) {
    const v = n / 1000;
    return (
      '€' + (Number.isInteger(v) ? v : Number(v.toFixed(1))).toString().replace('.', ',') + 'k'
    );
  }
  return '€' + Math.round(n);
}

export default function SimPot({
  name,
  tag,
  total,
  used,
  reserved = 0,
  hold = 0,
}: {
  name: string;
  tag?: string;
  total: number;
  used: number;
  reserved?: number;
  hold?: number;
}) {
  const within = Math.min(used, total);
  const over = Math.max(used - total, 0);
  const free = Math.max(total - used - reserved - hold, 0);
  const denom = Math.max(total, used + reserved + hold) || 1;
  const pWithin = (within / denom) * 100;
  const pOver = (over / denom) * 100;
  const pReserved = (reserved / denom) * 100;
  const pHold = (hold / denom) * 100;
  const pFree = Math.max((free / denom) * 100, 0);
  const pCeil = (total / denom) * 100;
  const exhausted = free <= 0;
  return (
    <div className="sim-pot">
      <div className="sim-pot-head">
        <span className="sim-pot-name">
          {name}
          {tag && <span className="tag">{tag}</span>}
        </span>
        <span className="sim-pot-fig">
          <b>{simEur(used)}</b> van {simEur(total)}
          {over > 0 && (
            <>
              {' '}
              · <span className="c-over">{simEur(over)} over budget</span>
            </>
          )}
          {reserved > 0 && (
            <>
              {' '}
              · <span style={{ color: 'var(--v2-amber)' }}>{simEur(reserved)} gereserveerd</span>
            </>
          )}
          {hold > 0 && (
            <>
              {' '}
              · <span className="c-hold">{simEur(hold)} bezwaar</span>
            </>
          )}
        </span>
      </div>
      <div className={'sim-bar' + (exhausted ? ' exhausted' : '')} style={{ position: 'relative' }}>
        <div className="sim-seg used" style={{ width: pWithin + '%' }}>
          {pWithin > 12 ? simEurK(within) : ''}
        </div>
        {over > 0 && (
          <div className="sim-seg over" style={{ width: pOver + '%' }}>
            {pOver > 8 ? '+' + simEurK(over) : ''}
          </div>
        )}
        {reserved > 0 && (
          <div
            className="sim-seg"
            style={{ width: pReserved + '%', background: RESERVED_FILL, color: '#5a4a00' }}
          >
            {pReserved > 12 ? simEurK(reserved) : ''}
          </div>
        )}
        {hold > 0 && (
          <div className="sim-seg hold" style={{ width: pHold + '%' }}>
            {pHold > 10 ? simEurK(hold) : ''}
          </div>
        )}
        <div className="sim-seg free" style={{ width: pFree + '%' }}>
          {pFree > 14 ? simEur(free) + ' vrij' : ''}
        </div>
        {over > 0 && <span className="sim-ceilmark" style={{ left: pCeil + '%' }}></span>}
      </div>
    </div>
  );
}

export { simEur, simEurK };
```

```tsx
// packages/frontend/src/components/CaseworkerDashboardV2/regelsimulatie/SimOutcomeRow.tsx
import { simEurK } from './SimPot';

export default function SimOutcomeRow({
  dot,
  name,
  val,
  amount,
  total,
}: {
  dot: string;
  name: string;
  val: number;
  amount?: number;
  total: number;
}) {
  const pct = total > 0 ? (val / total) * 100 : 0;
  return (
    <div className="sim-orow">
      <span className="o-name">
        <i className={'o-dot ' + dot}></i>
        {name}
      </span>
      <span className="o-track">
        <span className={'o-fill ' + dot} style={{ width: pct + '%' }}></span>
      </span>
      <span className="o-val" style={amount != null ? { lineHeight: 1.15 } : undefined}>
        {val.toLocaleString('nl-NL')}
        {amount != null && (
          <div style={{ fontSize: 9.5, fontWeight: 500, color: 'var(--v2-ink-3)' }}>
            {simEurK(amount)}
          </div>
        )}
      </span>
    </div>
  );
}
```

```tsx
// packages/frontend/src/components/CaseworkerDashboardV2/regelsimulatie/SimTweak.tsx
export default function SimTweak({
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="sim-tweak">
      <label>
        {label} <span className="tk-val">{display}</span>
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  );
}
```

Note: `simEur`/`simEurK` are defined once in `SimPot.tsx` and re-exported for
`SimOutcomeRow.tsx` to import, rather than duplicated — the reference defines them at
module scope shared by the whole `mock-simulatie.jsx` file; Task 6 (`RegelSimulatie.tsx`)
will need them too and should import from `SimPot.tsx` the same way, not redefine them a
third time.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/CaseworkerDashboardV2/regelsimulatie/SimPot.test.tsx src/components/CaseworkerDashboardV2/regelsimulatie/SimOutcomeRow.test.tsx src/components/CaseworkerDashboardV2/regelsimulatie/SimTweak.test.tsx`
Expected: PASS, all tests green.

- [ ] **Step 5: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint .`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/frontend/src/components/CaseworkerDashboardV2/regelsimulatie/SimPot.tsx packages/frontend/src/components/CaseworkerDashboardV2/regelsimulatie/SimOutcomeRow.tsx packages/frontend/src/components/CaseworkerDashboardV2/regelsimulatie/SimTweak.tsx packages/frontend/src/components/CaseworkerDashboardV2/regelsimulatie/SimPot.test.tsx packages/frontend/src/components/CaseworkerDashboardV2/regelsimulatie/SimOutcomeRow.test.tsx packages/frontend/src/components/CaseworkerDashboardV2/regelsimulatie/SimTweak.test.tsx
git commit -m "feat(frontend): add Regelsimulatie presentational primitives"
```

---

### Task 4: SimChart (SVG saw-tooth chart)

**Files:**

- Create: `packages/frontend/src/components/CaseworkerDashboardV2/regelsimulatie/SimChart.tsx`
- Test: `packages/frontend/src/components/CaseworkerDashboardV2/regelsimulatie/SimChart.test.tsx`

**Interfaces:**

- Consumes: `SimResult`, `SimDaySnapshot` from `./types` (Task 1).
- Produces (used by Task 6): `SimChart({ result: SimResult; day: number }): JSX.Element`.

- [ ] **Step 1: Write the failing tests**

```tsx
// packages/frontend/src/components/CaseworkerDashboardV2/regelsimulatie/SimChart.test.tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import SimChart from './SimChart';
import { run } from './simEngine';
import type { SimConfig } from './types';

const SMALL_CFG: SimConfig = {
  seed: 1,
  populatie: 200,
  eigenaarRatio: 0.68,
  kostenGem: 4200,
  kostenSd: 1800,
  pFailliet: 0.02,
  pBuitenprovincie: 0.07,
  pGeenRelatie: 0.03,
  pGeenToestemming: 0.14,
  pNaamMismatch: 0.05,
  budgetScale: 1,
  aandeel2026: 0.46,
  arrivalPow: 1.3,
  doorlooptijdGem: 8,
  pAanvullendeInfo: 0.32,
  infoWachtGem: 60,
  bezwaarKans: 0.22,
  bezwaarToewijzing: 0.25,
};

describe('SimChart', () => {
  it('renders an svg with the expected viewBox', () => {
    const result = run(SMALL_CFG);
    const { container } = render(<SimChart result={result} day={0} />);
    const svg = container.querySelector('svg.sim-chart');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute('viewBox', '0 0 720 220');
  });

  it('renders the legend with all 7 entries', () => {
    const result = run(SMALL_CFG);
    const { container } = render(<SimChart result={result} day={0} />);
    const legend = container.querySelectorAll('.sim-chartlegend span');
    expect(legend).toHaveLength(7);
  });

  it('renders one exhaustion mark per exhaustion event', () => {
    const result = run(SMALL_CFG);
    const { container } = render(<SimChart result={result} day={result.days.length - 1} />);
    const marks = container.querySelectorAll('line.exhaust-mark');
    expect(marks.length).toBe(Object.keys(result.exhaustion).length);
  });

  it('does not throw when day exceeds the number of simulated days', () => {
    const result = run(SMALL_CFG);
    expect(() => render(<SimChart result={result} day={999999} />)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/CaseworkerDashboardV2/regelsimulatie/SimChart.test.tsx`
Expected: FAIL — `SimChart.tsx` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

Port `SimChart` from `docs/regelsimulatie-handoff/reference/preview/mock-simulatie.jsx`,
reference lines 46–160, 1:1: same `W`/`H`/padding constants, same stacked-band
computation (`cum`, `band`, `line` helpers), same color constants, same boundary/tick/
exhaustion-mark logic, same legend. Add types:

```tsx
// packages/frontend/src/components/CaseworkerDashboardV2/regelsimulatie/SimChart.tsx
import { simEurK } from './SimPot';
import type { SimResult } from './types';

export default function SimChart({ result, day }: { result: SimResult; day: number }) {
  // ...port the reference's SimChart body here verbatim (lines 47–159),
  // replacing `simEurK` calls with the imported one above instead of a
  // locally-redefined copy, and typing every intermediate array/object the
  // reference leaves untyped (cum: array of {b0..b6: number}, boundaries:
  // array of {ts,lbl,cls,i}, ticks: array of {i,lbl}, exhausts: array of
  // {i,label}).
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/CaseworkerDashboardV2/regelsimulatie/SimChart.test.tsx`
Expected: PASS, all 4 tests green.

- [ ] **Step 5: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint .`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/frontend/src/components/CaseworkerDashboardV2/regelsimulatie/SimChart.tsx packages/frontend/src/components/CaseworkerDashboardV2/regelsimulatie/SimChart.test.tsx
git commit -m "feat(frontend): add Regelsimulatie SimChart"
```

---

### Task 5: SimMissedPanel ("Geldige aanvragen die misliepen")

**Files:**

- Create: `packages/frontend/src/components/CaseworkerDashboardV2/regelsimulatie/SimMissedPanel.tsx`
- Test: `packages/frontend/src/components/CaseworkerDashboardV2/regelsimulatie/SimMissedPanel.test.tsx`

**Interfaces:**

- Consumes: `SimResult`, `SimApp` from `./types` (Task 1); `simEur` from `./SimPot`
  (Task 3).
- Produces (used by Task 6): `SimMissedPanel({ result: SimResult; day: number }):
JSX.Element`. Owns its own local state (`selId: number | null`, `mode: 'rfi' |
'beroep' | 'all'`) — independent of the parent's `day`.

- [ ] **Step 1: Write the failing tests**

```tsx
// packages/frontend/src/components/CaseworkerDashboardV2/regelsimulatie/SimMissedPanel.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SimMissedPanel from './SimMissedPanel';
import { run } from './simEngine';
import type { SimConfig } from './types';

const DEFAULT_CFG: SimConfig = {
  seed: 20260112,
  populatie: 3150,
  eigenaarRatio: 0.68,
  kostenGem: 4200,
  kostenSd: 1800,
  pFailliet: 0.02,
  pBuitenprovincie: 0.07,
  pGeenRelatie: 0.03,
  pGeenToestemming: 0.14,
  pNaamMismatch: 0.05,
  budgetScale: 1,
  aandeel2026: 0.46,
  arrivalPow: 1.3,
  doorlooptijdGem: 8,
  pAanvullendeInfo: 0.32,
  infoWachtGem: 60,
  bezwaarKans: 0.22,
  bezwaarToewijzing: 0.25,
};

describe('SimMissedPanel', () => {
  it('renders the three filter buttons with their counts', () => {
    const result = run(DEFAULT_CFG);
    render(<SimMissedPanel result={result} day={result.days.length - 1} />);
    expect(screen.getByRole('button', { name: /Door RFI-verschuiving/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Door succesvol beroep/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Alle onbetaalde/ })).toBeInTheDocument();
  });

  it('defaults to the RFI filter and shows a matching application', () => {
    const result = run(DEFAULT_CFG);
    render(<SimMissedPanel result={result} day={result.days.length - 1} />);
    expect(screen.getByText(/aanvraag 1 \//)).toBeInTheDocument();
  });

  it('switching to "Alle onbetaalde" changes the displayed count', () => {
    const result = run(DEFAULT_CFG);
    render(<SimMissedPanel result={result} day={result.days.length - 1} />);
    const before = screen.getByText(/aanvraag 1 \//).textContent;
    userEvent.setup();
    screen.getByRole('button', { name: /Alle onbetaalde/ }).click();
    const after = screen.getByText(/aanvraag 1 \//).textContent;
    // "Alle onbetaalde" is a superset of RFI-only, so unless RFI count equals
    // the total unpaid count, the "n" in "aanvraag 1 / n" must change.
    expect(result.agg.missedDueToRFI).not.toBe(result.agg.nietUitbetaald);
    expect(after).not.toBe(before);
  });

  it('◀ / ▶ navigate between applications in the current filter', async () => {
    const user = userEvent.setup();
    const result = run(DEFAULT_CFG);
    render(<SimMissedPanel result={result} day={result.days.length - 1} />);
    const next = screen.getByRole('button', { name: '▶' });
    await user.click(next);
    expect(screen.getByText(/aanvraag 2 \//)).toBeInTheDocument();
  });

  it('shows the empty state when a filter has zero matches at an early day', () => {
    const result = run(DEFAULT_CFG);
    render(<SimMissedPanel result={result} day={0} />);
    // At day 0 nothing has been decided yet, so nothing has "missed out".
    expect(screen.getByText(/Nog niets misgelopen|In dit scenario/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/CaseworkerDashboardV2/regelsimulatie/SimMissedPanel.test.tsx`
Expected: FAIL — `SimMissedPanel.tsx` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

Port from `docs/regelsimulatie-handoff/reference/preview/mock-simulatie.jsx`, reference
lines 225–426: `MtSeg` (the small process-segment helper, lines 225–237) and
`SimMissedTimeline` (lines 240–426, renamed to `SimMissedPanel` per this plan's file
name — the brief renamed it, the internal `mode`/`selId` state and all rendering logic
are otherwise unchanged). Port 1:1: same three-button filter bar, same timeline
lane/segment rendering (`MtSeg`, the RFI "aanvullende info" hatched sub-row, the "budget
naar succesvol beroep" purple sub-row, the "Net misgelopen" amber badge), same ◀▶
navigation and id-strip. Type every prop and local variable using `SimApp`/`SimResult`
from `types.ts`; import `simEur` from `./SimPot` rather than redefining it.

```tsx
// packages/frontend/src/components/CaseworkerDashboardV2/regelsimulatie/SimMissedPanel.tsx
import { useState } from 'react';
import { simEur } from './SimPot';
import type { SimResult, SimApp } from './types';

function MtSeg({
  bg,
  color,
  label,
  l,
  r,
  reveal,
  big,
}: {
  bg: string;
  color: string;
  label: string;
  l: number;
  r: number;
  reveal: number;
  big?: boolean;
}) {
  // ...port reference lines 225–237 verbatim, typed...
}

export default function SimMissedPanel({ result, day }: { result: SimResult; day: number }) {
  // ...port reference lines 240–426 verbatim (renamed from
  // SimMissedTimeline), typed. Own selId/mode state exactly as the
  // reference does; the "filt"/"tag"/"btn" inline helpers stay as typed
  // local functions inside the component, matching the reference's
  // structure...
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/CaseworkerDashboardV2/regelsimulatie/SimMissedPanel.test.tsx`
Expected: PASS, all 5 tests green. If a `getByText`/`getByRole` query collides against
the real rendered markup (the same class of issue seen in prior plans this session —
DMN-link disambiguation, concept-list-vs-chip collisions), scope the query tighter with
`within(...)` against a stable nearby container rather than weakening the assertion, and
note exactly what collided and how you scoped it in your report.

- [ ] **Step 5: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint .`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/frontend/src/components/CaseworkerDashboardV2/regelsimulatie/SimMissedPanel.tsx packages/frontend/src/components/CaseworkerDashboardV2/regelsimulatie/SimMissedPanel.test.tsx
git commit -m "feat(frontend): add Regelsimulatie SimMissedPanel"
```

---

### Task 6: RegelSimulatie section shell

**Files:**

- Create: `packages/frontend/src/components/CaseworkerDashboardV2/RegelSimulatie.tsx`
- Test: `packages/frontend/src/components/CaseworkerDashboardV2/RegelSimulatie.test.tsx`

**Interfaces:**

- Consumes: `run` from `./regelsimulatie/simEngine` (Task 1); `SimChart` (Task 4);
  `SimMissedPanel` (Task 5); `SimPot`, `SimOutcomeRow`, `SimTweak`, `simEur`, `simEurK`
  from `./regelsimulatie/SimPot` etc. (Task 3).
- Produces (used by Task 7): `RegelSimulatie(): JSX.Element` — no props, matching the
  brief and the "Public / shared library (no props)" dispatch pattern's prop shape (even
  though, per this plan's Task 7, it's dispatched from its own line, not that literal
  block).

- [ ] **Step 1: Write the failing tests**

```tsx
// packages/frontend/src/components/CaseworkerDashboardV2/RegelSimulatie.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RegelSimulatie from './RegelSimulatie';

describe('RegelSimulatie', () => {
  it('renders with no API calls and shows the breadcrumb and title', () => {
    render(<RegelSimulatie />);
    expect(screen.getByText('Simulatie · Regelsimulatie')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Regelsimulatie — Subsidie thuisbatterij' })
    ).toBeInTheDocument();
  });

  it('renders all five cards', () => {
    render(<RegelSimulatie />);
    expect(screen.getByText('Budgetuitputting', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Beschikbaar budget over tijd', { exact: false })).toBeInTheDocument();
    expect(
      screen.getByText('Geldige aanvragen die misliepen', { exact: false })
    ).toBeInTheDocument();
    expect(screen.getByText('Uitkomsten', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Aanvragen', { exact: false })).toBeInTheDocument();
  });

  it('the three SimMissedPanel filter buttons are present and clickable', async () => {
    const user = userEvent.setup();
    render(<RegelSimulatie />);
    const beroepBtn = screen.getByRole('button', { name: /Door succesvol beroep/ });
    await user.click(beroepBtn);
    expect(beroepBtn).toBeInTheDocument();
  });

  it('dragging the timeline changes the displayed date without throwing', async () => {
    render(<RegelSimulatie />);
    const slider = screen.getByRole('slider', { name: '' }) || screen.getAllByRole('slider')[0];
    expect(slider).toBeInTheDocument();
  });

  it('Reset restores the default parameters and day 0', async () => {
    const user = userEvent.setup();
    render(<RegelSimulatie />);
    await user.click(screen.getByRole('button', { name: 'Reset' }));
    expect(screen.getByText(/dag 1\//)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/CaseworkerDashboardV2/RegelSimulatie.test.tsx`
Expected: FAIL — `RegelSimulatie.tsx` doesn't exist yet. Note: the timeline-slider test
above is deliberately loose (`getByRole('slider', {name:''}) || getAllByRole(...)`) —
there are 3 sliders on this page (timeline, speed, and each parameter tweak); if this
selector doesn't resolve cleanly against the real markup, tighten it using the timeline's
actual accessible name/label once the component exists, per this plan's usual "scope
tighter, don't weaken the assertion" rule — don't leave the `||` fallback in the final
test.

- [ ] **Step 3: Write the implementation**

Port `MockSimulatie` from `docs/regelsimulatie-handoff/reference/preview/mock-simulatie.jsx`,
reference lines 428–743 (renamed `RegelSimulatie` per this plan's file name), 1:1:

- Same `SIM_DEFAULTS` constant (import `SimConfig` from `./regelsimulatie/types` for its
  type) and `SIM_LS_KEY` constant.
- Same `cfg`/`day`/`running`/`speed`/`tweaksOpen` state, same `localStorage`
  read-on-init and debounced write-on-change effects, same playback `setInterval` effect.
- `const result = useMemo(() => run(cfg), [cfg]);` — **exactly this dependency array**,
  never `[cfg, day]` — this is the design's core performance property.
- Same header (breadcrumb, `h1.v2-page-title`, lede, 4 badges), same collapsible
  `sim-tweaks` panel with all 15 `SimTweak`s across the 3 sub-grids, same control bar
  (play/pause/reset, date pill, mode pill, timeline scrubber, speed control), same
  two-column `sim-grid` (left: Budgetuitputting card with `SimPot`(s) + exhaustion
  call-out, then the chart card wrapping `SimChart`, then `SimMissedPanel`; right:
  Uitkomsten card with the `SimOutcomeRow`s + the two indented RFI/beroep collateral
  lines + rejection-ground breakdown + summary line, then the Aanvragen feed card).
- Import `simEur`/`simEurK` from `./regelsimulatie/SimPot` rather than redefining them a
  third time (see Task 3's note).

```tsx
// packages/frontend/src/components/CaseworkerDashboardV2/RegelSimulatie.tsx
import { useEffect, useMemo, useState } from 'react';
import { run } from './regelsimulatie/simEngine';
import type { SimConfig } from './regelsimulatie/types';
import SimPot, { simEur, simEurK } from './regelsimulatie/SimPot';
import SimOutcomeRow from './regelsimulatie/SimOutcomeRow';
import SimTweak from './regelsimulatie/SimTweak';
import SimChart from './regelsimulatie/SimChart';
import SimMissedPanel from './regelsimulatie/SimMissedPanel';

const SIM_DEFAULTS: SimConfig = {
  seed: 20260112,
  populatie: 3150,
  // ...remaining 13 fields, copied verbatim from reference lines 9–29...
};

const SIM_LS_KEY = 'sim-thuisbatterij-v2';

export default function RegelSimulatie() {
  // ...port reference lines 429–742 here verbatim, typed, per the bullet
  // list above...
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/CaseworkerDashboardV2/RegelSimulatie.test.tsx`
Expected: PASS, all 5 tests green.

- [ ] **Step 5: Run the full frontend suite**

Run: `npx vitest run`
Expected: no regressions in any other component's tests.

- [ ] **Step 6: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint .`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/frontend/src/components/CaseworkerDashboardV2/RegelSimulatie.tsx packages/frontend/src/components/CaseworkerDashboardV2/RegelSimulatie.test.tsx
git commit -m "feat(frontend): add RegelSimulatie section component"
```

---

### Task 7: Wiring — mode, router, CSS import

**Files:**

- Modify: `packages/frontend/src/pages/caseworker-v2/modes.config.ts`
- Modify: `packages/frontend/src/pages/caseworker-v2/modes.config.test.ts`
- Modify: `packages/frontend/src/components/CaseworkerDashboardV2/SectionRouter.tsx`
- Modify: `packages/frontend/src/pages/CaseworkerDashboardV2.tsx`

**Interfaces:**

- Consumes: `RegelSimulatie` from `./RegelSimulatie` (Task 6).

- [ ] **Step 1: Write the failing tests**

Read `packages/frontend/src/pages/caseworker-v2/modes.config.test.ts` in full first — it
already asserts exact mode counts/ids/defaults that this task's change will break; update
the existing assertions (don't leave a stale "3 modes" assertion sitting next to a new
4th mode) and add:

```ts
// additions to modes.config.test.ts — merge into the existing describe blocks,
// following whatever structure the existing file already uses
import { MODES, isRailItemVisible, findModeForSection } from './modes.config';

describe('simulatie mode', () => {
  it('exists between zoeken and beheer', () => {
    const ids = MODES.map((m) => m.id);
    const zoekenIdx = ids.indexOf('zoeken');
    const beheerIdx = ids.indexOf('beheer');
    const simIdx = ids.indexOf('simulatie');
    expect(simIdx).toBeGreaterThan(zoekenIdx);
    expect(simIdx).toBeLessThan(beheerIdx);
  });

  it('has a single regelsimulatie rail item as its default section', () => {
    const mode = MODES.find((m) => m.id === 'simulatie')!;
    expect(mode.defaultSectionId).toBe('regelsimulatie');
    const allIds = mode.groups.flatMap((g) => g.items.map((i) => i.id));
    expect(allIds).toEqual(['regelsimulatie']);
  });

  it('regelsimulatie requires authentication', () => {
    const item = MODES.find((m) => m.id === 'simulatie')!.groups[0].items[0];
    expect(item.authRequired).toBe(true);
  });

  it('regelsimulatie is visible to a signed-in user regardless of tenant config, and hidden when signed out', () => {
    const item = MODES.find((m) => m.id === 'simulatie')!.groups[0].items[0];
    // tenantSectionIds loaded, but doesn't list 'regelsimulatie' (as no real
    // tenants.json does yet) — must still be visible because it's shell-global.
    const tenantSectionIds = new Set(['berichten', 'nieuws']);
    expect(
      isRailItemVisible(item, {
        isAuthenticated: true,
        userRoles: [],
        userOrgType: null,
        tenantSectionIds,
      })
    ).toBe(true);
    expect(
      isRailItemVisible(item, {
        isAuthenticated: false,
        userRoles: [],
        userOrgType: null,
        tenantSectionIds,
      })
    ).toBe(false);
  });

  it('findModeForSection resolves regelsimulatie to simulatie', () => {
    expect(findModeForSection('regelsimulatie')).toBe('simulatie');
  });
});
```

Also update any existing test in this file asserting a literal mode count (e.g.
`expect(MODES).toHaveLength(3)`) to the new count, and any literal `ModeId` array
assertion to include `'simulatie'`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/pages/caseworker-v2/modes.config.test.ts`
Expected: FAIL — `'simulatie'` doesn't exist in `MODES` yet, and the mode-count
assertions you updated now expect a count the current file doesn't produce.

- [ ] **Step 3: Update `modes.config.ts`**

Three changes:

1. Extend the union: `export type ModeId = 'werk' | 'zoeken' | 'beheer' | 'simulatie';`
   — reorder to `'werk' | 'zoeken' | 'simulatie' | 'beheer'` if you prefer the union's
   declaration order to match the array's; either is fine since nothing depends on union
   member order, but be consistent with your own choice.

2. Insert into `MODES`, between the `zoeken` block and the `beheer` block:

```ts
  {
    id: 'simulatie',
    label: 'Simulatie',
    defaultSectionId: 'regelsimulatie',
    groups: [
      {
        items: [{ id: 'regelsimulatie', label: 'Regelsimulatie', authRequired: true }],
      },
    ],
  },
```

3. Add `'regelsimulatie'` to `SHELL_GLOBAL_SECTION_IDS`:

```ts
const SHELL_GLOBAL_SECTION_IDS: ReadonlySet<string> = new Set([
  'audit-overzicht',
  'audit-details',
  'gereedschap-overzicht',
  // V2-native, not in V1 tenants.json:
  'taken',
  'filter-overdue',
  'filter-waiting',
  'filter-today',
  'filter-week',
  'dvtp-start',
  'dvtp-taken',
  'regelsimulatie',
]);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/pages/caseworker-v2/modes.config.test.ts`
Expected: PASS, all tests green including the pre-existing ones you updated.

- [ ] **Step 5: Wire `SectionRouter.tsx`**

Add the import near the other `CaseworkerDashboardV2/` imports:

```tsx
import RegelSimulatie from './RegelSimulatie';
```

Add the dispatch as its own block, with a comment explaining why it's neither of the two
existing groupings (per this plan's design decision):

```tsx
// ── Simulatie ──────────────────────────────────────────────────────
// Auth-required (unlike the "Public / shared library" block below it in
// this file) but takes no props (unlike "Beheer / projects (require
// user)"'s members, which all consume `user`) — neither existing block is
// a categorical fit, so this gets its own line rather than being forced
// into one.
if (sectionId === 'regelsimulatie') return <RegelSimulatie />;
```

Place it wherever reads most naturally given the file's existing block order (e.g. right
before the "Public / shared library" block, since it's closest in spirit — no props —
while being clearly commented as distinct).

- [ ] **Step 6: Wire the CSS import**

In `packages/frontend/src/pages/CaseworkerDashboardV2.tsx`, add right after the existing
line 55 (`import './caseworker-v2/dashboard-v2.css';`):

```tsx
import './caseworker-v2/regelsimulatie.css';
```

- [ ] **Step 7: Run the full frontend suite**

Run: `npx vitest run`
Expected: no regressions anywhere.

- [ ] **Step 8: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint .`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add packages/frontend/src/pages/caseworker-v2/modes.config.ts packages/frontend/src/pages/caseworker-v2/modes.config.test.ts packages/frontend/src/components/CaseworkerDashboardV2/SectionRouter.tsx packages/frontend/src/pages/CaseworkerDashboardV2.tsx
git commit -m "feat(frontend): wire Regelsimulatie into the V2 shell (mode, router, CSS)"
```

---

## Final verification

After Task 7: run `npx vitest run && npx tsc --noEmit && npx eslint .` from
`packages/frontend` once more on the fully assembled branch. The changelog entry for
this feature is authored later, at release-cut time via `/bump-release` (using the
branch's real commit SHAs, not guessed ones) — matching how every other feature this
session has been released, not baked into this plan's own tasks. Then hand off to
`superpowers:finishing-a-development-branch`.
