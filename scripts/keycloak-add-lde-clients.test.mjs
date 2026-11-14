// Tests for the production guard in keycloak-add-lde-clients.sh. Self-contained,
// like the other scripts/*.test.mjs: no test runner, prints a PASS count, exits
// 1 on any failure. Run with `node scripts/keycloak-add-lde-clients.test.mjs`.
//
// The guard refuses --with-e2e and --with-test-author against production. It
// runs before any network call, and right after it the script stops on the
// missing client origins ("set ..."), so these tests run the real script and
// never reach a Keycloak (#445).
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('./keycloak-add-lde-clients.sh', import.meta.url));

let passed = 0;
let failed = 0;

function run(url, flag) {
  // No client origin variables: an allowed URL stops right after the guard.
  const env = { PATH: process.env.PATH, KEYCLOAK_URL: url };
  const r = spawnSync('bash', [SCRIPT, flag, '--dry-run'], { env, encoding: 'utf8' });
  return { status: r.status, stderr: r.stderr ?? '' };
}

function expect(name, ok, detail) {
  if (ok) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL ${name}\n  ${detail}`);
  }
}

const refused = [
  'https://keycloak.open-regels.nl',
  'https://keycloak.open-regels.nl/',
  'https://keycloak.open-regels.nl:443',
  'https://KEYCLOAK.open-regels.nl/auth',
  'https://keycloak.open-regels.nl:443/realms/ronl?x=1',
  'https://keycloak.open-regels.nl.',
  'https://admin@keycloak.open-regels.nl',
  'http://keycloak.open-regels.nl:8080',
];
for (const url of refused) {
  for (const flag of ['--with-e2e', '--with-test-author']) {
    const r = run(url, flag);
    expect(
      `${flag} is refused on ${url}`,
      r.status === 2 && r.stderr.includes('refused on production'),
      `status ${r.status}, stderr: ${r.stderr.trim()}`
    );
  }
}

const allowed = [
  'http://localhost:8080',
  'https://acc.keycloak.open-regels.nl',
  'https://keycloak.open-regels.nl.example.com',
  'https://notkeycloak.open-regels.nl',
];
for (const url of allowed) {
  const r = run(url, '--with-e2e');
  expect(
    `--with-e2e passes the guard on ${url}`,
    !r.stderr.includes('refused on production') && r.stderr.includes('set '),
    `status ${r.status}, stderr: ${r.stderr.trim()}`
  );
}

console.log(`${passed} PASS, ${failed} FAIL`);
process.exit(failed === 0 ? 0 : 1);
