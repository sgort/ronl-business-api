import { expect, test } from '@playwright/test';
import { loginAsMedewerker } from './helpers/auth';
import { recordPendingCleanup } from './helpers/operaton-cleanup';
import { instanceIdsForBusinessKey, openOwnTask } from './helpers/tasks';

// A third deep journey against a real backend-backed flow, alongside
// caseworker-journey.spec.ts (Kapvergunning) and zorgtoeslag-journey.spec.ts.
// Citizen (test-citizen-flevoland) applies for a Thuisbatterij subsidy via
// ThuisbatterijSubsidieAanvraagProcess -> AwbCompletenessCheck ->
// ThuisbatterijSubsidieDecisionSubProcessE2E, which evaluates the six-decision
// RechtEnHoogteSubsidieThuisbatterij DRD and raises a review task (named
// "Case review: …" before the swimlane redesign, "Beoordeling behandelaar: …"
// after it — the regexes below accept both) for the caseworker candidate group.
// The caseworker claims and completes it, then closes the shell's own
// follow-up notify task, same as the other two journeys.
//
// What this journey specifically guards: the process definitions are deployed
// under tenant-id 'flevoland' while the DMNs they call are deployed WITHOUT a
// tenant. Operaton resolves a business rule task's decisionRef inside the
// process instance's own tenant by default, so every businessRuleTask in both
// BPMNs carries camunda:decisionRefTenantId="${null}" to reach the shared,
// untenanted decisions. Drop that attribute and the engine refuses to
// instantiate at all — "no decision definition deployed with key
// 'AwbCompletenessCheck' and tenant-id 'flevoland'" — which surfaces as a 500
// from POST /v1/process/:key/start and an unexplained "aanvraag kon niet
// worden ingediend" in the UI. That is exactly the ACC outage this test exists
// to catch before a deploy repeats it.
//
// Uses two separate browser contexts (not the default `page` fixture) since
// this is a two-persona journey — citizen and caseworker must not share a
// Keycloak session.

test('citizen applies for a thuisbatterij subsidy and caseworker reviews it', async ({
  browser,
}) => {
  // ── Citizen: submit a new ThuisbatterijSubsidieAanvraagProcess request ──
  const citizenContext = await browser.newContext();
  const citizenPage = await citizenContext.newPage();
  await loginAsMedewerker(citizenPage, 'test-citizen-flevoland', 'test123');
  await expect(citizenPage).toHaveURL(/\/dashboard\/citizen$/);

  await citizenPage.getByRole('button', { name: /Subsidies/ }).click();

  // Every id is matched with "ends with" because form-js prefixes a random
  // per-render token: `fjs-form-<token>-Field_gemaakteKosten`. Same quirk
  // documented in caseworker-journey.spec.ts and rip-r21-journey.spec.ts.
  //
  // The schema already defaults provincieWoning, relatieTotWoning and
  // aanvragerType, so only the fields below need touching. The two
  // reedsGesubsidieerd* amounts default to 300000, which exhausts the
  // scheme's budget ceiling and makes the outcome depend on the DRD's
  // plafond arithmetic; zeroing them keeps this journey on the
  // subsidy-granted path deterministically.
  await citizenPage.locator('[id$="-Field_gemaakteKosten"]').first().fill('5000');
  await citizenPage.locator('[id$="-Field_reedsGesubsidieerdEigenaren"]').first().fill('0');
  await citizenPage.locator('[id$="-Field_reedsGesubsidieerdHuurders"]').first().fill('0');
  await citizenPage.locator('[id$="-Field_toestemmingEigenaar"]').first().check();
  await citizenPage.locator('[id$="-Field_rekeningNaamKomtOvereen"]').first().check();

  // aanvraagDatum is the one required field with no default. Typing into a
  // form-js datetime is unreliable — the input is a flatpickr whose id gets a
  // `-date` suffix and whose typed value is not necessarily committed to form
  // state; clicking a day is what flatpickr actually commits. Today always
  // exists and is always valid: the DRD reads date(aanvraagDatum).year for the
  // budget year, and the fixture's ceiling covers the current year.
  const dateField = citizenPage
    .locator('.fjs-form-field')
    .filter({ has: citizenPage.locator('[id$="-Field_aanvraagDatum-date"]') })
    .first();
  await dateField.locator('input.flatpickr-input').click();
  await dateField.locator('.flatpickr-day.today').first().click();

  await citizenPage.getByRole('button', { name: 'Vraag aan' }).click();
  await expect(citizenPage.getByText('Aanvraag ingediend')).toBeVisible({ timeout: 15_000 });
  const businessKey = await citizenPage.locator('.font-mono').innerText();
  // Resolved before the caseworker logs in: the shell instance plus its called
  // sub-process, so each task below can be picked out of a shared queue.
  const ownInstances = await instanceIdsForBusinessKey(businessKey);
  await citizenContext.close();

  // ── Caseworker: claim and complete the resulting review task ───────────
  const caseworkerContext = await browser.newContext();
  const caseworkerPage = await caseworkerContext.newPage();
  await loginAsMedewerker(caseworkerPage, 'test-caseworker-flevoland', 'test123');
  await expect(caseworkerPage).toHaveURL(/\/dashboard\/caseworker$/);

  await openOwnTask(
    caseworkerPage,
    /Case review: recht en hoogte subsidie|Beoordeling behandelaar: recht en hoogte subsidie/,
    ownInstances
  );

  // The review form shows the DMN outcome read-only and asks the caseworker to
  // confirm it. reviewAction already defaults to "accept", so the only
  // required input is the reviewChecked acknowledgement.
  await caseworkerPage.locator('[id$="-Field_026_tb"]').first().check();
  await caseworkerPage.getByRole('button', { name: 'Klaar' }).click();
  await expect(caseworkerPage.getByText('Taak voltooid')).toBeVisible({ timeout: 15_000 });

  // ── Caseworker: finish the roundtrip — the shell's own follow-up notify
  // task (also candidateGroups="caseworker") is created once the review
  // completes; leaving it open would dangle the process forever.
  await openOwnTask(
    caseworkerPage,
    /Phase 6: Notify applicant of decision|Fase 6: Aanvrager informeren over besluit/,
    ownInstances
  );

  // form-js renders `select` as a custom combobox: the labelled input is a
  // visually hidden, zero-size value holder, so the clickable trigger is the
  // sibling `-display` element and the options are plain divs with no
  // `option` role.
  await caseworkerPage.locator('[id$="-Field_NotificationMethod-display"]').first().click();
  await caseworkerPage.locator('.fjs-dropdownlist-item', { hasText: 'Email' }).first().click();
  await caseworkerPage.getByLabel('I confirm the applicant will be notified').check();
  await caseworkerPage.getByRole('button', { name: 'Confirm notification' }).click();
  await expect(caseworkerPage.getByText('Taak voltooid')).toBeVisible({ timeout: 15_000 });

  // Optional cleanup — local Operaton keeps full history by default, which
  // isn't always wanted across repeated local runs. global-teardown.ts asks
  // once, after all tests finish, in the main CLI process where stdin works.
  recordPendingCleanup(businessKey);

  await caseworkerContext.close();
});
