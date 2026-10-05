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
 * DRIFT HAS TWO DIRECTIONS, AND ONLY ONE OF THEM IS FIXED BY `--sync`.
 *
 * `--sync` copies linked-data-explorer -> here. That is right when a phase
 * model changed upstream and these copies are stale. It is WRONG, and
 * destructive, when the checkout at LDE_PATH is the stale one: behind its own
 * origin, on another branch, or dirty. Then syncing overwrites correct
 * fixtures with older content and takes the parser tests down with them.
 *
 * Until #268 this script suggested `--sync` for any difference at all, so the
 * second case was advice to break the build. It happened: a checkout five
 * commits behind LDE's acc still had R2.2's "Opstellen concept VO" carrying
 * one document, while the fixture here already carried the two that
 * bpmn-swimlane.test.ts asserts.
 *
 * The fingerprint file tells the two apart with no git and no network, which
 * is the point of committing it identically in both repositories:
 *
 *   - fixture DISAGREES with the fingerprint -> the fixture is stale. `--sync`.
 *   - fixture AGREES with the fingerprint but differs from the file at
 *     LDE_PATH -> that checkout is out of step. Update it; do NOT sync.
 *
 * When LDE_PATH carries its own copy of the fingerprint file, the second case
 * is not an inference but a demonstration: its file disagrees with the hash it
 * committed itself.
 *
 * `--sync` enforces the same thing rather than trusting the caller to have
 * read this, and `--force` overrides it for someone mid-edit upstream who
 * knows why. `LDE_PATH` overrides where linked-data-explorer is; it defaults
 * to a sibling checkout. Exit 0 when the fixtures match their source, 1
 * otherwise; a failure names the file and the command that actually fixes it.
 */

import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const FIXTURES = 'packages/backend/src/rip-swimlane/__fixtures__';
const FINGERPRINTS = 'rip-bpmn-fingerprints.json';
const LDE = process.env.LDE_PATH ?? join('..', 'linked-data-explorer');

const sync = process.argv.includes('--sync');
const force = process.argv.includes('--force');

const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

/** Upstream's own copy of the fingerprint file, or null when it has none. */
function readUpstreamFingerprints() {
  const path = join(LDE, FINGERPRINTS);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * The fixtures whose file at LDE_PATH disagrees with the hash UPSTREAM ITSELF
 * recorded for it. Upstream is the source of truth for the content AND for the
 * fingerprint, so when the two disagree the checkout is stale, on another
 * branch, or has uncommitted edits -- it is not evidence about this repository
 * at all, and copying from it would be copying from a tree upstream does not
 * consider current.
 *
 * Returns [] when nothing disagrees, and null when upstream has no fingerprint
 * file to ask (an older checkout, from before it carried one).
 */
function upstreamOutOfStep(names, upstream) {
  if (!upstream) return null;
  const stale = [];
  for (const name of names) {
    const source = upstreamPath(name);
    if (!source || !existsSync(source)) continue;
    const entry = upstream[name];
    if (!entry) continue;
    if (sha256(source) !== entry.sha256) stale.push(name);
  }
  return stale;
}

/** This repository's own copy of the fingerprint file, or null. */
function readLocalFingerprints() {
  if (!existsSync(FINGERPRINTS)) return null;
  try {
    return JSON.parse(readFileSync(FINGERPRINTS, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Where a model lives upstream. The fingerprint entry's `source` says so,
 * which is what lets the declared-phase models live anywhere upstream (#312
 * item 3); a RIP model without an entry falls back to its rip-phase-NN folder.
 */
function upstreamPath(name) {
  const entry = readLocalFingerprints()?.[name] ?? readUpstreamFingerprints()?.[name];
  if (entry?.source) return join(LDE, entry.source);
  const phase = name.match(/^RipR(\d\d)Process\.bpmn$/)?.[1];
  if (!phase) return null;
  return join(LDE, 'examples', 'organizations', 'flevoland', `rip-phase-${phase}`, name);
}

/**
 * Every fixture under contract, by file name -> its path here: the twelve RIP
 * phases at the root, and the processes that declare their own phases under
 * declared/. The declared ones were copied from upstream and then checked by
 * nothing until #312 item 3. awb/ is not covered; that issue asked about
 * declared/ only.
 */
const DECLARED = join(FIXTURES, 'declared');
const fixturePaths = new Map([
  ...(existsSync(FIXTURES) ? readdirSync(FIXTURES) : [])
    .filter((f) => /^RipR\d\dProcess\.bpmn$/.test(f))
    .map((f) => [f, join(FIXTURES, f)]),
  ...(existsSync(DECLARED) ? readdirSync(DECLARED) : [])
    .filter((f) => f.endsWith('.bpmn'))
    .map((f) => [f, join(DECLARED, f)]),
]);
const fixtures = [...fixturePaths.keys()].sort();
const fixturePath = (name) => fixturePaths.get(name);

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
  // Everything is checked BEFORE anything is copied. The old order copied the
  // twelve models first and only then looked for the fingerprint file, so a
  // checkout without one -- which is every checkout from before upstream
  // started committing it -- left the tree half synced and exited 1.
  const upstreamFingerprintsPath = join(LDE, FINGERPRINTS);
  if (!existsSync(upstreamFingerprintsPath)) {
    console.error(
      `\nNothing copied: ${upstreamFingerprintsPath} does not exist.\n\n` +
        `The fingerprint file is committed in both repositories and a sync has to\n` +
        `bring it along, or the two sides stop agreeing about what the source is.\n` +
        `A checkout without one is usually simply old.\n\n` +
        `  in ${LDE}:  git pull --ff-only\n` +
        `  or, if the models really did change there:\n` +
        `                node scripts/check-rip-bpmn-copies.mjs --write\n`
    );
    process.exit(1);
  }

  const upstream = readUpstreamFingerprints();
  const stale = upstreamOutOfStep(fixtures, upstream);

  if (stale && stale.length > 0 && !force) {
    console.error(
      `\nRefusing to sync: the checkout at ${LDE} disagrees with its OWN\n` +
        `fingerprints for ${stale.length} model(s):\n\n` +
        stale.map((n) => `  - ${n}`).join('\n') +
        `\n\nThat makes it the stale side, not this repository, so copying from it\n` +
        `would overwrite correct fixtures with older content. It usually means the\n` +
        `checkout is behind, on another branch, or has uncommitted edits.\n\n` +
        `  in ${LDE}:  git status && git pull --ff-only\n\n` +
        `If those edits are deliberate and not committed yet, --force says so.\n`
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
    copyFileSync(source, fixturePath(name));
    copied += 1;
  }
  copyFileSync(upstreamFingerprintsPath, FINGERPRINTS);
  console.log(
    `Copied ${copied} fixture(s) and ${FINGERPRINTS} from ${LDE}.` +
      (stale && stale.length > 0
        ? `  (--force: ${stale.length} disagreed with upstream's own hashes)`
        : '')
  );
  process.exit(0);
}

const problems = [];

// This repository's own recorded hashes, read below and read again by the file
// comparison, which needs to know whether upstream's differ from them.
let recorded = null;

// Fixtures the fingerprint file says are stale HERE. The file comparison below
// reads this to tell the two directions of drift apart.
const staleHere = new Set();

// ── against the fingerprints, which work with nothing else checked out ─────
if (!existsSync(FINGERPRINTS)) {
  problems.push(
    `- ${FINGERPRINTS} is missing. It is committed identically in both repositories; copy it with:\n` +
      `      npm run check-swimlane-fixtures -- --sync`
  );
} else {
  recorded = JSON.parse(readFileSync(FINGERPRINTS, 'utf8'));
  for (const name of fixtures) {
    const entry = recorded[name];
    if (!entry) {
      problems.push(`- ${name} has no entry in ${FINGERPRINTS} (a new phase model upstream?)`);
      continue;
    }
    if (sha256(fixturePath(name)) !== entry.sha256) {
      staleHere.add(name);
      problems.push(
        `- ${fixturePath(name)} does not match the recorded source fingerprint.\n` +
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
  const upstream = readUpstreamFingerprints();
  const stale = upstreamOutOfStep(fixtures, upstream) ?? [];

  for (const name of fixtures) {
    const source = upstreamPath(name);
    if (!source || !existsSync(source)) continue;
    compared += 1;
    if (readFileSync(fixturePath(name)).equals(readFileSync(source))) continue;

    // The fingerprint block already reported this one and already named
    // `--sync`, which is the right remedy: the fixture here is the stale side.
    if (staleHere.has(name)) continue;

    // It is NOT stale here -- it matches the hash both repositories committed.
    // So the difference is upstream's, and `--sync` would overwrite a correct
    // fixture with older content. Say what to do instead of what not to do.
    // Upstream self-consistent AND recording a different hash from ours is the
    // ORDINARY case: the model changed there, upstream regenerated, and these
    // copies have not caught up. That is what --sync is for.
    const upstreamHash = upstream?.[name]?.sha256;
    const ourHash = recorded?.[name]?.sha256;
    if (upstream && !stale.includes(name) && upstreamHash && ourHash && upstreamHash !== ourHash) {
      problems.push(
        `- ${fixturePath(name)} differs from ${source}.\n` +
          `    Upstream agrees with the hash it recorded for itself and that hash is\n` +
          `    not ours, so the model moved there and these copies are behind:\n` +
          `      npm run check-swimlane-fixtures -- --sync`
      );
      continue;
    }

    // Otherwise the fixture matches the hash BOTH repositories committed, so it
    // is not the stale side, and --sync would overwrite it with older content.
    // Say what to do instead of only what not to do.
    problems.push(
      `- ${fixturePath(name)} differs from ${source},\n` +
        `    but MATCHES the fingerprint both repositories committed. The checkout\n` +
        `    at ${LDE} is the one out of step` +
        (stale.includes(name)
          ? `: its copy disagrees with the\n    hash it recorded for itself.`
          : upstream
            ? `.`
            : ` (it carries no ${FINGERPRINTS}, which\n    upstream has committed since -- so it is an older checkout).`) +
        `\n\n    Update it, do NOT sync -- syncing would copy the older file over this\n` +
        `    one and break the parser tests that pin against it:\n` +
        `      git -C ${LDE} status && git -C ${LDE} pull --ff-only\n` +
        `\n    If the model really did change upstream, commit it and regenerate the\n` +
        `    fingerprints there first:\n` +
        `      node scripts/check-rip-bpmn-copies.mjs --write`
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
