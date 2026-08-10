# Beheer — Phase Detail, WIP + Gereed Tabs (Sub-project D) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `PhaseDetail`'s WIP/Gereed placeholder text with real
tables — live-derived for R2.1 (verified against actual running Operaton
instances), mock-derived (ported from the reference prototype) for every
other phase — and retire the now-redundant `RipFase1WipSection`/
`RipFase1GereedSection` from both dashboards that carried them.

**Architecture:** Two new pure-function layers (`rip-model.ts`'s
`getWipStepInfo` for real R2.1 derivation, `infra-board.data.ts`'s
`getMockPhaseInstanceDetail` for illustrative per-phase detail), then two
table UIs in `PhaseDetail.tsx` that merge live + mock rows exactly like
`Portfolio.tsx` already does (a `LIVE` badge on real rows, no badge on
mock — never a combined total, since these are individual project rows).
`RipFase1WipViewer` (the document renderer) is kept and reused by the new
Gereed tab.

**Tech Stack:** TypeScript, React, Vitest, `@testing-library/react`.

## Global Constraints

- No new backend routes — `businessApi.process.activityHistory`,
  `businessApi.rip.phase1Active/phase1Completed/phase1Documents` already
  provide everything needed.
- R2.1's derivation logic (`getWipStepInfo`) is R2.1-specific —
  `FASE1_NODES`/`FASE1_EDGES` only model R2.1's BPMN. No other phase gets
  real derivation.
- Health heuristic (groen/geel/rood) is documented as illustrative — no
  per-step norm exists in the catalogue at that granularity.
- Mock `doneDate` uses a simplified deterministic date, not the
  reference's full cross-phase walk-forward consistency computation.
- Run all `npx vitest` commands from `packages/frontend` specifically
  (`cd` there first), not the repo root.

---

### Task 1: `rip-model.ts` — `getWipStepInfo` (real R2.1 derivation)

**Files:**

- Modify: `packages/frontend/src/pages/infra-board/rip-model.ts`
- Test: create `packages/frontend/src/pages/infra-board/rip-model.test.ts`
  (check first: `test -f packages/frontend/src/pages/infra-board/rip-model.test.ts`)

**Interfaces:**

- Consumes: `FASE1_NODES`, `FASE1_EDGES`, `FASE1_LANES`, `roleByKey`
  (already in this file); `ActivityHistoryItem` from `@ronl/shared`
  (already imported in this file).
- Produces: `WipStepInfo` type, `getWipStepInfo(history:
ActivityHistoryItem[]): WipStepInfo | null`; `countReworkLoops(history:
ActivityHistoryItem[]): number`. Task 3 imports `getWipStepInfo`; Task 4
  imports `countReworkLoops`.

- [ ] **Step 1: Write the failing tests**

  If `rip-model.test.ts` doesn't exist, create it with this content; if it
  exists, add these two `describe` blocks and adjust the import line to
  match whatever's already there:

  ```ts
  import { describe, expect, it } from 'vitest';
  import { getWipStepInfo } from './rip-model';
  import type { ActivityHistoryItem } from '@ronl/shared';

  function activity(overrides: Partial<ActivityHistoryItem> = {}): ActivityHistoryItem {
    return {
      id: 'a1',
      activityId: 'Task_OrganiserenIntakeoverleg',
      activityName: 'Organiseren intake-overleg',
      activityType: 'userTask',
      assignee: null,
      startTime: '2026-08-10T10:55:38.009+0200',
      endTime: null,
      durationInMillis: null,
      canceled: false,
      ...overrides,
    };
  }

  describe('getWipStepInfo', () => {
    it('identifies the running node as the current step, matching real Operaton shape', () => {
      // Fixture shape matches an actual GET /history/activity-instance
      // response captured against a live RipPhase1Process instance during
      // sub-project D's brainstorming.
      const history: ActivityHistoryItem[] = [
        activity({
          activityId: 'StartEvent_RipPhase1',
          activityType: 'startEvent',
          startTime: '2026-08-10T10:54:47.656+0200',
          endTime: '2026-08-10T10:54:47.658+0200',
          durationInMillis: 2,
        }),
        activity({
          activityId: 'Task_AanlevrenProjectplan',
          startTime: '2026-08-10T10:54:47.658+0200',
          endTime: '2026-08-10T10:55:38.009+0200',
          durationInMillis: 50351,
          assignee: '4345f4ea-533d-411d-8a05-1b1f5bc2a309',
        }),
        activity({
          activityId: 'Task_OrganiserenIntakeoverleg',
          startTime: '2026-08-10T10:55:38.009+0200',
          endTime: null,
        }),
      ];

      const result = getWipStepInfo(history);

      expect(result).not.toBeNull();
      expect(result!.step).toBe('Organiseren intake-overleg');
      expect(result!.stepRole).toBe('Manager Projectbeheersing');
      expect(result!.blocked).toBeNull();
    });

    it('surfaces the originating gateway when the running node is a rework target', () => {
      const history: ActivityHistoryItem[] = [
        activity({
          activityId: 'Gateway_Akkoord2',
          activityType: 'exclusiveGateway',
          endTime: '2026-07-31T23:59:00Z', // already fired — only the rework task below is running
        }),
        activity({
          activityId: 'Task_AanvullenProjectplan2',
          startTime: '2026-08-01T00:00:00Z',
          endTime: null,
        }),
      ];

      const result = getWipStepInfo(history);

      expect(result!.blocked).toBe('Akkoord?');
    });

    it('returns null when every activity has finished (process complete)', () => {
      const history: ActivityHistoryItem[] = [
        activity({ endTime: '2026-08-10T11:00:00.000+0200' }),
      ];
      expect(getWipStepInfo(history)).toBeNull();
    });

    it('returns null for an empty history', () => {
      expect(getWipStepInfo([])).toBeNull();
    });
  });

  describe('countReworkLoops', () => {
    it('counts each back-edge target activity beyond its first occurrence', () => {
      // Task_AanvullenProjectplan2 is the target of the g_akkoord2 → back edge
      // (`niet akkoord`); it runs once normally, then again after rework — one loop.
      const history: ActivityHistoryItem[] = [
        activity({ activityId: 'Task_AanvullenProjectplan2', endTime: '2026-08-01T00:00:00Z' }),
        activity({
          activityId: 'Gateway_Akkoord2',
          activityType: 'exclusiveGateway',
          endTime: '2026-08-02T00:00:00Z',
        }),
        activity({
          activityId: 'Task_AanvullenProjectplan2',
          startTime: '2026-08-02T00:00:00Z',
          endTime: '2026-08-03T00:00:00Z',
        }),
        activity({
          activityId: 'Gateway_Akkoord2',
          activityType: 'exclusiveGateway',
          endTime: '2026-08-04T00:00:00Z',
        }),
        activity({ activityId: 'Task_AanvullenProjectplan4', endTime: '2026-08-05T00:00:00Z' }),
      ];
      expect(countReworkLoops(history)).toBe(1);
    });

    it('returns 0 when no back-edge target activity repeats', () => {
      const history: ActivityHistoryItem[] = [
        activity({ activityId: 'Task_AanvullenProjectplan2', endTime: '2026-08-01T00:00:00Z' }),
        activity({ activityId: 'Task_AanvullenProjectplan4', endTime: '2026-08-02T00:00:00Z' }),
      ];
      expect(countReworkLoops(history)).toBe(0);
    });

    it('returns 0 for an empty history', () => {
      expect(countReworkLoops([])).toBe(0);
    });
  });
  ```

  Update the import line to bring in both functions:

  ```ts
  import { getWipStepInfo, countReworkLoops } from './rip-model';
  ```

- [ ] **Step 2: Run the tests to verify they fail**

  Run (from `packages/frontend`):
  `npx vitest run src/pages/infra-board/rip-model.test.ts -t "getWipStepInfo|countReworkLoops"`

  Expected: FAIL — `getWipStepInfo is not a function` /
  `countReworkLoops is not a function`.

- [ ] **Step 3: Write minimal implementation**

  In `rip-model.ts`, add after `FASE1_LANES`'s existing `const ROW = ...`
  line:

  ```ts
  const ROW_TO_LANE_KEY: string[] = FASE1_LANES.map((l) => l.key);
  ```

  Then add, after `nodeStatusFromHistory` at the end of the file:

  ```ts
  export interface WipStepInfo {
    step: string;
    stepRole: string;
    daysInStep: number;
    blocked: string | null;
  }

  /**
   * Derives the current-step summary for one process instance from its
   * activity history. The running node (no endTime, not canceled) is the
   * current step; if it's the target of a `back: true` edge, the gateway
   * that sent it back is surfaced as `blocked`. R2.1-specific —
   * FASE1_NODES/FASE1_EDGES model only R2.1's BPMN.
   */
  export function getWipStepInfo(history: ActivityHistoryItem[]): WipStepInfo | null {
    const running = history.find((h) => !h.endTime && !h.canceled);
    if (!running) return null;
    const node = FASE1_NODES.find((n) => n.bpmnId === running.activityId);
    if (!node) return null;
    const backEdge = FASE1_EDGES.find((e) => e.back && e.to === node.id);
    const blocked = backEdge
      ? (FASE1_NODES.find((n) => n.id === backEdge.from)?.label ?? null)
      : null;
    const daysInStep = Math.floor(
      (Date.now() - new Date(running.startTime).getTime()) / (1000 * 60 * 60 * 24)
    );
    return {
      step: node.label,
      stepRole: roleByKey(ROW_TO_LANE_KEY[node.row]).label,
      daysInStep,
      blocked,
    };
  }

  /**
   * Counts rework-loop re-executions in a (typically completed) instance's
   * activity history: for each `back: true` edge in FASE1_EDGES, its target
   * node's bpmnId is counted once per execution beyond the first — the
   * first execution is the normal forward pass, not a loop.
   */
  export function countReworkLoops(history: ActivityHistoryItem[]): number {
    const backTargetBpmnIds = new Set(
      FASE1_EDGES.filter((e) => e.back)
        .map((e) => FASE1_NODES.find((n) => n.id === e.to)?.bpmnId)
        .filter((id): id is string => !!id)
    );
    let loops = 0;
    for (const bpmnId of backTargetBpmnIds) {
      const count = history.filter((h) => h.activityId === bpmnId).length;
      loops += Math.max(0, count - 1);
    }
    return loops;
  }
  ```

  Note: the second test ("surfaces the originating gateway") uses
  `startTime: '2026-08-01T00:00:00Z'` for the running node specifically so
  `daysInStep` is a positive, stable-ish number — the test doesn't assert
  on `daysInStep`'s exact value (it's computed against `Date.now()`), only
  on `blocked`.

- [ ] **Step 4: Run the tests to verify they pass**

  Same command as Step 2. Expected: PASS (7 tests: 4 for `getWipStepInfo`,
  3 for `countReworkLoops`).

- [ ] **Step 5: Run the full file and confirm no regressions**

  Run (from `packages/frontend`): `npx vitest run src/pages/infra-board/rip-model.test.ts`

  Expected: PASS, all tests (including any pre-existing ones in this file).

- [ ] **Step 6: Commit**

  ```bash
  git add packages/frontend/src/pages/infra-board/rip-model.ts packages/frontend/src/pages/infra-board/rip-model.test.ts
  git commit -m "feat(frontend): add getWipStepInfo and countReworkLoops for real R2.1 derivation"
  ```

---

### Task 2: `infra-board.data.ts` — mock per-phase instance detail

**Files:**

- Modify: `packages/frontend/src/pages/infra-board/infra-board.data.ts`
- Modify: `packages/frontend/src/pages/infra-board/infra-board.data.test.ts`

**Interfaces:**

- Consumes: `pbHash` (already in this file, currently module-private — must
  be exported, see Step 3), `RipPhase` type, `PortfolioProject` type,
  `RIP_PHASES` (already imported), `TL` (already in this file).
- Produces: `MockPhaseInstanceDetail` type,
  `getMockPhaseInstanceDetail(project: PortfolioProject, phase: RipPhase):
MockPhaseInstanceDetail`. Task 3 and Task 4 both import it.

- [ ] **Step 1: Write the failing tests**

  Add to `infra-board.data.test.ts` (append after the
  `describe('getReadyProjects / getOutOfSequenceProjects', ...)` block),
  and add `getMockPhaseInstanceDetail` to the existing import from
  `./infra-board.data`:

  ```ts
  describe('getMockPhaseInstanceDetail', () => {
    it('is deterministic across calls for the same project and phase', () => {
      const project = getMockPortfolio()[0];
      const phase = RIP_PHASES[0];
      const a = getMockPhaseInstanceDetail(project, phase);
      const b = getMockPhaseInstanceDetail(project, phase);
      expect(a).toEqual(b);
    });

    it('zeroes the wip-only fields when the project is not wip at that phase', () => {
      // Pick a phase the project has already passed (gereed) — step/stepRole
      // must be null there, since the project isn't actively working it.
      const project = getMockPortfolio().find((p) => p.ripPhaseCode !== RIP_PHASES[0].code)!;
      const passedPhase = RIP_PHASES[0]; // every non-R2.1 project has passed R2.1
      const detail = getMockPhaseInstanceDetail(project, passedPhase);
      expect(detail.step).toBeNull();
      expect(detail.stepRole).toBeNull();
      expect(detail.daysInStep).toBe(0);
      expect(detail.docsDone).toBe(detail.docsTotal);
    });

    it('sets wip-only fields when the project is wip at that phase', () => {
      const project = getMockPortfolio().find(
        (p) => p.ripPhaseState === 'wip' && p.ripPhaseCode !== 'R5.2'
      )!;
      const phase = RIP_PHASES.find((p) => p.code === project.ripPhaseCode)!;
      const detail = getMockPhaseInstanceDetail(project, phase);
      expect(detail.step).not.toBeNull();
      expect(detail.stepRole).not.toBeNull();
      expect(detail.daysInStep).toBeGreaterThan(0);
    });

    it('always returns a docsTotal matching the phase catalogue', () => {
      const project = getMockPortfolio()[0];
      const phase = RIP_PHASES[3];
      expect(getMockPhaseInstanceDetail(project, phase).docsTotal).toBe(phase.docs.length);
    });
  });
  ```

- [ ] **Step 2: Run the tests to verify they fail**

  Run (from `packages/frontend`):
  `npx vitest run src/pages/infra-board/infra-board.data.test.ts -t "getMockPhaseInstanceDetail"`

  Expected: FAIL — `getMockPhaseInstanceDetail is not a function`.

- [ ] **Step 3: Write minimal implementation**

  In `infra-board.data.ts`:
  1. Change `function pbHash(s: string): number {` to
     `export function pbHash(s: string): number {` (it's already
     module-private and correct — just needs exporting so this task's new
     function, defined after it in the same file, doesn't need it exported
     for its OWN use, but the test file imports `getMockPhaseInstanceDetail`
     only, not `pbHash` directly — **skip this export change, it is not
     needed**; `getMockPhaseInstanceDetail` is defined in the same module
     and can call the existing private `pbHash` directly).

  2. Add after `getOutOfSequenceProjects`:

     ```ts
     export interface MockPhaseInstanceDetail {
       step: string | null;
       stepRole: string | null;
       daysInStep: number;
       blocked: string | null;
       docsDone: number;
       docsTotal: number;
       loops: number;
       plannedWeeks: number;
       actualWeeks: number | null;
       doneBy: string | null;
       doneDate: string | null;
     }

     /** A handful of plausible completion-date strings, picked
      *  deterministically — not tied to any real timeline consistency. */
     const MOCK_DONE_MONTHS = [
       'jan',
       'feb',
       'mrt',
       'apr',
       'mei',
       'jun',
       'jul',
       'aug',
       'sep',
       'okt',
       'nov',
       'dec',
     ];
     function formatDeterministicDate(seed: number): string {
       const day = 1 + (seed % 28);
       const month = MOCK_DONE_MONTHS[Math.floor(seed / 28) % 12];
       const year = TL.startYear + (Math.floor(seed / 336) % (TL.quarters / 4));
       return `${day} ${month} ${year}`;
     }

     /**
      * Deterministic per-project-per-phase illustrative detail, ported from
      * reference/pb-instances.reference.jsx. Meaningful fields are only
      * populated for the project's OWN current wip phase; every other
      * phase gets docsDone === docsTotal (implying "done") and null/zero
      * wip-only fields, since the simplified ripPhaseCode/ripPhaseState
      * model doesn't retain historical per-phase detail for phases already
      * passed.
      */
     export function getMockPhaseInstanceDetail(
       project: PortfolioProject,
       phase: RipPhase
     ): MockPhaseInstanceDetail {
       const seed = pbHash(`${project.nr}|${phase.code}|detail`);
       const rnd = (salt: number) => ((seed * (salt + 1)) % 10000) / 10000;
       const isWip = project.ripPhaseCode === phase.code && project.ripPhaseState === 'wip';
       return {
         step: isWip ? (phase.docs[Math.floor(rnd(1) * phase.docs.length)] ?? phase.exit) : null,
         stepRole: isWip ? phase.roles[Math.floor(rnd(2) * phase.roles.length)] : null,
         daysInStep: isWip ? 1 + Math.floor(rnd(3) * 34) : 0,
         blocked:
           isWip && phase.gates.length && rnd(4) > 0.72
             ? phase.gates[Math.floor(rnd(5) * phase.gates.length)]
             : null,
         docsDone: isWip ? Math.floor(rnd(6) * (phase.docs.length + 1)) : phase.docs.length,
         docsTotal: phase.docs.length,
         loops: Math.floor(rnd(7) * 3),
         plannedWeeks: phase.weeks,
         actualWeeks: Math.max(2, Math.round(phase.weeks * (0.75 + rnd(8) * 0.8))),
         doneBy: ['AO', 'Aandrager', 'Projectleider', 'Concerndirecteur'][Math.floor(rnd(9) * 4)],
         doneDate: formatDeterministicDate(seed),
       };
     }
     ```

  3. Add `RipPhase` to the existing `import { RIP_PHASES, type RipPhase }
from './rip-phases.catalog';` line if it isn't already imported as a
     type (check — sub-project A's `getMockPhaseCounts` already uses
     `RipPhase` as a parameter type, so this import should already be
     present; if so, skip this sub-step).

- [ ] **Step 4: Run the tests to verify they pass**

  Same command as Step 2. Expected: PASS (4 tests).

- [ ] **Step 5: Run the full file to confirm no regressions**

  Run (from `packages/frontend`):
  `npx vitest run src/pages/infra-board/infra-board.data.test.ts`

  Expected: PASS, all tests.

- [ ] **Step 6: Commit**

  ```bash
  git add packages/frontend/src/pages/infra-board/infra-board.data.ts packages/frontend/src/pages/infra-board/infra-board.data.test.ts
  git commit -m "feat(frontend): add getMockPhaseInstanceDetail for mock WIP/Gereed rows"
  ```

---

### Task 3: `PhaseDetail.tsx` — WIP tab

**Files:**

- Modify: `packages/frontend/src/components/InfraBoardDashboard/PhaseDetail.tsx`
- Modify: `packages/frontend/src/components/InfraBoardDashboard/PhaseDetail.test.tsx`
- Modify: `packages/frontend/src/pages/infra-board/dashboard-infra.css`

**Interfaces:**

- Consumes: `getWipStepInfo` (Task 1); `getMockPhaseInstanceDetail`
  (Task 2); `businessApi.rip.phase1Active`, `businessApi.process.activityHistory`
  (existing); `HEALTH` (already in `rip-model.ts`, not yet imported by
  `PhaseDetail.tsx`).
- Produces: WIP tab renders a real table for R2.1 (live rows) merged with
  mock rows from every phase's wip projects.

- [ ] **Step 1: Write the failing test**

  Add to `PhaseDetail.test.tsx` (new `describe` block, after the existing
  `'PhaseDetail — Starten tab, deployed phase with ready projects'`
  block), and add the new mocks needed at the top of the file:

  ```tsx
  const mockPhase1Active = vi.hoisted(() => vi.fn());
  const mockActivityHistory = vi.hoisted(() => vi.fn());
  vi.mock('../../services/api', () => ({
    businessApi: {
      process: { start: mockStart, activityHistory: mockActivityHistory },
      rip: { phase1Active: mockPhase1Active },
    },
  }));
  ```

  (This replaces the existing, narrower
  `vi.mock('../../services/api', () => ({ businessApi: { process: { start: mockStart } } }));`
  block — merge the two `process` keys into one object as shown, don't
  duplicate the `vi.mock` call.)

  In the file's `beforeEach`, add default resolved values:

  ```ts
  mockPhase1Active.mockResolvedValue({ success: true, data: [] });
  mockActivityHistory.mockResolvedValue({ success: true, data: [] });
  ```

  Then the new tests:

  ```tsx
  describe('PhaseDetail — WIP tab', () => {
    it('renders a real R2.1 row with a LIVE badge, using the live activity history', async () => {
      mockPhase1Active.mockResolvedValue({
        success: true,
        data: [
          {
            id: 'live-1',
            startTime: '2026-08-10T10:54:47.658+0200',
            projectNumber: '99999',
            projectName: 'Live testproject',
            edocsWorkspaceId: 'w1',
          },
        ],
      });
      mockActivityHistory.mockResolvedValue({
        success: true,
        data: [
          {
            id: 'a1',
            activityId: 'Task_OrganiserenIntakeoverleg',
            activityName: 'Organiseren intake-overleg',
            activityType: 'userTask',
            assignee: null,
            startTime: '2026-08-10T10:55:38.009+0200',
            endTime: null,
            durationInMillis: null,
            canceled: false,
          },
        ],
      });
      const user = userEvent.setup();
      render(<PhaseDetail phaseCode="R2.1" onBack={vi.fn()} />);

      await user.click(screen.getByRole('button', { name: /WIP/ }));

      expect(await screen.findByText('Live testproject', { exact: false })).toBeInTheDocument();
      expect(screen.getByText('Organiseren intake-overleg', { exact: false })).toBeInTheDocument();
      expect(screen.getAllByText('LIVE', { exact: false }).length).toBeGreaterThan(0);
    });

    it('renders mock rows for a phase with wip projects, unbadged', async () => {
      mockGetPhaseDeployStatus.mockReturnValue('gedeployed');
      const user = userEvent.setup();
      render(<PhaseDetail phaseCode="R2.3" onBack={vi.fn()} />);

      await user.click(screen.getByRole('button', { name: /WIP/ }));

      const wipProject = getMockPortfolio().find(
        (p) => p.ripPhaseCode === 'R2.3' && p.ripPhaseState === 'wip'
      );
      expect(wipProject).toBeDefined();
      expect(screen.getByText(wipProject!.naam, { exact: false })).toBeInTheDocument();
      expect(screen.queryByText('LIVE')).not.toBeInTheDocument();
    });
  });
  ```

  Add `getMockPortfolio` to the existing import from
  `'../../pages/infra-board/infra-board.data'` in this test file.

- [ ] **Step 2: Run the test to verify it fails**

  Run (from `packages/frontend`):
  `npx vitest run src/components/InfraBoardDashboard/PhaseDetail.test.tsx -t "WIP tab"`

  Expected: FAIL — still shows the placeholder text, no rows.

- [ ] **Step 3: Write minimal implementation**

  In `PhaseDetail.tsx`:
  1. Add imports:

     ```ts
     import { useEffect } from 'react'; // merge into the existing `import { useState } from 'react';` line
     import { getWipStepInfo, HEALTH, type HealthKey } from '../../pages/infra-board/rip-model';
     import {
       getMockPhaseInstanceDetail,
       getMockPortfolio,
     } from '../../pages/infra-board/infra-board.data'; // merge getMockPortfolio into the existing import from this module
     import type { RipPhase } from '../../pages/infra-board/rip-phases.catalog'; // add to the existing import from this module
     ```

  2. Add state and a data-loading effect (with the other `useState` calls
     near the top of the component):

     ```ts
     const [liveWip, setLiveWip] = useState<
       Array<{ id: string; nr: string; naam: string; info: ReturnType<typeof getWipStepInfo> }>
     >([]);

     useEffect(() => {
       if (phaseCode !== 'R2.1') return;
       let alive = true;
       businessApi.rip.phase1Active().then(async (res) => {
         if (!res.success || !res.data || !alive) return;
         const rows = await Promise.all(
           res.data.map(async (inst) => {
             const histRes = await businessApi.process.activityHistory(inst.id);
             const info = histRes.success && histRes.data ? getWipStepInfo(histRes.data) : null;
             return {
               id: inst.id,
               nr: inst.projectNumber || inst.id.slice(0, 8),
               naam: inst.projectName || 'RIP Fase 1 project',
               info,
             };
           })
         );
         if (alive) setLiveWip(rows);
       });
       return () => {
         alive = false;
       };
     }, [phaseCode]);
     ```

  3. Replace the WIP placeholder:

     ```tsx
     {
       tab === 'wip' && (
         <table className="pb-instance-table">
           <thead>
             <tr>
               <th>Project</th>
               <th>Huidige stap</th>
               <th>Rol</th>
               <th>Dagen</th>
               <th>Producten</th>
               <th>Blokkade</th>
               <th>Gezondheid</th>
             </tr>
           </thead>
           <tbody>
             {liveWip.map((row) => {
               const health = computeHealth(row.info?.blocked ?? null, row.info?.daysInStep ?? 0);
               return (
                 <tr key={row.id}>
                   <td>
                     <span className="pb-proj-nr">{row.nr}</span> {row.naam}
                     <span className="pb-live-badge">LIVE</span>
                   </td>
                   <td>{row.info?.step ?? '—'}</td>
                   <td>{row.info?.stepRole ?? '—'}</td>
                   <td>{row.info ? `${row.info.daysInStep}d` : '—'}</td>
                   <td>—</td>
                   <td>{row.info?.blocked ?? '—'}</td>
                   <td>
                     <span className="pb-health-dot" style={{ background: HEALTH[health].color }} />{' '}
                     {HEALTH[health].label}
                   </td>
                 </tr>
               );
             })}
             {getMockPortfolioWipRows(phase).map((p) => {
               const detail = getMockPhaseInstanceDetail(p, phase);
               const health = computeHealth(detail.blocked, detail.daysInStep);
               return (
                 <tr key={p.id}>
                   <td>
                     <span className="pb-proj-nr">{p.nr}</span> {p.naam}
                   </td>
                   <td>{detail.step}</td>
                   <td>{detail.stepRole}</td>
                   <td>{detail.daysInStep}d</td>
                   <td>
                     {detail.docsDone}/{detail.docsTotal}
                   </td>
                   <td>{detail.blocked ?? '—'}</td>
                   <td>
                     <span className="pb-health-dot" style={{ background: HEALTH[health].color }} />{' '}
                     {HEALTH[health].label}
                   </td>
                 </tr>
               );
             })}
           </tbody>
         </table>
       );
     }
     ```

  4. Add these two small module-level helpers (outside the component
     function, e.g. just above `export default function PhaseDetail`):

     ```ts
     /** groen/geel/rood heuristic — illustrative only, no per-step norm
      *  exists in the catalogue at this granularity (see design spec §1). */
     function computeHealth(blocked: string | null, daysInStep: number): HealthKey {
       if (daysInStep > 28 || (blocked && daysInStep > 14)) return 'rood';
       if (blocked || daysInStep > 14) return 'geel';
       return 'groen';
     }

     function getMockPortfolioWipRows(phase: RipPhase) {
       return getMockPortfolio().filter(
         (p) => p.ripPhaseCode === phase.code && p.ripPhaseState === 'wip'
       );
     }
     ```

- [ ] **Step 4: Run the test to verify it passes**

  Same command as Step 2. Expected: PASS (2 new tests; 10 pre-existing
  tests in this file still pass too).

- [ ] **Step 5: Add CSS**

  Append to `dashboard-infra.css`:

  ```css
  .pbd .pb-instance-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
    margin-top: 12px;
  }
  .pbd .pb-instance-table th,
  .pbd .pb-instance-table td {
    padding: 8px 10px;
    border-bottom: 1px solid var(--v2-rule);
    text-align: left;
  }
  .pbd .pb-health-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    vertical-align: middle;
  }
  ```

- [ ] **Step 6: Run the full frontend suite to confirm no regressions**

  Run (from `packages/frontend`): `npx vitest run`

  Expected: PASS, all test files.

- [ ] **Step 7: Commit**

  ```bash
  git add packages/frontend/src/components/InfraBoardDashboard/PhaseDetail.tsx packages/frontend/src/components/InfraBoardDashboard/PhaseDetail.test.tsx packages/frontend/src/pages/infra-board/dashboard-infra.css
  git commit -m "feat(frontend): add PhaseDetail WIP tab (real R2.1 + mock rows)"
  ```

---

### Task 4: `PhaseDetail.tsx` — Gereed tab

**Files:**

- Modify: `packages/frontend/src/components/InfraBoardDashboard/PhaseDetail.tsx`
- Modify: `packages/frontend/src/components/InfraBoardDashboard/PhaseDetail.test.tsx`

**Interfaces:**

- Consumes: `businessApi.rip.phase1Completed`, `businessApi.rip.phase1Documents`,
  `businessApi.process.activityHistory` (existing, already mocked as
  `mockActivityHistory` in this test file by Task 3); `countReworkLoops`
  (Task 1); `getMockPhaseInstanceDetail` (Task 2); `RipFase1WipViewer`
  (existing, reused).
- Produces: Gereed tab renders a summary line + real table for R2.1
  merged with mock rows; real rows show a computed `Loops` count (via
  `countReworkLoops` against that instance's activity history); "Openen"
  reveals `RipFase1WipViewer` for real rows only.

**Note on "Geaccordeerd door":** the design spec (§2) describes deriving
this from the final accordering activity's `assignee`, but Operaton only
returns a raw assignee UUID (see Task 1's test fixtures) — there is no
user-directory lookup anywhere in this app to resolve a UUID to a display
name. Showing a raw UUID would be worse than a dash, so real rows keep
"Geaccordeerd door" as `—`, same as mock's non-applicable cells. This is a
deliberate simplification, not an oversight — a future sub-project can add
name resolution if needed.

- [ ] **Step 1: Write the failing test**

  Add `phase1Completed: mockPhase1Completed, phase1Documents:
mockPhase1Documents` to the `businessApi.rip` mock object introduced in
  Task 3 (both `vi.hoisted(() => vi.fn())`, declared alongside
  `mockPhase1Active`), with default resolved values in `beforeEach`:

  ```ts
  mockPhase1Completed.mockResolvedValue({ success: true, data: [] });
  mockPhase1Documents.mockResolvedValue({
    success: true,
    data: { variables: {}, intakeReport: null, psuReport: null, pdp: null },
  });
  ```

  Add this `describe` block after `'PhaseDetail — WIP tab'`:

  ```tsx
  describe('PhaseDetail — Gereed tab', () => {
    it('renders the summary line and a real R2.1 row with a LIVE badge', async () => {
      mockPhase1Completed.mockResolvedValue({
        success: true,
        data: [
          {
            id: 'done-1',
            startTime: '2026-01-01T00:00:00Z',
            endTime: '2026-03-15T00:00:00Z',
            projectNumber: '88888',
            projectName: 'Afgerond testproject',
            edocsWorkspaceId: 'w2',
          },
        ],
      });
      mockActivityHistory.mockResolvedValue({ success: true, data: [] });
      const user = userEvent.setup();
      render(<PhaseDetail phaseCode="R2.1" onBack={vi.fn()} />);

      await user.click(screen.getByRole('button', { name: /Gereed/ }));

      expect(await screen.findByText('Afgerond testproject', { exact: false })).toBeInTheDocument();
      expect(screen.getByText('1 afgerond', { exact: false })).toBeInTheDocument();
      expect(screen.getAllByText('LIVE', { exact: false }).length).toBeGreaterThan(0);
    });

    it('reveals the document viewer when Openen is clicked on a real row', async () => {
      mockPhase1Completed.mockResolvedValue({
        success: true,
        data: [
          {
            id: 'done-1',
            startTime: '2026-01-01T00:00:00Z',
            endTime: '2026-03-15T00:00:00Z',
            projectNumber: '88888',
            projectName: 'Afgerond testproject',
            edocsWorkspaceId: 'w2',
          },
        ],
      });
      mockActivityHistory.mockResolvedValue({ success: true, data: [] });
      const user = userEvent.setup();
      render(<PhaseDetail phaseCode="R2.1" onBack={vi.fn()} />);

      await user.click(screen.getByRole('button', { name: /Gereed/ }));
      await user.click(await screen.findByRole('button', { name: 'Openen' }));

      expect(mockPhase1Documents).toHaveBeenCalledWith('done-1');
    });

    it('shows the computed rework-loop count for a real completed row', async () => {
      mockPhase1Completed.mockResolvedValue({
        success: true,
        data: [
          {
            id: 'done-2',
            startTime: '2026-01-01T00:00:00Z',
            endTime: '2026-03-15T00:00:00Z',
            projectNumber: '77777',
            projectName: 'Project met rework',
            edocsWorkspaceId: 'w3',
          },
        ],
      });
      mockActivityHistory.mockResolvedValue({
        success: true,
        data: [
          {
            id: 'a1',
            activityId: 'Task_AanvullenProjectplan2',
            activityName: 'Aanvullen Projectplan',
            activityType: 'userTask',
            assignee: null,
            startTime: '2026-01-05T00:00:00Z',
            endTime: '2026-01-06T00:00:00Z',
            durationInMillis: 1,
            canceled: false,
          },
          {
            id: 'a2',
            activityId: 'Gateway_Akkoord2',
            activityName: 'Akkoord?',
            activityType: 'exclusiveGateway',
            assignee: null,
            startTime: '2026-01-06T00:00:00Z',
            endTime: '2026-01-06T00:00:01Z',
            durationInMillis: 1,
            canceled: false,
          },
          {
            id: 'a3',
            activityId: 'Task_AanvullenProjectplan2',
            activityName: 'Aanvullen Projectplan',
            activityType: 'userTask',
            assignee: null,
            startTime: '2026-01-07T00:00:00Z',
            endTime: '2026-01-08T00:00:00Z',
            durationInMillis: 1,
            canceled: false,
          },
        ],
      });
      const user = userEvent.setup();
      render(<PhaseDetail phaseCode="R2.1" onBack={vi.fn()} />);

      await user.click(screen.getByRole('button', { name: /Gereed/ }));

      const row = (await screen.findByText('Project met rework', { exact: false })).closest('tr');
      expect(within(row!).getByText('1')).toBeInTheDocument();
    });

    it('shows mock rows without a Dossier link', async () => {
      mockGetPhaseDeployStatus.mockReturnValue('gedeployed');
      const user = userEvent.setup();
      render(<PhaseDetail phaseCode="R2.4" onBack={vi.fn()} />);

      await user.click(screen.getByRole('button', { name: /Gereed/ }));

      const gereedProject = getMockPortfolio().find(
        (p) => RIP_PHASES.findIndex((rp) => rp.code === p.ripPhaseCode) > 3
      );
      expect(gereedProject).toBeDefined();
      const row = screen.getByText(gereedProject!.naam, { exact: false }).closest('tr');
      expect(within(row!).queryByRole('button', { name: 'Openen' })).not.toBeInTheDocument();
    });
  });
  ```

  Add `RIP_PHASES` to the existing import from
  `'../../pages/infra-board/rip-phases.catalog'` in this test file if not
  already present (it is — `ripPhaseByCode` is already imported from
  there; add `RIP_PHASES` alongside it). Add `within` to the existing
  `@testing-library/react` import if not already present (sub-project C's
  tests already use `within` for row-scoped queries, so it should already
  be there — check first).

- [ ] **Step 2: Run the test to verify it fails**

  Run (from `packages/frontend`):
  `npx vitest run src/components/InfraBoardDashboard/PhaseDetail.test.tsx -t "Gereed tab"`

  Expected: FAIL — still shows the placeholder text.

- [ ] **Step 3: Write minimal implementation**

  In `PhaseDetail.tsx`:
  1. Add the imports:

     ```ts
     import RipFase1WipViewer from '../CaseworkerDashboard/RipFase1WipViewer';
     import { countReworkLoops } from '../../pages/infra-board/rip-model'; // merge into the existing rip-model import from Task 3 (`getWipStepInfo, countReworkLoops, HEALTH, type HealthKey`)
     ```

  2. Add state and a data-loading effect, alongside the WIP tab's — this
     one also fetches each completed instance's activity history to
     compute its rework-loop count via `countReworkLoops` (Task 1):

     ```ts
     const [liveGereed, setLiveGereed] = useState<
       Array<{
         id: string;
         nr: string;
         naam: string;
         startTime: string;
         endTime: string;
         loops: number;
       }>
     >([]);
     const [openDossier, setOpenDossier] = useState<string | null>(null);

     useEffect(() => {
       if (phaseCode !== 'R2.1') return;
       let alive = true;
       businessApi.rip.phase1Completed().then(async (res) => {
         if (!res.success || !res.data || !alive) return;
         const rows = await Promise.all(
           res.data.map(async (inst) => {
             const histRes = await businessApi.process.activityHistory(inst.id);
             const loops = histRes.success && histRes.data ? countReworkLoops(histRes.data) : 0;
             return {
               id: inst.id,
               nr: inst.projectNumber || inst.id.slice(0, 8),
               naam: inst.projectName || 'RIP Fase 1 project',
               startTime: inst.startTime,
               endTime: inst.endTime,
               loops,
             };
           })
         );
         if (alive) setLiveGereed(rows);
       });
       return () => {
         alive = false;
       };
     }, [phaseCode]);
     ```

  3. Replace the Gereed placeholder:

     ```tsx
     {
       tab === 'gereed' && (
         <>
           <p className="pb-gereed-summary">
             {liveGereed.length + getMockPortfolioGereedRows(phase).length} afgerond
           </p>
           <table className="pb-instance-table">
             <thead>
               <tr>
                 <th>Project</th>
                 <th>Afgerond</th>
                 <th>Geaccordeerd door</th>
                 <th>Doorlooptijd</th>
                 <th>Loops</th>
                 <th>Producten</th>
                 <th>Dossier</th>
               </tr>
             </thead>
             <tbody>
               {liveGereed.map((row) => {
                 const weeks = Math.round(
                   (new Date(row.endTime).getTime() - new Date(row.startTime).getTime()) /
                     (1000 * 60 * 60 * 24 * 7)
                 );
                 return (
                   <>
                     <tr key={row.id}>
                       <td>
                         <span className="pb-proj-nr">{row.nr}</span> {row.naam}
                         <span className="pb-live-badge">LIVE</span>
                       </td>
                       <td>{new Date(row.endTime).toLocaleDateString('nl-NL')}</td>
                       {/* Geaccordeerd door: Operaton only returns a raw assignee
                         UUID and there's no user-directory lookup anywhere in
                         this app to resolve it to a name — a dash beats a raw
                         UUID here (see design spec §2, deliberate simplification). */}
                       <td>—</td>
                       <td>
                         {weeks} wk / {phase.weeks} wk
                       </td>
                       <td>{row.loops}</td>
                       <td>—</td>
                       <td>
                         <button
                           type="button"
                           className="v2-btn v2-btn-ghost v2-btn-sm"
                           onClick={() => setOpenDossier(openDossier === row.id ? null : row.id)}
                         >
                           Openen
                         </button>
                       </td>
                     </tr>
                     {openDossier === row.id && (
                       <tr key={`${row.id}-dossier`}>
                         <td colSpan={7}>
                           <RipFase1WipViewer instanceId={row.id} />
                         </td>
                       </tr>
                     )}
                   </>
                 );
               })}
               {getMockPortfolioGereedRows(phase).map((p) => {
                 const detail = getMockPhaseInstanceDetail(p, phase);
                 return (
                   <tr key={p.id}>
                     <td>
                       <span className="pb-proj-nr">{p.nr}</span> {p.naam}
                     </td>
                     <td>{detail.doneDate}</td>
                     <td>{detail.doneBy}</td>
                     <td>
                       {detail.actualWeeks} wk / {detail.plannedWeeks} wk
                     </td>
                     <td>{detail.loops}</td>
                     <td>
                       {detail.docsDone}/{detail.docsTotal}
                     </td>
                     <td>—</td>
                   </tr>
                 );
               })}
             </tbody>
           </table>
         </>
       );
     }
     ```

  4. Add the helper alongside `getMockPortfolioWipRows` (Task 3):

     ```ts
     function getMockPortfolioGereedRows(phase: RipPhase) {
       const idx = RIP_PHASES.findIndex((p) => p.code === phase.code);
       return getMockPortfolio().filter(
         (p) => RIP_PHASES.findIndex((rp) => rp.code === p.ripPhaseCode) > idx
       );
     }
     ```

- [ ] **Step 4: Run the test to verify it passes**

  Same command as Step 2. Expected: PASS (4 new tests; all prior tests in
  this file still pass).

- [ ] **Step 5: Run the full frontend suite to confirm no regressions**

  Run (from `packages/frontend`): `npx vitest run`

  Expected: PASS, all test files.

- [ ] **Step 6: Commit**

  ```bash
  git add packages/frontend/src/components/InfraBoardDashboard/PhaseDetail.tsx packages/frontend/src/components/InfraBoardDashboard/PhaseDetail.test.tsx
  git commit -m "feat(frontend): add PhaseDetail Gereed tab (real R2.1 + mock rows)"
  ```

---

### Task 5: Retire `RipFase1WipSection`/`RipFase1GereedSection` from CaseworkerDashboardV2

**Files:**

- Delete: `packages/frontend/src/components/CaseworkerDashboard/RipFase1WipSection.tsx`,
  `.test.tsx`
- Delete: `packages/frontend/src/components/CaseworkerDashboard/RipFase1GereedSection.tsx`,
  `.test.tsx`
- Modify: `packages/frontend/src/components/CaseworkerDashboardV2/SectionRouter.tsx`
- Modify: `packages/frontend/src/components/CaseworkerDashboardV2/SectionRouter.test.tsx`
- Modify: `packages/frontend/src/pages/caseworker-v2/modes.config.ts`

**Interfaces:**

- None — this task only removes dead code now that Tasks 3/4 provide the
  same capability inside `PhaseDetail`. `RipFase1WipViewer` is **not**
  touched (still used by Task 4's Gereed tab).

- [ ] **Step 1: Confirm no test currently exercises the two routes**

  Run (from `packages/frontend`):
  `grep -n "'rip-fase1-wip'\|'rip-fase1-gereed'" src/components/CaseworkerDashboardV2/SectionRouter.test.tsx`

  Expected: no matches beyond the two `vi.mock(...)` declaration lines —
  confirms there's no `it(...)` asserting these routes render, so removing
  them needs no red/green cycle of its own (this task is a pure, verified
  deletion — Step 2 below is the safety net instead of a red step).

- [ ] **Step 2: Remove the retired files and their references**

  ```bash
  git rm packages/frontend/src/components/CaseworkerDashboard/RipFase1WipSection.tsx packages/frontend/src/components/CaseworkerDashboard/RipFase1WipSection.test.tsx packages/frontend/src/components/CaseworkerDashboard/RipFase1GereedSection.tsx packages/frontend/src/components/CaseworkerDashboard/RipFase1GereedSection.test.tsx
  ```

  In `CaseworkerDashboardV2/SectionRouter.tsx`, remove these two import
  lines:

  ```ts
  import RipFase1WipSection from '../CaseworkerDashboard/RipFase1WipSection';
  import RipFase1GereedSection from '../CaseworkerDashboard/RipFase1GereedSection';
  ```

  and these two route lines:

  ```ts
  if (sectionId === 'rip-fase1-wip') return <RipFase1WipSection user={user} />;
  if (sectionId === 'rip-fase1-gereed') return <RipFase1GereedSection user={user} />;
  ```

  In `CaseworkerDashboardV2/SectionRouter.test.tsx`, remove these two
  `vi.mock` blocks:

  ```ts
  vi.mock('../CaseworkerDashboard/RipFase1WipSection', () => ({
    default: () => <div>rip-fase1-wip</div>,
  }));
  vi.mock('../CaseworkerDashboard/RipFase1GereedSection', () => ({
    default: () => <div>rip-fase1-gereed</div>,
  }));
  ```

  In `pages/caseworker-v2/modes.config.ts`, remove these two rail-item
  entries from the "V1 'Projecten'" group:

  ```ts
            {
              id: 'rip-fase1-wip',
              label: 'RIP Fase 1 WIP',
              authRequired: true,
              requiredRoles: ['infra-projectteam'],
            },
            {
              id: 'rip-fase1-gereed',
              label: 'RIP Fase 1 gereed',
              authRequired: true,
              requiredRoles: ['infra-projectteam'],
            },
  ```

  (leave the `archief` entry in that group, and everything else in the
  file, untouched.)

- [ ] **Step 3: Run the full frontend suite to confirm no regressions**

  Run (from `packages/frontend`): `npx vitest run`

  Expected: PASS, all remaining test files (the four deleted test files no
  longer run; `SectionRouter.test.tsx` and `modes.config.test.ts` — if it
  asserts on the caseworker-v2 rail contents — still pass since nothing
  else referenced these two ids).

- [ ] **Step 4: Typecheck**

  Run (from `packages/frontend`): `npx tsc --noEmit`

  Expected: no errors (confirms no other file still imports the deleted
  components).

- [ ] **Step 5: Commit**

  ```bash
  git add -A
  git commit -m "chore(frontend): retire RipFase1WipSection/RipFase1GereedSection from CaseworkerDashboardV2"
  ```

---

## Addendum: fix round from final whole-branch review

Tasks 1-5 above are done and merged into this branch. A final whole-branch
review (dispatched per `subagent-driven-development`'s end-of-plan step)
found several confirmed defects and one scope question, which the project
owner confirmed should be fixed as part of this same sub-project rather
than deferred. Tasks 6-9 below are that fix round.

### Task 6: `rip-model.ts` — fix `getWipStepInfo`'s false-blocked bug, add `getDocProgress`

**Files:**

- Modify: `packages/frontend/src/pages/infra-board/rip-model.ts`
- Modify: `packages/frontend/src/pages/infra-board/rip-model.test.ts`

**Interfaces:**

- Consumes: `FASE1_NODES`, `FASE1_EDGES`, `FASE1_DOCS`, `nodeStatusFromHistory`
  (already in this file).
- Produces: `getWipStepInfo`'s `blocked` field is now correct (same
  signature, no interface change); new `DocProgress` type,
  `getDocProgress(history: ActivityHistoryItem[]): DocProgress`. Task 9
  imports both `getDocProgress` and `DocProgress`.

**The bug:** `getWipStepInfo` currently marks a running node as `blocked`
whenever it is _targeted by any_ `back: true` edge in `FASE1_EDGES` —
without checking whether the process actually _arrived_ via that back
edge. Two nodes (`t_aanvullen2`, `t_aanvullen4`) are BOTH a normal
forward-path target (from `g_intake`'s `'Ja'` edge and from `t_planning`,
respectively) AND a back-edge target (from `g_akkoord2` and `g_akkoord4`
respectively, both `back: true`). So a brand-new instance's first, entirely
normal pass through either task is incorrectly reported as `blocked`,
which then feeds `computeHealth` in `PhaseDetail.tsx` and downgrades a
healthy project to "Aandacht" (amber). The fix: only report `blocked` when
the running activity has actually executed more than once (a genuine
repeat visit), using the same "count occurrences" idea `countReworkLoops`
already uses correctly one function below it in this same file.

- [ ] **Step 1: Write the failing tests**

  In `rip-model.test.ts`, replace the existing test named `'surfaces the
originating gateway when the running node is a rework target'` (inside
  `describe('getWipStepInfo', ...)`) with these two tests:

  ```ts
  it('surfaces the originating gateway when the running node is a genuine rework re-execution', () => {
    // Task_AanvullenProjectplan2 ran once already (the normal forward
    // pass), the gateway then fired 'niet akkoord', and it's now running
    // a SECOND time — that repeat execution is the actual rework signal.
    const history: ActivityHistoryItem[] = [
      activity({
        activityId: 'Task_AanvullenProjectplan2',
        startTime: '2026-07-30T00:00:00Z',
        endTime: '2026-07-30T01:00:00Z',
      }),
      activity({
        activityId: 'Gateway_Akkoord2',
        activityType: 'exclusiveGateway',
        endTime: '2026-07-31T23:59:00Z',
      }),
      activity({
        activityId: 'Task_AanvullenProjectplan2',
        startTime: '2026-08-01T00:00:00Z',
        endTime: null,
      }),
    ];

    const result = getWipStepInfo(history);

    expect(result!.blocked).toBe('Akkoord?');
  });

  it('does NOT flag a first-time pass through a rework-target node as blocked', () => {
    // t_aanvullen2 is ALSO the normal forward-path target of g_intake's
    // 'Ja' edge — a brand-new instance's first, entirely normal visit
    // must not be reported as blocked just because SOME edge into this
    // node happens to be a back edge.
    const history: ActivityHistoryItem[] = [
      activity({
        activityId: 'Task_AanvullenProjectplan2',
        startTime: '2026-08-01T00:00:00Z',
        endTime: null,
      }),
    ];

    const result = getWipStepInfo(history);

    expect(result!.blocked).toBeNull();
  });
  ```

  Then append this new `describe` block after `describe('countReworkLoops', ...)`:

  ```ts
  describe('getDocProgress', () => {
    it('counts FASE1_DOCS whose produceNode has finished', () => {
      // t_aanleveren (doc 1, bpmnId Task_AanlevrenProjectplan) and
      // t_aanvullen2 (doc 2, bpmnId Task_AanvullenProjectplan2) finished;
      // t_psu (doc 3) and t_aanvullen4 (doc 4) have not been reached.
      const history: ActivityHistoryItem[] = [
        activity({ activityId: 'Task_AanlevrenProjectplan', endTime: '2026-08-01T00:00:00Z' }),
        activity({ activityId: 'Task_AanvullenProjectplan2', endTime: '2026-08-02T00:00:00Z' }),
      ];
      const result = getDocProgress(history);
      expect(result.docsDone).toBe(2);
      expect(result.docsTotal).toBe(4);
    });

    it('returns 0/4 for an empty history', () => {
      expect(getDocProgress([])).toEqual({ docsDone: 0, docsTotal: 4 });
    });

    it('returns 4/4 when every produceNode has finished', () => {
      const history: ActivityHistoryItem[] = [
        activity({ activityId: 'Task_AanlevrenProjectplan', endTime: '2026-08-01T00:00:00Z' }),
        activity({ activityId: 'Task_AanvullenProjectplan2', endTime: '2026-08-02T00:00:00Z' }),
        activity({ activityId: 'Task_UitvoerenPSU', endTime: '2026-08-03T00:00:00Z' }),
        activity({ activityId: 'Task_AanvullenProjectplan4', endTime: '2026-08-04T00:00:00Z' }),
      ];
      expect(getDocProgress(history).docsDone).toBe(4);
    });
  });
  ```

  Update the import line to bring in `getDocProgress`:

  ```ts
  import { getWipStepInfo, countReworkLoops, getDocProgress } from './rip-model';
  ```

- [ ] **Step 2: Run the tests to verify they fail**

  Run (from `packages/frontend`):
  `npx vitest run src/pages/infra-board/rip-model.test.ts -t "does NOT flag|getDocProgress"`

  Expected: FAIL — the "does NOT flag" test fails against the current
  (buggy) implementation, which reports `blocked: 'Akkoord?'` for a first
  pass; the `getDocProgress` tests fail with "is not a function". (The
  "genuine rework re-execution" test may already pass against the old
  code too — that's expected, not a problem; the old code is
  over-eager about `blocked`, not under-eager.)

- [ ] **Step 3: Write minimal implementation**

  In `rip-model.ts`, replace the `getWipStepInfo` function body's
  `blocked` computation:

  ```ts
  export function getWipStepInfo(history: ActivityHistoryItem[]): WipStepInfo | null {
    const running = history.find((h) => !h.endTime && !h.canceled);
    if (!running) return null;
    const node = FASE1_NODES.find((n) => n.bpmnId === running.activityId);
    if (!node) return null;
    const backEdge = FASE1_EDGES.find((e) => e.back && e.to === node.id);
    // A node targeted by a back edge is only "blocked" if this is a
    // genuine rework re-execution — i.e. this activityId has run before.
    // Two FASE1 nodes (t_aanvullen2, t_aanvullen4) are ALSO the normal
    // forward-path target of an earlier task/gateway, so a first-ever
    // visit must not be reported as blocked just because SOME edge into
    // the node happens to be a back edge.
    const executionCount = history.filter((h) => h.activityId === running.activityId).length;
    const blocked =
      backEdge && executionCount > 1
        ? (FASE1_NODES.find((n) => n.id === backEdge.from)?.label ?? null)
        : null;
    const daysInStep = Math.floor(
      (Date.now() - new Date(running.startTime).getTime()) / (1000 * 60 * 60 * 24)
    );
    return {
      step: node.label,
      stepRole: roleByKey(ROW_TO_LANE_KEY[node.row]).label,
      daysInStep,
      blocked,
    };
  }
  ```

  Then add, after `countReworkLoops`:

  ```ts
  export interface DocProgress {
    docsDone: number;
    docsTotal: number;
  }

  /**
   * Product-progress for a live R2.1 instance: how many of FASE1_DOCS are
   * finished, per nodeStatusFromHistory's node-status derivation.
   */
  export function getDocProgress(history: ActivityHistoryItem[]): DocProgress {
    const status = nodeStatusFromHistory(history);
    const docsDone = FASE1_DOCS.filter((d) => status[d.produceNode] === 'done').length;
    return { docsDone, docsTotal: FASE1_DOCS.length };
  }
  ```

- [ ] **Step 4: Run the tests to verify they pass**

  Same command as Step 2. Expected: PASS.

- [ ] **Step 5: Run the full file to confirm no regressions**

  Run (from `packages/frontend`): `npx vitest run src/pages/infra-board/rip-model.test.ts`

  Expected: PASS, every test in the file.

- [ ] **Step 6: Commit**

  ```bash
  git add packages/frontend/src/pages/infra-board/rip-model.ts packages/frontend/src/pages/infra-board/rip-model.test.ts
  git commit -m "fix(frontend): getWipStepInfo no longer false-flags a first pass as blocked; add getDocProgress"
  ```

---

### Task 7: `infra.api.ts` — add `usePhase1Completed` hook

**Files:**

- Modify: `packages/frontend/src/services/infra.api.ts`
- Modify: `packages/frontend/src/services/infra.api.test.ts`

**Interfaces:**

- Consumes: `useAsync` (already in this file, module-private), `businessApi`
  (already imported).
- Produces: `Phase1CompletedInstance` type, `usePhase1Completed(): AsyncState<Phase1CompletedInstance[]>`.
  Task 9 imports both.

- [ ] **Step 1: Write the failing tests**

  In `infra.api.test.ts`, add `usePhase1Completed` to the import from
  `./infra.api`, and add `phase1Completed: vi.fn()` to the `mockBusinessApi.rip`
  object:

  ```ts
  import {
    groupTasksByHorizon,
    useActivityHistory,
    useDeployedProcessKeys,
    useLivePhaseCounts,
    useOpenTasks,
    usePhase1Completed,
  } from './infra.api';
  ```

  ```ts
  const mockBusinessApi = vi.hoisted(() => ({
    task: { list: vi.fn() },
    rip: {
      phase1Active: vi.fn(),
      phase1Completed: vi.fn(),
      phase1Documents: vi.fn(),
      deploymentStatus: vi.fn(),
      phasesCounts: vi.fn(),
    },
    process: { activityHistory: vi.fn() },
  }));
  ```

  Then append this `describe` block after `describe('useActivityHistory', ...)`:

  ```ts
  describe('usePhase1Completed', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('loads completed instances and exposes them once resolved', async () => {
      const completed = [
        {
          id: 'done-1',
          startTime: '2026-01-01T00:00:00Z',
          endTime: '2026-03-15T00:00:00Z',
          projectNumber: '88888',
          projectName: 'Afgerond testproject',
          edocsWorkspaceId: 'w2',
        },
      ];
      mockBusinessApi.rip.phase1Completed.mockResolvedValue({ success: true, data: completed });

      const { result } = renderHook(() => usePhase1Completed());

      expect(result.current.loading).toBe(true);
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.data).toEqual(completed);
      expect(result.current.error).toBe(false);
    });

    it('sets error state when the call rejects', async () => {
      mockBusinessApi.rip.phase1Completed.mockRejectedValue(new Error('network down'));

      const { result } = renderHook(() => usePhase1Completed());

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.error).toBe(true);
    });
  });
  ```

- [ ] **Step 2: Run the tests to verify they fail**

  Run (from `packages/frontend`):
  `npx vitest run src/services/infra.api.test.ts -t "usePhase1Completed"`

  Expected: FAIL — `usePhase1Completed is not a function`.

- [ ] **Step 3: Write minimal implementation**

  In `infra.api.ts`, add right after `useActivePhase1`:

  ```ts
  export interface Phase1CompletedInstance {
    id: string;
    startTime: string;
    endTime: string;
    projectNumber: string;
    projectName: string;
    edocsWorkspaceId: string;
  }

  /** Completed RIP Fase 1 instances (Gereed tab — live Fase-1 rows). */
  export const usePhase1Completed = () =>
    useAsync<Phase1CompletedInstance[]>(() => businessApi.rip.phase1Completed(), []);
  ```

- [ ] **Step 4: Run the tests to verify they pass**

  Same command as Step 2. Expected: PASS.

- [ ] **Step 5: Run the full file to confirm no regressions**

  Run (from `packages/frontend`): `npx vitest run src/services/infra.api.test.ts`

  Expected: PASS, every test in the file.

- [ ] **Step 6: Commit**

  ```bash
  git add packages/frontend/src/services/infra.api.ts packages/frontend/src/services/infra.api.test.ts
  git commit -m "feat(frontend): add usePhase1Completed hook"
  ```

---

### Task 8: `infra-board.data.ts` — dedupe mock WIP/Gereed row selection against `getMockPhaseCounts`

**Files:**

- Modify: `packages/frontend/src/pages/infra-board/infra-board.data.ts`
- Modify: `packages/frontend/src/pages/infra-board/infra-board.data.test.ts`

**Interfaces:**

- Consumes: `getMockPortfolio`, `RIP_PHASES`, `RipPhase` type (already in
  this file).
- Produces: `getMockWipRows(phase: RipPhase): PortfolioProject[]`,
  `getMockGereedRows(phase: RipPhase): PortfolioProject[]`. Task 9 imports
  both, replacing `PhaseDetail.tsx`'s current module-private
  `getMockPortfolioWipRows`/`getMockPortfolioGereedRows` (which duplicate
  this same classification logic, live in the wrong file, and already
  disagree with `getMockPhaseCounts` on the `beyond` phase R5.2 — harmless
  today only because `PhaseDetail.tsx` early-returns before rendering any
  tab for a `beyond` phase, but a real drift risk for anyone editing the
  counting logic in one place and not the other).

- [ ] **Step 1: Write the failing tests**

  Add `getMockWipRows` and `getMockGereedRows` to the existing import from
  `./infra-board.data` in `infra-board.data.test.ts`, then append this
  `describe` block after `describe('getMockPhaseInstanceDetail', ...)`:

  ```ts
  describe('getMockWipRows / getMockGereedRows', () => {
    it('matches getMockPhaseCounts wip/gereed counts for every phase', () => {
      const counts = getMockPhaseCounts();
      for (const phase of RIP_PHASES) {
        expect(getMockWipRows(phase).length).toBe(counts[phase.code].wip);
        expect(getMockGereedRows(phase).length).toBe(counts[phase.code].gereed);
      }
    });

    it('never returns wip rows for the beyond (R5.2) phase', () => {
      const r52 = RIP_PHASES.find((p) => p.code === 'R5.2')!;
      expect(getMockWipRows(r52)).toEqual([]);
    });
  });
  ```

- [ ] **Step 2: Run the tests to verify they fail**

  Run (from `packages/frontend`):
  `npx vitest run src/pages/infra-board/infra-board.data.test.ts -t "getMockWipRows"`

  Expected: FAIL — `getMockWipRows is not a function`.

- [ ] **Step 3: Write minimal implementation**

  In `infra-board.data.ts`, add right after `getMockPhaseCounts` (before
  `getReadyProjects`):

  ```ts
  /**
   * Mock projects currently WIP at this phase — same classification
   * getMockPhaseCounts uses for its `wip` count (curIdx === i, state ===
   * 'wip', never for a `beyond` phase — the ladder's last rung is always
   * 'wip' by construction but counted as geparkeerd instead). Exposed as
   * rows for the WIP tab.
   */
  export function getMockWipRows(phase: RipPhase): PortfolioProject[] {
    if (phase.beyond) return [];
    const idx = RIP_PHASES.findIndex((p) => p.code === phase.code);
    return getMockPortfolio().filter((p) => {
      const curIdx = RIP_PHASES.findIndex((rp) => rp.code === p.ripPhaseCode);
      return curIdx === idx && p.ripPhaseState === 'wip';
    });
  }

  /**
   * Mock projects already past this phase — same classification
   * getMockPhaseCounts uses for its `gereed` count. Exposed as rows for
   * the Gereed tab.
   */
  export function getMockGereedRows(phase: RipPhase): PortfolioProject[] {
    const idx = RIP_PHASES.findIndex((p) => p.code === phase.code);
    return getMockPortfolio().filter((p) => {
      const curIdx = RIP_PHASES.findIndex((rp) => rp.code === p.ripPhaseCode);
      return curIdx > idx;
    });
  }
  ```

- [ ] **Step 4: Run the tests to verify they pass**

  Same command as Step 2 (then also run without the `-t` filter — see
  Step 5). Expected: PASS.

- [ ] **Step 5: Run the full file to confirm no regressions**

  Run (from `packages/frontend`): `npx vitest run src/pages/infra-board/infra-board.data.test.ts`

  Expected: PASS, every test in the file.

- [ ] **Step 6: Commit**

  ```bash
  git add packages/frontend/src/pages/infra-board/infra-board.data.ts packages/frontend/src/pages/infra-board/infra-board.data.test.ts
  git commit -m "refactor(frontend): move mock WIP/Gereed row selection into infra-board.data.ts, deduped against getMockPhaseCounts"
  ```

---

### Task 9: `PhaseDetail.tsx` — route WIP/Gereed through the hook layer; loading/error/empty states; refetch after Starten; Producten + full Gereed summary; fix null-health default

**Files:**

- Modify: `packages/frontend/src/components/InfraBoardDashboard/PhaseDetail.tsx`
- Modify: `packages/frontend/src/components/InfraBoardDashboard/PhaseDetail.test.tsx`
- Modify: `packages/frontend/src/pages/infra-board/dashboard-infra.css`

**Interfaces:**

- Consumes: `useActivePhase1`, `usePhase1Completed` (Task 7, `usePhase1Completed`
  is new — `useActivePhase1` already existed but `PhaseDetail.tsx` wasn't
  using it); `getDocProgress`, `DocProgress` (Task 6); `getMockWipRows`,
  `getMockGereedRows` (Task 8, replacing this file's own
  `getMockPortfolioWipRows`/`getMockPortfolioGereedRows`, which are
  deleted by this task); `getWipStepInfo`, `countReworkLoops`, `HEALTH`,
  `HealthKey`, `WipStepInfo` (existing).
- Produces: WIP/Gereed tabs now show a loading indicator while their live
  list is in flight, an error banner with a retry button on failure, and
  an empty-state message when there are zero rows (live + mock combined);
  a live WIP row's Producten column is now computed via `getDocProgress`
  instead of a hardcoded dash; the Gereed summary line now includes all
  four elements the design spec specifies; a live WIP row whose step info
  couldn't be derived (fetch failure, or an unrecognized `activityId`) now
  renders a dash for Gezondheid instead of a false "Op schema" (green);
  starting a process (either the multi-select or R2.1 fallback flow) now
  triggers a WIP refetch so newly started instances appear without a
  manual page reload.

This task rewrites large parts of `PhaseDetail.tsx`. Rather than a series
of surgical patches on top of three earlier passes over this same file,
Step 3 below gives the complete new file content — read it in full before
editing, since nearly every section changed in some way (imports, the two
tab bodies, the two Starten handlers, and one new block of pre-render
Gereed-summary arithmetic), even though the header, side panel, and
Starten-tab JSX are byte-for-byte identical to what's there today.

- [ ] **Step 1: Write the failing tests**

  In `PhaseDetail.test.tsx`, append these tests. The WIP ones go inside
  the existing `describe('PhaseDetail — WIP tab', ...)` block (after its
  two existing tests); the Gereed ones go inside the existing
  `describe('PhaseDetail — Gereed tab', ...)` block (after its four
  existing tests); the refetch one goes inside the existing
  `describe('PhaseDetail — Starten tab, R2.1 fallback', ...)` block
  (after its existing tests):

  ```tsx
  // Inside describe('PhaseDetail — WIP tab', ...):

  it('shows a loading indicator while live WIP data is in flight', async () => {
    mockPhase1Active.mockImplementation(() => new Promise(() => {})); // never resolves
    const user = userEvent.setup();
    render(<PhaseDetail phaseCode="R2.1" onBack={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /WIP/ }));

    expect(screen.getByText('Bezig met laden…')).toBeInTheDocument();
  });

  it('shows an error banner with a retry button when live WIP data fails to load', async () => {
    mockPhase1Active.mockResolvedValue({ success: false });
    const user = userEvent.setup();
    render(<PhaseDetail phaseCode="R2.1" onBack={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /WIP/ }));

    expect(
      await screen.findByText('Live WIP-gegevens konden niet worden geladen.', { exact: false })
    ).toBeInTheDocument();
    mockPhase1Active.mockClear();
    await user.click(screen.getByRole('button', { name: 'Opnieuw proberen' }));
    expect(mockPhase1Active).toHaveBeenCalledTimes(1);
  });

  it('computes Producten (docsDone/docsTotal) for a live WIP row from its activity history', async () => {
    mockPhase1Active.mockResolvedValue({
      success: true,
      data: [
        {
          id: 'live-2',
          startTime: '2026-08-01T00:00:00Z',
          projectNumber: '55555',
          projectName: 'Doc progress project',
          edocsWorkspaceId: 'w4',
        },
      ],
    });
    mockActivityHistory.mockResolvedValue({
      success: true,
      data: [
        {
          id: 'a1',
          activityId: 'Task_AanlevrenProjectplan',
          activityName: 'Aanleveren Projectplan',
          activityType: 'userTask',
          assignee: null,
          startTime: '2026-08-01T00:00:00Z',
          endTime: '2026-08-01T01:00:00Z',
          durationInMillis: 1,
          canceled: false,
        },
        {
          id: 'a2',
          activityId: 'Task_AanvullenProjectplan2',
          activityName: 'Aanvullen Projectplan',
          activityType: 'userTask',
          assignee: null,
          startTime: '2026-08-02T00:00:00Z',
          endTime: '2026-08-02T01:00:00Z',
          durationInMillis: 1,
          canceled: false,
        },
        {
          id: 'a3',
          activityId: 'Task_OrganiserenIntakeoverleg',
          activityName: 'Organiseren intake-overleg',
          activityType: 'userTask',
          assignee: null,
          startTime: '2026-08-03T00:00:00Z',
          endTime: null,
          durationInMillis: null,
          canceled: false,
        },
      ],
    });
    const user = userEvent.setup();
    render(<PhaseDetail phaseCode="R2.1" onBack={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /WIP/ }));

    const row = (await screen.findByText('Doc progress project', { exact: false })).closest('tr');
    // Producten is populated by a SECOND async hop (activity-history fetch,
    // chained off the first list fetch resolving) — use findByText, not a
    // synchronous getByText, so this doesn't race the two hops.
    expect(await within(row!).findByText('2/4')).toBeInTheDocument();
  });

  it('renders a dash for Gezondheid, not a false "Op schema", when a live row has no derivable step info', async () => {
    mockPhase1Active.mockResolvedValue({
      success: true,
      data: [
        {
          id: 'live-3',
          startTime: '2026-08-01T00:00:00Z',
          projectNumber: '44444',
          projectName: 'Unknown state project',
          edocsWorkspaceId: 'w6',
        },
      ],
    });
    mockActivityHistory.mockResolvedValue({ success: false });
    const user = userEvent.setup();
    render(<PhaseDetail phaseCode="R2.1" onBack={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /WIP/ }));

    await screen.findByText('Unknown state project', { exact: false });
    expect(screen.queryByText('Op schema')).not.toBeInTheDocument();
  });
  ```

  ```tsx
  // Inside describe('PhaseDetail — Gereed tab', ...):

  it('shows a loading indicator while live Gereed data is in flight', async () => {
    mockPhase1Completed.mockImplementation(() => new Promise(() => {})); // never resolves
    const user = userEvent.setup();
    render(<PhaseDetail phaseCode="R2.1" onBack={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /Gereed/ }));

    expect(screen.getByText('Bezig met laden…')).toBeInTheDocument();
  });

  it('shows an error banner with a retry button when live Gereed data fails to load', async () => {
    mockPhase1Completed.mockResolvedValue({ success: false });
    const user = userEvent.setup();
    render(<PhaseDetail phaseCode="R2.1" onBack={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /Gereed/ }));

    expect(
      await screen.findByText('Live Gereed-gegevens konden niet worden geladen.', { exact: false })
    ).toBeInTheDocument();
    mockPhase1Completed.mockClear();
    await user.click(screen.getByRole('button', { name: 'Opnieuw proberen' }));
    expect(mockPhase1Completed).toHaveBeenCalledTimes(1);
  });

  it('renders the full Gereed summary line with average doorlooptijd, norm, and review-loop count', async () => {
    mockPhase1Completed.mockResolvedValue({
      success: true,
      data: [
        {
          id: 'done-3',
          startTime: '2026-01-01T00:00:00Z',
          endTime: '2026-03-15T00:00:00Z',
          projectNumber: '66666',
          projectName: 'Summary testproject',
          edocsWorkspaceId: 'w5',
        },
      ],
    });
    mockActivityHistory.mockResolvedValue({ success: true, data: [] });
    const user = userEvent.setup();
    render(<PhaseDetail phaseCode="R2.1" onBack={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /Gereed/ }));

    expect(
      await screen.findByText(
        /afgerond · Gemiddelde doorlooptijd \d+ wk · norm 10 wk · \d+ met review-loop/
      )
    ).toBeInTheDocument();
  });
  ```

  ```tsx
  // Inside describe('PhaseDetail — Starten tab, R2.1 fallback', ...):

  it('refetches live WIP data after successfully starting a process', async () => {
    const user = userEvent.setup();
    render(<PhaseDetail phaseCode="R2.1" onBack={vi.fn()} />);
    await screen.findByRole('button', { name: 'R2.1 starten' });
    mockPhase1Active.mockClear();

    await user.click(screen.getByRole('button', { name: 'R2.1 starten' }));
    await screen.findByText('R2.1 gestart', { exact: false });

    expect(mockPhase1Active).toHaveBeenCalled();
  });
  ```

  No mock setup changes are needed in this file beyond what Tasks 1-5
  already added — `useActivePhase1`/`usePhase1Completed` are NOT
  overridden in the existing `vi.mock('../../services/infra.api', ...)`
  block (only `useDeployedProcessKeys`/`useLivePhaseCounts` are), so the
  real hook implementations run and call the already-mocked
  `businessApi.rip.phase1Active`/`phase1Completed` underneath — exactly
  like `useActivityHistory` already does unmocked in this same file.

  One EXISTING test needs a one-line fix, not just new tests: Task 4's
  `'shows the computed rework-loop count for a real completed row'` (in
  `describe('PhaseDetail — Gereed tab', ...)`) currently ends with a
  synchronous `expect(within(row!).getByText('1')).toBeInTheDocument();`.
  Step 3's implementation computes `loops` in a SEPARATE effect chained
  off `completedInstances` (two async hops: the list fetch, then the
  per-instance activity-history fetch), where the old code computed it in
  one combined effect — so this assertion now needs to tolerate that
  second hop. Change it to:

  ```tsx
  expect(await within(row!).findByText('1')).toBeInTheDocument();
  ```

  A second EXISTING test has the same issue: Task 3's `'renders a real
R2.1 row with a LIVE badge, using the live activity history'` (in
  `describe('PhaseDetail — WIP tab', ...)`) has this synchronous line
  right after its `findByText('Live testproject', ...)`:

  ```tsx
  expect(screen.getByText('Organiseren intake-overleg', { exact: false })).toBeInTheDocument();
  ```

  `info.step` (the source of that text) is now populated by the same
  second async hop as the Producten fix above. Change this line to:

  ```tsx
  expect(
    await screen.findByText('Organiseren intake-overleg', { exact: false })
  ).toBeInTheDocument();
  ```

  (The project-name and `LIVE`-badge assertions around it are unaffected
  — they don't depend on the derived-info hop — so leave those as-is.)

  Note: no dedicated "empty state" test is included — every one of the 9
  RIP phases in the current mock catalogue has at least one WIP and one
  Gereed mock row (verified empirically), so that branch has no reachable
  test fixture today without mocking `infra-board.data.ts` itself, which
  would deviate from this file's established convention of using the real
  mock catalogue throughout. The empty-state UI is still implemented
  (Step 3) for robustness against a future smaller mock catalogue or
  tenant.

- [ ] **Step 2: Run the tests to verify they fail**

  Run (from `packages/frontend`):
  `npx vitest run src/components/InfraBoardDashboard/PhaseDetail.test.tsx -t "loading indicator|error banner|Producten|Op schema|full Gereed summary|refetches"`

  Expected: FAIL — none of this behavior exists yet.

- [ ] **Step 3: Write minimal implementation**

  Replace the ENTIRE contents of `PhaseDetail.tsx` with:

  ```tsx
  import { Fragment, useEffect, useState } from 'react';
  import {
    RIP_PHASES,
    RIP_STAGES,
    RIP_DEPLOY_META,
    getPhaseDeployStatus,
    ripPhaseByCode,
  } from '../../pages/infra-board/rip-phases.catalog';
  import {
    getMockPhaseCounts,
    getReadyProjects,
    getOutOfSequenceProjects,
    getMockPhaseInstanceDetail,
    getMockWipRows,
    getMockGereedRows,
  } from '../../pages/infra-board/infra-board.data';
  import {
    combinePhaseCounts,
    getKlaarCounts,
    normalizeLiveCounts,
  } from '../../pages/infra-board/rip-phase-counts';
  import {
    useDeployedProcessKeys,
    useLivePhaseCounts,
    useActivePhase1,
    usePhase1Completed,
  } from '../../services/infra.api';
  import { businessApi } from '../../services/api';
  import {
    getWipStepInfo,
    getDocProgress,
    countReworkLoops,
    HEALTH,
    type HealthKey,
    type WipStepInfo,
    type DocProgress,
  } from '../../pages/infra-board/rip-model';
  import RipFase1WipViewer from '../CaseworkerDashboard/RipFase1WipViewer';

  interface Props {
    phaseCode: string;
    onBack: () => void;
  }

  interface StartError {
    cause?: string;
    instance?: string;
  }

  /** groen/geel/rood heuristic — illustrative only, no per-step norm
   *  exists in the catalogue at this granularity (see design spec §1). */
  function computeHealth(blocked: string | null, daysInStep: number): HealthKey {
    if (daysInStep > 28 || (blocked && daysInStep > 14)) return 'rood';
    if (blocked || daysInStep > 14) return 'geel';
    return 'groen';
  }

  export default function PhaseDetail({ phaseCode, onBack }: Props) {
    const phase = ripPhaseByCode(phaseCode);
    const { data: deployment } = useDeployedProcessKeys();
    const { data: liveCountsRaw } = useLivePhaseCounts();
    const [tab, setTab] = useState<'starten' | 'wip' | 'gereed'>('starten');
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [reasons, setReasons] = useState<Record<string, string>>({});
    const [showOutOfSequence, setShowOutOfSequence] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [justStarted, setJustStarted] = useState(0);
    const [fallbackStarted, setFallbackStarted] = useState(false);
    const [fallbackError, setFallbackError] = useState<StartError | null>(null);
    const [openDossier, setOpenDossier] = useState<string | null>(null);

    const {
      data: activeInstances,
      loading: wipLoading,
      error: wipError,
      reload: reloadWip,
    } = useActivePhase1();
    const {
      data: completedInstances,
      loading: gereedLoading,
      error: gereedError,
      reload: reloadGereed,
    } = usePhase1Completed();

    const [wipDerived, setWipDerived] = useState<
      Record<string, { info: WipStepInfo | null; docs: DocProgress }>
    >({});
    const [gereedDerived, setGereedDerived] = useState<Record<string, { loops: number }>>({});

    useEffect(() => {
      if (phaseCode !== 'R2.1' || !activeInstances) return;
      let alive = true;
      Promise.all(
        activeInstances.map(async (inst) => {
          const histRes = await businessApi.process.activityHistory(inst.id);
          const history = histRes.success && histRes.data ? histRes.data : [];
          return [
            inst.id,
            { info: getWipStepInfo(history), docs: getDocProgress(history) },
          ] as const;
        })
      ).then((entries) => {
        if (alive) setWipDerived(Object.fromEntries(entries));
      });
      return () => {
        alive = false;
      };
    }, [phaseCode, activeInstances]);

    useEffect(() => {
      if (phaseCode !== 'R2.1' || !completedInstances) return;
      let alive = true;
      Promise.all(
        completedInstances.map(async (inst) => {
          const histRes = await businessApi.process.activityHistory(inst.id);
          const history = histRes.success && histRes.data ? histRes.data : [];
          return [inst.id, { loops: countReworkLoops(history) }] as const;
        })
      ).then((entries) => {
        if (alive) setGereedDerived(Object.fromEntries(entries));
      });
      return () => {
        alive = false;
      };
    }, [phaseCode, completedInstances]);

    if (!phase) return null;

    const deployedKeys = new Set(deployment?.deployedKeys ?? []);
    const mockCounts = getMockPhaseCounts();
    const liveCounts = normalizeLiveCounts(liveCountsRaw?.counts ?? {}, RIP_PHASES);
    const combined = combinePhaseCounts(mockCounts, liveCounts);
    const c = combined[phase.code] ?? {
      wip: 0,
      gereed: 0,
      geparkeerd: 0,
      liveWip: 0,
      liveGereed: 0,
      liveGeparkeerd: 0,
    };
    const klaarCombined = getKlaarCounts(RIP_PHASES, combined);
    const klaar = klaarCombined[phase.code];
    const status = getPhaseDeployStatus(phase, deployedKeys);
    const meta = RIP_DEPLOY_META[status];
    const stage = RIP_STAGES.find((s) => s.code === phase.stage);
    const isFirstPhase = RIP_PHASES[0].code === phase.code;
    const canStart = status === 'gedeployed';

    const header = (
      <>
        <button type="button" className="pb-back-link" onClick={onBack}>
          ← Faseladder
        </button>
        <p className="pb-eyebrow">
          BEHEER · {stage?.code} {stage?.name.toUpperCase()}
        </p>
        <h1 className="pb-h1">
          <span className="pb-phase-chip">{phase.code}</span> {phase.name}{' '}
          <span className="pb-deploy-pill" style={{ color: meta.color, borderColor: meta.color }}>
            {meta.label}
          </span>
        </h1>
        <div className="pb-meta-strip">
          <div>
            <span className="l">Start bij</span>
            <span className="v">{phase.entry}</span>
          </div>
          <div>
            <span className="l">Sluit met</span>
            <span className="v">{phase.exit}</span>
          </div>
          <div>
            <span className="l">Trekker</span>
            <span className="v">{phase.lead}</span>
          </div>
          <div>
            <span className="l">Betrokken rollen</span>
            <span className="v">{phase.roles.length}</span>
          </div>
        </div>
      </>
    );

    if (phase.beyond) {
      return (
        <div className="pb-view">
          {header}
          <div className="pb-banner">
            Niet gemodelleerd — {phase.name} is alleen benoemd als vervolgstap. Er is nog geen
            overzichtsplaat en dus geen procesmodel.
          </div>
        </div>
      );
    }

    async function handleStartSelected() {
      setSubmitting(true);
      try {
        const nrs = [...selected];
        await Promise.all(
          nrs.map(() => businessApi.process.start(phase!.processDefinitionKey!, {}))
        );
        setSelected(new Set());
        setReasons({});
        setJustStarted(nrs.length);
        reloadWip();
      } finally {
        setSubmitting(false);
      }
    }

    async function handleFallbackStart() {
      setSubmitting(true);
      setFallbackError(null);
      try {
        const res = await businessApi.process.start('RipPhase1Process', {});
        if (res.success) {
          setFallbackStarted(true);
          reloadWip();
        } else {
          setFallbackError({ cause: res.error?.details, instance: res.error?.instance });
        }
      } catch {
        setFallbackError({});
      } finally {
        setSubmitting(false);
      }
    }

    const readyProjects = getReadyProjects(phase.code);
    const outOfSequenceProjects = getOutOfSequenceProjects(phase.code);

    function toggleReady(nr: string) {
      setSelected((s) => {
        const next = new Set(s);
        if (next.has(nr)) next.delete(nr);
        else next.add(nr);
        return next;
      });
    }

    function setReason(nr: string, value: string) {
      setReasons((r) => ({ ...r, [nr]: value }));
      if (value.trim().length < 4) {
        setSelected((s) => {
          if (!s.has(nr)) return s;
          const next = new Set(s);
          next.delete(nr);
          return next;
        });
      }
    }

    const isR21 = phaseCode === 'R2.1';
    const liveActive = isR21 ? (activeInstances ?? []) : [];
    const liveCompleted = isR21 ? (completedInstances ?? []) : [];
    const showWipLoading = isR21 && wipLoading && !activeInstances;
    const showWipError = isR21 && wipError;
    const showGereedLoading = isR21 && gereedLoading && !completedInstances;
    const showGereedError = isR21 && gereedError;

    const mockWipRows = getMockWipRows(phase);
    const mockGereedRows = getMockGereedRows(phase);

    // Gereed summary line stats — combines live + mock rows into one set
    // of arithmetic, same "never two parallel totals" merge convention as
    // everywhere else in this file.
    const liveGereedStats = liveCompleted.map((inst) => ({
      weeks: Math.round(
        (new Date(inst.endTime).getTime() - new Date(inst.startTime).getTime()) /
          (1000 * 60 * 60 * 24 * 7)
      ),
      loops: gereedDerived[inst.id]?.loops ?? 0,
    }));
    const mockGereedStats = mockGereedRows.map((p) => {
      const detail = getMockPhaseInstanceDetail(p, phase);
      return { weeks: detail.actualWeeks ?? phase.weeks, loops: detail.loops };
    });
    const allGereedStats = [...liveGereedStats, ...mockGereedStats];
    const totalAfgerond = allGereedStats.length;
    const avgWeeks = totalAfgerond
      ? Math.round(allGereedStats.reduce((sum, r) => sum + r.weeks, 0) / totalAfgerond)
      : 0;
    const metLoop = allGereedStats.filter((r) => r.loops > 0).length;

    return (
      <div className="pb-view">
        {header}

        <div className="pb-tabs">
          <button
            type="button"
            className={tab === 'starten' ? 'active' : ''}
            onClick={() => setTab('starten')}
          >
            Starten <span className="pb-tab-badge">{klaar ?? 0}</span>
          </button>
          <button
            type="button"
            className={tab === 'wip' ? 'active' : ''}
            onClick={() => setTab('wip')}
          >
            WIP <span className="pb-tab-badge">{c.wip}</span>
          </button>
          <button
            type="button"
            className={tab === 'gereed' ? 'active' : ''}
            onClick={() => setTab('gereed')}
          >
            Gereed <span className="pb-tab-badge">{c.gereed}</span>
          </button>
        </div>

        {tab === 'wip' && (
          <>
            {showWipError && (
              <div className="pb-banner pb-banner-error">
                Live WIP-gegevens konden niet worden geladen.{' '}
                <button type="button" className="v2-btn v2-btn-ghost v2-btn-sm" onClick={reloadWip}>
                  Opnieuw proberen
                </button>
              </div>
            )}
            {showWipLoading ? (
              <p className="pb-placeholder">Bezig met laden…</p>
            ) : liveActive.length + mockWipRows.length === 0 ? (
              <p className="pb-placeholder">Geen projecten in uitvoering voor {phase.code}.</p>
            ) : (
              <table className="pb-instance-table">
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>Huidige stap</th>
                    <th>Rol</th>
                    <th>Dagen</th>
                    <th>Producten</th>
                    <th>Blokkade</th>
                    <th>Gezondheid</th>
                  </tr>
                </thead>
                <tbody>
                  {liveActive.map((inst) => {
                    const derived = wipDerived[inst.id];
                    const info = derived?.info ?? null;
                    const health = info ? computeHealth(info.blocked, info.daysInStep) : null;
                    return (
                      <tr key={inst.id}>
                        <td>
                          <span className="pb-proj-nr">
                            {inst.projectNumber || inst.id.slice(0, 8)}
                          </span>{' '}
                          {inst.projectName || 'RIP Fase 1 project'}
                          <span className="pb-live-badge">LIVE</span>
                        </td>
                        <td>{info?.step ?? '—'}</td>
                        <td>{info?.stepRole ?? '—'}</td>
                        <td>{info ? `${info.daysInStep}d` : '—'}</td>
                        <td>
                          {derived ? `${derived.docs.docsDone}/${derived.docs.docsTotal}` : '—'}
                        </td>
                        <td>{info?.blocked ?? '—'}</td>
                        <td>
                          {health ? (
                            <>
                              <span
                                className="pb-health-dot"
                                style={{ background: HEALTH[health].color }}
                              />{' '}
                              {HEALTH[health].label}
                            </>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {mockWipRows.map((p) => {
                    const detail = getMockPhaseInstanceDetail(p, phase);
                    const health = computeHealth(detail.blocked, detail.daysInStep);
                    return (
                      <tr key={p.id}>
                        <td>
                          <span className="pb-proj-nr">{p.nr}</span> {p.naam}
                        </td>
                        <td>{detail.step}</td>
                        <td>{detail.stepRole}</td>
                        <td>{detail.daysInStep}d</td>
                        <td>
                          {detail.docsDone}/{detail.docsTotal}
                        </td>
                        <td>{detail.blocked ?? '—'}</td>
                        <td>
                          <span
                            className="pb-health-dot"
                            style={{ background: HEALTH[health].color }}
                          />{' '}
                          {HEALTH[health].label}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </>
        )}
        {tab === 'gereed' && (
          <>
            {showGereedError && (
              <div className="pb-banner pb-banner-error">
                Live Gereed-gegevens konden niet worden geladen.{' '}
                <button
                  type="button"
                  className="v2-btn v2-btn-ghost v2-btn-sm"
                  onClick={reloadGereed}
                >
                  Opnieuw proberen
                </button>
              </div>
            )}
            {showGereedLoading ? (
              <p className="pb-placeholder">Bezig met laden…</p>
            ) : totalAfgerond === 0 ? (
              <p className="pb-placeholder">Nog geen afgeronde projecten voor {phase.code}.</p>
            ) : (
              <>
                <p className="pb-gereed-summary">
                  {totalAfgerond} afgerond · Gemiddelde doorlooptijd {avgWeeks} wk · norm{' '}
                  {phase.weeks} wk · {metLoop} met review-loop
                </p>
                <table className="pb-instance-table">
                  <thead>
                    <tr>
                      <th>Project</th>
                      <th>Afgerond</th>
                      <th>Geaccordeerd door</th>
                      <th>Doorlooptijd</th>
                      <th>Loops</th>
                      <th>Producten</th>
                      <th>Dossier</th>
                    </tr>
                  </thead>
                  <tbody>
                    {liveCompleted.map((inst) => {
                      const weeks = Math.round(
                        (new Date(inst.endTime).getTime() - new Date(inst.startTime).getTime()) /
                          (1000 * 60 * 60 * 24 * 7)
                      );
                      const loops = gereedDerived[inst.id]?.loops ?? 0;
                      return (
                        <Fragment key={inst.id}>
                          <tr>
                            <td>
                              <span className="pb-proj-nr">
                                {inst.projectNumber || inst.id.slice(0, 8)}
                              </span>{' '}
                              {inst.projectName || 'RIP Fase 1 project'}
                              <span className="pb-live-badge">LIVE</span>
                            </td>
                            <td>{new Date(inst.endTime).toLocaleDateString('nl-NL')}</td>
                            {/* Geaccordeerd door: Operaton only returns a raw assignee
                              UUID and there's no user-directory lookup anywhere in
                              this app to resolve it to a name — a dash beats a raw
                              UUID here (see design spec §2, deliberate simplification). */}
                            <td>—</td>
                            <td>
                              {weeks} wk / {phase.weeks} wk
                            </td>
                            <td>{loops}</td>
                            <td>—</td>
                            <td>
                              <button
                                type="button"
                                className="v2-btn v2-btn-ghost v2-btn-sm"
                                onClick={() =>
                                  setOpenDossier(openDossier === inst.id ? null : inst.id)
                                }
                              >
                                Openen
                              </button>
                            </td>
                          </tr>
                          {openDossier === inst.id && (
                            <tr>
                              <td colSpan={7}>
                                <RipFase1WipViewer instanceId={inst.id} />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                    {mockGereedRows.map((p) => {
                      const detail = getMockPhaseInstanceDetail(p, phase);
                      return (
                        <tr key={p.id}>
                          <td>
                            <span className="pb-proj-nr">{p.nr}</span> {p.naam}
                          </td>
                          <td>{detail.doneDate}</td>
                          <td>{detail.doneBy}</td>
                          <td>
                            {detail.actualWeeks} wk / {detail.plannedWeeks} wk
                          </td>
                          <td>{detail.loops}</td>
                          <td>
                            {detail.docsDone}/{detail.docsTotal}
                          </td>
                          <td>—</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </>
            )}
          </>
        )}

        {tab === 'starten' && (
          <div className="pb-starten-layout">
            <div className="pb-starten-main">
              {!canStart && (
                <div className="pb-banner">
                  {meta.label} — {meta.note} Er staan wel {readyProjects.length} projecten klaar
                  voor deze fase.
                </div>
              )}

              {justStarted > 0 && (
                <div className="pb-banner pb-banner-success">
                  {justStarted} proces(sen) gestart.
                </div>
              )}

              <h2>
                Projecten die {phase.code} kunnen starten <span>{readyProjects.length}</span>
              </h2>

              {isFirstPhase && readyProjects.length === 0 ? (
                fallbackStarted ? (
                  <div className="pb-banner pb-banner-success">
                    {phase.code} gestart. De intake taak staat klaar in de wachtrij.
                  </div>
                ) : (
                  <>
                    <p>Geen enkel project heeft {phase.code} als eerstvolgende fase.</p>
                    {fallbackError && (
                      <div className="pb-banner pb-banner-error">
                        <p>{phase.code} proces kon niet worden gestart.</p>
                        {fallbackError.cause && <p>{fallbackError.cause}</p>}
                      </div>
                    )}
                    <button
                      type="button"
                      className="v2-btn"
                      disabled={submitting}
                      onClick={handleFallbackStart}
                    >
                      {phase.code} starten
                    </button>
                  </>
                )
              ) : (
                <>
                  <ul className="pb-ready-list">
                    {readyProjects.map((p) => (
                      <li key={p.id}>
                        <input
                          type="checkbox"
                          disabled={!canStart}
                          checked={selected.has(p.nr)}
                          onChange={() => toggleReady(p.nr)}
                        />
                        <span className="pb-proj-nr">{p.nr}</span> {p.naam}
                        <span className="pb-badge-klaar">KLAAR</span>
                        <div className="sub">Vorige fase afgerond · {p.role}</div>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    className="v2-btn"
                    disabled={!canStart || selected.size === 0 || submitting}
                    onClick={handleStartSelected}
                  >
                    {phase.code} starten
                  </button>{' '}
                  {outOfSequenceProjects.length > 0 && !showOutOfSequence && (
                    <button
                      type="button"
                      className="v2-btn v2-btn-ghost"
                      onClick={() => setShowOutOfSequence(true)}
                    >
                      Toon {outOfSequenceProjects.length} projecten die nog niet aan beurt zijn
                    </button>
                  )}
                  {showOutOfSequence && (
                    <ul className="pb-ready-list">
                      {outOfSequenceProjects.map((p) => {
                        const reason = reasons[p.nr] ?? '';
                        return (
                          <li key={p.id}>
                            <input
                              type="checkbox"
                              disabled={!canStart || reason.trim().length < 4}
                              checked={selected.has(p.nr)}
                              onChange={() => toggleReady(p.nr)}
                            />
                            <span className="pb-proj-nr">{p.nr}</span> {p.naam}
                            <span className="pb-badge-afwijking">AFWIJKING</span>
                            <div className="sub">
                              <label htmlFor={`reden-${p.nr}`}>Afwijkingsreden</label>
                              <textarea
                                id={`reden-${p.nr}`}
                                aria-label="Afwijkingsreden"
                                value={reason}
                                onChange={(e) => setReason(p.nr, e.target.value)}
                              />
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </>
              )}
            </div>

            <div className="pb-side-panel">
              <h3>Wat er gebeurt bij starten</h3>
              <ol>
                <li>Procesinstantie van {phase.code} wordt aangemaakt per project.</li>
                <li>Eerste taak verschijnt in de wachtrij van {phase.lead}.</li>
                <li>{phase.docs.length} producten worden als op te leveren gezet.</li>
                <li>Fase sluit op {phase.exit}.</li>
              </ol>
              <dl>
                <div>
                  <dt>Doorlooptijd (norm)</dt>
                  <dd>{phase.weeks} weken</dd>
                </div>
                <div>
                  <dt>Review-loops</dt>
                  <dd>{phase.gates.length}</dd>
                </div>
                <div>
                  <dt>Kredietbesluit</dt>
                  <dd>{phase.krediet ? `Ja — ${phase.kredietBeslisser}` : 'Nee'}</dd>
                </div>
              </dl>
              <p className="pb-bron">{phase.bron}</p>
            </div>
          </div>
        )}
      </div>
    );
  }
  ```

  Note the two changes from earlier tasks' versions of this file that are
  easy to miss:
  1. The old module-private `getMockPortfolioWipRows`/`getMockPortfolioGereedRows`
     functions (and the now-unused `getMockPortfolio`/`RipPhase` type
     imports they required) are gone — replaced by `getMockWipRows`/
     `getMockGereedRows` imported from `infra-board.data.ts` (Task 8).
  2. `liveActive`/`liveCompleted` are explicitly gated on `isR21` — the
     `useActivePhase1`/`usePhase1Completed` hooks fetch unconditionally on
     every render regardless of `phaseCode` (matching this file's existing
     `useDeployedProcessKeys`/`useLivePhaseCounts` convention), so without
     this gate, R2.1's live rows would leak into every other phase's
     WIP/Gereed tables too.

- [ ] **Step 4: Run the tests to verify they pass**

  Same command as Step 2, then the full file:

  ```
  npx vitest run src/components/InfraBoardDashboard/PhaseDetail.test.tsx
  ```

  Expected: PASS, every test in the file (the 20 pre-existing tests plus
  the 7 new ones from Step 1).

- [ ] **Step 5: Add CSS**

  Append to `dashboard-infra.css` (the Gereed summary line currently has
  no rule — it renders as unstyled text):

  ```css
  .pbd .pb-gereed-summary {
    color: var(--v2-ink-2);
    font-size: 13px;
    margin: 12px 0 4px;
  }
  ```

- [ ] **Step 6: Run the full frontend suite to confirm no regressions**

  Run (from `packages/frontend`): `npx vitest run`

  Expected: PASS, all test files.

- [ ] **Step 7: Typecheck**

  Run (from `packages/frontend`): `npx tsc --noEmit`

  Expected: no errors.

- [ ] **Step 8: Commit**

  ```bash
  git add packages/frontend/src/components/InfraBoardDashboard/PhaseDetail.tsx packages/frontend/src/components/InfraBoardDashboard/PhaseDetail.test.tsx packages/frontend/src/pages/infra-board/dashboard-infra.css
  git commit -m "fix(frontend): route WIP/Gereed through the hook layer with loading/error/empty states, compute live Producten, complete Gereed summary line, refetch after Starten"
  ```
