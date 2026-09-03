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
      'R2.1': { wip: 0, gereed: 10 },
      'R2.2': { wip: 2, gereed: 3 },
    };
    const result = getKlaarCounts(RIP_PHASES, counts);
    expect(result['R2.2']).toBe(5); // 10 - 2 - 3
  });

  it('floors at 0 rather than going negative', () => {
    const counts: Record<string, PhaseCounts> = {
      'R2.1': { wip: 0, gereed: 1 },
      'R2.2': { wip: 5, gereed: 5 },
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
    const mock = { 'R2.1': { wip: 4, gereed: 10 } };
    const live = { 'R2.1': { wip: 1, gereed: 2 } };
    const result = combinePhaseCounts(mock, live);
    expect(result['R2.1']).toEqual({
      wip: 5,
      gereed: 12,
      liveWip: 1,
      liveGereed: 2,
    });
  });

  it('produces a complete entry when a phase is present in only one input', () => {
    const mock = { 'R2.1': { wip: 4, gereed: 10 } };
    const live = {};
    const result = combinePhaseCounts(mock, live);
    expect(result['R2.1']).toEqual({
      wip: 4,
      gereed: 10,
      liveWip: 0,
      liveGereed: 0,
    });
  });
});

describe('getKlaarCounts and beyond phases', () => {
  it('gives R5.4 no klaar figure at all, because R5.3 has multiple exits', () => {
    // The subtraction assumes finishing a phase means advancing to the next.
    // R5.3 breaks that: three of its four end events return to R5.2, so its
    // gereed mixes four outcomes and one project can complete it twice.
    // Reporting "-" is honest; a number here would overstate R5.4 invisibly.
    const counts: Record<string, PhaseCounts> = {
      'R5.2': { wip: 0, gereed: 20 },
      'R5.3': { wip: 0, gereed: 9 },
      'R5.4': { wip: 2, gereed: 1 },
    };
    expect(getKlaarCounts(RIP_PHASES, counts)['R5.4']).toBeUndefined();
  });

  it('drives that off the multipleExits flag, not off the phase code', () => {
    // A literal 'R5.3' here would break the next time a phase gains or loses
    // an exit -- the same trap three fixtures fell into before c561d48.
    const withFlag = RIP_PHASES.map((p) =>
      p.code === 'R2.2' ? { ...p, multipleExits: true } : { ...p, multipleExits: undefined }
    );
    const counts: Record<string, PhaseCounts> = {
      'R2.2': { wip: 0, gereed: 9 },
      'R2.3': { wip: 2, gereed: 1 },
      'R5.4': { wip: 2, gereed: 1 },
    };
    const result = getKlaarCounts(withFlag, counts);
    expect(result['R2.3']).toBeUndefined();
    expect(result['R5.4']).toBe(0); // R5.3 no longer flagged, so it derives again
  });

  it('still gives the first phase no klaar figure at all', () => {
    const result = getKlaarCounts(RIP_PHASES, {});
    expect(result[RIP_PHASES[0].code]).toBeUndefined();
  });
});

describe('normalizeLiveCounts', () => {
  it('maps backend processDefinitionKey counts onto phase codes with geparkeerd: 0', () => {
    const raw = { RipR21Process: { wip: 3, gereed: 7 } };
    const result = normalizeLiveCounts(raw, RIP_PHASES);
    expect(result['R2.1']).toEqual({ wip: 3, gereed: 7 });
    expect(result['R2.2']).toBeUndefined();
  });
});
