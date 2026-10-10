#!/usr/bin/env node
/**
 * dependency-review.mjs — the evidence for the quarterly dependency review.
 *
 * ICTU recommendation 11 asks, once a quarter, whether each dependency is
 * still maintained, by the same points recommendation 1 asks before one is
 * added (docs/dependency-criteria.md in linked-data-explorer; #250). Nothing
 * else here notices an abandoned package: it raises no advisory and opens no
 * Renovate pull request. This gathers what can be measured for every DIRECT
 * dependency and flags what fails or needs a judgement; a person decides,
 * and records keep, replace or accept in the issue the workflow opens.
 *
 * Reads package-lock.json, which carries its own copy of every manifest, and
 * asks the npm registry and the GitHub API. Installs nothing.
 *
 * The same file in linked-data-explorer, ttl-editor and ronl-business-api.
 *
 * Usage:
 *   node scripts/dependency-review.mjs [--out review.md] [--quarter 2026-Q4]
 *     [--lockfile package-lock.json] [--config lockfile-review.json]
 * GITHUB_TOKEN, when set, is used for the GitHub API (60 calls an hour
 * without it, fewer than the direct dependencies of two of the three).
 *
 * Exit: 0 the review was written (whatever it found: a finding is for a
 * person, not a red run), 2 the lockfile or config could not be used.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import {
  CRITERIA_URL,
  directDependencies,
  InputError,
  licenceAllowed,
  parseConfig,
  parseLockfile,
} from "./lockfile-diff.mjs";

export function quarterOf(date) {
  return `${date.getUTCFullYear()}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
}

/** Every direct dependency once: installed version, and production when any manifest needs it at runtime. */
export function packagesFromLockfile(doc) {
  const rows = [];
  for (const [name, places] of directDependencies(doc)) {
    const manifests = [...new Set(places.map((p) => p.manifest))].sort();
    const installed =
      doc.packages[`node_modules/${name}`] ??
      places
        .map((p) => doc.packages[`${p.manifest}/node_modules/${name}`])
        .find(Boolean) ??
      {};
    rows.push({
      name,
      version: installed.version ?? null,
      production: places.some((p) => p.field !== "devDependencies"),
      installScript: Boolean(installed.hasInstallScript),
      manifests,
    });
  }
  return rows.sort((x, y) => x.name.localeCompare(y.name));
}

/** "owner/repo" for a repository on GitHub, else null. */
export function githubRepo(url) {
  if (!url) return null;
  const s = String(url).trim();
  const m =
    s.match(/github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:[#/].*)?$/) ??
    s.match(/^github:([\w.-]+)\/([\w.-]+?)(?:\.git)?$/) ??
    s.match(/^([\w.-]+)\/([\w.-]+)$/);
  return m ? `${m[1]}/${m[2]}` : null;
}

/** What the registry says about a package, for the version installed. */
export function evidenceFrom(packument, installedVersion) {
  const releases = Object.entries(packument.time ?? {})
    .filter(([key]) => key !== "created" && key !== "modified")
    .map(([, when]) => when)
    .sort();
  const latest = packument["dist-tags"]?.latest;
  const versions = packument.versions ?? {};
  const deprecated =
    versions[installedVersion]?.deprecated ??
    versions[latest]?.deprecated ??
    null;
  const repository = packument.repository ?? versions[latest]?.repository;
  return {
    lastRelease: releases.at(-1) ?? null,
    maintainers: (packument.maintainers ?? []).length,
    licence: packument.license ?? versions[latest]?.license ?? null,
    deprecated,
    repo: githubRepo(
      typeof repository === "string" ? repository : repository?.url,
    ),
  };
}

function monthsBetween(from, to) {
  const a = new Date(from);
  return (
    (to.getUTCFullYear() - a.getUTCFullYear()) * 12 +
    (to.getUTCMonth() - a.getUTCMonth()) -
    (to.getUTCDate() < a.getUTCDate() ? 1 : 0)
  );
}

/**
 * The criteria applied to the evidence. `fail`: deprecated, archived, or no
 * evidence at all. `check`: a judgement for a person. Missing evidence is
 * said, never read as fine.
 */
export function assess(e, now, allow) {
  if (e.error) return { fail: [e.error], check: [] };
  const fail = [];
  const check = [];
  if (e.deprecated) fail.push(`deprecated: ${e.deprecated}`);
  if (e.archived === true) fail.push("repository archived");
  if (!e.lastRelease) check.push("no release date recorded");
  else {
    const months = monthsBetween(e.lastRelease, now);
    if (months >= 12) check.push(`no release in ${months} months`);
  }
  if (e.archived === null || e.archived === undefined) {
    check.push("repository not checked");
  }
  if (e.maintainers <= 1) {
    if (e.orgOwned === false) check.push("one maintainer, no organisation");
    else if (e.orgOwned !== true) {
      check.push("one maintainer, organisation not checked");
    }
  }
  if (!e.licence) check.push("no licence recorded");
  else if (!licenceAllowed(e.licence, allow)) {
    check.push(`licence ${e.licence} not on the allow-list`);
  }
  return { fail, check };
}

// Names come from the registry and the lockfile: a backtick or line break
// would close the code span and let a package write its own lines into the
// issue, a ticked outcome included (as in lockfile-diff.mjs).
const code = (s) =>
  `\`${String(s)
    .replace(/[\r\n]+/g, " ")
    .replace(/`/g, "'")}\``;
const text = (s) => String(s).replace(/[\r\n]+/g, " ");
const day = (iso) => (iso ? String(iso).slice(0, 10) : "—");
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

function flagged(row, reasons) {
  return [
    `- ${code(row.name)} ${code(row.version ?? "?")} — ` +
      `${row.production ? "production" : "dev"} — ${reasons.map(text).join("; ")}`,
    "  - [ ] **keep**: the criteria still hold well enough; say why below",
    "  - [ ] **replace**: open an issue for it and link it here",
    "  - [ ] **accept**: keep it despite the finding; say why below",
  ];
}

/** The issue body: what fails, what needs a judgement, then everything. */
export function renderReview({ repository, quarter, rows, date }) {
  const order = (x, y) =>
    Number(y.production) - Number(x.production) || x.name.localeCompare(y.name);
  const failing = rows.filter((r) => r.verdict.fail.length).sort(order);
  const judge = rows
    .filter((r) => !r.verdict.fail.length && r.verdict.check.length)
    .sort(order);
  const production = rows.filter((r) => r.production).length;
  const table = [...rows].sort(order).map((r) => {
    const e = r.evidence ?? {};
    const flags = [...r.verdict.fail, ...r.verdict.check].map(text).join("; ");
    return (
      `| ${code(r.name)} | ${code(r.version ?? "?")} | ` +
      `${r.production ? "production" : "dev"} | ${day(e.lastRelease)} | ` +
      `${e.maintainers ?? "—"} | ${e.licence ? code(e.licence) : "—"} | ` +
      `${r.installScript ? "yes" : ""} | ${flags || "✓"} |`
    );
  });
  return [
    `## Quarterly dependency review — ${quarter}`,
    "",
    `${code(repository)}, generated ${day(date.toISOString())} from \`package-lock.json\` on the default branch.`,
    "",
    `${rows.length} direct ${rows.length === 1 ? "dependency" : "dependencies"} (${production} production) · ` +
      `${failing.length} failing · ${judge.length} to judge.`,
    "",
    `Apply the [dependency criteria](${CRITERIA_URL}) (ICTU recommendations 1 and 11). ` +
      "For every package below, tick one outcome and add the reason. Close the issue " +
      "when each has one; a replacement gets its own issue.",
    "",
    ...(failing.length
      ? [
          "### Failing",
          "",
          ...failing.flatMap((r) => flagged(r, r.verdict.fail)),
          "",
        ]
      : []),
    ...(judge.length
      ? [
          "### To judge",
          "",
          ...judge.flatMap((r) => flagged(r, r.verdict.check)),
          "",
        ]
      : []),
    "<details>",
    `<summary>All direct dependencies (${rows.length})</summary>`,
    "",
    "| package | installed | kind | last release | maintainers | licence | install script | findings |",
    "| --- | --- | --- | --- | --: | --- | :-: | --- |",
    ...table,
    "",
    "</details>",
  ].join("\n");
}

async function fetchJson(url, headers = {}) {
  const res = await fetch(url, {
    headers: { accept: "application/json", ...headers },
  });
  if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`);
  return res.json();
}

async function gather(row, token) {
  let evidence;
  try {
    const packument = await fetchJson(
      `https://registry.npmjs.org/${row.name.replace("/", "%2f")}`,
    );
    evidence = evidenceFrom(packument, row.version);
  } catch (err) {
    return { ...row, evidence: null, error: `registry: ${err.message}` };
  }
  evidence.archived = null;
  evidence.orgOwned = null;
  if (evidence.repo) {
    try {
      const repo = await fetchJson(
        `https://api.github.com/repos/${evidence.repo}`,
        {
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          "x-github-api-version": "2022-11-28",
        },
      );
      evidence.archived = Boolean(repo.archived);
      evidence.orgOwned = repo.owner?.type === "Organization";
    } catch {
      // Left null: the report says "not checked" rather than guessing.
    }
  }
  return { ...row, evidence };
}

async function mapLimited(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return out;
}

function optionOf(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main(argv) {
  const args = argv.slice(2);
  const read = (path, label) => {
    try {
      return readFileSync(path, "utf8");
    } catch (err) {
      throw new InputError(`cannot read ${label} ${path}: ${err.code}`);
    }
  };
  const lockPath = optionOf(args, "--lockfile") ?? "package-lock.json";
  const configPath = optionOf(args, "--config") ?? "lockfile-review.json";
  const { allow } = parseConfig(read(configPath, "config"), configPath);
  const doc = parseLockfile(read(lockPath, "lockfile"), lockPath);
  const now = new Date();
  const quarter = optionOf(args, "--quarter") ?? quarterOf(now);
  const repository =
    process.env.GITHUB_REPOSITORY ??
    JSON.parse(read("package.json", "manifest")).name;
  const gathered = await mapLimited(packagesFromLockfile(doc), 8, (row) =>
    gather(row, process.env.GITHUB_TOKEN),
  );
  const rows = gathered.map((r) => ({
    ...r,
    verdict: r.error
      ? { fail: [r.error], check: [] }
      : assess(r.evidence, now, allow),
  }));
  const report = renderReview({ repository, quarter, rows, date: now });
  const out = optionOf(args, "--out");
  if (out) writeFileSync(out, `${report}\n`);
  else process.stdout.write(`${report}\n`);
  return 0;
}

const invoked =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invoked) {
  main(process.argv).then(
    (code) => (process.exitCode = code),
    (err) => {
      console.error(
        `dependency-review: ${err instanceof InputError ? err.message : err.stack}`,
      );
      process.exitCode = 2;
    },
  );
}
