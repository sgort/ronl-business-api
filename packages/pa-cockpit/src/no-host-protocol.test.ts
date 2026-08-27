import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * `@ronl/pa-cockpit` is embedded by more than one host application —
 * `packages/frontend`, the authenticated caseworker app, and
 * `packages/pa-demo`, a public unauthenticated sales demo. Naming one
 * application's routes, `sessionStorage` keys or IdP vocabulary inside the
 * package is exactly the leak the session-controls seam (see
 * docs/superpowers/specs/2026-08-27-cockpit-session-seam-design.md) closed:
 * the package used to hardcode `packages/frontend`'s login/logout protocol
 * (`selected_idp`, `post_login_redirect`, `/auth`, `/dashboard/public-affairs`)
 * instead of taking `onLogin`/`onLogout` from the host. This guard keeps that
 * protocol from creeping back into any file under `src`.
 */

const SRC = join(dirname(fileURLToPath(import.meta.url)));

// '/auth' is deliberately a bare, quote-agnostic substring rather than a
// quoted literal ('"/auth"' or "'/auth'") — that was the point of f17682d,
// so that a re-introduced `navigate("/auth")` (or any other quoting/template
// form) could not slip past by construction. The cost is that it also
// matches any string that merely *contains* `/auth`, e.g. `api/auth` or
// `oauth/…`. There is no such false positive in the tree today. If one shows
// up, the fix is to make this needle more specific (e.g. anchor on the
// leading quote), not to weaken or remove it.
const FORBIDDEN = ['selected_idp', 'post_login_redirect', '/dashboard/public-affairs', '/auth'];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) return walk(p);
    // Test files are deliberately excluded: a test may legitimately need one
    // of the FORBIDDEN literals to assert against (e.g. to pin that a
    // component does *not* emit it). This is a decision, not an oversight —
    // but it means this guard is blind to `*.test.ts(x)`, so a dead contract
    // fixture (a leftover literal a test no longer needs) can accumulate
    // there unseen. Two such fixtures were found and removed on the previous
    // branch, which is how this was noticed.
    return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [p] : [];
  });
}

interface Offender {
  file: string;
  needle: string;
}

function findOffenders(): Offender[] {
  const offenders: Offender[] = [];
  for (const file of walk(SRC)) {
    const contents = readFileSync(file, 'utf-8');
    for (const needle of FORBIDDEN) {
      if (contents.includes(needle)) {
        offenders.push({ file, needle });
      }
    }
  }
  return offenders;
}

describe('@ronl/pa-cockpit host protocol', () => {
  it('names none of packages/frontend’s login/logout protocol', () => {
    const offenders = findOffenders();
    expect(offenders, offenders.map((o) => `${o.file} contains ${o.needle}`).join('\n')).toEqual(
      []
    );
  });
});
