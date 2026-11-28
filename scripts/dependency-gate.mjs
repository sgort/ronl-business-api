#!/usr/bin/env node
/**
 * dependency-gate.mjs — a new direct dependency cannot merge without its
 * assessment, and a package version cannot merge before its cooldown.
 *
 * ICTU recommendation 1 asks that a dependency is vetted before it is added
 * (docs/dependency-criteria.md in linked-data-explorer; #250). For every
 * direct dependency new to a manifest, this requires an entry in
 * dependency-register.json and checks it against evidence it gathers itself
 * (the npm registry, the GitHub API and the lockfile): an entry may not claim
 * a criterion holds that the evidence says does not, judgements need a
 * sentence, the assessed major must be the locked one, and a cited issue must
 * be open. Every package version the lockfile adds or changes must also be at
 * least minReleaseAgeDays (lockfile-review.json) old, unless a committed
 * cooldownOverride or a Renovate security update lets it through; both are
 * logged in the report. The rules: §4 of
 * docs/superpowers/specs/2026-11-27-dependency-register-gate-design.md.
 *
 * Reads the lockfiles and the register, and asks the npm registry and the
 * GitHub API; installs nothing. Runs in the lockfile-review job of
 * zizmor.yml, after lockfile-diff.mjs.
 *
 * The same file in linked-data-explorer, ttl-editor and ronl-business-api.
 * Copied from linked-data-explorer 67bd0ae.
 *
 * Usage:
 *   node scripts/dependency-gate.mjs <base-lockfile> <head-lockfile>
 *     [--config lockfile-review.json] [--register dependency-register.json]
 *     [--out gate.md] [--comment gate-comment.md]
 *   node scripts/dependency-gate.mjs --check-register [--register file]
 * Environment: GITHUB_TOKEN (read-only) and GITHUB_REPOSITORY for the GitHub
 * API; PR_AUTHOR, and PR_NUMBER when the author is renovate[bot], to decide
 * whether the pull request is a Renovate security update. The label is read
 * from the GitHub API, never from the event payload.
 *
 * Exit: 0 nothing blocking, 1 a blocking finding, 2 the input, the register,
 * the registry or the GitHub API could not be used — which must never read as
 * clean.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import {
  evidenceFrom,
  fetchJson,
  mapLimited,
  monthsBetween,
} from "./dependency-review.mjs";
import {
  InputError,
  MARKER,
  REGISTRY,
  code,
  collectPackages,
  diffPackages,
  installedEntries,
  licenceAllowed,
  nameOf,
  newDirectDependencies,
  parseConfig,
  parseLockfile,
  truncateForComment,
} from "./lockfile-diff.mjs";

const DAY_MS = 86400000;
const MIN_WHY = 40;
const CRITERIA = [
  "maintained",
  "maintainers",
  "licence",
  "releasePolicy",
  "footprint",
  "needed",
];
// The criteria a registry/lockfile signal can contradict (§4.3 rule 3).
const SIGNALLED = ["maintained", "maintainers", "licence", "footprint"];

const isObject = (v) =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const isInt = (v) => Number.isInteger(v);
const flat = (s) => String(s).replace(/[\r\n]+/g, " ");
// A table cell: one line, and a pipe cannot end the cell early.
const cell = (s) => flat(s).replace(/\|/g, "\\|");
const day = (iso) => (iso ? String(iso).slice(0, 10) : "—");
const major = (v) => String(v ?? "").split(".")[0];

function parseEntry(raw, index, label) {
  const at = isObject(raw) && raw.name ? `"${raw.name}"` : `#${index + 1}`;
  const fail = (what) => {
    throw new InputError(`${label}: entry ${at}: ${what}`);
  };
  if (!isObject(raw)) fail("not an object");
  for (const key of ["name", "manifest", "field"]) {
    if (typeof raw[key] !== "string" || !raw[key]) fail(`${key} missing`);
  }
  if (!["assessed", "override"].includes(raw.status)) {
    fail('status must be "assessed" or "override"');
  }
  if (raw.assessed !== undefined) {
    if (
      !isObject(raw.assessed) ||
      typeof raw.assessed.version !== "string" ||
      !raw.assessed.version
    ) {
      fail("assessed.version missing");
    }
  } else if (raw.status === "assessed") fail("assessed missing");
  if (raw.followUp !== undefined && !isInt(raw.followUp)) {
    fail("followUp must be an integer");
  }
  if (raw.status === "assessed") {
    if (!isObject(raw.criteria)) fail("criteria missing");
    for (const name of CRITERIA) {
      const c = raw.criteria[name];
      if (!isObject(c) || typeof c.holds !== "boolean") {
        fail(`criteria.${name}.holds must be true or false`);
      }
      if (c.why !== undefined && typeof c.why !== "string") {
        fail(`criteria.${name}.why must be text`);
      }
    }
    if (!["keep", "replace"].includes(raw.outcome)) {
      fail('outcome must be "keep" or "replace"');
    }
    if (raw.outcome === "replace" && raw.followUp === undefined) {
      fail("outcome replace needs an integer followUp");
    }
  } else {
    const o = raw.override;
    if (!isObject(o) || typeof o.reason !== "string" || !o.reason) {
      fail("override.reason missing");
    }
    if (!isInt(o.issue)) fail("override.issue must be an integer");
  }
  return raw;
}

/** Parse dependency-register.json; any shape error names entry and field. */
export function parseRegister(text, label = "dependency-register.json") {
  let doc;
  try {
    doc = JSON.parse(text);
  } catch (err) {
    throw new InputError(`${label} is not valid JSON: ${err.message}`);
  }
  if (!isObject(doc) || !Array.isArray(doc.dependencies)) {
    throw new InputError(`${label}: "dependencies" must be a list`);
  }
  const seen = new Set();
  const dependencies = doc.dependencies.map((raw, i) => {
    const entry = parseEntry(raw, i, label);
    const key = `${entry.name}\u0000${entry.manifest}`;
    if (seen.has(key)) {
      throw new InputError(
        `${label}: duplicate entry for "${entry.name}" in "${entry.manifest}"`,
      );
    }
    seen.add(key);
    return entry;
  });
  const overrides = doc.cooldownOverrides ?? [];
  if (!Array.isArray(overrides)) {
    throw new InputError(`${label}: "cooldownOverrides" must be a list`);
  }
  const cooldownOverrides = overrides.map((o, i) => {
    if (
      !isObject(o) ||
      typeof o.package !== "string" ||
      typeof o.version !== "string" ||
      typeof o.reason !== "string" ||
      !o.reason ||
      !isInt(o.issue)
    ) {
      throw new InputError(
        `${label}: cooldownOverrides #${i + 1} needs package, version, reason and an integer issue`,
      );
    }
    return o;
  });
  return { dependencies, cooldownOverrides };
}

/**
 * What the registry, GitHub and the lockfile say about a package, per
 * criterion. A string is the reason the criterion cannot hold; `fatal` is
 * deprecated or archived (spec §4.3 rule 3). `installScripts` lists the
 * packages with an install script in the package's transitive closure, itself
 * included (see installScriptsIn).
 */
export function signalsFor(evidence, installScripts, now, allow) {
  const e = evidence ?? {};
  const stale = [];
  if (!e.lastRelease) stale.push("no release date recorded");
  else {
    const months = monthsBetween(e.lastRelease, now);
    if (months >= 12) stale.push(`no release in ${months} months`);
  }
  let fatal = null;
  if (e.deprecated) fatal = `deprecated: ${code(e.deprecated)}`;
  else if (e.archived === true) fatal = "repository archived";
  // Deprecated and archived also mean "not maintained" (spec §4.3 rule 3);
  // a repository nobody could look at is not read as maintained either.
  if (fatal) stale.push(fatal);
  else if (e.archived !== false) {
    stale.push(
      e.repoNote
        ? `repository not checked (${e.repoNote})`
        : "repository not checked",
    );
  }
  const maintained = stale.length ? stale.join("; ") : null;
  let maintainers = null;
  if (typeof e.maintainers !== "number") {
    maintainers = "no maintainer count recorded";
  } else if (e.maintainers <= 1 && e.orgOwned !== true) {
    maintainers =
      e.orgOwned === false
        ? "one maintainer, no organisation"
        : "one maintainer, organisation not checked";
  }
  let licence = null;
  if (!e.licence) licence = "no licence recorded";
  else if (!licenceAllowed(e.licence, allow)) {
    licence = `licence ${code(e.licence)} not on the allow-list`;
  }
  const scripts = installScripts ?? [];
  const footprint = scripts.length
    ? `install script in ${scripts.map(code).join(", ")}`
    : null;
  return { maintained, maintainers, licence, footprint, fatal };
}

function checkVersion(entry, lockedVersion, blocking) {
  const assessed = entry.assessed?.version;
  if (assessed && major(assessed) !== major(lockedVersion)) {
    blocking.push(
      `assessed version ${code(assessed)} is a different major than the locked ${code(lockedVersion)}: assess again`,
    );
  }
}

/** Why issue `n` cannot be cited, or null when it is an open issue. */
function issueProblem(n, ctx) {
  const state = ctx.issueState(n);
  if (state === "open") return null;
  if (state === "pull request") return `#${n} is a pull request, not an issue`;
  return `#${n} is not open`;
}

function checkIssue(label, n, ctx, blocking) {
  const problem = issueProblem(n, ctx);
  if (problem) blocking.push(`${label} ${problem}`);
}

/** Rules 1-6 of spec §4.3 (and §4.4 for an override) for one dependency. */
export function evaluateNewDependency(dep, entry, signals, lockedVersion, ctx) {
  const blocking = [];
  const warnings = [];
  if (!entry) {
    if (ctx.renovateSecurity) {
      warnings.push(
        "Renovate security update with no register entry: still to assess",
      );
    } else {
      blocking.push(
        `no entry in dependency-register.json for ${code(dep.name)} in ${code(dep.manifest)}`,
      );
    }
    return { blocking, warnings };
  }
  checkVersion(entry, lockedVersion, blocking);
  if (entry.status === "override") {
    checkIssue("override issue", entry.override.issue, ctx, blocking);
    warnings.push(
      `override: ${code(entry.override.reason)} (issue #${entry.override.issue}), to be replaced by an assessment`,
    );
    return { blocking, warnings };
  }
  const criteria = entry.criteria;
  for (const name of SIGNALLED) {
    if (signals[name] && criteria[name].holds === true) {
      blocking.push(`${name}: the entry says it holds, but ${signals[name]}`);
    }
  }
  const whys = [];
  for (const name of CRITERIA) {
    const c = criteria[name];
    const needsWhy = name === "needed" || c.holds === false;
    const why = (c.why ?? "").trim();
    if (needsWhy && why.length < MIN_WHY) {
      blocking.push(
        `${name}: needs a why of at least ${MIN_WHY} characters${why ? ` (has ${why.length})` : ""}`,
      );
    }
    if (why) whys.push([name, why]);
  }
  const first = new Map();
  for (const [name, why] of whys) {
    if (first.has(why)) {
      blocking.push(
        `${name}: why is identical to the one for ${first.get(why)}`,
      );
    } else first.set(why, name);
  }
  if (entry.followUp !== undefined) {
    checkIssue("follow-up issue", entry.followUp, ctx, blocking);
  }
  if (signals.fatal && entry.outcome !== "replace") {
    blocking.push(
      `${signals.fatal}: fails outright unless the outcome is replace with an open followUp`,
    );
  }
  return { blocking, warnings };
}

/**
 * Cooldown (spec §4.5): every changed version must be at least `minDays` old.
 * Young versions pass as exceptions for a Renovate security PR or a committed
 * cooldownOverride with an open issue; a missing publish time blocks.
 */
export function evaluateCooldown(
  changed,
  publishedAt,
  now,
  minDays,
  overrides,
  ctx,
) {
  const blocking = [];
  const exceptions = [];
  for (const { name, version } of changed) {
    const published = publishedAt.get(`${name}@${version}`);
    const ms = published ? new Date(published).getTime() : NaN;
    if (Number.isNaN(ms)) {
      blocking.push(
        `${code(name)} ${code(version)}: no publish time to check the cooldown against`,
      );
      continue;
    }
    const age = now.getTime() - ms;
    if (age >= minDays * DAY_MS) continue;
    const ageDays = Math.floor(age / DAY_MS);
    const base = {
      name,
      version,
      published: new Date(ms).toISOString().slice(0, 10),
      ageDays,
    };
    const override = overrides.find(
      (o) => o.package === name && o.version === version,
    );
    const problem = override ? issueProblem(override.issue, ctx) : null;
    if (ctx.renovateSecurity) {
      exceptions.push({ ...base, via: "Renovate security update" });
    } else if (override && !problem) {
      exceptions.push({
        ...base,
        via: `override: ${code(override.reason)}`,
        issue: override.issue,
      });
    } else {
      const why = override ? `override issue ${problem}` : "no exception";
      blocking.push(
        `${code(name)} ${code(version)}: published ${base.published}, ${ageDays} days ago, under the ${minDays}-day cooldown (${why})`,
      );
    }
  }
  return { blocking, exceptions };
}

const JUDGEMENT = "none: a judgement";

/** The facts gathered per criterion, for the evidence table (spec §4.6). */
function factsOf(e) {
  const repo =
    e.archived === true
      ? "repository archived"
      : e.archived === false
        ? "repository not archived"
        : e.repoNote
          ? `repository not checked (${e.repoNote})`
          : "repository not checked";
  const owner =
    e.orgOwned === true
      ? "repository owned by an organisation"
      : e.orgOwned === false
        ? "repository owned by a user"
        : "owner not checked";
  const scripts = e.installScripts ?? [];
  return {
    maintained: [
      `last release ${day(e.lastRelease)}`,
      e.deprecated ? `deprecated: ${code(e.deprecated)}` : "not deprecated",
      repo,
    ].join("; "),
    maintainers: `${e.maintainers ?? "?"} npm maintainer${e.maintainers === 1 ? "" : "s"}; ${owner}`,
    licence: e.licence ? code(e.licence) : "none recorded",
    releasePolicy: JUDGEMENT,
    footprint: scripts.length
      ? `install script in ${scripts.map(code).join(", ")}`
      : "no install script in it or in what it pulls in",
    needed: JUDGEMENT,
  };
}

/** Per criterion: the evidence, what the entry says, and the verdict. */
function evidenceTable(row) {
  const e = row.evidence;
  const facts = factsOf(e);
  const lines = [
    `Locked ${code(e.lockedVersion || "?")}, ` +
      (e.repo
        ? `repository ${code(e.repo)}.`
        : "no GitHub repository recorded."),
    "",
    "| criterion | evidence | register entry | |",
    "| --- | --- | --- | :-: |",
  ];
  for (const name of CRITERIA) {
    let said = "—";
    let mark = "—";
    if (row.entry?.status === "override") said = "override";
    else if (row.entry) {
      const c = row.entry.criteria[name];
      said = `${c.holds ? "holds" : "does not hold"}${c.why ? `: ${c.why}` : ""}`;
      mark = row.blocking.some((b) => b.startsWith(`${name}:`)) ? "✗" : "✓";
    }
    lines.push(`| ${name} | ${cell(facts[name])} | ${cell(said)} | ${mark} |`);
  }
  return [...lines, ""];
}

/** The "Dependency gate" section of the comment and job summary. */
export function renderGate({ rows, cooldown, renovateSecurity }) {
  const lines = ["#### Dependency gate", ""];
  if (renovateSecurity) {
    lines.push(
      "Renovate security update: young versions are logged, not blocked.",
      "",
    );
  }
  if (rows.length === 0) lines.push("No new direct dependencies.", "");
  for (const row of rows) {
    const mark = row.blocking.length ? "✗" : "✓";
    lines.push(
      `**${mark} ${code(row.name)} in ${code(row.manifest)}**${row.field ? ` (${row.field})` : ""}`,
      "",
    );
    if (row.evidence) lines.push(...evidenceTable(row));
    for (const b of row.blocking) lines.push(`- ✗ ${flat(b)}`);
    for (const w of row.warnings) lines.push(`- warning: ${flat(w)}`);
    if (row.blocking.length || row.warnings.length) lines.push("");
  }
  lines.push("##### Cooldown", "");
  if (cooldown.blocking.length === 0)
    lines.push("Every changed version is old enough or excepted.");
  for (const b of cooldown.blocking) lines.push(`- ✗ ${flat(b)}`);
  if (cooldown.exceptions.length) {
    lines.push("", "##### Cooldown exceptions", "");
    for (const x of cooldown.exceptions) {
      lines.push(
        `- ${code(x.name)} ${code(x.version)} — published ${x.published}, ${x.ageDays} days old — ${flat(x.via ?? "")}${x.issue ? ` (#${x.issue})` : ""}`,
      );
    }
  }
  return lines.join("\n");
}

/**
 * The gate's own report when it could not run (exit 2): its section only.
 * The marker and the "Lockfile review" heading belong to lockfile-diff.mjs.
 */
export function renderGateFailure(message) {
  return [
    "#### Dependency gate",
    "",
    "**✗ The dependency gate could not run** — the check fails.",
    "",
    code(message),
    "",
  ].join("\n");
}

const NO_FINDINGS = "**✓ No blocking findings.**";

/**
 * One report from lockfile-diff.mjs's and the gate's. The gate's section goes
 * right under the verdict, so cutting the whole to fit a comment cuts the
 * lockfile's lists, never the gate. A gate that blocks (status 1) or could
 * not run (anything else but 0) replaces "✓ No blocking findings" with its
 * own verdict. Returns the full text (job summary) and the text cut to fit a
 * comment.
 */
export function combineComment(report, gate, gateStatus) {
  const lines = String(report ?? "")
    .trimEnd()
    .split("\n");
  const at = lines.findIndex((l) => l.startsWith("**✓") || l.startsWith("**✗"));
  const header =
    at >= 0 ? lines.slice(0, at) : [MARKER, "### Lockfile review", ""];
  let verdict = at >= 0 ? [lines[at]] : [];
  const rest = at >= 0 ? lines.slice(at + 1) : [];
  while (rest.length && rest[0] === "") rest.shift();
  const gateVerdict =
    gateStatus === 0
      ? null
      : gateStatus === 1
        ? "**✗ The dependency gate blocks** — the check fails."
        : "**✗ The dependency gate could not run** — the check fails.";
  if (gateVerdict) {
    verdict =
      verdict.length && verdict[0] !== NO_FINDINGS
        ? [...verdict, "", gateVerdict]
        : [gateVerdict];
  } else if (!verdict.length) verdict = [NO_FINDINGS];
  const body = [
    ...header,
    ...verdict,
    "",
    String(gate ?? "").trim(),
    ...(rest.length ? ["", ...rest] : []),
  ].join("\n");
  return { summary: `${body}\n`, comment: truncateForComment(`${body}\n`) };
}

// ── evidence gathering and the command line ────────────────────────────────

export const packumentUrl = (name) => `${REGISTRY}${name.replace("/", "%2f")}`;

/**
 * Package versions the head lockfile adds or changes: the versions of an added
 * package, and the `to` versions of an updated one that base did not have.
 * Workspace links, bundled copies and anything not resolved from the npm
 * registry have no publish time to check and are left out.
 */
export function changedVersions(baseDoc, headDoc) {
  const diff = diffPackages(collectPackages(baseDoc), collectPackages(headDoc));
  const fromRegistry = new Set();
  for (const [key, entry] of installedEntries(headDoc)) {
    if (entry.inBundle || !String(entry.resolved ?? "").startsWith(REGISTRY)) {
      continue;
    }
    fromRegistry.add(`${nameOf(key)}@${entry.version}`);
  }
  const out = [];
  const add = (name, versions) => {
    for (const version of versions) {
      if (fromRegistry.has(`${name}@${version}`)) out.push({ name, version });
    }
  };
  for (const a of diff.added) add(a.name, a.versions);
  for (const u of diff.updated) {
    add(
      u.name,
      u.to.filter((v) => !u.from.includes(v)),
    );
  }
  return out.sort(
    (x, y) =>
      x.name.localeCompare(y.name) || x.version.localeCompare(y.version),
  );
}

export const RENOVATE = "renovate[bot]";

/**
 * Spec §4.5, as ruled in the final review: the author is renovate[bot], the
 * `security` label is on the pull request now, and renovate[bot] is the one
 * that put it there. A person adding the label does not count.
 */
export function isRenovateSecurity(author, labels, events) {
  if (author !== RENOVATE || !labels.includes("security")) return false;
  return events.some(
    (e) =>
      e?.event === "labeled" &&
      e.label?.name === "security" &&
      e.actor?.login === RENOVATE,
  );
}

function optionOf(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function read(path, label) {
  try {
    return readFileSync(path, "utf8");
  } catch (err) {
    throw new InputError(`cannot read ${label} ${path}: ${err.code}`);
  }
}

function githubHeaders(env) {
  return {
    ...(env.GITHUB_TOKEN
      ? { authorization: `Bearer ${env.GITHUB_TOKEN}` }
      : {}),
    "x-github-api-version": "2022-11-28",
  };
}

function repositoryOf(env, why) {
  const repo = env.GITHUB_REPOSITORY;
  if (!repo) throw new InputError(`GITHUB_REPOSITORY is needed to ${why}`);
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    throw new InputError(`GITHUB_REPOSITORY is not "owner/repo": ${repo}`);
  }
  return repo;
}

/** Every item of a paginated GitHub list. */
async function allPages(url, headers, opts, maxPages = 30) {
  const items = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const batch = await fetchJson(
      `${url}?per_page=100&page=${page}`,
      headers,
      opts,
    );
    if (!Array.isArray(batch)) throw new Error(`${url} did not answer a list`);
    items.push(...batch);
    if (batch.length < 100) return items;
  }
  throw new Error(`${url} has more than ${maxPages * 100} items`);
}

/**
 * Whether this run is a Renovate security update, asked of the GitHub API at
 * run time: Renovate labels a pull request in a call after creating it, so
 * the event payload of the run that matters does not carry the label yet,
 * and this waits for it (up to 60 s) rather than relying on a run started by
 * `labeled`. Asked only when PR_AUTHOR is renovate[bot]; any API failure is
 * exit 2. `opts.labelWaitMs`, `opts.labelPollMs` and `opts.sleep` are for
 * tests.
 */
export async function renovateSecurityOf(env, opts = {}) {
  if (env.PR_AUTHOR !== RENOVATE) return false;
  const number = env.PR_NUMBER ?? "";
  if (!/^[1-9]\d*$/.test(number)) {
    throw new InputError(
      `PR_NUMBER must be the pull request's number when PR_AUTHOR is ${RENOVATE} (got "${number}")`,
    );
  }
  const repo = repositoryOf(env, "check a Renovate pull request's label");
  const url = `https://api.github.com/repos/${repo}/issues/${number}`;
  const headers = githubHeaders(env);
  const { labelWaitMs = 60000, labelPollMs = 5000 } = opts;
  const sleep =
    opts.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  try {
    // Renovate adds all its labels (`dependencies`, plus `security` on a
    // vulnerability update) in one call a second or so after it opens the
    // pull request. A run started by `opened` can get here first, so wait
    // until the pull request carries any label, up to labelWaitMs. Still none
    // then: decide with what is there (the route stays off), not exit 2.
    let labels = await allPages(`${url}/labels`, headers, opts);
    for (
      let waited = 0;
      labels.length === 0 && waited < labelWaitMs;
      waited += labelPollMs
    ) {
      await sleep(labelPollMs);
      labels = await allPages(`${url}/labels`, headers, opts);
    }
    const events = await allPages(`${url}/events`, headers, opts);
    return isRenovateSecurity(
      env.PR_AUTHOR,
      labels.map((l) => l?.name),
      events,
    );
  } catch (err) {
    throw new InputError(`GitHub pull request #${number}: ${err.message}`);
  }
}

/** The issue numbers cited by the register entries this run evaluates. */
export function referencedIssues(register, newDirect, changed) {
  const issues = new Set();
  for (const d of newDirect) {
    const e = register.dependencies.find(
      (x) => x.name === d.name && x.manifest === d.manifest,
    );
    if (e?.followUp !== undefined) issues.add(e.followUp);
    if (e?.override) issues.add(e.override.issue);
  }
  for (const o of register.cooldownOverrides) {
    if (changed.some((c) => c.name === o.package && c.version === o.version)) {
      issues.add(o.issue);
    }
  }
  return [...issues].sort((a, b) => a - b);
}

/**
 * The head lockfile's entry for a direct dependency of `manifest`: the copy
 * that manifest resolves (its own node_modules, else the hoisted one), else
 * any copy. Returns [key, entry], or [] when there is none.
 */
export function lockEntryOf(headDoc, name, manifest) {
  const own =
    manifest === "(root)"
      ? `node_modules/${name}`
      : `${manifest}/node_modules/${name}`;
  for (const key of [own, `node_modules/${name}`]) {
    const entry = headDoc.packages[key];
    if (entry && !entry.link) return [key, entry];
  }
  return installedEntries(headDoc).find(([key]) => nameOf(key) === name) ?? [];
}

/**
 * The lockfile key `name` resolves to from the package at `fromKey`, the way
 * Node looks it up: its own node_modules first, then each one further up, to
 * the root. Null when the lockfile has no such package.
 */
export function resolveFrom(packages, fromKey, name) {
  let dir = fromKey;
  for (;;) {
    const key = dir ? `${dir}/node_modules/${name}` : `node_modules/${name}`;
    if (packages[key]) return key;
    if (!dir) return null;
    const i = dir.lastIndexOf("/node_modules/");
    if (i >= 0) dir = dir.slice(0, i);
    else if (dir.startsWith("node_modules/")) dir = "";
    else dir = dir.includes("/") ? dir.slice(0, dir.lastIndexOf("/")) : "";
  }
}

/**
 * The packages with an install script among `startKey` and everything it
 * pulls in (dependencies and optional dependencies, resolved as Node does),
 * as name@version. tsx brings its own esbuild that way
 * (node_modules/tsx/node_modules/esbuild). Peer dependencies are not
 * followed: a peer is the host the package plugs into (vite for a vite
 * plugin), installed for the host, not for it. Workspace links are not
 * followed either.
 */
export function installScriptsIn(doc, startKey) {
  const found = new Set();
  const seen = new Set();
  const queue = startKey ? [startKey] : [];
  while (queue.length) {
    const key = queue.shift();
    if (seen.has(key)) continue;
    seen.add(key);
    const entry = doc.packages[key];
    if (!entry || entry.link) continue;
    if (entry.hasInstallScript) found.add(`${nameOf(key)}@${entry.version}`);
    for (const field of ["dependencies", "optionalDependencies"]) {
      for (const dep of Object.keys(entry[field] ?? {})) {
        const next = resolveFrom(doc.packages, key, dep);
        if (next) queue.push(next);
      }
    }
  }
  return [...found].sort();
}

/**
 * Asks the registry and GitHub what the rules need, and keeps only that: the
 * publish times of every changed package, the evidence for each new direct
 * dependency at its locked version (`wanted`: name → versions), its
 * repository, and the state of each issue `issues` lists.
 */
export async function gatherFacts({ wanted, changed, issues, env, opts }) {
  const ghHeaders = githubHeaders(env);
  const names = [
    ...new Set([...wanted.keys(), ...changed.map((c) => c.name)]),
  ].sort();
  const times = new Map();
  const evidence = new Map();
  await mapLimited(names, 8, async (name) => {
    let packument;
    try {
      packument = await fetchJson(packumentUrl(name), {}, opts);
    } catch (err) {
      throw new InputError(`registry ${name}: ${err.message}`);
    }
    times.set(name, packument.time ?? {});
    for (const version of wanted.get(name) ?? []) {
      evidence.set(`${name}@${version}`, evidenceFrom(packument, version));
    }
  });
  const repoNames = new Set(
    [...evidence.values()].map((e) => e.repo).filter(Boolean),
  );
  const repos = new Map();
  await mapLimited([...repoNames], 8, async (repo) => {
    try {
      const found = await fetchJson(
        `https://api.github.com/repos/${repo}`,
        ghHeaders,
        opts,
      );
      repos.set(repo, {
        archived: Boolean(found.archived),
        orgOwned: found.owner?.type === "Organization",
      });
    } catch (err) {
      // A repository that is gone is evidence, not a failure to gather it.
      if (err.status === 404 || err.status === 410) {
        repos.set(repo, { notFound: true });
      } else throw new InputError(`GitHub ${repo}: ${err.message}`);
    }
  });
  const issueStates = new Map();
  if (issues.length) {
    const repo = repositoryOf(env, "look up issues");
    await mapLimited(issues, 8, async (n) => {
      try {
        const issue = await fetchJson(
          `https://api.github.com/repos/${repo}/issues/${n}`,
          ghHeaders,
          opts,
        );
        // The issues endpoint answers for pull requests too.
        issueStates.set(
          n,
          issue.pull_request ? "pull request" : String(issue.state),
        );
      } catch (err) {
        // A missing or deleted issue is simply not open.
        if (err.status === 404 || err.status === 410) {
          issueStates.set(n, "missing");
        } else throw new InputError(`GitHub issue #${n}: ${err.message}`);
      }
    });
  }
  return { times, evidence, repos, issueStates };
}

export async function run(args, env, now = new Date(), opts = {}) {
  const registerPath =
    optionOf(args, "--register") ?? "dependency-register.json";
  if (args.includes("--check-register")) {
    if (!existsSync(registerPath)) {
      return {
        code: 0,
        message: `no dependency-register.json at ${registerPath}`,
      };
    }
    const reg = parseRegister(read(registerPath, "register"), registerPath);
    return {
      code: 0,
      message: `${registerPath}: ${reg.dependencies.length} entries, ${reg.cooldownOverrides.length} cooldown overrides`,
    };
  }
  const positional = args.filter(
    (a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")),
  );
  if (positional.length !== 2) {
    throw new InputError(
      "usage: dependency-gate.mjs <base-lockfile> <head-lockfile> " +
        "[--config file] [--register file] [--out file] [--comment file] | --check-register [--register file]",
    );
  }
  const configPath = optionOf(args, "--config") ?? "lockfile-review.json";
  const config = parseConfig(read(configPath, "config"), configPath);
  const [basePath, headPath] = positional;
  const baseDoc = parseLockfile(read(basePath, "base lockfile"), basePath);
  const headDoc = parseLockfile(read(headPath, "head lockfile"), headPath);
  const register = existsSync(registerPath)
    ? parseRegister(read(registerPath, "register"), registerPath)
    : { dependencies: [], cooldownOverrides: [] };
  const renovateSecurity = await renovateSecurityOf(env, opts);
  const newDirect = newDirectDependencies(baseDoc, headDoc).map((d) => {
    const [key, entry] = lockEntryOf(headDoc, d.name, d.manifest);
    return { ...d, lockKey: key, lockedVersion: entry?.version ?? "" };
  });
  const changed = changedVersions(baseDoc, headDoc);
  const wanted = new Map();
  for (const d of newDirect) {
    wanted.set(
      d.name,
      new Set([...(wanted.get(d.name) ?? []), d.lockedVersion]),
    );
  }
  const { times, evidence, repos, issueStates } = await gatherFacts({
    wanted,
    changed,
    issues: referencedIssues(register, newDirect, changed),
    env,
    opts,
  });
  const ctx = {
    renovateSecurity,
    issueState: (n) => issueStates.get(n) ?? "missing",
  };
  const rows = newDirect.map(({ lockKey, lockedVersion, ...d }) => {
    const e = { ...evidence.get(`${d.name}@${lockedVersion}`), lockedVersion };
    const repo = e.repo ? repos.get(e.repo) : null;
    e.archived = repo && !repo.notFound ? repo.archived : null;
    e.orgOwned = repo && !repo.notFound ? repo.orgOwned : null;
    e.repoNote = !e.repo
      ? "no GitHub repository recorded"
      : repo?.notFound
        ? "repository not found"
        : null;
    e.installScripts = installScriptsIn(headDoc, lockKey);
    const entry = register.dependencies.find(
      (x) => x.name === d.name && x.manifest === d.manifest,
    );
    const signals = signalsFor(e, e.installScripts, now, config.allow);
    return {
      ...d,
      evidence: e,
      entry,
      ...evaluateNewDependency(d, entry, signals, lockedVersion, ctx),
    };
  });
  const publishedAt = new Map();
  for (const { name, version } of changed) {
    const time = times.get(name)?.[version];
    if (time) publishedAt.set(`${name}@${version}`, time);
  }
  const cooldown = evaluateCooldown(
    changed,
    publishedAt,
    now,
    config.minReleaseAgeDays,
    register.cooldownOverrides,
    ctx,
  );
  const report = renderGate({ rows, cooldown, renovateSecurity });
  const blocking =
    rows.some((r) => r.blocking.length) || cooldown.blocking.length > 0;
  return { code: blocking ? 1 : 0, report };
}

const invoked =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invoked) {
  const args = process.argv.slice(2);
  const files = [optionOf(args, "--out"), optionOf(args, "--comment")];
  try {
    const result = await run(args, process.env);
    if (result.message) console.log(result.message);
    if (result.report !== undefined) {
      if (files[0]) writeFileSync(files[0], `${result.report}\n`);
      if (files[1]) {
        writeFileSync(files[1], `${truncateForComment(result.report)}\n`);
      }
      if (!files[0] && !files[1]) process.stdout.write(`${result.report}\n`);
    }
    process.exitCode = result.code;
  } catch (err) {
    // Anything unexpected is exit 2 too: a crash must not read as clean.
    const message = err instanceof InputError ? err.message : String(err);
    console.error(
      `dependency-gate: ${err instanceof InputError ? err.message : err.stack}`,
    );
    for (const file of files) {
      if (file) writeFileSync(file, renderGateFailure(message));
    }
    process.exitCode = 2;
  }
}
