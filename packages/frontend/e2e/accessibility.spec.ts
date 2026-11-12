import { expect, test } from '@playwright/test';

import { expectNoNewViolations } from './helpers/a11y';
import { loginAsMedewerker } from './helpers/auth';
import { watchForRateLimit } from './helpers/rate-limit';
import { isLocalTarget } from './helpers/target';

/**
 * Accessibility checks with axe-core, one scan per page type (#409; design:
 * docs/superpowers/specs/2026-11-03-axe-accessibility-baseline-design.md).
 *
 * Each test fails on a critical or serious WCAG 2.0–2.2 A/AA violation that
 * is not in a11y-baseline.ts, or on a baseline entry that no longer occurs.
 * The failure lists the rule, the element, axe's colours and ratio for
 * contrast, and the help URL. The full axe result of every page, moderate
 * and minor findings and "needs review" items included, is attached to the
 * Playwright HTML report as axe-<page>.json.
 *
 * Fixed a finding? Remove its entry from a11y-baseline.ts. Introduced one on
 * purpose? Add an entry with its reason and where it gets fixed; prefer
 * fixing it.
 *
 * A stale entry and a new finding for the same rule at once usually means
 * axe's selector for the element changed (it picks the shortest unique one,
 * so a second matching element turns `.v2-key` into an :nth-child path), not
 * that the finding itself changed.
 *
 * The dashboards are scanned as the test users see them, after the inbox has
 * loaded, whatever tasks they have. Task rows sit on the white card, where
 * even Heusden's muted grey passes (4.83:1); checked with and without open
 * tasks. A finding that only shows with certain data still fails, and names
 * the element.
 *
 * Like the rest of the suite this runs against the local stack or a deployed
 * tier (see helpers/target.ts) and is started by hand. A throttled run (429)
 * fails with the rate-limit helper's message rather than scanning an error
 * state.
 */

/** Keycloak answers more slowly on a deployed tier, as in helpers/auth.ts. */
const FORM_TIMEOUT = isLocalTarget ? 10_000 : 30_000;

let rateLimit: ReturnType<typeof watchForRateLimit>;

test.describe('Accessibility — axe-core, one scan per page type', () => {
  test.beforeEach(({ page }) => {
    rateLimit = watchForRateLimit(page);
  });

  test.afterEach(() => {
    const throttled = rateLimit.hit();
    if (throttled) throw new Error(throttled);
  });

  test('landing page /', async ({ page }, testInfo) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Inloggen', exact: true }).waitFor();
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    await expectNoNewViolations(page, 'landing', testInfo);
  });

  test('sign-in screen ("Verbinding maken...")', async ({ page }, testInfo) => {
    // Answer Keycloak's authorize navigation with 204: the browser cancels the
    // navigation and the AuthCallback card stays on screen to be scanned.
    await page.route(/\/protocol\/openid-connect\/auth/, (route) => route.fulfill({ status: 204 }));
    await page.goto('/');
    await page.evaluate(() => sessionStorage.setItem('selected_idp', 'medewerker'));
    // The app redirects towards Keycloak before 'load': only wait for the commit.
    await page.goto('/auth', { waitUntil: 'commit' });
    // Not locator.waitFor: since Playwright 1.64 it waits for the pending
    // authorize navigation, which the 204 above never lets finish. A page
    // function is not held up by it, and neither is the axe scan.
    await page.waitForFunction(
      () => document.body.innerText.includes('Verbinding maken...'),
      null,
      {
        timeout: 15_000,
      }
    );
    await expectNoNewViolations(page, 'sign-in screen', testInfo);
  });

  // selected_idp 'medewerker' without a username hint: Keycloak gets
  // login_hint=__medewerker__ and login.ftl shows the medewerker banner.
  test('Keycloak login, medewerker variant', async ({ page }, testInfo) => {
    await page.goto('/');
    await page.evaluate(() => {
      sessionStorage.clear();
      sessionStorage.setItem('selected_idp', 'medewerker');
    });
    await page.goto('/auth');
    await page.locator('#kc-context-banner').waitFor({ timeout: FORM_TIMEOUT });
    await expectNoNewViolations(page, 'keycloak medewerker', testInfo);
  });

  // The landing page's "Inloggen" hints a test user: the form opens prefilled.
  test('Keycloak login, prefilled variant', async ({ page }, testInfo) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Inloggen', exact: true }).click();
    await page.locator('#username').waitFor({ timeout: FORM_TIMEOUT });
    await expectNoNewViolations(page, 'keycloak prefilled', testInfo);
  });

  // No selected_idp: keycloak.login() without a hint, the citizen form.
  test('Keycloak login, plain variant', async ({ page }, testInfo) => {
    await page.goto('/');
    await page.evaluate(() => sessionStorage.clear());
    await page.goto('/auth');
    await page.locator('#username').waitFor({ timeout: FORM_TIMEOUT });
    await expectNoNewViolations(page, 'keycloak plain', testInfo);
  });

  // The route each user must land on: Caseworker V2, Infra-board and Woo share
  // the chrome (and its baseline), so the URL is what tells them apart.
  const DASHBOARDS = [
    ['caseworker v2', 'test-caseworker-flevoland', '/dashboard/caseworker'],
    ['infra-board', 'test-infra-flevoland', '/dashboard/infra-board'],
    ['woo', 'test-woo-flevoland', '/dashboard/woo'],
    ['pa-cockpit', 'test-pa-flevoland', '/dashboard/public-affairs'],
    // The other-tenant check: Heusden's own theme and the default neutrals.
    ['caseworker v2 heusden', 'test-caseworker-heusden', '/dashboard/caseworker'],
  ] as const;

  for (const [pageName, user, route] of DASHBOARDS) {
    test(`dashboard: ${pageName}`, async ({ page }, testInfo) => {
      await loginAsMedewerker(page, user, 'test123');
      await expect(page).toHaveURL(new RegExp(`${route}(\\?|#|$)`));
      await page.locator('.cwd-v2, .pac').first().waitFor({ timeout: FORM_TIMEOUT });
      // Scan the inbox loaded, not its "Taken laden…" placeholder.
      await expect(page.getByText('Taken laden…')).toHaveCount(0, { timeout: 30_000 });
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
      // Scanning a throttled dashboard would measure its error state.
      const throttled = rateLimit.hit();
      if (throttled) throw new Error(throttled);
      await expectNoNewViolations(page, pageName, testInfo);
    });
  }
});
