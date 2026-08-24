import { describe, expect, it } from 'vitest';
import {
  combinePhaseCounts,
  getKlaarCounts,
  normalizeLiveCounts,
  type PhaseCounts,
} from './rip-phase-counts';
import { RIP_PHASES } from './rip-phases.catalog';

describe('getKlaarCounts', () => {
  it('is always undefined for the first phase (no predecessor)', () => {
    const counts: Record<string, PhaseCounts> = {};
    const result = getKlaarCounts(RIP_PHASES, counts);
    expect(result[RIP_PHASES[0].code]).toBeUndefined();
  });

  it('computes klaar[N] = max(0, gereed[N-1] - wip[N] - gereed[N])', () => {
    const counts: Record<string, PhaseCounts> = {
      'R2.1': { wip: 0, gereed: 10, geparkeerd: 0 },
      'R2.2': { wip: 2, gereed: 3, geparkeerd: 0 },
    };
    const result = getKlaarCounts(RIP_PHASES, counts);
    expect(result['R2.2']).toBe(5); // 10 - 2 - 3
  });

  it('floors at 0 rather than going negative', () => {
    const counts: Record<string, PhaseCounts> = {
      'R2.1': { wip: 0, gereed: 1, geparkeerd: 0 },
      'R2.2': { wip: 5, gereed: 5, geparkeerd: 0 },
    };
    const result = getKlaarCounts(RIP_PHASES, counts);
    expect(result['R2.2']).toBe(0);
  });

  it('treats a phase missing from counts as all-zero', () => {
    const result = getKlaarCounts(RIP_PHASES, {});
    expect(result['R2.2']).toBe(0);
  });
});

describe('combinePhaseCounts', () => {
  it('sums mock + live per field and carries the live figures for annotation', () => {
    const mock = { 'R2.1': { wip: 4, gereed: 10, geparkeerd: 1 } };
    const live = { 'R2.1': { wip: 1, gereed: 2, geparkeerd: 0 } };
    const result = combinePhaseCounts(mock, live);
    expect(result['R2.1']).toEqual({
      wip: 5,
      gereed: 12,
      geparkeerd: 1,
      liveWip: 1,
      liveGereed: 2,
      liveGeparkeerd: 0,
    });
  });

  it('produces a complete entry when a phase is present in only one input', () => {
    const mock = { 'R2.1': { wip: 4, gereed: 10, geparkeerd: 0 } };
    const live = {};
    const result = combinePhaseCounts(mock, live);
    expect(result['R2.1']).toEqual({
      wip: 4,
      gereed: 10,
      geparkeerd: 0,
      liveWip: 0,
      liveGereed: 0,
      liveGeparkeerd: 0,
    });
  });
});

describe('normalizeLiveCounts', () => {
  it('maps backend processDefinitionKey counts onto phase codes with geparkeerd: 0', () => {
    const raw = { RipR21Process: { wip: 3, gereed: 7 } };
    const result = normalizeLiveCounts(raw, RIP_PHASES);
    expect(result['R2.1']).toEqual({ wip: 3, gereed: 7, geparkeerd: 0 });
    expect(result['R2.2']).toBeUndefined();
  });
});
