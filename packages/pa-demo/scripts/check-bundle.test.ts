import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { findForbiddenStrings, isMainModule } from './check-bundle.mjs';

const execFileAsync = promisify(execFile);
// Not `new URL('./check-bundle.mjs', import.meta.url)`: under the jsdom test
// environment, global URL is jsdom's implementation, and node:url's
// fileURLToPath rejects a URL instance it didn't construct itself.
const SCRIPT_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'check-bundle.mjs');

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

describe('isMainModule', () => {
  it('matches on POSIX: a plain unix path', () => {
    expect(
      isMainModule('file:///home/u/scripts/check-bundle.mjs', '/home/u/scripts/check-bundle.mjs')
    ).toBe(true);
  });

  it('matches on Windows: a drive-letter, backslash path', () => {
    // This is the case the old `file://${argv1}` template literal got wrong:
    // argv1 arrives with backslashes and no leading slash, so string
    // concatenation could never equal the properly encoded import.meta.url.
    expect(
      isMainModule(
        'file:///C:/Users/u/scripts/check-bundle.mjs',
        'C:\\Users\\u\\scripts\\check-bundle.mjs'
      )
    ).toBe(true);
  });

  it('is false when the module was imported rather than run directly', () => {
    expect(
      isMainModule(
        'file:///home/u/scripts/check-bundle.mjs',
        '/home/u/scripts/some-other-entry.mjs'
      )
    ).toBe(false);
  });

  it('is false when argv1 is undefined', () => {
    expect(isMainModule('file:///home/u/scripts/check-bundle.mjs', undefined)).toBe(false);
  });
});

describe('check-bundle.mjs CLI', () => {
  async function fixture(contents: Record<string, string>): Promise<string> {
    dir = await mkdtemp(path.join(tmpdir(), 'pa-demo-cli-'));
    const distDir = path.join(dir, 'dist');
    await mkdir(distDir, { recursive: true });
    for (const [rel, text] of Object.entries(contents)) {
      const full = path.join(distDir, rel);
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, text);
    }
    return dir;
  }

  it('exits non-zero and names the forbidden term for a dirty bundle', async () => {
    const cwd = await fixture({ 'index.js': `import Keycloak from "keycloak-js";` });
    await expect(execFileAsync(process.execPath, [SCRIPT_PATH], { cwd })).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining('keycloak-js'),
    });
  });

  it('exits 0 and prints the success line for a clean bundle', async () => {
    const cwd = await fixture({ 'index.js': 'console.log("hello")' });
    const { stdout } = await execFileAsync(process.execPath, [SCRIPT_PATH], { cwd });
    expect(stdout).toContain('Bundle clean — no auth library, telemetry or backend origin.');
  });
});
