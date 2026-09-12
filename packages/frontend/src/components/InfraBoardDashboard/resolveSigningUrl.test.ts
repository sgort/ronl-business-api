import { describe, expect, it } from 'vitest';
import { resolveSigningUrl } from './resolveSigningUrl';

describe('resolveSigningUrl', () => {
  it('(a) resolves a relative path against the API origin, without duplicating /v1', () => {
    expect(resolveSigningUrl('/v1/validsign/stub/ceremony/pkg-1', 'http://localhost:3002/v1')).toBe(
      'http://localhost:3002/v1/validsign/stub/ceremony/pkg-1'
    );
  });

  it('(b) passes an absolute signingUrl through completely unchanged', () => {
    const absolute = 'https://sign.validsign.eu/ceremony/abc123';
    expect(resolveSigningUrl(absolute, 'http://localhost:3002/v1')).toBe(absolute);
    // Even against a base that would otherwise look plausible.
    expect(resolveSigningUrl(absolute, '')).toBe(absolute);
  });

  it('(c) uses the relative signingUrl unchanged when VITE_API_URL is itself relative or empty', () => {
    expect(resolveSigningUrl('/v1/validsign/stub/ceremony/pkg-1', '')).toBe(
      '/v1/validsign/stub/ceremony/pkg-1'
    );
    expect(resolveSigningUrl('/v1/validsign/stub/ceremony/pkg-1', '/api')).toBe(
      '/v1/validsign/stub/ceremony/pkg-1'
    );
  });

  it('(d) does not throw on a malformed API base URL, and falls back to the relative path', () => {
    expect(() =>
      resolveSigningUrl('/v1/validsign/stub/ceremony/pkg-1', 'not a url::')
    ).not.toThrow();
    expect(resolveSigningUrl('/v1/validsign/stub/ceremony/pkg-1', 'not a url::')).toBe(
      '/v1/validsign/stub/ceremony/pkg-1'
    );
  });
});
