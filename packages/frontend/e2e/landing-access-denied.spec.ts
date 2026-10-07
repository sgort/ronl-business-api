import { expect, test } from '@playwright/test';

import { isLocalTarget } from './helpers/target';

// A board chosen on the landing page that the account's role does not open
// ends in a dialog on that page, not on another dashboard. The Flevoland
// account button goes through Microsoft and cannot run here; the refusal it
// leads to is the same one the test-user login reaches, which this drives.

test('a board the role does not open shows the no-access dialog on the landing page', async ({
  page,
}) => {
  const formTimeout = isLocalTarget ? 10_000 : 30_000;
  const redirectTimeout = isLocalTarget ? 15_000 : 45_000;

  await page.goto('/');
  const wooCard = page.locator('article', { hasText: 'Woo-dashboard' });
  // Woo has no Entra ID role yet, so its card offers no Flevoland-account button.
  await expect(wooCard.getByRole('button', { name: /Flevoland-account/ })).toHaveCount(0);
  await wooCard.getByRole('button', { name: 'Openen', exact: true }).click();

  // A caseworker, who lacks woo-coordinatie, instead of the hinted Woo test user.
  await page.locator('#username').waitFor({ timeout: formTimeout });
  await page.locator('#username').fill('test-caseworker-flevoland');
  await page.locator('#password').fill('test123');
  await page.locator('#kc-login').click();

  const dialog = page.getByRole('dialog', { name: 'Geen toegang tot Woo-dashboard' });
  await expect(dialog).toBeVisible({ timeout: redirectTimeout });
  await expect(page).toHaveURL(/\/$/);
  await expect(dialog).toContainText('Bestuur & Verantwoording');

  await dialog.getByRole('button', { name: 'Naar mijn dashboard' }).click();
  await page.waitForURL(/\/dashboard\/caseworker$/, { timeout: redirectTimeout });
});

test('the boards with an Entra role offer the Flevoland account', async ({ page }) => {
  await page.goto('/');

  for (const title of ['Caseworker', 'PA-Cockpit', 'Infra-board']) {
    await expect(
      page.getByRole('button', { name: `${title} openen met uw Flevoland-account` })
    ).toBeVisible();
  }
});
