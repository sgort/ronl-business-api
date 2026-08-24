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
  it('hides the vendored live-toggle button but not the reset button', () => {
    expect(css).toMatch(
      /\.pac-db-flag-actions\s+\.pac-db-abtn:not\(\.pac-db-flag-reset\)\s*\{[^}]*display:\s*none/
    );
  });

  it('does not blanket-hide every .pac-db-abtn', () => {
    // A regression that dropped the :not(...) qualifier would also hide the
    // reset button, which must stay visible and clickable.
    expect(css).not.toMatch(/\.pac-db-abtn\s*\{[^}]*display:\s*none/);
  });
});
