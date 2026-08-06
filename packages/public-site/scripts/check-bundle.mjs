/**
 * Build gate: fails if any built .js file mentions auth or telemetry
 * libraries that must never ship in this bundle (DoD: "No auth, telemetry
 * or assistant code in the bundle"). Run as the last step of every
 * build/build:acc/build:prod script (see package.json).
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

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
if (import.meta.url === `file://${process.argv[1]}`) {
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
