import { describe, it, expect } from 'vitest';

describe('pa-demo scaffold', () => {
  it('injects the build version as a global', () => {
    // mock-demo.store stamps persisted state with this; without it the store
    // falls back to 'dev' and a release would not reset a visitor's demo.
    expect(typeof __APP_VERSION__).toBe('string');
    expect(__APP_VERSION__.length).toBeGreaterThan(0);
  });

  it('runs in a DOM environment', () => {
    expect(typeof document).toBe('object');
  });
});
