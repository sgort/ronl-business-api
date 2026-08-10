# RIP Phase Catalogue + Live Deployment Status (Sub-project A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Infra-board a real RIP phase catalogue (all nine
sub-processes, R2.1…R5.2) and a live, per-environment answer to "is this
phase's process actually deployed on this Operaton instance?" — the
foundation every later Beheer sub-project (B–F) reads from.

**Architecture:** A minimal phase↔engine-key mapping lives in `@ronl/shared`
so backend and frontend can't drift apart. The backend adds one
`OperatonService` method plus one route that asks Operaton, in a single
call, which of the known process-definition keys are deployed. The frontend
gets a new rich content catalogue (lifted from the handoff package's
reference prototype) plus a pure function that combines catalogue + live
deployed-keys into a three-state status, and a hook to fetch that live data.
No UI renders any of this yet — that's sub-projects B–F.

**Tech Stack:** TypeScript across `packages/shared`, `packages/backend`
(Express, axios, Jest/ts-jest, supertest), `packages/frontend` (React,
Vitest, `@testing-library/react`, MSW for HTTP-level API tests).

## Global Constraints

- `processDefinitionKey` is a static, manually-filled field per phase — never
  derived from a naming convention (spec: "Out of scope").
- Each environment (dev/acc/prod) only ever queries its own Operaton
  instance — no cross-environment deployment matrix (spec: "Out of scope").
- The new backend route requires standard auth only (`jwtMiddleware` +
  `tenantMiddleware`, same as the rest of `/v1/rip`) — no extra role gate
  (spec: "Out of scope").
- No caching of the deployment-status response (spec: §2 "No caching").
- Dutch content (labels, roles, product names) only in the frontend
  catalogue; the shared package carries only `code`/`stage`/
  `processDefinitionKey` (spec: §1).

---

### Task 1: Shared phase↔key mapping

**Files:**

- Create: `packages/shared/src/rip-phases.ts`
- Modify: `packages/shared/src/index.ts` (add the new export)

**Interfaces:**

- Consumes: nothing new.
- Produces: `RipPhaseKey` interface (`code: string`, `stage: string`,
  `processDefinitionKey?: string`) and `RIP_PHASE_KEYS: RipPhaseKey[]` (9
  entries, only `R2.1` carrying `processDefinitionKey: 'RipPhase1Process'`),
  both exported from `@ronl/shared`. Task 2's route and Task 4's frontend
  catalogue both import `RIP_PHASE_KEYS`.

`packages/shared` has no test runner (`package.json` only has `build` /
`type-check` / `clean` scripts) — this task's data has no behavior to unit
test in isolation, so its "test cycle" is the package's own `type-check`
script plus the downstream tasks that consume it (Task 2, Task 4) verifying
the shape by importing it directly.

- [ ] **Step 1: Write the shared module**

  Create `packages/shared/src/rip-phases.ts`:

  ```ts
  /**
   * Minimal cross-package mapping from RIP phase code to Operaton
   * process-definition key. This is the one fact backend and frontend must
   * never author separately — see docs/superpowers/specs/2026-08-10-rip-phase-catalogue-deployment-status-design.md.
   *
   * `processDefinitionKey` is undefined until a phase is modelled as BPMN;
   * fill it in at the same time the process itself is deployed.
   */
  export interface RipPhaseKey {
    code: string; // 'R2.1' … 'R5.2'
    stage: string; // 'R2' | 'R3' | 'R4' | 'R5'
    processDefinitionKey?: string;
  }

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
  ];
  ```

- [ ] **Step 2: Export it from the package entrypoint**

  In `packages/shared/src/index.ts`, add (alongside the other
  type/module re-exports — follow the existing export style in that file):

  ```ts
  export * from './rip-phases';
  ```

- [ ] **Step 3: Type-check the shared package**

  Run: `npm run type-check --workspace=@ronl/shared`

  Expected: exits 0, no errors.

- [ ] **Step 4: Build the shared package**

  Run: `npm run build --workspace=@ronl/shared`

  Expected: exits 0. This regenerates `packages/shared/dist/`, which the
  frontend's `@ronl/shared` dependency resolves to (the backend's Jest
  config maps `@ronl/shared` straight to `../shared/src/index`, so it
  doesn't need this step — but the frontend has no such alias and resolves
  through the package's `main`/`types` fields, so Task 4/5's frontend tests
  need the freshly built `dist/`).

- [ ] **Step 5: Commit**

  ```bash
  git add packages/shared/src/rip-phases.ts packages/shared/src/index.ts packages/shared/dist
  git commit -m "feat(shared): add RIP phase to process-definition-key mapping"
  ```

---

### Task 2: `OperatonService.getDeployedProcessKeys`

**Files:**

- Modify: `packages/backend/src/services/operaton.service.ts` (add the
  method near the other read-only passthrough queries, e.g. after
  `getDecisionDefinition`, ~line 108)
- Test: `packages/backend/src/services/operaton.service.test.ts`

**Interfaces:**

- Consumes: `this.client` (existing mocked-axios instance already set up in
  the class), `axios.isAxiosError` (already imported for other methods).
- Produces: `getDeployedProcessKeys(keys: string[]): Promise<string[]>` on
  `OperatonService` — Task 3's route calls this exact method with the
  process keys pulled from `RIP_PHASE_KEYS`.

- [ ] **Step 1: Write the failing tests**

  Add a new `describe` block to
  `packages/backend/src/services/operaton.service.test.ts`, after the
  `describe('startProcess', ...)` block:

  ```ts
  describe('getDeployedProcessKeys', () => {
    it('queries with keysIn + latestVersion and returns only the deployed subset, in input order', async () => {
      mockClient.get.mockResolvedValue({
        data: [{ key: 'RipPhase1Process' }, { key: 'SomeOtherProcess' }],
      });

      const result = await svc.getDeployedProcessKeys(['RipPhase1Process', 'NotDeployedYet']);

      expect(result).toEqual(['RipPhase1Process']);
      expect(mockClient.get).toHaveBeenCalledWith('/process-definition', {
        params: { keysIn: 'RipPhase1Process,NotDeployedYet', latestVersion: true },
      });
    });

    it('returns an empty array when none of the requested keys are deployed', async () => {
      mockClient.get.mockResolvedValue({ data: [] });

      const result = await svc.getDeployedProcessKeys(['NotDeployedYet']);

      expect(result).toEqual([]);
    });

    it('rethrows on failure', async () => {
      mockClient.get.mockRejectedValue(new Error('boom'));

      await expect(svc.getDeployedProcessKeys(['RipPhase1Process'])).rejects.toThrow('boom');
    });
  });
  ```

- [ ] **Step 2: Run tests to verify they fail**

  Run (from `packages/backend`):
  `npx jest src/services/operaton.service.test.ts -t "getDeployedProcessKeys" --no-coverage`

  Expected: FAIL — `svc.getDeployedProcessKeys is not a function`.

- [ ] **Step 3: Write minimal implementation**

  In `packages/backend/src/services/operaton.service.ts`, add this method
  after `getDecisionDefinition` (~line 108, before the `startProcess`
  method):

  ```ts
    /**
     * Given a list of process-definition keys, return the subset that is
     * actually deployed on this environment's Operaton instance. One query
     * regardless of how many keys are asked about.
     */
    async getDeployedProcessKeys(keys: string[]): Promise<string[]> {
      try {
        const response = await this.client.get('/process-definition', {
          params: { keysIn: keys.join(','), latestVersion: true },
        });
        const found = new Set((response.data as Array<{ key: string }>).map((d) => d.key));
        return keys.filter((k) => found.has(k));
      } catch (error) {
        logger.error('Failed to query deployed process keys', {
          keys,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        throw error;
      }
    }
  ```

- [ ] **Step 4: Run tests to verify they pass**

  Run (from `packages/backend`):
  `npx jest src/services/operaton.service.test.ts -t "getDeployedProcessKeys" --no-coverage`

  Expected: PASS (3 tests).

- [ ] **Step 5: Run the full operaton.service test file to confirm no regressions**

  Run (from `packages/backend`): `npx jest src/services/operaton.service.test.ts --no-coverage`

  Expected: PASS, all tests (including the earlier `startProcess` suite).

- [ ] **Step 6: Commit**

  ```bash
  git add packages/backend/src/services/operaton.service.ts packages/backend/src/services/operaton.service.test.ts
  git commit -m "feat(backend): add OperatonService.getDeployedProcessKeys"
  ```

---

### Task 3: `GET /v1/rip/phases/deployment-status`

**Files:**

- Modify: `packages/backend/src/routes/rip.routes.ts` (add the route; add
  the `RIP_PHASE_KEYS` import from `@ronl/shared` at the top of the file)
- Test: `packages/backend/src/routes/rip.routes.test.ts`

**Interfaces:**

- Consumes: `RIP_PHASE_KEYS: RipPhaseKey[]` from `@ronl/shared` (Task 1);
  `operatonService.getDeployedProcessKeys(keys: string[]): Promise<string[]>`
  (Task 2).
- Produces: `GET /v1/rip/phases/deployment-status` → `200 { success: true,
data: { deployedKeys: string[] } }` on success, `401` when unauthenticated,
  `500 { success: false, error: { code: 'DEPLOYMENT_STATUS_FAILED', ... } }`
  on service failure. Task 5's `businessApi.rip.deploymentStatus()` calls
  this exact path and expects this exact response shape.

- [ ] **Step 1: Write the failing tests**

  In `packages/backend/src/routes/rip.routes.test.ts`, add
  `getDeployedProcessKeys: jest.fn()` to the `jest.mock('@services/operaton.service', ...)`
  factory and to the `svc` typed alias at the top of the file (both need
  the new key alongside the three existing ones), then add a new
  `describe` block after the existing `describe('lists', ...)` block:

  ```ts
  describe('GET /phases/deployment-status', () => {
    it('401 without a token', async () => {
      const res = await request(app).get('/v1/rip/phases/deployment-status');
      expect(res.status).toBe(401);
    });

    it('returns the deployed keys from the service', async () => {
      svc.getDeployedProcessKeys.mockResolvedValue(['RipPhase1Process']);
      const res = await auth(request(app).get('/v1/rip/phases/deployment-status'));
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ deployedKeys: ['RipPhase1Process'] });
      expect(svc.getDeployedProcessKeys).toHaveBeenCalledWith(['RipPhase1Process']);
    });

    it('500 with DEPLOYMENT_STATUS_FAILED on service failure', async () => {
      svc.getDeployedProcessKeys.mockRejectedValue(new Error('boom'));
      const res = await auth(request(app).get('/v1/rip/phases/deployment-status'));
      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe('DEPLOYMENT_STATUS_FAILED');
    });
  });
  ```

  Note: the second test's `toHaveBeenCalledWith(['RipPhase1Process'])`
  assumes `RIP_PHASE_KEYS` still has exactly one entry with a
  `processDefinitionKey` (R2.1) at this point in the plan — that's accurate
  as of Task 1.

- [ ] **Step 2: Run tests to verify they fail**

  Run (from `packages/backend`):
  `npx jest src/routes/rip.routes.test.ts -t "deployment-status" --no-coverage`

  Expected: FAIL — `404` (no such route yet) instead of `401`/`200`/`500`.

- [ ] **Step 3: Write minimal implementation**

  In `packages/backend/src/routes/rip.routes.ts`, add the import at the top
  of the file (alongside the existing imports):

  ```ts
  import { RIP_PHASE_KEYS } from '@ronl/shared';
  ```

  Then add the route after the existing `/phase1/:instanceId/documents`
  route (or wherever the file's other single-segment routes sit before the
  `:param` ones — check the file's own "routing order" comments, if any,
  before placing it):

  ```ts
  /**
   * GET /v1/rip/phases/deployment-status
   * Which RIP phase process-definition keys are actually deployed on this
   * environment's Operaton instance.
   */
  router.get('/phases/deployment-status', async (req, res) => {
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
      res.json({ success: true, data: { deployedKeys } });
    } catch (error) {
      logger.error('Failed to fetch RIP phase deployment status', {
        tenantId: req.user.tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      res.status(500).json({
        success: false,
        error: {
          code: 'DEPLOYMENT_STATUS_FAILED',
          message: 'Failed to retrieve phase deployment status',
        },
      });
    }
  });
  ```

- [ ] **Step 4: Run tests to verify they pass**

  Run (from `packages/backend`):
  `npx jest src/routes/rip.routes.test.ts -t "deployment-status" --no-coverage`

  Expected: PASS (3 tests).

- [ ] **Step 5: Run the full rip.routes test file to confirm no regressions**

  Run (from `packages/backend`): `npx jest src/routes/rip.routes.test.ts --no-coverage`

  Expected: PASS, all tests.

- [ ] **Step 6: Commit**

  ```bash
  git add packages/backend/src/routes/rip.routes.ts packages/backend/src/routes/rip.routes.test.ts
  git commit -m "feat(backend): add GET /v1/rip/phases/deployment-status"
  ```

---

### Task 4: Frontend RIP phase catalogue + deploy-status function

**Files:**

- Create: `packages/frontend/src/pages/infra-board/rip-phases.catalog.ts`
- Test: `packages/frontend/src/pages/infra-board/rip-phases.catalog.test.ts`

**Interfaces:**

- Consumes: `RIP_PHASE_KEYS` from `@ronl/shared` (Task 1 — requires
  `packages/shared` built, per Task 1 Step 4).
- Produces: `RipStage`, `RipPhase`, `RipDeployStatus` types; `RIP_STAGES`,
  `RIP_PHASES`, `RIP_DEPLOY_META` constants; `ripPhaseByCode(code: string):
RipPhase | undefined`; `getPhaseDeployStatus(phase: RipPhase, deployedKeys:
ReadonlySet<string>): RipDeployStatus`. Sub-projects B–F (not part of this
  plan) import all of these; Task 5 does not depend on this task.

- [ ] **Step 1: Write the failing tests**

  Create `packages/frontend/src/pages/infra-board/rip-phases.catalog.test.ts`:

  ```ts
  import { describe, expect, it } from 'vitest';
  import {
    getPhaseDeployStatus,
    ripPhaseByCode,
    RIP_PHASES,
    RIP_STAGES,
    type RipPhase,
  } from './rip-phases.catalog';

  describe('RIP_PHASES catalogue', () => {
    it('has exactly nine phases in R2.1…R5.2 order', () => {
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
      ]);
    });

    it('has four stages matching the phase codes', () => {
      expect(RIP_STAGES.map((s) => s.code)).toEqual(['R2', 'R3', 'R4', 'R5']);
    });

    it('only R2.1 carries a processDefinitionKey', () => {
      expect(ripPhaseByCode('R2.1')?.processDefinitionKey).toBe('RipPhase1Process');
      for (const code of ['R2.2', 'R2.3', 'R2.4', 'R3.1', 'R3.2', 'R4.1', 'R5.1', 'R5.2']) {
        expect(ripPhaseByCode(code)?.processDefinitionKey).toBeUndefined();
      }
    });

    it('marks only R5.2 as beyond (no process model even planned)', () => {
      expect(ripPhaseByCode('R5.2')?.beyond).toBe(true);
      for (const code of ['R2.1', 'R2.2', 'R2.3', 'R2.4', 'R3.1', 'R3.2', 'R4.1', 'R5.1']) {
        expect(ripPhaseByCode(code)?.beyond).toBeUndefined();
      }
    });
  });

  describe('getPhaseDeployStatus', () => {
    const withKey: RipPhase = { ...ripPhaseByCode('R2.1')! };
    const withoutKey: RipPhase = { ...ripPhaseByCode('R2.2')! };
    const beyond: RipPhase = { ...ripPhaseByCode('R5.2')! };

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
  ```

- [ ] **Step 2: Run tests to verify they fail**

  Run (from `packages/frontend`):
  `npx vitest run src/pages/infra-board/rip-phases.catalog.test.ts`

  Expected: FAIL — module `./rip-phases.catalog` does not exist.

- [ ] **Step 3: Write minimal implementation**

  Create `packages/frontend/src/pages/infra-board/rip-phases.catalog.ts`:

  ```ts
  /**
   * RIP phase catalogue — the nine sub-processes (R2.1…R5.2), lifted from
   * docs/infra-beheer-handoff/reference/pb-phases.reference.jsx and merged
   * with the shared phase↔process-definition-key mapping. See
   * docs/superpowers/specs/2026-08-10-rip-phase-catalogue-deployment-status-design.md.
   */
  import { RIP_PHASE_KEYS } from '@ronl/shared';

  export interface RipStage {
    code: string;
    name: string;
    color: string;
  }

  export const RIP_STAGES: RipStage[] = [
    { code: 'R2', name: 'Planvoorbereiding', color: '#0046ad' },
    { code: 'R3', name: 'Contractvorming', color: '#7a5af0' },
    { code: 'R4', name: 'Aanbesteding', color: '#b85c00' },
    { code: 'R5', name: 'Uitvoering', color: '#0a8e8e' },
  ];

  export interface RipPhase {
    code: string;
    stage: string;
    name: string;
    lead: string;
    roles: string[];
    entry: string;
    exit: string;
    docs: string[];
    gates: string[];
    krediet: boolean;
    weeks: number;
    bron: string;
    processDefinitionKey?: string;
    /** No process model even planned (R5.2) — never counts as WIP. */
    beyond?: boolean;
  }

  const CONTENT: Omit<RipPhase, 'processDefinitionKey'>[] = [
    {
      code: 'R2.1',
      stage: 'R2',
      name: 'Projectplan planvoorbereiding',
      lead: 'Projectleider',
      roles: [
        'Aandrager',
        'Manager Projectbeheersing',
        'Projectleider',
        'Projectondersteuner',
        'Deelnemers PSU',
        'RIP-team',
        'AO',
      ],
      entry: 'Start RIP fase 1 — intakeverzoek Aandrager',
      exit: 'Projectplan 4. Uitgangspunten VO-fase',
      docs: [
        '1. Intake-formulier',
        '2. Intake-verslag',
        '3. PSU-verslag',
        '4. Uitgangspunten VO-fase',
        'Risicodossier',
        'Projectplanning',
      ],
      gates: ['Intake-formulier akkoord?', 'Akkoord Intake-verslag?', 'Akkoord Uitgangspunten VO?'],
      krediet: false,
      weeks: 10,
      bron: 'RipPhase1Process.bpmn · 11 taken · 8 formulieren · 3 documenten',
    },
    {
      code: 'R2.2',
      stage: 'R2',
      name: 'Voorlopig Ontwerp (VO)',
      lead: 'Ontwerper',
      roles: [
        'Omgevingsmanager',
        'Ontwerper',
        'Projectleider',
        'RIP-team',
        'Aandrager',
        'Adviseur',
      ],
      entry: 'Vastgesteld Projectplan (uitgangspunten VO)',
      exit: 'Definitief VO vastgesteld',
      docs: [
        'Klanteisen (KES)',
        'Knelpuntenanalyse & categorie-indeling',
        'Klic-melding kabels en leidingen',
        'Concept VO',
        'Definitief VO',
        'Ontwerptoelichting',
        'Hoeveelheidsbepaling',
        'Objectenboom (Relatics/OTL)',
        'Bevindingenformulier',
      ],
      gates: ['Bespreken concept VO — bevindingen verwerkt?'],
      krediet: false,
      weeks: 16,
      bron: 'Overzichtsplaat R2.2 — VO (21-11-2024)',
    },
    {
      code: 'R2.3',
      stage: 'R2',
      name: 'VO-raming',
      lead: 'Kosten- en contractdeskundige',
      roles: [
        'RIP-team',
        'Projectleider',
        'Manager Projectbeheersing',
        'Kosten- en contractdeskundige',
        'Kostenadviseur',
        'Financiën',
        'Infra-overleg',
      ],
      entry: 'Definitief VO + hoeveelheidsbepaling',
      exit: 'Projectplan 5. Afronding VO-fase',
      docs: [
        'Projectraming VO',
        'SSK-raming',
        'Inkoopplan / inkoopstrategie',
        'Memo projectkrediet',
        'Besluit projectkrediet',
        'Evaluatie VO (Qualtrics)',
      ],
      gates: ['Raming binnen projectkrediet?', 'Akkoord Projectplan 5?'],
      krediet: true,
      weeks: 8,
      bron: 'Overzichtsplaat R2.3 — VO-raming (14-8-2025)',
    },
    {
      code: 'R2.4',
      stage: 'R2',
      name: 'DO en -raming',
      lead: 'Projectleider',
      roles: [
        'Projectleider',
        'Extern ingenieursbureau',
        'Adviseurs',
        'Beheerder Assetmanagement',
        'Kosten- en contractdeskundige',
        'Vestigingsmanager',
        'Financiën',
        'Infra-overleg',
      ],
      entry: 'Projectplan 5. Afronding VO-fase + opdracht extern IB',
      exit: 'Projectplan 6. Afronding DO-fase',
      docs: [
        'Concept DO',
        'Definitief DO',
        'Concept DO-raming',
        'DO-raming',
        'Projectraming DO',
        'V&G-plan',
        'Vergunningenscan',
        'ILS Provincie Flevoland',
        'Ontwerptoelichting',
      ],
      gates: [
        'Bespreken concept DO — akkoord?',
        'Toetsen aanpassingen door PKT',
        'Raming binnen projectkrediet?',
      ],
      krediet: true,
      weeks: 20,
      bron: 'Overzichtsplaat R2.4 — DO en -raming (12-8-2025)',
    },
    {
      code: 'R3.1',
      stage: 'R3',
      name: 'Opstellen bestek en tekeningen',
      lead: 'Projectleider',
      roles: [
        'Projectleider',
        'Ontwerper',
        'Directievoerder',
        'Technisch adviseur',
        'Kosten- en contractdeskundige',
        'Omgevingsmanager',
        'Toezichthouder',
        'Inkoopadviseur werken',
      ],
      entry: 'Projectplan 6. Afronding DO-fase',
      exit: 'Getoetste contract- en aanbestedingsdocumenten',
      docs: [
        'Concept bestekstekeningen',
        'Definitieve bestekstekeningen',
        'Bestek (incl. bijlagen)',
        'Inschrijvingsleidraad',
        'SSK-raming',
        'Maatregelenplan',
        'Bevindingenformulier',
      ],
      gates: [
        'Toetsen bestekstekeningen — akkoord?',
        'Toetsen bestek — akkoord?',
        'Toetsen inschrijfleidraad — akkoord?',
      ],
      krediet: false,
      weeks: 14,
      bron: 'Overzichtsplaat R3.1 (17-3-2026) — incl. matrix vaste lezers / risicogestuurd lezen',
    },
    {
      code: 'R3.2',
      stage: 'R3',
      name: 'Afronding bestek en tekeningen',
      lead: 'Kosten- en contractdeskundige',
      roles: [
        'Kosten- en contractdeskundige',
        'Projectleider',
        'AO',
        'Directievoerder',
        'Vestigingsmanager',
        'Financiën',
        'Infra-overleg',
      ],
      entry: 'Getoetste contract- en aanbestedingsdocumenten',
      exit: 'Projectplan 7. Afronden contractvormingsfase',
      docs: [
        'Projectraming Bestek',
        'Memo projectkrediet',
        'Besluit projectkrediet',
        'Concept toezichtplan',
        'Evaluatie DO en bestek (Qualtrics)',
      ],
      gates: ['Akkoord projectraming bestek?', 'Beoordelen concept toezichtplan — akkoord?'],
      krediet: true,
      weeks: 6,
      bron: 'Overzichtsplaat R3.2 (23-3-2026)',
    },
    {
      code: 'R4.1',
      stage: 'R4',
      name: 'Aanbestedingsproces',
      lead: 'Inkoopadviseur',
      roles: [
        'Inkoopadviseur',
        'Kosten- en contractdeskundige',
        'Projectleider',
        'Projectondersteuner',
        'AO',
        'Concerndirecteur',
        'Financiën',
      ],
      entry: 'Verzoek tot aanbesteden (na Projectplan 7)',
      exit: 'Nota besluitvorming vastgesteld — gunningsvoornemen',
      docs: [
        'Aanbestedingsdossier',
        'Nota van inlichtingen',
        'Aanbieding aannemer',
        'Projectraming na aanbesteding',
        'Gunningsvoornemen',
        'Proces verbaal',
        'Nota besluitvorming',
      ],
      gates: [
        'Dossier volledig?',
        'Onregelmatigheid gevonden?',
        'Over-/onderschrijding dekkingsbron?',
      ],
      krediet: true,
      weeks: 12,
      bron: 'Overzichtsplaat R4.1 (17-7-2025) — koppeling TenderNed / inkoopproces IN1',
    },
    {
      code: 'R5.1',
      stage: 'R5',
      name: 'Voorbereiding op uitvoering',
      lead: 'Directievoerder',
      roles: [
        'Directievoerder',
        'Projectleider',
        'Toezichthouder',
        'Omgevingsmanager',
        'Communicatieadviseur',
        'Vestigingsmanager',
        'Manager Projectbeheersing',
        'Kosten- en contractdeskundige',
        'Adviseur B&O V&G',
        'Opdrachtnemer',
      ],
      entry: 'Gunning — start overdracht BO13.1',
      exit: 'Startoverleg gehouden — vrijgave start werk',
      docs: [
        'Werkbestek',
        'Definitief toezichtsplan',
        'Uitgangspunten uitvoering',
        'V&G uitvoerplan (ON)',
        'Werkplannen (ON)',
        'Uitvoeringsplanning (ON)',
        'Verslag startoverleg',
        'Risicodossier contractbeheersing',
      ],
      gates: ['Akkoord alle documenten ON?', 'Technische installaties in project?'],
      krediet: false,
      weeks: 8,
      bron: 'Overzichtsplaat R5.1 (28-4-2026) — inrichting Better Performance + VISI',
    },
    {
      code: 'R5.2',
      stage: 'R5',
      name: 'Start werk "buiten"',
      lead: 'Directievoerder',
      beyond: true,
      roles: ['Directievoerder', 'Toezichthouder', 'Opdrachtnemer'],
      entry: 'Vrijgave na startoverleg R5.1',
      exit: '—',
      docs: [],
      gates: [],
      krediet: false,
      weeks: 52,
      bron: 'Alleen benoemd als vervolgstap in R5.1 — geen overzichtsplaat',
    },
  ];

  export const RIP_PHASES: RipPhase[] = CONTENT.map((c) => ({
    ...c,
    processDefinitionKey: RIP_PHASE_KEYS.find((k) => k.code === c.code)?.processDefinitionKey,
  }));

  export const ripPhaseByCode = (code: string): RipPhase | undefined =>
    RIP_PHASES.find((p) => p.code === code);

  export type RipDeployStatus = 'gedeployed' | 'ontwerp' | 'onbekend';

  export const RIP_DEPLOY_META: Record<
    RipDeployStatus,
    { label: string; short: string; color: string; can: boolean; note: string }
  > = {
    gedeployed: {
      label: 'Gedeployed',
      short: 'LIVE',
      color: '#3fa535',
      can: true,
      note: 'Procesmodel gedeployed op deze Operaton-omgeving.',
    },
    ontwerp: {
      label: 'In ontwerp',
      short: 'ONTWERP',
      color: '#b85c00',
      can: false,
      note: 'Overzichtsplaat bekend, procesmodel nog niet gemodelleerd of nog niet gedeployed op deze omgeving.',
    },
    onbekend: {
      label: 'Niet gemodelleerd',
      short: 'N.V.T.',
      color: '#9aa1ab',
      can: false,
      note: 'Nog geen overzichtsplaat beschikbaar.',
    },
  };

  export function getPhaseDeployStatus(
    phase: RipPhase,
    deployedKeys: ReadonlySet<string>
  ): RipDeployStatus {
    if (phase.processDefinitionKey && deployedKeys.has(phase.processDefinitionKey)) {
      return 'gedeployed';
    }
    if (phase.beyond) return 'onbekend';
    return 'ontwerp';
  }
  ```

- [ ] **Step 4: Run tests to verify they pass**

  Run (from `packages/frontend`):
  `npx vitest run src/pages/infra-board/rip-phases.catalog.test.ts`

  Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

  ```bash
  git add packages/frontend/src/pages/infra-board/rip-phases.catalog.ts packages/frontend/src/pages/infra-board/rip-phases.catalog.test.ts
  git commit -m "feat(frontend): add RIP phase catalogue and deploy-status computation"
  ```

---

### Task 5: Frontend API call + hook for live deployment status

**Files:**

- Modify: `packages/frontend/src/services/api.ts` (add
  `deploymentStatus` inside the existing `rip: { ... }` namespace)
- Modify: `packages/frontend/src/services/infra.api.ts` (add
  `useDeployedProcessKeys`)
- Test: `packages/frontend/src/services/api.test.ts` (add to the existing
  `describe('businessApi.rip', ...)` block)
- Test: `packages/frontend/src/services/infra.api.test.ts` (add a new
  `describe('useDeployedProcessKeys', ...)` block, and add
  `deploymentStatus: vi.fn()` to the existing `mockBusinessApi.rip` object)

**Interfaces:**

- Consumes: Task 3's `GET /v1/rip/phases/deployment-status` endpoint (via
  the existing `api` axios instance in `api.ts`); the file's existing
  `useAsync<T>` helper in `infra.api.ts`.
- Produces: `businessApi.rip.deploymentStatus(): Promise<ApiResponse<{
deployedKeys: string[] }>>`; `useDeployedProcessKeys(): AsyncState<{
deployedKeys: string[] }>`. Later sub-projects (B) call
  `useDeployedProcessKeys()` and build `new Set(data?.deployedKeys ?? [])`
  to pass into `getPhaseDeployStatus` (Task 4).

- [ ] **Step 1: Write the failing tests**

  In `packages/frontend/src/services/api.test.ts`, add to the existing
  `describe('businessApi.rip', ...)` block (after the `phase1Documents`
  test):

  ```ts
  it('deploymentStatus fetches the live deployed process keys', async () => {
    server.use(
      http.get('*/rip/phases/deployment-status', () =>
        HttpResponse.json({ success: true, data: { deployedKeys: ['RipPhase1Process'] } })
      )
    );
    expect(await businessApi.rip.deploymentStatus()).toEqual({
      success: true,
      data: { deployedKeys: ['RipPhase1Process'] },
    });
  });
  ```

  In `packages/frontend/src/services/infra.api.test.ts`, add
  `deploymentStatus: vi.fn()` to the `rip: { ... }` object inside
  `mockBusinessApi` (Step 1's declaration at the top of the file), add
  `useDeployedProcessKeys` to the import from `./infra.api`, and add a new
  `describe` block after `describe('useOpenTasks', ...)`:

  ```ts
  describe('useDeployedProcessKeys', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('loads the deployed keys and exposes them once resolved', async () => {
      mockBusinessApi.rip.deploymentStatus.mockResolvedValue({
        success: true,
        data: { deployedKeys: ['RipPhase1Process'] },
      });

      const { result } = renderHook(() => useDeployedProcessKeys());

      expect(result.current.loading).toBe(true);
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.data).toEqual({ deployedKeys: ['RipPhase1Process'] });
      expect(result.current.error).toBe(false);
    });

    it('sets error state when the call rejects', async () => {
      mockBusinessApi.rip.deploymentStatus.mockRejectedValue(new Error('network down'));

      const { result } = renderHook(() => useDeployedProcessKeys());

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.error).toBe(true);
    });
  });
  ```

- [ ] **Step 2: Run tests to verify they fail**

  Run (from `packages/frontend`):

  ```
  npx vitest run src/services/api.test.ts -t "deploymentStatus"
  npx vitest run src/services/infra.api.test.ts -t "useDeployedProcessKeys"
  ```

  Expected: both FAIL — `businessApi.rip.deploymentStatus is not a
function` / `useDeployedProcessKeys` is not exported.

- [ ] **Step 3: Write minimal implementation**

  In `packages/frontend/src/services/api.ts`, inside the `rip: { ... }`
  namespace, add after `phase1Documents`:

  ```ts
    deploymentStatus: async (): Promise<ApiResponse<{ deployedKeys: string[] }>> => {
      const response = await api.get('/rip/phases/deployment-status');
      return response.data;
    },
  ```

  In `packages/frontend/src/services/infra.api.ts`, add after
  `useOpenTasks`:

  ```ts
  /** Live "is this phase's process deployed here?" data for the RIP catalogue. */
  export const useDeployedProcessKeys = () =>
    useAsync<{ deployedKeys: string[] }>(() => businessApi.rip.deploymentStatus(), []);
  ```

- [ ] **Step 4: Run tests to verify they pass**

  Run (from `packages/frontend`):

  ```
  npx vitest run src/services/api.test.ts -t "deploymentStatus"
  npx vitest run src/services/infra.api.test.ts -t "useDeployedProcessKeys"
  ```

  Expected: both PASS.

- [ ] **Step 5: Run both full test files to confirm no regressions**

  Run (from `packages/frontend`):

  ```
  npx vitest run src/services/api.test.ts src/services/infra.api.test.ts
  ```

  Expected: PASS, all tests.

- [ ] **Step 6: Commit**

  ```bash
  git add packages/frontend/src/services/api.ts packages/frontend/src/services/api.test.ts packages/frontend/src/services/infra.api.ts packages/frontend/src/services/infra.api.test.ts
  git commit -m "feat(frontend): add businessApi.rip.deploymentStatus and useDeployedProcessKeys"
  ```
