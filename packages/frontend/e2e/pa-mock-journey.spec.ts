import { expect, test, type Page } from '@playwright/test';
import { loginAsMedewerker } from './helpers/auth';

/**
 * The PA cockpit's mock mode, driven end to end against the real store.
 *
 * Every mock-mode defect found by hand over the last two days was invisible to
 * the unit suites by construction. They were not logic errors: a saved-search
 * write that was a bare `return;`, a confirm that built a new object and
 * discarded it, notifications hardcoded to empty, a resource fetched once at
 * mount and never again. Component tests mock the very seam that was broken, so
 * they cannot see any of it — and each one passed throughout.
 *
 * This drives the real thing with no mocking at all. Mock mode is what makes
 * that affordable: the fixtures are deterministic, the store is the production
 * one, and nothing here depends on what happens to be in the database.
 *
 * Per docs' Environment section the full stack must already be running — this
 * suite follows that convention rather than inventing a second mode, so login
 * is the real Keycloak flow like every other spec here.
 *
 * The fixture baseline is 4 confirmed and 6 inbox per signaalbron. Assertions
 * are relative to it wherever a count moves, so extending the fixtures does not
 * break the journey — only changing the per-source balance would.
 */

const SOURCES = ['Politiek (NL)', 'Europa (EU)', 'Regionaal', 'Media & omgeving'];
const BASE_CONFIRMED = 4;
const BASE_INBOX = 6;

/** The rail button for one signaalbron. */
function rail(page: Page, label: string) {
  return page.locator('button.pac-rail-item', { hasText: label });
}

/** Confirmed count — the plain number on the rail. */
async function confirmedCount(page: Page, label: string): Promise<number> {
  const score = rail(page, label).locator('.pac-rail-score');
  const full = ((await score.textContent()) ?? '').trim();
  const inbox = (
    (await score
      .locator('.pac-rail-inbox')
      .textContent()
      .catch(() => '')) ?? ''
  ).trim();
  // The inbox badge is nested inside the score span, so its digits are included
  // in the parent's text; strip them from the end rather than parsing the whole.
  const plain = inbox && full.endsWith(inbox) ? full.slice(0, -inbox.length) : full;
  return Number(plain.trim());
}

/** Inbox count — the pink badge, absent entirely when zero. */
async function inboxCount(page: Page, label: string): Promise<number> {
  const badge = rail(page, label).locator('.pac-rail-inbox');
  if ((await badge.count()) === 0) return 0;
  return Number(((await badge.textContent()) ?? '0').trim());
}

async function openMonitoring(page: Page) {
  await page.getByRole('button', { name: 'Monitoring', exact: true }).click();
}

/**
 * A genuine cold load, then back in.
 *
 * keycloak.authenticated lives in memory and the app does not re-init it on a
 * direct page load — ProtectedRoute says as much — so a plain reload lands on
 * "Inloggen vereist". That is exactly what makes the reload worth doing here:
 * every module-level cache is gone, so anything still on screen afterwards came
 * back from storage rather than from a variable that never went away.
 *
 * The Keycloak SSO session usually survives, making the round-trip silent; the
 * form is filled only if it actually appears.
 */
async function reloadAndReauth(page: Page) {
  await page.reload();
  const signIn = page.getByRole('button', { name: 'Inloggen als medewerker' });
  if (await signIn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await signIn.click();
    const username = page.locator('#username');
    if (await username.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await username.fill('test-pa-flevoland');
      await page.locator('#password').fill('test123');
      await page.locator('#kc-login').click();
    }
    await page.waitForURL(/\/dashboard\//, { timeout: 15_000 });
  }
}

test.describe('PA cockpit — mock mode', () => {
  test.beforeEach(async ({ page }) => {
    // window.confirm guards Reset demodata; Playwright dismisses dialogs by
    // default, which would silently turn the reset into a no-op.
    page.on('dialog', (d) => void d.accept());

    // Set before the app ever boots, so no reload is needed to pick it up — and
    // a reload here would sign us out. The demo store is cleared once per test,
    // guarded by a sessionStorage sentinel, so later reloads keep what the test
    // curated instead of wiping the very thing under assertion.
    await page.addInitScript(() => {
      localStorage.setItem('paV2.mock', '1');
      if (!sessionStorage.getItem('e2e-demo-cleared')) {
        localStorage.removeItem('paV2.mock.demo');
        sessionStorage.setItem('e2e-demo-cleared', '1');
      }
    });

    await loginAsMedewerker(page, 'test-pa-flevoland', 'test123');
  });

  test('curating moves the rail badges, and the moves survive a reload', async ({ page }) => {
    await openMonitoring(page);
    await expect(rail(page, 'Politiek (NL)')).toBeVisible();

    // Every source starts at the fixture baseline.
    for (const source of SOURCES) {
      expect(await confirmedCount(page, source), `${source} confirmed`).toBe(BASE_CONFIRMED);
      expect(await inboxCount(page, source), `${source} inbox`).toBe(BASE_INBOX);
    }

    await rail(page, 'Politiek (NL)').click();
    await page.getByRole('button', { name: /^Inbox/ }).click();
    await page.getByRole('button', { name: 'Bevestigen' }).first().click();

    // One out of the inbox, one into the curated set.
    await expect
      .poll(() => inboxCount(page, 'Politiek (NL)'), { message: 'inbox after confirm' })
      .toBe(BASE_INBOX - 1);
    await expect
      .poll(() => confirmedCount(page, 'Politiek (NL)'), { message: 'confirmed after confirm' })
      .toBe(BASE_CONFIRMED + 1);

    // The whole point of the persisted store: this used to spring back.
    await reloadAndReauth(page);
    await openMonitoring(page);
    await expect
      .poll(() => inboxCount(page, 'Politiek (NL)'), { message: 'inbox after reload' })
      .toBe(BASE_INBOX - 1);
    await expect
      .poll(() => confirmedCount(page, 'Politiek (NL)'), { message: 'confirmed after reload' })
      .toBe(BASE_CONFIRMED + 1);

    // Untouched sources must not have moved.
    expect(await inboxCount(page, 'Regionaal')).toBe(BASE_INBOX);
  });

  test('ignoring a signal keeps it ignored across a reload', async ({ page }) => {
    await openMonitoring(page);
    await rail(page, 'Europa (EU)').click();
    await page.getByRole('button', { name: /^Inbox/ }).click();

    await page.getByRole('button', { name: 'Negeren' }).first().click();

    await expect
      .poll(() => inboxCount(page, 'Europa (EU)'), { message: 'inbox after ignore' })
      .toBe(BASE_INBOX - 1);

    // "Negeren" was client-only state until it was given an endpoint; the
    // signal came back on the next load and the button did not do what it said.
    await reloadAndReauth(page);
    await openMonitoring(page);
    await expect
      .poll(() => inboxCount(page, 'Europa (EU)'), { message: 'inbox after reload' })
      .toBe(BASE_INBOX - 1);

    // An ignored signal is not quietly curated instead.
    expect(await confirmedCount(page, 'Europa (EU)')).toBe(BASE_CONFIRMED);
  });

  test('Reset demodata puts every source back to the fixture baseline', async ({ page }) => {
    await openMonitoring(page);
    await rail(page, 'Media & omgeving').click();
    await page.getByRole('button', { name: /^Inbox/ }).click();
    await page.getByRole('button', { name: 'Bevestigen' }).first().click();
    await expect.poll(() => inboxCount(page, 'Media & omgeving')).toBe(BASE_INBOX - 1);

    await page.getByRole('button', { name: 'Beheer', exact: true }).click();
    await page.getByRole('button', { name: 'Dossierbeheer' }).click();
    await page.getByRole('button', { name: /Reset demodata/ }).click();

    await openMonitoring(page);
    for (const source of SOURCES) {
      await expect
        .poll(() => confirmedCount(page, source), { message: `${source} confirmed after reset` })
        .toBe(BASE_CONFIRMED);
      await expect
        .poll(() => inboxCount(page, source), { message: `${source} inbox after reset` })
        .toBe(BASE_INBOX);
    }
  });

  test('the reset control is offered in mock mode only', async ({ page }) => {
    await page.getByRole('button', { name: 'Beheer', exact: true }).click();
    await page.getByRole('button', { name: 'Dossierbeheer' }).click();
    await expect(page.getByRole('button', { name: /Reset demodata/ })).toBeVisible();

    // Live has no demo state to reset, and offering it there would imply this
    // page can rewrite the database.
    await page.getByRole('button', { name: /Zet vlag om naar live/ }).click();
    await expect(page.getByRole('button', { name: /Reset demodata/ })).toBeHidden();
    await expect(page.getByRole('button', { name: /Terug naar mock/ })).toBeVisible();
  });
});
