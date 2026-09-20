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
  liveProjectName,
  liveProjectNumber,
  makeLivePhaseRow,
  normalizeLeadRole,
  TL,
} from './infra-board.data';
import { getKlaarCounts } from './rip-phase-counts';
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

describe('liveProjectName / liveProjectNumber', () => {
  it('keeps a real name and number', () => {
    expect(liveProjectName('Testweg', 'R2.1')).toBe('Testweg');
    expect(liveProjectNumber('24001', 'abcdefgh-1234')).toBe('24001');
  });

  it('names a nameless R2.1 instance by its state: intake not yet submitted', () => {
    expect(liveProjectName('', 'R2.1')).toBe('Nieuw R2.1-project · intake open');
    expect(liveProjectName(undefined, 'R2.1')).toBe('Nieuw R2.1-project · intake open');
  });

  it('keeps the generic fallback for a nameless instance of a later phase', () => {
    // Only R2.1 collects the name in its intake; a later phase inherits it.
    expect(liveProjectName('', 'R2.2')).toBe('RIP R2.2 project');
  });

  it('falls back to the instance id prefix for a missing number', () => {
    expect(liveProjectNumber('', 'abcdefgh-1234')).toBe('abcdefgh');
    expect(liveProjectNumber('—', 'abcdefgh-1234')).toBe('abcdefgh');
  });
});

describe('makeLivePhaseRow', () => {
  it('builds a live portfolio row anchored on the instance start quarter', () => {
    const row = makeLivePhaseRow(
      {
        id: 'abcdefgh-1234',
        startTime: '2024-04-15T00:00:00Z',
        projectNumber: '24099',
        projectName: 'Test project',
        leadRole: 'manager-pb',
      },
      'R2.1'
    );

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

  it('falls back to the instance id and a default name when nr/naam are blank', () => {
    const row = makeLivePhaseRow(
      {
        id: 'abcdefgh-1234',
        startTime: '2024-01-01T00:00:00Z',
        projectNumber: '',
        projectName: '',
      },
      'R2.1'
    );

    expect(row.nr).toBe('abcdefgh'); // first 8 chars of id
    // An R2.1 instance has no name until its intake form is submitted.
    expect(row.naam).toBe('Nieuw R2.1-project · intake open');
    expect(row.role).toBe('projectleider'); // normalizeLeadRole(undefined)
  });

  it('treats the placeholder an older backend sends for a missing value as missing', () => {
    // Before the backend stopped substituting it, a missing projectNumber or
    // projectName arrived as an em dash. The frontend and backend deploy
    // separately, so that value must still render as "no name yet".
    const row = makeLivePhaseRow(
      {
        id: 'abcdefgh-1234',
        startTime: '2024-01-01T00:00:00Z',
        projectNumber: '—',
        projectName: '—',
      },
      'R2.1'
    );

    expect(row.nr).toBe('abcdefgh');
    expect(row.naam).toBe('Nieuw R2.1-project · intake open');
  });

  it('marks earlier phases done and later ones todo for a mid-ladder phase', () => {
    // A live R2.2 instance means R2.1 is behind it -- the row must not claim
    // the project is still sitting in the first phase.
    const row = makeLivePhaseRow(
      {
        id: 'i-1',
        startTime: '2024-04-15T00:00:00Z',
        projectNumber: '24100',
        projectName: 'VO project',
      },
      'R2.2'
    );

    expect(row.ripPhaseCode).toBe('R2.2');
    expect(row.naam).toBe('VO project');
    expect(row.milestone).toBe('R2.2 lopend');
    expect(row.segments[0].status).toBe('done');
    expect(row.segments[1].status).toBe('active');
    expect(row.segments.slice(2).every((seg) => seg.status === 'todo')).toBe(true);
  });
});

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
      expect(counts[phase.code].wip).toBe(wipHere);

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

describe('getReadyProjects — phase re-entry (#69)', () => {
  /**
   * R5.3 is the one phase a project can legitimately complete more than once:
   * three of its four end events return to R5.2, and a vervroegde ingebruikname
   * puts part of the areaal into use while the work carries on, so the project
   * comes back through R5.2 and enters R5.3 again for the actual oplevering.
   *
   * #69 asks whether the Starten tab's readiness rule handles that. It does,
   * and the reason is worth pinning rather than rediscovering: the rule is
   * **positional and history-free**. It asks only where a project is now and
   * whether it is waiting there. It cannot be confused by a completed instance
   * because it never looks at one.
   *
   * That is a property of the current implementation, not a guarantee of the
   * design, which is exactly why it needs a test. The obvious "improvement" —
   * also excluding projects that have already completed this phase, which the
   * issue's own wording describes the rule as doing — would look like a
   * tightening and would silently strand every project in the R5.2 ↔ R5.3 loop.
   */
  it('reads only current position and state, for every phase in the ladder', () => {
    const portfolio = getMockPortfolio();

    for (let i = 1; i < RIP_PHASES.length; i++) {
      const phase = RIP_PHASES[i];
      const prevCode = RIP_PHASES[i - 1].code;
      const positional = portfolio.filter(
        (p) => p.ripPhaseCode === prevCode && p.ripPhaseState === 'wachtend'
      );

      expect(
        getReadyProjects(phase.code)
          .map((p) => p.id)
          .sort()
      ).toEqual(positional.map((p) => p.id).sort());
    }
  });

  it('offers R5.3 from R5.2 regardless of how often R5.3 has been completed', () => {
    // The identity above, stated for the phase the issue is about. It holds
    // whether or not the fixture currently has anyone sitting at R5.2: what is
    // asserted is that the rule adds no exclusion of its own beyond position
    // and state, which is the part a re-entering project depends on.
    const readyForR53 = getReadyProjects('R5.3');
    for (const p of readyForR53) {
      expect(p.ripPhaseCode).toBe('R5.2');
      expect(p.ripPhaseState).toBe('wachtend');
    }
    expect(readyForR53).toHaveLength(
      getMockPortfolio().filter((p) => p.ripPhaseCode === 'R5.2' && p.ripPhaseState === 'wachtend')
        .length
    );
  });

  it('suppresses R5.4s Klaar count without suppressing R5.4s readiness list', () => {
    // Two different surfaces, easy to conflate while fixing either.
    //
    // `multipleExits` on R5.3 makes getKlaarCounts refuse a figure for R5.4:
    // R5.3's flat `gereed` mixes four outcomes, only one of which advances, so
    // any subtraction would overstate R5.4's candidates.
    //
    // Readiness is not derived by subtraction — it reads each project's own
    // position — so it stays exact and must keep listing projects waiting at
    // R5.3. Whoever gives R5.4 a real Klaar figure back (issue #69, item 2)
    // should not reach for `multipleExits` here on the way past.
    const r53 = RIP_PHASES.find((p) => p.code === 'R5.3');
    expect(r53?.multipleExits).toBe(true);

    expect(getKlaarCounts(RIP_PHASES, getMockPhaseCounts())['R5.4']).toBeUndefined();

    const waitingAtR53 = getMockPortfolio().filter(
      (p) => p.ripPhaseCode === 'R5.3' && p.ripPhaseState === 'wachtend'
    );
    expect(waitingAtR53.length).toBeGreaterThan(0); // the fixture must keep exercising this
    expect(
      getReadyProjects('R5.4')
        .map((p) => p.id)
        .sort()
    ).toEqual(waitingAtR53.map((p) => p.id).sort());
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
      (p) => p.ripPhaseState === 'wip' && p.ripPhaseCode !== 'R5.3'
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

describe('getMockWipRows / getMockGereedRows / getMockGeparkeerdRows', () => {
  it('matches getMockPhaseCounts wip/gereed counts for every phase', () => {
    const counts = getMockPhaseCounts();
    for (const phase of RIP_PHASES) {
      expect(getMockWipRows(phase).length).toBe(counts[phase.code].wip);
      expect(getMockGereedRows(phase).length).toBe(counts[phase.code].gereed);
    }
  });

  it('returns wip rows for R5.3 like any other phase now that it is modelled', () => {
    const r53 = RIP_PHASES.find((p) => p.code === 'R5.3')!;
    const counts = getMockPhaseCounts();
    expect(getMockWipRows(r53).length).toBe(counts['R5.3'].wip);
  });

  it('reaches R5.4 and R6.1 — unreachable under the old legacy-bucket derivation', () => {
    const codes = new Set(getMockPortfolio().map((p) => p.ripPhaseCode));
    expect(codes.has('R5.4')).toBe(true);
    expect(codes.has('R6.1')).toBe(true);
  });
});
