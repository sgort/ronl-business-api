/** Unit tests for getErrorMessage and AmbiguousDeploymentError. */

import { AmbiguousDeploymentError, getErrorMessage } from './errors';

describe('AmbiguousDeploymentError', () => {
  it('carries the key and the tenants, and names both in its message', () => {
    const error = new AmbiguousDeploymentError('AwbShellProcess', ['flevoland', 'utrecht']);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('AmbiguousDeploymentError');
    expect(error.processKey).toBe('AwbShellProcess');
    expect(error.tenants).toEqual(['flevoland', 'utrecht']);
    expect(error.message).toBe(
      "Process 'AwbShellProcess' is deployed under several organisations (flevoland, utrecht), none of them the caller's"
    );
  });
});

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
