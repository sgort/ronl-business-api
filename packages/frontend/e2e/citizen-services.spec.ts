import { expect, test } from '@playwright/test';
import { loginAsMedewerker } from './helpers/auth';

// #344: the cards follow where each service's process is deployed. Amsterdam
// deploys none of its own, so its citizens get only the cross-tenant
// Zorgtoeslag (handled by Dienst Toeslagen); Heusden deploys the Heusdenpas;
// Flevoland deploys the Kapvergunning and the Thuisbatterij, which nobody
// else is offered.
for (const [username, expected] of [
  ['test-citizen-amsterdam', ['Zorgtoeslag']],
  ['test-citizen-heusden', ['Zorgtoeslag', 'Heusdenpas']],
  ['test-citizen-flevoland', ['Zorgtoeslag', 'Vergunningen', 'Subsidies']],
] as const) {
  test(`${username} sees exactly ${expected.join(', ')}`, async ({ page }) => {
    await loginAsMedewerker(page, username, 'test123');
    await expect(page).toHaveURL(/\/dashboard\/citizen$/);

    const cards = page.getByRole('button').filter({ hasText: 'Aanvragen →' });
    await expect(cards).toHaveCount(expected.length, { timeout: 15_000 });
    for (const [i, label] of expected.entries()) {
      await expect(cards.nth(i)).toContainText(label);
    }
    await expect(page.getByRole('button', { name: 'Mijn toestemming' })).toHaveCount(0);
  });
}
