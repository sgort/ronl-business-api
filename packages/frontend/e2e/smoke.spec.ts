import { expect, test } from '@playwright/test';

test('app loads at / and renders LoginChoice with no console errors', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await page.goto('/');

  await expect(
    page.getByRole('heading', { name: 'Vier borden voor het werk van de provincie.' })
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Beschikbare borden' })).toBeVisible();

  expect(consoleErrors).toEqual([]);
});
