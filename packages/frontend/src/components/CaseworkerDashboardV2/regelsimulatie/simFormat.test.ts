import { describe, it, expect } from 'vitest';
import { simEur, simEurK } from './simFormat';

describe('simEur', () => {
  it('formats 1250 as €1.250', () => {
    expect(simEur(1250)).toBe('€1.250');
  });

  it('formats 437500 as €437.500', () => {
    expect(simEur(437500)).toBe('€437.500');
  });

  it('formats 0 as €0', () => {
    expect(simEur(0)).toBe('€0');
  });
});

describe('simEurK', () => {
  it('formats 1900000 as €1,9M', () => {
    expect(simEurK(1900000)).toBe('€1,9M');
  });

  it('formats 4200 as €4,2k', () => {
    expect(simEurK(4200)).toBe('€4,2k');
  });

  it('formats 313 as €313', () => {
    expect(simEurK(313)).toBe('€313');
  });

  it('formats 1000 as €1k', () => {
    expect(simEurK(1000)).toBe('€1k');
  });
});
