import { describe, it, expect } from 'vitest';
import { formatDate } from './formatDate';

describe('formatDate', () => {
  it('renders an ISO timestamp as a long Dutch date', () => {
    expect(formatDate('2026-07-08T13:45:00.000Z')).toBe('8 juli 2026');
  });

  it('accepts a date-only string', () => {
    expect(formatDate('2026-01-31')).toBe('31 januari 2026');
  });

  it('returns an empty string for a missing date rather than "Invalid Date"', () => {
    // Every caller interpolates the result straight into a sentence
    // ("t/m {…}", "Afgerond op {…}"), so an absent date has to disappear
    // instead of printing the string "Invalid Date" next to a label.
    expect(formatDate('')).toBe('');
  });
});
