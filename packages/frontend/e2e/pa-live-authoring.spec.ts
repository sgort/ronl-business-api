import { expect, test, type Page } from '@playwright/test';
import { loginAsMedewerker } from './helpers/auth';
import { watchForRateLimit } from './helpers/rate-limit';

/**
 * PA authoring against the live backend — the real routes and a real database.
 *
 * Mock and live are two implementations of the same operations: confirming a
 * signal writes to mock-demo.store in one and POSTs to /pa/signals/:id/confirm
 * in the other. The mock half broke twice this week and both times it took
 * manual testing to notice, because the unit suites stub the very seam that was
 * wrong. The live half carries exactly the same risk and had no end-to-end
 * cover at all.
 *
 * Deliberately limited to authoring — dossiers and zoekcriteria — because that
 * is the part of live that is deterministic. Curation is not: it depends on TK
 * OData, the EU RSS feed and the media aggregator, and TK alone measured 10s
 * and 48s for the same query minutes apart. An assertion about signals arriving
 * would be flaky by construction, and a flaky end-to-end test teaches people to
 * re-run rather than read.
 *
 * Everything is created with a run-unique stamp and removed again in afterEach,
 * including when the test fails part-way. Nothing global is reset: the
 * pa:reset-data script is a feature of the product, not test tooling, and a
 * test has no business clearing someone's authored work.
 */

const stamp = () => `e2e-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

/** Names created by the running test, cleaned up afterwards. */
let createdDossier: string | null = null;
let createdTerm: string | null = null;

async function openBeheer(page: Page, section: string) {
  await page.getByRole('button', { name: 'Beheer', exact: true }).click();
  await page.getByRole('button', { name: section, exact: true }).click();
}

/**
 * A genuine cold load, then back in.
 *
 * keycloak.authenticated lives in memory and the app does not re-init it on a
 * direct page load, so a reload lands on "Inloggen vereist" — which is what
 * makes it worth doing: every module-level cache is gone, so anything still on
 * screen afterwards came back from the database rather than from React state.
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

let rateLimit: ReturnType<typeof watchForRateLimit>;

test.describe('PA cockpit — live authoring', () => {
  test.beforeEach(async ({ page }) => {
    createdDossier = null;
    createdTerm = null;

    // Force live before the app boots. Setting it afterwards would need a
    // reload to take effect, and that reload signs you out.
    await page.addInitScript(() => localStorage.setItem('paV2.mock', '0'));
    rateLimit = watchForRateLimit(page);
    await loginAsMedewerker(page, 'test-pa-flevoland', 'test123');
  });

  test.afterEach(async ({ page }) => {
    // Read now, thrown at the very end: cleanup still has to run, and a
    // throttled run is exactly the one most likely to have left litter.
    const throttled = rateLimit.hit();

    // Tolerant of a test that failed before creating something, but never
    // silent: a cleanup that quietly does nothing leaves litter in a shared
    // database and looks exactly like a cleanup that worked. An earlier
    // version of this guarded with `if (await count())` straight after
    // navigating — count() takes an immediate snapshot rather than waiting, so
    // it read 0 before the list had loaded and skipped every deletion.
    async function removeVia(
      section: string,
      name: string,
      gone: () => ReturnType<typeof page.locator>,
      remove: () => Promise<void>
    ) {
      try {
        await openBeheer(page, section);
        await expect(gone().first()).toBeVisible({ timeout: 10_000 });
        await remove();
        await expect(gone()).toHaveCount(0, { timeout: 15_000 });
      } catch (err) {
        console.warn(`[cleanup] could not remove ${name} from ${section}:`, err);
      }
    }

    if (createdTerm) {
      const term = createdTerm;
      await removeVia(
        'Zoekcriteria',
        term,
        () => page.locator('.pac-zc-card', { hasText: term }),
        async () => {
          await page
            .locator('.pac-zc-card', { hasText: term })
            .first()
            .getByRole('button', { name: 'Verwijderen' })
            .click();
        }
      );
    }

    if (createdDossier) {
      const name = createdDossier;
      await removeVia(
        'Dossierbeheer',
        name,
        () => page.locator('.pac-db-row', { hasText: name }),
        async () => {
          await page
            .locator('.pac-db-row', { hasText: name })
            .first()
            .getByRole('button', { name: 'Verwijderen' })
            .click();
          // Confirm-by-typing: the button stays disabled until the name is
          // retyped exactly. Take it from the dialog's own placeholder rather
          // than re-deriving it, so the two cannot disagree.
          const input = page.locator('input[placeholder]').last();
          await input.fill((await input.getAttribute('placeholder')) ?? name);
          await page.getByRole('button', { name: 'Definitief verwijderen' }).click();
        }
      );
    }

    if (throttled) throw new Error(throttled);
  });

  test('an authored dossier and zoekcriterium persist across a reload', async ({ page }) => {
    const suffix = stamp();
    const dossierName = `E2E dossier ${suffix}`;
    const term = `e2eterm${suffix.replace(/-/g, '')}`;

    // ── Create a dossier ────────────────────────────────────────────────
    await openBeheer(page, 'Dossierbeheer');
    await page.getByRole('button', { name: '+ Nieuw dossier' }).click();
    await page.locator('button.pac-db-tpl').first().click();
    await page.getByRole('button', { name: /Doorgaan met dit sjabloon/ }).click();

    await page.getByPlaceholder('bv. Stikstof & landbouwtransitie').fill(dossierName);
    createdDossier = dossierName;
    await page.getByRole('button', { name: 'Dossier aanmaken' }).click();

    await expect(page.getByText(dossierName, { exact: false }).first()).toBeVisible({
      timeout: 15_000,
    });

    // ── Create a zoekcriterium ──────────────────────────────────────────
    await openBeheer(page, 'Zoekcriteria');
    await page.getByRole('button', { name: '+ Nieuw zoekcriterium' }).click();

    await page.getByPlaceholder('term toevoegen…').fill(term);
    await page.getByPlaceholder('term toevoegen…').press('Enter');
    // The toggle's accessible name is "TK Tweede Kamer" — label plus the full
    // source name in a nested span — so match on the id-bearing class instead.
    await page.locator('button.pac-zc-toggle.tk').click();

    const add = page.getByRole('button', { name: 'Criterium toevoegen' });
    await expect(add).toBeEnabled();
    createdTerm = term;
    await add.click();

    await expect(page.getByText(term, { exact: false }).first()).toBeVisible({ timeout: 15_000 });

    // ── The point: both came from the database, not from React state ────
    await reloadAndReauth(page);
    await openBeheer(page, 'Zoekcriteria');
    await expect(page.getByText(term, { exact: false }).first()).toBeVisible({ timeout: 15_000 });

    await openBeheer(page, 'Dossierbeheer');
    await expect(page.getByText(dossierName, { exact: false }).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test('live shows authored work and mock shows fixtures, from the same screen', async ({
    page,
  }) => {
    const suffix = stamp();
    const dossierName = `E2E dossier ${suffix}`;

    await openBeheer(page, 'Dossierbeheer');
    await page.getByRole('button', { name: '+ Nieuw dossier' }).click();
    await page.locator('button.pac-db-tpl').first().click();
    await page.getByRole('button', { name: /Doorgaan met dit sjabloon/ }).click();
    await page.getByPlaceholder('bv. Stikstof & landbouwtransitie').fill(dossierName);
    createdDossier = dossierName;
    await page.getByRole('button', { name: 'Dossier aanmaken' }).click();
    await expect(page.getByText(dossierName, { exact: false }).first()).toBeVisible({
      timeout: 15_000,
    });

    // Mock must not see it — the separation this all exists for. Before the
    // seeds were made opt-in, live was mock plus whatever had been authored,
    // and the two modes could not be told apart.
    await page.getByRole('button', { name: /Terug naar mock/ }).click();
    await expect(page.locator('.pac-db-row', { hasText: dossierName })).toHaveCount(0, {
      timeout: 10_000,
    });
    await expect(page.getByText('Stikstof & landbouwtransitie')).toBeVisible();

    // And back: the authored dossier returns, the fixtures go.
    await page.getByRole('button', { name: /Zet vlag om naar live/ }).click();
    await expect(page.getByText(dossierName, { exact: false }).first()).toBeVisible({
      timeout: 10_000,
    });
  });
});
