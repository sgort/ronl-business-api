import { describe, expect, it } from 'vitest';
import {
  getMockPortfolio,
  getMockTodos,
  getMockUpdates,
  makePhase1Row,
  normalizeLeadRole,
  PHASE_DUR,
  TL,
} from './infra-board.data';
import { PHASES } from './rip-model';

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
