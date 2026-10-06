// Tests for lockfile-diff.mjs. Self-contained, like the other scripts/*.test.mjs:
// no test runner, prints a PASS count, exits 1 on any failure. Runs in the
// workflow that uses the script (zizmor.yml, job lockfile-review).
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as L from "./lockfile-diff.mjs";

// fileURLToPath, not .pathname: on Windows .pathname is '/C:/…' and is not a
// usable path (see promotion-targets.test.mjs).
const SCRIPT = fileURLToPath(new URL("./lockfile-diff.mjs", import.meta.url));

let passed = 0;
const failures = [];
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed += 1;
  else failures.push(`${label}\n    expected ${e}\n    actual   ${a}`);
}
function throws(label, fn, ErrorClass, pattern) {
  try {
    fn();
    failures.push(`${label}\n    expected a throw, got none`);
  } catch (err) {
    if (err instanceof ErrorClass && pattern.test(err.message)) passed += 1;
    else failures.push(`${label}\n    threw ${err.name}: ${err.message}`);
  }
}

const reg = (name, version) =>
  `https://registry.npmjs.org/${name}/-/${name.split("/").pop()}-${version}.tgz`;
function pkg(name, version, extra = {}) {
  return {
    version,
    resolved: reg(name, version),
    integrity: `sha512-${name}-${version}`,
    license: "MIT",
    ...extra,
  };
}
function lock(entries) {
  return {
    name: "fixture",
    lockfileVersion: 3,
    requires: true,
    packages: { "": { name: "fixture" }, ...entries },
  };
}
const nm = (name) => `node_modules/${name}`;

// ── Task 1: parse, model, diff ───────────────────────────────────────────────

throws(
  "rejects invalid JSON",
  () => L.parseLockfile("{", "base"),
  L.InputError,
  /not valid JSON/,
);
throws(
  "rejects lockfileVersion 2",
  () =>
    L.parseLockfile(JSON.stringify({ lockfileVersion: 2, packages: {} }), "b"),
  L.InputError,
  /lockfileVersion 3/,
);
throws(
  "rejects a lockfile without packages",
  () => L.parseLockfile(JSON.stringify({ lockfileVersion: 3 }), "b"),
  L.InputError,
  /packages/,
);

const ws = lock({
  "packages/backend": { name: "@x/backend", version: "1.0.0" },
  [nm("@x/backend")]: { resolved: "packages/backend", link: true },
  [nm("a")]: pkg("a", "1.0.0"),
  "packages/backend/node_modules/b": pkg("b", "2.0.0"),
});
check(
  "installed entries skip the root, workspaces and links",
  L.installedEntries(ws).map(([k]) => k),
  [nm("a"), "packages/backend/node_modules/b"],
);
check(
  "nameOf takes the last node_modules segment",
  L.nameOf("node_modules/a/node_modules/@s/b"),
  "@s/b",
);
check("licenceOf reads SPDX text", L.licenceOf({ license: "MIT" }), "MIT");
check(
  "licenceOf reads the legacy object form",
  L.licenceOf({ license: { type: "ISC" } }),
  "ISC",
);
check("licenceOf answers null when none is recorded", L.licenceOf({}), null);

check(
  "versions order numerically, not as text",
  ["1.10.0", "1.9.0", "1.2.3"].sort(L.compareVersions),
  ["1.2.3", "1.9.0", "1.10.0"],
);
check(
  "a release sorts above its prereleases",
  ["1.0.0", "1.0.0-rc.2", "1.0.0-rc.10"].sort(L.compareVersions),
  ["1.0.0-rc.2", "1.0.0-rc.10", "1.0.0"],
);
check(
  "build metadata is ignored",
  L.compareVersions("1.0.0+build.5", "1.0.0"),
  0,
);

const many = L.collectPackages(
  lock({
    [nm("a")]: pkg("a", "2.0.0"),
    [nm("b/node_modules/a")]: pkg("a", "1.0.0", { dev: true }),
    [nm("d")]: pkg("d", "1.0.0", { dev: true }),
    [nm("o")]: pkg("o", "1.0.0", { optional: true, hasInstallScript: true }),
  }),
);
check(
  "a name collects every installed version, sorted",
  many.get("a").versions,
  ["1.0.0", "2.0.0"],
);
check(
  "a name is runtime when any install is runtime",
  many.get("a").dev,
  false,
);
check("a name is dev only when every install is dev", many.get("d").dev, true);
check(
  "optional is reported for runtime packages",
  many.get("o").optional,
  true,
);
check("install scripts are collected", many.get("o").installScript, true);

const base1 = L.collectPackages(
  lock({
    [nm("a")]: pkg("a", "1.0.0"),
    [nm("gone")]: pkg("gone", "1.0.0"),
    [nm("down")]: pkg("down", "2.0.0"),
    [nm("same")]: pkg("same", "1.0.0"),
    [nm("dup")]: pkg("dup", "1.0.0"),
    [nm("x/node_modules/dup")]: pkg("dup", "2.0.0"),
  }),
);
const head1 = L.collectPackages(
  lock({
    [nm("a")]: pkg("a", "1.1.0"),
    [nm("new")]: pkg("new", "0.1.0", { dev: true }),
    [nm("down")]: pkg("down", "1.5.0"),
    [nm("y/node_modules/same")]: pkg("same", "1.0.0"),
    [nm("dup")]: pkg("dup", "2.0.0"),
  }),
);
const d1 = L.diffPackages(base1, head1);
check(
  "added names",
  d1.added.map((p) => p.name),
  ["new"],
);
check(
  "removed names",
  d1.removed.map((p) => p.name),
  ["gone"],
);
check(
  "updated names, with from, to and downgrade",
  d1.updated.map((p) => [p.name, p.from, p.to, p.downgrade]),
  [
    ["a", ["1.0.0"], ["1.1.0"], false],
    ["down", ["2.0.0"], ["1.5.0"], true],
    ["dup", ["1.0.0", "2.0.0"], ["2.0.0"], false],
  ],
);
check(
  "a hoisting move is not a change",
  d1.updated.some((p) => p.name === "same"),
  false,
);
const d1b = L.diffPackages(
  L.collectPackages(
    lock({
      [nm("agent")]: pkg("agent", "6.0.2"),
      [nm("x/node_modules/agent")]: pkg("agent", "7.1.4"),
      [nm("mid")]: pkg("mid", "1.0.0"),
      [nm("y/node_modules/mid")]: pkg("mid", "3.0.0"),
    }),
  ),
  L.collectPackages(
    lock({
      [nm("agent")]: pkg("agent", "6.0.2"),
      [nm("mid")]: pkg("mid", "1.0.0"),
      [nm("y/node_modules/mid")]: pkg("mid", "2.0.0"),
    }),
  ),
);
check(
  "losing the newer copy is an update, not a downgrade",
  d1b.updated.map((p) => [p.name, p.downgrade]),
  [
    ["agent", false],
    ["mid", true],
  ],
);
const d1c = L.diffPackages(
  L.collectPackages(
    lock({
      [nm("brace")]: pkg("brace", "1.1.18"),
      [nm("c/node_modules/brace")]: pkg("brace", "5.0.9"),
    }),
  ),
  L.collectPackages(
    lock({
      [nm("brace")]: pkg("brace", "1.1.21"),
      [nm("c/node_modules/brace")]: pkg("brace", "5.0.12"),
    }),
  ),
);
check(
  "every copy going up on several major lines is no downgrade",
  d1c.updated.map((p) => [p.name, p.downgrade]),
  [["brace", false]],
);
const d1d = L.diffPackages(
  L.collectPackages(
    lock({
      [nm("tf")]: pkg("tf", "5.9.0"),
      [nm("j/node_modules/tf")]: pkg("tf", "0.21.3"),
    }),
  ),
  L.collectPackages(
    lock({
      [nm("tf")]: pkg("tf", "0.21.3"),
      [nm("m/node_modules/tf")]: pkg("tf", "5.10.0"),
    }),
  ),
);
check(
  "hoisting an existing older copy to the root is no downgrade",
  d1d.updated.map((p) => [p.name, p.downgrade]),
  [["tf", false]],
);

// ── Task 2: blocking rules, licences, install scripts ───────────────────────

const bad = lock({
  [nm("ok")]: pkg("ok", "1.0.0"),
  [nm("git")]: pkg("git", "1.0.0", {
    resolved: "git+ssh://git@github.com/x/git.git#abc",
  }),
  [nm("tarball")]: pkg("tarball", "1.0.0", {
    resolved: "https://evil.example/tarball-1.0.0.tgz",
  }),
  [nm("lookalike")]: pkg("lookalike", "1.0.0", {
    resolved: "https://registry.npmjs.org.evil.example/l-1.0.0.tgz",
  }),
  [nm("noresolved")]: pkg("noresolved", "1.0.0", { resolved: undefined }),
  [nm("nohash")]: pkg("nohash", "1.0.0", { integrity: undefined }),
  [nm("ok/node_modules/bundled")]: {
    version: "1.0.0",
    inBundle: true,
    license: "MIT",
  },
  "packages/w": { name: "w", version: "1.0.0" },
  [nm("w")]: { resolved: "packages/w", link: true },
});
check(
  "blocking findings name each rule and package; bundles, workspaces and links pass",
  L.blockingFindings(bad).map((f) => `${f.rule} ${f.key}`),
  [
    "origin node_modules/git",
    "origin node_modules/tarball",
    "origin node_modules/lookalike",
    "origin node_modules/noresolved",
    "integrity node_modules/nohash",
  ],
);

const allow = new Set(["MIT", "Apache-2.0", "CC0-1.0"]);
check("a plain allowed id", L.licenceAllowed("MIT", allow), true);
check(
  "OR is allowed when either side is",
  L.licenceAllowed("(MIT OR GPL-3.0-or-later)", allow),
  true,
);
check("AND needs both sides", L.licenceAllowed("(MIT AND Zlib)", allow), false);
check(
  "AND binds tighter than OR",
  L.licenceAllowed("GPL-2.0 OR MIT AND CC0-1.0", allow),
  true,
);
check(
  "a custom licence is not allowed",
  L.licenceAllowed("SEE LICENSE IN LICENSE", allow),
  false,
);
check("no licence is not allowed", L.licenceAllowed(null, allow), false);

const base2 = L.collectPackages(
  lock({
    [nm("relicensed")]: pkg("relicensed", "1.0.0"),
    [nm("script")]: pkg("script", "1.0.0"),
    [nm("kept")]: pkg("kept", "1.0.0", { hasInstallScript: true }),
  }),
);
const head2 = L.collectPackages(
  lock({
    [nm("relicensed")]: pkg("relicensed", "1.1.0", { license: "BUSL-1.1" }),
    [nm("script")]: pkg("script", "1.0.1", { hasInstallScript: true }),
    [nm("kept")]: pkg("kept", "1.0.1", { hasInstallScript: true }),
    [nm("mpl")]: pkg("mpl", "1.0.0", { license: "MPL-2.0" }),
    [nm("legacy")]: pkg("legacy", "1.0.0", { license: { type: "MIT" } }),
    [nm("unlicensed")]: pkg("unlicensed", "1.0.0", {
      license: undefined,
      hasInstallScript: true,
    }),
  }),
);
const r2 = L.reviewFindings(base2, head2, L.diffPackages(base2, head2), allow);
check(
  "licence changes",
  r2.licenceChanges.map((c) => [c.name, c.from, c.to]),
  [["relicensed", ["MIT"], ["BUSL-1.1"]]],
);
const lost = (licences) =>
  L.collectPackages(
    lock(
      Object.fromEntries(
        licences.map((l, i) => [
          nm(`${"z/node_modules/".repeat(i)}mp`),
          pkg("mp", `1.${i}.0`, { license: l }),
        ]),
      ),
    ),
  );
const baseLost = lost(["BlueOak-1.0.0", "ISC"]);
const headLost = lost(["BlueOak-1.0.0"]);
check(
  "losing a licence with a removed copy is not a change",
  L.reviewFindings(
    baseLost,
    headLost,
    L.diffPackages(baseLost, headLost),
    allow,
  ).licenceChanges,
  [],
);
check(
  "new packages off the allow-list, including none recorded",
  r2.licenceNotAllowed.map((p) => p.name),
  ["mpl", "unlicensed"],
);
check(
  "install scripts: newly added, or on a new package; not an existing one",
  r2.installScripts.map((p) => [p.name, p.isNew]),
  [
    ["script", false],
    ["unlicensed", true],
  ],
);

check(
  "config yields the allow-list",
  [...L.parseConfig('{"allowLicenses":["MIT"]}', "cfg").allow],
  ["MIT"],
);
throws(
  "config without allowLicenses is refused",
  () => L.parseConfig("{}", "cfg"),
  L.InputError,
  /allowLicenses/,
);
throws(
  "config that is not JSON is refused",
  () => L.parseConfig("{", "cfg"),
  L.InputError,
  /not valid JSON/,
);

// ── Task 3: report, annotations, command line ───────────────────────────────

// d1 (Task 1) carries the downgrade; r2 (Task 2) carries the licence findings.
const review3 = { ...r2, downgrades: d1.updated.filter((u) => u.downgrade) };
const rep = L.renderReport({
  blocking: L.blockingFindings(bad),
  diff: d1,
  review: review3,
});
check("the report starts with the marker", rep.startsWith(L.MARKER), true);
check(
  "a blocking report says the check fails",
  /\*\*✗ 5 blocking findings\*\* — the check fails/.test(rep),
  true,
);
check("blocking findings are listed", rep.includes("`node_modules/git`"), true);
check(
  "downgrades are called out",
  rep.includes("#### Downgrades") && rep.includes("`down`"),
  true,
);
check("new licences off the list are called out", rep.includes("`mpl`"), true);
check(
  "the change lists sit in collapsible sections",
  rep.includes("<details>"),
  true,
);
const empty = { added: [], removed: [], updated: [] };
const none = {
  licenceChanges: [],
  licenceNotAllowed: [],
  installScripts: [],
  downgrades: [],
};
const clean = L.renderReport({ blocking: [], diff: empty, review: none });
check("a clean report says so", clean.includes("✓ No blocking findings"), true);

const long = `${L.MARKER}\n${"- a line of a long report\n".repeat(5000)}`;
const cut = L.truncateForComment(long);
check(
  "a long report is cut to fit a comment",
  cut.length <= L.COMMENT_LIMIT,
  true,
);
check("the cut says where the rest is", cut.includes("job summary"), true);
check("a short report is left alone", L.truncateForComment("short"), "short");

check(
  "annotations escape newlines and percent signs",
  L.annotations([{ rule: "origin", key: "node_modules/x", detail: "a%b\nc" }]),
  ["::error title=lockfile-review origin::node_modules/x: a%25b%0Ac"],
);

const dir = mkdtempSync(join(tmpdir(), "lockfile-diff-"));
const write = (name, data) => {
  const p = join(dir, name);
  writeFileSync(p, typeof data === "string" ? data : JSON.stringify(data));
  return p;
};
const run = (...args) => {
  try {
    execFileSync(process.execPath, [SCRIPT, ...args], {
      stdio: "pipe",
      env: { ...process.env, GITHUB_ACTIONS: "" },
    });
    return 0;
  } catch (err) {
    return err.status;
  }
};
const cfg = write("cfg.json", { allowLicenses: ["MIT"] });
const okBase = write("base.json", lock({ [nm("a")]: pkg("a", "1.0.0") }));
const okHead = write("head.json", lock({ [nm("a")]: pkg("a", "1.0.1") }));
const outFile = join(dir, "out.md");
const commentFile = join(dir, "comment.md");
check(
  "exit 0 when nothing blocks",
  run(
    okBase,
    okHead,
    "--config",
    cfg,
    "--out",
    outFile,
    "--comment",
    commentFile,
  ),
  0,
);
check(
  "--out holds the report",
  readFileSync(outFile, "utf8").startsWith(L.MARKER),
  true,
);
check("--comment holds the comment", existsSync(commentFile), true);
check(
  "exit 1 on a blocking finding",
  run(okBase, write("bad.json", bad), "--config", cfg, "--out", outFile),
  1,
);
check(
  "exit 2 on a lockfile with conflict markers",
  run(okBase, write("broken.json", "<<<<<<< HEAD\n{}"), "--config", cfg),
  2,
);
check(
  "exit 2 on lockfileVersion 2",
  run(
    okBase,
    write("v2.json", { lockfileVersion: 2, packages: {} }),
    "--config",
    cfg,
  ),
  2,
);
check(
  "exit 2 without a config",
  run(okBase, okHead, "--config", join(dir, "missing.json")),
  2,
);
check("exit 2 on wrong arguments", run(okBase), 2);

// ── Final review fixes ───────────────────────────────────────────────────────

// #2: npm moved the root to the other major line while every copy went up.
const d2 = L.diffPackages(
  L.collectPackages(
    lock({
      [nm("be")]: pkg("be", "2.0.1"),
      [nm("a/node_modules/be")]: pkg("be", "1.1.11"),
    }),
  ),
  L.collectPackages(
    lock({
      [nm("be")]: pkg("be", "1.1.12"),
      [nm("c/node_modules/be")]: pkg("be", "2.0.2"),
    }),
  ),
);
check(
  "a re-hoist across major lines, every copy up, is no downgrade",
  d2.updated.map((p) => [p.name, p.downgrade]),
  [["be", false]],
);
const d2b = L.diffPackages(
  L.collectPackages(
    lock({
      [nm("ln")]: pkg("ln", "1.4.0"),
      [nm("q/node_modules/ln")]: pkg("ln", "3.0.0"),
    }),
  ),
  L.collectPackages(
    lock({
      [nm("ln")]: pkg("ln", "3.0.0"),
      [nm("r/node_modules/ln")]: pkg("ln", "1.2.0"),
    }),
  ),
);
check(
  "a new copy below every base copy on its own line is a downgrade",
  d2b.updated.map((p) => [p.name, p.downgrade]),
  [["ln", true]],
);

// #3: the cut must not leave the note inside a collapsed <details>.
const longDetails =
  `${L.MARKER}\n### Lockfile review\n\n<details>\n<summary>Updated</summary>\n\n` +
  "- `pkg` `1.0.0` → `1.0.1` — dev\n".repeat(5000) +
  "\n</details>\n";
const cutDetails = L.truncateForComment(longDetails);
check(
  "a cut report closes every <details> it opened",
  (cutDetails.match(/<details>/g) ?? []).length,
  (cutDetails.match(/<\/details>/g) ?? []).length,
);
check(
  "the cut note comes after the last </details>",
  cutDetails.lastIndexOf("job summary") > cutDetails.lastIndexOf("</details>"),
  true,
);
check(
  "a cut report with a closed <details> still fits",
  cutDetails.length <= L.COMMENT_LIMIT,
  true,
);

// #6: registry text must not escape its code span or add lines.
const spoof = L.renderReport({
  blocking: [],
  diff: {
    added: [
      {
        name: "evil",
        versions: ["1.0.0"],
        dev: false,
        optional: false,
        licences: ["MIT`\n\n**✓ Reviewed and approved**"],
      },
    ],
    removed: [],
    updated: [],
  },
  review: {
    licenceChanges: [],
    licenceNotAllowed: [
      {
        name: "evil",
        licences: ["MIT`\n\n**✓ Reviewed and approved**"],
        dev: false,
      },
    ],
    installScripts: [],
    downgrades: [],
  },
});
check(
  "registry text cannot start a line of its own in the comment",
  spoof.split("\n").some((l) => l.startsWith("**✓ Reviewed")),
  false,
);
check(
  "registry text cannot close its code span",
  spoof.includes("MIT`"),
  false,
);
check(
  "a foreign origin is shown inside a code span",
  L.renderReport({
    blocking: L.blockingFindings(
      lock({
        [nm("x")]: pkg("x", "1.0.0", {
          resolved: "https://e.example/x.tgz`\n**✓ fine**",
        }),
      }),
    ),
    diff: { added: [], removed: [], updated: [] },
    review: {
      licenceChanges: [],
      licenceNotAllowed: [],
      installScripts: [],
      downgrades: [],
    },
  }).includes("`https://e.example/x.tgz' **✓ fine**`"),
  true,
);

// #1: unusable input still writes a marked report, so the comment never says ✓.
const failOut = join(dir, "fail.md");
const failComment = join(dir, "fail-comment.md");
check(
  "exit 2 still writes the report",
  run(
    okBase,
    write("conflict.json", "<<<<<<< HEAD\n{}"),
    "--config",
    cfg,
    "--out",
    failOut,
    "--comment",
    failComment,
  ),
  2,
);
const failText = existsSync(failComment)
  ? readFileSync(failComment, "utf8")
  : "";
check(
  "the failure report carries the marker",
  failText.startsWith(L.MARKER),
  true,
);
check(
  "the failure report says the review could not run",
  /could not run/.test(failText) && /conflict\.json/.test(failText),
  true,
);
check(
  "the failure report never claims a clean result",
  failText.includes("No blocking findings"),
  false,
);

// ── summary (later tasks insert their checks ABOVE this line) ───────────────
if (failures.length) {
  console.error(
    `FAIL: ${failures.length} of ${passed + failures.length} checks\n`,
  );
  for (const f of failures) console.error(`  ✗ ${f}\n`);
  process.exit(1);
}
console.log(`PASS: ${passed} checks`);
