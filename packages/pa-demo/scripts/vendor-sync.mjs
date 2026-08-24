/**
 * Copies the manifest's files from packages/frontend into src/vendor,
 * unmodified. Run it to create the fork and to re-sync during the window
 * before @ronl/pa-cockpit is extracted.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VENDORED_FILES, ORIGIN_ROOT, VENDOR_ROOT } from './vendor-manifest.mjs';

const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const originDir = path.resolve(pkgDir, ORIGIN_ROOT);
const vendorDir = path.resolve(pkgDir, VENDOR_ROOT);

let copied = 0;
for (const rel of VENDORED_FILES) {
  const src = path.join(originDir, rel);
  const dest = path.join(vendorDir, rel);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, await readFile(src));
  copied += 1;
}
console.log(`Vendored ${copied} files from ${ORIGIN_ROOT} into ${VENDOR_ROOT}.`);
