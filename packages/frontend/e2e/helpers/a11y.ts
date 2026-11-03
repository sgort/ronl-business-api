import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type TestInfo } from '@playwright/test';

import { BASELINE, type PageName } from '../a11y-baseline';

/**
 * axe-core checks for the frontend E2E suite (#409; design:
 * docs/superpowers/specs/2026-11-03-axe-accessibility-baseline-design.md).
 *
 * WCAG 2.0, 2.1 and 2.2 at levels A and AA. A critical or serious violation
 * fails the test unless it is in the page's baseline (a11y-baseline.ts); a
 * baseline entry that no longer occurs fails it too, so a fix shrinks the
 * list. Moderate, minor and "needs review" results are attached to the
 * Playwright report, not enforced.
 */
export const A11Y_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const ENFORCED = new Set(['critical', 'serious']);

/** One enforced finding: a rule on one element, with what axe measured. */
type Finding = { rule: string; target: string; detail: string };

function findingsOf(
  violations: Awaited<ReturnType<AxeBuilder['analyze']>>['violations']
): Finding[] {
  // Impact per element: a rule's own impact is the highest of its elements.
  return violations.flatMap((v) =>
    v.nodes
      .filter((n) => ENFORCED.has(n.impact ?? v.impact ?? ''))
      .map((n) => {
        const d = (n.any[0]?.data ?? {}) as Record<string, unknown>;
        const contrast =
          v.id === 'color-contrast'
            ? ` (${d.fgColor} on ${d.bgColor}, ${d.contrastRatio}:1, needs ${d.expectedContrastRatio})`
            : '';
        return {
          rule: v.id,
          target: n.target.join(' '),
          detail: `[${n.impact ?? v.impact}] ${v.help}${contrast} — ${v.helpUrl}`,
        };
      })
  );
}

/**
 * Scans the page and checks it against its baseline. The full axe result is
 * attached to the test as `axe-<page>.json`.
 */
export async function expectNoNewViolations(page: Page, pageName: PageName, testInfo: TestInfo) {
  const results = await new AxeBuilder({ page }).withTags(A11Y_TAGS).analyze();
  await testInfo.attach(`axe-${pageName}.json`, {
    body: JSON.stringify(
      { url: page.url(), violations: results.violations, incomplete: results.incomplete },
      null,
      2
    ),
    contentType: 'application/json',
  });

  const known = BASELINE[pageName];
  const found = findingsOf(results.violations);
  const isKnown = (f: Finding) => known.some((k) => k.rule === f.rule && k.target === f.target);

  const added = found
    .filter((f) => !isKnown(f))
    .map((f) => `${f.rule} on ${f.target}: ${f.detail}`);
  expect(added, `New critical/serious accessibility findings on "${pageName}"`).toEqual([]);

  const stale = known
    .filter((k) => !found.some((f) => f.rule === k.rule && f.target === k.target))
    .map((k) => `${k.rule} on ${k.target} (${k.reason})`);
  expect(
    stale,
    `Baseline entries on "${pageName}" that no longer occur: remove them from a11y-baseline.ts`
  ).toEqual([]);
}
