import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm, readFile } from 'node:fs/promises';
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

  it('ignores a trailing-newline difference nowhere and reports it as drift', async () => {
    // Byte-identical means byte-identical. A formatter that rewrites the origin
    // is real drift, because the next sync would bring the change across.
    const { origin, vendor } = await fixture();
    await writeFile(path.join(origin, 'a.ts'), 'export const a = 1;\n\n');
    await writeFile(path.join(vendor, 'a.ts'), 'export const a = 1;\n');
    expect(await compareTrees(origin, vendor, ['a.ts'])).toEqual([
      { file: 'a.ts', status: 'changed' },
    ]);
  });
});
