/**
 * Build gate: fails if the built bundle contains an auth library, telemetry,
 * or a backend origin.
 *
 * Modelled on packages/public-site/scripts/check-bundle.mjs but deliberately
 * NOT a copy of its list. That one forbids the bare string 'keycloak', which
 * this bundle ships legitimately: DB_ROLES carries keycloak: 'pa-author' |
 * 'pa-editor' | 'pa-admin', and Dossierbeheer renders "· Keycloak: {…}" as
 * visible UI in the role bar. Forbidding the library name and the origins
 * instead is both correct here and a stronger assertion — an origin absent
 * from the bundle cannot be requested at all.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const FORBIDDEN = [
  // Auth libraries — plato is unauthenticated by construction.
  'keycloak-js',
  'msal',
  '@azure/msal',
  'oidc-client',
  // Telemetry — a public demo tracks nobody.
  'react-ga',
  'google-analytics',
  'gtag(',
  // Backend origins — the no-Live guarantee at build time.
  'api.open-regels.nl',
  'acc.api.open-regels.nl',
];

export async function findForbiddenStrings(distDir) {
  const hits = [];

  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.name.endsWith('.js')) {
        const text = (await readFile(full, 'utf-8')).toLowerCase();
        for (const term of FORBIDDEN) {
          if (text.includes(term.toLowerCase())) hits.push({ file: full, term });
        }
      }
    }
  }

  await walk(distDir);
  return hits;
}

// CLI entry point — only runs when invoked directly (`node check-bundle.mjs`),
// not when imported by the test above.
//
// isMainModule is a plain string comparison, not `import.meta.url ===
// \`file://${argv1}\``: on Windows argv1 is a drive-letter path with
// backslashes ('C:\Users\...'), so that naive template literal produces
// 'file://C:\Users\...' while import.meta.url is the properly encoded
// 'file:///C:/Users/...' — they never match, the guard is always false, and
// this whole gate silently no-ops. pathToFileURL() applies the same
// encoding Node used to produce import.meta.url, so the comparison holds on
// both POSIX and Windows. Do not "simplify" this back to string
// concatenation.
//
// The `windows` option is passed explicitly (based on argv1's own shape,
// not `process.platform`) so this function behaves identically no matter
// what OS it is tested on — pathToFileURL()'s undocumented "current system
// default" behavior would otherwise make the Windows-shaped case
// untestable from a POSIX CI runner. A real argv1 always matches its own
// host's shape, so this changes nothing about how the guard behaves in
// production.
export function isMainModule(metaUrl, argv1) {
  if (!argv1) return false;
  const isWindowsPath = /^[a-zA-Z]:[\\/]/.test(argv1);
  return metaUrl === pathToFileURL(argv1, { windows: isWindowsPath }).href;
}

if (isMainModule(import.meta.url, process.argv[1])) {
  const distDir = path.resolve(process.cwd(), 'dist');
  const hits = await findForbiddenStrings(distDir);
  if (hits.length) {
    console.error('Forbidden strings found in the built bundle:');
    for (const h of hits) console.error(`  ${h.file}: "${h.term}"`);
    process.exitCode = 1;
  } else {
    console.log('Bundle clean — no auth library, telemetry or backend origin.');
  }
}
