import { expect, test } from '@playwright/test';
import { loginAsMedewerker } from './helpers/auth';
import { recordPendingCleanup } from './helpers/operaton-cleanup';
import { claimIfNeeded } from './helpers/tasks';

// Phase 1 item 4 — a second deep journey against a real backend-backed
// flow, alongside caseworker-journey.spec.ts's Kapvergunning roundtrip.
// Citizen (test-citizen-unive, a commercial org) submits a Zorgtoeslag
// (health care allowance) claim via AwbZorgtoeslagProcess -> DMN
// evaluation -> ZorgtoeslagProvisionalSubProcessE2E creates a "Case review"
// task. AwbZorgtoeslagProcess always runs under the toeslagen processing
// authority regardless of which channel the citizen came from
// (process.routes.ts overrides the municipality variable explicitly), so
// test-caseworker-toeslagen — not test-caseworker-unive, which doesn't
// exist — claims and completes it, which advances the shell to its own
// follow-up notify task, completed too for a finalized roundtrip. See
// tenant-isolation.spec.ts for the security-boundary check this same
// fixture is also used for.
//
// Uses two separate browser contexts (not the default `page` fixture) since
// this is a two-persona journey — citizen and caseworker must not share a
// Keycloak session.

test('citizen submits a zorgtoeslag claim and the toeslagen caseworker reviews it', async ({
  browser,
}) => {
  // ── Citizen: submit a new AwbZorgtoeslagProcess request ────────────────
  const citizenContext = await browser.newContext();
  const citizenPage = await citizenContext.newPage();
  await loginAsMedewerker(citizenPage, 'test-citizen-unive', 'test123');
  await expect(citizenPage).toHaveURL(/\/dashboard\/citizen$/);

  await citizenPage.getByRole('button', { name: /Zorgtoeslag/ }).click();
  // The service card leads to a calculator screen with two paths
  // ("Berekenen" = DMN preview only, "Aanvragen" = go straight to the
  // real, fully-prefilled submission form) — we want the latter.
  await citizenPage.getByRole('button', { name: 'Aanvragen', exact: true }).click();
  await citizenPage.getByRole('button', { name: 'Submit application' }).click();
  await expect(citizenPage.getByText('Aanvraag ingediend')).toBeVisible({ timeout: 15_000 });
  const businessKey = await citizenPage.locator('.font-mono').innerText();
  await citizenContext.close();

  // ── Caseworker: claim and complete the resulting review task ───────────
  const caseworkerContext = await browser.newContext();
  const caseworkerPage = await caseworkerContext.newPage();
  await loginAsMedewerker(caseworkerPage, 'test-caseworker-toeslagen', 'test123');
  await expect(caseworkerPage).toHaveURL(/\/dashboard\/caseworker$/);

  await caseworkerPage
    .getByRole('button', { name: /Case review: provisional entitlement decision/ })
    .first()
    .click();
  await claimIfNeeded(caseworkerPage);

  // Same form-js custom-combobox quirk as caseworker-journey.spec.ts — the
  // accessible textbox/label both target a visually-hidden, zero-size
  // input; the real clickable trigger is the sibling display div.
  await caseworkerPage.locator('[id$="-Field_ReviewAction-display"]').click();
  await caseworkerPage.getByText('Confirm (accept DMN outcome)').click();
  await caseworkerPage.getByRole('button', { name: 'Submit review' }).click();
  await expect(caseworkerPage.getByText('Taak voltooid')).toBeVisible({ timeout: 15_000 });

  // ── Caseworker: finish the roundtrip — AwbZorgtoeslagProcess's own
  // follow-up notify task (also candidateGroups="caseworker") is created
  // once the review completes; leaving it open would dangle the process.
  await caseworkerPage
    .getByRole('button', { name: /Phase 6: Notify applicant of decision/ })
    .first()
    .click();
  await claimIfNeeded(caseworkerPage);

  await caseworkerPage.locator('[id$="-Field_NotificationMethod-display"]').click();
  await caseworkerPage.getByText('Email', { exact: true }).click();
  await caseworkerPage.getByLabel('I confirm the applicant will be notified').check();
  await caseworkerPage.getByRole('button', { name: 'Confirm notification' }).click();
  await expect(caseworkerPage.getByText('Taak voltooid')).toBeVisible({ timeout: 15_000 });

  // Optional cleanup — see helpers/operaton-cleanup.ts and
  // global-teardown.ts for why this can't just prompt from here.
  recordPendingCleanup(businessKey);

  await caseworkerContext.close();
});
