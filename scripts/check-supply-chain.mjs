#!/usr/bin/env node
/**
 * check-supply-chain.mjs — the preflight zizmor cannot be.
 *
 * zizmor validates pin FORMAT: it will tell you that `uses:` names a 40-character
 * commit SHA. It cannot tell you that the SHA is the right one. A wrong — or
 * hostile — digest carrying a plausible `# v4.4.0` comment passes zizmor,
 * Prettier and human review alike, because nothing re-resolves the reference.
 *
 * Two gaps are recorded in SECURITY-PIPELINE.md as the motivation for this
 * script, and it closes both:
 *
 *   1. PIN TRUTH  — does each pinned digest actually resolve to the version its
 *                   trailing comment claims? The comment is not decorative:
 *                   Renovate reads and rewrites it, and a human reviewer trusts
 *                   it. If comment and digest disagree, one of them is lying.
 *
 *   2. REGISTER   — does SECURITY-PIPELINE.md still describe the workflows?
 *      AGREEMENT    Renovate updates workflow pins and never touches the
 *                   register, and nothing checked that the two agree. They
 *                   drifted within a week of the register predicting they would:
 *                   the workflows moved to checkout v7.0.1 / setup-node v7.0.0
 *                   while the register still listed v3.7.0 / v4.4.0.
 *
 * Usage:
 *   node scripts/check-supply-chain.mjs            # full check (needs a token)
 *   node scripts/check-supply-chain.mjs --offline  # skip the API, check format
 *                                                  # and register agreement only
 *
 * Transport: GITHUB_TOKEN or GH_TOKEN over plain fetch when present (that is the
 * CI path — the workflow token is enough, this only reads public refs), else
 * `gh api`, which handles its own auth. Shelling out to `gh` rather than
 * scraping a token out of it keeps the credential out of this process
 * entirely, and works on older `gh` builds with no `auth token` subcommand.
 *
 * Exit code 0 when everything agrees, 1 when it does not. Anything the script
 * cannot check is reported explicitly rather than passed over in silence: a
 * preflight that quietly skips things is how the register drifted in the first
 * place.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const WORKFLOW_DIR = '.github/workflows';
const REGISTER = 'SECURITY-PIPELINE.md';

/**
 * References that cannot be resolved as a tag, with the reason recorded inline.
 * This mirrors how renovate.json carries its exceptions: an exception without a
 * reason is indistinguishable from an oversight six months later.
 */
const EXCEPTIONS = {
  'Azure/static-web-apps-deploy': {
    resolveAs: 'branch',
    reason:
      'v1 is published as BOTH a 2021 tag (1a947af…) and a 2024 branch head. ' +
      'The workflows deliberately pin the BRANCH head, resolved from a real ' +
      'Actions run log; the tag would be 3.5-year-old code. See SECURITY-PIPELINE.md.',
  },
};

const findings = [];
const notes = [];
const offline = process.argv.includes('--offline');

function fail(check, detail) {
  findings.push({ check, detail });
}

// ---------------------------------------------------------------- token

/**
 * Pick a transport, or null when neither is available.
 *   'fetch' — an env token is present (the CI path)
 *   'gh'    — the gh CLI is installed and authenticated (the local path)
 */
function transport() {
  if (process.env.GITHUB_TOKEN || process.env.GH_TOKEN) return 'fetch';
  try {
    execFileSync('gh', ['auth', 'status'], { stdio: 'ignore' });
    return 'gh';
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- collect

/**
 * Every `uses:` line across the workflows, with the digest and the version the
 * trailing comment claims.
 */
function collectPins() {
  const pins = [];
  const files = readdirSync(WORKFLOW_DIR).filter((f) => /\.ya?ml$/.test(f));

  for (const file of files) {
    const lines = readFileSync(join(WORKFLOW_DIR, file), 'utf8').split(/\r?\n/);
    lines.forEach((line, i) => {
      const m = line.match(/^\s*(?:-\s*)?uses:\s*([^@\s]+)@(\S+)(?:\s*#\s*(\S+))?/);
      if (!m) return;
      const [, action, ref, comment] = m;
      pins.push({ file, line: i + 1, action, ref, comment: comment ?? null });
    });
  }
  return pins;
}

/**
 * The `Pinned` table in SECURITY-PIPELINE.md.
 *
 * Returns { rows: { action: {digest, version, count} }, totals } where `count`
 * is the "(×N)" multiplicity some registers record beside the dependency name,
 * and `totals` is the "N `uses:` references across M workflows" headline where
 * one is present.
 *
 * Both are checked, because a count is as easy to falsify as a digest and
 * neither the audit nor review catches it: in ronl-business-api, setup-node
 * silently went from ×8 to ×9 when the config-validator step was added, and the
 * register still said ×8 with every gate green.
 */
function readRegister() {
  let text;
  try {
    text = readFileSync(REGISTER, 'utf8');
  } catch {
    fail('register', `${REGISTER} not found — the exceptions register is missing`);
    return null;
  }

  const rows = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim().startsWith('|')) continue;
    const cells = line.split('|').map((c) => c.trim());
    // | dependency | pin | version | maintained by |
    if (cells.length < 5) continue;
    const depCell = cells[1].replace(/`/g, '').trim();
    const pin = cells[2].replace(/`/g, '').trim();
    const version = cells[3].trim();

    // "actions/checkout" or "actions/checkout (×9)" — the multiplicity is
    // optional, and a row that carries one gets it verified.
    const m = depCell.match(/^([\w.-]+\/[\w.-]+)(?:\s*\(\s*[×x]\s*(\d+)\s*\))?$/);
    if (!m) continue; // prose rows: "zizmor itself", "npm dependencies", …

    // An action can legitimately be pinned at MORE THAN ONE digest -- different
    // workflows in the same repo may sit on different majors mid-upgrade, and a
    // good register records every one. linked-data-explorer does exactly this
    // with actions/checkout (v4.4.0 in three workflows, v3.7.0 in four). Keying
    // by action alone silently kept the last row and invented a mismatch
    // against the others, so rows are collected per action.
    (rows[m[1]] ??= []).push({
      digest: pin.replace(/[.…]+$/, ''),
      version,
      count: m[2] ? Number(m[2]) : null,
    });
  }

  // "**30 `uses:` references across 9 workflows**" — optional headline.
  const t = text.match(/(\d+)\s*`?uses:`?\s*references?\s+across\s+(\d+)\s+workflows?/i);
  const totals = t ? { refs: Number(t[1]), workflows: Number(t[2]) } : null;

  return { rows, totals };
}

// ---------------------------------------------------------------- resolve

async function api(path, via) {
  if (via === 'gh') {
    try {
      return JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8' }));
    } catch (err) {
      // gh exits non-zero on 404; treat "not found" as an absent ref rather
      // than as a transport failure, so a missing tag is reported as such.
      if (/HTTP 404|Not Found/i.test(String(err.stderr ?? err.message))) return null;
      throw new Error(
        String(err.stderr ?? err.message)
          .trim()
          .split('\n')[0]
      );
    }
  }

  const tok = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      accept: 'application/vnd.github+json',
      'user-agent': 'check-supply-chain',
      ...(tok ? { authorization: `Bearer ${tok}` } : {}),
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${path}`);
  return res.json();
}

/** Resolve a tag (dereferencing annotated tags) or a branch head to a commit SHA. */
async function resolveRef(action, version, via) {
  const mode = EXCEPTIONS[action]?.resolveAs ?? 'tag';
  const path =
    mode === 'branch'
      ? `/repos/${action}/git/ref/heads/${encodeURIComponent(version)}`
      : `/repos/${action}/git/ref/tags/${encodeURIComponent(version)}`;

  const ref = await api(path, via);
  if (!ref) return null;

  // An annotated tag points at a tag object; dereference it to the commit.
  if (ref.object?.type === 'tag') {
    const tag = await api(`/repos/${action}/git/tags/${ref.object.sha}`, via);
    return tag?.object?.sha ?? null;
  }
  return ref.object?.sha ?? null;
}

// ---------------------------------------------------------------- checks

function checkFormat(pins) {
  for (const p of pins) {
    if (!/^[0-9a-f]{40}$/.test(p.ref)) {
      fail('format', `${p.file}:${p.line} — ${p.action}@${p.ref} is not a 40-character commit SHA`);
      continue;
    }
    if (!p.comment) {
      fail(
        'format',
        `${p.file}:${p.line} — ${p.action}@${p.ref.slice(0, 12)}… has no ` +
          `trailing "# version" comment. Renovate parses that comment to know ` +
          `which version the digest represents, and rewrites it on update.`
      );
    }
  }
}

/**
 * A register's version cell may carry an annotation the workflow comment does
 * not -- "v1 (branch head)" against a bare "v1". Compare the leading token, so
 * the register can explain itself without tripping the check.
 */
function versionToken(v) {
  return String(v ?? '')
    .trim()
    .split(/[\s(]/)[0];
}

function checkRegister(pins, register, workflowCount) {
  if (!register) return;
  const { rows, totals } = register;
  const rowsFor = (action) => rows[action] ?? [];

  // Group workflow pins by action AND digest: the same action at two digests is
  // two distinct things to verify, not one.
  const byActionDigest = new Map(); // "action@digest" -> {action, digest, comment, count}
  const uses = new Map(); // action -> total references, across all its digests
  for (const p of pins) {
    if (!/^[0-9a-f]{40}$/.test(p.ref)) continue;
    const k = `${p.action}@${p.ref}`;
    const seen = byActionDigest.get(k);
    if (seen) seen.count += 1;
    else
      byActionDigest.set(k, {
        action: p.action,
        digest: p.ref,
        comment: p.comment,
        count: 1,
        file: p.file,
      });
    uses.set(p.action, (uses.get(p.action) ?? 0) + 1);
  }
  const inWorkflows = byActionDigest;

  if (totals) {
    if (totals.refs !== pins.length) {
      fail(
        'register',
        `${REGISTER} says ${totals.refs} "uses:" references; the workflows have ` + `${pins.length}`
      );
    }
    if (totals.workflows !== workflowCount) {
      fail(
        'register',
        `${REGISTER} says ${totals.workflows} workflows; ${WORKFLOW_DIR}/ has ` + `${workflowCount}`
      );
    }
  }

  const claimed = new Set(); // register rows a workflow pin accounted for

  for (const wf of inWorkflows.values()) {
    const candidates = rowsFor(wf.action);
    if (candidates.length === 0) {
      fail(
        'register',
        `${wf.action} is pinned in ${wf.file} but absent from ${REGISTER}'s Pinned table`
      );
      continue;
    }

    // Rows are matched by digest, not by action: an action pinned at two
    // digests has two rows, and each workflow pin must find its own.
    const row = candidates.find((r) => wf.digest.startsWith(r.digest));
    if (!row) {
      const listed = candidates.map((r) => `${r.digest.slice(0, 12)}… (${r.version})`).join(', ');
      fail(
        'register',
        `${wf.action}: workflow pins ${wf.digest.slice(0, 12)}… (${wf.comment}) but ` +
          `${REGISTER} records only ${listed}`
      );
      continue;
    }
    claimed.add(row);

    if (wf.comment && row.version && versionToken(wf.comment) !== versionToken(row.version)) {
      fail(
        'register',
        `${wf.action}: digests agree but versions do not — workflow says ` +
          `${wf.comment}, ${REGISTER} says ${row.version}`
      );
    }

    // A ×N on a row counts THAT digest's references, not the action's total --
    // an action at two digests has its uses split across two rows.
    if (row.count !== null && row.count !== wf.count) {
      fail(
        'register',
        `${wf.action} at ${wf.digest.slice(0, 12)}…: ${REGISTER} records ` +
          `×${row.count} but the workflows reference it ${wf.count} time(s)`
      );
    }
  }

  for (const [action, candidates] of Object.entries(rows)) {
    for (const row of candidates) {
      if (!claimed.has(row)) {
        notes.push(
          `${REGISTER} lists ${action} at ${row.digest.slice(0, 12)}… (${row.version}), ` +
            `which no workflow currently uses`
        );
      }
    }
  }
}

async function checkPinTruth(pins, via) {
  const seen = new Set();
  for (const p of pins) {
    if (!/^[0-9a-f]{40}$/.test(p.ref) || !p.comment) continue;
    const key = `${p.action}@${p.ref}#${p.comment}`;
    if (seen.has(key)) continue;
    seen.add(key);

    let actual;
    try {
      actual = await resolveRef(p.action, p.comment, via);
    } catch (err) {
      fail('pin-truth', `${p.action}@${p.comment}: API error — ${err.message}`);
      continue;
    }

    const exc = EXCEPTIONS[p.action];
    if (actual === null) {
      fail(
        'pin-truth',
        `${p.action}: ${exc?.resolveAs === 'branch' ? 'branch' : 'tag'} ` +
          `"${p.comment}" does not exist on GitHub`
      );
      continue;
    }
    if (actual !== p.ref) {
      fail(
        'pin-truth',
        `${p.action}: comment claims ${p.comment}, which resolves to ` +
          `${actual.slice(0, 12)}… — but the workflow pins ${p.ref.slice(0, 12)}…` +
          (exc ? `\n      (exception in force: ${exc.reason})` : '')
      );
    } else if (exc) {
      notes.push(
        `${p.action}@${p.comment} verified against the ${exc.resolveAs}, per its ` +
          `recorded exception`
      );
    }
  }
}

// ---------------------------------------------------------------- main

const pins = collectPins();
if (pins.length === 0) {
  console.error(`No "uses:" references found under ${WORKFLOW_DIR}/ — is the path right?`);
  process.exit(1);
}

const workflowCount = readdirSync(WORKFLOW_DIR).filter((f) => /\.ya?ml$/.test(f)).length;

checkFormat(pins);
checkRegister(pins, readRegister(), workflowCount);

if (offline) {
  notes.push('--offline: pin truth was NOT verified against GitHub');
} else {
  const via = transport();
  if (!via) {
    fail(
      'pin-truth',
      'No GitHub transport available: set GITHUB_TOKEN or GH_TOKEN, or ' +
        'authenticate the gh CLI. Pin truth was NOT verified. Pass --offline ' +
        'to acknowledge that gap deliberately rather than failing on it.'
    );
  } else {
    await checkPinTruth(pins, via);
  }
}

// ---------------------------------------------------------------- report

const actions = new Set(pins.map((p) => p.action));
console.log(
  `check-supply-chain: ${pins.length} pinned reference(s) across ` +
    `${actions.size} action(s) in ${WORKFLOW_DIR}/`
);

for (const n of notes) console.log(`  note: ${n}`);

if (findings.length === 0) {
  console.log('\nOK — digests, version comments and the register all agree.');
  process.exit(0);
}

console.error(`\n${findings.length} finding(s):\n`);
for (const f of findings) console.error(`  [${f.check}] ${f.detail}`);
console.error(
  '\nA digest that does not resolve to the version its comment claims is the ' +
    'failure this script exists to catch. Fix the pin or the comment — do not ' +
    'silence the check.'
);
process.exit(1);
