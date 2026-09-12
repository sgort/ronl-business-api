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

describe('findForbiddenStrings', () => {
  it('finds a forbidden term inside a built .js file', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'bundle-check-'));
    await writeFile(path.join(dir, 'index.js'), `import Keycloak from 'keycloak-js';`);
    const hits = await findForbiddenStrings(dir);
    expect(hits).toHaveLength(1);
    expect(hits[0].term).toBe('keycloak');
  });

  it('is case-insensitive and scans nested directories', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'bundle-check-'));
    const nested = path.join(dir, 'assets');
    await writeFile(path.join(dir, 'a.js'), 'clean file');
    await import('node:fs/promises').then((fs) => fs.mkdir(nested));
    await writeFile(path.join(nested, 'b.js'), 'new MSAL.PublicClientApplication()');
    const hits = await findForbiddenStrings(dir);
    expect(hits.map((h) => h.term)).toContain('msal');
  });

  it('returns no hits for a clean bundle', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'bundle-check-'));
    await writeFile(path.join(dir, 'index.js'), 'console.log("hello")');
    expect(await findForbiddenStrings(dir)).toEqual([]);
  });

  it('ignores non-.js files', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'bundle-check-'));
    await writeFile(path.join(dir, 'notes.txt'), 'keycloak mentioned here but not JS');
    expect(await findForbiddenStrings(dir)).toEqual([]);
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
    dir = await mkdtemp(path.join(tmpdir(), 'public-site-cli-'));
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
      stderr: expect.stringContaining('keycloak'),
    });
  });

  it('exits 0 and prints the success line for a clean bundle', async () => {
    const cwd = await fixture({ 'index.js': 'console.log("hello")' });
    const { stdout } = await execFileAsync(process.execPath, [SCRIPT_PATH], { cwd });
    expect(stdout).toContain('Bundle clean — no auth/telemetry strings found.');
  });
});
