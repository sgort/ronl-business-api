import { expect, test } from '@playwright/test';
import { loginAsMedewerker } from './helpers/auth';
import { recordPendingCleanup } from './helpers/operaton-cleanup';
import { claimIfNeeded } from './helpers/tasks';

// Phase 1 item 4 — one deep journey against a real backend-backed flow.
// Citizen submits a Kapvergunning (tree felling permit) request via
// AwbShellProcess -> DMN evaluation -> TreeFellingPermitSubProcessE2E creates a
// "Case review" task for the caseworker candidate group. Caseworker claims
// and completes it, which advances AwbShellProcess itself to its own
// caseworker task (Task_Phase6_Notify, candidateGroups="caseworker") — that
// one gets completed too, for a genuinely finalized roundtrip rather than
// leaving a dangling notify step nobody ever closes. Runs against the local
// Operaton container (see docker-compose.yml) — deploying/undeploying
// bundles is a manual step done via the sibling linked-data-explorer app,
// not part of this test.
//
// Uses two separate browser contexts (not the default `page` fixture) since
// this is a two-persona journey — citizen and caseworker must not share a
// Keycloak session.

test('citizen submits a kapvergunning request and caseworker reviews it', async ({ browser }) => {
  // ── Citizen: submit a new AwbShellProcess request ──────────────────────
  const citizenContext = await browser.newContext();
  const citizenPage = await citizenContext.newPage();
  await loginAsMedewerker(citizenPage, 'test-citizen-flevoland', 'test123');
  await expect(citizenPage).toHaveURL(/\/dashboard\/citizen$/);

  await citizenPage.getByRole('button', { name: /Vergunningen/ }).click();
  await citizenPage.getByLabel('Tree diameter (cm)').fill('35');
  await citizenPage.getByRole('button', { name: 'Submit application' }).click();
  await expect(citizenPage.getByText('Aanvraag ingediend')).toBeVisible({ timeout: 15_000 });
  const businessKey = await citizenPage.locator('.font-mono').innerText();
  await citizenContext.close();

  // ── Caseworker: claim and complete the resulting review task ───────────
  const caseworkerContext = await browser.newContext();
  const caseworkerPage = await caseworkerContext.newPage();
  await loginAsMedewerker(caseworkerPage, 'test-caseworker-flevoland', 'test123');
  await expect(caseworkerPage).toHaveURL(/\/dashboard\/caseworker$/);

  await caseworkerPage
    .getByRole('button', { name: /Case review: tree felling permit decision/ })
    .first()
    .click();
  await claimIfNeeded(caseworkerPage);

  // form-js renders `select` fields as a custom combobox: the <label> and
  // accessible "textbox" role both target a visually-hidden, zero-size
  // native input (the real form value holder) — selectOption()/getByLabel()
  // resolve to it but can't click it (outside viewport). The actual visible
  // clickable trigger is a sibling <div class="fjs-select-display">, whose
  // id has a random per-render prefix (`fjs-form-<id>-Field_ReviewAction-display`),
  // hence the "ends with" attribute selector.
  await caseworkerPage.locator('[id$="-Field_ReviewAction-display"]').click();
  await caseworkerPage.getByText('Confirm (keep DMN decisions)').click();
  await caseworkerPage.getByLabel('No – replacement not required').check();
  await caseworkerPage.getByRole('button', { name: 'Submit review' }).click();
  await expect(caseworkerPage.getByText('Taak voltooid')).toBeVisible({ timeout: 15_000 });

  // ── Caseworker: finish the roundtrip — AwbShellProcess's own follow-up
  // notify task (also candidateGroups="caseworker") is created once the
  // review completes; leaving it open would dangle the process forever.
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

  // Optional cleanup — local Operaton keeps full history by default, which
  // isn't always wanted across repeated local runs. Can't prompt here: test
  // bodies run in a Playwright worker process without real TTY stdin (see
  // helpers/operaton-cleanup.ts). global-teardown.ts asks once, after all
  // tests finish, in the main CLI process where stdin actually works.
  recordPendingCleanup(businessKey);

  await caseworkerContext.close();
});
