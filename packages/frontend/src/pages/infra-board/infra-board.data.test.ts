import { describe, expect, it } from 'vitest';
import {
  getMockGereedRows,
  getMockPhaseCounts,
  getMockPhaseInstanceDetail,
  getMockPortfolio,
  getMockTodos,
  getMockUpdates,
  getMockWipRows,
  getOutOfSequenceProjects,
  getReadyProjects,
  makePhase1Row,
  normalizeLeadRole,
  PHASE_DUR,
  TL,
} from './infra-board.data';
import { PHASES } from './rip-model';
import { RIP_PHASES } from './rip-phases.catalog';

describe('normalizeLeadRole', () => {
  it('passes through a known rip-model role key unchanged', () => {
    expect(normalizeLeadRole('manager-pb')).toBe('manager-pb');
  });

  it('falls back to projectleider when the raw value is undefined', () => {
    expect(normalizeLeadRole(undefined)).toBe('projectleider');
  });

  it('falls back to projectleider for an unrecognised role key', () => {
    expect(normalizeLeadRole('not-a-real-role')).toBe('projectleider');
  });
});

describe('makePhase1Row', () => {
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

  it('falls back to the instance id and a default name when nr/naam are blank', () => {
    const row = makePhase1Row({
      id: 'abcdefgh-1234',
      startTime: '2024-01-01T00:00:00Z',
      projectNumber: '',
      projectName: '',
    });

    expect(row.nr).toBe('abcdefgh'); // first 8 chars of id
    expect(row.naam).toBe('RIP Fase 1 project');
    expect(row.role).toBe('projectleider'); // normalizeLeadRole(undefined)
  });
});

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

describe('getMockTodos', () => {
  it('buckets todos into vandaag/deze_week/volgende_week', () => {
    const todos = getMockTodos();

    expect(todos.vandaag.length).toBeGreaterThan(0);
    expect(todos.deze_week.length).toBeGreaterThan(0);
    expect(todos.volgende_week.length).toBeGreaterThan(0);
    expect(todos.vandaag.every((t) => t.prio === 'overdue')).toBe(true);
  });
});

describe('getMockUpdates', () => {
  it('returns the updates feed with the newest entry first', () => {
    const updates = getMockUpdates();
    expect(updates.length).toBeGreaterThan(0);
    expect(updates[0]).toMatchObject({ proj: '24011' });
  });
});

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

      // gereed = projects whose current ladder position is PAST this phase
      // (they've already completed it), not before it.
      const pastThisPhase = projects.filter(
        (p) => RIP_PHASES.findIndex((rp) => rp.code === p.ripPhaseCode) > i
      ).length;
      expect(counts[phase.code].gereed).toBe(pastThisPhase);
    });
  });
});

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
