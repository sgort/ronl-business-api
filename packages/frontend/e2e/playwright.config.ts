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
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  globalSetup: './global-setup.ts',

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },

  // Chromium only for Phase 1 — see "Not in Phase 1" in
  // docs/TESTING-FRONTEND-UI.md. Firefox/WebKit are a cheap addition later.
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
