// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Task } from '@ronl/shared';
import {
  mijnDagRailStats,
  portfolioRailStageGroups,
  portfolioRailTransitions,
  portfolioRailHealth,
  beheerRailSubtitle,
  beheerRailPhaseGroups,
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

describe('beheerRailPhaseGroups', () => {
  it('returns one entry per RIP_STAGES, in order, each carrying only its own phases', () => {
    const groups = beheerRailPhaseGroups({}, new Set());
    expect(groups.map((g) => g.stage.code)).toEqual(RIP_STAGES.map((s) => s.code));
    groups.forEach((g) => {
      g.phases.forEach(({ phase }) => expect(phase.stage).toBe(g.stage.code));
    });
  });

  it('gives every non-beyond phase a count (0 if absent from combined) and no parkedCount', () => {
    const groups = beheerRailPhaseGroups({}, new Set());
    const allPhases = groups.flatMap((g) => g.phases);
    allPhases
      .filter((p) => !p.phase.beyond)
      .forEach((p) => {
        expect(p.count).toBe(0);
        expect(p.parkedCount).toBeUndefined();
      });
  });

  it('gives the one beyond phase (R5.3) a parkedCount and no count', () => {
    const combined: Record<string, AnnotatedPhaseCounts> = {
      'R5.3': { wip: 0, gereed: 0, geparkeerd: 4, liveWip: 0, liveGereed: 0, liveGeparkeerd: 0 },
    };
    const groups = beheerRailPhaseGroups(combined, new Set());
    const r53 = groups.flatMap((g) => g.phases).find((p) => p.phase.code === 'R5.3');
    expect(r53?.count).toBeUndefined();
    expect(r53?.parkedCount).toBe(4);
  });

  it('sources count from the combined map when present', () => {
    const combined: Record<string, AnnotatedPhaseCounts> = {
      'R2.1': { wip: 7, gereed: 0, geparkeerd: 0, liveWip: 0, liveGereed: 0, liveGeparkeerd: 0 },
    };
    const groups = beheerRailPhaseGroups(combined, new Set());
    const r21 = groups.flatMap((g) => g.phases).find((p) => p.phase.code === 'R2.1');
    expect(r21?.count).toBe(7);
  });

  it('mutes every phase whose process key is not in deployedKeys, and un-mutes the one that is', () => {
    const groups = beheerRailPhaseGroups({}, new Set(['RipPhase1Process']));
    const all = groups.flatMap((g) => g.phases);
    const r21 = all.find((p) => p.phase.code === 'R2.1');
    const others = all.filter((p) => p.phase.code !== 'R2.1');
    expect(r21?.muted).toBe(false);
    others.forEach((p) => expect(p.muted).toBe(true));
  });
});
