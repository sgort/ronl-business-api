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
