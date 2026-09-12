// packages/public-site/e2e/playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

// Kept separate from src/ so Vitest never picks up these *.spec.ts files
// (same reasoning as packages/frontend/e2e/playwright.config.ts).
//
// public-site has no Keycloak/Operaton dependency, so unlike the frontend
// suite, Playwright starts the dev server itself. The BACKEND must already
// be running on the port VITE_API_URL points at — these specs hit real
// search results, not mocked ones.
// Set E2E_BASE_URL to run against an already-deployed site (e.g. the live ACC
// URL for the go-live §6 verification) instead of a local dev server. When it's
// set we point baseURL at it and skip starting the local server entirely.
const liveTarget = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: '.',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: liveTarget ?? 'http://localhost:5175',
    trace: 'on-first-retry',
  },
  // Only spin up the local dev server when testing locally.
  ...(liveTarget
    ? {}
    : {
        webServer: {
          command: 'npm run dev',
          url: 'http://localhost:5175',
          reuseExistingServer: !process.env.CI,
          timeout: 30_000,
        },
      }),
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
