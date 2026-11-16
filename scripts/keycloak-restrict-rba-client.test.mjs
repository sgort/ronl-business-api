// Tests for the input checks and the dry run of keycloak-restrict-rba-client.sh
// (#188). Self-contained, like the other scripts/*.test.mjs: no test runner,
// prints a PASS count, exits 1 on any failure. Run with
// `node scripts/keycloak-restrict-rba-client.test.mjs`.
//
// Every case stops before the network: either on an input check or at the end
// of --dry-run, which prints what the client would get and sends nothing.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('./keycloak-restrict-rba-client.sh', import.meta.url));

let passed = 0;
let failed = 0;

function run(origins, ...flags) {
  const env = { PATH: process.env.PATH, KEYCLOAK_URL: 'https://keycloak.example' };
  if (origins !== undefined) env.RBA_ORIGINS = origins;
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

// Refused before anything is sent.
const refused = [
  [undefined, 'set RBA_ORIGINS'],
  ['', 'set RBA_ORIGINS'],
  ['https://mijn.open-regels.nl/', 'not an origin'],
  ['https://mijn.open-regels.nl/dashboard', 'not an origin'],
  ['mijn.open-regels.nl', 'not an origin'],
  // The prefix wildcard that would admit https://<slug>-x.attacker.example/.
  ['https://ashy-pebble-0d80dbe03-*', 'not an origin'],
  ['*', 'not an origin'],
  ['https://evil.example.com', "probe's counter-example"],
];
for (const [origins, message] of refused) {
  const r = run(origins, '--dry-run');
  expect(
    `refuses RBA_ORIGINS=${JSON.stringify(origins)}`,
    r.status === 2 && r.stderr.includes(message),
    `status ${r.status}, stderr: ${r.stderr.trim()}`
  );
}

{
  const r = run('https://a.example', '--dry-run', '--probe');
  expect(
    '--dry-run and --probe exclude each other',
    r.status === 2 && r.stderr.includes('exclude each other'),
    `status ${r.status}, stderr: ${r.stderr.trim()}`
  );
}

// The dry run shows the narrowed fields: one "/*" URI per origin, "+" for web
// origins and post-logout, and PKCE only when asked.
function dryRunJson(...flags) {
  const r = run('https://mijn.open-regels.nl, http://localhost:5173', '--dry-run', ...flags);
  const json = r.stdout.slice(r.stdout.indexOf('{'));
  return { status: r.status, fields: JSON.parse(json) };
}
{
  const { status, fields } = dryRunJson();
  expect(
    'dry run lists one redirect URI per origin',
    status === 0 &&
      JSON.stringify(fields.redirectUris) ===
        JSON.stringify(['https://mijn.open-regels.nl/*', 'http://localhost:5173/*']),
    JSON.stringify(fields)
  );
  expect(
    'dry run narrows web origins and post-logout to "+"',
    JSON.stringify(fields.webOrigins) === '["+"]' && fields.postLogoutRedirectUris === '+',
    JSON.stringify(fields)
  );
  expect(
    'dry run leaves PKCE alone without --enforce-pkce',
    fields.pkce === null,
    JSON.stringify(fields)
  );
}
{
  const { fields } = dryRunJson('--enforce-pkce');
  expect(
    'dry run sets PKCE S256 with --enforce-pkce',
    fields.pkce === 'S256',
    JSON.stringify(fields)
  );
}

// RBA_PREVIEW_PREFIX: the deliberate ACC-only wildcard (#188, risk accepted on
// ACC). Refused for the production host, however it is spelled.
function runPreview(url, prefix) {
  const env = {
    PATH: process.env.PATH,
    KEYCLOAK_URL: url,
    RBA_ORIGINS: 'https://acc.mijn.open-regels.nl',
    RBA_PREVIEW_PREFIX: prefix,
  };
  const r = spawnSync('bash', [SCRIPT, '--dry-run'], { env, encoding: 'utf8' });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}
for (const url of [
  'https://keycloak.open-regels.nl',
  'https://KEYCLOAK.open-regels.nl:443/',
  'https://keycloak.open-regels.nl.',
  'https://',
]) {
  const r = runPreview(url, 'https://ashy-pebble-0d80dbe03-');
  expect(
    `RBA_PREVIEW_PREFIX is refused on ${url}`,
    r.status === 2 && r.stderr.includes('refused on production'),
    `status ${r.status}, stderr: ${r.stderr.trim()}`
  );
}
for (const prefix of [
  'https://ashy-pebble-0d80dbe03',
  'https://ashy-pebble-0d80dbe03-*',
  'http://ashy-pebble-0d80dbe03-',
  'https://ashy.pebble-',
]) {
  const r = runPreview('https://acc.keycloak.open-regels.nl', prefix);
  expect(
    `RBA_PREVIEW_PREFIX ${prefix} is refused as malformed`,
    r.status === 2 && r.stderr.includes('must look like'),
    `status ${r.status}, stderr: ${r.stderr.trim()}`
  );
}
{
  const r = runPreview('https://acc.keycloak.open-regels.nl', 'https://ashy-pebble-0d80dbe03-');
  const fields = JSON.parse(r.stdout.slice(r.stdout.indexOf('{')));
  expect(
    'on ACC the preview wildcard is added and web origins stay "*"',
    r.status === 0 &&
      JSON.stringify(fields.redirectUris) ===
        JSON.stringify(['https://acc.mijn.open-regels.nl/*', 'https://ashy-pebble-0d80dbe03-*']) &&
      JSON.stringify(fields.webOrigins) === '["*"]',
    JSON.stringify(fields)
  );
}

console.log(`${passed} PASS, ${failed} FAIL`);
process.exit(failed === 0 ? 0 : 1);
