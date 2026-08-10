# Rail Stats Panel (Mijn dag / Portfolio / Beheer) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Infra-board app shell's `<aside className="v2-rail">` real per-mode
content — Mijn dag's Taken-vandaag/Urgent/Mijn-projecten stats, Portfolio's
stage-grouped phase counts + Overgangen + Gezondheid breakdown, and Beheer's
subtitle + per-phase WIP/geparkeerd badges — closing the two UX gaps the user
found comparing the deployed app against the v2 design screenshots.

**Architecture:** One new pure module (`rail-stats.ts`) computes display data
from already-fetched mock+live inputs — no hooks inside it, matching how
every other Infra-board component sources live data. `InfraBoardDashboard.tsx`
calls the (already-existing) live-data hooks, builds the same mock+live merge
every sibling component already builds, passes the results into `rail-stats.ts`,
and renders the result per mode. `modes.config.ts` gains three optional badge
fields on `InfraRailItem` and drops Portfolio's single static rail item (the
design has no in-rail Portfolio link at all — the top nav tab already routes
there).

**Tech Stack:** React 18 + TypeScript (`packages/frontend`), Vitest + React
Testing Library, existing `useAsync`-based hooks in `services/infra.api.ts`.

## Global Constraints

- Never add `Co-Authored-By`/`Claude-Session` git commit trailers.
- Run all frontend commands from `packages/frontend` (Windows/Git Bash `cd`
  gotcha — running from repo root silently picks up the wrong config).
- `tsconfig.json` has `noUnusedLocals`/`noUnusedParameters: true` — remove
  any parameter/import that becomes unused by an edit in the same step.
- No click/filter interaction on Portfolio's or Mijn dag's stat rows — display
  only, matching `reference/pb-shell.reference.jsx`'s `PBRail` exactly.
- No change to `FaseladderOverview.tsx`'s own rendering — this reuses its
  counting functions (`combinePhaseCounts`, `normalizeLiveCounts`,
  `getPhaseDeployStatus`), never its JSX.
- No rail content for any mode beyond `mijn-dag`/`portfolio`/`beheer`, no
  change to the top-level mode tabs.
- `muted` reads the existing `getPhaseDeployStatus` result (`'gedeployed'` vs
  not) — no new deployment-state distinction.
- Badges render conditionally — only when `count`/`parkedCount` is greater
  than zero (matches the reference's `{wip > 0 && <span className="pb-rail-badge">…`).

## Deviations from the spec (decided during planning, both are net simplifications)

1. **`modes.config.test.ts` line 16** (`expect(findModeForSection('portfolio')).toBe('portfolio')`)
   was written before the spec's Section 4 change (Portfolio's `groups: []`)
   existed, and asserts the exact opposite of the new correct behavior — once
   Portfolio's rail carries no item with id `'portfolio'`, `findModeForSection('portfolio')`
   genuinely returns `null`. Task 2 updates this assertion; this is not a new
   design decision, just catching up a stale test to the spec's already-approved
   Section 4.
2. **`.v2-rail-item.pb-rail-phase` CSS is dropped.** The spec's Section 5 ports
   it verbatim from the reference (`display:flex; align-items:center; gap:8px;
justify-content:space-between`), but `packages/frontend/src/pages/caseworker-v2/dashboard-v2.css:395-407`
   shows the base `.cwd-v2 .v2-rail-item` rule this codebase already uses is
   `display:flex; justify-content:space-between; align-items:center` — identical
   in effect. Adding `.pb-rail-phase` here would be dead, redundant CSS; Task 3
   never applies the class and Task 3's CSS step omits the rule. The other four
   ported rules (`.pb-rail-code`, `.v2-rail-item.active .pb-rail-code`,
   `.v2-rail-item.muted`, `.pb-rail-badge`, `.pb-rail-badge.parked`) have no
   existing equivalent and are added as specified.
3. **Phase rail items' `label` field loses its `${code} · ` prefix**, becoming
   just `p.name`. The spec's CSS explicitly adds `.pb-rail-code` (a small mono
   chip for the phase code), which only has something to style if the code is
   its own element rather than baked into one label string — the current
   `` `${p.code} · ${p.name}` `` string can't be split safely at render time.
   `phaseCodeFromSectionId(it.id)` (already exported by `modes.config.ts`)
   gives `InfraBoardDashboard.tsx` the code back to render as a separate
   `<span className="pb-rail-code">`. Confirmed safe: no test in the repo
   asserts the old combined label text (`grep`ped for `"· \${p.name}"` and
   the literal `"R2.1 · "` pattern — only `modes.config.ts`/`.test.ts`
   themselves matched, both touched by Task 2).

---

### Task 1: `rail-stats.ts` — pure per-mode stat derivations

**Files:**

- Create: `packages/frontend/src/pages/infra-board/rail-stats.ts`
- Test: `packages/frontend/src/pages/infra-board/rail-stats.test.ts`

**Interfaces:**

- Consumes: `PortfolioProject`, `TodoItem`, `MIJN_PROJECT_NRS`, `getMockTodos`
  from `./infra-board.data`; `RIP_PHASES`, `RIP_STAGES`, `RipPhase`, `RipStage`
  from `./rip-phases.catalog`; `HEALTH`, `HealthKey` from `./rip-model`;
  `AnnotatedPhaseCounts` from `./rip-phase-counts`; `Task` from `@ronl/shared`;
  `groupTasksByHorizon` from `../../services/infra.api` (three levels up from
  `pages/infra-board/` to `src/`, then into `services/`).
- Produces (used by Task 3): `RailStat { label: string; value: number; dotColor?: string }`,
  `mijnDagRailStats(liveTasks: Task[] | null, mockTodos: ReturnType<typeof getMockTodos>, allProjects: PortfolioProject[]): RailStat[]`,
  `portfolioRailStageGroups(projects: PortfolioProject[]): { stage: RipStage; phases: { phase: RipPhase; count: number }[] }[]`,
  `portfolioRailTransitions(projects: PortfolioProject[]): RailStat[]`,
  `portfolioRailHealth(projects: PortfolioProject[]): RailStat[]`,
  `beheerRailSubtitle(combined: Record<string, AnnotatedPhaseCounts>): string`.

- [ ] **Step 1: Write the failing test file**

```ts
// packages/frontend/src/pages/infra-board/rail-stats.test.ts
import { describe, expect, it } from 'vitest';
import type { Task } from '@ronl/shared';
import {
  mijnDagRailStats,
  portfolioRailStageGroups,
  portfolioRailTransitions,
  portfolioRailHealth,
  beheerRailSubtitle,
} from './rail-stats';
import { MIJN_PROJECT_NRS, type PortfolioProject, type TodoItem } from './infra-board.data';
import { RIP_PHASES, RIP_STAGES } from './rip-phases.catalog';
import type { AnnotatedPhaseCounts } from './rip-phase-counts';

function makeProject(overrides: Partial<PortfolioProject> & { nr: string }): PortfolioProject {
  return {
    id: overrides.nr,
    naam: `Project ${overrides.nr}`,
    role: 'aannemer',
    health: 'groen',
    milestone: '',
    budget: '',
    startYear: 2024,
    start: 0,
    end: 4,
    segments: [],
    ripPhaseCode: 'R2.1',
    ripPhaseState: 'wip',
    ...overrides,
  };
}

const EMPTY_TODOS = {
  vandaag: [] as TodoItem[],
  deze_week: [] as TodoItem[],
  volgende_week: [] as TodoItem[],
};
// Always yesterday relative to "now" — lands in groupTasksByHorizon's
// overdue+vandaag bucket regardless of what day the suite runs.
const YESTERDAY = new Date(Date.now() - 86400000).toISOString();

function makeLiveTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    processDefinitionKey: 'RipPhase1Process',
    processInstanceId: 'i1',
    name: 'Live taak',
    assignee: 'user1',
    due: YESTERDAY,
    ...overrides,
  } as Task;
}

describe('mijnDagRailStats', () => {
  it('sums live + mock "vandaag" todos for Taken vandaag', () => {
    const mockTodos = {
      ...EMPTY_TODOS,
      vandaag: [{ prio: 'active', titel: 'x', proj: '1', sub: '', actie: '' }] as TodoItem[],
    };
    const stats = mijnDagRailStats([makeLiveTask()], mockTodos, []);
    expect(stats.find((s) => s.label === 'Taken vandaag')?.value).toBe(2);
  });

  it('Urgent / te laat sums live overdue + mock overdue + rood-health projects', () => {
    const mockTodos = {
      ...EMPTY_TODOS,
      vandaag: [{ prio: 'overdue', titel: 'x', proj: '1', sub: '', actie: '' }] as TodoItem[],
    };
    const projects = [
      makeProject({ nr: '1', health: 'rood' }),
      makeProject({ nr: '2', health: 'groen' }),
    ];
    // makeLiveTask() is overdue by construction (due = yesterday).
    const stats = mijnDagRailStats([makeLiveTask()], mockTodos, projects);
    expect(stats.find((s) => s.label === 'Urgent / te laat')?.value).toBe(3);
  });

  it('Mijn projecten is always MIJN_PROJECT_NRS.length, independent of input', () => {
    const stats = mijnDagRailStats(null, EMPTY_TODOS, []);
    expect(stats.find((s) => s.label === 'Mijn projecten')?.value).toBe(MIJN_PROJECT_NRS.length);
  });

  it('treats a null live task list as zero live contribution', () => {
    const stats = mijnDagRailStats(null, EMPTY_TODOS, []);
    expect(stats.find((s) => s.label === 'Taken vandaag')?.value).toBe(0);
    expect(stats.find((s) => s.label === 'Urgent / te laat')?.value).toBe(0);
  });
});

describe('portfolioRailStageGroups', () => {
  it('returns one entry per RIP_STAGES, in order, each carrying only its own phases', () => {
    const groups = portfolioRailStageGroups([]);
    expect(groups.map((g) => g.stage.code)).toEqual(RIP_STAGES.map((s) => s.code));
    groups.forEach((g) => {
      g.phases.forEach(({ phase }) => expect(phase.stage).toBe(g.stage.code));
    });
  });

  it('counts partition every project exactly once, into its own phase bucket', () => {
    const projects = [
      makeProject({ nr: '1', ripPhaseCode: 'R2.1' }),
      makeProject({ nr: '2', ripPhaseCode: 'R2.1' }),
      makeProject({ nr: '3', ripPhaseCode: 'R5.3' }),
    ];
    const groups = portfolioRailStageGroups(projects);
    const totalCounted = groups.reduce(
      (sum, g) => sum + g.phases.reduce((s, ph) => s + ph.count, 0),
      0
    );
    expect(totalCounted).toBe(3);
    const r21 = groups.flatMap((g) => g.phases).find((ph) => ph.phase.code === 'R2.1');
    const r53 = groups.flatMap((g) => g.phases).find((ph) => ph.phase.code === 'R5.3');
    expect(r21?.count).toBe(2);
    expect(r53?.count).toBe(1);
  });
});

describe('portfolioRailTransitions', () => {
  it('counts only wachtend projects under "Wacht op start"', () => {
    const projects = [
      makeProject({ nr: '1', ripPhaseState: 'wachtend' }),
      makeProject({ nr: '2', ripPhaseState: 'wip' }),
      makeProject({ nr: '3', ripPhaseState: 'wachtend' }),
    ];
    const stats = portfolioRailTransitions(projects);
    expect(stats).toEqual([{ label: 'Wacht op start', value: 2, dotColor: '#7a5af0' }]);
  });
});

describe('portfolioRailHealth', () => {
  it('partitions every project by health into groen/geel/rood, summing to the total', () => {
    const projects = [
      makeProject({ nr: '1', health: 'groen' }),
      makeProject({ nr: '2', health: 'geel' }),
      makeProject({ nr: '3', health: 'rood' }),
      makeProject({ nr: '4', health: 'rood' }),
    ];
    const stats = portfolioRailHealth(projects);
    expect(stats.reduce((sum, s) => sum + s.value, 0)).toBe(4);
    expect(stats.find((s) => s.label === 'Op schema')?.value).toBe(1);
    expect(stats.find((s) => s.label === 'Aandacht')?.value).toBe(1);
    expect(stats.find((s) => s.label === 'Risico')?.value).toBe(2);
  });
});

describe('beheerRailSubtitle', () => {
  it('sums wip across every phase, mirroring FaseladderOverview.tsx\'s "Fasen in uitvoering"', () => {
    const combined: Record<string, AnnotatedPhaseCounts> = {};
    RIP_PHASES.forEach((p, i) => {
      combined[p.code] = {
        wip: i === 0 ? 3 : i === 1 ? 2 : 0,
        gereed: 0,
        geparkeerd: 0,
        liveWip: 0,
        liveGereed: 0,
        liveGeparkeerd: 0,
      };
    });
    expect(beheerRailSubtitle(combined)).toBe('RIP-faseladder · 5 in uitvoering');
  });

  it('treats a phase missing from the combined map as zero', () => {
    expect(beheerRailSubtitle({})).toBe('RIP-faseladder · 0 in uitvoering');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `packages/frontend`): `npx vitest run src/pages/infra-board/rail-stats.test.ts`
Expected: FAIL — `Cannot find module './rail-stats'` (module doesn't exist yet).

- [ ] **Step 3: Write the implementation**

```ts
// packages/frontend/src/pages/infra-board/rail-stats.ts
/**
 * Rail stats — pure derivations for the app shell's per-mode rail
 * (Mijn dag / Portfolio / Beheer). InfraBoardDashboard.tsx calls the live
 * data hooks and builds the mock+live project list; these functions take
 * the results as plain arguments and do no fetching of their own — the
 * same "components independently source their own live data" pattern
 * FaseladderOverview.tsx and PhaseDetail.tsx already use.
 * See docs/superpowers/specs/2026-08-10-rip-beheer-rail-stats-panel-design.md.
 */
import type { Task } from '@ronl/shared';
import { groupTasksByHorizon } from '../../services/infra.api';
import { MIJN_PROJECT_NRS, getMockTodos, type PortfolioProject } from './infra-board.data';
import { RIP_PHASES, RIP_STAGES, type RipPhase, type RipStage } from './rip-phases.catalog';
import { HEALTH, type HealthKey } from './rip-model';
import type { AnnotatedPhaseCounts } from './rip-phase-counts';

export interface RailStat {
  label: string;
  value: number;
  dotColor?: string;
}

/** "Taken vandaag" / "Urgent / te laat" / "Mijn projecten" for the Mijn dag rail. */
export function mijnDagRailStats(
  liveTasks: Task[] | null,
  mockTodos: ReturnType<typeof getMockTodos>,
  allProjects: PortfolioProject[]
): RailStat[] {
  const liveVandaag = liveTasks ? groupTasksByHorizon(liveTasks).vandaag : [];
  const takenVandaag = liveVandaag.length + mockTodos.vandaag.length;
  const urgent =
    liveVandaag.filter((t) => t.prio === 'overdue').length +
    mockTodos.vandaag.filter((t) => t.prio === 'overdue').length +
    allProjects.filter((p) => p.health === 'rood').length;
  return [
    { label: 'Taken vandaag', value: takenVandaag },
    { label: 'Urgent / te laat', value: urgent, dotColor: '#b0103c' },
    { label: 'Mijn projecten', value: MIJN_PROJECT_NRS.length },
  ];
}

/** Phase counts grouped by stage, in RIP_STAGES order — not navigable, display only. */
export function portfolioRailStageGroups(
  projects: PortfolioProject[]
): { stage: RipStage; phases: { phase: RipPhase; count: number }[] }[] {
  return RIP_STAGES.map((stage) => ({
    stage,
    phases: RIP_PHASES.filter((p) => p.stage === stage.code).map((phase) => ({
      phase,
      count: projects.filter((p) => p.ripPhaseCode === phase.code).length,
    })),
  }));
}

/** "Wacht op start" — projects waiting for their current phase to begin. */
export function portfolioRailTransitions(projects: PortfolioProject[]): RailStat[] {
  return [
    {
      label: 'Wacht op start',
      value: projects.filter((p) => p.ripPhaseState === 'wachtend').length,
      dotColor: '#7a5af0',
    },
  ];
}

/** Gezondheid breakdown — groen/geel/rood, reusing rip-model's HEALTH vocabulary. */
export function portfolioRailHealth(projects: PortfolioProject[]): RailStat[] {
  const order: HealthKey[] = ['groen', 'geel', 'rood'];
  return order.map((key) => ({
    label: HEALTH[key].label,
    value: projects.filter((p) => p.health === key).length,
    dotColor: HEALTH[key].color,
  }));
}

/** "RIP-faseladder · N in uitvoering" — same sum as FaseladderOverview.tsx's
 *  "Fasen in uitvoering" KPI, shown in the Beheer rail header instead. */
export function beheerRailSubtitle(combined: Record<string, AnnotatedPhaseCounts>): string {
  const total = RIP_PHASES.reduce((sum, p) => sum + (combined[p.code]?.wip ?? 0), 0);
  return `RIP-faseladder · ${total} in uitvoering`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run (from `packages/frontend`): `npx vitest run src/pages/infra-board/rail-stats.test.ts`
Expected: PASS, all 10 tests green.

- [ ] **Step 5: Typecheck**

Run (from `packages/frontend`): `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add packages/frontend/src/pages/infra-board/rail-stats.ts packages/frontend/src/pages/infra-board/rail-stats.test.ts
git commit -m "feat: add rail-stats module for Mijn dag/Portfolio/Beheer rail panels"
```

---

### Task 2: `modes.config.ts` — badge fields, drop Portfolio's rail item, split phase label from code

**Files:**

- Modify: `packages/frontend/src/pages/infra-board/modes.config.ts`
- Modify: `packages/frontend/src/pages/infra-board/modes.config.test.ts`

**Interfaces:**

- Consumes: nothing new (already imports `RIP_STAGES`, `RIP_PHASES`).
- Produces (used by Task 3): `InfraRailItem` gains `count?: number`,
  `parkedCount?: number`, `muted?: boolean` (all optional, unset by
  `modes.config.ts` itself — Task 3 merges them in at render time). Phase
  items' `label` becomes the phase name alone (no more `${code} · ` prefix) —
  Task 3 renders the code separately via the already-exported
  `phaseCodeFromSectionId`. Portfolio's `INFRA_MODES` entry has `groups: []`.

- [ ] **Step 1: Add the badge fields to `InfraRailItem`**

In `packages/frontend/src/pages/infra-board/modes.config.ts`, replace:

```ts
export interface InfraRailItem {
  id: string;
  label: string;
  authRequired?: boolean;
  requiredRoles?: string[];
}
```

with:

```ts
export interface InfraRailItem {
  id: string;
  label: string;
  authRequired?: boolean;
  requiredRoles?: string[];
  /** WIP count badge (Beheer phase items only). Merged in at render time —
   *  the static INFRA_MODES array can't carry live counts. */
  count?: number;
  /** Geparkeerd count badge — R5.3 only, mutually exclusive with `count`. */
  parkedCount?: number;
  /** Dims the item — set when the phase isn't deployable yet. */
  muted?: boolean;
}
```

- [ ] **Step 2: Drop Portfolio's rail item**

Replace:

```ts
  {
    id: 'portfolio',
    label: 'Portfolio',
    defaultSectionId: 'portfolio',
    groups: [{ items: [{ id: 'portfolio', label: 'Alle projecten', authRequired: true }] }],
  },
```

with:

```ts
  {
    id: 'portfolio',
    label: 'Portfolio',
    defaultSectionId: 'portfolio',
    // No rail nav item — the design's Portfolio rail is stats-only
    // (stage-grouped phase counts, Overgangen, Gezondheid). The top-nav
    // "Portfolio" tab still routes here via setMode('portfolio');
    // InfraSectionRouter switches on `mode`, not `section`, so this is
    // unaffected. See rail-stats-panel spec, Section 4.
    groups: [],
  },
```

- [ ] **Step 3: Drop the code prefix from phase item labels**

Replace:

```ts
          ...RIP_STAGES.flatMap((stage) =>
            RIP_PHASES.filter((p) => p.stage === stage.code).map((p) => ({
              id: phaseSectionId(p.code),
              label: `${p.code} · ${p.name}`,
              authRequired: true,
              requiredRoles: [INFRA_GATE_ROLE],
            }))
          ),
```

with:

```ts
          ...RIP_STAGES.flatMap((stage) =>
            RIP_PHASES.filter((p) => p.stage === stage.code).map((p) => ({
              id: phaseSectionId(p.code),
              // Code intentionally not baked into the label string —
              // InfraBoardDashboard.tsx renders it as its own
              // `.pb-rail-code` chip via phaseCodeFromSectionId(id).
              label: p.name,
              authRequired: true,
              requiredRoles: [INFRA_GATE_ROLE],
            }))
          ),
```

- [ ] **Step 4: Fix the now-stale `findModeForSection('portfolio')` assertion**

In `packages/frontend/src/pages/infra-board/modes.config.test.ts`, replace:

```ts
expect(findModeForSection('portfolio')).toBe('portfolio');
```

with:

```ts
// Portfolio's rail carries stats only, no nav item with id 'portfolio' —
// see the rail-stats-panel spec, Section 4. The top-nav tab still
// routes to Portfolio directly via setMode, so this is expected.
expect(findModeForSection('portfolio')).toBeNull();
```

- [ ] **Step 5: Run the full `modes.config` test file**

Run (from `packages/frontend`): `npx vitest run src/pages/infra-board/modes.config.test.ts`
Expected: PASS, all tests green (including the now-updated assertion and the
unaffected `phaseSectionId`/`phaseCodeFromSectionId` round-trip test, which
never depended on label content).

- [ ] **Step 6: Typecheck**

Run (from `packages/frontend`): `npx tsc --noEmit`
Expected: no new errors. (`InfraBoardDashboard.tsx` still compiles at this
point — it doesn't read the new optional fields yet, and TS doesn't require
optional fields to be set.)

- [ ] **Step 7: Commit**

```bash
git add packages/frontend/src/pages/infra-board/modes.config.ts packages/frontend/src/pages/infra-board/modes.config.test.ts
git commit -m "feat: add rail badge fields to InfraRailItem, drop Portfolio's static rail item"
```

---

### Task 3: `InfraBoardDashboard.tsx` — wire the rail stats in, plus CSS and shell tests

**Files:**

- Modify: `packages/frontend/src/pages/InfraBoardDashboard.tsx`
- Modify: `packages/frontend/src/pages/InfraBoardDashboard.test.tsx`
- Modify: `packages/frontend/src/pages/infra-board/dashboard-infra.css`

**Interfaces:**

- Consumes: everything Task 1 and Task 2 produced (`rail-stats.ts`'s five
  functions, `InfraRailItem`'s three new optional fields,
  `phaseCodeFromSectionId` — already exported by `modes.config.ts`,
  unchanged this task), plus already-existing exports: `useOpenTasks`,
  `useActivePhase1`, `useDeployedProcessKeys`, `useLivePhaseCounts` from
  `../services/infra.api`; `getMockPortfolio`, `getMockTodos`,
  `getMockPhaseCounts`, `makePhase1Row`, `type PortfolioProject` from
  `./infra-board/infra-board.data`; `RIP_PHASES`, `getPhaseDeployStatus`
  from `./infra-board/rip-phases.catalog`; `combinePhaseCounts`,
  `normalizeLiveCounts` from `./infra-board/rip-phase-counts`.
- Produces: nothing further downstream — this is the top of the component
  tree for this feature.

- [ ] **Step 1: Write the failing shell tests**

In `packages/frontend/src/pages/InfraBoardDashboard.test.tsx`, add the four
`vi.mock`/`vi.hoisted` hook stubs (mirroring the exact pattern
`FaseladderOverview.test.tsx` already uses for the same module) right after
the existing `vi.mock('./ChangelogPanel', ...)` line, and add the four new
`it(...)` blocks at the end of the `describe('InfraBoardDashboard', ...)`
block, just before its closing `});`:

```tsx
const mockUseOpenTasks = vi.hoisted(() => vi.fn());
const mockUseActivePhase1 = vi.hoisted(() => vi.fn());
const mockUseDeployedProcessKeys = vi.hoisted(() => vi.fn());
const mockUseLivePhaseCounts = vi.hoisted(() => vi.fn());
vi.mock('../services/infra.api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/infra.api')>();
  return {
    ...actual,
    useOpenTasks: mockUseOpenTasks,
    useActivePhase1: mockUseActivePhase1,
    useDeployedProcessKeys: mockUseDeployedProcessKeys,
    useLivePhaseCounts: mockUseLivePhaseCounts,
  };
});
```

And, inside the existing `beforeEach(() => { ... })`, after the existing
three lines, add:

```tsx
mockUseOpenTasks.mockReturnValue({ data: null, loading: false, error: false, reload: vi.fn() });
mockUseActivePhase1.mockReturnValue({ data: null, loading: false, error: false, reload: vi.fn() });
mockUseDeployedProcessKeys.mockReturnValue({
  data: { deployedKeys: ['RipPhase1Process'] },
  loading: false,
  error: false,
  reload: vi.fn(),
});
mockUseLivePhaseCounts.mockReturnValue({
  data: { counts: {} },
  loading: false,
  error: false,
  reload: vi.fn(),
});
```

New tests (append before the `describe` block's closing `});`):

```tsx
it('shows Mijn dag rail stats for a gated user', async () => {
  mockKeycloak.authenticated = true;
  mockGetUser.mockReturnValue({ sub: '1', name: 'Test User', roles: ['infra-projectteam'] });

  render(<InfraBoardDashboard />);

  await waitFor(() => expect(screen.getByText('Taken vandaag')).toBeInTheDocument());
  expect(screen.getByText('Urgent / te laat')).toBeInTheDocument();
  expect(screen.getByText('Mijn projecten')).toBeInTheDocument();
});

it('Portfolio rail has no "Alle projecten" nav item, and shows stage/health stats instead', async () => {
  mockKeycloak.authenticated = true;
  mockGetUser.mockReturnValue({ sub: '1', name: 'Test User', roles: ['infra-projectteam'] });
  const user = userEvent.setup();

  render(<InfraBoardDashboard />);
  await user.click(screen.getByRole('button', { name: 'Portfolio' }));

  await waitFor(() => expect(screen.getByText('Op schema')).toBeInTheDocument());
  expect(screen.queryByRole('button', { name: 'Alle projecten' })).not.toBeInTheDocument();
  expect(screen.getByText('Aandacht')).toBeInTheDocument();
  expect(screen.getByText('Risico')).toBeInTheDocument();
  expect(screen.getByText('Wacht op start')).toBeInTheDocument();
});

it('Beheer rail shows the faseladder subtitle and a deployed-phase item with no muted class', async () => {
  mockKeycloak.authenticated = true;
  mockGetUser.mockReturnValue({ sub: '1', name: 'Test User', roles: ['infra-projectteam'] });
  const user = userEvent.setup();

  render(<InfraBoardDashboard />);
  await user.click(screen.getByRole('button', { name: 'Beheer' }));

  await waitFor(() => expect(screen.getByText(/RIP-faseladder ·/)).toBeInTheDocument());
  const r21Item = screen.getByRole('button', { name: /Projectplan planvoorbereiding/ });
  expect(r21Item.className).not.toContain('muted');
});

it('Beheer rail mutes an undeployed phase item', async () => {
  mockKeycloak.authenticated = true;
  mockGetUser.mockReturnValue({ sub: '1', name: 'Test User', roles: ['infra-projectteam'] });
  mockUseDeployedProcessKeys.mockReturnValue({
    data: { deployedKeys: [] },
    loading: false,
    error: false,
    reload: vi.fn(),
  });
  const user = userEvent.setup();

  render(<InfraBoardDashboard />);
  await user.click(screen.getByRole('button', { name: 'Beheer' }));

  const r21Item = await screen.findByRole('button', { name: /Projectplan planvoorbereiding/ });
  expect(r21Item.className).toContain('muted');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `packages/frontend`): `npx vitest run src/pages/InfraBoardDashboard.test.tsx`
Expected: FAIL — the four new tests fail (no rail stats rendered yet, "Alle
projecten" still present, no `.muted`/subtitle). The five pre-existing tests
should still PASS at this point (the mocks added in Step 1 return `null`/empty
data, which is a safe default the current component doesn't even read yet).

- [ ] **Step 3: Add the live-data imports and hook calls**

In `packages/frontend/src/pages/InfraBoardDashboard.tsx`, replace the import
block:

```tsx
import {
  INFRA_MODES,
  INFRA_GATE_ROLE,
  findModeForSection,
  isRailItemVisible,
  phaseSectionId,
  type InfraModeId,
} from './infra-board/modes.config';
import InfraSectionRouter from '../components/InfraBoardDashboard/InfraSectionRouter';
import InfraCommandPalette from '../components/InfraBoardDashboard/InfraCommandPalette';
import InfraDock from '../components/InfraBoardDashboard/InfraDock';
import InfraNoAccessPanel from '../components/InfraBoardDashboard/InfraNoAccessPanel';
import SessionExpiryWarning from '../components/SessionExpiryWarning';
import ChangelogPanel from './ChangelogPanel';

import './infra-board/dashboard-infra.css';
```

with:

```tsx
import {
  INFRA_MODES,
  INFRA_GATE_ROLE,
  findModeForSection,
  isRailItemVisible,
  phaseSectionId,
  phaseCodeFromSectionId,
  type InfraModeId,
} from './infra-board/modes.config';
import InfraSectionRouter from '../components/InfraBoardDashboard/InfraSectionRouter';
import InfraCommandPalette from '../components/InfraBoardDashboard/InfraCommandPalette';
import InfraDock from '../components/InfraBoardDashboard/InfraDock';
import InfraNoAccessPanel from '../components/InfraBoardDashboard/InfraNoAccessPanel';
import SessionExpiryWarning from '../components/SessionExpiryWarning';
import ChangelogPanel from './ChangelogPanel';
import {
  useOpenTasks,
  useActivePhase1,
  useDeployedProcessKeys,
  useLivePhaseCounts,
} from '../services/infra.api';
import {
  getMockPortfolio,
  getMockTodos,
  getMockPhaseCounts,
  makePhase1Row,
  type PortfolioProject,
} from './infra-board/infra-board.data';
import { RIP_PHASES, getPhaseDeployStatus } from './infra-board/rip-phases.catalog';
import { combinePhaseCounts, normalizeLiveCounts } from './infra-board/rip-phase-counts';
import {
  mijnDagRailStats,
  portfolioRailStageGroups,
  portfolioRailTransitions,
  portfolioRailHealth,
  beheerRailSubtitle,
} from './infra-board/rail-stats';

import './infra-board/dashboard-infra.css';
```

- [ ] **Step 4: Compute the rail data**

Replace:

```tsx
const visibleGroups = useMemo(
  () =>
    currentMode.groups
      .map((g) => ({ ...g, items: g.items.filter((i) => isRailItemVisible(i, gateContext)) }))
      .filter((g) => g.items.length > 0),
  [currentMode, gateContext]
);
```

with:

```tsx
const visibleGroups = useMemo(
  () =>
    currentMode.groups
      .map((g) => ({ ...g, items: g.items.filter((i) => isRailItemVisible(i, gateContext)) }))
      .filter((g) => g.items.length > 0),
  [currentMode, gateContext]
);

// Live data for the rail stats panels. Unconditional, like every other
// Infra-board component's hook calls — cheap, and consistent with how
// Portfolio.tsx/FaseladderOverview.tsx already source their own live data
// rather than lifting it here and threading it down as props.
const { data: liveTasks } = useOpenTasks();
const { data: liveInstances } = useActivePhase1();
const { data: deployment } = useDeployedProcessKeys();
const { data: liveCountsRaw } = useLivePhaseCounts();

const liveRows: PortfolioProject[] = (liveInstances ?? []).map(makePhase1Row);
const liveNrs = new Set(liveRows.map((r) => r.nr));
const allProjects = [...liveRows, ...getMockPortfolio().filter((p) => !liveNrs.has(p.nr))];

const deployedKeys = new Set(deployment?.deployedKeys ?? []);
const combinedCounts = combinePhaseCounts(
  getMockPhaseCounts(),
  normalizeLiveCounts(liveCountsRaw?.counts ?? {}, RIP_PHASES)
);

const mijnDagStats = mijnDagRailStats(liveTasks, getMockTodos(), allProjects);
const portfolioStageGroups = portfolioRailStageGroups(allProjects);
const portfolioTransitions = portfolioRailTransitions(allProjects);
const portfolioHealth = portfolioRailHealth(allProjects);
const beheerSubtitle = beheerRailSubtitle(combinedCounts);

// Per-phase badge/muted data for Beheer's existing phase <li> items,
// keyed by rail item id so the render below is a plain lookup.
const beheerBadges = new Map(
  RIP_PHASES.map((phase) => {
    const counts = combinedCounts[phase.code];
    return [
      phaseSectionId(phase.code),
      {
        count: phase.beyond ? undefined : (counts?.wip ?? 0),
        parkedCount: phase.beyond ? (counts?.geparkeerd ?? 0) : undefined,
        muted: getPhaseDeployStatus(phase, deployedKeys) !== 'gedeployed',
      },
    ] as const;
  })
);
```

- [ ] **Step 5: Rewrite the rail JSX**

Replace:

```tsx
<aside className="v2-rail" aria-label="Sectienavigatie">
  <div className="v2-rail-card">
    {currentMode.label}
    {mode === 'mijn-dag' && isAuth && (
      <span className="pb-rail-sub">Persoonlijk · {user?.name ?? user?.preferred_username}</span>
    )}
  </div>
  {visibleGroups.map((g, i) => (
    <div key={g.label || i} className="v2-rail-group">
      {g.label && <div className="v2-rail-group-label">{g.label}</div>}
      <ul className="v2-rail-list">
        {g.items.map((it) => (
          <li key={it.id}>
            <button
              type="button"
              className={`v2-rail-item ${activeSection === it.id && !openProject ? 'active' : ''}`}
              onClick={() => {
                setOpenProject(null);
                setActiveSection(it.id);
              }}
            >
              <span>{it.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  ))}
</aside>
```

with:

```tsx
<aside className="v2-rail" aria-label="Sectienavigatie">
  <div className="v2-rail-card">
    {currentMode.label}
    {mode === 'mijn-dag' && isAuth && (
      <span className="pb-rail-sub">Persoonlijk · {user?.name ?? user?.preferred_username}</span>
    )}
    {mode === 'portfolio' && (
      <span className="pb-rail-sub">{allProjects.length} projecten · venster 2022–2027</span>
    )}
    {mode === 'beheer' && <span className="pb-rail-sub">{beheerSubtitle}</span>}
  </div>

  {mode === 'mijn-dag' && (
    <div className="pb-rail-stats">
      {mijnDagStats.map((s) => (
        <div className="pb-rail-stat" key={s.label}>
          <span>
            {s.dotColor && <span className="dot" style={{ background: s.dotColor }} />}
            {s.label}
          </span>
          <b>{s.value}</b>
        </div>
      ))}
    </div>
  )}

  {mode === 'portfolio' && (
    <>
      {portfolioStageGroups.map(({ stage, phases }) => (
        <div className="v2-rail-group" key={stage.code}>
          <div className="v2-rail-group-label">
            <span className="pb-stage-dot" style={{ background: stage.color }} />
            {stage.code} · {stage.name}
          </div>
          <div className="pb-rail-stats">
            {phases.map(({ phase, count }) => (
              <div className="pb-rail-stat" key={phase.code}>
                <span>
                  <span className="pb-rail-code">{phase.code}</span>
                  {phase.name}
                </span>
                <b>{count}</b>
              </div>
            ))}
          </div>
        </div>
      ))}
      <div className="v2-rail-group">
        <div className="v2-rail-group-label">Overgangen</div>
        <div className="pb-rail-stats">
          {portfolioTransitions.map((s) => (
            <div className="pb-rail-stat" key={s.label}>
              <span>
                {s.dotColor && <span className="dot" style={{ background: s.dotColor }} />}
                {s.label}
              </span>
              <b>{s.value}</b>
            </div>
          ))}
        </div>
      </div>
      <div className="v2-rail-group">
        <div className="v2-rail-group-label">Gezondheid</div>
        <div className="pb-rail-stats">
          {portfolioHealth.map((s) => (
            <div className="pb-rail-stat" key={s.label}>
              <span>
                {s.dotColor && <span className="dot" style={{ background: s.dotColor }} />}
                {s.label}
              </span>
              <b>{s.value}</b>
            </div>
          ))}
        </div>
      </div>
    </>
  )}

  {visibleGroups.map((g, i) => (
    <div key={g.label || i} className="v2-rail-group">
      {g.label && <div className="v2-rail-group-label">{g.label}</div>}
      <ul className="v2-rail-list">
        {g.items.map((it) => {
          const badge = mode === 'beheer' ? beheerBadges.get(it.id) : undefined;
          const code = badge ? phaseCodeFromSectionId(it.id) : undefined;
          return (
            <li key={it.id}>
              <button
                type="button"
                className={`v2-rail-item ${activeSection === it.id && !openProject ? 'active' : ''} ${badge?.muted ? 'muted' : ''}`}
                onClick={() => {
                  setOpenProject(null);
                  setActiveSection(it.id);
                }}
              >
                <span>
                  {code && <span className="pb-rail-code">{code}</span>}
                  {it.label}
                </span>
                {badge?.count !== undefined && badge.count > 0 && (
                  <span className="pb-rail-badge">{badge.count}</span>
                )}
                {badge?.parkedCount !== undefined && badge.parkedCount > 0 && (
                  <span className="pb-rail-badge parked" title="Geparkeerd">
                    {badge.parkedCount}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  ))}
</aside>
```

- [ ] **Step 6: Add the CSS**

Append to `packages/frontend/src/pages/infra-board/dashboard-infra.css`:

```css
/* Rail phase-item code chip + badges — Beheer's phase nav items, and
   Portfolio's stage-grouped stat rows (rail-stats-panel spec). The base
   .cwd-v2 .v2-rail-item rule (dashboard-v2.css) is already display:flex;
   justify-content:space-between — no extra layout rule needed here, just
   the chip/badge/muted appearance. */
.pbd .pb-rail-code {
  font-family: var(--v2-mono);
  font-size: 10px;
  font-weight: 700;
  color: var(--v2-ink-3);
  margin-right: 8px;
  letter-spacing: 0.04em;
}
.pbd .v2-rail-item.active .pb-rail-code {
  color: inherit;
  opacity: 0.75;
}
.pbd .v2-rail-item.muted {
  opacity: 0.62;
}
.pbd .pb-rail-badge {
  font-family: var(--v2-mono);
  font-size: 10px;
  font-weight: 700;
  background: var(--pb-blue);
  color: #fff;
  padding: 1px 5px;
  min-width: 16px;
  text-align: center;
}
.pbd .pb-rail-badge.parked {
  background: #eceef1;
  color: var(--v2-ink-2);
  border: 1px solid var(--v2-rule);
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run (from `packages/frontend`): `npx vitest run src/pages/InfraBoardDashboard.test.tsx`
Expected: PASS, all 9 tests green (5 pre-existing + 4 new).

- [ ] **Step 8: Typecheck**

Run (from `packages/frontend`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 9: Run the full frontend test suite**

Run (from `packages/frontend`): `npx vitest run`
Expected: all tests pass — in particular
`src/pages/infra-board/modes.config.test.ts`,
`src/components/InfraBoardDashboard/Portfolio.test.tsx`,
`src/components/InfraBoardDashboard/FaseladderOverview.test.tsx` unaffected
by the phase-item label change (none assert the combined label string).

- [ ] **Step 10: Commit**

```bash
git add packages/frontend/src/pages/InfraBoardDashboard.tsx packages/frontend/src/pages/InfraBoardDashboard.test.tsx packages/frontend/src/pages/infra-board/dashboard-infra.css
git commit -m "feat: wire Mijn dag/Portfolio/Beheer rail stats into InfraBoardDashboard"
```

---

## Final verification

After Task 3: run the full suite once more from `packages/frontend`
(`npx vitest run && npx tsc --noEmit`), then hand off to
`superpowers:finishing-a-development-branch` for the merge-back menu into
`feat/rip-beheer-starten-tab`.
