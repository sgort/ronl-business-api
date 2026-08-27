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

const FORBIDDEN = ['selected_idp', 'post_login_redirect', '/dashboard/public-affairs', '/auth'];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) return walk(p);
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
