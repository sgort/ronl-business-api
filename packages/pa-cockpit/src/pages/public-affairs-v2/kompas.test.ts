import { describe, it, expect } from 'vitest';
import { kompasMax, kompasBand } from './pa.data';

describe('kompasMax', () => {
  it('returns 16 (8 criteria × 2)', () => {
    expect(kompasMax()).toBe(16);
  });
});

describe('kompasBand boundaries', () => {
  it('0 → niet', () => expect(kompasBand(0).key).toBe('niet'));
  it('4 → niet', () => expect(kompasBand(4).key).toBe('niet'));
  it('5 → monitor', () => expect(kompasBand(5).key).toBe('monitor'));
  it('9 → monitor', () => expect(kompasBand(9).key).toBe('monitor'));
  it('10 → kans', () => expect(kompasBand(10).key).toBe('kans'));
  it('13 → kans', () => expect(kompasBand(13).key).toBe('kans'));
  it('14 → kern', () => expect(kompasBand(14).key).toBe('kern'));
  it('16 → kern', () => expect(kompasBand(16).key).toBe('kern'));
});

describe('kompasBand outside the scored range', () => {
  it('falls back to the lowest band for a total below every threshold', () => {
    // The bands are matched top-down by `total >= b.min`, so nothing matches a
    // negative total. The fallback keeps a scorer bug from returning undefined
    // and blanking the advice column instead of showing the mildest advice.
    expect(kompasBand(-1).key).toBe('niet');
  });
});
