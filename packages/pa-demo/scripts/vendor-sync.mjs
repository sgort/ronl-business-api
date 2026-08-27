/**
 * Copies the manifest's files from packages/frontend into src/vendor and
 * public, unmodified. Run it to create the fork and to re-sync during the
 * window before @ronl/pa-cockpit is extracted.
 *
 * Two roots, same copy logic: VENDORED_FILES (src/ -> src/vendor, code) and
 * ASSET_FILES (public/ -> public, static assets the vendored code reaches
 * by absolute path or fetch rather than by import). readFile/writeFile with
 * no encoding round-trip raw bytes, which is what makes this safe for the
 * binary PNGs in ASSET_FILES as well as the text files in VENDORED_FILES.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
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

const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function syncRoot(files, originRoot, vendorRoot) {
  const originDir = path.resolve(pkgDir, originRoot);
  const vendorDir = path.resolve(pkgDir, vendorRoot);
  let copied = 0;
  for (const rel of files) {
    const src = path.join(originDir, rel);
    const dest = path.join(vendorDir, rel);
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, await readFile(src));
    copied += 1;
  }
  return copied;
}

const srcCopied = await syncRoot(VENDORED_FILES, ORIGIN_ROOT, VENDOR_ROOT);
console.log(`Vendored ${srcCopied} files from ${ORIGIN_ROOT} into ${VENDOR_ROOT}.`);

const assetsCopied = await syncRoot(ASSET_FILES, ASSET_ORIGIN_ROOT, ASSET_VENDOR_ROOT);
console.log(`Vendored ${assetsCopied} assets from ${ASSET_ORIGIN_ROOT} into ${ASSET_VENDOR_ROOT}.`);
