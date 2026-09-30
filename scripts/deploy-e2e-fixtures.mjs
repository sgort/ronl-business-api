#!/usr/bin/env node
/**
 * deploy-e2e-fixtures.mjs — a pointer, not a deployer.
 *
 * The real script lives in linked-data-explorer, beside the fixtures, the
 * manifest and the deploy route it uses. It used to live here, because this
 * repository's E2E gate is what needs the bundle present, and reached across
 * for every file it read.
 *
 * Keeping a copy in each repository was the alternative, and it is the worse
 * one: both read `ronl:documentRef` out of the BPMN, and when that attribute
 * became a comma-separated list the copy here silently stopped matching any
 * template — the whole bundle would have failed to deploy. One more place to
 * forget is exactly the failure this move removes.
 *
 * This shim stays so `npm run e2e:deploy-fixtures` still works from here, and
 * so the command that e2e/global-setup.ts prints when the bundle is missing
 * keeps naming something that exists.
 *
 * LDE_PATH overrides where linked-data-explorer is; it defaults to a sibling
 * checkout. Arguments and the exit code pass straight through.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const LDE = resolve(REPO_ROOT, process.env.LDE_PATH ?? '../linked-data-explorer');
const SCRIPT = join(LDE, 'scripts', 'deploy-e2e-fixtures.mjs');

if (!existsSync(SCRIPT)) {
  console.error(
    `\n✗ Cannot deploy the E2E fixtures: ${SCRIPT} does not exist.\n\n` +
      `  The fixtures and their deploy script live in linked-data-explorer.\n` +
      `  Check it out beside this repository, or set LDE_PATH to where it is.\n`
  );
  process.exit(1);
}

const { status } = spawnSync(process.execPath, [SCRIPT, ...process.argv.slice(2)], {
  stdio: 'inherit',
  cwd: LDE,
});
process.exit(status ?? 1);
