import { expect, test, type Locator } from '@playwright/test';
import { loginAsMedewerker } from './helpers/auth';
import { watchForRateLimit } from './helpers/rate-limit';
import { recordPendingCleanup } from './helpers/operaton-cleanup';
import { OPERATON_URL } from './helpers/target';

const OPERATON = OPERATON_URL;
const COLLEAGUE = 'e2e-collega';

/**
 * The shared process view (ProcessView) on every dashboard that shows one.
 *
 * Test 1 asserts rules rather than counts: whatever diagram the shared engine
 * happens to produce, the legend matches it, labels fit their boxes, nodes do
 * not overlap, no element id is shown as a label and empty lanes stay slim.
 * The same reasoning as infra-board-journey.spec.ts: a count here would assert
 * the mood of a shared engine, a rule holds in any state.
 */

async function assertProcessViewRules(view: Locator) {
  await expect(view.locator('.pb-swim')).toBeVisible();

  // The legend matches the diagram, both ways, for the entries that depend on what is drawn.
  const legend = await view
    .locator('[data-legend]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-legend')!));
  const present = await view.evaluate((root) => {
    const keys = new Set<string>();
    root.querySelectorAll('[data-mark]').forEach((e) => {
      const m = e.getAttribute('data-mark');
      if (m === 'mine' || m === 'claimed' || m === 'open') keys.add(m);
    });
    if (root.querySelector('.pb-swim-lane-label.cwp-mine')) keys.add('role');
    root.querySelectorAll('[data-gateway]').forEach((e) => {
      const g = e.getAttribute('data-gateway');
      if (g === 'decision') keys.add('decision');
      if (g === 'split' || g === 'join') keys.add('parallel');
    });
    return [...keys];
  });
  for (const key of present) expect(legend, `legend entry for "${key}"`).toContain(key);
  for (const key of legend) {
    if (['mine', 'claimed', 'open', 'role', 'decision', 'parallel'].includes(key)) {
      expect(present, `diagram shows "${key}" from the legend`).toContain(key);
    }
  }

  // Every label ends inside its node and shows whole lines. Not scrollHeight
  // against clientHeight: a label clamped on purpose (three lines, two beside
  // a document footer) keeps its full text, so its scrollHeight always exceeds
  // what it shows. What must not happen is a label cut mid-line or running
  // past its node.
  const outsideNode = await view.locator('.pb-swim-node').evaluateAll((els) =>
    els
      .filter((node) => {
        const label = node.querySelector('.nlabel');
        if (!label) return false;
        const l = label.getBoundingClientRect();
        const n = node.getBoundingClientRect();
        if (l.bottom > n.bottom + 1) return true;
        // A label clipped mid-line is not a whole number of lines high.
        const lh = parseFloat(getComputedStyle(label).lineHeight);
        if (!lh) return false;
        const rest = l.height % lh;
        return rest > 1 && lh - rest > 1;
      })
      .map((node) => node.getAttribute('data-node-id'))
  );
  expect(outsideNode, 'labels cut off by their node').toEqual([]);

  // No two nodes overlap.
  const boxes = await view.locator('.pb-swim-node').evaluateAll((els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height, name: e.getAttribute('data-node-id') };
    })
  );
  const overlaps: string[] = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) {
        overlaps.push(`${a.name} × ${b.name}`);
      }
    }
  }
  expect(overlaps, 'overlapping nodes').toEqual([]);

  // No gateway shows its element id; bars and dots show only their caption.
  const gates = await view
    .locator('.pb-swim-gate, .pb-swim-bar, .pb-swim-merge')
    .evaluateAll((els) =>
      els.map((e) => ({
        id: e.getAttribute('data-node-id'),
        kind: e.getAttribute('data-gateway'),
        text: (e.textContent ?? '').replace(/[×+?]/g, '').trim(),
      }))
    );
  for (const g of gates) {
    expect(g.text, `gateway ${g.id} shows its id`).not.toBe(g.id);
    if (g.kind === 'split') expect(g.text).toBe('tegelijk');
    if (g.kind === 'join') expect(g.text).toBe('alles klaar');
    if (g.kind === 'merge') expect(g.text).toBe('');
  }

  // Empty lanes stay slim.
  const slim = await view
    .locator('.pb-swim-lane-label[data-lane-empty]')
    .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  for (const h of slim) expect(h).toBeLessThanOrEqual(48);
}

test.describe('ProcessView', () => {
  let rateLimit: ReturnType<typeof watchForRateLimit>;
  test.afterEach(() => {
    const throttled = rateLimit?.hit();
    if (throttled) throw new Error(throttled);
  });

  test('test 1 — Caseworker overlay follows the shared rules', async ({ page }) => {
    rateLimit = watchForRateLimit(page);
    await loginAsMedewerker(page, 'test-caseworker-flevoland', 'test123');
    await expect(page).toHaveURL(/\/dashboard\/caseworker$/);

    // count() does not wait: settle the inbox first, so a slow tier is not
    // mistaken for an empty one and the test does not skip on a race.
    const first = page.locator('.v2-taken-item-name').first();
    const empty = page.getByText('Geen taken in dit filter.');
    await expect(first.or(empty)).toBeVisible({ timeout: 30_000 });
    if (!(await first.isVisible())) {
      test.skip(
        true,
        'No task in the caseworker inbox on this tier; nothing to open the overlay on.'
      );
    }
    await first.click();

    // The step list and its link appear once the process context has loaded,
    // or "Geen processtappen." when the task has no model.
    const link = page.getByRole('button', { name: /Hele proces als swimlane bekijken/ });
    const noSteps = page.getByText('Geen processtappen.');
    await expect(link.or(noSteps)).toBeVisible({ timeout: 30_000 });
    if (!(await link.isVisible())) {
      test.skip(true, 'The selected task has no process model; the overlay is not offered.');
    }
    // The step list shows no gateway element id, and Procesgegevens starts folded.
    const stepNames = await page.locator('.cwp-st-name').allTextContents();
    expect(stepNames.filter((n) => /^Gateway_/.test(n.trim()))).toEqual([]);
    await expect(page.getByRole('button', { name: /Procesgegevens/ })).toHaveAttribute(
      'aria-expanded',
      'false'
    );

    await link.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await assertProcessViewRules(dialog.locator('.pv'));

    // The overlay's own task: tab by assignee, never more than one.
    expect(await dialog.locator('.pb-swim-inprogress').count()).toBeLessThanOrEqual(1);
  });

  test('test 1 — Infra-board follows the shared rules', async ({ page }) => {
    rateLimit = watchForRateLimit(page);
    await loginAsMedewerker(page, 'test-infra-flevoland', 'test123');
    await page.locator('.v2-tabs button', { hasText: 'Mijn dag' }).first().click();

    // Mijn dag always lists curated mock todos too, and they come first. A live
    // item shows its process key ("RipR24Process"); wait for one (the live list
    // loads after the page) and skip only when none appears.
    const item = page
      .locator('.pb-todo-item')
      .filter({ hasText: /RipR\d+Process/ })
      .first();
    const hasItem = await item.waitFor({ state: 'visible', timeout: 30_000 }).then(
      () => true,
      () => false
    );
    if (!hasItem) {
      test.skip(true, 'No live project in the Mijn dag queue on this tier; nothing to open.');
    }
    await item.click();

    const view = page.locator('.pv');
    await expect(view).toBeVisible({ timeout: 30_000 });

    // Tabs agree with the page's own "Open taken" list. Polled: the selected
    // phase starts at R2.1 and moves to the project's own once its live phase
    // has loaded, and only then do the instance's tasks meet their nodes.
    await expect
      .poll(
        async () => {
          const pills = await page.locator('.pb-taken-section .v2-taken-pill').allTextContents();
          const claimed = pills.filter((p) => /Geclaimd/i.test(p)).length > 0;
          const tabs = (await view.locator('.pb-swim-inprogress').count()) > 0;
          return claimed === tabs;
        },
        { message: 'a claimed task shows a tab in the diagram', timeout: 30_000 }
      )
      .toBe(true);
    await assertProcessViewRules(view);

    // Procesgegevens starts folded in the task panel, and opens on click.
    const row = page.locator('.pb-taken-item').first();
    await expect(row).toBeVisible();
    await row.click();
    const disclosure = page.getByRole('button', { name: /Procesgegevens/ });
    await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
    await disclosure.click();
    await expect(disclosure).toHaveAttribute('aria-expanded', 'true');
  });
});

/** The targets of the deployed process's first parallel split with two branches, from its XML. */
async function parallelBranchTargets(definitionId: string): Promise<string[]> {
  const res = await fetch(`${OPERATON}/process-definition/${definitionId}/xml`);
  const { bpmn20Xml } = (await res.json()) as { bpmn20Xml: string };
  const gateways = [...bpmn20Xml.matchAll(/<(?:bpmn:)?parallelGateway[^>]*\bid="([^"]+)"/g)].map(
    (m) => m[1]
  );
  for (const id of gateways) {
    const flows = [...bpmn20Xml.matchAll(/<(?:bpmn:)?sequenceFlow\b[^>]*>/g)].map((m) => m[0]);
    const targets = flows
      .filter((f) => f.includes(`sourceRef="${id}"`))
      .map((f) => /targetRef="([^"]+)"/.exec(f)?.[1])
      .filter((t): t is string => Boolean(t));
    if (targets.length >= 2) return targets;
  }
  return [];
}

test.describe('ProcessView — controlled marks', () => {
  let rateLimit: ReturnType<typeof watchForRateLimit>;
  let instanceId: string | null = null;

  test.afterEach(async () => {
    if (instanceId) {
      await fetch(`${OPERATON}/process-instance/${instanceId}?skipCustomListeners=true`, {
        method: 'DELETE',
      });
      await fetch(`${OPERATON}/history/process-instance/${instanceId}`, { method: 'DELETE' });
      instanceId = null;
    }
    const throttled = rateLimit?.hit();
    if (throttled) throw new Error(throttled);
  });

  test('test 2 — mine, claimed and open marks, and parallel bars', async ({ page }) => {
    test.slow(); // starts, claims and reloads against a real engine
    const defs = (await (
      await fetch(`${OPERATON}/process-definition?key=RipR24Process&latestVersion=true`)
    ).json()) as Array<{ id: string; tenantId: string | null }>;
    const def = defs.find((d) => d.tenantId === 'flevoland') ?? defs[0];
    if (!def) test.skip(true, 'RipR24Process is not deployed on this tier.');
    const targets = await parallelBranchTargets(def!.id);
    if (targets.length < 2)
      test.skip(true, 'RipR24Process has no parallel split with two branches.');

    // Start an own instance with both parallel branches open.
    const businessKey = `e2e-process-view-${Date.now()}`;
    const started = await fetch(`${OPERATON}/process-definition/${def!.id}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        businessKey,
        variables: {
          municipality: { value: 'flevoland', type: 'String' },
          projectNumber: { value: 'E2E-PV', type: 'String' },
          projectName: { value: 'E2E ProcessView', type: 'String' },
        },
        startInstructions: targets.map((activityId) => ({
          type: 'startBeforeActivity',
          activityId,
        })),
      }),
    });
    expect(started.ok, `start failed: HTTP ${started.status}`).toBe(true);
    instanceId = ((await started.json()) as { id: string }).id;
    recordPendingCleanup(businessKey);

    const tasks = (await (
      await fetch(`${OPERATON}/task?processInstanceId=${instanceId}`)
    ).json()) as Array<{ id: string; taskDefinitionKey: string; name: string }>;
    expect(tasks.length, 'both parallel branches are open tasks').toBeGreaterThanOrEqual(2);
    const [mineTask, colleagueTask] = tasks;
    // BPMN names can hold line breaks; the page shows them as one line.
    const mineName = mineTask.name.replace(/\s+/g, ' ').trim();

    // The queue shows a live project by process key and task name, not by
    // project name: another running R2.4 with the same open task would be
    // indistinguishable from this one, so the test cannot run then.
    const sameName = (await (
      await fetch(
        `${OPERATON}/task?processDefinitionKey=RipR24Process&name=${encodeURIComponent(mineTask.name)}`
      )
    ).json()) as Array<{ processInstanceId: string }>;
    if (sameName.some((t) => t.processInstanceId !== instanceId)) {
      test.skip(
        true,
        `Another running RipR24Process has an open "${mineTask.name}"; the queue cannot tell it from this test's own instance.`
      );
    }

    await fetch(`${OPERATON}/task/${colleagueTask.id}/assignee`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: COLLEAGUE }),
    });

    rateLimit = watchForRateLimit(page);
    await loginAsMedewerker(page, 'test-infra-flevoland', 'test123');
    const openOwnProject = async () => {
      await page.locator('.v2-tabs button', { hasText: 'Mijn dag' }).first().click();
      await page
        .locator('.pb-todo-item', { hasText: mineName })
        .filter({ hasText: 'RipR24Process' })
        .first()
        .click({ timeout: 60_000 });
    };
    await openOwnProject();

    // Before any claim: the colleague's task is "geclaimd", ours has no tab.
    const view = page.locator('.pv');
    const node = (key: string) => view.locator(`[data-node-id="${key}"]`);
    await expect(node(colleagueTask.taskDefinitionKey)).toHaveAttribute('data-mark', 'claimed', {
      timeout: 30_000,
    });
    await expect(node(colleagueTask.taskDefinitionKey).locator('.pb-swim-inprogress')).toHaveText(
      'geclaimd'
    );
    await expect(node(mineTask.taskDefinitionKey)).toHaveAttribute('data-mark', 'open');
    await expect(node(mineTask.taskDefinitionKey).locator('.pb-swim-inprogress')).toHaveCount(0);
    await expect(view.locator('[data-legend="claimed"]')).toBeVisible();
    await expect(
      view.locator('[data-gateway="split"], [data-gateway="join"]').first()
    ).toBeVisible();

    // Claim ours through the screen, so its assignee is the logged-in user's own id.
    await page.locator('.pb-taken-item', { hasText: mineName }).first().click();
    await page.getByRole('button', { name: 'Taak claimen' }).click();
    await expect(page.getByRole('button', { name: 'Taak claimen' })).toHaveCount(0, {
      timeout: 15_000,
    });

    // Reopen through Mijn dag, not page.reload(): the token lives in memory, so a
    // full reload logs the test out. ProjectDetail fetches the open tasks again
    // when it mounts, so the diagram reads the fresh assignee.
    await openOwnProject();
    await expect(node(mineTask.taskDefinitionKey)).toHaveAttribute('data-mark', 'mine', {
      timeout: 30_000,
    });
    await expect(node(mineTask.taskDefinitionKey).locator('.pb-swim-inprogress')).toHaveText(
      'jouw taak'
    );
    await expect(view.locator('[data-legend="mine"]')).toBeVisible();
    await expect(view.locator('.pb-swim-lane-label.cwp-mine').first()).toBeVisible();
    await assertProcessViewRules(view);
  });
});
