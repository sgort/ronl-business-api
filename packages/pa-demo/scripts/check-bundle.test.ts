import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { findForbiddenStrings } from './check-bundle.mjs';

let dir: string;
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

async function bundle(contents: Record<string, string>): Promise<string> {
  dir = await mkdtemp(path.join(tmpdir(), 'pa-demo-bundle-'));
  for (const [rel, text] of Object.entries(contents)) {
    const full = path.join(dir, rel);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, text);
  }
  return dir;
}

describe('findForbiddenStrings', () => {
  it('rejects the real Keycloak library', async () => {
    const d = await bundle({ 'index.js': `import Keycloak from "keycloak-js";` });
    expect((await findForbiddenStrings(d)).map((h) => h.term)).toContain('keycloak-js');
  });

  it('rejects a backend origin — the strongest no-Live guarantee', async () => {
    // Stronger than the CSP: this proves the URL is not present to be
    // requested at all, rather than that the browser would refuse it.
    const d = await bundle({ 'assets/app.js': `fetch("https://api.open-regels.nl/v1/pa")` });
    expect((await findForbiddenStrings(d)).map((h) => h.term)).toContain('api.open-regels.nl');
  });

  it('rejects the ACC backend origin too', async () => {
    const d = await bundle({ 'index.js': `"https://acc.api.open-regels.nl/v1"` });
    expect((await findForbiddenStrings(d)).map((h) => h.term)).toContain('acc.api.open-regels.nl');
  });

  it('rejects telemetry', async () => {
    const d = await bundle({ 'index.js': `gtag("event")` });
    expect((await findForbiddenStrings(d)).map((h) => h.term)).toContain('gtag(');
  });

  it('ALLOWS the bare word keycloak, which this bundle ships legitimately', async () => {
    // DB_ROLES carries keycloak: 'pa-author' | 'pa-editor' | 'pa-admin', and
    // Dossierbeheer renders "· Keycloak: {role.keycloak}" as visible UI. A
    // verbatim copy of public-site's gate, which forbids the bare string,
    // would fail this build on correct code.
    const d = await bundle({ 'index.js': `{keycloak:"pa-admin",label:"Beheerder"}` });
    expect(await findForbiddenStrings(d)).toEqual([]);
  });

  it('scans nested directories and ignores non-.js files', async () => {
    const d = await bundle({
      'assets/nested/a.js': 'clean',
      'notes.txt': 'https://api.open-regels.nl',
    });
    expect(await findForbiddenStrings(d)).toEqual([]);
  });

  it('returns no hits for a clean bundle', async () => {
    const d = await bundle({ 'index.js': 'console.log("hello")' });
    expect(await findForbiddenStrings(d)).toEqual([]);
  });
});
