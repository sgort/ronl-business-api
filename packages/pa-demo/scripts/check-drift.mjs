/**
 * Reports files whose vendored copy no longer matches packages/frontend.
 *
 * Byte-for-byte, deliberately: the whole value of this fork is that the copy
 * is unmodified, so the eventual @ronl/pa-cockpit extraction is a directory
 * deletion rather than a merge. Any difference at all is worth naming.
 *
 * Reads with no encoding (raw Buffer) rather than 'utf-8' so this is safe
 * for the binary PNGs in ASSET_FILES, not just the text files in
 * VENDORED_FILES — a lossy utf-8 decode of arbitrary binary bytes can turn
 * two genuinely different files into equal strings (invalid byte sequences
 * collapse to the same replacement character), which would silently defeat
 * the byte-for-byte guarantee above for exactly the files most likely to
 * need it.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  VENDORED_FILES,
  ORIGIN_ROOT,
  VENDOR_ROOT,
  ASSET_FILES,
  ASSET_ORIGIN_ROOT,
  ASSET_VENDOR_ROOT,
} from './vendor-manifest.mjs';

export async function compareTrees(originDir, vendorDir, files) {
  const drift = [];
  for (const rel of files) {
    let origin;
    try {
      origin = await readFile(path.join(originDir, rel));
    } catch {
      // The origin file is gone — it was renamed or deleted upstream.
      drift.push({ file: rel, status: 'changed' });
      continue;
    }
    let copy;
    try {
      copy = await readFile(path.join(vendorDir, rel));
    } catch {
      drift.push({ file: rel, status: 'missing' });
      continue;
    }
    if (!origin.equals(copy)) drift.push({ file: rel, status: 'changed' });
  }
  return drift;
}

export async function findDrift() {
  const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const srcDrift = await compareTrees(
    path.resolve(pkgDir, ORIGIN_ROOT),
    path.resolve(pkgDir, VENDOR_ROOT),
    VENDORED_FILES
  );
  const assetDrift = await compareTrees(
    path.resolve(pkgDir, ASSET_ORIGIN_ROOT),
    path.resolve(pkgDir, ASSET_VENDOR_ROOT),
    ASSET_FILES
  );
  return [...srcDrift, ...assetDrift];
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
    console.log(
      `All ${VENDORED_FILES.length} vendored files and ${ASSET_FILES.length} vendored assets match packages/frontend.`
    );
  }
}
