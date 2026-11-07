/**
 * engineSegment (#415): every value placed in an Operaton URL path. The client
 * runs as an operaton-admin account, so a caller's value must never reach
 * another engine endpoint ("../", "?", "#", an encoded slash, a bare "..").
 */
import { engineSegment } from './engine-segment';

describe('engineSegment', () => {
  it('leaves ordinary keys and IDs as they are', () => {
    expect(engineSegment('RipR21Process')).toBe('RipR21Process');
    expect(engineSegment('a3c1e0f2-da7f-11f1-b44c-dac0f2f95b87')).toBe(
      'a3c1e0f2-da7f-11f1-b44c-dac0f2f95b87'
    );
  });

  it('keeps the colons of a definition ID readable', () => {
    expect(engineSegment('op415_case:1:080011ac')).toBe('op415_case:1:080011ac');
  });

  it('encodes slashes, so "../" cannot walk to another endpoint', () => {
    expect(engineSegment('x/../../process-instance')).toBe('x%2F..%2F..%2Fprocess-instance');
  });

  it('encodes "?" and "#", so a fixed suffix cannot be cut off', () => {
    expect(engineSegment('../../process-instance?x=')).toBe('..%2F..%2Fprocess-instance%3Fx%3D');
    expect(engineSegment('a#b')).toBe('a%23b');
  });

  it('encodes "%", so a pre-encoded value is not decoded into a path', () => {
    expect(engineSegment('x%2F..')).toBe('x%252F..');
  });

  it.each(['.', '..', ''])('refuses %j, which would collapse the path', (value) => {
    expect(() => engineSegment(value)).toThrow('Invalid Operaton path segment');
  });
});
