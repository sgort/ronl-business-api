import { describe, it, expect } from 'vitest';
import { translations } from './index';

describe('i18n', () => {
  it('nl and en declare exactly the same keys', () => {
    const nlKeys = Object.keys(translations.nl).sort();
    const enKeys = Object.keys(translations.en).sort();
    expect(enKeys).toEqual(nlKeys);
  });

  it('footerLinks has the same number of entries in both languages', () => {
    expect(translations.en.footerLinks).toHaveLength(translations.nl.footerLinks.length);
  });

  it('no string value is empty', () => {
    for (const lang of ['nl', 'en'] as const) {
      for (const [key, value] of Object.entries(translations[lang])) {
        if (typeof value === 'string') {
          expect(value.trim(), `${lang}.${key}`).not.toBe('');
        }
      }
    }
  });
});
