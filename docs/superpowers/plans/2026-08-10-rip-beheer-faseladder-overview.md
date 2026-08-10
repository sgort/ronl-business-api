# Beheer — Faseladder Overview (Sub-project B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded single-phase Beheer rail/page with a
Faseladder overview covering all nine RIP sub-processes — four KPIs and a
stage-grouped table, each metric a single combined (mock+live) number with
a "· N live" annotation, matching the pattern already established on the
Portfolio page.

**Architecture:** Two small backend additions (a count-only Operaton query,
one route) feed a live-counts hook. A pure-function layer
(`rip-phase-counts.ts`) combines that with mock counts derived from an
expanded 42-project mock dataset (ported from the handoff's
`reference/pb-data.reference.jsx`) and computes the "Klaar" (ready-to-start)
figure once, on the combined total — never twice. A new
`FaseladderOverview.tsx` renders it; rail config and router wiring make it
reachable.

**Tech Stack:** TypeScript, Express, axios, Jest/ts-jest/supertest
(backend); React, Vitest, `@testing-library/react`, MSW (frontend).

## Global Constraints

- Every metric is **one combined number** (mock + live summed) with a
  "· N live" annotation shown only when the live subset is nonzero — never
  two parallel totals (spec: "Scope", §4, §6).
- R2.1's Klaar figure is always `undefined` (rendered "—") — it has no
  predecessor on the ladder (spec §4).
- Mock data changes in `infra-board.data.ts` are strictly additive — the
  existing `phase`/`PHASE_DUR`/`phaseStatuses` fields and everything reading
  them (`Portfolio.tsx`) are untouched (spec §5, "Out of scope").
- Table rows are not clickable in this sub-project (spec §7, "Out of
  scope" — row click → phase detail is sub-projects C/D).
- Reuse `.pb-*`/`.v2-*` CSS conventions already in
  `dashboard-infra.css` — no new visual language.

---

### Task 1: Backend — `OperatonService.getPhaseInstanceCounts`

**Files:**

- Modify: `packages/backend/src/services/operaton.service.ts` (add after
  `getDeployedProcessKeys`)
- Test: `packages/backend/src/services/operaton.service.test.ts`

**Interfaces:**

- Consumes: `this.client` (existing mocked-axios instance).
- Produces: `getPhaseInstanceCounts(keys: string[]): Promise<Record<string,
{wip: number; gereed: number}>>` — Task 2's route calls this exact
  method.

- [ ] **Step 1: Write the failing tests**

  Add to `operaton.service.test.ts`, after the `describe('getDeployedProcessKeys', ...)` block:

  ```ts
  describe('getPhaseInstanceCounts', () => {
    it('queries active + completed counts per key and maps the result', async () => {
      mockClient.get.mockImplementation(
        (url: string, config: { params: Record<string, unknown> }) => {
          if (url === '/process-instance/count') {
            return Promise.resolve({ data: { count: 3 } });
          }
          if (url === '/history/process-instance/count') {
            return Promise.resolve({ data: { count: 7 } });
          }
          throw new Error(`unexpected url ${url}`);
        }
      );

      const result = await svc.getPhaseInstanceCounts(['RipPhase1Process']);

      expect(result).toEqual({ RipPhase1Process: { wip: 3, gereed: 7 } });
      expect(mockClient.get).toHaveBeenCalledWith('/process-instance/count', {
        params: { processDefinitionKey: 'RipPhase1Process' },
      });
      expect(mockClient.get).toHaveBeenCalledWith('/history/process-instance/count', {
        params: { processDefinitionKey: 'RipPhase1Process', finished: true },
      });
    });

    it('queries multiple keys in parallel', async () => {
      mockClient.get.mockImplementation(
        (_url: string, config: { params: { processDefinitionKey: string } }) =>
          Promise.resolve({ data: { count: config.params.processDefinitionKey === 'A' ? 1 : 2 } })
      );

      const result = await svc.getPhaseInstanceCounts(['A', 'B']);

      expect(result).toEqual({
        A: { wip: 1, gereed: 1 },
        B: { wip: 2, gereed: 2 },
      });
    });

    it('rethrows on failure', async () => {
      mockClient.get.mockRejectedValue(new Error('boom'));

      await expect(svc.getPhaseInstanceCounts(['RipPhase1Process'])).rejects.toThrow('boom');
    });
  });
  ```

- [ ] **Step 2: Run tests to verify they fail**

  Run (from `packages/backend`):
  `npx jest src/services/operaton.service.test.ts -t "getPhaseInstanceCounts" --no-coverage`

  Expected: FAIL — `svc.getPhaseInstanceCounts is not a function`.

- [ ] **Step 3: Write minimal implementation**

  In `operaton.service.ts`, add after `getDeployedProcessKeys`:

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
            this.client.get('/process-instance/count', {
              params: { processDefinitionKey: key },
            }),
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

- [ ] **Step 4: Run tests to verify they pass**

  Run (from `packages/backend`):
  `npx jest src/services/operaton.service.test.ts -t "getPhaseInstanceCounts" --no-coverage`

  Expected: PASS (3 tests).

- [ ] **Step 5: Run the full file to confirm no regressions**

  Run (from `packages/backend`): `npx jest src/services/operaton.service.test.ts --no-coverage`

  Expected: PASS, all tests.

- [ ] **Step 6: Commit**

  ```bash
  git add packages/backend/src/services/operaton.service.ts packages/backend/src/services/operaton.service.test.ts
  git commit -m "feat(backend): add OperatonService.getPhaseInstanceCounts"
  ```

---

### Task 2: Backend — `GET /v1/rip/phases/counts`

**Files:**

- Modify: `packages/backend/src/routes/rip.routes.ts` (add after the
  `/phases/deployment-status` route)
- Test: `packages/backend/src/routes/rip.routes.test.ts`

**Interfaces:**

- Consumes: `RIP_PHASE_KEYS` from `@ronl/shared` (already imported in this
  file); `operatonService.getDeployedProcessKeys` (already used by this
  file); `operatonService.getPhaseInstanceCounts` (Task 1).
- Produces: `GET /v1/rip/phases/counts` → `200 { success: true, data: {
counts: Record<string, {wip, gereed}> } }`, `401` unauthenticated, `500
{ error: { code: 'PHASE_COUNTS_FAILED' } }` on failure. Task 5's
  `businessApi.rip.phasesCounts()` calls this exact path/shape.

- [ ] **Step 1: Write the failing tests**

  Add `getPhaseInstanceCounts: jest.fn()` to the `jest.mock('@services/operaton.service', ...)`
  factory and the `svc` typed alias in `rip.routes.test.ts` (alongside the
  three existing entries), then add a new `describe` block after
  `describe('GET /phases/deployment-status', ...)`:

  ```ts
  describe('GET /phases/counts', () => {
    it('401 without a token', async () => {
      const res = await request(app).get('/v1/rip/phases/counts');
      expect(res.status).toBe(401);
    });

    it('returns counts for the deployed keys only', async () => {
      svc.getDeployedProcessKeys.mockResolvedValue(['RipPhase1Process']);
      svc.getPhaseInstanceCounts.mockResolvedValue({
        RipPhase1Process: { wip: 3, gereed: 7 },
      });
      const res = await auth(request(app).get('/v1/rip/phases/counts'));
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ counts: { RipPhase1Process: { wip: 3, gereed: 7 } } });
      expect(svc.getPhaseInstanceCounts).toHaveBeenCalledWith(['RipPhase1Process']);
    });

    it('500 with PHASE_COUNTS_FAILED on service failure', async () => {
      svc.getDeployedProcessKeys.mockResolvedValue(['RipPhase1Process']);
      svc.getPhaseInstanceCounts.mockRejectedValue(new Error('boom'));
      const res = await auth(request(app).get('/v1/rip/phases/counts'));
      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe('PHASE_COUNTS_FAILED');
    });
  });
  ```

- [ ] **Step 2: Run tests to verify they fail**

  Run (from `packages/backend`):
  `npx jest src/routes/rip.routes.test.ts -t "phases/counts" --no-coverage`

  Expected: FAIL — 404 (route doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

  In `rip.routes.ts`, add after the `/phases/deployment-status` route:

  ```ts
  /**
   * GET /v1/rip/phases/counts
   * WIP + Gereed instance counts per deployed RIP phase process-definition key.
   */
  router.get('/phases/counts', async (req, res) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
    }
    try {
      const keys = RIP_PHASE_KEYS.map((p) => p.processDefinitionKey).filter(
        (k): k is string => !!k
      );
      const deployedKeys = await operatonService.getDeployedProcessKeys(keys);
      const counts = await operatonService.getPhaseInstanceCounts(deployedKeys);
      res.json({ success: true, data: { counts } });
    } catch (error) {
      logger.error('Failed to fetch RIP phase instance counts', {
        tenantId: req.user.tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      res.status(500).json({
        success: false,
        error: {
          code: 'PHASE_COUNTS_FAILED',
          message: 'Failed to retrieve phase instance counts',
        },
      });
    }
  });
  ```

- [ ] **Step 4: Run tests to verify they pass**

  Run (from `packages/backend`):
  `npx jest src/routes/rip.routes.test.ts -t "phases/counts" --no-coverage`

  Expected: PASS (3 tests).

- [ ] **Step 5: Run the full file to confirm no regressions**

  Run (from `packages/backend`): `npx jest src/routes/rip.routes.test.ts --no-coverage`

  Expected: PASS, all tests.

- [ ] **Step 6: Commit**

  ```bash
  git add packages/backend/src/routes/rip.routes.ts packages/backend/src/routes/rip.routes.test.ts
  git commit -m "feat(backend): add GET /v1/rip/phases/counts"
  ```

---

### Task 3: Frontend — `rip-phase-counts.ts` (Klaar formula + combining)

**Files:**

- Create: `packages/frontend/src/pages/infra-board/rip-phase-counts.ts`
- Test: `packages/frontend/src/pages/infra-board/rip-phase-counts.test.ts`

**Interfaces:**

- Consumes: `RipPhase` type from `./rip-phases.catalog` (sub-project A).
- Produces: `PhaseCounts`, `AnnotatedPhaseCounts` types;
  `getKlaarCounts(phases, counts)`; `combinePhaseCounts(mock, live)`;
  `normalizeLiveCounts(raw, phases)` — converts the backend's
  processDefinitionKey-keyed `{wip, gereed}` response into a phase-code-keyed
  `PhaseCounts` map (`geparkeerd: 0` always, since Operaton has no such
  concept). Task 4 (`getMockPhaseCounts`) and Task 6
  (`FaseladderOverview.tsx`) both import from this file.

- [ ] **Step 1: Write the failing tests**

  Create `rip-phase-counts.test.ts`:

  ```ts
  import { describe, expect, it } from 'vitest';
  import {
    combinePhaseCounts,
    getKlaarCounts,
    normalizeLiveCounts,
    type PhaseCounts,
  } from './rip-phase-counts';
  import { RIP_PHASES } from './rip-phases.catalog';

  describe('getKlaarCounts', () => {
    it('is always undefined for the first phase (no predecessor)', () => {
      const counts: Record<string, PhaseCounts> = {};
      const result = getKlaarCounts(RIP_PHASES, counts);
      expect(result[RIP_PHASES[0].code]).toBeUndefined();
    });

    it('computes klaar[N] = max(0, gereed[N-1] - wip[N] - gereed[N])', () => {
      const counts: Record<string, PhaseCounts> = {
        'R2.1': { wip: 0, gereed: 10, geparkeerd: 0 },
        'R2.2': { wip: 2, gereed: 3, geparkeerd: 0 },
      };
      const result = getKlaarCounts(RIP_PHASES, counts);
      expect(result['R2.2']).toBe(5); // 10 - 2 - 3
    });

    it('floors at 0 rather than going negative', () => {
      const counts: Record<string, PhaseCounts> = {
        'R2.1': { wip: 0, gereed: 1, geparkeerd: 0 },
        'R2.2': { wip: 5, gereed: 5, geparkeerd: 0 },
      };
      const result = getKlaarCounts(RIP_PHASES, counts);
      expect(result['R2.2']).toBe(0);
    });

    it('treats a phase missing from counts as all-zero', () => {
      const result = getKlaarCounts(RIP_PHASES, {});
      expect(result['R2.2']).toBe(0);
    });
  });

  describe('combinePhaseCounts', () => {
    it('sums mock + live per field and carries the live figures for annotation', () => {
      const mock = { 'R2.1': { wip: 4, gereed: 10, geparkeerd: 1 } };
      const live = { 'R2.1': { wip: 1, gereed: 2, geparkeerd: 0 } };
      const result = combinePhaseCounts(mock, live);
      expect(result['R2.1']).toEqual({
        wip: 5,
        gereed: 12,
        geparkeerd: 1,
        liveWip: 1,
        liveGereed: 2,
        liveGeparkeerd: 0,
      });
    });

    it('produces a complete entry when a phase is present in only one input', () => {
      const mock = { 'R2.1': { wip: 4, gereed: 10, geparkeerd: 0 } };
      const live = {};
      const result = combinePhaseCounts(mock, live);
      expect(result['R2.1']).toEqual({
        wip: 4,
        gereed: 10,
        geparkeerd: 0,
        liveWip: 0,
        liveGereed: 0,
        liveGeparkeerd: 0,
      });
    });
  });

  describe('normalizeLiveCounts', () => {
    it('maps backend processDefinitionKey counts onto phase codes with geparkeerd: 0', () => {
      const raw = { RipPhase1Process: { wip: 3, gereed: 7 } };
      const result = normalizeLiveCounts(raw, RIP_PHASES);
      expect(result['R2.1']).toEqual({ wip: 3, gereed: 7, geparkeerd: 0 });
      expect(result['R2.2']).toBeUndefined();
    });
  });
  ```

- [ ] **Step 2: Run tests to verify they fail**

  Run (from `packages/frontend`):
  `npx vitest run src/pages/infra-board/rip-phase-counts.test.ts`

  Expected: FAIL — module `./rip-phase-counts` does not exist.

- [ ] **Step 3: Write minimal implementation**

  Create `rip-phase-counts.ts`:

  ```ts
  /**
   * Combines mock and live per-phase instance counts into a single figure
   * per metric, with the live subset kept alongside for annotation — the
   * same pattern as Portfolio's "23 projecten · 5 actieve instanties"
   * header and LIVE badge. See
   * docs/superpowers/specs/2026-08-10-rip-beheer-faseladder-overview-design.md.
   */
  import type { RipPhase } from './rip-phases.catalog';

  export interface PhaseCounts {
    wip: number;
    gereed: number;
    /** R5.2 only (beyond: true). Always 0 for live counts today — nothing
     *  can reach R5.2 while only R2.1 is deployed. */
    geparkeerd: number;
  }

  export interface AnnotatedPhaseCounts extends PhaseCounts {
    liveWip: number;
    liveGereed: number;
    liveGeparkeerd: number;
  }

  const EMPTY: PhaseCounts = { wip: 0, gereed: 0, geparkeerd: 0 };

  /**
   * klaar[N] = max(0, gereed[N-1] - wip[N] - gereed[N]) — projects that
   * finished the previous phase but haven't reached this one yet. The first
   * phase in ladder order has no predecessor, so it's always undefined
   * (render "—", not 0 — there's nothing to be ready *for*).
   */
  export function getKlaarCounts(
    phases: RipPhase[],
    counts: Record<string, PhaseCounts>
  ): Record<string, number | undefined> {
    const out: Record<string, number | undefined> = {};
    phases.forEach((phase, i) => {
      if (i === 0) {
        out[phase.code] = undefined;
        return;
      }
      const prev = counts[phases[i - 1].code] ?? EMPTY;
      const cur = counts[phase.code] ?? EMPTY;
      out[phase.code] = Math.max(0, prev.gereed - cur.wip - cur.gereed);
    });
    return out;
  }

  /** Sums mock + live per phase; keeps the live figures alongside for the
   *  "· N live" annotation shown next to each combined number. */
  export function combinePhaseCounts(
    mock: Record<string, PhaseCounts>,
    live: Record<string, PhaseCounts>
  ): Record<string, AnnotatedPhaseCounts> {
    const codes = new Set([...Object.keys(mock), ...Object.keys(live)]);
    const out: Record<string, AnnotatedPhaseCounts> = {};
    for (const code of codes) {
      const m = mock[code] ?? EMPTY;
      const l = live[code] ?? EMPTY;
      out[code] = {
        wip: m.wip + l.wip,
        gereed: m.gereed + l.gereed,
        geparkeerd: m.geparkeerd + l.geparkeerd,
        liveWip: l.wip,
        liveGereed: l.gereed,
        liveGeparkeerd: l.geparkeerd,
      };
    }
    return out;
  }

  /** The backend keys its response by processDefinitionKey (an engine
   *  fact); the UI keys everything else by phase code. Remaps one to the
   *  other, filling geparkeerd: 0 — Operaton has no such concept. */
  export function normalizeLiveCounts(
    raw: Record<string, { wip: number; gereed: number }>,
    phases: RipPhase[]
  ): Record<string, PhaseCounts> {
    const out: Record<string, PhaseCounts> = {};
    for (const phase of phases) {
      if (!phase.processDefinitionKey) continue;
      const c = raw[phase.processDefinitionKey];
      if (c) out[phase.code] = { wip: c.wip, gereed: c.gereed, geparkeerd: 0 };
    }
    return out;
  }
  ```

- [ ] **Step 4: Run tests to verify they pass**

  Run (from `packages/frontend`):
  `npx vitest run src/pages/infra-board/rip-phase-counts.test.ts`

  Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

  ```bash
  git add packages/frontend/src/pages/infra-board/rip-phase-counts.ts packages/frontend/src/pages/infra-board/rip-phase-counts.test.ts
  git commit -m "feat(frontend): add rip-phase-counts (Klaar formula, mock+live combining)"
  ```

---

### Task 4: Frontend — mock data (42 projects + ladder mapping)

**Files:**

- Modify: `packages/frontend/src/pages/infra-board/infra-board.data.ts`
- Test: create `packages/frontend/src/pages/infra-board/infra-board.data.test.ts`
  if it doesn't already exist (check first — if it exists, extend it)

**Interfaces:**

- Consumes: `RIP_PHASES` from `./rip-phases.catalog` (sub-project A);
  `PhaseCounts` type from `./rip-phase-counts` (Task 3).
- Produces: `PortfolioProject` gains `ripPhaseCode: string` and
  `ripPhaseState: 'wip' | 'wachtend'`; new `getMockPhaseCounts(): Record<string,
PhaseCounts>`. Task 6 imports `getMockPhaseCounts`.

- [ ] **Step 1: Write the failing tests**

  `infra-board.data.test.ts` already exists. Change its existing import
  line

  ```ts
  import {
    getMockPortfolio,
    getMockTodos,
    getMockUpdates,
    makePhase1Row,
    normalizeLeadRole,
    PHASE_DUR,
    TL,
  } from './infra-board.data';
  ```

  to add `getMockPhaseCounts`:

  ```ts
  import {
    getMockPhaseCounts,
    getMockPortfolio,
    getMockTodos,
    getMockUpdates,
    makePhase1Row,
    normalizeLeadRole,
    PHASE_DUR,
    TL,
  } from './infra-board.data';
  ```

  and add a second import line for `RIP_PHASES` (the file already imports
  `PHASES` from `./rip-model` — this is a separate, additional import, not
  a replacement):

  ```ts
  import { RIP_PHASES } from './rip-phases.catalog';
  ```

  Then append these two new `describe` blocks at the end of the file
  (after the existing `describe('getMockUpdates', ...)` block):

  ```ts
  describe('getMockPortfolio — RIP ladder fields', () => {
    it('returns 42 projects', () => {
      expect(getMockPortfolio()).toHaveLength(42);
    });

    it('keeps the old 6-phase `phase` field intact (Portfolio.tsx compat)', () => {
      const p = getMockPortfolio()[0];
      expect(typeof p.phase).toBe('number');
      expect(p.phase).toBeGreaterThanOrEqual(1);
      expect(p.phase).toBeLessThanOrEqual(6);
    });

    it('assigns every project a valid ripPhaseCode and ripPhaseState', () => {
      const codes = new Set(RIP_PHASES.map((p) => p.code));
      for (const p of getMockPortfolio()) {
        expect(codes.has(p.ripPhaseCode)).toBe(true);
        expect(['wip', 'wachtend']).toContain(p.ripPhaseState);
      }
    });

    it('is deterministic across calls (same hash input every time)', () => {
      const a = getMockPortfolio().map((p) => p.ripPhaseCode);
      const b = getMockPortfolio().map((p) => p.ripPhaseCode);
      expect(a).toEqual(b);
    });
  });

  describe('getMockPhaseCounts', () => {
    it('accounts for every project exactly once per phase bucket', () => {
      const counts = getMockPhaseCounts();
      const projects = getMockPortfolio();

      RIP_PHASES.forEach((phase, i) => {
        const atThisPhase = projects.filter((p) => p.ripPhaseCode === phase.code);
        const wipHere = atThisPhase.filter((p) => p.ripPhaseState === 'wip').length;
        const geparkeerdHere = phase.beyond ? atThisPhase.length : 0;
        expect(counts[phase.code].wip).toBe(phase.beyond ? 0 : wipHere);
        expect(counts[phase.code].geparkeerd).toBe(geparkeerdHere);

        const beforeThisPhase = projects.filter(
          (p) => RIP_PHASES.findIndex((rp) => rp.code === p.ripPhaseCode) < i
        ).length;
        expect(counts[phase.code].gereed).toBe(beforeThisPhase);
      });
    });
  });
  ```

- [ ] **Step 2: Run tests to verify they fail**

  Run (from `packages/frontend`):
  `npx vitest run src/pages/infra-board/infra-board.data.test.ts`

  Expected: FAIL — 18 projects instead of 42; `ripPhaseCode`/`ripPhaseState`
  undefined; `getMockPhaseCounts` not exported.

- [ ] **Step 3: Write minimal implementation**

  In `infra-board.data.ts`:
  1. Add the import at the top (alongside the existing `rip-model` import):

     ```ts
     import { RIP_PHASES, type RipPhase } from './rip-phases.catalog';
     import type { PhaseCounts } from './rip-phase-counts';
     ```

  2. Replace the existing 18-row `RAW` array with the full 42-row array
     (verbatim from `docs/infra-beheer-handoff/reference/pb-data.reference.jsx`):

     ```ts
     const RAW: Raw[] = [
       [
         '23102',
         'Kuinderweg — reconstructie N712',
         5,
         'projectleider',
         'groen',
         {},
         'Oplevering deelvak 2',
         '€ 8,4 mln',
         2023,
         2,
       ],
       [
         '23045',
         'Nijkerkerbrug — renovatie val',
         5,
         'manager-pb',
         'geel',
         { 5: 'risk' },
         'Verkeersmaatregel fase 3',
         '€ 31 mln',
         2023,
         1,
       ],
       [
         '24011',
         'Larserweg — ongelijkvloerse aansluiting',
         4,
         'projectleider',
         'groen',
         {},
         'Gunning aannemer',
         '€ 19 mln',
         2024,
         1,
       ],
       [
         '22087',
         'Ramspolbrug — vervanging bewegingswerk',
         6,
         'manager-pb',
         'groen',
         {},
         'Eindafrekening',
         '€ 12 mln',
         2022,
         1,
       ],
       [
         '24102',
         'Gooiseweg — verbreding N305',
         3,
         'projectleider',
         'geel',
         { 3: 'risk' },
         'Vaststellen VO',
         '€ 44 mln',
         2024,
         2,
       ],
       [
         '25008',
         'Hanzeweg — fietsbrug Dronten',
         1,
         'projectleider',
         'groen',
         { 1: 'action' },
         'PSU-verslag accorderen',
         '€ 6,1 mln',
         2025,
         3,
       ],
       [
         '23201',
         'Vogelweg — rotonde Lelystad-Oost',
         5,
         'manager-pb',
         'rood',
         { 5: 'overdue' },
         'Stremming oplossen',
         '€ 4,8 mln',
         2023,
         3,
       ],
       [
         '24056',
         'Knardijk — dijkversterking traverse',
         4,
         'projectleider',
         'groen',
         {},
         'Aanbestedingsleidraad',
         '€ 27 mln',
         2024,
         2,
       ],
       [
         '25031',
         'Espelerweg — groot onderhoud',
         1,
         'projectleider',
         'groen',
         { 1: 'active' },
         'Intake-verslag',
         '€ 3,2 mln',
         2025,
         4,
       ],
       [
         '22119',
         'Ketelbrug — conservering staal',
         6,
         'manager-pb',
         'groen',
         {},
         'Decharge-rapport',
         '€ 9,7 mln',
         2022,
         2,
       ],
       [
         '24077',
         'Domineesweg — verkeersveiligheid',
         3,
         'projectleider',
         'groen',
         {},
         'Ontwerpnota',
         '€ 5,5 mln',
         2024,
         1,
       ],
       [
         '25014',
         'Urkerweg — aansluiting A6',
         2,
         'manager-pb',
         'geel',
         { 2: 'risk' },
         'Variantenstudie',
         '€ 22 mln',
         2025,
         1,
       ],
       [
         '23166',
         'Swifterringweg — reconstructie',
         5,
         'projectleider',
         'groen',
         {},
         'Asfaltfase 2',
         '€ 7,9 mln',
         2023,
         2,
       ],
       [
         '24130',
         'Dronterweg — ecoduct',
         4,
         'projectleider',
         'geel',
         {},
         'Marktconsultatie',
         '€ 14 mln',
         2024,
         3,
       ],
       [
         '25022',
         'Hoge Vaart — bruggen renovatie (3x)',
         1,
         'manager-pb',
         'groen',
         { 1: 'active' },
         'Uitgangspunten VO-fase',
         '€ 18 mln',
         2025,
         2,
       ],
       [
         '23078',
         'Marknesserweg — passeerstroken',
         5,
         'projectleider',
         'groen',
         {},
         'Bermbeveiliging',
         '€ 2,6 mln',
         2023,
         4,
       ],
       [
         '22203',
         'Lage Vaart — sluis Kampen',
         6,
         'manager-pb',
         'geel',
         {},
         'Restpunten',
         '€ 21 mln',
         2022,
         3,
       ],
       [
         '24090',
         'Tollebekerweg — fietspad',
         3,
         'projectleider',
         'groen',
         {},
         'Definitief ontwerp',
         '€ 4,1 mln',
         2024,
         2,
       ],
       [
         '25040',
         'Baanweg — kruispunt N709',
         2,
         'projectleider',
         'groen',
         {},
         'Voorkeursvariant',
         '€ 8,8 mln',
         2025,
         1,
       ],
       [
         '23133',
         'Ramsweg — geluidsmaatregelen',
         4,
         'manager-pb',
         'rood',
         { 4: 'overdue' },
         'Bezwaar afhandelen',
         '€ 6,3 mln',
         2023,
         2,
       ],
       [
         '24044',
         'Vlierweg — verbreding',
         5,
         'projectleider',
         'groen',
         {},
         'Oplevering',
         '€ 11 mln',
         2024,
         1,
       ],
       [
         '25055',
         'Pijlerweg — nieuwe ontsluiting',
         1,
         'projectleider',
         'geel',
         { 1: 'action' },
         'Intake-overleg',
         '€ 16 mln',
         2025,
         3,
       ],
       [
         '23190',
         'Bremerbergweg — recreatieverkeer',
         5,
         'manager-pb',
         'groen',
         {},
         'Markeringen',
         '€ 3,4 mln',
         2023,
         3,
       ],
       [
         '24118',
         'Wisentweg — duurzaam asfalt pilot',
         3,
         'projectleider',
         'groen',
         {},
         'VO vaststellen',
         '€ 9,2 mln',
         2024,
         2,
       ],
       [
         '22150',
         'Hertenweg — onderhoud kunstwerken',
         6,
         'manager-pb',
         'groen',
         {},
         'Eindoplevering',
         '€ 5,8 mln',
         2022,
         2,
       ],
       [
         '25067',
         'Ossenkampweg — verkeersplein',
         2,
         'projectleider',
         'groen',
         {},
         'Omgevingsproces',
         '€ 13 mln',
         2025,
         1,
       ],
       [
         '24063',
         'Visvijverweg — natuurvriendelijke oever',
         4,
         'projectleider',
         'geel',
         {},
         'Aanbesteding',
         '€ 7,1 mln',
         2024,
         3,
       ],
       [
         '23215',
         'Elandweg — reconstructie N306',
         5,
         'manager-pb',
         'rood',
         { 5: 'overdue' },
         'Vertraging levering',
         '€ 24 mln',
         2023,
         1,
       ],
       [
         '25073',
         'Reigerweg — fietsstraat',
         1,
         'projectleider',
         'groen',
         { 1: 'active' },
         'Intake-verslag',
         '€ 2,9 mln',
         2025,
         4,
       ],
       [
         '24025',
         'Buizerdweg — komgrens herinrichting',
         3,
         'projectleider',
         'groen',
         {},
         'Ontwerp',
         '€ 4,7 mln',
         2024,
         1,
       ],
       [
         '22168',
         'Meeuwenweg — brugbediening centraliseren',
         6,
         'manager-pb',
         'groen',
         {},
         'Decharge',
         '€ 17 mln',
         2022,
         2,
       ],
       [
         '25081',
         'Karekietweg — aansluiting bedrijventerrein',
         2,
         'projectleider',
         'groen',
         {},
         'Variantenstudie',
         '€ 10 mln',
         2025,
         2,
       ],
       [
         '24142',
         'Plevierweg — verkeerslichten',
         4,
         'manager-pb',
         'groen',
         {},
         'Gunning',
         '€ 3,8 mln',
         2024,
         2,
       ],
       [
         '23240',
         'Futenweg — groot onderhoud',
         5,
         'projectleider',
         'geel',
         {},
         'Deklaag',
         '€ 6,6 mln',
         2023,
         4,
       ],
       [
         '25090',
         'Aalscholverweg — nieuwe rotonde',
         1,
         'projectleider',
         'groen',
         { 1: 'active' },
         'Intake-formulier',
         '€ 5,2 mln',
         2025,
         3,
       ],
       [
         '24158',
         'Zwaanweg — onderdoorgang spoor',
         3,
         'manager-pb',
         'geel',
         { 3: 'risk' },
         'VO ProRail-afstemming',
         '€ 38 mln',
         2024,
         1,
       ],
       [
         '23260',
         'Roerdompweg — bermverharding',
         5,
         'projectleider',
         'groen',
         {},
         'Afronding',
         '€ 1,9 mln',
         2023,
         4,
       ],
       [
         '25104',
         'Kievitweg — schoolzone',
         2,
         'projectleider',
         'groen',
         {},
         'Omgevingsproces',
         '€ 2,4 mln',
         2025,
         1,
       ],
       [
         '24170',
         'Lepelaarweg — verbreding N701',
         4,
         'projectleider',
         'groen',
         {},
         'Aanbestedingsdossier',
         '€ 29 mln',
         2024,
         2,
       ],
       [
         '22185',
         'Sterappelweg — kunstwerk renovatie',
         6,
         'manager-pb',
         'groen',
         {},
         'Eindafrekening',
         '€ 8,1 mln',
         2022,
         3,
       ],
       [
         '25118',
         'Goudplevierweg — fietstunnel',
         1,
         'projectleider',
         'geel',
         { 1: 'action' },
         'Intake-overleg',
         '€ 12 mln',
         2025,
         2,
       ],
       [
         '24188',
         'Kwartelweg — herinrichting centrum',
         3,
         'manager-pb',
         'groen',
         {},
         'Definitief ontwerp',
         '€ 15 mln',
         2024,
         3,
       ],
     ];
     ```

  3. Add the ported ladder-spreading mechanism, just above
     `getMockPortfolio`:

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

     /** Deterministic per-project coin flip: sits this project BETWEEN two phases? */
     function pbAwaits(nr: string): boolean {
       return pbHash(nr + '|await') % 100 < 30;
     }
     ```

  4. Extend `PortfolioProject`:

     ```ts
     export interface PortfolioProject {
       id: string;
       nr: string;
       naam: string;
       phase: number;
       role: string;
       health: HealthKey;
       phaseStatuses: StatusKey[];
       milestone: string;
       budget: string;
       startYear: number;
       start: number;
       end: number;
       segments: GanttSegment[];
       /** Set when this row is backed by a live Operaton process instance. */
       instanceId?: string;
       /** Position on the real 9-phase RIP ladder (R2.1…R5.2). Additive —
        *  unrelated to `phase` above, which stays on the old 6-phase model
        *  for Portfolio.tsx compatibility. */
       ripPhaseCode: string;
       ripPhaseState: 'wip' | 'wachtend';
     }
     ```

  5. In `getMockPortfolio()`'s `RAW.map(...)` callback, compute and attach
     the two new fields (the callback already destructures `phase` as the
     legacy 1–6 value — reuse it, don't shadow it):

     ```ts
     const ladderPos = pbLadderFor(nr, phase);
     const ripPhaseCode = RIP_PHASES[ladderPos - 1].code;
     const awaiting = ladderPos > 1 && ladderPos < RIP_PHASES.length && pbAwaits(nr);
     const ripPhaseState: 'wip' | 'wachtend' = awaiting ? 'wachtend' : 'wip';
     ```

     and add `ripPhaseCode, ripPhaseState` to the returned object literal.

  6. Add `getMockPhaseCounts`, after `getMockPortfolio`:

     ```ts
     /**
      * WIP / Gereed / geparkeerd counts per RIP phase, derived from the mock
      * projects' ripPhaseCode/ripPhaseState. Mirrors
      * reference/pb-instances.reference.jsx's status derivation.
      */
     export function getMockPhaseCounts(): Record<string, PhaseCounts> {
       const projects = getMockPortfolio();
       const out: Record<string, PhaseCounts> = {};
       RIP_PHASES.forEach((phase: RipPhase, i) => {
         let wip = 0;
         let gereed = 0;
         let geparkeerd = 0;
         for (const p of projects) {
           const curIdx = RIP_PHASES.findIndex((rp) => rp.code === p.ripPhaseCode);
           if (phase.beyond) {
             if (curIdx === i) geparkeerd++;
             continue;
           }
           if (curIdx < i) gereed++;
           else if (curIdx === i && p.ripPhaseState === 'wip') wip++;
         }
         out[phase.code] = { wip, gereed, geparkeerd };
       });
       return out;
     }
     ```

- [ ] **Step 4: Run tests to verify they pass**

  Run (from `packages/frontend`):
  `npx vitest run src/pages/infra-board/infra-board.data.test.ts`

  Expected: PASS.

- [ ] **Step 5: Run the full Portfolio test file to confirm no regression**

  Run (from `packages/frontend`): `npx vitest run src/components/InfraBoardDashboard/Portfolio.test.tsx`

  Expected: PASS — `Portfolio.tsx` reads only the unchanged `phase` field,
  so growing `RAW` to 42 rows must not break it (the "total" assertion in
  that test reads `getMockPortfolio().length` dynamically, so it adapts
  automatically).

- [ ] **Step 6: Commit**

  ```bash
  git add packages/frontend/src/pages/infra-board/infra-board.data.ts packages/frontend/src/pages/infra-board/infra-board.data.test.ts
  git commit -m "feat(frontend): expand mock portfolio to 42 projects, add RIP ladder fields"
  ```

---

### Task 5: Frontend — live counts hook

**Files:**

- Modify: `packages/frontend/src/services/api.ts` (add `phasesCounts` to
  the `rip: { ... }` namespace)
- Modify: `packages/frontend/src/services/infra.api.ts` (add
  `useLivePhaseCounts`)
- Test: `packages/frontend/src/services/api.test.ts`
- Test: `packages/frontend/src/services/infra.api.test.ts`

**Interfaces:**

- Consumes: Task 2's `GET /v1/rip/phases/counts`.
- Produces: `businessApi.rip.phasesCounts(): Promise<ApiResponse<{
counts: Record<string, {wip, gereed}> }>>`; `useLivePhaseCounts():
AsyncState<{ counts: Record<string, {wip, gereed}> }>`. Task 6 calls
  `useLivePhaseCounts()` and feeds `data.counts` through
  `normalizeLiveCounts` (Task 3).

- [ ] **Step 1: Write the failing tests**

  In `api.test.ts`, add to `describe('businessApi.rip', ...)` after the
  `deploymentStatus` test:

  ```ts
  it('phasesCounts fetches per-phase WIP/Gereed counts', async () => {
    server.use(
      http.get('*/rip/phases/counts', () =>
        HttpResponse.json({
          success: true,
          data: { counts: { RipPhase1Process: { wip: 3, gereed: 7 } } },
        })
      )
    );
    expect(await businessApi.rip.phasesCounts()).toEqual({
      success: true,
      data: { counts: { RipPhase1Process: { wip: 3, gereed: 7 } } },
    });
  });
  ```

  In `infra.api.test.ts`, add `phasesCounts: vi.fn()` to
  `mockBusinessApi.rip`, add `useLivePhaseCounts` to the import, and add a
  `describe` block after `describe('useDeployedProcessKeys', ...)`:

  ```ts
  describe('useLivePhaseCounts', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('loads the phase counts and exposes them once resolved', async () => {
      mockBusinessApi.rip.phasesCounts.mockResolvedValue({
        success: true,
        data: { counts: { RipPhase1Process: { wip: 3, gereed: 7 } } },
      });

      const { result } = renderHook(() => useLivePhaseCounts());

      expect(result.current.loading).toBe(true);
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.data).toEqual({
        counts: { RipPhase1Process: { wip: 3, gereed: 7 } },
      });
    });

    it('sets error state when the call rejects', async () => {
      mockBusinessApi.rip.phasesCounts.mockRejectedValue(new Error('network down'));

      const { result } = renderHook(() => useLivePhaseCounts());

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.error).toBe(true);
    });
  });
  ```

- [ ] **Step 2: Run tests to verify they fail**

  Run (from `packages/frontend`):

  ```
  npx vitest run src/services/api.test.ts -t "phasesCounts"
  npx vitest run src/services/infra.api.test.ts -t "useLivePhaseCounts"
  ```

  Expected: both FAIL.

- [ ] **Step 3: Write minimal implementation**

  In `api.ts`, inside `rip: { ... }`, after `deploymentStatus`:

  ```ts
    phasesCounts: async (): Promise<
      ApiResponse<{ counts: Record<string, { wip: number; gereed: number }> }>
    > => {
      const response = await api.get('/rip/phases/counts');
      return response.data;
    },
  ```

  In `infra.api.ts`, after `useDeployedProcessKeys`:

  ```ts
  /** Live per-phase WIP/Gereed instance counts for the Faseladder overview. */
  export const useLivePhaseCounts = () =>
    useAsync<{ counts: Record<string, { wip: number; gereed: number }> }>(
      () => businessApi.rip.phasesCounts(),
      []
    );
  ```

- [ ] **Step 4: Run tests to verify they pass**

  Same two commands as Step 2. Expected: both PASS.

- [ ] **Step 5: Run both full test files to confirm no regressions**

  Run (from `packages/frontend`):
  `npx vitest run src/services/api.test.ts src/services/infra.api.test.ts`

  Expected: PASS, all tests.

- [ ] **Step 6: Commit**

  ```bash
  git add packages/frontend/src/services/api.ts packages/frontend/src/services/api.test.ts packages/frontend/src/services/infra.api.ts packages/frontend/src/services/infra.api.test.ts
  git commit -m "feat(frontend): add businessApi.rip.phasesCounts and useLivePhaseCounts"
  ```

---

### Task 6: Frontend — `FaseladderOverview.tsx`

**Files:**

- Create: `packages/frontend/src/components/InfraBoardDashboard/FaseladderOverview.tsx`
- Test: `packages/frontend/src/components/InfraBoardDashboard/FaseladderOverview.test.tsx`
- Modify: `packages/frontend/src/pages/infra-board/dashboard-infra.css` (add
  KPI row + table styles)

**Interfaces:**

- Consumes: `useDeployedProcessKeys` (sub-project A), `useLivePhaseCounts`
  (Task 5); `RIP_PHASES`, `RIP_STAGES`, `RIP_DEPLOY_META`,
  `getPhaseDeployStatus` (sub-project A, `rip-phases.catalog.ts`);
  `getMockPhaseCounts` (Task 4); `getKlaarCounts`, `combinePhaseCounts`,
  `normalizeLiveCounts` (Task 3).
- Produces: `export default function FaseladderOverview(): JSX.Element` —
  no props (all data comes from hooks + mock data directly). Task 7 renders
  `<FaseladderOverview />` with no props.

- [ ] **Step 1: Write the failing test**

  Create `FaseladderOverview.test.tsx`:

  ```tsx
  // @vitest-environment jsdom
  import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
  import { render, screen } from '@testing-library/react';
  import FaseladderOverview from './FaseladderOverview';
  import { RIP_STAGES, RIP_PHASES } from '../../pages/infra-board/rip-phases.catalog';

  const mockUseDeployedProcessKeys = vi.hoisted(() => vi.fn());
  const mockUseLivePhaseCounts = vi.hoisted(() => vi.fn());
  vi.mock('../../services/infra.api', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../services/infra.api')>();
    return {
      ...actual,
      useDeployedProcessKeys: mockUseDeployedProcessKeys,
      useLivePhaseCounts: mockUseLivePhaseCounts,
    };
  });

  beforeEach(() => {
    mockUseDeployedProcessKeys.mockReturnValue({
      data: { deployedKeys: ['RipPhase1Process'] },
      loading: false,
      error: false,
      reload: vi.fn(),
    });
    mockUseLivePhaseCounts.mockReturnValue({
      data: { counts: { RipPhase1Process: { wip: 1, gereed: 2 } } },
      loading: false,
      error: false,
      reload: vi.fn(),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('FaseladderOverview', () => {
    it('renders one row per phase, grouped under four stage headers', () => {
      render(<FaseladderOverview />);
      RIP_PHASES.forEach((p) => {
        expect(screen.getByText(p.code, { exact: false })).toBeInTheDocument();
      });
      RIP_STAGES.forEach((s) => {
        expect(screen.getByText(s.name, { exact: false })).toBeInTheDocument();
      });
    });

    it('shows a live annotation only for R2.1, which has nonzero live counts', () => {
      render(<FaseladderOverview />);
      expect(screen.getAllByText('1 live').length).toBeGreaterThan(0);
    });

    it('renders the deployment pill for R2.1 as gedeployed', () => {
      render(<FaseladderOverview />);
      expect(screen.getByText('Gedeployed')).toBeInTheDocument();
    });

    it('does not render table rows as clickable', () => {
      const { container } = render(<FaseladderOverview />);
      expect(container.querySelectorAll('tbody tr button')).toHaveLength(0);
    });
  });
  ```

- [ ] **Step 2: Run test to verify it fails**

  Run (from `packages/frontend`):
  `npx vitest run src/components/InfraBoardDashboard/FaseladderOverview.test.tsx`

  Expected: FAIL — module does not exist.

- [ ] **Step 3: Write minimal implementation**

  Create `FaseladderOverview.tsx`:

  ```tsx
  import { Fragment } from 'react';
  import {
    RIP_PHASES,
    RIP_STAGES,
    RIP_DEPLOY_META,
    getPhaseDeployStatus,
  } from '../../pages/infra-board/rip-phases.catalog';
  import { getMockPhaseCounts } from '../../pages/infra-board/infra-board.data';
  import {
    combinePhaseCounts,
    getKlaarCounts,
    normalizeLiveCounts,
    type AnnotatedPhaseCounts,
  } from '../../pages/infra-board/rip-phase-counts';
  import { useDeployedProcessKeys, useLivePhaseCounts } from '../../services/infra.api';

  function Metric({ combined, live }: { combined: number; live: number }) {
    return (
      <span>
        {combined}
        {live > 0 && <span className="pb-live-badge">{live} live</span>}
      </span>
    );
  }

  export default function FaseladderOverview() {
    const { data: deployment } = useDeployedProcessKeys();
    const { data: liveCountsRaw } = useLivePhaseCounts();

    const deployedKeys = new Set(deployment?.deployedKeys ?? []);
    const mockCounts = getMockPhaseCounts();
    const liveCounts = normalizeLiveCounts(liveCountsRaw?.counts ?? {}, RIP_PHASES);
    const combined: Record<string, AnnotatedPhaseCounts> = combinePhaseCounts(
      mockCounts,
      liveCounts
    );
    const klaarCombined = getKlaarCounts(RIP_PHASES, combined);
    const klaarLive = getKlaarCounts(RIP_PHASES, liveCounts);

    const deployedPhases = RIP_PHASES.filter(
      (p) => getPhaseDeployStatus(p, deployedKeys) === 'gedeployed'
    );
    const fasenInUitvoering = RIP_PHASES.filter((p) => combined[p.code]?.wip > 0).length;
    const fasenInUitvoeringLive = RIP_PHASES.filter((p) => combined[p.code]?.liveWip > 0).length;
    const klaarOmTeStarten = deployedPhases.reduce(
      (sum, p) => sum + (klaarCombined[p.code] ?? 0),
      0
    );
    const klaarOmTeStartenLive = deployedPhases.reduce(
      (sum, p) => sum + (klaarLive[p.code] ?? 0),
      0
    );
    const nietDeployedPhases = RIP_PHASES.filter((p) => !deployedPhases.includes(p));
    const wachtOpDeployment = nietDeployedPhases.reduce(
      (sum, p) => sum + (klaarCombined[p.code] ?? 0),
      0
    );
    const wachtOpDeploymentLive = nietDeployedPhases.reduce(
      (sum, p) => sum + (klaarLive[p.code] ?? 0),
      0
    );

    return (
      <div className="pb-view">
        <p className="pb-eyebrow">Beheer · Provincie Flevoland</p>
        <h1 className="pb-h1">Faseladder</h1>

        <div className="pb-kpi-row">
          <div className="pb-kpi">
            <span className="v">
              <Metric combined={fasenInUitvoering} live={fasenInUitvoeringLive} />
            </span>
            <span className="l">Fasen in uitvoering</span>
          </div>
          <div className="pb-kpi">
            <span className="v">{deployedPhases.length}</span>
            <span className="l">Deelprocessen inzetbaar</span>
          </div>
          <div className="pb-kpi">
            <span className="v">
              <Metric combined={klaarOmTeStarten} live={klaarOmTeStartenLive} />
            </span>
            <span className="l">Klaar om te starten</span>
          </div>
          <div className="pb-kpi">
            <span className="v">
              <Metric combined={wachtOpDeployment} live={wachtOpDeploymentLive} />
            </span>
            <span className="l">Wacht op deployment</span>
          </div>
        </div>

        <table className="pb-faseladder-table">
          <thead>
            <tr>
              <th>Fase</th>
              <th>Status</th>
              <th>Trekker</th>
              <th>Sluit met</th>
              <th>Klaar</th>
              <th>WIP</th>
              <th>Gereed</th>
            </tr>
          </thead>
          <tbody>
            {RIP_STAGES.map((stage) => (
              <Fragment key={stage.code}>
                <tr className="pb-stage-row">
                  <th colSpan={7}>{stage.name}</th>
                </tr>
                {RIP_PHASES.filter((p) => p.stage === stage.code).map((phase) => {
                  const c = combined[phase.code] ?? {
                    wip: 0,
                    gereed: 0,
                    geparkeerd: 0,
                    liveWip: 0,
                    liveGereed: 0,
                    liveGeparkeerd: 0,
                  };
                  const status = getPhaseDeployStatus(phase, deployedKeys);
                  const meta = RIP_DEPLOY_META[status];
                  const klaar = klaarCombined[phase.code];
                  const klaarL = klaarLive[phase.code] ?? 0;
                  return (
                    <tr key={phase.code}>
                      <td>
                        {phase.code} · {phase.name}
                      </td>
                      <td>
                        <span
                          className="pb-deploy-pill"
                          style={{ color: meta.color, borderColor: meta.color }}
                        >
                          {meta.label}
                        </span>
                      </td>
                      <td>{phase.lead}</td>
                      <td>{phase.exit}</td>
                      <td>
                        {klaar === undefined ? '—' : <Metric combined={klaar} live={klaarL} />}
                      </td>
                      <td>
                        <Metric combined={c.wip} live={c.liveWip} />
                      </td>
                      <td>
                        <Metric combined={c.gereed} live={c.liveGereed} />
                      </td>
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  ```

- [ ] **Step 4: Run test to verify it passes**

  Run (from `packages/frontend`):
  `npx vitest run src/components/InfraBoardDashboard/FaseladderOverview.test.tsx`

  Expected: PASS (4 tests).

- [ ] **Step 5: Add minimal CSS (no test — visual only)**

  Append to `dashboard-infra.css`, following the file's existing `.pbd
.pb-*` naming convention and CSS custom properties (`--v2-*`):

  ```css
  .pbd .pb-kpi-row {
    display: flex;
    gap: 16px;
    margin: 16px 0 24px;
    flex-wrap: wrap;
  }
  .pbd .pb-kpi {
    border: 1px solid var(--v2-rule);
    background: var(--v2-bg);
    padding: 14px 18px;
    min-width: 160px;
  }
  .pbd .pb-kpi .v {
    display: block;
    font-family: var(--v2-mono);
    font-size: 22px;
    font-weight: 700;
    color: var(--v2-ink);
  }
  .pbd .pb-kpi .l {
    display: block;
    font-size: 11px;
    color: var(--v2-ink-3);
    margin-top: 4px;
  }
  .pbd .pb-faseladder-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  .pbd .pb-faseladder-table th,
  .pbd .pb-faseladder-table td {
    padding: 8px 12px;
    border-bottom: 1px solid var(--v2-rule);
    text-align: left;
  }
  .pbd .pb-stage-row th {
    background: var(--v2-bg);
    font-family: var(--v2-serif);
    font-weight: 700;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .pbd .pb-deploy-pill {
    display: inline-block;
    padding: 1px 8px;
    border: 1px solid;
    border-radius: 3px;
    font-size: 11px;
    font-weight: 600;
  }
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add packages/frontend/src/components/InfraBoardDashboard/FaseladderOverview.tsx packages/frontend/src/components/InfraBoardDashboard/FaseladderOverview.test.tsx packages/frontend/src/pages/infra-board/dashboard-infra.css
  git commit -m "feat(frontend): add FaseladderOverview component"
  ```

---

### Task 7: Frontend — rail, router, and palette wiring

**Files:**

- Modify: `packages/frontend/src/pages/infra-board/modes.config.ts`
- Modify: `packages/frontend/src/components/InfraBoardDashboard/InfraSectionRouter.tsx`
- Modify: `packages/frontend/src/components/InfraBoardDashboard/InfraCommandPalette.tsx`
- Test: `packages/frontend/src/components/InfraBoardDashboard/InfraSectionRouter.test.tsx`
- Test: `packages/frontend/src/components/InfraBoardDashboard/InfraCommandPalette.test.tsx`

**Interfaces:**

- Consumes: `FaseladderOverview` (Task 6); `RIP_STAGES`, `RIP_PHASES`
  (sub-project A).
- Produces: the `beheer` mode's rail now has one entry per phase (grouped
  by stage) plus "Faseladder" and "Archief"; section id `faseladder` routes
  to `<FaseladderOverview />`.

Note on scope: a live WIP-count badge per rail item (mentioned in the
design spec's §7 as "carrying a WIP count badge") is **not** included in
this task — the shell component that renders `INFRA_MODES`
(`InfraBoardDashboard.tsx`'s `<aside className="v2-rail">`) has no badge
slot today, and adding one is a shared-shell change beyond this sub-project's
boundary. The KPI row on the Faseladder page itself already surfaces this
number prominently; a rail badge can follow in a later task without
blocking this one.

- [ ] **Step 1: Write the failing tests**

  In `InfraSectionRouter.test.tsx`:
  1. Replace the three `RipFase1*Section` mocks with one for
     `FaseladderOverview`:

     ```ts
     vi.mock('./FaseladderOverview', () => ({ default: () => <div>faseladder</div> }));
     ```

     (remove the `vi.mock('../CaseworkerDashboard/RipFase1Section', ...)`,
     `RipFase1WipSection`, and `RipFase1GereedSection` mock blocks — those
     components are no longer routed to.)

  2. In the `it.each([...])` table, replace the three
     `['rip-fase1', 'rip-fase1']` / `-wip` / `-gereed` rows with:

     ```ts
     ['faseladder', 'faseladder'],
     ['fase-r2-1', 'faseladder'],
     ```

     (the second row exercises the `fase-`-prefix normalization — a rail id
     for a phase with no detail view yet still lands on the overview, not
     the unrelated `default` fallback.)

  In `InfraCommandPalette.test.tsx`, change the existing assertion at line
  52 from:

  ```ts
  expect(screen.getByText('Beheer · RIP Fase 1')).toBeInTheDocument();
  ```

  to:

  ```ts
  expect(screen.getByText('Beheer · Faseladder')).toBeInTheDocument();
  ```

- [ ] **Step 2: Run tests to verify they fail**

  Run (from `packages/frontend`):

  ```
  npx vitest run src/components/InfraBoardDashboard/InfraSectionRouter.test.tsx
  npx vitest run src/components/InfraBoardDashboard/InfraCommandPalette.test.tsx
  ```

  Expected: both FAIL on the new/updated assertions.

- [ ] **Step 3: Write minimal implementation**

  In `modes.config.ts`, replace the `beheer` mode's "Projecten" group:

  ```ts
      {
        label: 'Projecten',
        items: [
          { id: 'faseladder', label: 'Faseladder', authRequired: true },
          ...RIP_STAGES.flatMap((stage) =>
            RIP_PHASES.filter((p) => p.stage === stage.code).map((p) => ({
              id: `fase-${p.code.toLowerCase().replace('.', '-')}`,
              label: `${p.code} · ${p.name}`,
              authRequired: true,
              requiredRoles: [INFRA_GATE_ROLE],
            }))
          ),
          { id: 'archief', label: 'Archief', authRequired: true },
        ],
      },
  ```

  (Import `RIP_STAGES, RIP_PHASES` from `./rip-phases.catalog` at the top
  of the file; set `defaultSectionId: 'faseladder'` on the `beheer` mode.)

  In `InfraSectionRouter.tsx`: replace the `RipFase1Section`,
  `RipFase1WipSection`, `RipFase1GereedSection` imports with:

  ```ts
  import FaseladderOverview from './FaseladderOverview';
  ```

  Remove the three `case 'rip-fase1':` / `'rip-fase1-wip':` /
  `'rip-fase1-gereed':` branches from the `switch (section)` block and
  replace them with one branch that also catches the 9 new per-phase rail
  ids — those have no detail view yet (that's sub-projects C/D), so they
  route to the same overview rather than falling through to the unrelated
  `default` (`ProfielSection`):

  ```ts
    case 'faseladder':
      content = <FaseladderOverview />;
      break;
  ```

  and, immediately before the `switch` statement, normalize any
  `fase-`-prefixed section id onto `'faseladder'` so the `switch` only
  needs the one case:

  ```ts
  const normalizedSection = section.startsWith('fase-') ? 'faseladder' : section;
  // ...
  switch (normalizedSection) {
  ```

  (Use `normalizedSection` in the `switch`, not `section`, but keep every
  other existing `case` label — e.g. `'rollen'`, `'archief'` — unchanged.)

  In `InfraCommandPalette.tsx`, change the static view label:

  ```ts
  { kind: 'view', id: 'beheer', label: 'Beheer · Faseladder', tag: 'weergave' },
  ```

- [ ] **Step 4: Run tests to verify they pass**

  Same two commands as Step 2. Expected: both PASS.

- [ ] **Step 5: Run the full frontend suite to confirm no regressions**

  Run (from `packages/frontend`): `npx vitest run`

  Expected: PASS, all test files (existing `RipFase1*Section.test.tsx`
  files still pass — they test the components directly, independent of
  whether the router still routes to them; only remove those component
  files/tests in a later sub-project if/when they're truly retired).

- [ ] **Step 6: Commit**

  ```bash
  git add packages/frontend/src/pages/infra-board/modes.config.ts packages/frontend/src/components/InfraBoardDashboard/InfraSectionRouter.tsx packages/frontend/src/components/InfraBoardDashboard/InfraCommandPalette.tsx packages/frontend/src/components/InfraBoardDashboard/InfraSectionRouter.test.tsx packages/frontend/src/components/InfraBoardDashboard/InfraCommandPalette.test.tsx
  git commit -m "feat(frontend): wire Faseladder overview into Beheer rail, router, and palette"
  ```
