/**
 * Unit tests for inferType — the JSON-value-to-Operaton-type-tag mapper shared by
 * the process, task, decision and m2m routes. A pure function, so it is tested
 * directly rather than through four separate HTTP surfaces; that also reaches the
 * non-JSON cases no request body can produce.
 */
export {};

import { inferType } from './operaton-variables';

describe('inferType', () => {
  it('tags the absence of a value as Null', () => {
    expect(inferType(null)).toBe('Null');
    expect(inferType(undefined)).toBe('Null');
  });

  it('tags booleans', () => {
    expect(inferType(true)).toBe('Boolean');
    expect(inferType(false)).toBe('Boolean');
  });

  it('splits numbers into Integer and Double', () => {
    // Operaton rejects a Double where its DMN expects an Integer, so whole
    // numbers have to come through as Integer rather than as a generic number.
    expect(inferType(0)).toBe('Integer');
    expect(inferType(-3)).toBe('Integer');
    expect(inferType(2 ** 31)).toBe('Integer');
    expect(inferType(12.5)).toBe('Double');
    expect(inferType(-0.1)).toBe('Double');
  });

  it('tags a non-finite number as Double rather than Integer', () => {
    // Number.isInteger is false for these, which is the safer of the two tags.
    expect(inferType(Number.NaN)).toBe('Double');
    expect(inferType(Number.POSITIVE_INFINITY)).toBe('Double');
  });

  it('tags strings, including the empty string', () => {
    expect(inferType('')).toBe('String');
    expect(inferType('zorgtoeslag')).toBe('String');
  });

  it('tags objects and arrays as Json', () => {
    expect(inferType({})).toBe('Json');
    expect(inferType({ naam: 'a.pdf' })).toBe('Json');
    expect(inferType([1, 2, 3])).toBe('Json');
    expect(inferType(new Date())).toBe('Json');
  });

  it('falls back to String for values no JSON body can carry', () => {
    // Unreachable over HTTP, but a direct caller can pass these and the mapper
    // must still return a tag Operaton understands rather than undefined.
    expect(inferType(10n)).toBe('String');
    expect(inferType(Symbol('x'))).toBe('String');
    expect(inferType(() => undefined)).toBe('String');
  });
});
