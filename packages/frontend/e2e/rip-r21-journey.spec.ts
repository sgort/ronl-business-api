import { expect, test, type Page } from '@playwright/test';
import { loginAsMedewerker } from './helpers/auth';
import { recordPendingCleanup } from './helpers/operaton-cleanup';
import { watchForRateLimit } from './helpers/rate-limit';

/**
 * RIP fase 1 (R2.1) end to end — start the phase, work every task, reach
 * "Fase 1 voltooid → R2.2".
 *
 * This is the journey the infra board exists for, and the first one that
 * exercises the board as a *process* surface rather than a set of panels.
 * `infra-board-journey.spec.ts` covers the shell; this covers the work.
 *
 * ── Why the task order is not hard-coded ────────────────────────────────
 *
 * RipR21Process is not a straight line. After the intake report is accorded
 * it fans out — risicodossier, planning, PSU organiseren, and the automatic
 * Relatics workspace service task run alongside each other — so "the next
 * task" depends on how the engine schedules the branches. Rather than assert
 * an order the process does not guarantee, this drives whatever task is open:
 * read the name, look up how to fill its form, submit, repeat. The process
 * decides the order; the test only decides the answers.
 *
 * The three gateways are answered for the happy path — intake akkoord "ja",
 * both accorderingen "approved". The rework loops (Verbeteren kwaliteit, and
 * the two rejections) are deliberately not exercised here; they deserve their
 * own test rather than making this one conditional.
 *
 * ── What it asserts at the end ──────────────────────────────────────────
 *
 * Deltas, never absolutes. The Faseladder's "Gereed" and "Klaar" columns count
 * every instance in a shared engine, and other specs in this suite add their
 * own. So the baseline is read first and the assertion is +1 live on R2.1
 * Gereed and +1 live on R2.2 Klaar — the latter being the actual point: a
 * completed R2.1 is what makes a project ready for R2.2.
 *
 * Note those live counts come from `useLivePhaseCounts`, which is genuinely
 * derived from process state. PhaseDetail's own "Projecten die R2.x kunnen
 * starten" list is a different computation reading mock fixtures only, so it
 * does NOT move when this test completes — which is why nothing here asserts
 * against it.
 */

/** How to fill one form-js field, keyed by the field id in the .form file. */
type Field =
  | { id: string; kind: 'text'; value: string }
  | { id: string; kind: 'datetime' }
  | { id: string; kind: 'select'; option: RegExp }
  | { id: string; kind: 'radio'; option: RegExp }
  | { id: string; kind: 'check' };

interface TaskSpec {
  /** Matches the task name as Operaton reports it. */
  match: RegExp;
  fields: Field[];
  /** The form's own submit button — every RIP form labels it differently. */
  submit: RegExp;
}

const TEXT = 'E2E — automated run';

/**
 * One entry per user task in RipR21Process. Only required fields are filled:
 * an optional field left blank is a truer reflection of how the form is used,
 * and keeps the run shorter.
 */
const TASK_SPECS: TaskSpec[] = [
  {
    match: /Aanleveren Projectplan/i,
    submit: /Submit intake/i,
    fields: [
      { id: 'Field_ProjectNumber', kind: 'text', value: 'E2E-001' },
      { id: 'Field_ProjectName', kind: 'text', value: 'E2E testproject' },
      { id: 'Field_ProjectType', kind: 'select', option: /onderhoud/i },
      { id: 'Field_Department', kind: 'select', option: /Infrastructuur/i },
      { id: 'Field_ContributorId', kind: 'text', value: 'E2E bijdrager' },
      { id: 'Field_ClientId', kind: 'text', value: 'E2E opdrachtgever' },
      { id: 'Field_ProjectScope', kind: 'text', value: TEXT },
      { id: 'Field_ProjectFinances', kind: 'text', value: '100000' },
      { id: 'Field_ProjectTimeline', kind: 'text', value: '10 weken' },
    ],
  },
  {
    match: /Organiseren intake-overleg/i,
    submit: /^Submit$/i,
    fields: [
      { id: 'Field_IntakeMeetingDate', kind: 'datetime' },
      { id: 'Field_IntakeMeetingLocation', kind: 'text', value: 'Lelystad' },
      { id: 'Field_IntakeMeetingParticipants', kind: 'text', value: TEXT },
      { id: 'Field_InviteSent', kind: 'check' },
      { id: 'Field_ProjectPlanAttached', kind: 'check' },
    ],
  },
  {
    match: /Uitvoeren intake-overleg/i,
    submit: /Beslissing vastleggen/i,
    fields: [
      { id: 'Field_OverlegDatum', kind: 'datetime' },
      { id: 'Field_OverlegAanwezig', kind: 'text', value: TEXT },
      { id: 'Field_Bevindingen', kind: 'text', value: TEXT },
      // The gateway. "nee" routes to Verbeteren kwaliteit and loops.
      { id: 'Field_IntakeAkkoord', kind: 'radio', option: /^Ja/i },
    ],
  },
  {
    match: /Aanvullen Projectplan 2/i,
    submit: /Submit intake report/i,
    fields: [
      { id: 'Field_IntakeDecisions', kind: 'text', value: TEXT },
      { id: 'Field_IntakeAgreements', kind: 'text', value: TEXT },
      { id: 'Field_ConfirmedScope', kind: 'text', value: TEXT },
      { id: 'Field_ConfirmedBudget', kind: 'text', value: '100000' },
      { id: 'Field_ConfirmedTimeline', kind: 'text', value: '10 weken' },
    ],
  },
  {
    match: /Accorderen Projectplan/i, // covers both 2. Intake-verslag and 4. Uitgangspunten
    submit: /Submit decision/i,
    fields: [{ id: 'Field_ApprovalStatus', kind: 'radio', option: /^Approved/i }],
  },
  {
    match: /Opstellen risicodossier|Opstellen risicossier/i,
    submit: /^Submit$/i,
    fields: [
      { id: 'Field_RiskFileReference', kind: 'text', value: 'REL-E2E-001' },
      { id: 'Field_RiskFileDate', kind: 'datetime' },
      { id: 'Field_RiskFilePreparedBy', kind: 'text', value: 'E2E projectbeheersing' },
      { id: 'Field_RiskFileSummary', kind: 'text', value: TEXT },
      { id: 'Field_RiskFileComplete', kind: 'check' },
    ],
  },
  {
    match: /Opstellen planning/i,
    submit: /Planning vastleggen/i,
    fields: [
      { id: 'Field_PlanningStartdatum', kind: 'datetime' },
      { id: 'Field_PlanningEinddatum', kind: 'datetime' },
      { id: 'Field_PlanningMijlpalen', kind: 'text', value: TEXT },
      { id: 'Field_NotificatiePL', kind: 'check' },
      { id: 'Field_NotificatieOndersteuner', kind: 'check' },
      { id: 'Field_NotificatieWijze', kind: 'select', option: /E-mail/i },
    ],
  },
  {
    match: /Initi[eë]ren \/ organiseren PSU|Initieren \/ organiseren PSU/i,
    submit: /^Submit$/i,
    fields: [
      { id: 'Field_PsDate', kind: 'datetime' },
      { id: 'Field_PsLocation', kind: 'text', value: 'Lelystad' },
      { id: 'Field_PsParticipants', kind: 'text', value: TEXT },
      { id: 'Field_PsPresentationReady', kind: 'check' },
      { id: 'Field_PsInviteSent', kind: 'check' },
    ],
  },
  {
    match: /Uitvoeren PSU/i,
    submit: /Submit PSU notes/i,
    fields: [
      { id: 'Field_PsOutcomes', kind: 'text', value: TEXT },
      { id: 'Field_PsActionPoints', kind: 'text', value: TEXT },
      { id: 'Field_ProjectManager', kind: 'text', value: 'E2E projectleider' },
    ],
  },
  {
    match: /Aanvullen Projectplan 4/i,
    submit: /Uitgangspunten indienen/i,
    fields: [
      { id: 'Field_VOScope', kind: 'text', value: TEXT },
      { id: 'Field_VOBudget', kind: 'text', value: '250000' },
      { id: 'Field_VOTimeline', kind: 'text', value: '20 weken' },
      { id: 'Field_RisicoReferentie', kind: 'text', value: 'REL-E2E-001' },
      { id: 'Field_RisicoSamenvatting', kind: 'text', value: TEXT },
      { id: 'Field_KMSFormatReady', kind: 'check' },
    ],
  },
  {
    match: /Houden overleg|Overleg uitgangspunten/i,
    submit: /Overleg vastleggen/i,
    fields: [
      { id: 'Field_OverlegDatum', kind: 'datetime' },
      { id: 'Field_OverlegLocatie', kind: 'text', value: 'Lelystad' },
      { id: 'Field_OverlegDeelnemers', kind: 'text', value: TEXT },
      { id: 'Field_OverlegNotulen', kind: 'text', value: TEXT },
      { id: 'Field_OverlegBeslissingen', kind: 'text', value: TEXT },
      { id: 'Field_OverlegAdvies', kind: 'text', value: TEXT },
      { id: 'Field_OverlegAkoordVerwacht', kind: 'radio', option: /^Ja/i },
    ],
  },
];

/**
 * Fills one form-js field.
 *
 * Every id is matched with "ends with" because form-js prefixes a random
 * per-render token: `fjs-form-<token>-Field_ProjectNumber`. Selects need the
 * separate `-display` element — the labelled input is a visually hidden,
 * zero-size value holder that cannot be clicked. Both quirks are the same ones
 * documented in caseworker-journey.spec.ts.
 */
async function fillField(page: Page, field: Field) {
  const input = page.locator(`[id$="-${field.id}"]`).first();

  switch (field.kind) {
    case 'text':
      await input.fill(field.value);
      return;
    case 'datetime': {
      // Typing into a form-js datetime is unreliable: the input is a flatpickr
      // whose id gets a `-date` suffix, it expects mm/dd/yyyy, and a filled
      // value is not necessarily committed to form state — the field then
      // submits empty and validation blocks with no error rendered anywhere,
      // which showed up as a run that stalled on a form that looked complete.
      // Clicking a day is what flatpickr actually commits. Today always exists
      // and is always valid, and no field here constrains which date it is.
      const container = page
        .locator('.fjs-form-field')
        .filter({ has: page.locator(`[id$="-${field.id}-date"]`) })
        .first();
      await container.locator('input.flatpickr-input').click();
      await container.locator('.flatpickr-day.today').first().click();
      return;
    }
    case 'check':
      await input.check();
      return;
    case 'select':
      // The visible trigger is `-display`; the labelled input is a
      // visually-hidden value holder that cannot be clicked. Options are plain
      // divs — form-js gives them no `option` role, so getByRole finds nothing
      // and the click hangs until the test times out.
      await page.locator(`[id$="-${field.id}-display"]`).first().click();
      await page.locator('.fjs-dropdownlist-item', { hasText: field.option }).first().click();
      return;
    case 'radio':
      await page.getByRole('radio', { name: field.option }).first().check();
      return;
  }
}

/** Reads the live badge on a Faseladder row, e.g. "40 1 LIVE" -> 1. */
async function liveCount(page: Page, phase: RegExp, column: 'klaar' | 'gereed'): Promise<number> {
  const row = page.locator('table tr', { hasText: phase }).first();
  const cells = row.locator('td');
  // Columns: Fase | Status | Trekker | Sluit met | Klaar | WIP | Gereed
  const cell = cells.nth(column === 'klaar' ? 4 : 6);
  const badge = cell.locator('.pb-live-badge');
  if ((await badge.count()) === 0) return 0;
  return Number((await badge.innerText()).replace(/\D+/g, ''));
}

/**
 * Opens the Faseladder and waits for its live counts to arrive.
 *
 * The heading renders before GET /rip/phases/counts answers, and the live
 * badges are exactly what this spec measures. Sampling on the heading alone
 * read a table with no badges yet, so "before" came back 0 while "after" came
 * back the real figure — an assertion that failed while the application was
 * behaving perfectly correctly.
 */
async function openFaseladder(page: Page): Promise<number> {
  const counts = page.waitForResponse(
    (r) => r.url().includes('/rip/phases/counts') && r.request().method() === 'GET',
    { timeout: 30_000 }
  );
  await page.locator('.v2-tabs button', { hasText: 'Beheer' }).first().click();
  await page.locator('.v2-rail button', { hasText: 'Faseladder' }).first().click();
  await expect(page.getByRole('heading', { name: 'Faseladder' })).toBeVisible();
  const body = (await (await counts).json()) as {
    data?: { counts?: Record<string, { wip: number; gereed: number }> };
  };
  // Keyed by process definition key, not phase code.
  return body.data?.counts?.RipR21Process?.gereed ?? 0;
}

const OPERATON = 'http://localhost:8081/engine-rest';

/**
 * How many R2.1 instances are in flight.
 *
 * The UI cannot tell two of them apart: a fallback-started instance carries no
 * project number, so every one renders the same "RIP Fase 1 — R2.1" todo row.
 * A run that picks `.first()` with someone else's instance in flight will
 * happily work THAT process to completion and report success — which is
 * exactly what happened while this spec was being written, and it is
 * indistinguishable from a pass. So the spec refuses to start unless it can be
 * sure the instance it creates is the only one it could possibly pick.
 */
async function activeR21Instances(): Promise<Array<{ id: string; businessKey: string | null }>> {
  const res = await fetch(`${OPERATON}/process-instance?processDefinitionKey=RipR21Process`);
  if (!res.ok) throw new Error(`Operaton returned ${res.status} listing R2.1 instances`);
  return (await res.json()) as Array<{ id: string; businessKey: string | null }>;
}

/**
 * Whether the engine has positively finished with this instance.
 *
 * Reads history rather than inferring completion from an absent runtime
 * instance. The version this replaces returned "finished" whenever the runtime
 * lookup came back not-ok, so one transient error from the engine ended the
 * journey six tasks in and reported it as an orderly finish — absence of
 * evidence read as evidence of completion.
 */
async function instanceFinished(instanceId: string): Promise<boolean> {
  const res = await fetch(`${OPERATON}/history/process-instance/${instanceId}`);
  if (!res.ok) return false;
  return ((await res.json()) as { state?: string }).state === 'COMPLETED';
}

/**
 * Waits until the engine either has another task for us or has finished.
 *
 * Asking only "is it running?" is not enough: for a moment after the final
 * task the instance is still running while it completes its end event, and a
 * test that reads that as "more work coming" waits out its timeout on a task
 * that will never exist. Asking only "is there a task?" is not enough either,
 * because of the automatic Relatics step. Both questions, polled together.
 */
async function nextStep(instanceId: string, timeoutMs = 90_000): Promise<'task' | 'done'> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    // A task first: if one exists there is work to do regardless of anything
    // else the engine reports.
    const tasks = await fetch(`${OPERATON}/task/count?processInstanceId=${instanceId}`);
    if (tasks.ok && ((await tasks.json()) as { count: number }).count > 0) return 'task';
    if (await instanceFinished(instanceId)) return 'done';
    if (Date.now() > deadline) {
      throw new Error(
        `instance ${instanceId} has neither an open task nor a COMPLETED history entry after ` +
          `${timeoutMs}ms — most likely stalled on the Relatics external task with no worker ` +
          `consuming it`
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

/**
 * Removes every trace of the instance this test created, pass or fail.
 *
 * Both halves matter. Deleting the runtime instance stops the next run's
 * precondition tripping over it. Deleting the *historic* record stops the
 * Faseladder's "Gereed" and "Klaar" live counters climbing by one per run —
 * which is not a tidiness point: those counters are product state that someone
 * reads to see how much work has been done, and a test that inflates them is
 * lying to whoever looks next. Twenty-four runs during development moved R2.1
 * Gereed by twenty-four before this was added.
 *
 * Unconditional rather than routed through operaton-cleanup's prompt. That
 * prompt lives in globalTeardown and is skipped whenever stdin is not a TTY,
 * so every piped or CI run left its record behind — which is exactly how the
 * counters drifted in the first place.
 *
 * A completed instance is gone from runtime already, so a 404 on the runtime
 * DELETE is the normal case and stays quiet; the history DELETE is the one
 * that does the work.
 *
 * Everything else is reported. Cleanup failures are how strays accumulate, and
 * a silent catch makes a failed delete indistinguishable from a successful
 * one — the run goes green either way and the leftover only surfaces later, as
 * a skipped run blocked by an instance nobody remembers creating. Reported
 * rather than thrown: this runs in afterEach, and a cleanup problem should not
 * overwrite the result of the journey that just ran.
 */
async function deleteInstance(id: string): Promise<void> {
  await del(`${OPERATON}/process-instance/${id}?skipCustomListeners=true`, 'runtime', [404]);
  await del(`${OPERATON}/history/process-instance/${id}`, 'history', []);
}

/** One DELETE, quiet on the statuses it expects, loud on anything else. */
async function del(url: string, what: string, expected: number[]): Promise<void> {
  let res: Response;
  try {
    res = await fetch(url, { method: 'DELETE' });
  } catch (err) {
    console.warn(
      `[rip-r21-journey] ${what} cleanup could not reach the engine: ${(err as Error).message}. ` +
        `The instance is still there and will block the next run.`
    );
    return;
  }
  if (res.ok || expected.includes(res.status)) return;
  console.warn(
    `[rip-r21-journey] ${what} cleanup failed with HTTP ${res.status} for ${url}. ` +
      `The instance is still there and will block the next run.`
  );
}

/** Opens the running instance's project detail via the Mijn dag queue. */
async function openInstanceDetail(page: Page) {
  await page.locator('.v2-tabs button', { hasText: 'Mijn dag' }).first().click();
  await page
    .locator('.pb-todo-item', { hasText: 'RipR21Process' })
    .first()
    .click({ timeout: 60_000 });
}

let rateLimit: ReturnType<typeof watchForRateLimit>;
let instanceId: string | null = null;

test.describe('RIP fase 1 (R2.1)', () => {
  test.beforeEach(async ({ page }) => {
    rateLimit = watchForRateLimit(page);
    await loginAsMedewerker(page, 'test-infra-flevoland', 'test123');
  });

  test.afterEach(async () => {
    // Removed here rather than left to globalTeardown's prompt: that prompt is
    // skipped when stdin is not a TTY, so an unattended run would leave the
    // instance behind and the NEXT run would fail its precondition.
    if (instanceId) {
      await deleteInstance(instanceId);
      instanceId = null;
    }
    const throttled = rateLimit.hit();
    if (throttled) throw new Error(throttled);
  });

  test('starts, works every task, and completes the phase', async ({ page }) => {
    test.slow(); // a dozen form submissions against a real engine

    // Skipped, not failed. A foreign instance means this spec cannot run — it
    // does not mean the journey is broken, and reporting the two the same way
    // teaches people to read red as noise. The run below never starts, so
    // there is nothing to assert about it either way.
    const inFlight = await activeR21Instances();
    if (inFlight.length > 0) {
      const blocking = inFlight.map((i) => `${i.businessKey ?? i.id} (${i.id})`).join(', ');
      const reason =
        `${inFlight.length} R2.1 instance(s) already running: ${blocking}. This spec cannot ` +
        `tell a foreign instance from its own — a fallback-started R2.1 carries no project ` +
        `number, so every one looks identical — and picking the wrong one would work someone ` +
        `else's process to completion and report a pass. Finish or delete them first: ` +
        `curl -X DELETE "${OPERATON}/process-instance/<id>?skipCustomListeners=true"`;
      // Printed as well as annotated: the list reporter shows the skip but not
      // always the reason, and the reason is the whole point.
      console.warn(`[rip-r21-journey] SKIPPED — ${reason}`);
      test.skip(true, reason);
    }

    // ── baseline ────────────────────────────────────────────────────────
    // Taken from the response the table is built from rather than from the
    // rendered badge: the badge paints a tick later, so reading it here caught
    // an empty cell and made "before" 0 against a real "after".
    const gereedBefore = await openFaseladder(page);

    // ── start the phase from its own detail page ────────────────────────
    await page.locator('.v2-rail button', { hasText: 'R2.1' }).first().click();
    await expect(page.getByRole('button', { name: /R2\.1 starten/ })).toBeVisible();

    const started = page.waitForResponse(
      (r) => r.url().includes('/process/RipR21Process/start') && r.request().method() === 'POST'
    );
    await page.getByRole('button', { name: /R2\.1 starten/ }).click();
    const startBody = (await (await started).json()) as {
      data?: { businessKey?: string; processInstanceId?: string };
    };
    const businessKey = startBody.data?.businessKey;
    instanceId = startBody.data?.processInstanceId ?? null;
    expect(businessKey, 'the start response carries a businessKey to clean up by').toBeTruthy();
    // Also recorded for globalTeardown's prompt, as a backstop for the case
    // where the process is killed before afterEach can run at all.
    recordPendingCleanup(businessKey!);

    await expect(page.getByText(/R2\.1 gestart/)).toBeVisible({ timeout: 15_000 });

    // ── work every task the engine offers, in whatever order it offers ──
    await openInstanceDetail(page);

    const worked: string[] = [];
    for (let guard = 0; guard < 25; guard++) {
      const items = page.locator('.pb-taken-item');

      // An empty list means one of two very different things: the process is
      // finished, or the previous completion's refetch has not landed yet.
      // Treating the second as the first ended runs early with a partial
      // journey that still looked orderly. The engine is asked which it is.
      if ((await items.count()) === 0) {
        if ((await nextStep(instanceId!)) === 'done') break;
        // Still running, so the next task is coming — most likely the engine
        // is on the automatic Relatics step. Going round through Mijn dag both
        // waits for a task to exist (the todo row only renders when one does)
        // and remounts the detail, whose task list is fetched on mount and has
        // no other reason to refetch while nothing is being completed.
        await openInstanceDetail(page);
        continue;
      }

      const item = items.first();
      const name = (await item.locator('.pb-taken-item-name').innerText()).replace(/\s+/g, ' ');
      await item.click();

      const claim = page.getByRole('button', { name: /Taak claimen/ });
      if (await claim.isVisible().catch(() => false)) await claim.click();

      const spec = TASK_SPECS.find((s) => s.match.test(name));
      expect(spec, `no form recipe for task "${name}"`).toBeTruthy();

      // Claiming swaps the claim button for the form, so the form arrives on a
      // later render than the click. Filling straight away puts values into
      // inputs that are about to be replaced: the visible field then looks
      // filled, form state does not have it, and submit is silently blocked by
      // a required field with no error shown anywhere. Wait for the form's own
      // submit button before touching any field.
      const submitButton = page.locator('.fjs-form button', { hasText: spec!.submit });
      await expect(submitButton, `form for "${name}" never rendered`).toBeVisible({
        timeout: 20_000,
      });

      for (const field of spec!.fields) await fillField(page, field);

      // Waiting on the "Taak voltooid." message would never work: onCompleted
      // sets it and immediately calls onDone, which clears selectedTaskId and
      // unmounts the panel the message lives in. The completion POST is the
      // signal that survives.
      const completed = page.waitForResponse(
        (r) => /\/task\/[^/]+\/complete$/.test(r.url()) && r.request().method() === 'POST',
        { timeout: 30_000 }
      );
      await submitButton.click();
      const res = await completed;
      expect(res.status(), `completing "${name}" failed`).toBeLessThan(400);

      // The list reloads after onDone; wait for this task to leave it before
      // reading the next one, or the same task gets picked up twice.
      await expect(page.locator('.pb-taken-item', { hasText: name })).toHaveCount(0, {
        timeout: 20_000,
      });

      worked.push(name);
    }

    // Every user task in the happy path, and nothing looping.
    expect(worked.length, `worked tasks: ${worked.join(' | ')}`).toBeGreaterThanOrEqual(11);
    expect(
      worked.filter((n) => /Verbeteren kwaliteit/i.test(n)),
      'no rework loop'
    ).toEqual([]);

    // ── the phase closed, and R2.2 became reachable ─────────────────────
    await openFaseladder(page);
    await expect
      .poll(() => liveCount(page, /R2\.1/, 'gereed'), { timeout: 20_000 })
      .toBe(gereedBefore + 1);
    // R2.2's "Klaar" is derived from R2.1's completions — getKlaarCounts reads
    // the predecessor's gereed — so it moves by the same one. This is the
    // assertion the whole journey exists for: finishing R2.1 is what makes a
    // project ready for R2.2.
    await expect
      .poll(() => liveCount(page, /R2\.2/, 'klaar'), { timeout: 20_000 })
      .toBe(gereedBefore + 1);
  });
});
