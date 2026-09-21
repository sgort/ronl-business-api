import type { Page } from '@playwright/test';

import { OPERATON_URL } from './target';

/**
 * Idempotent: a rerun without a full reset may find the task already
 * claimed by a previous partial run.
 */
export async function claimIfNeeded(page: Page) {
  const claimButton = page.getByRole('button', { name: 'Taak claimen' });
  if (await claimButton.isVisible()) {
    await claimButton.click();
  }
}

/**
 * Every process-instance id belonging to one businessKey: the instance the
 * citizen just started, plus any call-activity children (a "Case review" task
 * lives on the called sub-process instance, not on the shell).
 */
export async function instanceIdsForBusinessKey(businessKey: string): Promise<string[]> {
  const res = await fetch(
    `${OPERATON_URL}/process-instance?businessKey=${encodeURIComponent(businessKey)}`
  );
  if (!res.ok) throw new Error(`Operaton returned HTTP ${res.status} looking up ${businessKey}`);
  const roots = (await res.json()) as Array<{ id: string }>;
  if (roots.length === 0) throw new Error(`No running process instance for ${businessKey}`);

  const ids = roots.map((r) => r.id);
  for (const root of roots) {
    const subsRes = await fetch(`${OPERATON_URL}/process-instance?superProcessInstance=${root.id}`);
    if (!subsRes.ok) continue;
    for (const sub of (await subsRes.json()) as Array<{ id: string }>) ids.push(sub.id);
  }
  return ids;
}

/**
 * Opens the caseworker task named `name` that belongs to one of `instanceIds`,
 * and claims it if needed.
 *
 * Deliberately NOT `getByRole('button', { name }).first()`. The task queue is
 * shared: on ACC the same run found five open "Phase 6: Notify applicant of
 * decision" tasks, four of them foreign, left behind by legacy untenanted
 * instances. `.first()` picked one of those, whose form is an older schema, and
 * the spec then waited out its timeout on a field that was never going to
 * render. The visible text cannot disambiguate them — it is the task name plus
 * the process-definition key, which foreign instances of the same process
 * share — so the task button carries its process-instance id as a data
 * attribute (see CaseworkerDashboardV2/TakenInbox.tsx) and we match on that.
 */
export async function openOwnTask(
  page: Page,
  name: string | RegExp,
  instanceIds: string[]
): Promise<void> {
  // Wait for the inbox to render, then check the attribute is there at all.
  // A frontend built before it exists yields no match and the spec would
  // otherwise sit out its full timeout on a locator log that says nothing
  // about the real cause — which is a missing deploy, not a bad selector.
  await page.locator('button.v2-taken-item').first().waitFor({ timeout: 15_000 });
  if ((await page.locator('button.v2-taken-item[data-process-instance-id]').count()) === 0) {
    throw new Error(
      [
        '',
        'The task list renders no data-process-instance-id attribute, so this run',
        'cannot tell its own task from the rest of a shared queue.',
        '',
        'That attribute is added in CaseworkerDashboardV2/TakenInbox.tsx. The',
        'frontend serving this target predates it — merge to acc and let',
        '.github/workflows/azure-frontend-acc.yml redeploy, then re-run.',
        '',
      ].join('\n')
    );
  }

  const selector = instanceIds.map((id) => `button[data-process-instance-id="${id}"]`).join(', ');
  await page.locator(selector).filter({ hasText: name }).first().click();
  await claimIfNeeded(page);
}
