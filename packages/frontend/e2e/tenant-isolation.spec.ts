import { expect, test } from '@playwright/test';
import { loginAsMedewerker } from './helpers/auth';
import { recordPendingCleanup } from './helpers/operaton-cleanup';
import { claimIfNeeded } from './helpers/tasks';

// Phase 1 item 5 — tenant isolation spot-check.
//
// Uses AwbZorgtoeslagProcess as the cross-tenant fixture: it always runs
// under the toeslagen processing authority regardless of which channel the
// citizen came from (process.routes.ts explicitly overrides the
// `municipality` variable to 'toeslagen', recording the real submitter's
// tenant separately as `originTenantId`). Task listing is genuinely
// tenant-filtered server-side (operaton.service.ts's
// `processVariables: municipality_eq_${tenantId}`), so this is a real
// security boundary, not a guess — test-citizen-unive (a commercial org)
// submits, and only test-caseworker-toeslagen should ever see the
// resulting task; test-caseworker-flevoland must not.

const REVIEW_TASK_NAME = 'Case review: provisional entitlement decision';

test('a Zorgtoeslag task is only visible to the toeslagen caseworker, not other tenants', async ({
  browser,
}) => {
  // Citizen: submit a claim. The start form is fully prefilled by
  // Dashboard.tsx's own initialData (calculation date, computed ages,
  // insurance defaults) — submitting immediately is the intended flow,
  // no fields to fill.
  const citizenContext = await browser.newContext();
  const citizenPage = await citizenContext.newPage();
  await loginAsMedewerker(citizenPage, 'test-citizen-unive', 'test123');
  await expect(citizenPage).toHaveURL(/\/dashboard\/citizen$/);

  await citizenPage.getByRole('button', { name: /Zorgtoeslag/ }).click();
  // The service card leads to a calculator screen with two paths
  // ("Berekenen" = preview only, "Aanvragen" = go straight to the real
  // submission form) — we want the latter.
  await citizenPage.getByRole('button', { name: 'Aanvragen', exact: true }).click();
  await citizenPage.getByRole('button', { name: 'Submit application' }).click();
  await expect(citizenPage.getByText('Aanvraag ingediend')).toBeVisible({ timeout: 15_000 });
  const businessKey = await citizenPage.locator('.font-mono').innerText();
  await citizenContext.close();

  // Isolation check: a Flevoland caseworker must not see this
  // Toeslagen-scoped task. Wait for the list to actually load first, so
  // absence means "filtered out server-side", not "hasn't rendered yet".
  const flevolandContext = await browser.newContext();
  const flevolandPage = await flevolandContext.newPage();
  await loginAsMedewerker(flevolandPage, 'test-caseworker-flevoland', 'test123');
  await expect(flevolandPage).toHaveURL(/\/dashboard\/caseworker$/);
  await expect(flevolandPage.getByRole('heading', { name: 'Alle taken' })).toBeVisible();
  await expect(flevolandPage.getByText(REVIEW_TASK_NAME)).not.toBeVisible();
  await flevolandContext.close();

  // Toeslagen caseworker: this is their task — claim and complete both
  // steps (review, then the shell's own follow-up notify task), for a
  // finalized roundtrip.
  const toeslagenContext = await browser.newContext();
  const toeslagenPage = await toeslagenContext.newPage();
  await loginAsMedewerker(toeslagenPage, 'test-caseworker-toeslagen', 'test123');
  await expect(toeslagenPage).toHaveURL(/\/dashboard\/caseworker$/);

  await toeslagenPage
    .getByRole('button', { name: new RegExp(REVIEW_TASK_NAME) })
    .first()
    .click();
  await claimIfNeeded(toeslagenPage);

  await toeslagenPage.locator('[id$="-Field_ReviewAction-display"]').click();
  await toeslagenPage.getByText('Confirm (accept DMN outcome)').click();
  await toeslagenPage.getByRole('button', { name: 'Submit review' }).click();
  await expect(toeslagenPage.getByText('Taak voltooid')).toBeVisible({ timeout: 15_000 });

  await toeslagenPage
    .getByRole('button', { name: /Phase 6: Notify applicant of decision/ })
    .first()
    .click();
  await claimIfNeeded(toeslagenPage);

  await toeslagenPage.locator('[id$="-Field_NotificationMethod-display"]').click();
  await toeslagenPage.getByText('Email', { exact: true }).click();
  await toeslagenPage.getByLabel('I confirm the applicant will be notified').check();
  await toeslagenPage.getByRole('button', { name: 'Confirm notification' }).click();
  await expect(toeslagenPage.getByText('Taak voltooid')).toBeVisible({ timeout: 15_000 });

  recordPendingCleanup(businessKey);
  await toeslagenContext.close();
});
