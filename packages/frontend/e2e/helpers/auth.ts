import type { Page } from '@playwright/test';

import { isLocalTarget } from './target';

/**
 * Drives the real medewerker login flow: click "Inloggen" on LoginChoice,
 * fill Keycloak's hosted login form (field ids from
 * keycloak-themes/ronl/login/login.ftl: #username, #password, #kc-login),
 * and wait for the post-login redirect to land on a /dashboard/... route.
 *
 * Deliberately does NOT use Playwright storage-state caching yet (see
 * the testing docs' Tooling section) — every Phase 1 test still
 * exercises the real Keycloak redirect end-to-end.
 */
export async function loginAsMedewerker(page: Page, username: string, password: string) {
  // A deployed tier answers over the internet and its Keycloak may be cold, so
  // the redirect that is instant against localhost can take several seconds.
  // global-setup.ts already draws this distinction for its reachability
  // probes; a flat 10s here made a slow-but-healthy login look like a broken
  // one. Same split, same reason.
  const formTimeout = isLocalTarget ? 10_000 : 30_000;
  const redirectTimeout = isLocalTarget ? 15_000 : 45_000;

  await page.goto('/');
  // exact: the landing page also offers "Inloggen met uw Flevoland-account"
  // (caa8e0e), which a substring match on "Inloggen" resolves to as well, so
  // strict mode refused to click either. That one goes to Entra ID via
  // idpHint and never shows the Keycloak form filled in below; the plain
  // "Inloggen" in the top bar is the medewerker login this helper drives.
  await page.getByRole('button', { name: 'Inloggen', exact: true }).click();

  await page.locator('#username').waitFor({ timeout: formTimeout });
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(password);
  await page.locator('#kc-login').click();

  await page.waitForURL(/\/dashboard\//, { timeout: redirectTimeout });
}
