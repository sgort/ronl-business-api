// Tests for the input checks and the dry run of keycloak-add-brp-raadpleger.sh
// (#319). Self-contained, like the other scripts/*.test.mjs: no test runner,
// prints a PASS count, exits 1 on any failure. Run with
// `node scripts/keycloak-add-brp-raadpleger.test.mjs`. Every case stops
// before the network.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('./keycloak-add-brp-raadpleger.sh', import.meta.url));

let passed = 0;
let failed = 0;

function run(extraEnv, ...flags) {
  const env = { PATH: process.env.PATH, KEYCLOAK_URL: 'https://keycloak.example', ...extraEnv };
  const r = spawnSync('bash', [SCRIPT, ...flags], { env, encoding: 'utf8' });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

function expect(name, ok, detail) {
  if (ok) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL ${name}\n  ${detail}`);
  }
}

// The script must never put a real burgerservicenummer on a test account.
for (const bsn of ['123456782', '99999223', '9999922351', 'abc', '']) {
  const r = run({ TEST_BSN: bsn }, '--dry-run');
  const refused = bsn === '' ? r.status === 0 : r.status === 2 && r.stderr.includes('reserved');
  expect(
    bsn === '' ? 'an empty TEST_BSN falls back to the default' : `refuses TEST_BSN=${bsn}`,
    refused,
    `status ${r.status}, stderr: ${r.stderr.trim()}`
  );
}

{
  const r = run({}, '--dry-run');
  expect('dry run succeeds with the defaults', r.status === 0, `status ${r.status}: ${r.stderr}`);
  expect(
    'dry run names the role and the composite',
    r.stdout.includes('"name": "brp-raadpleger"') &&
      r.stdout.includes('caseworker includes brp-raadpleger'),
    r.stdout
  );
  expect(
    'dry run maps the bsn attribute into the bsn claim',
    r.stdout.includes('"user.attribute": "bsn"') && r.stdout.includes('"claim.name": "bsn"'),
    r.stdout
  );
  expect(
    'dry run sets the default test BSN on the seven test citizens',
    r.stdout.includes('bsn=999992235') &&
      ['utrecht', 'amsterdam', 'heusden', 'bes', 'rotterdam', 'denhaag', 'flevoland'].every((t) =>
        r.stdout.includes(`test-citizen-${t}`)
      ),
    r.stdout
  );
  expect('dry run sends nothing', r.stdout.includes('nothing is sent'), r.stdout);
}

{
  const r = run({ TEST_BSN: '999990019' }, '--dry-run');
  expect('dry run uses a given test BSN', r.stdout.includes('bsn=999990019'), r.stdout);
}

{
  const r = run({}, '--bogus');
  expect('refuses an unknown argument', r.status === 2, `status ${r.status}`);
}

console.log(`${passed} PASS, ${failed} FAIL`);
process.exit(failed === 0 ? 0 : 1);
