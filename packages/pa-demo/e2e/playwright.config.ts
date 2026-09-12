// Kept outside src/ so Vitest never picks these *.spec.ts files up (same
// reasoning as packages/frontend/e2e/playwright.config.ts and
// packages/public-site/e2e/playwright.config.ts).
//
// pa-demo has no backend, database or Keycloak dependency — plato issues no
// network requests at all — so unlike either of those two suites, nothing
// else needs to be running: Playwright starts the dev server and that is the
// whole environment. Set E2E_BASE_URL to run against a deployed site
// (acc.plato / plato) for post-deploy verification instead of a local server.
import { defineConfig, devices } from '@playwright/test';

const liveTarget = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: '.',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: liveTarget ?? 'http://localhost:5176',
    trace: 'on-first-retry',
  },
  ...(liveTarget
    ? {}
    : {
        webServer: {
          command: 'npm run dev',
          url: 'http://localhost:5176',
          reuseExistingServer: !process.env.CI,
          timeout: 30_000,
        },
      }),
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
