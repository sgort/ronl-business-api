import { describe, it, expect } from 'vitest';
import { HERKOMST_STRINGS, KT_STAGES, KT_ABC, KT_STANDARDS } from './herkomstData';

describe('HERKOMST_STRINGS', () => {
  it('nl and en declare exactly the same keys', () => {
    expect(Object.keys(HERKOMST_STRINGS.en).sort()).toEqual(
      Object.keys(HERKOMST_STRINGS.nl).sort()
    );
  });

  it('steps has 4 entries in both languages', () => {
    expect(HERKOMST_STRINGS.nl.steps).toHaveLength(4);
    expect(HERKOMST_STRINGS.en.steps).toHaveLength(4);
  });

  it('no string value is empty', () => {
    for (const lang of ['nl', 'en'] as const) {
      for (const [key, value] of Object.entries(HERKOMST_STRINGS[lang])) {
        if (typeof value === 'string') {
          expect(value.trim(), `${lang}.${key}`).not.toBe('');
        }
      }
    }
  });
});

describe('KT_STAGES / KT_ABC / KT_STANDARDS', () => {
  it('has exactly 4 pipeline stages, numbered 1-4', () => {
    expect(KT_STAGES.map((s) => s.no)).toEqual(['1', '2', '3', '4']);
  });

  it('only stage 1 carries the "nieuw" badge', () => {
    expect(KT_STAGES.filter((s) => s.nieuw).map((s) => s.no)).toEqual(['1']);
  });

  it('has exactly 3 concept-chain entries tagged (a)/(b)/(c)', () => {
    expect(KT_ABC.map((c) => c.tag)).toEqual(['(a)', '(b)', '(c)']);
  });

  it('open and closed standards lists are both non-empty', () => {
    expect(KT_STANDARDS.open.length).toBeGreaterThan(0);
    expect(KT_STANDARDS.closed.nl.length).toBeGreaterThan(0);
    expect(KT_STANDARDS.closed.en).toHaveLength(KT_STANDARDS.closed.nl.length);
  });
});
