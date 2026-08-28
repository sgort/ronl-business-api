import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * Vitest does not process CSS by default (no `test.css: true` in
 * vite.config.ts), so an imported .css file resolves to an empty module in
 * jsdom and getComputedStyle() would see no rules at all — a rendered-DOM
 * assertion here would pass or fail for the wrong reason regardless of what
 * demo-overrides.css actually says. This test instead reads the stylesheet
 * source directly, as a narrow regression guard: it fails loudly if the
 * override rule that hides Dossierbeheer's own live-toggle button is ever
 * removed, weakened (e.g. the :not() dropped, taking the reset button with
 * it) or retargeted. It cannot confirm the rule actually wins in a real
 * browser's cascade — that is verified by hand against the running app; see
 * task-8-report.md's "Fix: hide the vendored live-toggle button" section.
 *
 * Reads via dirname(fileURLToPath(import.meta.url)) rather than
 * new URL('./demo-overrides.css', import.meta.url): Vite specially
 * intercepts that second pattern for recognised asset extensions (.css
 * included) and rewrites it to a served dev-server URL
 * (http://localhost:3000/...) instead of leaving it as a file: URL, which
 * makes fileURLToPath throw ERR_INVALID_URL_SCHEME. Building the path from
 * the test file's own directory sidesteps that rewrite entirely.
 */
const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'demo-overrides.css'),
  'utf-8'
);

describe('demo-overrides.css', () => {
  it('hides Dossierbeheer’s live-toggle button but not the reset button', () => {
    expect(css).toMatch(
      /\.pac-db-flag-actions\s+\.pac-db-abtn:not\(\.pac-db-flag-reset\)\s*\{[^}]*display:\s*none/
    );
  });

  it('does not blanket-hide every .pac-db-abtn', () => {
    // A regression that dropped the :not(...) qualifier would also hide the
    // reset button, which must stay visible and clickable.
    expect(css).not.toMatch(/\.pac-db-abtn\s*\{[^}]*display:\s*none/);
  });

  it('hides the floating assistant toggle, at a specificity that can beat the package rule', () => {
    // The button opens a dock that is a null shim here (this host supplies
    // shims/PADock), and clicking it persists dockOpen to sessionStorage with no
    // reachable control to unset it — so it must never render. The `.pac `
    // prefix is load-bearing, not decoration: dashboard-pa.css sets
    // `display: flex` on `.pac .pac-dock-toggle`, so a bare `.pac-dock-toggle`
    // selector would lose the specificity fight (0,1,0) vs (0,2,0) and the
    // button would still be visible with this file's text otherwise intact.
    expect(css).toMatch(/\.pac\s+\.pac-dock-toggle\s*\{[^}]*display:\s*none/);
  });

  it('lets .pac take the remaining flex space instead of its own hard-coded 100vh', () => {
    // .pac { height: 100vh } (the package's dashboard-pa.css) assumes .pac is the
    // only thing on the page. That assumption held again as of Task 15,
    // which deleted the DemoBar header that used to sit above .pac as a
    // sibling (the double-scrollbar the human partner originally reported
    // came from that sibling pushing total content past the viewport). This
    // rule is kept anyway rather than reverted to the package default: a
    // lone flex child with flex: 1 1 auto in a height: 100% column fills
    // that column exactly, so the override is harmless and produces the
    // same single scrollbar .pac's own height: 100vh would — see this
    // rule's own comment in demo-overrides.css for the re-measured numbers.
    // Source-text guard only, same caveat as the rest of this file: it
    // cannot confirm the rule wins the cascade in a real browser — see
    // plato-demo.spec.ts's "the page has one scrollbar, not two" test for
    // that proof.
    expect(css).toMatch(/#root\s*\{[^}]*display:\s*flex/);
    expect(css).toMatch(/\.pac\s*\{[^}]*height:\s*auto/);
  });
});
