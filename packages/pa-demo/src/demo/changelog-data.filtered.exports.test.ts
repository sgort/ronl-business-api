import { describe, it, expect } from 'vitest';

// Same silent-failure mode as modes.filtered.ts (see that module's header
// and modes.filtered.exports.test.ts): tsc resolves './changelog-data' to
// the real vendored file while Vite resolves it to this filtered stand-in,
// so a name present on one but not the other would go wrong silently. This
// compares the two modules' runtime export sets directly.
describe('changelog-data.filtered export parity', () => {
  it('exports exactly the same runtime names as the vendored origin', async () => {
    const origin = await import('../vendor/pages/changelog-data');
    const filtered = await import('./changelog-data.filtered');
    expect(Object.keys(filtered).sort()).toEqual(Object.keys(origin).sort());
  });
});
