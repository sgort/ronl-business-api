import { expect, test } from '@playwright/test';

import { isLocalTarget } from './helpers/target';

// A tenant with one board gets its own landing page at /?tenant=<id>. It has
// two medewerker buttons: the outlined top-bar "Inloggen" and the hero CTA
// "Inloggen als medewerker". Both lead to the same login, but strict mode
// still needs a name that matches exactly one of them — the lesson from
// v2026.09.13, when the Flevoland CTA made a substring "Inloggen" ambiguous.

test('?tenant=amsterdam shows the single-board landing with one exact "Inloggen"', async ({
  page,
}) => {
  await page.goto('/?tenant=amsterdam');

  await expect(page.getByText('Werkomgeving · Gemeente Amsterdam')).toBeVisible();
  await expect(page.getByRole('button', { name: /Inloggen als medewerker/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Inloggen', exact: true })).toHaveCount(1);
  await expect(page.getByRole('img', { name: 'Gemeente Amsterdam' })).toBeVisible();
  // No Flevoland grid and no Entra login on another tenant's page.
  await expect(page.getByRole('heading', { name: 'Beschikbare borden' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Flevoland-account/ })).toHaveCount(0);
});

test('an unknown tenant falls back to the Flevoland grid', async ({ page }) => {
  await page.goto('/?tenant=nowhere');

  await expect(page.getByRole('heading', { name: 'Beschikbare borden' })).toBeVisible();
});

test('the Amsterdam CTA logs a caseworker in to the Caseworker dashboard', async ({ page }) => {
  const formTimeout = isLocalTarget ? 10_000 : 30_000;
  const redirectTimeout = isLocalTarget ? 15_000 : 45_000;

  await page.goto('/?tenant=amsterdam');
  await page.getByRole('button', { name: /Inloggen als medewerker/ }).click();

  await page.locator('#username').waitFor({ timeout: formTimeout });
  // The CTA hints the tenant's test caseworker at the Keycloak form.
  await expect(page.locator('#username')).toHaveValue('test-caseworker-amsterdam');
  await page.locator('#password').fill('test123');
  await page.locator('#kc-login').click();

  await page.waitForURL(/\/dashboard\/caseworker$/, { timeout: redirectTimeout });
});

test('the Amsterdam DigiD link pre-fills the tenant test citizen', async ({ page }) => {
  const formTimeout = isLocalTarget ? 10_000 : 30_000;

  await page.goto('/?tenant=amsterdam');
  await page.getByRole('button', { name: 'Inwoner? Log in met DigiD' }).click();

  await page.locator('#username').waitFor({ timeout: formTimeout });
  await expect(page.locator('#username')).toHaveValue('test-citizen-amsterdam');
});
