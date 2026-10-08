import { expect, test } from '@playwright/test';
import { loginAsMedewerker } from './helpers/auth';
import { recordPendingCleanup } from './helpers/operaton-cleanup';
import { instanceIdsForBusinessKey, openOwnTask } from './helpers/tasks';

// Gemeente Heusden's Heusdenpas, end to end. The citizen (test-citizen-heusden)
// applies through HeusdenpasAanvraagProcess, deployed under tenant heusden from
// linked-data-explorer's examples/organizations/heusden/swimlanes-for-rba. The
// caseworker (test-caseworker-heusden) checks the application is complete,
// reviews the outcome of HeusdenpasBeoordelingSubProcess (SVB ages, SZW
// bijstandsnorm and the Heusdenpas rules, all untenanted decisions reached
// through decisionRefTenantId="${null}") and informs the applicant. The citizen
// then sees the decided application, once, in Mijn aanvragen.
//
// Every step also passes a form with a field that is required but hidden: the
// partner's date of birth for a single applicant, the missing details when the
// application is complete, and the motivation when the caseworker accepts the
// outcome. form-js must skip validating a hidden field, or this journey stalls
// on a submit that never goes through.
//
// The applicant is single, 21 or older, without children, with a benefit from
// Baanbrekers, so the rules grant the pass automatically and not the
// Kindpakket (LDE's verified case 6).

test('citizen applies for a Heusdenpas and the caseworker decides it', async ({ browser }) => {
  test.slow(); // three logins and three task forms against a real engine

  // ── Citizen: apply ─────────────────────────────────────────────────────
  const citizenContext = await browser.newContext();
  const citizenPage = await citizenContext.newPage();
  await loginAsMedewerker(citizenPage, 'test-citizen-heusden', 'test123');
  await expect(citizenPage).toHaveURL(/\/dashboard\/citizen$/);

  await citizenPage.getByRole('button', { name: /Heusdenpas/ }).click();

  // The test-case dropdown fills every field, dates included (picking a date
  // of birth through flatpickr would need its internal API). This case is a
  // single applicant, which hides the required partner's date of birth.
  await citizenPage.getByLabel('Vul in met een testgeval').selectOption({
    label: 'Alleenstaand met uitkering van Baanbrekers: pas automatisch toegekend',
  });
  await expect(citizenPage.locator('[id$="-Field_003_hpa"]').first()).toHaveValue('Test Aanvrager');
  // The declaration is the person's own; the test case leaves it unticked.
  await citizenPage.locator('[id$="-Field_022_hpa"]').first().check();

  await citizenPage.getByRole('button', { name: 'Aanvraag indienen' }).click();
  await expect(citizenPage.getByText('Aanvraag ingediend')).toBeVisible({ timeout: 15_000 });
  const businessKey = await citizenPage.locator('.font-mono').innerText();
  expect(businessKey).toMatch(/^heusden-\d+$/);
  const shellInstances = await instanceIdsForBusinessKey(businessKey);
  await citizenContext.close();

  // ── Caseworker: complete, review, inform ───────────────────────────────
  const caseworkerContext = await browser.newContext();
  const caseworkerPage = await caseworkerContext.newPage();
  await loginAsMedewerker(caseworkerPage, 'test-caseworker-heusden', 'test123');
  await expect(caseworkerPage).toHaveURL(/\/dashboard\/caseworker$/);

  // Phase 3: "De aanvraag is volledig" is ticked by default, which hides the
  // required "ontbrekende gegevens".
  await openOwnTask(caseworkerPage, /Fase 3: Ontvankelijkheid beoordelen/, shellInstances);
  await caseworkerPage.getByRole('button', { name: 'Verzenden' }).click();
  await expect(caseworkerPage.getByText('Taak voltooid')).toBeVisible({ timeout: 15_000 });

  // Unlike Thuisbatterij, whose completeness check is automatic, phase 3 here
  // is a caseworker task: HeusdenpasBeoordelingSubProcess is only called once
  // it completes. So its instance exists only now, and the ids collected at
  // submission cannot match the review task.
  const ownInstances = await instanceIdsForBusinessKey(businessKey);

  // Phase 4+5: accept the rules' outcome; reviewAction defaults to "accept",
  // which hides the required motivation. Only the acknowledgement is needed.
  await openOwnTask(
    caseworkerPage,
    /Beoordeling behandelaar: recht op Heusdenpas en Kindpakket/,
    ownInstances
  );
  await caseworkerPage.locator('[id$="-Field_029_hpb"]').first().check();
  await caseworkerPage.getByRole('button', { name: 'Klaar' }).click();
  await expect(caseworkerPage.getByText('Taak voltooid')).toBeVisible({ timeout: 15_000 });

  // Phase 6: inform the applicant. form-js renders a select as a combobox
  // whose clickable part is the `-display` sibling.
  await openOwnTask(caseworkerPage, /Fase 6: Aanvrager informeren over besluit/, ownInstances);
  await caseworkerPage.locator('[id$="-Field_014_hpi-display"]').first().click();
  await caseworkerPage.locator('.fjs-dropdownlist-item', { hasText: 'E-mail' }).first().click();
  await caseworkerPage.locator('[id$="-Field_017_hpi"]').first().check();
  await caseworkerPage.getByRole('button', { name: 'Verzending bevestigen' }).click();
  await expect(caseworkerPage.getByText('Taak voltooid')).toBeVisible({ timeout: 15_000 });
  await caseworkerContext.close();

  // ── Citizen: the decided application, listed once ──────────────────────
  const backContext = await browser.newContext();
  const backPage = await backContext.newPage();
  await loginAsMedewerker(backPage, 'test-citizen-heusden', 'test123');
  await backPage.getByRole('button', { name: 'Mijn aanvragen' }).click();

  // Root instances only: the called HeusdenpasBeoordelingSubProcess carries
  // the same applicantId but is not a second application.
  const row = backPage.locator('div', { hasText: businessKey }).filter({
    has: backPage.getByText('Heusdenpas aanvragen'),
  });
  await expect(row.getByText('COMPLETED').first()).toBeVisible({ timeout: 15_000 });
  await expect(backPage.getByText('HeusdenpasBeoordelingSubProcess')).toHaveCount(0);

  await row.getByRole('button', { name: 'Bekijk beslissing' }).first().click();
  // The decision letter (heusdenpas_beschikking.document) carries the dossier
  // reference Phase 2 assigned.
  await expect(backPage.getByText(/HP-HEU-\d{4}-\d{6}/).first()).toBeVisible({
    timeout: 15_000,
  });

  recordPendingCleanup(businessKey);
  await backContext.close();
});
