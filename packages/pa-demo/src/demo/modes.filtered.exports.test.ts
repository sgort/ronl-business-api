import { describe, it, expect } from 'vitest';

// The alias mechanism's silent-failure mode, as documented at the top of
// modes.filtered.ts: a name present on the real modes.config but missing
// from this filtered stand-in becomes `undefined` wherever a vendored file
// imports it — silently, with no type error, because tsc resolves
// `modes.config` to the vendored file while Vite resolves it to this one.
// This test is the guard: it compares the two modules' runtime export sets
// directly, so a missing (or accidentally added) re-export fails loudly
// instead of surfacing as a blank section in the running app.
describe('modes.filtered export parity', () => {
  it('exports exactly the same runtime names as the vendored origin', async () => {
    const origin = await import('../vendor/pages/public-affairs-v2/modes.config');
    const filtered = await import('./modes.filtered');
    expect(Object.keys(filtered).sort()).toEqual(Object.keys(origin).sort());
  });
});
