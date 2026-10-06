#!/usr/bin/env node
/**
 * lockfile-diff.mjs — what a package-lock.json change actually contains.
 *
 * A dependency pull request shows its reviewer the direct change
 * (`prettier ^3.9.7 → ^3.9.8`). What moves is the lockfile, and nobody reads
 * a lockfile diff: a new transitive package, a new origin, a downgrade, a
 * licence change, a new install script. This compares two lockfiles as data
 * and says which of those happened (ICTU recommendation 9;
 * sgort/linked-data-explorer#248).
 *
 * Reads the lockfiles only: it never runs npm and never installs, like the
 * daily audit (--package-lock-only) and the release SBOM.
 *
 * The same file in linked-data-explorer, ttl-editor and ronl-business-api;
 * each repository's policy is lockfile-review.json at its root.
 *
 * Usage:
 *   node scripts/lockfile-diff.mjs <base-lockfile> <head-lockfile>
 *     [--config lockfile-review.json] [--out report.md] [--comment comment.md]
 *
 * Exit: 0 nothing blocking, 1 a blocking finding, 2 a lockfile or the config
 * could not be used — which must never read as clean.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const REGISTRY = "https://registry.npmjs.org/";
const NODE_MODULES = "node_modules/";

/** Input this cannot use: exit 2, never "clean". */
export class InputError extends Error {}

/** Only lockfileVersion 3 records every field read here. */
export function parseLockfile(text, label) {
  let doc;
  try {
    doc = JSON.parse(text);
  } catch (err) {
    throw new InputError(`${label} is not valid JSON: ${err.message}`);
  }
  if (doc?.lockfileVersion !== 3) {
    const found = doc?.lockfileVersion ?? "none";
    throw new InputError(`${label} must be lockfileVersion 3 (found ${found})`);
  }
  if (!doc.packages || typeof doc.packages !== "object") {
    throw new InputError(`${label} has no "packages" map`);
  }
  return doc;
}

/**
 * Installed packages, as [key, entry]. Skipped: the root (""), workspace
 * entries ("packages/backend") and the links npm makes to them
 * ("node_modules/@x/backend", link: true). Those carry no integrity and a
 * resolved inside the repository, so counting them would fail every
 * workspace repository on the origin and integrity rules.
 */
export function installedEntries(doc) {
  return Object.entries(doc.packages).filter(
    ([key, entry]) => key.includes(NODE_MODULES) && !entry.link,
  );
}

/** "node_modules/a/node_modules/@s/b" -> "@s/b" */
export function nameOf(key) {
  return key.slice(key.lastIndexOf(NODE_MODULES) + NODE_MODULES.length);
}

/** SPDX text, the legacy { type } object, or null when none is recorded. */
export function licenceOf(entry) {
  const l = entry.license;
  if (typeof l === "string" && l.trim()) return l.trim();
  if (l && typeof l === "object" && typeof l.type === "string") return l.type;
  return null;
}

/** Semver order without a dependency; build metadata ignored. */
export function compareVersions(a, b) {
  const split = (v) => {
    const core = String(v).split("+")[0];
    const i = core.indexOf("-");
    return i < 0 ? [core, ""] : [core.slice(0, i), core.slice(i + 1)];
  };
  const [coreA, preA] = split(a);
  const [coreB, preB] = split(b);
  const na = coreA.split(".").map(Number);
  const nb = coreB.split(".").map(Number);
  for (let i = 0; i < Math.max(na.length, nb.length); i += 1) {
    const d = (na[i] ?? 0) - (nb[i] ?? 0);
    if (Number.isNaN(d)) return String(a).localeCompare(String(b));
    if (d !== 0) return Math.sign(d);
  }
  if (preA === preB) return 0;
  if (!preA) return 1;
  if (!preB) return -1;
  return Math.sign(preA.localeCompare(preB, undefined, { numeric: true }));
}

/**
 * One record per package name across every path it is installed at, so a
 * hoisting move is not a change. dev only when every install is dev;
 * optional only for runtime names whose every install is optional.
 */
export function collectPackages(doc) {
  const acc = new Map();
  for (const [key, entry] of installedEntries(doc)) {
    const name = nameOf(key);
    const rec = acc.get(name) ?? {
      versions: new Set(),
      paths: {},
      dev: true,
      optional: true,
      licences: new Set(),
      installScript: false,
    };
    if (entry.version) {
      rec.versions.add(entry.version);
      rec.paths[key] = entry.version;
    }
    rec.dev &&= entry.dev === true;
    rec.optional &&= entry.optional === true;
    rec.licences.add(licenceOf(entry));
    rec.installScript ||= entry.hasInstallScript === true;
    acc.set(name, rec);
  }
  const byText = (x, y) => String(x).localeCompare(String(y));
  const out = new Map();
  for (const [name, rec] of acc) {
    out.set(name, {
      versions: [...rec.versions].sort(compareVersions),
      paths: rec.paths,
      dev: rec.dev,
      optional: !rec.dev && rec.optional,
      licences: [...rec.licences].sort(byText),
      installScript: rec.installScript,
    });
  }
  return out;
}

/** Added, removed and updated names; an update can be a downgrade. */
/** A version's line: its major, or "0.minor" below 1.0.0. */
function line(version) {
  const [major, minor] = String(version).split(/[.+-]/);
  return major === "0" ? `0.${minor}` : major;
}

export function diffPackages(base, head) {
  const added = [];
  const removed = [];
  const updated = [];
  for (const [name, h] of head) {
    const b = base.get(name);
    if (!b) {
      added.push({ name, ...h });
      continue;
    }
    if (b.versions.join() === h.versions.join()) continue;
    // A downgrade is a consumer moving back, judged per version LINE (major;
    // minor for 0.x), because version SETS mislead: replaying #230/#251 showed
    // a lost newer copy (agent-base), every copy on several lines going up
    // (brace-expansion) and npm hoisting an existing older copy to the root
    // (type-fest), and the final review a root re-hoisted onto the other
    // line while every copy went up (#248). Three ways to move back:
    // - a new version below every base version on its own line;
    // - a path now holding a new, lower version, while the line it held is
    //   gone from the tree (or survives only lower);
    // - a single-version package going down (it may have been hoisted).
    const sameLine = (v) => b.versions.filter((x) => line(x) === line(v));
    const lineDown = h.versions.some(
      (v) =>
        !b.versions.includes(v) &&
        sameLine(v).length > 0 &&
        sameLine(v).every((x) => compareVersions(x, v) > 0),
    );
    const samePathDown = Object.entries(h.paths).some(([key, v]) => {
      const was = b.paths[key];
      if (!was || b.versions.includes(v) || compareVersions(v, was) >= 0) {
        return false;
      }
      return !h.versions.some(
        (x) => line(x) === line(was) && compareVersions(x, was) >= 0,
      );
    });
    const singleDown =
      b.versions.length === 1 &&
      h.versions.length === 1 &&
      compareVersions(h.versions[0], b.versions[0]) < 0;
    const downgrade = lineDown || samePathDown || singleDown;
    updated.push({
      name,
      from: b.versions,
      to: h.versions,
      dev: h.dev,
      optional: h.optional,
      downgrade,
    });
  }
  for (const [name, b] of base) {
    if (!head.has(name)) removed.push({ name, ...b });
  }
  const byName = (x, y) => x.name.localeCompare(y.name);
  return {
    added: added.sort(byName),
    removed: removed.sort(byName),
    updated: updated.sort(byName),
  };
}

/**
 * The two rules that fail the check, over the whole head lockfile: a bad
 * entry fails however it arrived. A bundled dependency (inBundle) ships
 * inside its parent's tarball, which carries the integrity; npm records
 * neither resolved nor integrity for it.
 */
export function blockingFindings(doc) {
  const findings = [];
  for (const [key, entry] of installedEntries(doc)) {
    if (entry.inBundle) continue;
    const from = entry.resolved;
    if (typeof from !== "string" || !from.startsWith(REGISTRY)) {
      const detail = from
        ? `resolved from ${code(from)}`
        : "no resolved origin recorded";
      findings.push({ rule: "origin", key, detail });
    }
    if (!entry.integrity) {
      findings.push({ rule: "integrity", key, detail: "no integrity hash" });
    }
  }
  return findings;
}

/** SPDX, simply: AND binds tighter than OR; parentheses ignored. */
export function licenceAllowed(expression, allow) {
  if (!expression) return false;
  const terms = expression.replace(/[()]/g, " ").split(/\s+OR\s+/i);
  return terms.some((term) =>
    term.split(/\s+AND\s+/i).every((id) => allow.has(id.trim())),
  );
}

/**
 * Review prompts, never blocking: licence changes, new packages whose
 * licence the allow-list does not allow, install scripts that are new, and
 * downgrades. Licence and script findings consider only what changed, so
 * the accepted tree does not repeat in every report.
 */
export function reviewFindings(base, head, diff, allow) {
  const byName = (x, y) => x.name.localeCompare(y.name);
  const licenceChanges = [];
  const installScripts = [];
  for (const [name, h] of head) {
    const b = base.get(name);
    // A change is a licence the name did not have before. Losing one, when
    // a copy under it is removed, needs no review (minipass in #251).
    if (b && h.licences.some((l) => !b.licences.includes(l))) {
      licenceChanges.push({ name, from: b.licences, to: h.licences });
    }
    if (h.installScript && !b?.installScript) {
      installScripts.push({
        name,
        versions: h.versions,
        dev: h.dev,
        isNew: !b,
      });
    }
  }
  const licenceNotAllowed = diff.added
    .filter((p) => !p.licences.every((l) => licenceAllowed(l, allow)))
    .map((p) => ({ name: p.name, licences: p.licences, dev: p.dev }));
  return {
    licenceChanges: licenceChanges.sort(byName),
    licenceNotAllowed: licenceNotAllowed.sort(byName),
    installScripts: installScripts.sort(byName),
    downgrades: diff.updated.filter((u) => u.downgrade),
  };
}

/** lockfile-review.json: { "allowLicenses": [SPDX ids] }. */
export function parseConfig(text, label) {
  let doc;
  try {
    doc = JSON.parse(text);
  } catch (err) {
    throw new InputError(`${label} is not valid JSON: ${err.message}`);
  }
  const list = doc?.allowLicenses;
  if (!Array.isArray(list) || !list.every((l) => typeof l === "string")) {
    throw new InputError(
      `${label} needs "allowLicenses": an array of SPDX ids`,
    );
  }
  return { allow: new Set(list) };
}

export const MARKER = "<!-- lockfile-review -->";
export const COMMENT_LIMIT = 65536;

// Names, versions, licences and origins come from registry metadata. A
// backtick or line break in one would close its code span and let a package
// write its own lines into the bot's comment — "✓ approved" included — so
// both are neutralised (#248 final review).
const code = (s) =>
  `\`${String(s)
    .replace(/[\r\n]+/g, " ")
    .replace(/`/g, "'")}\``;
const versions = (v) => (v.length ? v.map(code).join(", ") : "—");
const licences = (l) =>
  l.map((x) => (x === null ? "_none recorded_" : code(x))).join(", ");
const kind = (p) =>
  p.dev ? "dev" : p.optional ? "runtime (optional)" : "runtime";
const runtimeFirst = (x, y) =>
  Number(x.dev) - Number(y.dev) || x.name.localeCompare(y.name);
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

function details(summary, lines) {
  if (!lines.length) return [];
  return [
    "<details>",
    `<summary>${summary}</summary>`,
    "",
    ...lines,
    "",
    "</details>",
    "",
  ];
}

function list(title, lines) {
  return lines.length ? [`#### ${title}`, "", ...lines, ""] : [];
}

/** The Markdown report: verdict, blocking findings, prompts, then changes. */
export function renderReport({ blocking, diff, review }) {
  const runtime = (items) => items.filter((p) => !p.dev).length;
  const verdict = blocking.length
    ? `**✗ ${plural(blocking.length, "blocking finding")}** — the check fails.`
    : "**✓ No blocking findings.**";
  const counts = [
    `${diff.added.length} added (${runtime(diff.added)} runtime)`,
    `${diff.removed.length} removed (${runtime(diff.removed)} runtime)`,
    `${diff.updated.length} updated (${runtime(diff.updated)} runtime)`,
    `${review.downgrades.length} downgraded`,
  ].join(" · ");
  return [
    MARKER,
    "### Lockfile review",
    "",
    verdict,
    "",
    `${counts}.`,
    "",
    ...list(
      "Blocking",
      blocking.map((b) => `- **${b.rule}** ${code(b.key)}: ${b.detail}`),
    ),
    ...list(
      "Downgrades",
      review.downgrades.map(
        (u) =>
          `- ${code(u.name)} ${versions(u.from)} → ${versions(u.to)} — ${kind(u)}`,
      ),
    ),
    ...list(
      "Licence changes",
      review.licenceChanges.map(
        (c) => `- ${code(c.name)} ${licences(c.from)} → ${licences(c.to)}`,
      ),
    ),
    ...list(
      "New packages with a licence not on the allow-list",
      review.licenceNotAllowed.map(
        (p) => `- ${code(p.name)} ${licences(p.licences)} — ${kind(p)}`,
      ),
    ),
    ...list(
      "New install scripts",
      review.installScripts.map(
        (p) =>
          `- ${code(p.name)} ${versions(p.versions)} — ${kind(p)}, ` +
          (p.isNew ? "new package" : "script newly added"),
      ),
    ),
    ...details(
      `Added (${diff.added.length})`,
      [...diff.added]
        .sort(runtimeFirst)
        .map(
          (p) =>
            `- ${code(p.name)} ${versions(p.versions)} — ${kind(p)} — ` +
            licences(p.licences),
        ),
    ),
    ...details(
      `Removed (${diff.removed.length})`,
      [...diff.removed]
        .sort(runtimeFirst)
        .map((p) => `- ${code(p.name)} ${versions(p.versions)} — ${kind(p)}`),
    ),
    ...details(
      `Updated (${diff.updated.length})`,
      [...diff.updated]
        .sort(runtimeFirst)
        .map(
          (u) =>
            `- ${code(u.name)} ${versions(u.from)} → ${versions(u.to)} — ` +
            kind(u) +
            (u.downgrade ? " — **downgrade**" : ""),
        ),
    ),
  ].join("\n");
}

/** Fits a GitHub comment; the job summary keeps the whole report. */
export function truncateForComment(report) {
  if (report.length <= COMMENT_LIMIT) return report;
  const note =
    "\n\n_Cut to fit a GitHub comment. The full report is in " +
    "the `lockfile-review` job summary._\n";
  // The cut nearly always lands in the last, longest <details>; left open, it
  // would fold the note away with the list it explains. Close it first.
  const close = "\n</details>\n";
  const room = report.slice(0, COMMENT_LIMIT - note.length - close.length);
  const cut = room.slice(0, room.lastIndexOf("\n"));
  const open =
    (cut.match(/<details>/g) ?? []).length -
    (cut.match(/<\/details>/g) ?? []).length;
  return cut + (open > 0 ? close : "") + note;
}

/** One ::error line per blocking finding, escaped as Actions requires. */
export function annotations(blocking) {
  const escape = (s) =>
    s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
  return blocking.map(
    (b) =>
      `::error title=lockfile-review ${b.rule}::${escape(`${b.key}: ${b.detail}`)}`,
  );
}

/** The value after a --flag, or undefined. */
function optionOf(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

/**
 * What the comment says when the review could not run. Without it an exit 2
 * left no report, and the comment from an earlier push — "✓ No blocking
 * findings" — stayed beside a red check (#248 final review).
 */
export function renderFailure(message) {
  return [
    MARKER,
    "### Lockfile review",
    "",
    "**✗ The lockfile review could not run** — the check fails.",
    "",
    code(message),
    "",
  ].join("\n");
}

function main(argv) {
  const args = argv.slice(2);
  const option = (name) => optionOf(args, name);
  const positional = args.filter(
    (a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")),
  );
  if (positional.length !== 2) {
    throw new InputError(
      "usage: lockfile-diff.mjs <base-lockfile> <head-lockfile> " +
        "[--config file] [--out file] [--comment file]",
    );
  }
  const read = (path, label) => {
    try {
      return readFileSync(path, "utf8");
    } catch (err) {
      throw new InputError(`cannot read ${label} ${path}: ${err.code}`);
    }
  };
  const configPath = option("--config") ?? "lockfile-review.json";
  const config = parseConfig(read(configPath, "config"), configPath);
  const [basePath, headPath] = positional;
  const baseDoc = parseLockfile(read(basePath, "base lockfile"), basePath);
  const headDoc = parseLockfile(read(headPath, "head lockfile"), headPath);
  const base = collectPackages(baseDoc);
  const head = collectPackages(headDoc);
  const diff = diffPackages(base, head);
  const review = reviewFindings(base, head, diff, config.allow);
  const blocking = blockingFindings(headDoc);
  const report = renderReport({ blocking, diff, review });
  const out = option("--out");
  if (out) writeFileSync(out, report);
  else process.stdout.write(`${report}\n`);
  const comment = option("--comment");
  if (comment) writeFileSync(comment, truncateForComment(report));
  if (process.env.GITHUB_ACTIONS === "true") {
    for (const annotation of annotations(blocking)) console.log(annotation);
  }
  return blocking.length ? 1 : 0;
}

const invoked =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invoked) {
  try {
    process.exitCode = main(process.argv);
  } catch (err) {
    // Anything unexpected is exit 2 as well: a crash must not read as clean.
    const message = err instanceof InputError ? err.message : String(err);
    console.error(
      `lockfile-diff: ${err instanceof InputError ? err.message : err.stack}`,
    );
    // Still write the report files, so the comment says why.
    const args = process.argv.slice(2);
    for (const file of [optionOf(args, "--out"), optionOf(args, "--comment")]) {
      if (file) writeFileSync(file, renderFailure(message));
    }
    process.exitCode = 2;
  }
}
