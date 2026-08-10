# RIP Beheer — Patch A–D to the v2 Twelve-Phase Catalogue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the RIP phase catalogue from nine phases (R2.1…R5.2, four
stages) to twelve phases (R2.1…R6.1, five stages) per the v2 handoff, with
R5.2 becoming a real phase and R5.3 becoming the new unmodelled placeholder,
and drop the mock ladder-position derivation's legacy-phase indirection in
favor of a direct hash across all twelve real phases.

**Architecture:** Pure data/derivation changes only. `rip-phases.catalog.ts`'s
`CONTENT` array and `RIP_STAGES` grow; `packages/shared/src/rip-phases.ts`'s
`RIP_PHASE_KEYS` grows in lockstep; `infra-board.data.ts`'s `pbLadderFor`
loses its legacy-range indirection. Every consumer (Faseladder overview,
Starten tab, WIP/Gereed tabs) already iterates `RIP_PHASES`/`RIP_STAGES`
generically — verified against the v2 design docs and this repo's current
code before writing this plan — so no UI component logic changes are
anticipated; the plan's final task is a verification pass with a small,
precisely-identified set of test fixes.

**Tech Stack:** TypeScript, React, Vitest, `@testing-library/react`.

## Global Constraints

- No backend routes change. No `test` deploy state is added — deploy status
  stays the existing 2/3-state model (`gedeployed`/`ontwerp`/`onbekend`),
  queried live from the registry, per explicit user decision during
  brainstorming.
- No UI/component logic changes beyond what falls out of the catalogue data
  change — if a task's verification step finds a genuine logic gap, treat it
  as a plan/spec conflict and flag it rather than silently expanding scope.
- `RAW` in `infra-board.data.ts` (the 42 mock projects) is untouched — same
  nr/naam/role/health/milestone/budget/startYear/startQ. Only how each
  project's RIP ladder position is _derived_ from its project number changes.
- Run all `npx vitest` commands from `packages/frontend` specifically (`cd`
  there first), not the repo root. `packages/shared` changes need
  `npm run build --workspace=@ronl/shared` (from repo root) to propagate to
  the frontend, which resolves `@ronl/shared` via its compiled `dist/`.
- Money-routing configuration, alternate WIP metrics for R5.2/R5.4, R5.3's
  parked-projects list, and Portfolio/Mijn dag/stepper migration are all out
  of scope for this plan — see the spec's "Out of scope" section.

---

### Task 1: `packages/shared/src/rip-phases.ts` — grow `RIP_PHASE_KEYS` to twelve phases

**Files:**

- Modify: `packages/shared/src/rip-phases.ts`

**Interfaces:**

- Consumes: nothing new.
- Produces: `RIP_PHASE_KEYS` now has twelve entries (R2.1…R6.1). Task 2's
  frontend catalogue reads this to populate each phase's
  `processDefinitionKey`.

There is no dedicated test file for this module (matching the existing
precedent from sub-project A — coverage comes indirectly via
`rip-phases.catalog.test.ts`'s `processDefinitionKey` assertions in Task 2).
This task is a direct data edit, verified by Task 2's tests.

- [ ] **Step 1: Replace `RIP_PHASE_KEYS`**

  In `packages/shared/src/rip-phases.ts`, replace the `RIP_PHASE_KEYS` array:

  ```ts
  export const RIP_PHASE_KEYS: RipPhaseKey[] = [
    { code: 'R2.1', stage: 'R2', processDefinitionKey: 'RipPhase1Process' },
    { code: 'R2.2', stage: 'R2' },
    { code: 'R2.3', stage: 'R2' },
    { code: 'R2.4', stage: 'R2' },
    { code: 'R3.1', stage: 'R3' },
    { code: 'R3.2', stage: 'R3' },
    { code: 'R4.1', stage: 'R4' },
    { code: 'R5.1', stage: 'R5' },
    { code: 'R5.2', stage: 'R5' },
    { code: 'R5.3', stage: 'R5' },
    { code: 'R5.4', stage: 'R5' },
    { code: 'R6.1', stage: 'R6' },
  ];
  ```

  Also update the `RipPhaseKey.code`/`.stage` doc comments (currently say
  `'R2.1' … 'R5.2'` and `'R2' | 'R3' | 'R4' | 'R5'`):

  ```ts
  export interface RipPhaseKey {
    code: string; // 'R2.1' … 'R6.1'
    stage: string; // 'R2' | 'R3' | 'R4' | 'R5' | 'R6'
    processDefinitionKey?: string;
  }
  ```

- [ ] **Step 2: Rebuild the shared package**

  Run (from the repo root): `npm run build --workspace=@ronl/shared`

  Expected: builds clean, no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add packages/shared/src/rip-phases.ts packages/shared/dist
  git commit -m "feat(shared): grow RIP_PHASE_KEYS to twelve phases (R2.1-R6.1)"
  ```

---

### Task 2: `rip-phases.catalog.ts` — twelve-phase `CONTENT` + fifth stage

**Files:**

- Modify: `packages/frontend/src/pages/infra-board/rip-phases.catalog.ts`
- Modify: `packages/frontend/src/pages/infra-board/rip-phases.catalog.test.ts`

**Interfaces:**

- Consumes: `RIP_PHASE_KEYS` (Task 1, twelve entries).
- Produces: `RIP_PHASES` (twelve entries), `RIP_STAGES` (five entries). Every
  later task and every existing consumer (`FaseladderOverview.tsx`,
  `PhaseDetail.tsx`, `modes.config.ts`, `infra-board.data.ts`) reads these
  unchanged — no signature changes, only content growth.

- [ ] **Step 1: Write the failing tests**

  Replace the entire contents of `rip-phases.catalog.test.ts`:

  ```ts
  import { describe, expect, it } from 'vitest';
  import {
    getPhaseDeployStatus,
    ripPhaseByCode,
    RIP_PHASES,
    RIP_STAGES,
    type RipPhase,
  } from './rip-phases.catalog';

  const NON_R21_CODES = [
    'R2.2',
    'R2.3',
    'R2.4',
    'R3.1',
    'R3.2',
    'R4.1',
    'R5.1',
    'R5.2',
    'R5.3',
    'R5.4',
    'R6.1',
  ];

  describe('RIP_PHASES catalogue', () => {
    it('has exactly twelve phases in R2.1…R6.1 order', () => {
      expect(RIP_PHASES.map((p) => p.code)).toEqual([
        'R2.1',
        'R2.2',
        'R2.3',
        'R2.4',
        'R3.1',
        'R3.2',
        'R4.1',
        'R5.1',
        'R5.2',
        'R5.3',
        'R5.4',
        'R6.1',
      ]);
    });

    it('has five stages matching the phase codes', () => {
      expect(RIP_STAGES.map((s) => s.code)).toEqual(['R2', 'R3', 'R4', 'R5', 'R6']);
    });

    it('only R2.1 carries a processDefinitionKey', () => {
      expect(ripPhaseByCode('R2.1')?.processDefinitionKey).toBe('RipPhase1Process');
      for (const code of NON_R21_CODES) {
        expect(ripPhaseByCode(code)?.processDefinitionKey).toBeUndefined();
      }
    });

    it('marks only R5.3 as beyond (no process model even planned)', () => {
      expect(ripPhaseByCode('R5.3')?.beyond).toBe(true);
      const notBeyond = [
        'R2.1',
        'R2.2',
        'R2.3',
        'R2.4',
        'R3.1',
        'R3.2',
        'R4.1',
        'R5.1',
        'R5.2',
        'R5.4',
        'R6.1',
      ];
      for (const code of notBeyond) {
        expect(ripPhaseByCode(code)?.beyond).toBeUndefined();
      }
    });

    it('every phase resolves to a real stage', () => {
      const stageCodes = new Set(RIP_STAGES.map((s) => s.code));
      for (const phase of RIP_PHASES) {
        expect(stageCodes.has(phase.stage)).toBe(true);
      }
    });
  });

  describe('getPhaseDeployStatus', () => {
    const withKey: RipPhase = { ...ripPhaseByCode('R2.1')! };
    const withoutKey: RipPhase = { ...ripPhaseByCode('R2.2')! };
    const beyond: RipPhase = { ...ripPhaseByCode('R5.3')! };

    it('is gedeployed when the phase has a key and it is in the deployed set', () => {
      expect(getPhaseDeployStatus(withKey, new Set(['RipPhase1Process']))).toBe('gedeployed');
    });

    it('is ontwerp when the phase has a key but it is not in the deployed set', () => {
      expect(getPhaseDeployStatus(withKey, new Set())).toBe('ontwerp');
    });

    it('is ontwerp when the phase has no key and is not beyond', () => {
      expect(getPhaseDeployStatus(withoutKey, new Set())).toBe('ontwerp');
    });

    it('is onbekend when the phase is beyond, regardless of the deployed set', () => {
      expect(getPhaseDeployStatus(beyond, new Set(['RipPhase1Process']))).toBe('onbekend');
    });
  });

  describe('kredietBeslisser', () => {
    it('is set for every phase with krediet: true', () => {
      expect(ripPhaseByCode('R2.3')?.kredietBeslisser).toBe('Infra-overleg');
      expect(ripPhaseByCode('R2.4')?.kredietBeslisser).toBe('Infra-overleg');
      expect(ripPhaseByCode('R3.2')?.kredietBeslisser).toBe('Infra-overleg');
      expect(ripPhaseByCode('R4.1')?.kredietBeslisser).toBe('Concerndirecteur');
      expect(ripPhaseByCode('R5.2')?.kredietBeslisser).toBe(
        'AO of Concerndirecteur (afhankelijk van drempel)'
      );
      expect(ripPhaseByCode('R5.4')?.kredietBeslisser).toBe(
        'AO of Concerndirecteur (afhankelijk van drempel)'
      );
    });

    it('is undefined for every phase with krediet: false', () => {
      for (const code of ['R2.1', 'R2.2', 'R3.1', 'R5.1', 'R5.3', 'R6.1']) {
        expect(ripPhaseByCode(code)?.kredietBeslisser).toBeUndefined();
      }
    });
  });
  ```

- [ ] **Step 2: Run the tests to verify they fail**

  Run (from `packages/frontend`): `npx vitest run src/pages/infra-board/rip-phases.catalog.test.ts`

  Expected: FAIL — the catalogue still has nine phases and R5.2 is still
  `beyond`.

- [ ] **Step 3: Write minimal implementation**

  In `rip-phases.catalog.ts`:
  1. Add the fifth stage to `RIP_STAGES`:

     ```ts
     export const RIP_STAGES: RipStage[] = [
       { code: 'R2', name: 'Planvoorbereiding', color: '#0046ad' },
       { code: 'R3', name: 'Contractvorming', color: '#7a5af0' },
       { code: 'R4', name: 'Aanbesteding', color: '#b85c00' },
       { code: 'R5', name: 'Uitvoering', color: '#0a8e8e' },
       { code: 'R6', name: 'Decharge', color: '#b0103c' },
     ];
     ```

  2. In the `CONTENT` array, the R2.1, R2.2, R2.3, R2.4, R3.1, R3.2, R4.1,
     and R5.1 entries are unchanged — leave them exactly as they are.

  3. Replace the existing R5.2 entry (currently `beyond: true`, "Start werk
     'buiten'") with:

     ```ts
     {
       code: 'R5.2',
       stage: 'R5',
       name: 'Directievoering en toezicht (UAV)',
       lead: 'Directievoerder',
       roles: [
         'Directievoerder',
         'Toezichthouder',
         'Opdrachtnemer',
         'Kosten- en contractdeskundige',
         'Projectleider',
         'AO',
         'Ondersteuner',
       ],
       entry: 'Start werk "buiten" na vrijgave R5.1',
       exit: 'Werk gereed — verzoek tot opneming',
       docs: [
         'Weekstaat (ON)',
         'Weekrapport',
         'Afwijkingenrapport (ON)',
         'Afwijkingenrapportage (AWR)',
         'Advies afwijking',
         'Geaccordeerde termijnen',
         'Uitstel tot oplevering (ON)',
         'Brief uitstel tot oplevering',
         'Nota besluitvorming',
       ],
       gates: [
         'Weekstaat akkoord?',
         'Afwijking binnen of buiten contract?',
         'Overzicht AWR akkoord?',
         'Werk gereed?',
         'Waarde < of > € 50.000?',
       ],
       krediet: true,
       kredietBeslisser: 'AO of Concerndirecteur (afhankelijk van drempel)',
       weeks: 40,
       bron: 'Overzichtsplaat R5.2 — Directievoering en toezicht UAV (20-7-2026); VISI + besteksadministratie + webformulier ATB',
     },
     ```

  4. Insert three new entries after R5.2 (before the current array's closing
     `];`):

     ```ts
     {
       code: 'R5.3',
       stage: 'R5',
       name: '(Vervroegde) ingebruikname / oplevering',
       lead: 'Directievoerder',
       beyond: true,
       roles: ['Directievoerder', 'Toezichthouder', 'Opdrachtnemer'],
       entry: 'Werk gereed gemeld in R5.2',
       exit: '—',
       docs: [],
       gates: [],
       krediet: false,
       weeks: 4,
       bron: 'PLACEHOLDER — geen overzichtsplaat aangeleverd. Bekend uit verwijzingen in R5.2 (organiseren interne schouw, restpunten oplossen door ON) en R5.4 (oplevering areaal).',
     },
     {
       code: 'R5.4',
       stage: 'R5',
       name: 'Oplevering en onderhoudsperiode',
       lead: 'Directievoerder',
       roles: [
         'Directievoerder',
         'Beheerder',
         'Databeheerder',
         'Vestigingsmanager',
         'Toezichthouder',
         'Projectleider',
         'Ondersteuner',
         'Opdrachtnemer',
       ],
       entry: 'Oplevering areaal na R5.3',
       exit: 'Gereedmelding VISI — start overdrachtsverklaring',
       docs: [
         'Opleverdossier',
         'Intern schouwrapport',
         'Verslag schouw',
         'Eindafrekening',
         'Brief eindafrekening',
         'Nota besluitvorming',
         'Kennisgeving tijdelijke schorsing groslijst',
       ],
       gates: [
         'Opleverdossier akkoord Beheerder en Databeheerder?',
         'Technische installaties in project?',
         'Binnen krediet en aanneemsom?',
         'Restpunten gereed?',
       ],
       krediet: true,
       kredietBeslisser: 'AO of Concerndirecteur (afhankelijk van drempel)',
       weeks: 26,
       bron: 'Overzichtsplaat R5.4 (20-7-2026); koppelingen BO11.6 liggingsgegevens, BO13.5 IV-schap + NEN1010 deel 6, BO1 jaarplanning',
     },
     {
       code: 'R6.1',
       stage: 'R6',
       name: 'Projectdecharge',
       lead: 'Projectleider',
       roles: [
         'Projectleider',
         'Projectondersteuner',
         'Financiën',
         'AO',
         'Beheerder',
         'Vestigingsmanager',
         'RIP-team',
       ],
       entry: 'Gereedmelding VISI in R5.4',
       exit: 'Dechargedossier geaccordeerd door AO — einde proces',
       docs: [
         'A. Financieel overzicht voor decharge',
         'B. Overdrachtsverklaring',
         'C. Eindevaluatie RIP projectenproces',
         'Dechargedossier',
       ],
       gates: [
         'Overdrachtsverklaring akkoord Beheerder en VM?',
         'Dechargedossier akkoord AO?',
       ],
       krediet: false,
       weeks: 6,
       bron: 'Overzichtsplaat R6.1 — Projectdecharge (14-7-2026); afsluiting zaakmap DMS, rechten Relatics, financiële eindstand in raamkrediet Infra',
     },
     ```

  5. Update the file's top-of-file doc comment (currently says "the nine
     sub-processes (R2.1…R5.2)") to say "the twelve sub-processes
     (R2.1…R6.1)".

- [ ] **Step 4: Run the tests to verify they pass**

  Same command as Step 2. Expected: PASS.

- [ ] **Step 5: Typecheck**

  Run (from `packages/frontend`): `npx tsc --noEmit`

  Expected: no errors (confirms `RIP_PHASE_KEYS` from Task 1 has all twelve
  codes the catalogue now references).

- [ ] **Step 6: Commit**

  ```bash
  git add packages/frontend/src/pages/infra-board/rip-phases.catalog.ts packages/frontend/src/pages/infra-board/rip-phases.catalog.test.ts
  git commit -m "feat(frontend): grow RIP_PHASES catalogue to twelve phases, R6 stage; R5.2 real, R5.3 placeholder"
  ```

---

### Task 3: `infra-board.data.ts` — drop `LADDER_FROM_LEGACY`, hash directly onto all twelve phases

**Files:**

- Modify: `packages/frontend/src/pages/infra-board/infra-board.data.ts`
- Modify: `packages/frontend/src/pages/infra-board/infra-board.data.test.ts`

**Interfaces:**

- Consumes: `RIP_PHASES` (Task 2, twelve entries).
- Produces: `pbLadderFor(nr: string): number` — signature change (drops the
  `legacy` parameter). Only called from `getMockPortfolio()` in this same
  file; no other file calls it (it's module-private, unexported).

This task redistributes which of the 42 mock projects land on which of the
twelve phases (computed and verified in advance — see the two test fixes in
Step 1, which are the only two spots in the whole test suite that hardcode
an R5.2-was-the-beyond-phase assumption in _this_ file).

- [ ] **Step 1: Write the failing tests**

  In `infra-board.data.test.ts`, two existing tests hardcode the old
  beyond-phase assumption (R5.2 → now R5.3):

  Find this line inside `describe('getMockPhaseInstanceDetail', ...)`'s
  `'sets wip-only fields when the project is wip at that phase'` test:

  ```ts
  (p) => p.ripPhaseState === 'wip' && p.ripPhaseCode !== 'R5.2';
  ```

  Change it to:

  ```ts
  (p) => p.ripPhaseState === 'wip' && p.ripPhaseCode !== 'R5.3';
  ```

  Find this test inside `describe('getMockWipRows / getMockGereedRows', ...)`:

  ```ts
  it('never returns wip rows for the beyond (R5.2) phase', () => {
    const r52 = RIP_PHASES.find((p) => p.code === 'R5.2')!;
    expect(getMockWipRows(r52)).toEqual([]);
  });
  ```

  Replace it with:

  ```ts
  it('never returns wip rows for the beyond (R5.3) phase', () => {
    const r53 = RIP_PHASES.find((p) => p.code === 'R5.3')!;
    expect(getMockWipRows(r53)).toEqual([]);
  });
  ```

  Also add this new test, appended to the same `describe('getMockWipRows / getMockGereedRows', ...)` block. This is the one genuinely red-before-green check for this task: under the OLD `LADDER_FROM_LEGACY` mechanism, ladder positions 10-12 (R5.3, R5.4, R6.1) are **structurally unreachable** — the legacy-bucket array only maps onto positions 1-9, so no project could ever land past R5.2 no matter its project number. The two fixture renames above don't actually distinguish old-vs-new behavior (`getMockWipRows` short-circuits on `phase.beyond` regardless of how projects are distributed, and positions 1-9 stay valid codes in the new twelve-entry catalogue too) — this one does:

  ```ts
  it('reaches R5.4 and R6.1 — unreachable under the old legacy-bucket derivation', () => {
    const codes = new Set(getMockPortfolio().map((p) => p.ripPhaseCode));
    expect(codes.has('R5.4')).toBe(true);
    expect(codes.has('R6.1')).toBe(true);
  });
  ```

- [ ] **Step 2: Run the tests to verify they fail**

  Run (from `packages/frontend`):
  `npx vitest run src/pages/infra-board/infra-board.data.test.ts -t "unreachable under the old legacy-bucket"`

  Expected: FAIL — `pbLadderFor` still routes through `LADDER_FROM_LEGACY`,
  whose six buckets only ever produce positions 1-9, so no mock project can
  have `ripPhaseCode` `'R5.4'` or `'R6.1'`.

  Also run the two renamed fixture tests to confirm they still pass at this
  point (they should — they aren't the red/green signal for this task, just
  necessary consistency updates now that R5.3 is a valid catalogue code):
  `npx vitest run src/pages/infra-board/infra-board.data.test.ts -t "wip at that phase|beyond \(R5.3\)"`

- [ ] **Step 3: Write minimal implementation**

  In `infra-board.data.ts`, replace this whole block (the doc comment,
  `LADDER_FROM_LEGACY`, and `pbLadderFor`):

  ```ts
  /**
   * Ported from docs/infra-beheer-handoff/reference/pb-data.reference.jsx —
   * spreads each RAW row's old 6-phase legacy value across the real
   * 9-phase RIP ladder via a stable hash of the project number, so all
   * nine deelprocessen are populated in the mock data.
   *   F1 Projectplan   → R2.1
   *   F2 Planuitwerking→ R2.2
   *   F3 Def. ontwerp  → R2.3 VO-raming | R2.4 DO en -raming
   *   F4 Aanbesteding  → R3.1 bestek | R3.2 afronding bestek | R4.1 aanbesteding
   *   F5 Uitvoering    → R5.1 voorbereiding op uitvoering
   *   F6 Decharge      → R5.2 start werk buiten (niet-gemodelleerd staartstuk)
   */
  const LADDER_FROM_LEGACY: number[][] = [[1], [2], [3, 4], [5, 6, 7], [8], [9]];

  function pbHash(s: string): number {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return h;
  }

  function pbLadderFor(nr: string, legacy: number): number {
    const opts = LADDER_FROM_LEGACY[legacy - 1];
    return opts[pbHash(nr + '|ladder') % opts.length];
  }
  ```

  with:

  ```ts
  function pbHash(s: string): number {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return h;
  }

  /**
   * Deterministic per-project ladder position, spread directly across all
   * twelve real RIP phases via a stable hash of the project number. Per
   * the v2 handoff prompt ("do not carry over LADDER_FROM_LEGACY or
   * pbAwaits from the prototype — use real phase data"): this no longer
   * routes through RAW's old 6-phase legacy value at all. The v2
   * reference prototype still does — but only because it's a static
   * browser demo with no backend; this app's mock/live merge layer
   * doesn't need that indirection. RAW's legacy `phase` field (1-6) is
   * still used elsewhere in this file for Portfolio's own Gantt/kanban
   * model — untouched here.
   */
  function pbLadderFor(nr: string): number {
    return 1 + (pbHash(nr + '|ladder') % RIP_PHASES.length);
  }
  ```

  Then in `getMockPortfolio()`, change the call site:

  ```ts
  const ladderPos = pbLadderFor(nr, phase);
  ```

  to:

  ```ts
  const ladderPos = pbLadderFor(nr);
  ```

  (The destructured `phase` variable — RAW's legacy 1-6 value — stays used
  a few lines above for `phaseStatuses(phase, flags)` and the Gantt
  `segments` build; only its use in `pbLadderFor` is removed.)

- [ ] **Step 4: Run the tests to verify they pass**

  Run (from `packages/frontend`): `npx vitest run src/pages/infra-board/infra-board.data.test.ts`

  Expected: PASS, every test in the file.

- [ ] **Step 5: Commit**

  ```bash
  git add packages/frontend/src/pages/infra-board/infra-board.data.ts packages/frontend/src/pages/infra-board/infra-board.data.test.ts
  git commit -m "refactor(frontend): drop legacy-phase ladder indirection, hash mock projects directly across all twelve phases"
  ```

---

### Task 4: Fix phase-distribution-sensitive tests in Faseladder/PhaseDetail; full-suite verification

**Files:**

- Modify: `packages/frontend/src/components/InfraBoardDashboard/FaseladderOverview.test.tsx`
- Modify: `packages/frontend/src/components/InfraBoardDashboard/PhaseDetail.test.tsx`

**Interfaces:**

- Consumes: `RIP_PHASES`/`RIP_STAGES` (Task 2), the new mock distribution
  (Task 3).
- Produces: no new interfaces — this task only updates test fixtures/
  assertions to match the twelve-phase reality. `FaseladderOverview.tsx`
  and `PhaseDetail.tsx` themselves are NOT modified — both already iterate
  `RIP_PHASES`/`RIP_STAGES` generically (confirmed while writing this plan
  by re-reading both files in full against the v2 design).

Three fixture-specific tests in `FaseladderOverview.test.tsx` and one in
`PhaseDetail.test.tsx` hardcode assumptions from the nine-phase/R5.2-was-
beyond catalogue. These four are the only ones identified by hand-tracing
every phase-code literal in the frontend test suite against this plan's
Task 2/3 changes — Step 4 below runs the full suite as a safety net for
anything this trace missed.

- [ ] **Step 1: Fix `FaseladderOverview.test.tsx`**
  1. Rename the test `'renders one row per phase, grouped under four stage
headers'` to `'renders one row per phase, grouped under five stage
headers'` (its body already loops `RIP_STAGES.forEach(...)` — no
     assertion changes needed, only the description was wrong).

  2. Find:

     ```ts
     it('shows Deelprocessen inzetbaar as "N / 9"', () => {
       render(<FaseladderOverview onOpenPhase={vi.fn()} />);
       expect(kpiValue('Deelprocessen inzetbaar')).toBe('1 / 9');
     });
     ```

     Replace with:

     ```ts
     it('shows Deelprocessen inzetbaar as "N / 12"', () => {
       render(<FaseladderOverview onOpenPhase={vi.fn()} />);
       expect(kpiValue('Deelprocessen inzetbaar')).toBe('1 / 12');
     });
     ```

  3. Find:

     ```ts
     it('labels the WIP column "WIP / Geparkeerd" and shows R5.2\'s geparkeerd count there', () => {
       render(<FaseladderOverview onOpenPhase={vi.fn()} />);
       expect(screen.getByText('WIP / Geparkeerd')).toBeInTheDocument();
       const mockCounts = getMockPhaseCounts();
       const r52 = RIP_PHASES.find((p) => p.code === 'R5.2')!;
       const row = screen.getByText(r52.code, { exact: false }).closest('tr');
       expect(row?.textContent).toContain(String(mockCounts['R5.2'].geparkeerd));
     });
     ```

     Replace with:

     ```ts
     it('labels the WIP column "WIP / Geparkeerd" and shows R5.3\'s geparkeerd count there', () => {
       render(<FaseladderOverview onOpenPhase={vi.fn()} />);
       expect(screen.getByText('WIP / Geparkeerd')).toBeInTheDocument();
       const mockCounts = getMockPhaseCounts();
       const r53 = RIP_PHASES.find((p) => p.code === 'R5.3')!;
       const row = screen.getByText(r53.code, { exact: false }).closest('tr');
       expect(row?.textContent).toContain(String(mockCounts['R5.3'].geparkeerd));
     });
     ```

- [ ] **Step 2: Fix `PhaseDetail.test.tsx`**

  Find the `describe('PhaseDetail — R5.2 (beyond)', ...)` block:

  ```tsx
  describe('PhaseDetail — R5.2 (beyond)', () => {
    it('renders a placeholder instead of the tab shell', () => {
      render(<PhaseDetail phaseCode="R5.2" onBack={vi.fn()} />);
      expect(screen.queryByText('Starten')).not.toBeInTheDocument();
      expect(screen.queryByText('WIP')).not.toBeInTheDocument();
      expect(screen.getByText('Niet gemodelleerd', { exact: false })).toBeInTheDocument();
    });
  });
  ```

  Replace with:

  ```tsx
  describe('PhaseDetail — R5.3 (beyond)', () => {
    it('renders a placeholder instead of the tab shell', () => {
      render(<PhaseDetail phaseCode="R5.3" onBack={vi.fn()} />);
      expect(screen.queryByText('Starten')).not.toBeInTheDocument();
      expect(screen.queryByText('WIP')).not.toBeInTheDocument();
      expect(screen.getByText('Niet gemodelleerd', { exact: false })).toBeInTheDocument();
    });
  });
  ```

  (This works because `phase.beyond` now lives on R5.3's catalogue entry —
  the component branch this test exercises is gated purely on
  `ripPhaseByCode(phaseCode)?.beyond`, unmocked in this test file, so no
  other change is needed for this test to pass.)

- [ ] **Step 3: Run the fixed tests to verify they pass**

  Run (from `packages/frontend`):

  ```
  npx vitest run src/components/InfraBoardDashboard/FaseladderOverview.test.tsx
  npx vitest run src/components/InfraBoardDashboard/PhaseDetail.test.tsx
  ```

  Expected: PASS, every test in both files.

- [ ] **Step 4: Run the full frontend suite as a safety net**

  Run (from `packages/frontend`): `npx vitest run`

  Expected: PASS, all test files. If anything else fails, it will be
  another phase-code-literal assumption this plan's hand-trace missed (the
  known culprits — `rip-phase-counts.test.ts` uses only synthetic counts
  objects unrelated to the real catalogue, and `modes.config.test.ts`/
  `InfraSectionRouter.test.tsx` iterate `RIP_PHASES` generically or use
  R2.1 only, both confirmed unaffected while writing this plan). Fix any
  such failure the same way Task 3/Step 1 and this task did: find the
  concrete new distribution (`getMockPortfolio()`, `getMockPhaseCounts()`,
  `getReadyProjects`/`getOutOfSequenceProjects` are all real, callable
  functions — never guess), and either swap the phase code the test
  targets or compute the expected value dynamically, matching the
  established pattern from sub-projects C and D. Do not weaken an
  assertion's intent to make it pass.

- [ ] **Step 5: Typecheck and lint**

  Run (from `packages/frontend`):

  ```
  npx tsc --noEmit
  npm run lint
  ```

  Expected: no errors.

- [ ] **Step 6: Commit**

  ```bash
  git add packages/frontend/src/components/InfraBoardDashboard/FaseladderOverview.test.tsx packages/frontend/src/components/InfraBoardDashboard/PhaseDetail.test.tsx
  git commit -m "test(frontend): fix Faseladder/PhaseDetail tests for the twelve-phase catalogue (R5.2 real, R5.3 beyond)"
  ```

  If Step 4 required fixes beyond Steps 1-2 in files not staged above,
  include them in this commit (`git add -A` instead) with the same message.
