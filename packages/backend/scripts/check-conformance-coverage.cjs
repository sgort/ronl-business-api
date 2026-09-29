#!/usr/bin/env node
// packages/backend/scripts/check-conformance-coverage.cjs
//
// The floor under src/openapi/testing/conformance.ts (#269): every operation in
// the document must have been compared against a real response at least once.
//
// WHAT IT GUARDS. src/openapi/coverage.test.ts proves every served operation is
// DOCUMENTED, and nothing proved every documented operation is actually
// CHECKED. So the 131st could arrive with a description no test ever compared
// against a response -- which is the drift the helper exists to catch. Without
// this, the helper's reach could quietly shrink and every test would stay
// green.
//
// WHY A SEPARATE PROCESS, and not a globalTeardown. It WAS a globalTeardown
// first, and that version was useless: Jest prints an error thrown there but
// still exits 0, so the gap was reported and the build passed anyway. Found by
// deleting an assertion and watching `npm run test:serial` exit 0 while saying
// one operation was unchecked. A separate step after `jest &&` can exit
// non-zero, which is the whole point.
//
// WHY NOT A STATIC SCAN of the test sources. That was tried first and
// undercounted twice: prettier wraps the call when the path is long, and
// m2m.routes.test.ts drives eighteen operations from a table, passing the path
// as a variable. Both times the number looked plausible and was wrong. So the
// helper records what it was actually asked about, at runtime, into
// CONFORMANCE_LOG (allocated by scripts/jest-global-setup.cjs).
//
// WHEN IT IS SKIPPED. A filtered run -- `npx jest -t something`, or one file --
// exercises a handful of operations by design, and failing it would make every
// focused run red. Those do not go through `npm test`, so they never reach this
// script. If the log is missing entirely, that is a filtered or partial run and
// this exits 0 with a note rather than inventing a failure.

const fs = require('fs');
const path = require('path');

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'];
const DOCUMENT = path.resolve(__dirname, '../openapi/openapi.json');
const LOG = path.resolve(__dirname, '../conformance-operations.log');

if (!fs.existsSync(LOG)) {
  console.log('conformance coverage: no log from this run, skipping (a filtered run?)');
  process.exit(0);
}

const document = JSON.parse(fs.readFileSync(DOCUMENT, 'utf8'));
const documented = new Set();
for (const [route, operations] of Object.entries(document.paths ?? {})) {
  for (const method of Object.keys(operations)) {
    if (HTTP_METHODS.includes(method)) documented.add(`${method} ${route}`);
  }
}

const checked = new Set(fs.readFileSync(LOG, 'utf8').split('\n').filter(Boolean));
fs.rmSync(LOG, { force: true });

// An operation checked but absent from the document already failed its own
// assertion ("... is not documented"), so only this direction is interesting.
const unchecked = [...documented].filter((op) => !checked.has(op)).sort();

if (unchecked.length > 0) {
  console.error(
    `\n✗ ${unchecked.length} of ${documented.size} documented operations were never checked ` +
      `against a real response:\n\n` +
      unchecked.map((op) => `    ${op}`).join('\n') +
      `\n\n  Add expectToMatchOperation(res, '<method>', '<path>') to a route test that\n` +
      `  exercises each one. See src/openapi/testing/conformance.ts.\n`
  );
  process.exit(1);
}

console.log(`✓ all ${documented.size} documented operations were checked against a real response`);
