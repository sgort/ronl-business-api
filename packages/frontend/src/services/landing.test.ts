// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { landingUrl } from './landing';

describe('landingUrl', () => {
  it("is the tenant's own landing path", () => {
    expect(landingUrl('amsterdam')).toBe(`${window.location.origin}/amsterdam`);
  });

  it('encodes the id', () => {
    expect(landingUrl('a b')).toBe(`${window.location.origin}/a%20b`);
  });

  it.each([undefined, null, ''])('is the plain landing page without a tenant (%s)', (id) => {
    expect(landingUrl(id)).toBe(`${window.location.origin}/`);
  });
});
