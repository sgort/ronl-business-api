import { describe, it, expect } from 'vitest';
import { KT_CONCEPTS, KT_GROUPS, htx } from './herkomstConcepts';

describe('herkomstConcepts', () => {
  it('every concept belongs to a declared group', () => {
    const groupIds = new Set(KT_GROUPS.map((g) => g.id));
    for (const [id, c] of Object.entries(KT_CONCEPTS)) {
      expect(groupIds.has(c.groep), `${id}.groep`).toBe(true);
    }
  });

  it('every begrippen[].ref points at a real concept', () => {
    for (const [id, c] of Object.entries(KT_CONCEPTS)) {
      for (const b of c.begrippen) {
        if (b.ref) {
          expect(KT_CONCEPTS[b.ref], `${id} -> ${b.ref}`).toBeDefined();
        }
      }
    }
  });

  it('bsn has no begrippen (it is the end of the chain)', () => {
    expect(KT_CONCEPTS.bsn.begrippen).toHaveLength(0);
  });

  it('leeftijd is the only concept with a non-null dmn', () => {
    const withDmn = Object.entries(KT_CONCEPTS).filter(([, c]) => c.dmn !== null);
    expect(withDmn.map(([id]) => id)).toEqual(['leeftijd']);
  });
});

describe('htx', () => {
  it('returns the plain string as-is', () => {
    expect(htx('datumBerekening', 'nl')).toBe('datumBerekening');
  });

  it('picks the requested language from a bilingual pair', () => {
    expect(htx({ nl: 'Leeftijd', en: 'Age' }, 'en')).toBe('Age');
  });

  it('falls back to nl when the requested language is missing', () => {
    expect(htx({ nl: 'Leeftijd' } as never, 'en')).toBe('Leeftijd');
  });
});
