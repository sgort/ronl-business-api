# RIP Beheer — R5.3 Geparkeerde Projecten List (Sub-project E) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `PhaseDetail.tsx`'s bare "Niet gemodelleerd" banner for R5.3
(the ladder's `beyond: true` placeholder phase) with the full page the v2
design specifies: updated banner copy plus a "Geparkeerde projecten" list of
every mock project currently sitting on that phase.

**Architecture:** One new pure selector (`getMockGeparkeerdRows`, mirroring
`getMockWipRows`/`getMockGereedRows`'s existing pattern and parity-tested
against `getMockPhaseCounts` the same way), then a UI addition to
`PhaseDetail.tsx`'s existing `beyond` early-return branch. No live data, no
new hooks — R5.3 has no BPMN and never fetches anything.

**Tech Stack:** TypeScript, React, Vitest, `@testing-library/react`.

## Global Constraints

- No live-data path for R5.3 — `getMockPortfolio()` is synchronous; nothing
  in this plan adds a fetch, a loading state, or an error state.
- No click/navigation affordance on parked-project rows — matches the v2
  reference exactly (`reference/pb-beheer.reference.jsx`'s `ph.beyond`
  branch has none).
- Reuse existing `.pb-*`/`.v2-*` classes and the codebase's own established
  header pattern (`<h2>Title <span>{count}</span></h2>`, already used by the
  Starten tab's "Projecten die {code} kunnen starten" header) rather than
  introducing the reference prototype's own class names (`pb-sec-head`, `c`)
  verbatim — same visual result, no new visual language.
- Run all `npx vitest` commands from `packages/frontend` specifically (`cd`
  there first), not the repo root.

---

### Task 1: `infra-board.data.ts` — `getMockGeparkeerdRows` selector

**Files:**

- Modify: `packages/frontend/src/pages/infra-board/infra-board.data.ts`
- Modify: `packages/frontend/src/pages/infra-board/infra-board.data.test.ts`

**Interfaces:**

- Consumes: `getMockPortfolio`, `RIP_PHASES`, `RipPhase`/`PortfolioProject`
  types (all already in this file).
- Produces: `getMockGeparkeerdRows(phase: RipPhase): PortfolioProject[]`.
  Task 2 imports it.

- [ ] **Step 1: Write the failing test**

  In `infra-board.data.test.ts`, add `getMockGeparkeerdRows` to the existing
  import from `./infra-board.data`, then append this test inside
  `describe('getMockWipRows / getMockGereedRows', ...)` (rename that
  `describe` block to `'getMockWipRows / getMockGereedRows / getMockGeparkeerdRows'`):

  ```ts
  it('getMockGeparkeerdRows matches getMockPhaseCounts geparkeerd count for R5.3', () => {
    const counts = getMockPhaseCounts();
    const r53 = RIP_PHASES.find((p) => p.code === 'R5.3')!;
    expect(getMockGeparkeerdRows(r53).length).toBe(counts['R5.3'].geparkeerd);
  });
  ```

- [ ] **Step 2: Run the test to verify it fails**

  Run (from `packages/frontend`):
  `npx vitest run src/pages/infra-board/infra-board.data.test.ts -t "getMockGeparkeerdRows"`

  Expected: FAIL — `getMockGeparkeerdRows is not a function`.

- [ ] **Step 3: Write minimal implementation**

  In `infra-board.data.ts`, add right after `getMockGereedRows`:

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

- [ ] **Step 4: Run the test to verify it passes**

  Same command as Step 2. Expected: PASS.

- [ ] **Step 5: Run the full file to confirm no regressions**

  Run (from `packages/frontend`): `npx vitest run src/pages/infra-board/infra-board.data.test.ts`

  Expected: PASS, every test in the file.

- [ ] **Step 6: Commit**

  ```bash
  git add packages/frontend/src/pages/infra-board/infra-board.data.ts packages/frontend/src/pages/infra-board/infra-board.data.test.ts
  git commit -m "feat(frontend): add getMockGeparkeerdRows for the R5.3 placeholder's parked-projects list"
  ```

---

### Task 2: `PhaseDetail.tsx` — R5.3 placeholder page

**Files:**

- Modify: `packages/frontend/src/components/InfraBoardDashboard/PhaseDetail.tsx`
- Modify: `packages/frontend/src/components/InfraBoardDashboard/PhaseDetail.test.tsx`
- Modify: `packages/frontend/src/pages/infra-board/dashboard-infra.css`

**Interfaces:**

- Consumes: `getMockGeparkeerdRows` (Task 1); `HEALTH` (already imported in
  this file, from `rip-model.ts`).
- Produces: the `beyond` branch renders the updated banner, a "Geparkeerde
  projecten" header with count, and the parked-projects list.

- [ ] **Step 1: Write the failing tests**

  In `PhaseDetail.test.tsx`, add `getMockGeparkeerdRows` to the existing
  import from `'../../pages/infra-board/infra-board.data'`.

  Replace the existing `describe('PhaseDetail — R5.3 (beyond)', ...)` block:

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

  with:

  ```tsx
  describe('PhaseDetail — R5.3 (beyond)', () => {
    it('renders a placeholder instead of the tab shell', () => {
      render(<PhaseDetail phaseCode="R5.3" onBack={vi.fn()} />);
      expect(screen.queryByText('Starten')).not.toBeInTheDocument();
      expect(screen.queryByText('WIP')).not.toBeInTheDocument();
      expect(screen.getByText('Niet gemodelleerd', { exact: false })).toBeInTheDocument();
    });

    it('lists every geparkeerd project with its number, name, and health', () => {
      render(<PhaseDetail phaseCode="R5.3" onBack={vi.fn()} />);
      const parked = getMockGeparkeerdRows(ripPhaseByCode('R5.3')!);
      expect(parked.length).toBeGreaterThan(0);

      // Scoped to the heading itself: an unscoped count lookup could collide
      // with the meta strip's "Betrokken rollen" number elsewhere on the
      // page if the two ever happen to match.
      const heading = screen.getByText('Geparkeerde projecten', { exact: false }).closest('h2');
      expect(heading).not.toBeNull();
      expect(within(heading!).getByText(String(parked.length))).toBeInTheDocument();

      const first = parked[0];
      const row = screen.getByText(first.naam, { exact: false }).closest('li');
      expect(row).not.toBeNull();
      expect(within(row!).getByText(first.nr, { exact: false })).toBeInTheDocument();
      expect(within(row!).getByTitle(HEALTH[first.health].label)).toBeInTheDocument();
    });

    it('shows the phase source below the parked list', () => {
      render(<PhaseDetail phaseCode="R5.3" onBack={vi.fn()} />);
      const phase = ripPhaseByCode('R5.3')!;
      expect(screen.getByText(phase.bron, { exact: false })).toBeInTheDocument();
    });
  });
  ```

  Add `HEALTH` to the existing import from `'../../pages/infra-board/rip-model'`
  in this test file if not already present (it is not currently imported by
  the test file — only by `PhaseDetail.tsx` itself — so add
  `import { HEALTH } from '../../pages/infra-board/rip-model';` as a new
  import line).

- [ ] **Step 2: Run the tests to verify they fail**

  Run (from `packages/frontend`):
  `npx vitest run src/components/InfraBoardDashboard/PhaseDetail.test.tsx -t "geparkeerd project|phase source"`

  Expected: FAIL — neither the parked list nor the bron line exist yet.

- [ ] **Step 3: Write minimal implementation**

  In `PhaseDetail.tsx`:
  1. Add `getMockGeparkeerdRows` to the existing import from
     `'../../pages/infra-board/infra-board.data'`.

  2. Replace the `beyond` branch:

     ```tsx
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
     ```

     with:

     ```tsx
     if (phase.beyond) {
       const geparkeerd = getMockGeparkeerdRows(phase);
       return (
         <div className="pb-view">
           {header}
           <div className="pb-banner">
             Niet gemodelleerd — voor {phase.code} is geen overzichtsplaat aangeleverd en dus geen
             procesmodel opgesteld. Dit deelproces kent daarom geen start, WIP of gereed: projecten
             die hier staan worden niet bewaakt tot het deelproces is uitgewerkt en gedeployed.
           </div>
           <h2>
             Geparkeerde projecten <span>{geparkeerd.length}</span>
           </h2>
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

- [ ] **Step 4: Run the tests to verify they pass**

  Same command as Step 2. Expected: PASS. Then run the whole file:

  ```
  npx vitest run src/components/InfraBoardDashboard/PhaseDetail.test.tsx
  ```

  Expected: PASS, every test in the file (confirms the existing "renders a
  placeholder instead of the tab shell" test still passes unchanged — the
  new banner text still starts with "Niet gemodelleerd", which is all that
  test asserts on).

- [ ] **Step 5: Add CSS**

  Append to `dashboard-infra.css`:

  ```css
  .pbd .pb-parked-list {
    list-style: none;
    padding: 0;
    margin: 12px 0;
  }
  .pbd .pb-parked-list li {
    position: relative;
    padding: 10px 0 10px 0;
    padding-right: 24px;
    border-bottom: 1px solid var(--v2-rule);
  }
  .pbd .pb-parked-list .sub {
    font-size: 12px;
    color: var(--v2-ink-3);
    margin-top: 4px;
  }
  .pbd .pb-parked-list .pb-health-dot {
    position: absolute;
    right: 4px;
    top: 14px;
  }
  ```

  (Matches `.pb-ready-list`'s existing visual weight — same rule shapes,
  new class name since nothing here is selectable/checkboxed unlike that
  list. The health dot is absolutely positioned to the row's trailing edge
  since, unlike the WIP tab's table-cell version, this is a `<li>` with no
  dedicated column to sit in.)

- [ ] **Step 6: Run the full frontend suite to confirm no regressions**

  Run (from `packages/frontend`): `npx vitest run`

  Expected: PASS, all test files.

- [ ] **Step 7: Typecheck and lint**

  Run (from `packages/frontend`):

  ```
  npx tsc --noEmit
  npm run lint
  ```

  Expected: no errors.

- [ ] **Step 8: Commit**

  ```bash
  git add packages/frontend/src/components/InfraBoardDashboard/PhaseDetail.tsx packages/frontend/src/components/InfraBoardDashboard/PhaseDetail.test.tsx packages/frontend/src/pages/infra-board/dashboard-infra.css
  git commit -m "feat(frontend): build out R5.3 placeholder page with the geparkeerde-projecten list"
  ```
