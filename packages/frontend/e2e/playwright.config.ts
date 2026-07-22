import { defineConfig, devices } from '@playwright/test';

// Kept separate from src/ (see docs/TESTING-FRONTEND-UI.md) so Vitest's
// include/exclude globs never need to know about this directory.
//
// Does NOT start the dev stack itself — frontend, backend, and the sibling
// linked-data-explorer backend are expected to already be running, per
// docs/TESTING-FRONTEND-UI.md's Environment section. globalSetup checks for
// that and fails fast with a clear message instead of a confusing mid-test
// connection error.
export default defineConfig({
  testDir: '.',
  fullyParallel: true,
  // Every Operaton-touching spec shares the same stateful local engine.
  // Two files creating identically-named tasks for the same caseworker
  // (tenant-isolation.spec.ts and zorgtoeslag-journey.spec.ts, both
  // "Case review: provisional entitlement decision" for
  // test-caseworker-toeslagen) raced when run in different workers: a
  // `.first()` task-list match grabbed the other file's task mid-flight,
  // causing a real Operaton save conflict ("Opslaan mislukt"), not just a
  // bad selector. One worker serializes everything, trading suite speed
  // for correctness — acceptable for this small, locally-run Phase 1
  // suite (see "Not in Phase 1" for CI throughput tuning).
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },

  // Chromium only for Phase 1 — see "Not in Phase 1" in
  // docs/TESTING-FRONTEND-UI.md. Firefox/WebKit are a cheap addition later.
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
