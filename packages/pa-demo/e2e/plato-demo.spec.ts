import { test, expect, type Page } from '@playwright/test';

/**
 * The plato sales-demo script, driven end to end against the real vendored
 * shell — no mocking, no backend, no Keycloak. Modelled on
 * packages/frontend/e2e/pa-mock-journey.spec.ts (same idea: drive mock mode
 * for real rather than mocking the seam that broke last time), but plato
 * needs none of that spec's login/rate-limit/reload-reauth plumbing since
 * there is no backend and no session to lose.
 *
 * Selectors below were read off the running app (`npm run dev`, port 5176)
 * rather than guessed — see task-10-report.md for how. Two things the
 * vendored shell does NOT give this demo, discovered the same way:
 *
 *   - Every rail item and mode tab is a <button>, never an <a>/link. Asking
 *     for role "link" anywhere in this file would find nothing.
 *   - "Beheer" is a substring of "Beheerder" (the demo bar's role button), so
 *     the mode tab must be matched with `exact: true` or it also matches the
 *     role button whenever both are on screen.
 */

/** The demo bar's own role buttons, scoped so "Beheerder" never matches the
 * disabled, purely-reflective role readout inside Dossierbeheer once that
 * section is on screen (same button text, different element, both role
 * "button" — see DemoRoleContext.tsx / Dossierbeheer.tsx). */
function demoBarRole(page: Page, label: string) {
  return page.locator('.plato-bar-roles').getByRole('button', { name: label });
}

function railItem(page: Page, label: string) {
  return page.locator('.pac-rail-item', { hasText: label });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  // Every test gets its own browser context (Playwright's default), so
  // localStorage and the in-memory mock stores already start empty — this
  // click is not cleanup, it's a smoke check that the reset control itself
  // works, and it normalises on the Beheerder start role documented in
  // DemoRoleContext.tsx regardless of what a slow-loading previous run left
  // mid-flight.
  await page.getByRole('button', { name: 'Demo herstellen' }).click();
  await expect(demoBarRole(page, 'Beheerder')).toHaveAttribute('aria-pressed', 'true');
});

test('the demo bar declares itself and offers no Live toggle', async ({ page }) => {
  await expect(page.getByText(/demonstratie/i)).toBeVisible();
  // Dossierbeheer's own mock/live toggle ("Zet vlag om naar live →") is not
  // reachable from the page a visitor lands on, so this only needs to hold
  // before any navigation — the assertion below runs on the Vandaag tab.
  await expect(page.getByRole('button', { name: /live/i })).toHaveCount(0);
});

test('Beheer shows nine sections and no IOU or Hulpmiddelen', async ({ page }) => {
  await page.getByRole('button', { name: 'Beheer', exact: true }).click();
  for (const label of [
    'Dossierbeheer',
    'Nieuw dossier',
    'Afwegingskader',
    'Signaalbronnen',
    'Zoekcriteria',
    'Curatiepijplijn',
    'Notificaties',
    'Profiel',
    'Rollen & rechten',
  ]) {
    await expect(railItem(page, label)).toBeVisible();
  }
  // sections.allow.ts drops IOU and Hulpmiddelen entirely — DemoSectionRouter
  // never imports their components, so there is nothing to find here even
  // once the group they lived in.
  await expect(page.getByText('Feedback geven')).toHaveCount(0);
  await expect(page.getByText('Gereedschap')).toHaveCount(0);
});

test('switching role changes what Dossierbeheer permits', async ({ page }) => {
  // Regression guard for the subtlest bug in the project: the vendored shell
  // snapshots getUser() into React state at mount, so a naive role switch
  // would silently do nothing to Dossierbeheer's capabilities. Task 6 fixed
  // it (DemoSectionRouter consumes useDemoRole() so it re-renders, and reads
  // a fresh getUser() rather than the stale `user` prop) — this is the first
  // checked-in test that exercises the fix through the real UI rather than
  // narrating it in a report.
  await page.getByRole('button', { name: 'Beheer', exact: true }).click();
  await railItem(page, 'Dossierbeheer').click();

  const deleteFirstRow = page.locator('.pac-db-abtn.danger').first();
  const deleteCap = page.locator('.pac-db-cap', { hasText: 'Verwijderen' });

  // Beheerder (the demo's start role): full rights, including deleting a
  // dossier from the overview — both the live row action and the capability
  // readout say so.
  await expect(deleteFirstRow).toBeEnabled();
  await expect(deleteCap).toHaveClass(/\bon\b/);

  // Auteur: deleting is lost. Dossierbeheer's own role bar is disabled by
  // design (real caseworkers can't grant themselves rights) but still tracks
  // the demo bar live, and the actual "Verwijderen" button on a real row —
  // not just the capability chip — goes disabled with it.
  await demoBarRole(page, 'Auteur').click();
  await expect(page.locator('.pac-db-roleseg-btn.active')).toHaveText('Auteur');
  await expect(deleteCap).toHaveClass(/\boff\b/);
  await expect(deleteFirstRow).toBeDisabled();
});

test('an authored dossier appears immediately and does not survive a reload', async ({ page }) => {
  // Unlike the mock signal/search/notification store (mock-demo.store.ts,
  // persisted to localStorage), the mock dossier store is deliberately
  // in-memory only — see resetMockDossiers' comment in dossierbeheer.api.ts.
  // A reload already clears it by construction; this test is the checked-in
  // proof of that, not a guess carried over from the brief (which assumed
  // dossiers persist the way signals do — they don't, here).
  await page.getByRole('button', { name: 'Beheer', exact: true }).click();
  await railItem(page, 'Nieuw dossier').click();

  await page.locator('.pac-db-tpl', { hasText: 'Blanco dossier' }).click();
  await page.getByRole('button', { name: /Doorgaan met dit sjabloon/ }).click();

  const naam = `Demo-dossier ${Date.now()}`;
  const fields = page.locator('.pac-db-card').first().locator('input.pac-db-input');
  await fields.nth(0).fill(naam); // Naam
  await fields.nth(1).fill('E2E test-onderwerp'); // Onderwerp — required for a valid draft

  await page.getByRole('button', { name: 'Dossier aanmaken' }).click();
  await railItem(page, 'Dossierbeheer').click();
  await expect(page.getByText(naam)).toBeVisible();

  // Navigating away and back within the same session must not lose it — the
  // in-memory store is module-level, not component state.
  await page.getByRole('button', { name: 'Monitoring', exact: true }).click();
  await page.getByRole('button', { name: 'Beheer', exact: true }).click();
  await railItem(page, 'Dossierbeheer').click();
  await expect(page.getByText(naam)).toBeVisible();

  // A genuine reload re-executes every module, so the in-memory store comes
  // back empty — the same mechanism "Demo herstellen" relies on.
  await page.reload();
  await page.getByRole('button', { name: 'Beheer', exact: true }).click();
  await railItem(page, 'Dossierbeheer').click();
  await expect(page.getByText(naam)).toHaveCount(0);
});

test('the page issues no request to any backend', async ({ page }) => {
  // The behavioural counterpart to the CSP and the build-time bundle gate:
  // watch the real network rather than trusting the configuration. Route
  // taken deliberately touches the one surface with a real live/mock branch
  // in its source (AgendaView.tsx / fetchAgenda, gated on
  // VITE_PA_AGENDA_MOCK) — see task-10-report.md for the red probe that
  // proves this assertion is load-bearing rather than decorative.
  const offSite: string[] = [];
  page.on('request', (req) => {
    const url = new URL(req.url());
    if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') offSite.push(req.url());
  });

  await page.getByRole('button', { name: 'Monitoring', exact: true }).click();
  await railItem(page, 'Agenda').click();
  await railItem(page, 'Politiek (NL)').click();
  await page.waitForTimeout(1000);

  expect(offSite).toEqual([]);
});
