import { slugify } from './slug';

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Zorgtoeslag')).toBe('zorgtoeslag');
    expect(slugify('Investeringssubsidie duurzame energie')).toBe(
      'investeringssubsidie-duurzame-energie'
    );
  });

  it('strips non-alphanumerics and collapses runs of separators', () => {
    expect(slugify('Regeling bekostiging vo-scholen (2026)')).toBe(
      'regeling-bekostiging-vo-scholen-2026'
    );
  });

  it('trims leading/trailing hyphens', () => {
    expect(slugify('  -- Tree felling? --  ')).toBe('tree-felling');
  });

  it('caps length at 64 characters', () => {
    const long = 'a'.repeat(100);
    expect(slugify(long)).toHaveLength(64);
  });

  it('returns an empty string for empty input', () => {
    expect(slugify('')).toBe('');
  });
});
