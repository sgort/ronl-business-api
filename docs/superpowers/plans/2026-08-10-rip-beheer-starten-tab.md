# Beheer — Phase Detail, Starten Tab (Sub-project C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the phase-detail page (header, side panel, Starten tab) that
sub-project B's Faseladder overview rows and per-phase rail items link to,
folding today's single-button R2.1 flow in as its ready-list fallback.

**Architecture:** One new component, `PhaseDetail.tsx`, reusing sub-project
A's catalogue/deploy-status and sub-project B's counts/Klaar machinery
entirely as-is. Two small additive data-layer pieces feed it: a
`kredietBeslisser` catalogue field and two new project selectors
(`getReadyProjects`/`getOutOfSequenceProjects`). Router/rail wiring makes it
reachable; `RipFase1Section` (already orphaned by sub-project B's rail
rewrite) is retired since its behavior now lives inside `PhaseDetail`.

**Tech Stack:** TypeScript, React, Vitest, `@testing-library/react`.

## Global Constraints

- No new backend routes — the only real mutating action
  (`businessApi.process.start('RipPhase1Process', {})`) already exists.
- Every phase except R2.1 has its Starten checkboxes disabled today (not
  deployed) — the generic multi-select/sequence-guard/afwijkingsreden UI is
  built and tested against synthetic "what if this were deployed" state,
  since no real second deployed phase exists yet (spec: "Handoff package is
  authoritative", the `rip-beheer-validate-after-full-deploy` memory note).
- R2.1's ready-list is always empty (no predecessor) — when that's true
  **and** the phase has no predecessor, render the fallback single-button
  flow instead of an empty-list message.
- R5.2 (`beyond: true`) gets a short placeholder, not the tab shell — its
  real geparkeerd-list page is sub-project E.
- Idempotency: a `submitting` boolean guards every start action against
  double-submit. This is a frontend-only safeguard (documented limitation,
  not solved here — no backend idempotency key exists).
- Afwijkingsreden: any Beheer user, min. 4 characters, no extra role gate.
- Run all `npx vitest`/`npx jest` commands from the correct package
  directory (`packages/frontend` or `packages/backend`) — running from the
  repo root silently picks up the wrong config.

---

### Task 1: Catalogue — `kredietBeslisser`

**Files:**

- Modify: `packages/frontend/src/pages/infra-board/rip-phases.catalog.ts`
- Test: create `packages/frontend/src/pages/infra-board/rip-phases.catalog.test.ts`
  (none exists yet — check first: `test -f
packages/frontend/src/pages/infra-board/rip-phases.catalog.test.ts`)

**Interfaces:**

- Produces: `RipPhase.kredietBeslisser?: string`. Task 3's side panel reads
  it.

- [ ] **Step 1: Write the failing test**

  `rip-phases.catalog.test.ts` already exists and already imports
  `ripPhaseByCode` from `./rip-phases.catalog` (no import changes needed).
  Append this `describe` block to the end of the file:

  ```ts
  describe('kredietBeslisser', () => {
    it('is set for every phase with krediet: true', () => {
      expect(ripPhaseByCode('R2.3')?.kredietBeslisser).toBe('Infra-overleg');
      expect(ripPhaseByCode('R2.4')?.kredietBeslisser).toBe('Infra-overleg');
      expect(ripPhaseByCode('R3.2')?.kredietBeslisser).toBe('Infra-overleg');
      expect(ripPhaseByCode('R4.1')?.kredietBeslisser).toBe('Concerndirecteur');
    });

    it('is undefined for every phase with krediet: false', () => {
      for (const code of ['R2.1', 'R2.2', 'R3.1', 'R5.1', 'R5.2']) {
        expect(ripPhaseByCode(code)?.kredietBeslisser).toBeUndefined();
      }
    });
  });
  ```

- [ ] **Step 2: Run the test to verify it fails**

  Run (from `packages/frontend`):
  `npx vitest run src/pages/infra-board/rip-phases.catalog.test.ts`

  Expected: FAIL — `kredietBeslisser` is `undefined` for R2.3/R2.4/R3.2/R4.1
  too (the field doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

  In `rip-phases.catalog.ts`, add the field to the `RipPhase` interface,
  after `krediet: boolean;`:

  ```ts
    krediet: boolean;
    /** Named body that decides the kredietbesluit, shown when krediet is
     *  true (e.g. "Ja — Infra-overleg"). Undefined when krediet is false. */
    kredietBeslisser?: string;
  ```

  Then add `kredietBeslisser` to the four phases that have `krediet: true`
  in the `CONTENT` array — for R2.3, R2.4, R3.2, add `kredietBeslisser:
'Infra-overleg',` immediately after their `krediet: true,` line; for
  R4.1, add `kredietBeslisser: 'Concerndirecteur',` after its `krediet:
true,` line. Do not add the field to any other phase (leave it absent,
  not `undefined`, for the five `krediet: false` phases).

- [ ] **Step 4: Run the test to verify it passes**

  Same command as Step 2. Expected: PASS (2 tests).

- [ ] **Step 5: Run the full frontend suite to confirm no regressions**

  Run (from `packages/frontend`): `npx vitest run`

  Expected: PASS, all test files (adding an optional field doesn't change
  any existing catalogue entry's other fields).

- [ ] **Step 6: Commit**

  ```bash
  git add packages/frontend/src/pages/infra-board/rip-phases.catalog.ts packages/frontend/src/pages/infra-board/rip-phases.catalog.test.ts
  git commit -m "feat(frontend): add kredietBeslisser to the RIP phase catalogue"
  ```

---

### Task 2: Data layer — ready-list + sequence-guard selectors

**Files:**

- Modify: `packages/frontend/src/pages/infra-board/infra-board.data.ts`
- Modify: `packages/frontend/src/pages/infra-board/infra-board.data.test.ts`

**Interfaces:**

- Consumes: `RIP_PHASES` (already imported in this file); `PortfolioProject`,
  `getMockPortfolio` (already in this file).
- Produces: `getReadyProjects(phaseCode: string): PortfolioProject[]`,
  `getOutOfSequenceProjects(phaseCode: string): PortfolioProject[]`. Task 3
  imports both.

- [ ] **Step 1: Write the failing tests**

  Add to `infra-board.data.test.ts` (append a new `describe` block after
  the existing `describe('getMockPhaseCounts', ...)` block):

  ```ts
  describe('getReadyProjects / getOutOfSequenceProjects', () => {
    it('are both empty for the first phase in ladder order (no predecessor)', () => {
      expect(getReadyProjects(RIP_PHASES[0].code)).toEqual([]);
      expect(getOutOfSequenceProjects(RIP_PHASES[0].code)).toEqual([]);
    });

    it('ready = projects at the predecessor phase with state wachtend', () => {
      const phase = RIP_PHASES[1]; // R2.2
      const ready = getReadyProjects(phase.code);
      const prevCode = RIP_PHASES[0].code;
      for (const p of ready) {
        expect(p.ripPhaseCode).toBe(prevCode);
        expect(p.ripPhaseState).toBe('wachtend');
      }
      // and nothing eligible was left out
      const allEligible = getMockPortfolio().filter(
        (p) => p.ripPhaseCode === prevCode && p.ripPhaseState === 'wachtend'
      );
      expect(ready).toHaveLength(allEligible.length);
    });

    it('out-of-sequence = projects that have not passed the predecessor, excluding ready', () => {
      const phase = RIP_PHASES[2]; // R2.3
      const idx = 2;
      const ready = getReadyProjects(phase.code);
      const readyIds = new Set(ready.map((p) => p.id));
      const outOfSequence = getOutOfSequenceProjects(phase.code);

      for (const p of outOfSequence) {
        expect(readyIds.has(p.id)).toBe(false);
        const curIdx = RIP_PHASES.findIndex((rp) => rp.code === p.ripPhaseCode);
        expect(curIdx).toBeLessThan(idx);
      }

      // every project either at-or-past this phase, ready, or out-of-sequence — no one lost
      const projects = getMockPortfolio();
      const outIds = new Set(outOfSequence.map((p) => p.id));
      for (const p of projects) {
        const curIdx = RIP_PHASES.findIndex((rp) => rp.code === p.ripPhaseCode);
        if (curIdx >= idx) continue; // at or past this phase — not a candidate at all
        expect(readyIds.has(p.id) || outIds.has(p.id)).toBe(true);
      }
    });
  });
  ```

  Add `getOutOfSequenceProjects, getReadyProjects` to the existing
  `import { ... } from './infra-board.data';` line at the top of the file.

- [ ] **Step 2: Run the tests to verify they fail**

  Run (from `packages/frontend`):
  `npx vitest run src/pages/infra-board/infra-board.data.test.ts -t "getReadyProjects"`

  Expected: FAIL — `getReadyProjects is not a function`.

- [ ] **Step 3: Write minimal implementation**

  In `infra-board.data.ts`, add after `getMockPhaseCounts`:

  ```ts
  /**
   * Projects whose current ladder position is exactly this phase's
   * predecessor, sitting in 'wachtend' (previous phase accorded, this one
   * not yet started). Always empty for the first phase in ladder order —
   * there is no predecessor to be ready from.
   */
  export function getReadyProjects(phaseCode: string): PortfolioProject[] {
    const idx = RIP_PHASES.findIndex((p) => p.code === phaseCode);
    if (idx <= 0) return [];
    const prevCode = RIP_PHASES[idx - 1].code;
    return getMockPortfolio().filter(
      (p) => p.ripPhaseCode === prevCode && p.ripPhaseState === 'wachtend'
    );
  }

  /**
   * Projects not yet in sequence for this phase — still working an earlier
   * phase, or still 'wip' on the immediate predecessor (not yet accorded).
   * These are the "Toon N projecten die nog niet aan beurt zijn" set.
   */
  export function getOutOfSequenceProjects(phaseCode: string): PortfolioProject[] {
    const idx = RIP_PHASES.findIndex((p) => p.code === phaseCode);
    if (idx <= 0) return [];
    const ready = new Set(getReadyProjects(phaseCode).map((p) => p.id));
    return getMockPortfolio().filter((p) => {
      if (ready.has(p.id)) return false;
      const curIdx = RIP_PHASES.findIndex((rp) => rp.code === p.ripPhaseCode);
      return curIdx < idx;
    });
  }
  ```

- [ ] **Step 4: Run the tests to verify they pass**

  Run (from `packages/frontend`):
  `npx vitest run src/pages/infra-board/infra-board.data.test.ts -t "getReadyProjects"`

  Expected: PASS (3 tests).

- [ ] **Step 5: Run the full file to confirm no regressions**

  Run (from `packages/frontend`):
  `npx vitest run src/pages/infra-board/infra-board.data.test.ts`

  Expected: PASS, all tests.

- [ ] **Step 6: Commit**

  ```bash
  git add packages/frontend/src/pages/infra-board/infra-board.data.ts packages/frontend/src/pages/infra-board/infra-board.data.test.ts
  git commit -m "feat(frontend): add getReadyProjects/getOutOfSequenceProjects selectors"
  ```

---

### Task 3: `PhaseDetail.tsx` — header, side panel, Starten tab

**Files:**

- Create: `packages/frontend/src/components/InfraBoardDashboard/PhaseDetail.tsx`
- Create: `packages/frontend/src/components/InfraBoardDashboard/PhaseDetail.test.tsx`
- Modify: `packages/frontend/src/pages/infra-board/dashboard-infra.css` (new
  styles)
- Delete: `packages/frontend/src/components/CaseworkerDashboard/RipFase1Section.tsx`
  and `packages/frontend/src/components/CaseworkerDashboard/RipFase1Section.test.tsx`
  (this component's single rail item was already removed in sub-project B's
  Task 7 — it's unreferenced dead code; its behavior is folded into this
  task's R2.1 fallback)

**Interfaces:**

- Consumes: `ripPhaseByCode`, `RIP_PHASES`, `RIP_STAGES`, `RIP_DEPLOY_META`,
  `getPhaseDeployStatus` (sub-project A); `getMockPhaseCounts`,
  `getReadyProjects`, `getOutOfSequenceProjects` (Task 2, sub-project B);
  `combinePhaseCounts`, `getKlaarCounts`, `normalizeLiveCounts` (sub-project
  B); `useDeployedProcessKeys`, `useLivePhaseCounts` (sub-project A/B);
  `businessApi.process.start` (existing).
- Produces: `export default function PhaseDetail({ phaseCode, onBack }:
{ phaseCode: string; onBack: () => void }): JSX.Element`. Task 4 renders
  `<PhaseDetail phaseCode={...} onBack={...} />` from the router.

- [ ] **Step 1: Write the failing test**

  Create `PhaseDetail.test.tsx`:

  ```tsx
  // @vitest-environment jsdom
  import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
  import { render, screen, within } from '@testing-library/react';
  import userEvent from '@testing-library/user-event';
  import PhaseDetail from './PhaseDetail';
  import { ripPhaseByCode } from '../../pages/infra-board/rip-phases.catalog';
  import {
    getReadyProjects,
    getOutOfSequenceProjects,
  } from '../../pages/infra-board/infra-board.data';

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

  // getPhaseDeployStatus is overridden per-test so the Starten tab's
  // enabled/disabled behavior can be exercised for a phase other than
  // R2.1 — no other phase has a real processDefinitionKey today, so this
  // is the only way to test the "deployed, non-first phase" path at all.
  const mockGetPhaseDeployStatus = vi.hoisted(() => vi.fn());
  vi.mock('../../pages/infra-board/rip-phases.catalog', async (importOriginal) => {
    const actual =
      await importOriginal<typeof import('../../pages/infra-board/rip-phases.catalog')>();
    return { ...actual, getPhaseDeployStatus: mockGetPhaseDeployStatus };
  });

  const mockStart = vi.hoisted(() => vi.fn());
  vi.mock('../../services/api', () => ({
    businessApi: { process: { start: mockStart } },
  }));

  beforeEach(() => {
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
    mockGetPhaseDeployStatus.mockImplementation((phase: { code: string }) =>
      phase.code === 'R2.1' ? 'gedeployed' : 'ontwerp'
    );
    mockStart.mockResolvedValue({ success: true, data: { processInstanceId: 'pi-1' } });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('PhaseDetail — header and side panel', () => {
    it('renders the header meta strip and side panel figures from the catalogue', () => {
      render(<PhaseDetail phaseCode="R2.3" onBack={vi.fn()} />);
      const phase = ripPhaseByCode('R2.3')!;
      expect(screen.getByText(phase.entry, { exact: false })).toBeInTheDocument();
      expect(screen.getByText(phase.exit, { exact: false })).toBeInTheDocument();
      expect(screen.getByText(phase.lead, { exact: false })).toBeInTheDocument();
      expect(screen.getByText(String(phase.roles.length), { exact: false })).toBeInTheDocument();
      expect(screen.getByText(`${phase.weeks} weken`, { exact: false })).toBeInTheDocument();
      expect(screen.getByText(String(phase.gates.length), { exact: false })).toBeInTheDocument();
      expect(screen.getByText('Ja — Infra-overleg', { exact: false })).toBeInTheDocument();
      expect(screen.getByText(phase.bron, { exact: false })).toBeInTheDocument();
    });

    it('shows "Nee" for kredietbesluit when the phase has none', () => {
      render(<PhaseDetail phaseCode="R2.1" onBack={vi.fn()} />);
      expect(screen.getByText('Nee', { exact: false })).toBeInTheDocument();
    });
  });

  describe('PhaseDetail — R5.2 (beyond)', () => {
    it('renders a placeholder instead of the tab shell', () => {
      render(<PhaseDetail phaseCode="R5.2" onBack={vi.fn()} />);
      expect(screen.queryByText('Starten')).not.toBeInTheDocument();
      expect(screen.queryByText('WIP')).not.toBeInTheDocument();
      expect(screen.getByText('Niet gemodelleerd', { exact: false })).toBeInTheDocument();
    });
  });

  describe('PhaseDetail — Starten tab, R2.1 fallback', () => {
    it('shows the single-button fallback when the ready-list is empty and there is no predecessor', () => {
      render(<PhaseDetail phaseCode="R2.1" onBack={vi.fn()} />);
      expect(getReadyProjects('R2.1')).toEqual([]);
      expect(screen.getByRole('button', { name: 'R2.1 starten' })).toBeInTheDocument();
    });

    it('starts RipPhase1Process on click and shows success', async () => {
      const user = userEvent.setup();
      render(<PhaseDetail phaseCode="R2.1" onBack={vi.fn()} />);

      await user.click(screen.getByRole('button', { name: 'R2.1 starten' }));

      expect(mockStart).toHaveBeenCalledWith('RipPhase1Process', {});
      expect(await screen.findByText('R2.1 gestart', { exact: false })).toBeInTheDocument();
    });

    it('guards against double-submit', async () => {
      const user = userEvent.setup();
      render(<PhaseDetail phaseCode="R2.1" onBack={vi.fn()} />);

      const button = screen.getByRole('button', { name: 'R2.1 starten' });
      await user.dblClick(button);

      expect(mockStart).toHaveBeenCalledTimes(1);
    });

    it('shows the error detail on failure', async () => {
      mockStart.mockResolvedValue({
        success: false,
        error: { details: 'Proces niet gevonden', instance: 'http://localhost:8081' },
      });
      const user = userEvent.setup();
      render(<PhaseDetail phaseCode="R2.1" onBack={vi.fn()} />);

      await user.click(screen.getByRole('button', { name: 'R2.1 starten' }));

      expect(await screen.findByText('Proces niet gevonden')).toBeInTheDocument();
    });
  });

  describe('PhaseDetail — Starten tab, undeployed phase', () => {
    it('shows the not-deployed banner with the ready-count and disables checkboxes', () => {
      render(<PhaseDetail phaseCode="R2.3" onBack={vi.fn()} />);
      const readyCount = getReadyProjects('R2.3').length;
      expect(
        screen.getByText(`Er staan wel ${readyCount} projecten klaar voor deze fase.`, {
          exact: false,
        })
      ).toBeInTheDocument();
      const checkboxes = screen.getAllByRole('checkbox');
      expect(checkboxes.length).toBeGreaterThan(0);
      checkboxes.forEach((cb) => expect(cb).toBeDisabled());
    });
  });

  describe('PhaseDetail — Starten tab, deployed phase with ready projects', () => {
    beforeEach(() => {
      mockGetPhaseDeployStatus.mockReturnValue('gedeployed');
    });

    it('enables checkboxes and the start button once a ready project is selected', async () => {
      const user = userEvent.setup();
      render(<PhaseDetail phaseCode="R2.2" onBack={vi.fn()} />);

      const ready = getReadyProjects('R2.2');
      expect(ready.length).toBeGreaterThan(0);

      const startButton = screen.getByRole('button', { name: 'R2.2 starten' });
      expect(startButton).toBeDisabled();

      const firstCheckbox = screen.getAllByRole('checkbox')[0];
      expect(firstCheckbox).not.toBeDisabled();
      await user.click(firstCheckbox);

      expect(startButton).not.toBeDisabled();
    });

    it('reveals out-of-sequence projects and requires an afwijkingsreden before their checkbox enables', async () => {
      const user = userEvent.setup();
      render(<PhaseDetail phaseCode="R2.2" onBack={vi.fn()} />);

      const outOfSequence = getOutOfSequenceProjects('R2.2');
      expect(outOfSequence.length).toBeGreaterThan(0);

      await user.click(
        screen.getByText(`Toon ${outOfSequence.length} projecten`, { exact: false })
      );

      // Scope both queries to the same row (by the first out-of-sequence
      // project's own <li>) — with more than one out-of-sequence project,
      // picking the reason input and checkbox independently could pair up
      // two different projects' elements.
      const reasonInput = screen.getAllByLabelText('Afwijkingsreden')[0];
      const row = reasonInput.closest('li')!;
      const outOfSequenceCheckbox = within(row).getByRole('checkbox');
      expect(outOfSequenceCheckbox).toBeDisabled();

      await user.type(reasonInput, 'ab');
      expect(outOfSequenceCheckbox).toBeDisabled();

      await user.type(reasonInput, 'cd');
      expect(outOfSequenceCheckbox).not.toBeDisabled();
    });
  });
  ```

- [ ] **Step 2: Run the test to verify it fails**

  Run (from `packages/frontend`):
  `npx vitest run src/components/InfraBoardDashboard/PhaseDetail.test.tsx`

  Expected: FAIL — module `./PhaseDetail` does not exist.

- [ ] **Step 3: Write minimal implementation**

  Create `PhaseDetail.tsx`:

  ```tsx
  import { useState } from 'react';
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
  } from '../../pages/infra-board/infra-board.data';
  import {
    combinePhaseCounts,
    getKlaarCounts,
    normalizeLiveCounts,
  } from '../../pages/infra-board/rip-phase-counts';
  import { useDeployedProcessKeys, useLivePhaseCounts } from '../../services/infra.api';
  import { businessApi } from '../../services/api';

  interface Props {
    phaseCode: string;
    onBack: () => void;
  }

  interface StartError {
    cause?: string;
    instance?: string;
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
      } finally {
        setSubmitting(false);
      }
    }

    async function handleFallbackStart() {
      setSubmitting(true);
      setFallbackError(null);
      try {
        const res = await businessApi.process.start('RipPhase1Process', {});
        if (res.success) setFallbackStarted(true);
        else setFallbackError({ cause: res.error?.details, instance: res.error?.instance });
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
          <p className="pb-placeholder">WIP-overzicht wordt gebouwd in een volgend deelproject.</p>
        )}
        {tab === 'gereed' && (
          <p className="pb-placeholder">
            Gereed-overzicht wordt gebouwd in een volgend deelproject.
          </p>
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
                    <button type="button" disabled={submitting} onClick={handleFallbackStart}>
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
                    disabled={!canStart || selected.size === 0 || submitting}
                    onClick={handleStartSelected}
                  >
                    {phase.code} starten
                  </button>{' '}
                  {outOfSequenceProjects.length > 0 && !showOutOfSequence && (
                    <button type="button" onClick={() => setShowOutOfSequence(true)}>
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

  Then delete the two retired files:

  ```bash
  git rm packages/frontend/src/components/CaseworkerDashboard/RipFase1Section.tsx packages/frontend/src/components/CaseworkerDashboard/RipFase1Section.test.tsx
  ```

- [ ] **Step 4: Run the test to verify it passes**

  Run (from `packages/frontend`):
  `npx vitest run src/components/InfraBoardDashboard/PhaseDetail.test.tsx`

  Expected: PASS (11 tests).

- [ ] **Step 5: Add CSS**

  Append to `packages/frontend/src/pages/infra-board/dashboard-infra.css`,
  following the file's existing `.pbd .pb-*` conventions:

  ```css
  .pbd .pb-back-link {
    display: inline-block;
    margin-bottom: 10px;
    background: none;
    border: none;
    color: var(--v2-accent);
    cursor: pointer;
    font-size: 13px;
    padding: 0;
  }
  .pbd .pb-phase-chip {
    display: inline-block;
    padding: 2px 8px;
    background: var(--v2-chrome);
    color: #fff;
    font-family: var(--v2-mono);
    font-size: 13px;
    border-radius: 3px;
    vertical-align: middle;
  }
  .pbd .pb-meta-strip {
    display: flex;
    gap: 24px;
    border: 1px solid var(--v2-rule);
    padding: 12px 16px;
    margin: 14px 0 20px;
  }
  .pbd .pb-meta-strip > div {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .pbd .pb-meta-strip .l {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--v2-ink-3);
  }
  .pbd .pb-meta-strip .v {
    font-size: 13px;
    color: var(--v2-ink);
  }
  .pbd .pb-tabs {
    display: flex;
    gap: 4px;
    border-bottom: 1px solid var(--v2-rule);
    margin-bottom: 16px;
  }
  .pbd .pb-tabs button {
    background: none;
    border: none;
    padding: 8px 14px;
    cursor: pointer;
    font-size: 13px;
    border-bottom: 2px solid transparent;
  }
  .pbd .pb-tabs button.active {
    border-bottom-color: var(--v2-accent);
    font-weight: 600;
  }
  .pbd .pb-tab-badge {
    display: inline-block;
    margin-left: 4px;
    padding: 0 6px;
    background: var(--v2-bg);
    border-radius: 8px;
    font-size: 11px;
  }
  .pbd .pb-starten-layout {
    display: grid;
    grid-template-columns: 1fr 300px;
    gap: 24px;
  }
  .pbd .pb-ready-list {
    list-style: none;
    padding: 0;
    margin: 12px 0;
  }
  .pbd .pb-ready-list li {
    padding: 10px 0;
    border-bottom: 1px solid var(--v2-rule);
  }
  .pbd .pb-badge-klaar {
    margin-left: 8px;
    padding: 1px 6px;
    background: #e7f6e8;
    color: #3fa535;
    font-size: 11px;
    border-radius: 3px;
  }
  .pbd .pb-badge-afwijking {
    margin-left: 8px;
    padding: 1px 6px;
    background: #fdf0e0;
    color: #b85c00;
    font-size: 11px;
    border-radius: 3px;
  }
  .pbd .pb-ready-list .sub {
    font-size: 12px;
    color: var(--v2-ink-3);
    margin-top: 4px;
  }
  .pbd .pb-side-panel {
    border: 1px solid var(--v2-rule);
    padding: 16px;
  }
  .pbd .pb-banner {
    padding: 10px 14px;
    background: #fdf6e3;
    border: 1px solid #e5b700;
    margin-bottom: 14px;
    font-size: 13px;
  }
  .pbd .pb-banner-success {
    background: #e7f6e8;
    border-color: #3fa535;
  }
  .pbd .pb-banner-error {
    background: #fdeceb;
    border-color: #b0103c;
  }
  .pbd .pb-placeholder {
    color: var(--v2-ink-3);
    font-style: italic;
  }
  ```

  No test needed for CSS (visual-only, per this project's established
  convention from sub-project B's Task 6).

- [ ] **Step 6: Run the full frontend suite to confirm no regressions**

  Run (from `packages/frontend`): `npx vitest run`

  Expected: PASS, all remaining test files (the two `RipFase1Section.*`
  files are gone, so their tests no longer run — every other file is
  unaffected).

- [ ] **Step 7: Commit**

  ```bash
  git add packages/frontend/src/components/InfraBoardDashboard/PhaseDetail.tsx packages/frontend/src/components/InfraBoardDashboard/PhaseDetail.test.tsx packages/frontend/src/pages/infra-board/dashboard-infra.css
  git commit -m "feat(frontend): add PhaseDetail header, side panel, and Starten tab; retire RipFase1Section"
  ```

---

### Task 4: Router, rail, and Faseladder row-click wiring

**Files:**

- Modify: `packages/frontend/src/pages/infra-board/modes.config.ts`
- Modify: `packages/frontend/src/components/InfraBoardDashboard/InfraSectionRouter.tsx`
- Modify: `packages/frontend/src/pages/InfraBoardDashboard.tsx`
- Modify: `packages/frontend/src/components/InfraBoardDashboard/FaseladderOverview.tsx`
- Test: `packages/frontend/src/pages/infra-board/modes.config.test.ts`
- Test: `packages/frontend/src/components/InfraBoardDashboard/InfraSectionRouter.test.tsx`
- Test: `packages/frontend/src/components/InfraBoardDashboard/FaseladderOverview.test.tsx`

**Interfaces:**

- Consumes: `PhaseDetail` (Task 3).
- Produces: `phaseSectionId(code): string`, `phaseCodeFromSectionId(id):
string | undefined` in `modes.config.ts`; `fase-*` rail ids and
  Faseladder table rows both navigate to `PhaseDetail` for their specific
  phase.

- [ ] **Step 1: Write the failing tests**

  `modes.config.test.ts` already exists with this import at the top:

  ```ts
  import { describe, expect, it } from 'vitest';
  import {
    findModeForSection,
    INFRA_GATE_ROLE,
    isRailItemVisible,
    type InfraRailItem,
  } from './modes.config';
  ```

  Change it to add the two new functions, plus a second import line for
  `RIP_PHASES`:

  ```ts
  import { describe, expect, it } from 'vitest';
  import {
    findModeForSection,
    INFRA_GATE_ROLE,
    isRailItemVisible,
    phaseCodeFromSectionId,
    phaseSectionId,
    type InfraRailItem,
  } from './modes.config';
  import { RIP_PHASES } from './rip-phases.catalog';
  ```

  Then append this `describe` block to the end of the file:

  ```ts
  describe('phaseSectionId / phaseCodeFromSectionId', () => {
    it('round-trips every phase code', () => {
      for (const p of RIP_PHASES) {
        expect(phaseCodeFromSectionId(phaseSectionId(p.code))).toBe(p.code);
      }
    });

    it('returns undefined for a non-phase section id', () => {
      expect(phaseCodeFromSectionId('archief')).toBeUndefined();
    });
  });
  ```

  In `InfraSectionRouter.test.tsx`:
  1. Replace `vi.mock('./FaseladderOverview', ...)` mock's neighbor — add a
     new mock for `PhaseDetail`:

     ```ts
     const mockPhaseDetail = vi.hoisted(() => vi.fn());
     vi.mock('./PhaseDetail', () => ({
       default: (props: never) => {
         mockPhaseDetail(props);
         return <div>phase-detail</div>;
       },
     }));
     ```

  2. Add a test asserting a `fase-*` section id renders `PhaseDetail` with
     the right `phaseCode`:

     ```ts
     it('a fase-* section renders PhaseDetail with the matching phase code', () => {
       render(<InfraSectionRouter {...baseProps} mode="beheer" section="fase-r2-1" />);
       expect(screen.getByText('phase-detail')).toBeInTheDocument();
       expect(mockPhaseDetail).toHaveBeenCalledWith(
         expect.objectContaining({ phaseCode: 'R2.1' })
       );
     });
     ```

     Remove the earlier `['fase-r2-1', 'faseladder']` row from the
     `it.each([...])` table (from sub-project B's Task 7) — that behavior
     is superseded by this test.

  In `FaseladderOverview.test.tsx`, replace the existing "does not render
  table rows as clickable" test:

  ```tsx
  it('calls onOpenPhase with the phase code when a row is clicked', async () => {
    const onOpenPhase = vi.fn();
    const user = userEvent.setup();
    render(<FaseladderOverview onOpenPhase={onOpenPhase} />);

    await user.click(screen.getByText('R2.1', { exact: false }));

    expect(onOpenPhase).toHaveBeenCalledWith('R2.1');
  });
  ```

  (add `import userEvent from '@testing-library/user-event';` and update
  every `render(<FaseladderOverview />)` call in this file to
  `render(<FaseladderOverview onOpenPhase={vi.fn()} />)` since the prop
  becomes required.)

- [ ] **Step 2: Run the tests to verify they fail**

  Run (from `packages/frontend`):

  ```
  npx vitest run src/pages/infra-board/modes.config.test.ts -t "phaseSectionId"
  npx vitest run src/components/InfraBoardDashboard/InfraSectionRouter.test.tsx -t "fase-"
  npx vitest run src/components/InfraBoardDashboard/FaseladderOverview.test.tsx -t "onOpenPhase"
  ```

  Expected: all FAIL.

- [ ] **Step 3: Write minimal implementation**

  In `modes.config.ts`, add after `findModeForSection`:

  ```ts
  export function phaseSectionId(code: string): string {
    return `fase-${code.toLowerCase().replace('.', '-')}`;
  }

  export function phaseCodeFromSectionId(id: string): string | undefined {
    return RIP_PHASES.find((p) => phaseSectionId(p.code) === id)?.code;
  }
  ```

  and use `phaseSectionId(p.code)` in place of the existing inline
  `` `fase-${p.code.toLowerCase().replace('.', '-')}` `` in the rail item
  builder (same file, `beheer` mode's "Projecten" group), so both sides
  share one implementation.

  In `InfraSectionRouter.tsx`:
  1. Add the import: `import PhaseDetail from './PhaseDetail';` and
     `import { phaseCodeFromSectionId } from '../../pages/infra-board/modes.config';`
  2. Add `onBack: () => void` is already a prop (used by `ProjectDetail`) —
     reuse `p.onBack` for `PhaseDetail`'s back button too (it already
     resets `openProject`, and since `PhaseDetail` isn't gated by
     `openProject`, navigate back to the Faseladder section explicitly via
     a new prop instead — see Step 3's `InfraBoardDashboard.tsx` change).
     Add `onOpenPhase: (phaseCode: string) => void` and
     `onBackToFaseladder: () => void` to `Props`.
  3. Replace the `faseladder`/`fase-` normalization block:

     ```ts
     const phaseCode = section.startsWith('fase-') ? phaseCodeFromSectionId(section) : undefined;
     let content: React.ReactNode;
     if (phaseCode) {
       content = <PhaseDetail phaseCode={phaseCode} onBack={p.onBackToFaseladder} />;
     } else {
       switch (section) {
         case 'profiel':
           content = <ProfielSection user={user} tenantConfig={tenantConfig} showManualFetch={false} />;
           break;
         case 'rollen':
           content = <RollenSection user={user} />;
           break;
         case 'faseladder':
           content = <FaseladderOverview onOpenPhase={p.onOpenPhase} />;
           break;
         case 'archief':
           content = <ArchiefSection boardId="infra-board" allowProcessKeys={INFRA_PROCESS_KEYS} />;
           break;
         case 'iou-gebruiksscenario':
           content = <IouGebruiksscenarioSection />;
           break;
         case 'iou-feedback':
           content = <IouFeedbackSection />;
           break;
         case 'iou-actieve-zaken':
           content = <IouZakenSection state="opened" />;
           break;
         case 'iou-archief':
           content = <IouZakenSection state="closed" />;
           break;
         case 'gereedschap-overzicht':
           content = <GereedschapSection user={user} />;
           break;
         default:
           content = <ProfielSection user={user} tenantConfig={tenantConfig} showManualFetch={false} />;
       }
     }
     ```

     (Remove the old `const normalizedSection = ...` line and the
     `switch (normalizedSection)` header — replaced by the `if (phaseCode)`
     branch above. Keep every unrelated `case` exactly as it was.)

  In `InfraBoardDashboard.tsx`, this existing import block already pulls
  from the same module:

  ```tsx
  import {
    INFRA_MODES,
    INFRA_GATE_ROLE,
    findModeForSection,
    isRailItemVisible,
    type InfraModeId,
  } from './infra-board/modes.config';
  ```

  Add `phaseSectionId` to it:

  ```tsx
  import {
    INFRA_MODES,
    INFRA_GATE_ROLE,
    findModeForSection,
    isRailItemVisible,
    phaseSectionId,
    type InfraModeId,
  } from './infra-board/modes.config';
  ```

  Then pass the two new props to `<InfraSectionRouter ... />` (alongside
  the existing `onOpenProject`, `onBack`, `onGotoPortfolio`):

  ```tsx
  onOpenPhase={(code) => setActiveSection(phaseSectionId(code))}
  onBackToFaseladder={() => setActiveSection('faseladder')}
  ```

  In `FaseladderOverview.tsx`:
  1. Add `interface Props { onOpenPhase: (phaseCode: string) => void; }` and
     change the component signature to
     `export default function FaseladderOverview({ onOpenPhase }: Props) {`.
  2. Make each phase `<tr>` clickable:

     ```tsx
     <tr key={phase.code} onClick={() => onOpenPhase(phase.code)} style={{ cursor: 'pointer' }}>
     ```

- [ ] **Step 4: Run the tests to verify they pass**

  Same three commands as Step 2. Expected: all PASS.

- [ ] **Step 5: Run the full frontend suite to confirm no regressions**

  Run (from `packages/frontend`): `npx vitest run`

  Expected: PASS, all test files.

- [ ] **Step 6: Commit**

  ```bash
  git add packages/frontend/src/pages/infra-board/modes.config.ts packages/frontend/src/pages/infra-board/modes.config.test.ts packages/frontend/src/components/InfraBoardDashboard/InfraSectionRouter.tsx packages/frontend/src/components/InfraBoardDashboard/InfraSectionRouter.test.tsx packages/frontend/src/pages/InfraBoardDashboard.tsx packages/frontend/src/components/InfraBoardDashboard/FaseladderOverview.tsx packages/frontend/src/components/InfraBoardDashboard/FaseladderOverview.test.tsx
  git commit -m "feat(frontend): wire PhaseDetail into rail, router, and Faseladder row clicks"
  ```
