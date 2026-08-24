import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { compareTrees } from './check-drift.mjs';

let dir: string;
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

async function fixture(): Promise<{ origin: string; vendor: string }> {
  dir = await mkdtemp(path.join(tmpdir(), 'drift-'));
  const origin = path.join(dir, 'origin');
  const vendor = path.join(dir, 'vendor');
  await mkdir(origin, { recursive: true });
  await mkdir(vendor, { recursive: true });
  return { origin, vendor };
}

describe('compareTrees', () => {
  it('reports nothing when the copy is byte-identical', async () => {
    const { origin, vendor } = await fixture();
    await writeFile(path.join(origin, 'a.ts'), 'export const a = 1;\n');
    await writeFile(path.join(vendor, 'a.ts'), 'export const a = 1;\n');
    expect(await compareTrees(origin, vendor, ['a.ts'])).toEqual([]);
  });

  it('reports a file whose origin has changed', async () => {
    const { origin, vendor } = await fixture();
    await writeFile(path.join(origin, 'a.ts'), 'export const a = 2;\n');
    await writeFile(path.join(vendor, 'a.ts'), 'export const a = 1;\n');
    const drift = await compareTrees(origin, vendor, ['a.ts']);
    expect(drift).toEqual([{ file: 'a.ts', status: 'changed' }]);
  });

  it('reports a file that was never vendored', async () => {
    const { origin, vendor } = await fixture();
    await writeFile(path.join(origin, 'b.ts'), 'export const b = 1;\n');
    const drift = await compareTrees(origin, vendor, ['b.ts']);
    expect(drift).toEqual([{ file: 'b.ts', status: 'missing' }]);
  });

  it('treats a trailing-newline difference as drift, not a false negative', async () => {
    // Byte-identical means byte-identical. A formatter that rewrites the origin
    // is real drift, because the next sync would bring the change across.
    const { origin, vendor } = await fixture();
    await writeFile(path.join(origin, 'a.ts'), 'export const a = 1;\n\n');
    await writeFile(path.join(vendor, 'a.ts'), 'export const a = 1;\n');
    expect(await compareTrees(origin, vendor, ['a.ts'])).toEqual([
      { file: 'a.ts', status: 'changed' },
    ]);
  });

  it('reports a file whose origin was renamed or deleted upstream, without throwing', async () => {
    // Origin-side-missing shares the 'changed' status with a content mismatch
    // (see check-drift.mjs) — this asserts that overload deliberately, and
    // that the branch does not throw. An upstream rename during the window
    // before the cockpit is extracted is exactly when this branch fires.
    const { origin, vendor } = await fixture();
    await writeFile(path.join(vendor, 'c.ts'), 'export const c = 1;\n');
    await expect(compareTrees(origin, vendor, ['c.ts'])).resolves.toEqual([
      { file: 'c.ts', status: 'changed' },
    ]);
  });
});
