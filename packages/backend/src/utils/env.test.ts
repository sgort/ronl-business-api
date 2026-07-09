/**
 * Unit tests for the env parsers. These pure helpers back every feature's
 * configuration (ports, TTLs, feature flags, CORS lists, EDOCS_STUB_MODE, ...),
 * so their default/parse behaviour is worth pinning precisely.
 */

import { parseEnvArray, parseEnvInt, parseEnvBool } from './env';

describe('parseEnvBool', () => {
  it('returns the default when the value is undefined or empty', () => {
    expect(parseEnvBool(undefined, true)).toBe(true);
    expect(parseEnvBool(undefined, false)).toBe(false);
    expect(parseEnvBool('', true)).toBe(true);
  });

  it('is true only for "true" (case-insensitive)', () => {
    expect(parseEnvBool('true', false)).toBe(true);
    expect(parseEnvBool('TRUE', false)).toBe(true);
    expect(parseEnvBool('True', false)).toBe(true);
  });

  it('is false for any other non-empty value', () => {
    expect(parseEnvBool('false', true)).toBe(false);
    expect(parseEnvBool('1', true)).toBe(false);
    expect(parseEnvBool('yes', true)).toBe(false);
  });
});

describe('parseEnvInt', () => {
  it('returns the default when undefined or empty', () => {
    expect(parseEnvInt(undefined, 3002)).toBe(3002);
    expect(parseEnvInt('', 10)).toBe(10);
  });

  it('parses a valid integer', () => {
    expect(parseEnvInt('8080', 3002)).toBe(8080);
  });

  it('returns the default for a non-numeric value', () => {
    expect(parseEnvInt('abc', 42)).toBe(42);
  });

  it('parses the leading integer of a mixed string (parseInt semantics)', () => {
    expect(parseEnvInt('30s', 0)).toBe(30);
  });
});

describe('parseEnvArray', () => {
  it('returns the default when undefined or empty', () => {
    expect(parseEnvArray(undefined, ['a'])).toEqual(['a']);
    expect(parseEnvArray('', [])).toEqual([]);
  });

  it('splits on commas and trims whitespace', () => {
    expect(parseEnvArray('http://a, http://b ,http://c', [])).toEqual([
      'http://a',
      'http://b',
      'http://c',
    ]);
  });

  it('yields a single-element array when there is no comma', () => {
    expect(parseEnvArray('solo', [])).toEqual(['solo']);
  });
});
