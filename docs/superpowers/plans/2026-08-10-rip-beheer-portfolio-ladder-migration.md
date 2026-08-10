# Cross-app RIP Ladder Migration — Portfolio, Mijn Dag, ProjectDetail Stepper (Sub-project F) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retire the placeholder six-phase model (`PHASES` in `rip-model.ts`,
`PortfolioProject.phase`/`.phaseStatuses`/`.segments`, `PHASE_DUR`) and move
`Portfolio.tsx`, `MijnDag.tsx`, and `ProjectDetail.tsx`'s stepper onto the
real twelve-phase RIP ladder (`RIP_PHASES`/`ripPhaseCode`/`ripPhaseState`),
with `wachtend` surfaced in Portfolio's legend and Kanban cards.

**Architecture:** One shared data-model task (new `RipGanttSegment`
type, hash-derived per-phase status, `wachtend` added to `StatusKey`), then
one task per consumer (Portfolio, Mijn dag, ProjectDetail), then a cleanup
task removing the now-fully-dead old model and the vestigial `phaseLabels`
prop threaded through `InfraBoardDashboard.tsx`/`InfraSectionRouter.tsx`.

**Tech Stack:** TypeScript, React, Vitest, `@testing-library/react`.

## Global Constraints

- **Sequencing note — READ BEFORE STARTING:** Task 1 removes fields
  (`phase`, `phaseStatuses`, the old `GanttSegment` shape) that
  `Portfolio.tsx`, `MijnDag.tsx`, and `ProjectDetail.tsx` still reference
  until Tasks 2-4 migrate them. This is **expected, intentional breakage**
  — each of Tasks 1-3 scopes its own verification to only the test file(s)
  it touches (never the whole suite, never `tsc --noEmit`), specifically
  because the other not-yet-migrated consumers are known-broken in the
  interim. Task 4 is where everything becomes consistent again and a
  whole-suite/typecheck run is meaningful; Task 5 is the final cleanup with
  the last full gate (suite + typecheck + lint).
- `RAW` (the 42 mock project rows) in `infra-board.data.ts` is **not**
  edited — its `Raw` tuple type and all 42 literal rows stay exactly as
  they are, including the now-semantically-vestigial legacy phase number
  (position 2) and flags object (position 5). Task 1 simply stops binding
  those two positions in destructuring (`[nr, naam, , role, health, , milestone, budget, startYear, startQ]`)
  rather than physically shrinking 42 array literals — same result, far
  lower transcription risk. This is a deliberate, documented deviation from
  the design spec's literal suggestion of editing `RAW`; the spec's actual
  requirement (no consumer reads these two fields anymore) is met either
  way.
- `phaseLabels: string[]` stays declared in `Portfolio`'s and
  `ProjectDetail`'s `Props` interfaces through Tasks 2-4 (callers keep
  passing it, nothing reads it) — only removed from the whole chain in
  Task 5. This avoids a multi-file coordinated prop-signature change
  mid-plan; each task lands independently.
- Run all `npx vitest`/`npx tsc`/`npm run lint` commands from
  `packages/frontend` specifically (`cd` there first), not the repo root.

---

### Task 1: `infra-board.data.ts` + `rip-model.ts` — new segment/status model

**Files:**

- Modify: `packages/frontend/src/pages/infra-board/infra-board.data.ts`
- Modify: `packages/frontend/src/pages/infra-board/infra-board.data.test.ts`
- Modify: `packages/frontend/src/pages/infra-board/rip-model.ts`

**Interfaces:**

- Consumes: `RIP_PHASES` (already imported in `infra-board.data.ts`).
- Produces: `StatusKey` gains `'wachtend'`; `STATUS` gains a `wachtend`
  entry. `RipGanttSegment` (replacing `GanttSegment`), `PortfolioProject`
  loses `phase`/`phaseStatuses`, `segments` becomes `RipGanttSegment[]`.
  `getMockPortfolio()`/`makePhase1Row()` produce the new shape. Tasks 2-4
  consume `PortfolioProject.segments`/`.ripPhaseCode`/`.ripPhaseState` and
  the new `STATUS.wachtend` entry.

**⚠️ After this task, `Portfolio.tsx`, `MijnDag.tsx`, and `ProjectDetail.tsx`
will fail to compile/run correctly — they still reference the fields this
task removes. This is expected; do NOT attempt to fix those files in this
task (that's Tasks 2-4). Do NOT run the full frontend suite or `tsc
--noEmit` as this task's gate — scope verification to exactly the two test
files listed below.**

- [ ] **Step 1: Write the failing tests**

  In `rip-model.ts`'s test file (`rip-model.test.ts`) — no change needed;
  `StatusKey`/`STATUS` have no dedicated tests today and adding a union
  member/record entry doesn't need one either (it's exercised indirectly
  via `infra-board.data.test.ts` below).

  In `infra-board.data.test.ts`:
  1.  Remove `PHASE_DUR` from the import list (line ~15) and remove the
      `import { PHASES } from './rip-model';` line entirely (line ~18) —
      replace it with nothing (this file no longer needs anything from
      `rip-model.ts` directly).

  2.  Replace the `makePhase1Row` describe block's first test:

      ```ts
      it('builds a live portfolio row anchored on the instance start quarter', () => {
        const row = makePhase1Row({
          id: 'abcdefgh-1234',
          startTime: '2024-04-15T00:00:00Z',
          projectNumber: '24099',
          projectName: 'Test project',
          leadRole: 'manager-pb',
        });

        const expectedStart = (2024 - TL.startYear) * 4 + (2 - 1); // April = Q2
        const totalLen = PHASE_DUR.reduce((a, b) => a + b, 0);

        expect(row.id).toBe('live-abcdefgh-1234');
        expect(row.nr).toBe('24099');
        expect(row.naam).toBe('Test project');
        expect(row.phase).toBe(1);
        expect(row.role).toBe('manager-pb');
        expect(row.health).toBe('groen');
        expect(row.start).toBe(expectedStart);
        expect(row.end).toBe(expectedStart + totalLen);
        expect(row.segments).toHaveLength(PHASES.length);
        expect(row.phaseStatuses[0]).toBe('active');
        expect(row.phaseStatuses.slice(1).every((s) => s === 'todo')).toBe(true);
      });
      ```

      with:

      ```ts
      it('builds a live portfolio row anchored on the instance start quarter', () => {
        const row = makePhase1Row({
          id: 'abcdefgh-1234',
          startTime: '2024-04-15T00:00:00Z',
          projectNumber: '24099',
          projectName: 'Test project',
          leadRole: 'manager-pb',
        });

        const expectedStart = (2024 - TL.startYear) * 4 + (2 - 1); // April = Q2

        expect(row.id).toBe('live-abcdefgh-1234');
        expect(row.nr).toBe('24099');
        expect(row.naam).toBe('Test project');
        expect(row.ripPhaseCode).toBe('R2.1');
        expect(row.ripPhaseState).toBe('wip');
        expect(row.role).toBe('manager-pb');
        expect(row.health).toBe('groen');
        expect(row.start).toBe(expectedStart);
        expect(row.segments).toHaveLength(RIP_PHASES.length);
        const last = row.segments[row.segments.length - 1];
        expect(row.end).toBe(last.from + last.len);
        expect(row.segments[0].status).toBe('active');
        expect(row.segments.slice(1).every((s) => s.status === 'todo')).toBe(true);
      });
      ```

  3.  Replace the `getMockPortfolio` describe block:

      ```ts
      describe('getMockPortfolio', () => {
        it('returns rows whose segments each span every lifecycle phase', () => {
          const projects = getMockPortfolio();

          expect(projects.length).toBeGreaterThan(0);
          for (const project of projects) {
            expect(project.segments).toHaveLength(PHASES.length);
            expect(project.phaseStatuses).toHaveLength(PHASES.length);
          }
        });

        it('marks phases before the current phase as done and after as todo', () => {
          const project = getMockPortfolio().find((p) => p.phase > 1 && p.phase < PHASES.length);
          expect(project).toBeDefined();

          project!.phaseStatuses.forEach((status, i) => {
            const phaseNumber = PHASES[i].n;
            if (phaseNumber < project!.phase) expect(status).toBe('done');
            if (phaseNumber > project!.phase) expect(status).toBe('todo');
          });
        });

        it('memoizes the generated portfolio across calls', () => {
          expect(getMockPortfolio()).toBe(getMockPortfolio());
        });
      });
      ```

      with:

      ```ts
      describe('getMockPortfolio', () => {
        it('returns rows whose segments each span every RIP phase', () => {
          const projects = getMockPortfolio();

          expect(projects.length).toBeGreaterThan(0);
          for (const project of projects) {
            expect(project.segments).toHaveLength(RIP_PHASES.length);
          }
        });

        it('marks phases before the current phase as done and after as todo', () => {
          const project = getMockPortfolio().find((p) => {
            const idx = RIP_PHASES.findIndex((rp) => rp.code === p.ripPhaseCode);
            return idx > 0 && idx < RIP_PHASES.length - 1;
          });
          expect(project).toBeDefined();

          const curIdx = RIP_PHASES.findIndex((rp) => rp.code === project!.ripPhaseCode);
          project!.segments.forEach((seg, i) => {
            if (i < curIdx) expect(seg.status).toBe('done');
            if (i > curIdx) expect(seg.status).toBe('todo');
          });
        });

        it('marks the current-phase segment status as wachtend exactly when ripPhaseState is wachtend', () => {
          const project = getMockPortfolio().find((p) => p.ripPhaseState === 'wachtend');
          expect(project).toBeDefined();

          const curIdx = RIP_PHASES.findIndex((rp) => rp.code === project!.ripPhaseCode);
          expect(project!.segments[curIdx].status).toBe('wachtend');
        });

        it('memoizes the generated portfolio across calls', () => {
          expect(getMockPortfolio()).toBe(getMockPortfolio());
        });
      });
      ```

  4.  In the `describe('getMockPortfolio — RIP ladder fields', ...)` block,
      remove this test entirely (the field it guards is being deleted, on
      purpose, by this exact task):

           ```ts
           it('keeps the old 6-phase `phase` field intact (Portfolio.tsx compat)', () => {
             const p = getMockPortfolio()[0];
             expect(typeof p.phase).toBe('number');
             expect(p.phase).toBeGreaterThanOrEqual(1);
             expect(p.phase).toBeLessThanOrEqual(6);
           });
           ```

           Leave the other two tests in that block (`'assigns every project a

      valid ripPhaseCode and ripPhaseState'`, `'is deterministic across
      calls...'`) exactly as they are — untouched by this task.

- [ ] **Step 2: Run the tests to verify they fail**

  Run (from `packages/frontend`):
  `npx vitest run src/pages/infra-board/infra-board.data.test.ts`

  Expected: FAIL — `PHASE_DUR`/`PHASES` are still imported by the
  (not-yet-rewritten) test file's remaining references, and the new
  `wachtend`/`segments`-shape assertions don't match current behavior yet.

- [ ] **Step 3: Write minimal implementation**

  In `rip-model.ts`, update `StatusKey` and `STATUS`:

  ```ts
  export type StatusKey = 'done' | 'active' | 'wachtend' | 'risk' | 'overdue' | 'action' | 'todo';

  export const STATUS: Record<
    StatusKey,
    { label: string; short: string; color: string; glyph: string }
  > = {
    done: { label: 'Afgerond', short: 'Afgerond', color: '#3fa535', glyph: '✓' },
    active: { label: 'Loopt', short: 'Loopt', color: '#0046ad', glyph: '●' },
    wachtend: { label: 'Wachtend', short: 'Wacht', color: '#7a5af0', glyph: '○' },
    risk: { label: 'Risico', short: 'Risico', color: '#e5b700', glyph: '▲' },
    overdue: { label: 'Te laat', short: 'Te laat', color: '#b0103c', glyph: '■' },
    action: { label: 'Actie nodig', short: 'Actie', color: '#e70077', glyph: '!' },
    todo: { label: 'Niet gestart', short: 'Gepland', color: '#c2c7d0', glyph: '' },
  };
  ```

  (Only the `StatusKey` union and `STATUS` record change — insert
  `'wachtend'`/the `wachtend:` entry in the position shown, keep every
  other line in this file exactly as it is. `PHASES`/`Phase` stay for now
  — they're removed in Task 5, once Tasks 2-4 have stopped needing them.)

  In `infra-board.data.ts`:
  1. Change the import line from `rip-model.ts`:

     ```ts
     import { ROLES, type StatusKey, type HealthKey } from './rip-model';
     ```

     (drop `PHASES` — nothing in this file needs it after this task).

  2. Replace `PHASE_DUR` and the `GanttSegment`/`PortfolioProject`
     interfaces:

     ```ts
     export const PHASE_DUR = [2, 3, 3, 2, 5, 2];

     export interface GanttSegment {
       phase: number;
       from: number;
       len: number;
       status: StatusKey;
     }
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
       instanceId?: string;
       ripPhaseCode: string;
       ripPhaseState: 'wip' | 'wachtend';
     }
     ```

     with:

     ```ts
     export interface RipGanttSegment {
       phaseCode: string;
       from: number; // quarter index into the TL window
       len: number; // quarters
       status: StatusKey;
     }
     export interface PortfolioProject {
       id: string;
       nr: string;
       naam: string;
       role: string;
       health: HealthKey;
       milestone: string;
       budget: string;
       startYear: number;
       start: number;
       end: number;
       segments: RipGanttSegment[];
       instanceId?: string;
       ripPhaseCode: string;
       ripPhaseState: 'wip' | 'wachtend';
     }
     ```

  3. Remove the `phaseStatuses()` function entirely:

     ```ts
     function phaseStatuses(
       current: number,
       flags: Partial<Record<number, StatusKey>>
     ): StatusKey[] {
       return PHASES.map((p) => {
         if (p.n < current) return 'done';
         if (p.n === current) return flags[p.n] ?? 'active';
         return 'todo';
       });
     }
     ```

     Replace it with these two module-private helpers (same location):

     ```ts
     /** Quarters per phase, derived from the catalogue's own `weeks` — never
      *  drifts out of sync with RIP_PHASES the way a parallel hardcoded
      *  array could. 13 weeks/quarter, minimum 1 quarter for visual sanity. */
     const RIP_PHASE_DUR: number[] = RIP_PHASES.map((p) => Math.max(1, Math.round(p.weeks / 13)));

     function buildRipSegments(fromIdx: number, statuses: StatusKey[]): RipGanttSegment[] {
       let cursor = fromIdx;
       return RIP_PHASES.map((p, i) => {
         const seg: RipGanttSegment = {
           phaseCode: p.code,
           from: cursor,
           len: RIP_PHASE_DUR[i],
           status: statuses[i],
         };
         cursor += RIP_PHASE_DUR[i];
         return seg;
       });
     }

     /**
      * Per-phase status across the whole ladder for one mock project.
      * Replaces the old flags-based override map (RAW's now-unused 6th
      * tuple field) — same "spread mock variety via a legacy indirection"
      * pattern the v2 catalogue patch already retired for ladder
      * positioning (LADDER_FROM_LEGACY). A deterministic hash instead:
      * illustrative variety at the current phase, not a business rule.
      */
     function ripPhaseStatuses(nr: string, curIdx: number, awaiting: boolean): StatusKey[] {
       return RIP_PHASES.map((_, i) => {
         if (i < curIdx) return 'done';
         if (i > curIdx) return 'todo';
         if (awaiting) return 'wachtend';
         const r = pbHash(`${nr}|status|${i}`) % 100;
         if (r < 8) return 'overdue';
         if (r < 18) return 'action';
         if (r < 30) return 'risk';
         return 'active';
       });
     }
     ```

     (`pbHash` already exists a little further down in this file — this
     new code sits above its current definition, so if a forward reference
     error occurs, move `pbHash`'s existing definition up to just before
     `RIP_PHASE_DUR`. Check the file first: if `pbHash` is a `function`
     declaration, no reordering is needed — function declarations hoist.)

  4. Replace `getMockPortfolio()`'s body:

     ```ts
     let _projects: PortfolioProject[] | null = null;
     export function getMockPortfolio(): PortfolioProject[] {
       if (_projects) return _projects;
       _projects = RAW.map(
         ([nr, naam, phase, role, health, flags, milestone, budget, startYear, startQ], i) => {
           const statuses = phaseStatuses(phase, flags);
           let cursor = qIdx(startYear, startQ);
           const start = cursor;
           const segments = PHASES.map((p, idx) => {
             const seg: GanttSegment = {
               phase: p.n,
               from: cursor,
               len: PHASE_DUR[idx],
               status: statuses[idx],
             };
             cursor += PHASE_DUR[idx];
             return seg;
           });
           const ladderPos = pbLadderFor(nr);
           const ripPhaseCode = RIP_PHASES[ladderPos - 1].code;
           const awaiting = ladderPos > 1 && ladderPos < RIP_PHASES.length && pbAwaits(nr);
           const ripPhaseState: 'wip' | 'wachtend' = awaiting ? 'wachtend' : 'wip';
           return {
             id: 'p' + i,
             nr,
             naam,
             phase,
             role,
             health,
             phaseStatuses: statuses,
             milestone,
             budget,
             startYear,
             start,
             end: cursor,
             segments,
             ripPhaseCode,
             ripPhaseState,
           };
         }
       );
       return _projects;
     }
     ```

     with:

     ```ts
     let _projects: PortfolioProject[] | null = null;
     export function getMockPortfolio(): PortfolioProject[] {
       if (_projects) return _projects;
       _projects = RAW.map(
         ([nr, naam, , role, health, , milestone, budget, startYear, startQ], i) => {
           const start = qIdx(startYear, startQ);
           const ladderPos = pbLadderFor(nr);
           const curIdx = ladderPos - 1;
           const ripPhaseCode = RIP_PHASES[curIdx].code;
           const awaiting = ladderPos > 1 && ladderPos < RIP_PHASES.length && pbAwaits(nr);
           const ripPhaseState: 'wip' | 'wachtend' = awaiting ? 'wachtend' : 'wip';
           const statuses = ripPhaseStatuses(nr, curIdx, awaiting);
           const segments = buildRipSegments(start, statuses);
           const last = segments[segments.length - 1];
           return {
             id: 'p' + i,
             nr,
             naam,
             role,
             health,
             milestone,
             budget,
             startYear,
             start,
             end: last.from + last.len,
             segments,
             ripPhaseCode,
             ripPhaseState,
           };
         }
       );
       return _projects;
     }
     ```

     (Note the `[nr, naam, , role, health, , milestone, budget, startYear, startQ]`
     destructuring — the 3rd and 6th tuple positions are skipped via empty
     commas, not bound to a name. `RAW`/`Raw` themselves are NOT edited —
     see Global Constraints.)

  5. Replace `makePhase1Row()`'s body:

     ```ts
     export function makePhase1Row(inst: {
       id: string;
       startTime: string;
       projectNumber: string;
       projectName: string;
       leadRole?: string;
     }): PortfolioProject {
       const d = new Date(inst.startTime);
       const q = Math.floor(d.getMonth() / 3) + 1;
       const fromIdx = qIdx(d.getFullYear(), q);
       const statuses: StatusKey[] = PHASES.map((p) => (p.n === 1 ? 'active' : 'todo'));
       let cursor = fromIdx;
       const segments: GanttSegment[] = PHASES.map((p, i) => {
         const seg: GanttSegment = {
           phase: p.n,
           from: cursor,
           len: PHASE_DUR[i],
           status: statuses[i],
         };
         cursor += PHASE_DUR[i];
         return seg;
       });
       return {
         id: 'live-' + inst.id,
         nr: inst.projectNumber || inst.id.slice(0, 8),
         naam: inst.projectName || 'RIP Fase 1 project',
         phase: 1,
         role: normalizeLeadRole(inst.leadRole),
         health: 'groen',
         phaseStatuses: statuses,
         milestone: 'Fase 1 lopend',
         budget: '—',
         startYear: d.getFullYear(),
         start: fromIdx,
         end: cursor,
         segments,
         instanceId: inst.id,
         ripPhaseCode: RIP_PHASES[0].code,
         ripPhaseState: 'wip',
       };
     }
     ```

     with:

     ```ts
     export function makePhase1Row(inst: {
       id: string;
       startTime: string;
       projectNumber: string;
       projectName: string;
       leadRole?: string;
     }): PortfolioProject {
       const d = new Date(inst.startTime);
       const q = Math.floor(d.getMonth() / 3) + 1;
       const fromIdx = qIdx(d.getFullYear(), q);
       const statuses: StatusKey[] = RIP_PHASES.map((p) => (p.code === 'R2.1' ? 'active' : 'todo'));
       const segments = buildRipSegments(fromIdx, statuses);
       const last = segments[segments.length - 1];
       return {
         id: 'live-' + inst.id,
         nr: inst.projectNumber || inst.id.slice(0, 8),
         naam: inst.projectName || 'RIP Fase 1 project',
         role: normalizeLeadRole(inst.leadRole),
         health: 'groen',
         milestone: 'Fase 1 lopend',
         budget: '—',
         startYear: d.getFullYear(),
         start: fromIdx,
         end: last.from + last.len,
         segments,
         instanceId: inst.id,
         ripPhaseCode: RIP_PHASES[0].code,
         ripPhaseState: 'wip',
       };
     }
     ```

- [ ] **Step 4: Run the tests to verify they pass**

  Run (from `packages/frontend`):
  `npx vitest run src/pages/infra-board/infra-board.data.test.ts`

  Expected: PASS, every test in the file.

- [ ] **Step 5: Commit**

  ```bash
  git add packages/frontend/src/pages/infra-board/infra-board.data.ts packages/frontend/src/pages/infra-board/infra-board.data.test.ts packages/frontend/src/pages/infra-board/rip-model.ts
  git commit -m "feat(frontend): rebuild the mock Gantt/status model on the twelve-phase RIP ladder"
  ```

  **Do not run `npx vitest run` (no path) or `npx tsc --noEmit` here** —
  `Portfolio.tsx`/`MijnDag.tsx`/`ProjectDetail.tsx` are expected to be
  broken until Tasks 2-4.

---

### Task 2: `Portfolio.tsx` — Gantt + Kanban on the real ladder

**Files:**

- Modify: `packages/frontend/src/components/InfraBoardDashboard/Portfolio.tsx`
- Modify: `packages/frontend/src/components/InfraBoardDashboard/Portfolio.test.tsx`
- Modify: `packages/frontend/src/pages/infra-board/dashboard-infra.css`

**Interfaces:**

- Consumes: `RIP_PHASES`, `RIP_STAGES`, `ripPhaseByCode` (from
  `rip-phases.catalog.ts`, already used elsewhere); `PortfolioProject`,
  `RipGanttSegment` (Task 1); `STATUS` (Task 1's `wachtend` addition).
- Produces: no new exports — `Portfolio`'s own `Props` type is unchanged
  (`phaseLabels` stays declared, just no longer destructured/read — see
  Global Constraints).

- [ ] **Step 1: Write the failing tests**

  In `Portfolio.test.tsx`:
  1. Remove `import { PHASES } from '../../pages/infra-board/rip-model';`
     and the `const phaseLabels = PHASES.map((p) => p.name);` line. Add:

     ```ts
     import { RIP_PHASES, RIP_STAGES } from '../../pages/infra-board/rip-phases.catalog';
     ```

  2. In every existing `render(<Portfolio phaseLabels={phaseLabels} ... />)`
     call (five of them), change `phaseLabels={phaseLabels}` to
     `phaseLabels={[]}`. No other change to the five existing tests — none
     of them assert on phase labels/codes.

  3. Append these four new tests to the `describe('Portfolio', ...)` block:

     ```ts
     it('a Gantt bar for a project\'s current phase carries the real RIP code as its label', () => {
       const { container } = render(<Portfolio phaseLabels={[]} onOpenProject={vi.fn()} />);
       const first = getMockPortfolio()[0];
       const currentBar = container.querySelector('.pb-gantt-bar.current');
       expect(currentBar).not.toBeNull();
       expect(currentBar!.textContent).toContain(first.ripPhaseCode);
     });

     it('Kanban renders twelve columns grouped under five stage headers', async () => {
       const user = userEvent.setup();
       const { container } = render(<Portfolio phaseLabels={[]} onOpenProject={vi.fn()} />);

       await user.click(screen.getByRole('button', { name: 'Per fase' }));

       const columns = container.querySelectorAll('.pb-kan-col');
       expect(columns.length).toBe(RIP_PHASES.length);
       RIP_STAGES.forEach((s) => {
         expect(screen.getByText(`${s.code} · ${s.name}`)).toBeInTheDocument();
       });
     });

     it('shows Kanban cards with status wachtend as "Wacht op start van {code}" instead of their milestone', async () => {
       const user = userEvent.setup();
       render(<Portfolio phaseLabels={[]} onOpenProject={vi.fn()} />);

       await user.click(screen.getByRole('button', { name: 'Per fase' }));

       const wachtendProject = getMockPortfolio().find((p) => p.ripPhaseState === 'wachtend');
       expect(wachtendProject).toBeDefined();
       expect(
         screen.getAllByText(`Wacht op start van ${wachtendProject!.ripPhaseCode}`, { exact: false })
           .length
       ).toBeGreaterThan(0);
     });

     it('shows a wachtend swatch in the legend', () => {
       render(<Portfolio phaseLabels={[]} onOpenProject={vi.fn()} />);
       expect(screen.getByText('Wachtend')).toBeInTheDocument();
     });
     ```

- [ ] **Step 2: Run the tests to verify they fail**

  Run (from `packages/frontend`):
  `npx vitest run src/components/InfraBoardDashboard/Portfolio.test.tsx`

  Expected: FAIL — `Portfolio.tsx` still references the fields Task 1
  removed (compile/runtime errors), and the new assertions don't match
  anything yet.

- [ ] **Step 3: Write minimal implementation**

  Replace the entire contents of `Portfolio.tsx` with:

  ```tsx
  import { useState } from 'react';
  import {
    getMockPortfolio,
    makePhase1Row,
    MIJN_PROJECT_NRS,
    TL,
    type PortfolioProject,
  } from '../../pages/infra-board/infra-board.data';
  import { STATUS, roleByKey, type StatusKey } from '../../pages/infra-board/rip-model';
  import {
    RIP_PHASES,
    RIP_STAGES,
    ripPhaseByCode,
  } from '../../pages/infra-board/rip-phases.catalog';
  import { useActivePhase1 } from '../../services/infra.api';
  import type { ProjectRef } from '../../pages/InfraBoardDashboard';

  interface Props {
    phaseLabels: string[];
    onOpenProject: (ref: ProjectRef) => void;
  }

  function curPhaseIdx(p: PortfolioProject): number {
    return RIP_PHASES.findIndex((rp) => rp.code === p.ripPhaseCode);
  }

  function Gantt({
    rows,
    onOpenProject,
  }: {
    rows: PortfolioProject[];
    onOpenProject: (ref: ProjectRef) => void;
  }) {
    const QW = 26;
    const trackW = TL.quarters * QW;
    const years = Array.from({ length: TL.quarters / 4 }, (_, y) => TL.startYear + y);
    return (
      <div className="pb-gantt-wrap">
        <div
          className="pb-gantt"
          style={{ ['--track-w' as string]: trackW + 'px', ['--qw' as string]: QW + 'px' }}
        >
          <div className="pb-gantt-head">
            <div className="pb-gantt-namecol">Project</div>
            <div className="pb-gantt-track pb-gantt-years">
              {years.map((y) => (
                <div className="yr" key={y} style={{ width: 4 * QW }}>
                  {y}
                  <div className="qs">
                    {['Q1', 'Q2', 'Q3', 'Q4'].map((q) => (
                      <span key={q}>{q}</span>
                    ))}
                  </div>
                </div>
              ))}
              <div className="pb-gantt-today" style={{ left: (TL.todayIdx + 0.5) * QW }}>
                <span>vandaag</span>
              </div>
            </div>
          </div>
          <div className="pb-gantt-body">
            {rows.map((p) => (
              <div
                className="pb-gantt-row"
                key={p.id}
                onClick={() => onOpenProject({ nr: p.nr, instanceId: p.instanceId })}
              >
                <div className="pb-gantt-namecol">
                  <span className={`pb-health ${p.health}`} />
                  <span className="nm">{p.naam}</span>
                  <span className="meta">
                    {p.nr} · {roleByKey(p.role).short}
                    {p.instanceId && <span className="pb-live-badge">live</span>}
                  </span>
                </div>
                <div className="pb-gantt-track">
                  <div className="pb-gantt-grid">
                    {Array.from({ length: TL.quarters }).map((_, i) => (
                      <span
                        key={i}
                        className={(i + 1) % 4 === 0 ? 'q yr-end' : 'q'}
                        style={{ width: QW }}
                      />
                    ))}
                  </div>
                  <div className="pb-gantt-todayline" style={{ left: (TL.todayIdx + 0.5) * QW }} />
                  {p.segments.map((seg) => {
                    const s = STATUS[seg.status];
                    const phase = ripPhaseByCode(seg.phaseCode)!;
                    return (
                      <div
                        key={seg.phaseCode}
                        className={`pb-gantt-bar ${seg.status} ${seg.phaseCode === p.ripPhaseCode ? 'current' : ''}`}
                        style={{
                          left: seg.from * QW + 1,
                          width: seg.len * QW - 2,
                          background: s.color,
                        }}
                        title={`${phase.code} · ${phase.name} — ${s.label}`}
                      >
                        <span className="ph">{phase.code}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  function Kanban({
    rows,
    onOpenProject,
  }: {
    rows: PortfolioProject[];
    onOpenProject: (ref: ProjectRef) => void;
  }) {
    return (
      <div className="pb-kanban">
        {RIP_PHASES.map((ph, i) => {
          const cards = rows.filter((p) => p.ripPhaseCode === ph.code);
          const stage = RIP_STAGES.find((s) => s.code === ph.stage)!;
          const firstOfStage = i === 0 || RIP_PHASES[i - 1].stage !== ph.stage;
          return (
            <div className={`pb-kan-col ${firstOfStage ? 'stage-start' : ''}`} key={ph.code}>
              <div
                className="pb-kan-stage"
                style={{ color: stage.color }}
                aria-hidden={!firstOfStage}
              >
                {firstOfStage ? (
                  <>
                    <span className="pb-stage-dot" style={{ background: stage.color }} />
                    {stage.code} · {stage.name}
                  </>
                ) : (
                  <>&nbsp;</>
                )}
              </div>
              <div className="pb-kan-head">
                <span className="t">
                  <span className="kc" style={{ background: stage.color }}>
                    {ph.code}
                  </span>
                  {ph.name}
                </span>
                <span className="c">{cards.length}</span>
              </div>
              <div className="pb-kan-cards">
                {cards.map((p) => {
                  const st = p.segments[i].status;
                  return (
                    <button
                      type="button"
                      className="pb-kan-card"
                      key={p.id}
                      onClick={() => onOpenProject({ nr: p.nr, instanceId: p.instanceId })}
                    >
                      <div className="top">
                        <span className="pb-proj-nr">{p.nr}</span>
                        {p.instanceId && <span className="pb-live-badge">live</span>}
                        <span className={`pb-health ${p.health}`} />
                      </div>
                      <div className="nm">{p.naam}</div>
                      <div className="bot">
                        <span className="pb-rol">{roleByKey(p.role).short}</span>
                        <span
                          className="pb-statuspill"
                          style={{ color: STATUS[st].color, borderColor: STATUS[st].color }}
                        >
                          {STATUS[st].short}
                        </span>
                      </div>
                      <div className="ms">
                        {st === 'wachtend' ? `Wacht op start van ${ph.code}` : p.milestone}
                      </div>
                    </button>
                  );
                })}
                {cards.length === 0 && <div className="pb-kan-empty">—</div>}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  export default function Portfolio({ onOpenProject }: Props) {
    const [view, setView] = useState<'tijdlijn' | 'kanban'>('tijdlijn');
    const [scope, setScope] = useState<'alle' | 'mijn' | 'risico'>('alle');
    const [role, setRole] = useState('alle');

    const { data: liveInstances } = useActivePhase1();

    // Convert live instances to portfolio rows and prepend them.
    // Remove any mock row whose project number matches a live instance (avoid duplicates).
    const liveRows: PortfolioProject[] = (liveInstances ?? []).map(makePhase1Row);
    const liveNrs = new Set(liveRows.map((r) => r.nr));
    const all = [...liveRows, ...getMockPortfolio().filter((p) => !liveNrs.has(p.nr))];
    const mijn = new Set(MIJN_PROJECT_NRS);
    let rows = all;
    if (scope === 'mijn') rows = rows.filter((p) => mijn.has(p.nr));
    if (scope === 'risico')
      rows = rows.filter(
        (p) =>
          p.health === 'rood' ||
          (['risk', 'overdue', 'action'] as StatusKey[]).includes(p.segments[curPhaseIdx(p)].status)
      );
    if (role !== 'alle') rows = rows.filter((p) => p.role === role);

    // Role filter options are derived from the projects actually present, so live
    // rows carrying any declared leadRole surface here (not just the two mock roles).
    const roleOptions = Array.from(new Set(all.map((p) => p.role))).sort((a, b) =>
      roleByKey(a).label.localeCompare(roleByKey(b).label)
    );

    const counts = {
      total: all.length,
      mijn: MIJN_PROJECT_NRS.length,
      risico: all.filter(
        (p) =>
          p.health === 'rood' ||
          (['risk', 'overdue', 'action'] as StatusKey[]).includes(p.segments[curPhaseIdx(p)].status)
      ).length,
    };

    return (
      <div className="pb-view">
        <p className="pb-eyebrow">Portfolio · Provincie Flevoland</p>
        <h1 className="pb-h1">Projectenportfolio</h1>
        <p className="pb-lead">
          {counts.total} projecten over de RIP-fasen (venster 2022–2027)
          {liveInstances ? ` · ${liveInstances.length} actieve RIP Fase 1 instanties` : ''}. Bekijk
          als tijdlijn of per fase. Klik een project om in te zoomen.
        </p>

        <div className="pb-port-toolbar">
          <div className="pb-segment">
            <button
              className={view === 'tijdlijn' ? 'active' : ''}
              onClick={() => setView('tijdlijn')}
            >
              Tijdlijn
            </button>
            <button className={view === 'kanban' ? 'active' : ''} onClick={() => setView('kanban')}>
              Per fase
            </button>
          </div>
          <div className="pb-segment">
            <button className={scope === 'alle' ? 'active' : ''} onClick={() => setScope('alle')}>
              Alle · {counts.total}
            </button>
            <button className={scope === 'mijn' ? 'active' : ''} onClick={() => setScope('mijn')}>
              Mijn · {counts.mijn}
            </button>
            <button
              className={scope === 'risico' ? 'active' : ''}
              onClick={() => setScope('risico')}
            >
              Risico · {counts.risico}
            </button>
          </div>
          <label className="pb-rolefilter">
            Rol
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="alle">Alle rollen</option>
              {roleOptions.map((k) => (
                <option key={k} value={k}>
                  {roleByKey(k).label}
                </option>
              ))}
            </select>
          </label>
          <div className="pb-legend">
            {(['done', 'active', 'wachtend', 'risk', 'overdue', 'action'] as StatusKey[]).map(
              (k) => (
                <span className="lg" key={k}>
                  <span className="sw" style={{ background: STATUS[k].color }} />
                  {STATUS[k].label}
                </span>
              )
            )}
          </div>
        </div>

        {view === 'tijdlijn' ? (
          <Gantt rows={rows} onOpenProject={onOpenProject} />
        ) : (
          <Kanban rows={rows} onOpenProject={onOpenProject} />
        )}
      </div>
    );
  }
  ```

- [ ] **Step 4: Run the tests to verify they pass**

  Run (from `packages/frontend`):
  `npx vitest run src/components/InfraBoardDashboard/Portfolio.test.tsx`

  Expected: PASS, every test in the file (nine total: five existing, four
  new).

- [ ] **Step 5: Add CSS**

  Append to `dashboard-infra.css` (`.pb-kanban`/`.pb-kan-col`/`.pb-kan-head`/
  `.pb-kan-cards`/`.pb-kan-card`/`.pb-gantt-bar` already exist and are
  reused unchanged — only the stage-header row and phase-code badge are
  new, ported directly from the v2 reference's `project-board.css`):

  ```css
  .pbd .pb-stage-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    display: inline-block;
    margin-right: 7px;
    vertical-align: 1px;
  }
  .pbd .pb-kan-col.stage-start {
    margin-left: 14px;
  }
  .pbd .pb-kan-stage {
    font-family: var(--v2-mono);
    font-size: 9.5px;
    font-weight: 700;
    letter-spacing: 0.11em;
    text-transform: uppercase;
    margin-bottom: 7px;
    white-space: nowrap;
    min-height: 14px;
    line-height: 14px;
  }
  .pbd .pb-kan-head .t .kc {
    display: inline-block;
    font-family: var(--v2-mono);
    font-size: 9.5px;
    font-weight: 700;
    color: #fff;
    padding: 1px 5px;
    margin-right: 7px;
    letter-spacing: 0.03em;
  }
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add packages/frontend/src/components/InfraBoardDashboard/Portfolio.tsx packages/frontend/src/components/InfraBoardDashboard/Portfolio.test.tsx packages/frontend/src/pages/infra-board/dashboard-infra.css
  git commit -m "feat(frontend): move Portfolio Gantt/Kanban onto the real twelve-phase RIP ladder"
  ```

  **Do not run the full suite or typecheck here** — `MijnDag.tsx`/
  `ProjectDetail.tsx` are still expected to be broken until Tasks 3-4.

---

### Task 3: `MijnDag.tsx` — "Mijn projecten" card

**Files:**

- Modify: `packages/frontend/src/components/InfraBoardDashboard/MijnDag.tsx`
- Modify: `packages/frontend/src/components/InfraBoardDashboard/MijnDag.test.tsx`

**Interfaces:**

- Consumes: `ripPhaseByCode` (from `rip-phases.catalog.ts`).
- Produces: nothing new — isolated internal change.

- [ ] **Step 1: Write the failing test**

  In `MijnDag.test.tsx`, add this import:

  ```ts
  import { ripPhaseByCode } from '../../pages/infra-board/rip-phases.catalog';
  ```

  Append this test to `describe('MijnDag', ...)`:

  ```ts
  it('shows the real RIP phase code and name for each "Mijn projecten" card', () => {
    render(<MijnDag user={null} onOpenProject={vi.fn()} onGotoPortfolio={vi.fn()} />);

    const firstNr = MIJN_PROJECT_NRS[0];
    const project = getMockPortfolio().find((p) => p.nr === firstNr)!;
    const phase = ripPhaseByCode(project.ripPhaseCode)!;

    expect(screen.getByText(`${phase.code} · ${phase.name}`)).toBeInTheDocument();
  });
  ```

- [ ] **Step 2: Run the test to verify it fails**

  Run (from `packages/frontend`):
  `npx vitest run src/components/InfraBoardDashboard/MijnDag.test.tsx -t "real RIP phase code"`

  Expected: FAIL — `MijnDag.tsx` still shows `F{n} · {name}` from the
  (Task-1-removed) old model.

- [ ] **Step 3: Write minimal implementation**

  In `MijnDag.tsx`:
  1. Change the `rip-model` import (drop `PHASES`):

     ```ts
     import {
       PHASES,
       STATUS,
       HEALTH,
       roleByKey,
       type StatusKey,
     } from '../../pages/infra-board/rip-model';
     ```

     becomes:

     ```ts
     import { STATUS, HEALTH, roleByKey, type StatusKey } from '../../pages/infra-board/rip-model';
     import { ripPhaseByCode } from '../../pages/infra-board/rip-phases.catalog';
     ```

  2. Replace:

     ```tsx
     {
       mijn.map((p) => {
         const ph = PHASES.find((x) => x.n === p.phase)!;
         return (
           <button
             type="button"
             key={p.id}
             className="pb-mp-item"
             onClick={() => onOpenProject({ nr: p.nr })}
           >
             <div>
               <div className="pb-mp-name">{p.naam}</div>
               <div className="pb-mp-meta">
                 <span className={`pb-health ${p.health}`} />
                 <span>{p.nr}</span>
                 <span>· {roleByKey(p.role).short}</span>
                 <span>· {HEALTH[p.health].label}</span>
               </div>
             </div>
             <span className="pb-mp-phase">
               F{ph.n} · {ph.name}
             </span>
           </button>
         );
       });
     }
     ```

     with:

     ```tsx
     {
       mijn.map((p) => {
         const ph = ripPhaseByCode(p.ripPhaseCode)!;
         return (
           <button
             type="button"
             key={p.id}
             className="pb-mp-item"
             onClick={() => onOpenProject({ nr: p.nr })}
           >
             <div>
               <div className="pb-mp-name">{p.naam}</div>
               <div className="pb-mp-meta">
                 <span className={`pb-health ${p.health}`} />
                 <span>{p.nr}</span>
                 <span>· {roleByKey(p.role).short}</span>
                 <span>· {HEALTH[p.health].label}</span>
               </div>
             </div>
             <span className="pb-mp-phase">
               {ph.code} · {ph.name}
             </span>
           </button>
         );
       });
     }
     ```

- [ ] **Step 4: Run the tests to verify they pass**

  Run (from `packages/frontend`):
  `npx vitest run src/components/InfraBoardDashboard/MijnDag.test.tsx`

  Expected: PASS, every test in the file.

- [ ] **Step 5: Commit**

  ```bash
  git add packages/frontend/src/components/InfraBoardDashboard/MijnDag.tsx packages/frontend/src/components/InfraBoardDashboard/MijnDag.test.tsx
  git commit -m "feat(frontend): show the real RIP phase on Mijn dag's project cards"
  ```

  **Do not run the full suite or typecheck here** — `ProjectDetail.tsx` is
  still expected to be broken until Task 4.

---

### Task 4: `ProjectDetail.tsx` — stepper on the real ladder

**Files:**

- Modify: `packages/frontend/src/components/InfraBoardDashboard/ProjectDetail.tsx`
- Modify: `packages/frontend/src/components/InfraBoardDashboard/ProjectDetail.test.tsx`

**Interfaces:**

- Consumes: `RIP_PHASES`, `ripPhaseByCode` (from `rip-phases.catalog.ts`).
- Produces: nothing new — `Props.phaseLabels` stays declared, unused
  (removed in Task 5).

- [ ] **Step 1: Write the failing tests**

  In `ProjectDetail.test.tsx`:
  1.  Remove `import { PHASES } from '../../pages/infra-board/rip-model';`
      and the `const phaseLabels = PHASES.map((p) => p.name);` line. Add:

      ```ts
      import { RIP_PHASES } from '../../pages/infra-board/rip-phases.catalog';
      ```

  2.  In every existing `phaseLabels={phaseLabels}` prop (four occurrences),
      change to `phaseLabels={[]}`.

  3.  Replace the test `'selecting a phase other than 1 shows the "not
modelled" message'`:

                                   ```tsx
                                   it('selecting a phase other than 1 shows the "not modelled" message', async () => {
                                     const user = userEvent.setup();
                                     render(
                                       <ProjectDetail
                                         projectRef={{ nr: getMockPortfolio()[0].nr }}
                                         phaseLabels={phaseLabels}
                                         onBack={vi.fn()}
                                       />
                                     );

                                     await user.click(
                                       screen.getByRole('button', { name: (name) => name.includes(phaseLabels[1]) })
                                     );

                                     expect(screen.getByText(/nog niet gemodelleerd/)).toBeInTheDocument();
                                   });
                                   ```

                                   with:

                                   ```tsx
                                   it('selecting a phase other than R2.1 shows the "not modelled" message', async () => {
                                     const user = userEvent.setup();
                                     render(
                                       <ProjectDetail
                                         projectRef={{ nr: getMockPortfolio()[0].nr }}
                                         phaseLabels={[]}
                                         onBack={vi.fn()}
                                       />
                                     );

                                     await user.click(
                                       screen.getByRole('button', { name: (name) => name.includes(RIP_PHASES[1].name) })
                                     );

                                     expect(screen.getByText(/nog niet gemodelleerd/)).toBeInTheDocument();
                                   });

                                   it('renders twelve stepper steps with real RIP codes', () => {
                                     render(
                                       <ProjectDetail
                                         projectRef={{ nr: getMockPortfolio()[0].nr }}
                                         phaseLabels={[]}
                                         onBack={vi.fn()}
                                       />
                                     );
                                     RIP_PHASES.forEach((p) => {
                                       expect(screen.getByText(p.code, { exact: false })).toBeInTheDocument();
                                     });
                                   });

                                   it('selecting R2.1 shows the swimlane', async () => {
                                     const user = userEvent.setup();
                                     render(
                                       <ProjectDetail
                                         projectRef={{ nr: getMockPortfolio()[0].nr }}
                                         phaseLabels={[]}
                                         onBack={vi.fn()}
                                       />
                                     );

                                     await user.click(
                                       screen.getByRole('button', { name: (name) => name.includes(RIP_PHASES[0].name) })
                                     );

                                     expect(screen.queryByText(/nog niet gemodelleerd/)).not.toBeInTheDocument();
                                   });
                                   ```

- [ ] **Step 2: Run the tests to verify they fail**

  Run (from `packages/frontend`):
  `npx vitest run src/components/InfraBoardDashboard/ProjectDetail.test.tsx`

  Expected: FAIL — `ProjectDetail.tsx` still references the fields Task 1
  removed.

- [ ] **Step 3: Write minimal implementation**

  In `ProjectDetail.tsx`:
  1. **Change the function signature to stop destructuring `phaseLabels`**
     (this repo's `tsconfig.json` has `noUnusedParameters`/`noUnusedLocals`
     both `true` — if `phaseLabels` stays bound but every use of it is
     removed below, Step 5's `tsc --noEmit` fails on an unused-variable
     error):

     ```tsx
     export default function ProjectDetail({ projectRef, phaseLabels, onBack }: Props) {
     ```

     becomes:

     ```tsx
     export default function ProjectDetail({ projectRef, onBack }: Props) {
     ```

     (`Props` itself keeps declaring `phaseLabels: string[]` for now — only
     the destructuring changes. Callers still pass it; nothing reads it
     until Task 5 removes the prop from the whole chain.)

  2. Change the `rip-model` import (drop `PHASES`), add the catalogue
     import:

     ```ts
     import {
       PHASES,
       FASE1_NODES,
       FASE1_DOCS,
       HEALTH,
       nodeStatusFromHistory,
       type StatusKey,
     } from '../../pages/infra-board/rip-model';
     ```

     becomes:

     ```ts
     import {
       FASE1_NODES,
       FASE1_DOCS,
       HEALTH,
       nodeStatusFromHistory,
       type StatusKey,
     } from '../../pages/infra-board/rip-model';
     import { RIP_PHASES, ripPhaseByCode } from '../../pages/infra-board/rip-phases.catalog';
     ```

  3. Replace `deriveMockStatus`:

     ```tsx
     function deriveMockStatus(project: PortfolioProject | undefined): Record<string, StatusKey> {
       const out: Record<string, StatusKey> = {};
       const flag = project?.phaseStatuses[0];
       const reached = !project
         ? 0
         : project.phase > 1
           ? 99
           : flag === 'active'
             ? 5
             : flag === 'action'
               ? 10
               : 14;
       for (const n of FASE1_NODES) {
         if (n.col < reached) out[n.id] = 'done';
         else if (n.col === reached)
           out[n.id] =
             project &&
             project.phase === 1 &&
             flag &&
             (['risk', 'overdue', 'action'] as StatusKey[]).includes(flag)
               ? flag
               : 'active';
         else out[n.id] = project && project.phase > 1 ? 'done' : 'todo';
       }
       return out;
     }
     ```

     with:

     ```tsx
     function deriveMockStatus(project: PortfolioProject | undefined): Record<string, StatusKey> {
       const out: Record<string, StatusKey> = {};
       const curIdx = project ? RIP_PHASES.findIndex((p) => p.code === project.ripPhaseCode) : -1;
       const isOnR21 = curIdx === 0;
       // A mock project can never be 'wachtend' AT R2.1 (the ladder's first
       // rung — there's no predecessor to await), so when isOnR21 is true
       // this is always the illustrative wip-status the mock model gives it.
       const flag = isOnR21 ? project!.segments[0].status : undefined;
       const reached = !project
         ? 0
         : !isOnR21
           ? 99
           : flag === 'active'
             ? 5
             : flag === 'action'
               ? 10
               : 14;
       for (const n of FASE1_NODES) {
         if (n.col < reached) out[n.id] = 'done';
         else if (n.col === reached)
           out[n.id] =
             isOnR21 && flag && (['risk', 'overdue', 'action'] as StatusKey[]).includes(flag)
               ? flag
               : 'active';
         else out[n.id] = !isOnR21 && project ? 'done' : 'todo';
       }
       return out;
     }
     ```

  4. Replace `currentPhase`/`selPhase` setup:

     ```tsx
     // live instances are always in Fase 1 (R2.1); mock rows carry their own phase.
     const currentPhase = isLive ? 1 : (mock?.phase ?? 1);
     const [selPhase, setSelPhase] = useState(currentPhase);
     useEffect(() => {
       setSelPhase(currentPhase);
     }, [projectRef.nr, projectRef.instanceId, currentPhase]);
     ```

     with:

     ```tsx
     // live instances are always in Fase 1 (R2.1); mock rows carry their own phase.
     const currentPhaseCode = isLive ? 'R2.1' : (mock?.ripPhaseCode ?? 'R2.1');
     const [selPhase, setSelPhase] = useState(currentPhaseCode);
     useEffect(() => {
       setSelPhase(currentPhaseCode);
     }, [projectRef.nr, projectRef.instanceId, currentPhaseCode]);
     ```

  5. Replace `stepClass`/`phaseInfo`/`curInfo`:

     ```tsx
     const stepClass = (n: number) => {
       if (n < currentPhase) return 'done';
       if (n === currentPhase) {
         const f = mock?.phaseStatuses[n - 1];
         return f && (['risk', 'overdue', 'action'] as StatusKey[]).includes(f)
           ? `active ${f}`
           : 'active';
       }
       return 'todo';
     };

     const docOk = (produceNode: string) => statusById[produceNode] === 'done';
     const phaseInfo = PHASES.find((p) => p.n === selPhase)!;
     const curInfo = PHASES.find((p) => p.n === currentPhase)!;
     ```

     with:

     ```tsx
     const stepClass = (code: string) => {
       const idx = RIP_PHASES.findIndex((p) => p.code === code);
       const curIdx = RIP_PHASES.findIndex((p) => p.code === currentPhaseCode);
       if (idx < curIdx) return 'done';
       if (idx === curIdx) {
         const f = mock?.segments[idx]?.status;
         return f && (['risk', 'overdue', 'action'] as StatusKey[]).includes(f)
           ? `active ${f}`
           : 'active';
       }
       return 'todo';
     };

     const docOk = (produceNode: string) => statusById[produceNode] === 'done';
     const phaseInfo = ripPhaseByCode(selPhase)!;
     const curInfo = ripPhaseByCode(currentPhaseCode)!;
     ```

  6. In the meta strip, replace:

     ```tsx
     <dd>
       F{currentPhase} · {curInfo.name}
       <span className="rcode">{curInfo.code}</span>
     </dd>
     ```

     with:

     ```tsx
     <dd>
       {curInfo.name}
       <span className="rcode">{curInfo.code}</span>
     </dd>
     ```

  7. Replace the stepper:

     ```tsx
     <div className="pb-stepper">
       {PHASES.map((p) => {
         const base = stepClass(p.n);
         return (
           <button
             type="button"
             key={p.n}
             className={`pb-step ${base} ${p.n === selPhase ? 'selected' : ''}`}
             onClick={() => setSelPhase(p.n)}
           >
             <span className="pb-step-dot">{base.includes('done') ? '✓' : p.n}</span>
             <span className="pb-step-name">
               {phaseLabels[p.n - 1]}
               <span className="pb-step-code">{p.code}</span>
             </span>
           </button>
         );
       })}
     </div>
     ```

     with:

     ```tsx
     <div className="pb-stepper">
       {RIP_PHASES.map((p, i) => {
         const base = stepClass(p.code);
         return (
           <button
             type="button"
             key={p.code}
             className={`pb-step ${base} ${p.code === selPhase ? 'selected' : ''}`}
             onClick={() => setSelPhase(p.code)}
           >
             <span className="pb-step-dot">{base.includes('done') ? '✓' : i + 1}</span>
             <span className="pb-step-name">
               {p.name}
               <span className="pb-step-code">{p.code}</span>
             </span>
           </button>
         );
       })}
     </div>
     ```

  8. Replace the phase-content gate:

     ```tsx
     {
       selPhase === 1 ? (
         <>
           <div className="pb-phase-titlebar">
             <h3>
               Fase 1 · {phaseInfo.name} <span className="rcode">{phaseInfo.code}</span>
             </h3>
             <span className="meta">
               Processtappen &amp; rollen — RIP Fase 1 procesmodel{isLive ? ' (live)' : ''}
             </span>
           </div>
           <Fase1Swimlane statusById={statusById} claimedNodeIds={activeNodeIds} />
           <div className="pb-deliverables">
             <div className="pb-deliverables-head">Projectplan — onderdelen</div>
             <div className="pb-docrow">
               {FASE1_DOCS.map((d) => {
                 const ok = docOk(d.produceNode);
                 return (
                   <div className={`pb-doc4 ${ok ? 'ok' : 'na'}`} key={d.key}>
                     <span className="num">{d.nr}</span>
                     <span className="info">
                       <span className="nm">{d.label}</span>
                       <span className="st">{ok ? 'Beschikbaar' : 'Nog niet'}</span>
                     </span>
                   </div>
                 );
               })}
             </div>
           </div>
         </>
       ) : (
         <div className="pb-phase-empty">
           <h3>
             Fase {selPhase} · {phaseInfo.name} <span className="rcode">{phaseInfo.code}</span>
           </h3>
           <p>
             Het processtappen-model voor deze fase is nog niet gemodelleerd. Alleen{' '}
             <b>Fase 1 ({PHASES[0].code})</b> is volledig uitgewerkt — selecteer Fase 1 hierboven
             voor de swimlane met rollen, taken en deliverables.
           </p>
         </div>
       );
     }
     ```

     with:

     ```tsx
     {
       selPhase === 'R2.1' ? (
         <>
           <div className="pb-phase-titlebar">
             <h3>
               {phaseInfo.name} <span className="rcode">{phaseInfo.code}</span>
             </h3>
             <span className="meta">
               Processtappen &amp; rollen — RIP Fase 1 procesmodel{isLive ? ' (live)' : ''}
             </span>
           </div>
           <Fase1Swimlane statusById={statusById} claimedNodeIds={activeNodeIds} />
           <div className="pb-deliverables">
             <div className="pb-deliverables-head">Projectplan — onderdelen</div>
             <div className="pb-docrow">
               {FASE1_DOCS.map((d) => {
                 const ok = docOk(d.produceNode);
                 return (
                   <div className={`pb-doc4 ${ok ? 'ok' : 'na'}`} key={d.key}>
                     <span className="num">{d.nr}</span>
                     <span className="info">
                       <span className="nm">{d.label}</span>
                       <span className="st">{ok ? 'Beschikbaar' : 'Nog niet'}</span>
                     </span>
                   </div>
                 );
               })}
             </div>
           </div>
         </>
       ) : (
         <div className="pb-phase-empty">
           <h3>
             {phaseInfo.name} <span className="rcode">{phaseInfo.code}</span>
           </h3>
           <p>
             Het processtappen-model voor deze fase is nog niet gemodelleerd. Alleen{' '}
             <b>
               {RIP_PHASES[0].name} ({RIP_PHASES[0].code})
             </b>{' '}
             is volledig uitgewerkt — selecteer {RIP_PHASES[0].code} hierboven voor de swimlane met
             rollen, taken en deliverables.
           </p>
         </div>
       );
     }
     ```

- [ ] **Step 4: Run the tests to verify they pass**

  Run (from `packages/frontend`):
  `npx vitest run src/components/InfraBoardDashboard/ProjectDetail.test.tsx`

  Expected: PASS, every test in the file (five total: three existing plus
  the two carried over, two new — the live-instance describe block's test
  is untouched and should still pass, since `isLive` instances always
  default to R2.1).

- [ ] **Step 5: Run the full frontend suite and typecheck**

  Run (from `packages/frontend`):

  ```
  npx vitest run
  npx tsc --noEmit
  ```

  Expected: PASS / no errors. By this point every consumer of the fields
  Task 1 removed has migrated, so the whole frontend should be consistent
  again — `PHASES`/`Phase`/the `phaseLabels` prop threading are unused
  but not broken (Task 5 removes them). If this step surfaces anything
  else broken, it is a genuine regression to investigate, not expected
  breakage.

- [ ] **Step 6: Commit**

  ```bash
  git add packages/frontend/src/components/InfraBoardDashboard/ProjectDetail.tsx packages/frontend/src/components/InfraBoardDashboard/ProjectDetail.test.tsx
  git commit -m "feat(frontend): move ProjectDetail's stepper onto the real twelve-phase RIP ladder"
  ```

---

### Task 5: Cleanup — retire `PHASES`/`Phase` and the `phaseLabels` prop chain

**Files:**

- Modify: `packages/frontend/src/pages/infra-board/rip-model.ts`
- Modify: `packages/frontend/src/pages/InfraBoardDashboard.tsx`
- Modify: `packages/frontend/src/components/InfraBoardDashboard/InfraSectionRouter.tsx`
- Modify: `packages/frontend/src/components/InfraBoardDashboard/InfraSectionRouter.test.tsx`
- Modify: `packages/frontend/src/components/InfraBoardDashboard/Portfolio.tsx`
- Modify: `packages/frontend/src/components/InfraBoardDashboard/Portfolio.test.tsx`
- Modify: `packages/frontend/src/components/InfraBoardDashboard/ProjectDetail.tsx`
- Modify: `packages/frontend/src/components/InfraBoardDashboard/ProjectDetail.test.tsx`

**Correction found during execution:** the original version of this plan
omitted `Portfolio.test.tsx`/`ProjectDetail.test.tsx` from this list. Tasks
2 and 4 left a literal `phaseLabels={[]}` in every render call in both
files (needed while `Props` still declared the field) — once Steps 1-2
below remove `phaseLabels` from `Portfolio`'s and `ProjectDetail`'s `Props`
interfaces, those literal props become a TypeScript excess-property error
(`TS2322`), caught by Step 7's `tsc --noEmit` gate. Strip every
`phaseLabels={[]}` (and its surrounding whitespace) from both test files'
render calls — mechanical, no other change needed in either file.

**Interfaces:**

- Consumes: nothing new.
- Produces: `PHASES`/`Phase` no longer exist; `phaseLabels` no longer
  exists anywhere in this call chain. Pure deletion — no behavior change
  (Tasks 2 and 4 already stopped reading it).

- [ ] **Step 1: Remove `phaseLabels` from `Portfolio.tsx`'s `Props`**

  ```ts
  interface Props {
    phaseLabels: string[];
    onOpenProject: (ref: ProjectRef) => void;
  }
  ```

  becomes:

  ```ts
  interface Props {
    onOpenProject: (ref: ProjectRef) => void;
  }
  ```

- [ ] **Step 2: Remove `phaseLabels` from `ProjectDetail.tsx`'s `Props`**

  ```ts
  interface Props {
    projectRef: ProjectRef;
    phaseLabels: string[];
    onBack: () => void;
  }
  ```

  becomes:

  ```ts
  interface Props {
    projectRef: ProjectRef;
    onBack: () => void;
  }
  ```

  The function signature already reads
  `export default function ProjectDetail({ projectRef, onBack }: Props)` —
  Task 4 already stopped destructuring `phaseLabels` (required there, to
  avoid an unused-variable typecheck error under this repo's
  `noUnusedParameters`). No further signature change needed here.

- [ ] **Step 3: Remove `phaseLabels` from `InfraSectionRouter.tsx`**

  In the `Props` interface:

  ```ts
  interface Props {
    mode: InfraModeId;
    section: string;
    openProject: ProjectRef | null;
    user: KeycloakUser | null;
    tenantConfig: TenantConfig | null;
    phaseLabels: string[];
    onOpenProject: (ref: ProjectRef) => void;
    onBack: () => void;
    onGotoPortfolio: () => void;
    onOpenPhase: (phaseCode: string) => void;
    onBackToFaseladder: () => void;
  }
  ```

  remove the `phaseLabels: string[];` line.

  Change:

  ```tsx
  if (p.openProject) {
    return (
      <ProjectDetail projectRef={p.openProject} phaseLabels={p.phaseLabels} onBack={p.onBack} />
    );
  }
  ```

  to:

  ```tsx
  if (p.openProject) {
    return <ProjectDetail projectRef={p.openProject} onBack={p.onBack} />;
  }
  ```

  Change:

  ```tsx
  if (p.mode === 'portfolio') {
    return <Portfolio phaseLabels={p.phaseLabels} onOpenProject={p.onOpenProject} />;
  }
  ```

  to:

  ```tsx
  if (p.mode === 'portfolio') {
    return <Portfolio onOpenProject={p.onOpenProject} />;
  }
  ```

- [ ] **Step 4: Remove `phaseLabels: []` from `InfraSectionRouter.test.tsx`'s `baseProps`**

  Find `phaseLabels: [],` in the `baseProps` object and delete that line.

- [ ] **Step 5: Remove `phaseLabels` state from `InfraBoardDashboard.tsx`**

  Remove the import (or narrow it — check what else this file imports from
  `rip-model.ts`; if `PHASES` is the only thing imported from there, remove
  the whole import line):

  ```ts
  import { PHASES } from './infra-board/rip-model';
  ```

  Remove:

  ```tsx
  const [phaseLabels, _setPhaseLabels] = useState<string[]>(PHASES.map((p) => p.name));
  ```

  Remove the `phaseLabels={phaseLabels}` line from the `<InfraSectionRouter
... />` call.

  Update the stale comment:

  ```tsx
  {
    /* Tweaks panel — wire to your host Tweaks protocol or a toolbar button.
      Controls: accent (setAccent), density (setDensity), phaseLabels (setPhaseLabels). */
  }
  ```

  to:

  ```tsx
  {
    /* Tweaks panel — wire to your host Tweaks protocol or a toolbar button.
      Controls: accent (setAccent), density (setDensity). */
  }
  ```

- [ ] **Step 6: Remove `PHASES`/`Phase` from `rip-model.ts`**

  Delete the `Phase` interface and `PHASES` constant:

  ```ts
  export interface Phase {
    n: number;
    code: string;
    name: string;
    defaultName: string;
  }

  /** Lifecycle phases. Fase 1 is authoritative; 2–6 are placeholders. */
  export const PHASES: Phase[] = [
    {
      n: 1,
      code: 'R2.1',
      name: 'Projectplan Planvoorbereiding',
      defaultName: 'Projectplan Planvoorbereiding',
    },
    { n: 2, code: 'R2.2', name: 'Planuitwerking (VO)', defaultName: 'Planuitwerking (VO)' },
    { n: 3, code: 'R2.3', name: 'Definitief ontwerp', defaultName: 'Definitief ontwerp' },
    { n: 4, code: 'R2.4', name: 'Aanbesteding', defaultName: 'Aanbesteding' },
    { n: 5, code: 'R3', name: 'Uitvoering', defaultName: 'Uitvoering' },
    { n: 6, code: 'R4', name: 'Decharge', defaultName: 'Decharge' },
  ];
  ```

  Nothing else in this file references `Phase`/`PHASES` — every other
  export (`STATUS`, `HEALTH`, `ROLES`, `roleByKey`, `FASE1_*`,
  `nodeStatusFromHistory`) is independent.

- [ ] **Step 7: Run the full frontend suite, typecheck, and lint**

  Run (from `packages/frontend`):

  ```
  npx vitest run
  npx tsc --noEmit
  npm run lint
  ```

  Expected: PASS / no errors, all test files green. This is the final gate
  for the whole sub-project.

- [ ] **Step 8: Commit**

  ```bash
  git add packages/frontend/src/pages/infra-board/rip-model.ts packages/frontend/src/pages/InfraBoardDashboard.tsx packages/frontend/src/components/InfraBoardDashboard/InfraSectionRouter.tsx packages/frontend/src/components/InfraBoardDashboard/InfraSectionRouter.test.tsx packages/frontend/src/components/InfraBoardDashboard/Portfolio.tsx packages/frontend/src/components/InfraBoardDashboard/ProjectDetail.tsx
  git commit -m "chore(frontend): retire the six-phase PHASES model and phaseLabels prop threading"
  ```
