/** Unit tests for getErrorMessage. */

import { getErrorMessage } from './errors';

describe('getErrorMessage', () => {
  it('returns the message of an Error', () => {
    expect(getErrorMessage(new Error('boom'))).toBe('boom');
  });

  it('stringifies a non-Error value', () => {
    expect(getErrorMessage('plain')).toBe('plain');
    expect(getErrorMessage(42)).toBe('42');
    expect(getErrorMessage(null)).toBe('null');
    expect(getErrorMessage({ a: 1 })).toBe('[object Object]');
  });
});
