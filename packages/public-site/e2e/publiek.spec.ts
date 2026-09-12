// packages/public-site/e2e/publiek.spec.ts
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Public site — search journey', () => {
  test('search → filter → detail → back preserves the filtered URL', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel(/Zoek in de publieke kennisbank/).fill('zorg');
    await page.getByRole('button', { name: 'Zoeken' }).click();
    await expect(page).toHaveURL(/\/zoeken\?q=zorg/);

    const regelCheckbox = page.getByRole('checkbox', { name: /Regel/ }).first();
    await regelCheckbox.waitFor({ timeout: 10_000 });
    await regelCheckbox.check();
    await expect(page).toHaveURL(/soort=regel/);

    const firstHit = page.locator('.pub-hit h3 a').first();
    await firstHit.waitFor({ timeout: 10_000 });
    const hitTitle = (await firstHit.textContent())?.trim();
    await firstHit.click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(hitTitle ?? '');

    await page.goBack();
    await expect(page).toHaveURL(/soort=regel/);
  });

  test('a deep link with filters pre-applied renders those filters checked', async ({ page }) => {
    await page.goto('/zoeken?q=zorg&soort=regel');
    const regelCheckbox = page.getByRole('checkbox', { name: /Regel/ }).first();
    await regelCheckbox.waitFor({ timeout: 10_000 });
    await expect(regelCheckbox).toBeChecked();
  });

  test('keyboard-only: skip link is the first Tab stop, search is reachable and submits', async ({
    page,
  }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    await expect(page.locator('.pub-skip')).toBeFocused();

    await page
      .getByLabel(/Zoek in de publieke kennisbank/)
      .first()
      .focus();
    await page.keyboard.type('bomen');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/zoeken\?q=bomen/);
  });
});

test.describe('Accessibility — axe-core, one scan per page type', () => {
  test('home has no critical/serious violations', async ({ page }) => {
    await page.goto('/');
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(
      results.violations.filter((v) => ['critical', 'serious'].includes(v.impact ?? ''))
    ).toEqual([]);
  });

  test('results page has no critical/serious violations', async ({ page }) => {
    await page.goto('/zoeken?q=zorg');
    await page
      .locator('.pub-hit')
      .first()
      .waitFor({ timeout: 10_000 })
      .catch(() => {});
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(
      results.violations.filter((v) => ['critical', 'serious'].includes(v.impact ?? ''))
    ).toEqual([]);
  });

  test('a detail page has no critical/serious violations', async ({ page }) => {
    await page.goto('/zoeken?q=zorg');
    await page.locator('.pub-hit h3 a').first().click();
    await page.waitForSelector('h1');
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(
      results.violations.filter((v) => ['critical', 'serious'].includes(v.impact ?? ''))
    ).toEqual([]);
  });
});
