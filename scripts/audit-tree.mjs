// Audits the checked-out tree against the npm advisory database and prints a
// summary grouped by ADVISORY, not by package.
//
// Why grouped: `npm audit` reports one entry per affected package, so a single
// advisory on a widely-depended-on package looks like dozens of findings. On
// 2026-09-24 this repository's 28 "moderate" entries were three advisories —
// @tiptap/core, reached through 24 @tiptap/extension-* packages, and qs twice.
// A number that overstates the problem by an order of magnitude gets ignored,
// which is the failure mode a daily audit exists to avoid.
//
// Reads the lockfile only (`--package-lock-only`), so it needs no install, and
// audits production dependencies (`--omit=dev`) for the pass/fail verdict:
// a dev-only advisory is not shipped. Dev findings are still printed.
//
// Usage: node scripts/audit-tree.mjs <label>
// Exit: 0 when no production high/critical advisory, 1 when there is one,
// 2 when the audit itself could not run — which must not read as "clean".
import { execFileSync } from 'node:child_process';

const label = process.argv[2] ?? 'HEAD';

function audit(omitDev) {
  const args = ['audit', '--package-lock-only', '--json'];
  if (omitDev) args.push('--omit=dev');
  let out;
  try {
    // npm exits non-zero when it finds anything, so the output is on stdout
    // either way; a real failure is a parse failure, handled below.
    out = execFileSync('npm', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, shell: process.platform === 'win32' });
  } catch (e) {
    out = e.stdout ?? '';
  }
  try {
    return JSON.parse(out);
  } catch {
    return null;
  }
}

// One row per advisory: its title, severity, and which packages carry it.
function byAdvisory(report) {
  const advisories = new Map();
  for (const entry of Object.values(report.vulnerabilities ?? {})) {
    for (const via of entry.via ?? []) {
      if (typeof via === 'string') continue; // an indirect edge, not an advisory
      const key = via.url ?? via.title;
      const row = advisories.get(key) ?? { title: via.title, severity: via.severity, url: via.url, packages: new Set() };
      row.packages.add(via.name ?? entry.name);
      advisories.set(key, row);
    }
  }
  return [...advisories.values()];
}

const prod = audit(true);
const all = audit(false);
if (!prod || !all) {
  console.error(`::error::${label}: npm audit produced no parsable report`);
  process.exit(2);
}

const prodAdvisories = byAdvisory(prod);
const allAdvisories = byAdvisory(all);
const devOnly = allAdvisories.filter((a) => !prodAdvisories.some((p) => p.title === a.title));
const blocking = prodAdvisories.filter((a) => a.severity === 'high' || a.severity === 'critical');

const order = { critical: 0, high: 1, moderate: 2, low: 3, info: 4 };
const fmt = (rows) =>
  rows
    .sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9))
    .map((a) => `- **${a.severity}** ${a.title}${a.url ? ` (${a.url})` : ''}\n  packages: ${[...a.packages].sort().join(', ')}`)
    .join('\n');

const lines = [];
lines.push(`### ${label}`);
lines.push('');
lines.push(
  `production: ${prodAdvisories.length} advisor${prodAdvisories.length === 1 ? 'y' : 'ies'} ` +
    `across ${Object.keys(prod.vulnerabilities ?? {}).length} package entries; ` +
    `dev-only: ${devOnly.length}`
);
lines.push('');
if (prodAdvisories.length) lines.push(fmt(prodAdvisories));
if (devOnly.length) {
  lines.push('');
  lines.push('<details><summary>dev-only advisories</summary>');
  lines.push('');
  lines.push(fmt(devOnly));
  lines.push('');
  lines.push('</details>');
}
if (!prodAdvisories.length && !devOnly.length) lines.push('No advisories.');

const body = lines.join('\n');
console.log(body);
if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFileSync } = await import('node:fs');
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, body + '\n\n');
}
if (process.env.AUDIT_REPORT_FILE) {
  const { appendFileSync } = await import('node:fs');
  appendFileSync(process.env.AUDIT_REPORT_FILE, body + '\n\n');
}

if (blocking.length) {
  console.error(`::error::${label}: ${blocking.length} high or critical advisory in production dependencies`);
  process.exit(1);
}
process.exit(0);
