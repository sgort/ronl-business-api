import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { findForbiddenStrings } from './check-bundle.mjs';

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
