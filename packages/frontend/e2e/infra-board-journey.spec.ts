import { expect, test, type Locator, type Page } from '@playwright/test';
import { loginAsMedewerker } from './helpers/auth';
import { watchForRateLimit } from './helpers/rate-limit';

/**
 * The infra board, driven end to end against the running stack.
 *
 * The board had no E2E cover at all. That is a gap rather than a decision: it
 * has the same shape as the PA cockpit — a section router, a command palette,
 * panels reading through hooks — and so the same exposure to the class of
 * defect the PA work turned up repeatedly. Those were not logic errors. A
 * saved write that was a bare `return;`, a confirm that built an object and
 * discarded it, a panel hardcoded to empty, a resource fetched once at mount.
 * Every one passed its component tests, because a component test mocks the
 * very seam that broke.
 *
 * ── What this spec deliberately does NOT assert ──────────────────────────
 *
 * Any number on this board. Unlike the PA cockpit, the infra board has no
 * mock/live switch: it *blends* the two on every surface. InfraBoardDashboard
 * builds `allProjects` from live Fase-1 instances plus whatever mock portfolio
 * rows do not collide with them, and `combinedCounts` from mock phase counts
 * combined with live ones. So the Portfolio rail, the Beheer phase badges and
 * the Mijn-dag stats all move with Operaton state — which the caseworker and
 * zorgtoeslag journeys in this same suite actively mutate. Measured during
 * development: Portfolio reported R2.2=5 while Beheer reported R2.2=4 in the
 * same session, because the two are composed differently.
 *
 * Asserting a count here would be asserting the mood of a shared engine. What
 * is left is still worth having, and is what the board is actually made of:
 * every werkmodus reaches its own surface, every catalogued phase has a rail
 * entry that opens, every section renders real content rather than an empty
 * shell, and a full sweep produces no failed request and no console error.
 *
 * That last pair is doing more work than it looks. The board is read-only —
 * `infra.api` exports only `use*` readers, no writer — so there is no state
 * change to assert survives a reload. What can break is a panel that renders
 * nothing, a hook wired to an endpoint that 500s, or a section that throws;
 * none of which a mocked component test can see, and all of which this catches.
 */

/**
 * The twelve RIP phases, written out rather than imported from
 * `rip-phases.catalog`.
 *
 * Deliberate: the rail is *built from* that catalogue, so asserting the UI
 * matches it proves nothing — both sides move together and the test passes
 * whatever the catalogue says. An earlier version of this spec did exactly
 * that. It was caught by renaming R6.1 to a phase that cannot exist and
 * watching the test pass anyway, which is the same trap `expectMockNamesRealExports`
 * carries a warning about.
 *
 * This list is a second, independent statement of the RIP model. If the
 * catalogue changes, this fails and someone has to agree the change was
 * intended — which is the point.
 */
const PHASE_CODES = [
  'R2.1',
  'R2.2',
  'R2.3',
  'R2.4',
  'R3.1',
  'R3.2',
  'R4.1',
  'R5.1',
  'R5.2',
  'R5.3',
  'R5.4',
  'R6.1',
] as const;

/** Every rail button, scoped to the group whose label matches. */
function railGroup(page: Page, label: string): Locator {
  return page.locator('.v2-rail-group').filter({
    has: page.locator('.v2-rail-group-label', { hasText: label }),
  });
}

/** A rail button anywhere in the rail. */
function railItem(page: Page, label: string): Locator {
  return page.locator('.v2-rail button', { hasText: label });
}

async function openMode(page: Page, label: string) {
  await page.locator('.v2-tabs button', { hasText: label }).first().click();
}

let rateLimit: ReturnType<typeof watchForRateLimit>;

test.describe('Infra board', () => {
  test.beforeEach(async ({ page }) => {
    rateLimit = watchForRateLimit(page);
    await loginAsMedewerker(page, 'test-infra-flevoland', 'test123');
    await expect(page.locator('.v2-tabs button', { hasText: 'Mijn dag' })).toBeVisible();
  });

  test.afterEach(() => {
    // Sweeping every section costs a lot of requests, so this suite is the
    // most likely in the repo to run into the API budget. A throttled run is
    // not a valid run; without this it would surface as an empty panel.
    const throttled = rateLimit.hit();
    if (throttled) throw new Error(throttled);
  });

  test('opens on Mijn dag with all three werkmodi available', async ({ page }) => {
    await expect(page.locator('.v2-tabs button')).toHaveText(['Mijn dag', 'Portfolio', 'Beheer']);

    // Landing surface, not a blank shell behind a spinner.
    await expect(page.getByRole('heading', { name: /Goede(morgen|middag|avond)/ })).toBeVisible();
    await expect(railItem(page, 'Overzicht')).toBeVisible();
    await expect(railItem(page, 'Project-updates')).toBeVisible();
  });

  test('each werkmodus reaches its own surface, and back again', async ({ page }) => {
    await openMode(page, 'Portfolio');
    await expect(page.getByRole('heading', { name: 'Projectenportfolio' })).toBeVisible();

    await openMode(page, 'Beheer');
    await expect(page.getByRole('heading', { name: 'Faseladder' })).toBeVisible();

    // Returning must re-render Mijn dag rather than leave Beheer's panel up —
    // the section router switches on mode, so a stale panel here would mean
    // the two have drifted out of step.
    await openMode(page, 'Mijn dag');
    await expect(page.getByRole('heading', { name: /Goede(morgen|middag|avond)/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Faseladder' })).toHaveCount(0);
  });

  test('the rail carries all twelve RIP phases, and each opens its own detail', async ({
    page,
  }) => {
    test.slow(); // twelve navigations against a live engine

    await openMode(page, 'Beheer');
    await expect(page.getByRole('heading', { name: 'Faseladder' })).toBeVisible();

    for (const code of PHASE_CODES) {
      const entry = railItem(page, code);
      await expect(entry.first(), `${code} missing from the rail`).toBeVisible();
      await entry.first().click();

      // The detail heading carries the code. The status chip beside it
      // ("Gedeployed" / "In ontwerp" / "Niet gemodelleerd") is deliberately
      // not asserted: it reflects which BPMNs happen to be deployed right now.
      await expect(
        page.locator('main h1, main h2').first(),
        `${code} detail did not open`
      ).toContainText(code);
    }

    // No thirteenth, and no phase quietly dropped: the rail's phase entries are
    // exactly these twelve.
    const railCodes = await page.locator('.v2-rail .pb-rail-code').allInnerTexts();
    expect(railCodes.map((c) => c.trim())).toEqual([...PHASE_CODES]);
  });

  test('every account, IOU and hulpmiddelen section renders real content', async ({ page }) => {
    test.slow();
    await openMode(page, 'Beheer');

    // Anchors chosen to be recognisable but not brittle — a word the section
    // exists to show, rather than a full sentence of copy.
    const sections: Array<{ group: string; item: string; anchor: RegExp }> = [
      { group: 'Account', item: 'Profiel', anchor: /PERSOONLIJKE GEGEVENS/i },
      { group: 'Account', item: 'Rollen & rechten', anchor: /TOEGEWEZEN ROLLEN/i },
      { group: 'IOU', item: 'Gebruiksscenario indienen', anchor: /Gebruiksscenario/i },
      { group: 'IOU', item: 'Feedback geven', anchor: /Feedback/i },
      { group: 'IOU', item: 'Actieve zaken', anchor: /Actieve zaken/i },
      { group: 'IOU', item: 'Archief', anchor: /Archief/i },
      { group: 'Hulpmiddelen', item: 'Gereedschap', anchor: /CPSV Editor/i },
    ];

    for (const { group, item, anchor } of sections) {
      // Scoped by group on purpose: "Archief" is the label of two different
      // rail entries — the RIP archive above the IOU block, and the IOU one
      // inside it — and an unscoped match would silently take whichever came
      // first in the DOM.
      await railGroup(page, group).locator('button', { hasText: item }).first().click();
      await expect(page.locator('main'), `${group} > ${item} rendered nothing`).toContainText(
        anchor,
        { timeout: 15_000 }
      );
    }
  });

  test('the RIP archive opens from its own rail entry, not the IOU one', async ({ page }) => {
    await openMode(page, 'Beheer');

    // The RIP archive sits outside any labelled group — it is hand-rendered
    // with the Faseladder and phase buttons — so it is the Archief that is NOT
    // inside the IOU group.
    const iouArchief = railGroup(page, 'IOU').locator('button', { hasText: 'Archief' });
    const allArchief = railItem(page, 'Archief');
    await expect(allArchief).toHaveCount((await iouArchief.count()) + 1);

    await allArchief.first().click();
    await expect(page.locator('main')).not.toHaveText('');
  });

  test('a full sweep produces no failed request and no console error', async ({ page }) => {
    test.slow();

    const failed: string[] = [];
    const errors: string[] = [];
    page.on('response', (r) => {
      // 429 is reported by the afterEach tripwire with a better message.
      if (r.status() >= 400 && r.status() !== 429) {
        failed.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`);
      }
    });
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text().slice(0, 200));
    });

    for (const mode of ['Mijn dag', 'Portfolio', 'Beheer']) {
      await openMode(page, mode);
      await expect(page.locator('main')).not.toHaveText('');

      const labels = await page.locator('.v2-rail button').allInnerTexts();
      for (const raw of labels) {
        const label = raw.replace(/\s+/g, ' ').trim();
        if (!label) continue;
        // Re-resolved by text each time rather than held as an index: the rail
        // re-renders on navigation, and an index captured before the click
        // points at a different button afterwards. A probe written that way
        // reported two sections as empty that were rendering fine.
        const button = page.locator('.v2-rail button', { hasText: label }).first();
        if (!(await button.isVisible().catch(() => false))) continue;
        await button.click();
        await expect(page.locator('main')).not.toHaveText('');
      }
    }

    expect(failed, `failed requests during the sweep: ${failed.join(', ')}`).toEqual([]);
    expect([...new Set(errors)], 'console errors during the sweep').toEqual([]);
  });

  test('the command palette jumps straight to a section', async ({ page }) => {
    await page.getByRole('button', { name: /Spring naar/ }).click();

    const input = page.getByPlaceholder(/Spring naar weergave of project/);
    await expect(input).toBeVisible();
    await input.fill('Faseladder');

    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Faseladder' })).toBeVisible();
    await expect(input).toHaveCount(0);
  });
});
