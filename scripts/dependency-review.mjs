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
 * Copied from linked-data-explorer 67bd0ae.
 *
 * Usage:
 *   node scripts/dependency-review.mjs [--out review.md] [--quarter 2026-Q4]
 *     [--lockfile package-lock.json] [--config lockfile-review.json]
 *     [--register dependency-register.json]
 * GITHUB_TOKEN, when set, is used for the GitHub API (60 calls an hour
 * without it, fewer than the direct dependencies of two of the three).
 *
 * Exit: 0 the review was written (whatever it found: a finding is for a
 * person, not a red run), 2 the lockfile, the config or the register could
 * not be used.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { parseRegister } from "./dependency-gate.mjs";
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

export function monthsBetween(from, to) {
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

function flagged(row, reasons) {
  return [
    `- ${code(row.name)} ${code(row.version ?? "?")} — ` +
      `${row.production ? "production" : "dev"} — ${reasons.map(text).join("; ")}`,
    "  - [ ] **keep**: the criteria still hold well enough; say why below",
    "  - [ ] **replace**: open an issue for it and link it here",
    "  - [ ] **accept**: keep it despite the finding; say why below",
  ];
}

/**
 * What the dependency register still holds open: overrides, replacements with
 * a follow-up issue, and cooldown overrides (spec §4.5).
 */
function registerSection(register) {
  const deps = register?.dependencies ?? [];
  const overrides = deps.filter((e) => e.status === "override");
  const replaces = deps.filter((e) => e.outcome === "replace");
  const cooldown = register?.cooldownOverrides ?? [];
  const lines = ["### Register: still open", ""];
  if (!overrides.length && !replaces.length && !cooldown.length) {
    return [...lines, "No register entries open.", ""];
  }
  const where = (e) => `${code(e.name)} in ${code(e.manifest)}`;
  const issue = (n) => (n ? ` (#${n})` : "");
  for (const e of overrides) {
    lines.push(
      `- override: ${where(e)} — ${text(e.override?.reason ?? "")}${issue(e.override?.issue)}`,
    );
  }
  for (const e of replaces) {
    lines.push(`- replace: ${where(e)}${issue(e.followUp)}`);
  }
  for (const o of cooldown) {
    lines.push(
      `- cooldown override: ${code(o.package)} ${code(o.version)} — ${text(o.reason)}${issue(o.issue)}`,
    );
  }
  return [...lines, ""];
}

function securitySection(quarter, exceptions, error) {
  const lines = [
    `### Renovate security exceptions, ${quarter ?? "previous quarter"}`,
    "",
  ];
  if (error) lines.push(`could not list security exceptions: ${text(error)}`);
  else if (!exceptions?.length) lines.push("None.");
  else {
    for (const x of exceptions) {
      lines.push(`- #${x.number} ${text(x.title)} — merged ${day(x.mergedAt)}`);
    }
  }
  return [...lines, ""];
}

/** The issue body: what fails, what needs a judgement, then everything. */
export function renderReview({
  repository,
  quarter,
  rows,
  date,
  register,
  securityQuarter,
  securityExceptions,
  securityExceptionsError,
}) {
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
    ...registerSection(register),
    ...securitySection(
      securityQuarter,
      securityExceptions,
      securityExceptionsError,
    ),
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

const sleepFor = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** The pause a Retry-After header asks for, in ms (capped), or null. */
export function retryAfterMs(value, now = Date.now()) {
  if (value === null || value === undefined || value === "") return null;
  const seconds = Number(value);
  const ms = Number.isFinite(seconds)
    ? seconds * 1000
    : new Date(String(value)).getTime() - now;
  if (!Number.isFinite(ms)) return null;
  return Math.min(Math.max(ms, 0), 60000);
}

/**
 * GET and parse JSON. A 429 or 5xx (or a dropped or timed-out connection) is
 * retried after 2 s and then 5 s, or after the server's Retry-After when it
 * gives one; `retries` attempts in all, each with its own 30 s timeout. The
 * error then carries the last HTTP `status` (when there was one) so a caller
 * can tell a 404 apart.
 */
export async function fetchJson(
  url,
  headers = {},
  {
    fetchImpl = fetch,
    retries = 3,
    sleep = sleepFor,
    timeoutMs = 30000,
    backoff = [2000, 5000],
  } = {},
) {
  let last;
  let wait = null;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    if (attempt > 1) {
      await sleep(wait ?? backoff[Math.min(attempt - 2, backoff.length - 1)]);
    }
    wait = null;
    try {
      const res = await fetchImpl(url, {
        headers: { accept: "application/json", ...headers },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) return await res.json();
      last = new Error(`${new URL(url).host} answered ${res.status}`);
      last.status = res.status;
      if (res.status !== 429 && res.status < 500) throw last;
      wait = retryAfterMs(res.headers?.get?.("retry-after"));
    } catch (err) {
      if (err === last && last.status !== 429 && last.status < 500) throw err;
      last = err;
    }
  }
  throw last;
}

export async function gather(row, token, opts = {}) {
  let evidence;
  try {
    const packument = await fetchJson(
      `https://registry.npmjs.org/${row.name.replace("/", "%2f")}`,
      {},
      opts,
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
        opts,
      );
      evidence.archived = Boolean(repo.archived);
      evidence.orgOwned = repo.owner?.type === "Organization";
    } catch {
      // Left null: the report says "not checked" rather than guessing.
    }
  }
  return { ...row, evidence };
}

export async function mapLimited(items, limit, fn) {
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

/** First day of the calendar quarter of `date`, as YYYY-MM-DD. */
export function quarterStart(date) {
  const month = Math.floor(date.getUTCMonth() / 3) * 3 + 1;
  return `${date.getUTCFullYear()}-${String(month).padStart(2, "0")}-01`;
}

/**
 * The calendar quarter before the one `date` is in: its name and its first
 * and last day. The review runs on the second day of a quarter, so the
 * quarter that has just ended is the one with something to list.
 */
export function previousQuarter(date) {
  const start = new Date(`${quarterStart(date)}T00:00:00Z`);
  const end = new Date(start.getTime() - 86400000);
  return {
    quarter: quarterOf(end),
    since: quarterStart(end),
    until: end.toISOString().slice(0, 10),
  };
}

/**
 * Merged Renovate pull requests labelled security between two days
 * (inclusive): the cooldown exceptions of a quarter (spec §4.5). Only with a
 * token; a failed search is said in the report, never a crash — the review is
 * a report, not a gate.
 */
export async function securityExceptionsOf(
  repository,
  since,
  until,
  token,
  opts = {},
) {
  if (!token) return { items: [], error: null };
  const q = `repo:${repository} is:pr is:merged label:security author:app/renovate merged:${since}..${until}`;
  try {
    const found = await fetchJson(
      `https://api.github.com/search/issues?q=${encodeURIComponent(q)}&per_page=100`,
      {
        authorization: `Bearer ${token}`,
        "x-github-api-version": "2022-11-28",
      },
      opts,
    );
    return {
      items: (found.items ?? []).map((i) => ({
        number: i.number,
        title: i.title,
        mergedAt: i.pull_request?.merged_at ?? i.closed_at,
      })),
      error: null,
    };
  } catch (err) {
    return { items: [], error: err.message };
  }
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
  const registerPath =
    optionOf(args, "--register") ?? "dependency-register.json";
  const register = existsSync(registerPath)
    ? parseRegister(read(registerPath, "register"), registerPath)
    : { dependencies: [], cooldownOverrides: [] };
  const previous = previousQuarter(now);
  const security = await securityExceptionsOf(
    repository,
    previous.since,
    previous.until,
    process.env.GITHUB_TOKEN,
  );
  const report = renderReview({
    repository,
    quarter,
    rows,
    date: now,
    register,
    securityQuarter: previous.quarter,
    securityExceptions: security.items,
    securityExceptionsError: security.error,
  });
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
