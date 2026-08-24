/**
 * Reports files whose vendored copy no longer matches packages/frontend.
 *
 * Byte-for-byte, deliberately: the whole value of this fork is that the copy
 * is unmodified, so the eventual @ronl/pa-cockpit extraction is a directory
 * deletion rather than a merge. Any difference at all is worth naming.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VENDORED_FILES, ORIGIN_ROOT, VENDOR_ROOT } from './vendor-manifest.mjs';

export async function compareTrees(originDir, vendorDir, files) {
  const drift = [];
  for (const rel of files) {
    let origin;
    try {
      origin = await readFile(path.join(originDir, rel), 'utf-8');
    } catch {
      // The origin file is gone — it was renamed or deleted upstream.
      drift.push({ file: rel, status: 'changed' });
      continue;
    }
    let copy;
    try {
      copy = await readFile(path.join(vendorDir, rel), 'utf-8');
    } catch {
      drift.push({ file: rel, status: 'missing' });
      continue;
    }
    if (origin !== copy) drift.push({ file: rel, status: 'changed' });
  }
  return drift;
}

export async function findDrift() {
  const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  return compareTrees(
    path.resolve(pkgDir, ORIGIN_ROOT),
    path.resolve(pkgDir, VENDOR_ROOT),
    VENDORED_FILES
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const drift = await findDrift();
  if (drift.length) {
    console.error(`${drift.length} vendored file(s) diverged from packages/frontend:`);
    for (const d of drift) console.error(`  ${d.status.padEnd(8)} ${d.file}`);
    console.error('\nRun `npm run vendor:sync --workspace=@ronl/pa-demo` to re-copy,');
    console.error('then re-run the pa-demo suite — a cockpit change may need a demo change.');
    process.exitCode = 1;
  } else {
    console.log(`All ${VENDORED_FILES.length} vendored files match packages/frontend.`);
  }
}
