import { expect, test, type Locator } from '@playwright/test';
import { loginAsMedewerker } from './helpers/auth';
import { watchForRateLimit } from './helpers/rate-limit';

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
      if (m === 'mine' || m === 'claimed') keys.add(m);
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
    if (['mine', 'claimed', 'role', 'decision', 'parallel'].includes(key)) {
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
    await link.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await assertProcessViewRules(dialog.locator('.pv'));

    // The overlay's own task: tab by assignee, never more than one.
    expect(await dialog.locator('.pb-swim-inprogress').count()).toBeLessThanOrEqual(1);
  });
});
