import type { Page } from '@playwright/test';

/**
 * Drives the real medewerker login flow: click "Inloggen" on LoginChoice,
 * fill Keycloak's hosted login form (field ids from
 * keycloak-themes/ronl/login/login.ftl: #username, #password, #kc-login),
 * and wait for the post-login redirect to land on a /dashboard/... route.
 *
 * Deliberately does NOT use Playwright storage-state caching yet (see
 * docs/TESTING-FRONTEND-UI.md's Tooling section) — every Phase 1 test still
 * exercises the real Keycloak redirect end-to-end.
 */
export async function loginAsMedewerker(page: Page, username: string, password: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Inloggen' }).click();

  await page.locator('#username').waitFor({ timeout: 10_000 });
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(password);
  await page.locator('#kc-login').click();

  await page.waitForURL(/\/dashboard\//, { timeout: 15_000 });
}
