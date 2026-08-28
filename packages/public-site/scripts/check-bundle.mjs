/**
 * Build gate: fails if any built .js file mentions auth or telemetry
 * libraries that must never ship in this bundle (DoD: "No auth, telemetry
 * or assistant code in the bundle"). Run as the last step of every
 * build/build:acc/build:prod script (see package.json).
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const FORBIDDEN = [
  'keycloak',
  'msal',
  '@azure/msal',
  'oidc-client',
  'react-ga',
  'google-analytics',
  'gtag(',
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
    console.error('Forbidden auth/telemetry strings found in the built bundle:');
    for (const h of hits) console.error(`  ${h.file}: "${h.term}"`);
    process.exitCode = 1;
  } else {
    console.log('Bundle clean — no auth/telemetry strings found.');
  }
}
