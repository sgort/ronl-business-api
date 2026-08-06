// packages/public-site/e2e/playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

// Kept separate from src/ so Vitest never picks up these *.spec.ts files
// (same reasoning as packages/frontend/e2e/playwright.config.ts).
//
// public-site has no Keycloak/Operaton dependency, so unlike the frontend
// suite, Playwright starts the dev server itself. The BACKEND must already
// be running on the port VITE_API_URL points at — these specs hit real
// search results, not mocked ones.
export default defineConfig({
  testDir: '.',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5175',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5175',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
