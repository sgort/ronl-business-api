import { matchesQueryTerms } from './query-match';

describe('matchesQueryTerms', () => {
  it('returns null for an empty or whitespace-only query', () => {
    expect(matchesQueryTerms('Lelystad Airport nieuws', '')).toBeNull();
    expect(matchesQueryTerms('Lelystad Airport nieuws', '   ')).toBeNull();
  });

  it('matches a single term, case-insensitively', () => {
    expect(matchesQueryTerms('Nieuws over LELYSTAD airport', 'Lelystad')).toBe('Lelystad');
  });

  it('splits on OR and returns the first term that matches', () => {
    const term = matchesQueryTerms('gebiedsproces van start', 'stikstof OR gebiedsproces');
    expect(term).toBe('gebiedsproces');
  });

  it('strips surrounding quotes from a term', () => {
    expect(matchesQueryTerms('bericht over energy hub plannen', '"energy hub"')).toBe('energy hub');
  });

  it('returns null when no term matches', () => {
    expect(matchesQueryTerms('volledig onverwant bericht', 'stikstof OR gebiedsproces')).toBeNull();
  });

  it('is a substring match, not a whole-word match', () => {
    expect(matchesQueryTerms('herbestikstoffering', 'stikstof')).toBe('stikstof');
  });
});
