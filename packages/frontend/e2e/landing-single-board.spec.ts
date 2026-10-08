import { expect, test } from '@playwright/test';

import { isLocalTarget, isProductionTarget } from './helpers/target';

// A tenant with one board gets its own landing page at /<id>. It has two
// medewerker buttons: the outlined top-bar "Inloggen" and the hero CTA
// "Inloggen als medewerker". Both lead to the same login, but strict mode
// still needs a name that matches exactly one of them — the lesson from
// v2026.09.13, when the Flevoland CTA made a substring "Inloggen" ambiguous.

const TENANTS = [
  { id: 'amsterdam', name: 'Gemeente Amsterdam', primary: '#EC0000' },
  { id: 'heusden', name: 'Gemeente Heusden', primary: '#00505c' },
] as const;

for (const tenant of TENANTS) {
  test.describe(`/${tenant.id}`, () => {
    test('shows the single-board landing with one exact "Inloggen"', async ({ page }) => {
      await page.goto(`/${tenant.id}`);

      await expect(page.getByText(`Werkomgeving · ${tenant.name}`)).toBeVisible();
      await expect(page.getByRole('button', { name: /Inloggen als medewerker/ })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Inloggen', exact: true })).toHaveCount(1);
      await expect(page.getByRole('img', { name: tenant.name })).toBeVisible();
      // No Flevoland grid and no Entra login on another tenant's page.
      await expect(page.getByRole('heading', { name: 'Beschikbare borden' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: /Flevoland-account/ })).toHaveCount(0);
    });

    test('the CTA logs a caseworker in to the Caseworker dashboard, in the tenant colours', async ({
      page,
    }) => {
      const formTimeout = isLocalTarget ? 10_000 : 30_000;
      const redirectTimeout = isLocalTarget ? 15_000 : 45_000;

      await page.goto(`/${tenant.id}`);
      await page.getByRole('button', { name: /Inloggen als medewerker/ }).click();

      await page.locator('#username').waitFor({ timeout: formTimeout });
      // The CTA hints the tenant's test caseworker at the Keycloak form.
      await expect(page.locator('#username')).toHaveValue(`test-caseworker-${tenant.id}`);
      await page.locator('#password').fill('test123');
      await page.locator('#kc-login').click();

      await page.waitForURL(/\/dashboard\/caseworker$/, { timeout: redirectTimeout });
      await expect
        .poll(() =>
          page.evaluate(() =>
            document.documentElement.style.getPropertyValue('--color-primary').toLowerCase()
          )
        )
        .toBe(tenant.primary.toLowerCase());
    });

    test('the DigiD link pre-fills the tenant test citizen', async ({ page }) => {
      const formTimeout = isLocalTarget ? 10_000 : 30_000;

      await page.goto(`/${tenant.id}`);
      await page.getByRole('button', { name: 'Inwoner? Log in met DigiD' }).click();

      await page.locator('#username').waitFor({ timeout: formTimeout });
      await expect(page.locator('#username')).toHaveValue(`test-citizen-${tenant.id}`);
    });

    // What an unfurler sees: the raw HTML the host returns, no JavaScript.
    // Only a deployed build has the per-tenant pages
    // (vite-plugin-tenant-pages.ts); the dev server serves the root index.html
    // for every path.
    test.describe('link preview', () => {
      test.skip(isLocalTarget, 'tenant pages exist only in a deployed build');

      const card = `og-image-${tenant.id}-${isProductionTarget ? 'prod' : 'acc'}.png`;

      for (const path of [`/${tenant.id}`, `/${tenant.id}/`]) {
        test(`${path} serves the ${tenant.id} card`, async ({ request }) => {
          const response = await request.get(path);
          expect(response.status()).toBe(200);

          const image = /<meta property="og:image" content="([^"]*)"/.exec(
            await response.text()
          )?.[1];
          expect(image).toMatch(new RegExp(`/${card.replace(/\./g, '\\.')}$`));

          const png = await request.get(image ?? '');
          expect(png.status()).toBe(200);
          expect(png.headers()['content-type']).toContain('image/png');
        });
      }
    });
  });
}

test('a link from before tenant paths, /?tenant=amsterdam, lands on /amsterdam', async ({
  page,
}) => {
  await page.goto('/?tenant=amsterdam');

  await expect(page).toHaveURL(/\/amsterdam$/);
  await expect(page.getByText('Werkomgeving · Gemeente Amsterdam')).toBeVisible();
});

for (const path of ['/nowhere', '/flevoland']) {
  test(`${path} goes to the Flevoland grid at /`, async ({ page }) => {
    await page.goto(path);

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { name: 'Beschikbare borden' })).toBeVisible();
  });
}
