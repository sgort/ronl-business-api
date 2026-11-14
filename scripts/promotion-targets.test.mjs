// Tests for promotion-targets.sh, which decides which production deploys a
// promotion runs. Self-contained, like the other scripts/*.test.mjs: no test
// runner, prints a PASS count, exits 1 on any failure. Run with
// `node scripts/promotion-targets.test.mjs`.
//
// All four ACC workflows' push `paths:` filters list the root package.json and
// package-lock.json, so a lockfile-only promotion must deploy all four (#354
// item 2). The patterns do not mirror those filters in every respect: the
// frontend ACC filter also lists keycloak-themes/**, which the frontend
// pattern here does not.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('./promotion-targets.sh', import.meta.url));
const ALL = ['backend', 'frontend', 'pa_demo', 'public_site'];

let passed = 0;
let failed = 0;

function targets(paths) {
  const env = { PATH: process.env.PATH };
  const r = spawnSync('bash', [SCRIPT], { input: paths.join('\n') + '\n', env, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`promotion-targets.sh exited ${r.status}: ${r.stderr}`);
  return Object.fromEntries(
    r.stdout
      .trim()
      .split(/\r?\n/)
      .map((line) => line.split('='))
      .map(([k, v]) => [k, v === 'true'])
  );
}

function expectDeploys(name, paths, deploys) {
  const got = targets(paths);
  const want = Object.fromEntries(ALL.map((t) => [t, deploys.includes(t)]));
  const ok = ALL.every((t) => got[t] === want[t]);
  if (ok) passed++;
  else {
    failed++;
    console.error(`FAIL ${name}\n  want ${JSON.stringify(want)}\n  got  ${JSON.stringify(got)}`);
  }
}

expectDeploys('a lockfile-only change deploys all four', ['package-lock.json'], ALL);
expectDeploys('a root package.json change deploys all four', ['package.json'], ALL);
expectDeploys(
  "a workspace's own package.json is that workspace only",
  ['packages/frontend/package.json'],
  ['frontend']
);
expectDeploys(
  'a shared change deploys backend, frontend and pa-demo',
  ['packages/shared/src/x.ts'],
  ['backend', 'frontend', 'pa_demo']
);
expectDeploys(
  'a pa-cockpit change deploys frontend and pa-demo',
  ['packages/pa-cockpit/src/x.ts'],
  ['frontend', 'pa_demo']
);
expectDeploys(
  'a public-site change deploys the public site only',
  ['packages/public-site/x.ts'],
  ['public_site']
);
expectDeploys('documentation deploys nothing', ['docs/x.md', 'SECURITY-PIPELINE.md'], []);

console.log(`${passed} PASS, ${failed} FAIL`);
process.exit(failed === 0 ? 0 : 1);
