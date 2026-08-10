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
