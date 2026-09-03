import { lazy, Suspense } from 'react';
import type { ChangelogPanelProps } from './ChangelogPanelContent';

/**
 * The changelog drawer, split so its data does not ship in the entry chunk.
 *
 * changelog-data.ts is 432 KB raw / 131 KB gzipped across 102 releases — about
 * 19% of what a visitor downloads. LoginChoice.tsx renders this panel, so
 * before this split an unauthenticated visitor downloaded the project's entire
 * engineering diary before they could log in.
 *
 * ── Why the Suspense boundary is here and not at the call sites ──
 *
 * This is a correctness constraint, not a preference. @ronl/pa-cockpit's
 * PADashboardV2 renders the host's ChangelogPanel through the host contract,
 * and neither package contains a Suspense boundary anywhere. Exporting a bare
 * lazy() component would throw the moment the drawer opened on the PA cockpit
 * route. Adding <Suspense> inside the package instead would change package code
 * to accommodate one host's implementation detail — precisely what the host
 * contract exists to prevent, and packages/pa-demo supplies its own panel and
 * must not inherit a Suspense requirement because this host chose to split.
 *
 * Keeping the boundary here leaves all five call sites and the seam untouched.
 *
 * ── Why the early return is load-bearing ──
 *
 * The lazy element must render only when isOpen is true. Rendered
 * unconditionally, React begins resolving the import on mount, the chunk
 * downloads on every page load, and this whole exercise saves nothing while
 * still passing every behavioural test. The early return also preserves the
 * contract the panel has always had: nothing in the DOM while closed.
 *
 * ── Why the props import says `type` ──
 *
 * `import type` is erased at build and creates no runtime edge. Dropping that
 * one word would make ChangelogPanelContent a static dependency and pull all
 * 131 KB straight back into the entry chunk — a four-character change that
 * reviews cleanly, type-checks identically, and passes every behavioural test.
 * Only a bundle measurement would notice. no-eager-changelog.test.ts asserts
 * the import form for exactly that reason.
 */
const ChangelogPanelContent = lazy(() => import('./ChangelogPanelContent'));

export default function ChangelogPanel({ isOpen, onClose }: ChangelogPanelProps) {
  if (!isOpen) return null;

  // fallback={null}: the drawer is user-initiated and the chunk is one round
  // trip. A spinner that flashes for a few tens of milliseconds reads as a
  // glitch, and null keeps the closed-state DOM identical to before the split.
  return (
    <Suspense fallback={null}>
      <ChangelogPanelContent isOpen onClose={onClose} />
    </Suspense>
  );
}
