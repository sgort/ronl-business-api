#!/usr/bin/env node
/**
 * check-swimlane-fixtures.mjs — the parser fixtures are copies, and copies rot.
 *
 * THE GAP THIS CLOSES. `packages/backend/src/rip-swimlane/__fixtures__/` holds
 * twelve RIP phase BPMNs copied from linked-data-explorer's
 * `examples/organizations/flevoland/rip-phase-NN/`, which is their source of
 * truth. The copy is a `cp` loop written down in
 * docs/superpowers/plans/2026-09-03-rip-phase-swimlane-derivation.md and run by
 * hand. Nothing checked it afterwards.
 *
 * So the parser tests could keep passing against a model the engine no longer
 * runs, and would report green while doing it — the worst kind of stale, since
 * the suite's whole purpose is to pin parsing against REAL files. The failure
 * is invisible until someone compares a rendered swimlane with the process it
 * claims to describe.
 *
 * WHY TWO CHECKS RATHER THAN ONE. Neither repository's ci can see the other, so
 * a direct file comparison only runs where both trees exist — a developer's
 * machine. Alone that would leave the likeliest failure uncovered: someone
 * edits a phase model in linked-data-explorer and never pushes THIS
 * repository, so a hook here never fires.
 *
 * Hence the sha256 fingerprints in rip-bpmn-fingerprints.json, committed
 * identically in both repositories. Each side verifies its own files against
 * them, which works in ci with nothing checked out but itself:
 *
 *   - a phase model edited upstream fails linked-data-explorer's check until
 *     its fingerprints are regenerated, and regenerating them is where the
 *     author is told to come and refresh these fixtures
 *   - a fixture edited HERE fails this check, because these are copies and the
 *     edit belongs upstream
 *   - both updated together is the only green path
 *
 * When linked-data-explorer IS checked out alongside, the fingerprints are
 * backed up by a byte-for-byte comparison, because a hash tells you something
 * changed while the real file tells you what.
 *
 * `--sync` copies the twelve models and the fingerprint file from
 * linked-data-explorer. `LDE_PATH` overrides where that is; it defaults to a
 * sibling checkout. Exit 0 when the fixtures match their source, 1 otherwise;
 * a failure names the file and the command that fixes it.
 */

import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const FIXTURES = 'packages/backend/src/rip-swimlane/__fixtures__';
const FINGERPRINTS = 'rip-bpmn-fingerprints.json';
const LDE = process.env.LDE_PATH ?? join('..', 'linked-data-explorer');

const sync = process.argv.includes('--sync');

const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

/** Where a phase model lives upstream: RipR22Process.bpmn -> rip-phase-22. */
function upstreamPath(name) {
  const phase = name.match(/^RipR(\d\d)Process\.bpmn$/)?.[1];
  if (!phase) return null;
  return join(LDE, 'examples', 'organizations', 'flevoland', `rip-phase-${phase}`, name);
}

const fixtures = existsSync(FIXTURES)
  ? readdirSync(FIXTURES)
      .filter((f) => /^RipR\d\dProcess\.bpmn$/.test(f))
      .sort()
  : [];

if (fixtures.length === 0) {
  console.error(`No RIP fixtures found in ${FIXTURES}.`);
  process.exit(1);
}

if (sync) {
  if (!existsSync(LDE)) {
    console.error(
      `\nCannot sync: no linked-data-explorer checkout at ${LDE}.\n` +
        `Set LDE_PATH to point at it.\n`
    );
    process.exit(1);
  }
  let copied = 0;
  for (const name of fixtures) {
    const source = upstreamPath(name);
    if (!source || !existsSync(source)) {
      console.error(`  no upstream source for ${name} (looked in ${source})`);
      continue;
    }
    copyFileSync(source, join(FIXTURES, name));
    copied += 1;
  }
  const upstreamFingerprints = join(LDE, FINGERPRINTS);
  if (existsSync(upstreamFingerprints)) {
    copyFileSync(upstreamFingerprints, FINGERPRINTS);
    console.log(`Copied ${copied} fixture(s) and ${FINGERPRINTS} from ${LDE}.`);
  } else {
    console.error(
      `Copied ${copied} fixture(s), but ${upstreamFingerprints} does not exist.\n` +
        `Run this first, upstream:  node scripts/check-rip-bpmn-copies.mjs --write`
    );
    process.exit(1);
  }
  process.exit(0);
}

const problems = [];

// ── against the fingerprints, which work with nothing else checked out ─────
if (!existsSync(FINGERPRINTS)) {
  problems.push(
    `- ${FINGERPRINTS} is missing. It is committed identically in both repositories; copy it with:\n` +
      `      npm run check-swimlane-fixtures -- --sync`
  );
} else {
  const recorded = JSON.parse(readFileSync(FINGERPRINTS, 'utf8'));
  for (const name of fixtures) {
    const entry = recorded[name];
    if (!entry) {
      problems.push(`- ${name} has no entry in ${FINGERPRINTS} (a new phase model upstream?)`);
      continue;
    }
    if (sha256(join(FIXTURES, name)) !== entry.sha256) {
      problems.push(
        `- ${join(FIXTURES, name)} does not match the recorded source fingerprint.\n` +
          `    These are COPIES; the source of truth is linked-data-explorer's\n` +
          `    ${entry.source}. If the model changed there, refresh:\n` +
          `      npm run check-swimlane-fixtures -- --sync\n` +
          `    If it changed HERE, move the change upstream instead.`
      );
    }
  }
  for (const name of Object.keys(recorded)) {
    if (!fixtures.includes(name)) {
      problems.push(
        `- ${FINGERPRINTS} lists ${name}, which is missing from ${FIXTURES}.\n` +
          `      npm run check-swimlane-fixtures -- --sync`
      );
    }
  }
}

// ── and, when the source is actually here, against the files themselves ────
let compared = 0;
if (existsSync(LDE)) {
  for (const name of fixtures) {
    const source = upstreamPath(name);
    if (!source || !existsSync(source)) continue;
    compared += 1;
    if (readFileSync(join(FIXTURES, name)).equals(readFileSync(source))) continue;
    problems.push(
      `- ${join(FIXTURES, name)} differs from ${source}\n` +
        `      npm run check-swimlane-fixtures -- --sync`
    );
  }
}

if (problems.length > 0) {
  console.error(
    `\nSwimlane parser fixtures are out of step with their source:\n\n${problems.join('\n\n')}\n`
  );
  process.exit(1);
}

console.log(
  compared > 0
    ? `✓ ${fixtures.length} swimlane fixtures match their fingerprints; ${compared} compared against ${LDE}.`
    : `✓ ${fixtures.length} swimlane fixtures match their fingerprints (no checkout at ${LDE} to compare against).`
);
