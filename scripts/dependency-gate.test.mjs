// Tests for dependency-gate.mjs; network calls go to a fake fetch. Self-contained, like
// lockfile-diff.test.mjs: no runner, prints a PASS count, exits 1 on failure.
import { InputError } from "./lockfile-diff.mjs";
import * as G from "./dependency-gate.mjs";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

let passed = 0;
const failures = [];
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed += 1;
  else failures.push(`${label}\n    expected ${e}\n    actual   ${a}`);
}
function ok(label, condition) {
  check(label, Boolean(condition), true);
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

const NOW = new Date("2026-11-27T12:00:00Z");
const W = (s) => `${s} and enough words to make a sentence of substance.`;
function entry(extra = {}) {
  return {
    name: "left-pad",
    manifest: "packages/backend",
    field: "dependencies",
    added: { date: "2026-11-12", pr: 331 },
    assessed: { date: "2026-11-27", version: "3.2.2" },
    criteria: {
      maintained: { holds: true },
      maintainers: { holds: true },
      licence: { holds: true },
      releasePolicy: { holds: true },
      footprint: { holds: true },
      needed: { holds: true, why: W("Needed for padding") },
    },
    outcome: "keep",
    status: "assessed",
    ...extra,
  };
}
const dep = {
  name: "left-pad",
  manifest: "packages/backend",
  field: "dependencies",
};
const clean = {
  maintained: null,
  maintainers: null,
  licence: null,
  footprint: null,
  fatal: null,
};
// Issue 7 is open, 8 is a pull request, anything else is closed.
const ctx = (extra = {}) => ({
  renovateSecurity: false,
  issueState: (n) => (n === 7 ? "open" : n === 8 ? "pull request" : "closed"),
  ...extra,
});
const gate = (e, signals = clean, locked = "3.2.5", c = ctx()) =>
  G.evaluateNewDependency(dep, e, signals, locked, c);
const text = (list) => list.join(" | ");

// --- parseRegister
const doc = (deps, extra = {}) =>
  JSON.stringify({ dependencies: deps, cooldownOverrides: [], ...extra });
const parsed = G.parseRegister(doc([entry()]), "register");
check("register: valid entry parses", parsed.dependencies[0].name, "left-pad");
check("register: cooldownOverrides kept", parsed.cooldownOverrides, []);
throws(
  "register: duplicate (name, manifest)",
  () => G.parseRegister(doc([entry(), entry()]), "register"),
  InputError,
  /duplicate/,
);
throws(
  "register: replace without followUp",
  () => G.parseRegister(doc([entry({ outcome: "replace" })]), "register"),
  InputError,
  /followUp/,
);
throws(
  "register: malformed JSON",
  () => G.parseRegister("{nope", "register"),
  InputError,
  /register/,
);
throws(
  "register: bad status names entry",
  () => G.parseRegister(doc([entry({ status: "maybe" })]), "register"),
  InputError,
  /left-pad.*status/,
);
throws(
  "register: override without issue",
  () =>
    G.parseRegister(
      doc([entry({ status: "override", override: { reason: "x" } })]),
      "register",
    ),
  InputError,
  /override\.issue/,
);
throws(
  "register: cooldown override without issue",
  () =>
    G.parseRegister(
      doc([], {
        cooldownOverrides: [{ package: "a", version: "1.0.0", reason: "r" }],
      }),
      "register",
    ),
  InputError,
  /cooldownOverrides/,
);

// --- signalsFor
const goodEv = {
  lastRelease: "2026-10-01T00:00:00Z",
  maintainers: 3,
  licence: "MIT",
  deprecated: null,
  archived: false,
  orgOwned: true,
};
const allow = new Set(["MIT"]);
check("signals: clean", G.signalsFor(goodEv, [], NOW, allow), clean);
check(
  "signals: stale release",
  G.signalsFor(
    { ...goodEv, lastRelease: "2025-01-01T00:00:00Z" },
    [],
    NOW,
    allow,
  ).maintained !== null,
  true,
);
check(
  "signals: no release recorded",
  G.signalsFor({ ...goodEv, lastRelease: null }, [], NOW, allow).maintained !==
    null,
  true,
);
check(
  "signals: one maintainer, no org",
  G.signalsFor({ ...goodEv, maintainers: 1, orgOwned: false }, [], NOW, allow)
    .maintainers,
  "one maintainer, no organisation",
);
check(
  "signals: licence off the list",
  /GPL/.test(
    G.signalsFor({ ...goodEv, licence: "GPL-3.0" }, [], NOW, allow).licence,
  ),
  true,
);
check(
  "signals: install script",
  G.signalsFor(goodEv, ["esbuild@0.28.2"], NOW, allow).footprint,
  "install script in `esbuild@0.28.2`",
);
check(
  "signals: repository not checked reads as not maintained",
  G.signalsFor({ ...goodEv, archived: null }, [], NOW, allow).maintained,
  "repository not checked",
);
check(
  "signals: repository not found is named",
  G.signalsFor(
    { ...goodEv, archived: null, repoNote: "repository not found" },
    [],
    NOW,
    allow,
  ).maintained,
  "repository not checked (repository not found)",
);
check(
  "signals: one maintainer, owner not checked",
  G.signalsFor({ ...goodEv, maintainers: 1, orgOwned: null }, [], NOW, allow)
    .maintainers,
  "one maintainer, organisation not checked",
);
check(
  "signals: deprecated is fatal",
  /deprecated/.test(
    G.signalsFor({ ...goodEv, deprecated: "use x" }, [], NOW, allow).fatal,
  ),
  true,
);
check(
  "signals: archived is fatal",
  /archived/.test(
    G.signalsFor({ ...goodEv, archived: true }, [], NOW, allow).fatal,
  ),
  true,
);

// --- evaluateNewDependency
let r = gate(undefined);
ok(
  "gate: missing entry",
  /no entry in dependency-register.json/.test(text(r.blocking)),
);
check("gate: clean entry passes", gate(entry()), {
  blocking: [],
  warnings: [],
});
const lone = { ...clean, maintainers: "one maintainer, no organisation" };
r = gate(entry(), lone);
ok(
  "gate: holds true against a failing signal",
  /maintainers/.test(text(r.blocking)),
);
check("gate: contradiction counts once", r.blocking.length, 1);
r = gate(
  entry({
    criteria: {
      ...entry().criteria,
      maintainers: { holds: false, why: W("Sole author") },
    },
  }),
  lone,
);
check("gate: holds false with why on failing signal", r.blocking, []);
let e = entry();
e.criteria.needed = { holds: true };
ok("gate: needed without why", /needed/.test(text(gate(e).blocking)));
e = entry();
e.criteria.needed = { holds: true, why: "x".repeat(39) };
ok("gate: why of 39 chars", /needed/.test(text(gate(e).blocking)));
e = entry();
e.criteria.needed = { holds: true, why: "x".repeat(40) };
check("gate: why of 40 chars", gate(e).blocking, []);
e = entry();
e.criteria.maintained = { holds: false, why: W("Same words") };
e.criteria.needed = { holds: true, why: W("Same words") };
ok("gate: two identical whys", /identical/.test(text(gate(e).blocking)));
e = entry();
e.criteria.licence = { holds: false };
ok("gate: holds false without why", /licence/.test(text(gate(e).blocking)));
const dead = {
  ...clean,
  maintained: "deprecated: use x",
  fatal: "deprecated: use x",
};
const unmaintained = (extra = {}) =>
  entry({
    criteria: {
      ...entry().criteria,
      maintained: { holds: false, why: W("Deprecated upstream") },
    },
    ...extra,
  });
ok("gate: deprecated + keep", gate(entry(), dead).blocking.length > 0);
check(
  "gate: deprecated + replace + open followUp",
  gate(unmaintained({ outcome: "replace", followUp: 7 }), dead).blocking,
  [],
);
ok(
  "gate: deprecated + replace + open followUp + maintained holds",
  /maintained/.test(
    text(gate(entry({ outcome: "replace", followUp: 7 }), dead).blocking),
  ),
);
ok(
  "gate: deprecated + keep + open followUp still blocks",
  gate(unmaintained({ followUp: 7 }), dead).blocking.length > 0,
);
ok(
  "gate: followUp on keep must be open",
  /#9 is not open/.test(text(gate(entry({ followUp: 9 })).blocking)),
);
check(
  "gate: followUp on keep, open",
  gate(entry({ followUp: 7 })).blocking,
  [],
);
throws(
  "register: followUp on keep must be an integer",
  () => G.parseRegister(doc([entry({ followUp: "x" })]), "register"),
  InputError,
  /followUp/,
);
throws(
  "register: empty assessed.version",
  () =>
    G.parseRegister(
      doc([entry({ assessed: { date: "2026-11-27", version: "" } })]),
      "register",
    ),
  InputError,
  /assessed.version/,
);
const noEv = G.signalsFor({}, [], NOW, allow);
ok(
  "signals: empty evidence sets maintained, maintainers, licence",
  noEv.maintained && noEv.maintainers && noEv.licence,
);
ok(
  "signals: null evidence sets maintainers",
  G.signalsFor(null, [], NOW, allow).maintainers,
);
ok(
  "signals: deprecated feeds maintained",
  G.signalsFor({ ...goodEv, deprecated: "use x" }, [], NOW, allow).maintained,
);
const hostile = "<!-- lockfile-review --> [click](http://evil)";
const hs = G.signalsFor({ ...goodEv, deprecated: hostile }, [], NOW, allow);
ok(
  "render: registry text sits in a code span",
  G.renderGate({
    rows: [
      { name: "a", manifest: "(root)", blocking: [hs.fatal], warnings: [] },
    ],
    cooldown: { blocking: [], exceptions: [] },
    renovateSecurity: false,
  }).includes("`" + hostile + "`"),
);
ok(
  "gate: deprecated + replace + closed followUp",
  /#9 is not open/.test(
    text(gate(entry({ outcome: "replace", followUp: 9 }), dead).blocking),
  ),
);
ok(
  "gate: replace with closed followUp, no signal",
  /#9 is not open/.test(
    text(gate(entry({ outcome: "replace", followUp: 9 })).blocking),
  ),
);
ok(
  "gate: assessed major differs",
  /major/.test(text(gate(entry(), clean, "4.1.0").blocking)),
);
check(
  "gate: same major, other minor",
  gate(entry(), clean, "3.9.0").blocking,
  [],
);
const ovr = entry({
  status: "override",
  override: { reason: "urgent fix", issue: 7 },
  criteria: undefined,
});
r = gate(ovr);
check("gate: override with open issue", r.blocking, []);
check("gate: override warns once", r.warnings.length, 1);
ok("gate: override warning names it", /override/.test(r.warnings[0]));
r = gate({ ...ovr, override: { reason: "urgent fix", issue: 9 } });
ok("gate: override with closed issue", /#9 is not open/.test(text(r.blocking)));
r = gate({ ...ovr, override: { reason: "urgent fix", issue: 8 } });
ok(
  "gate: an override citing a pull request blocks",
  /#8 is a pull request, not an issue/.test(text(r.blocking)),
);
ok(
  "gate: a followUp citing a pull request blocks",
  /#8 is a pull request, not an issue/.test(
    text(gate(entry({ followUp: 8 })).blocking),
  ),
);
ok(
  "gate: missing entry names package and manifest in code spans",
  /`left-pad` in `packages\/backend`/.test(text(gate(undefined).blocking)),
);
r = gate({ ...ovr, assessed: { date: "2026-11-27", version: "2.0.0" } });
ok("gate: override still checks major", /major/.test(text(r.blocking)));
r = gate(undefined, clean, "3.2.5", ctx({ renovateSecurity: true }));
check("gate: renovate security, no entry", r.blocking, []);
ok("gate: renovate security warns", /still to assess/.test(text(r.warnings)));
e = entry();
e.criteria.needed = { holds: true };
r = gate(e, clean, "3.2.5", ctx({ renovateSecurity: true }));
ok("gate: renovate security, entry still checked", r.blocking.length > 0);

// --- evaluateCooldown
const day = 86400000;
const iso = (ms) => new Date(NOW.getTime() - ms).toISOString();
const changed = [{ name: "foo", version: "1.2.3" }];
function cd(ms, overrides = [], c = ctx(), entries = [["foo@1.2.3", iso(ms)]]) {
  return G.evaluateCooldown(changed, new Map(entries), NOW, 14, overrides, c);
}
let c = cd(13 * day);
ok(
  "cooldown: 13-day-old blocks",
  c.blocking.length === 1 && /foo/.test(c.blocking[0]),
);
check("cooldown: 14-day-old is clean", cd(14 * day), {
  blocking: [],
  exceptions: [],
});
c = cd(13 * day, [], ctx({ renovateSecurity: true }));
check("cooldown: renovate security does not block", c.blocking, []);
check("cooldown: renovate security one exception", c.exceptions.length, 1);
check(
  "cooldown: exception detail",
  [
    c.exceptions[0].name,
    c.exceptions[0].version,
    c.exceptions[0].published,
    c.exceptions[0].ageDays,
  ],
  ["foo", "1.2.3", iso(13 * day).slice(0, 10), 13],
);
const co = [{ package: "foo", version: "1.2.3", reason: "r", issue: 7 }];
c = cd(2 * day, co);
check("cooldown: override with open issue", c.blocking, []);
check("cooldown: override lists the issue", c.exceptions[0].issue, 7);
c = cd(2 * day, [{ ...co[0], issue: 9 }]);
ok("cooldown: override with closed issue blocks", c.blocking.length === 1);
c = cd(2 * day, [{ ...co[0], issue: 8 }]);
ok(
  "cooldown: override citing a pull request blocks",
  /#8 is a pull request, not an issue/.test(c.blocking[0]),
);
ok(
  "cooldown: names and versions sit in code spans",
  c.blocking[0].startsWith("`foo` `1.2.3`"),
);
c = cd(0, [], ctx(), []);
ok("cooldown: no publish time blocks", /no publish time/.test(c.blocking[0]));

// --- renderGate
const out = G.renderGate({
  rows: [
    {
      name: "we`ird\nname",
      manifest: "(root)",
      field: "dependencies",
      blocking: ["no entry in dependency-register.json"],
      warnings: [],
    },
  ],
  cooldown: {
    blocking: [],
    exceptions: [
      { name: "foo", version: "1.2.3", published: "2026-11-20", ageDays: 7 },
    ],
  },
  renovateSecurity: true,
});
ok("render: heading", out.startsWith("#### Dependency gate"));
ok(
  "render: names are code-escaped",
  out.includes("`we'ird name`") && !out.includes("we`ird"),
);
ok(
  "render: blocking reason shown",
  out.includes("no entry in dependency-register.json"),
);
ok(
  "render: cooldown exceptions section",
  /Cooldown exceptions/.test(out) && out.includes("`foo`"),
);

// ── evidence gathering helpers ─────────────────────────────────────────────

check(
  "scoped name is %2f-encoded",
  G.packumentUrl("@axe-core/playwright"),
  "https://registry.npmjs.org/@axe-core%2fplaywright",
);
check(
  "plain name url",
  G.packumentUrl("left-pad"),
  "https://registry.npmjs.org/left-pad",
);

const reg = (n, v, extra = {}) => ({
  version: v,
  resolved: `https://registry.npmjs.org/${n}/-/${n}-${v}.tgz`,
  integrity: "sha512-x",
  ...extra,
});
const lock = (pkgs) => ({ lockfileVersion: 3, packages: { "": {}, ...pkgs } });
{
  const base = lock({
    "node_modules/a": reg("a", "1.0.0"),
    "node_modules/b": reg("b", "1.0.0"),
  });
  const head = lock({
    "node_modules/a": reg("a", "1.1.0"),
    "node_modules/b": reg("b", "1.0.0"),
    "node_modules/c": reg("c", "2.0.0"),
    "node_modules/x/node_modules/a": reg("a", "1.0.0"),
    "node_modules/ws": {
      version: "1.0.0",
      link: true,
      resolved: "packages/ws",
    },
    "node_modules/bund": reg("bund", "1.0.0", { inBundle: true }),
    "node_modules/gitdep": {
      version: "1.0.0",
      resolved: "git+ssh://git@github.com/o/r.git#abc",
    },
  });
  check(
    "changedVersions skips link/inBundle/non-registry entries",
    G.changedVersions(base, head),
    [
      { name: "a", version: "1.1.0" },
      { name: "c", version: "2.0.0" },
    ],
  );
}

const byBot = [
  {
    event: "labeled",
    label: { name: "security" },
    actor: { login: "renovate[bot]" },
  },
];
const byPerson = [
  {
    event: "labeled",
    label: { name: "security" },
    actor: { login: "someone" },
  },
];
check(
  "isRenovateSecurity: author, label and the bot's labeled event",
  G.isRenovateSecurity("renovate[bot]", ["security"], byBot),
  true,
);
check(
  "isRenovateSecurity: label set by a person",
  G.isRenovateSecurity("renovate[bot]", ["security"], byPerson),
  false,
);
check(
  "isRenovateSecurity: label since removed",
  G.isRenovateSecurity("renovate[bot]", [], byBot),
  false,
);
check(
  "isRenovateSecurity: another author",
  G.isRenovateSecurity("someone", ["security"], byBot),
  false,
);

// A fake registry and GitHub: url (without its query) → body, or a number
// for an HTTP status. Anything not listed answers 404.
function fakeFetch(routes, seen = []) {
  return async (url) => {
    seen.push(url);
    const body = routes[url.split("?")[0]] ?? 404;
    if (typeof body === "number") {
      return { ok: false, status: body, json: async () => ({}) };
    }
    return { ok: true, status: 200, json: async () => body };
  };
}
const noSleep = async () => {};
const PR = "https://api.github.com/repos/o/r/issues/42";
const renovateEnv = {
  PR_AUTHOR: "renovate[bot]",
  PR_NUMBER: "42",
  GITHUB_REPOSITORY: "o/r",
};
{
  // The event payload had no label (Renovate labels after creating the pull
  // request); the API has it.
  const routes = {
    [`${PR}/labels`]: [{ name: "security" }, { name: "dependencies" }],
    [`${PR}/events`]: byBot,
  };
  check(
    "renovateSecurityOf: label on the PR via the API, set by Renovate",
    await G.renovateSecurityOf(renovateEnv, {
      fetchImpl: fakeFetch(routes),
      sleep: noSleep,
    }),
    true,
  );
  check(
    "renovateSecurityOf: label added by a person",
    await G.renovateSecurityOf(renovateEnv, {
      fetchImpl: fakeFetch({ ...routes, [`${PR}/events`]: byPerson }),
      sleep: noSleep,
    }),
    false,
  );
  const seen = [];
  check(
    "renovateSecurityOf: author not Renovate, no API call",
    [
      await G.renovateSecurityOf(
        { ...renovateEnv, PR_AUTHOR: "someone", PR_NUMBER: "" },
        { fetchImpl: fakeFetch(routes, seen), sleep: noSleep },
      ),
      seen.length,
    ],
    [false, 0],
  );
  // Events past the first page are read too.
  const page1 = Array.from({ length: 100 }, () => ({ event: "commented" }));
  const paged = async (url) => ({
    ok: true,
    status: 200,
    json: async () =>
      url.includes("/labels")
        ? [{ name: "security" }]
        : url.endsWith("page=1")
          ? page1
          : byBot,
  });
  check(
    "renovateSecurityOf: reads every page of events",
    await G.renovateSecurityOf(renovateEnv, {
      fetchImpl: paged,
      sleep: noSleep,
    }),
    true,
  );
  let err = null;
  await G.renovateSecurityOf(renovateEnv, {
    fetchImpl: fakeFetch({ [`${PR}/labels`]: 500 }),
    sleep: noSleep,
  }).catch((e) => (err = e));
  ok(
    "renovateSecurityOf: an API failure is an InputError",
    err instanceof InputError && /#42/.test(err.message),
  );
  err = null;
  await G.renovateSecurityOf({ ...renovateEnv, PR_NUMBER: "" }).catch(
    (e) => (err = e),
  );
  ok(
    "renovateSecurityOf: Renovate without PR_NUMBER is an InputError",
    err instanceof InputError && /PR_NUMBER/.test(err.message),
  );
  // Renovate labels the pull request a second or so after opening it: the
  // gate waits for a label instead of relying on a second run.
  let labelCalls = 0;
  const pauses = [];
  const late = async (url) => {
    const body = url.includes("/labels")
      ? ++labelCalls < 3
        ? []
        : [{ name: "dependencies" }, { name: "security" }]
      : byBot;
    return { ok: true, status: 200, json: async () => body };
  };
  check(
    "renovateSecurityOf: no label at first, then Renovate's → route on",
    await G.renovateSecurityOf(renovateEnv, {
      fetchImpl: late,
      sleep: async (ms) => {
        pauses.push(ms);
      },
    }),
    true,
  );
  check(
    "renovateSecurityOf: polled every 5 s until a label came",
    [labelCalls, pauses],
    [3, [5000, 5000]],
  );
  labelCalls = 0;
  pauses.length = 0;
  const never = async (url) => {
    if (url.includes("/labels")) labelCalls += 1;
    return { ok: true, status: 200, json: async () => [] };
  };
  err = null;
  const unlabelled = await G.renovateSecurityOf(renovateEnv, {
    fetchImpl: never,
    sleep: async (ms) => {
      pauses.push(ms);
    },
  }).catch((e) => (err = e));
  check(
    "renovateSecurityOf: never any label → route off, not exit 2",
    [unlabelled, err],
    [false, null],
  );
  check(
    "renovateSecurityOf: gives up after 60 s of 5 s polls",
    [labelCalls, pauses.reduce((a, b) => a + b, 0)],
    [13, 60000],
  );
}

// ── lockfile walking ───────────────────────────────────────────────────────
{
  // tsx-shaped: its own esbuild, with an install script, nested under it.
  const doc = lock({
    "packages/backend": { name: "backend", devDependencies: { tsx: "^4" } },
    "node_modules/tsx": reg("tsx", "4.23.15", {
      dependencies: { esbuild: "~0.28", "get-tsconfig": "^4" },
      optionalDependencies: { fsevents: "~2" },
    }),
    "node_modules/tsx/node_modules/esbuild": reg("esbuild", "0.28.2", {
      hasInstallScript: true,
      optionalDependencies: { "@esbuild/linux-x64": "0.28.2" },
    }),
    "node_modules/tsx/node_modules/@esbuild/linux-x64": reg(
      "@esbuild/linux-x64",
      "0.28.2",
    ),
    "node_modules/esbuild": reg("esbuild", "0.25.0", {
      hasInstallScript: true,
    }),
    "node_modules/get-tsconfig": reg("get-tsconfig", "4.8.0"),
    "node_modules/plain": reg("plain", "1.0.0", {
      dependencies: { "get-tsconfig": "^4" },
    }),
  });
  check(
    "installScriptsIn: tsx finds its own nested esbuild, not the root one",
    G.installScriptsIn(doc, "node_modules/tsx"),
    ["esbuild@0.28.2"],
  );
  // A plugin reaches an install script only through its host, a peer.
  const plugin = lock({
    "node_modules/plugin": reg("plugin", "1.0.0", {
      peerDependencies: { host: "^5" },
      peerDependenciesMeta: { host: { optional: true } },
    }),
    "node_modules/host": reg("host", "5.0.0", {
      dependencies: { esbuild: "^0.25" },
    }),
    "node_modules/esbuild": reg("esbuild", "0.25.0", {
      hasInstallScript: true,
    }),
  });
  check(
    "installScriptsIn: a peer (the host) is not followed",
    G.installScriptsIn(plugin, "node_modules/plugin"),
    [],
  );
  check(
    "signals: so a plugin gets no footprint signal",
    G.signalsFor(
      goodEv,
      G.installScriptsIn(plugin, "node_modules/plugin"),
      NOW,
      allow,
    ).footprint,
    null,
  );
  check(
    "installScriptsIn: none in a clean closure",
    G.installScriptsIn(doc, "node_modules/plain"),
    [],
  );
  check(
    "resolveFrom: nested first",
    G.resolveFrom(doc.packages, "node_modules/tsx", "esbuild"),
    "node_modules/tsx/node_modules/esbuild",
  );
  check(
    "resolveFrom: then up to the root",
    G.resolveFrom(
      doc.packages,
      "node_modules/tsx/node_modules/esbuild",
      "get-tsconfig",
    ),
    "node_modules/get-tsconfig",
  );
  check(
    "resolveFrom: from a workspace copy up to the root",
    G.resolveFrom(
      doc.packages,
      "packages/backend/node_modules/x",
      "get-tsconfig",
    ),
    "node_modules/get-tsconfig",
  );
  check(
    "resolveFrom: nothing to find",
    G.resolveFrom(doc.packages, "node_modules/tsx", "nope"),
    null,
  );
  const twice = lock({
    "node_modules/a": reg("a", "1.0.0"),
    "packages/web/node_modules/a": reg("a", "2.0.0"),
  });
  check(
    "lockEntryOf: the manifest's own copy first",
    G.lockEntryOf(twice, "a", "packages/web")[0],
    "packages/web/node_modules/a",
  );
  check(
    "lockEntryOf: then the hoisted one",
    G.lockEntryOf(twice, "a", "packages/api")[0],
    "node_modules/a",
  );
  check(
    "lockEntryOf: (root) is the hoisted one",
    G.lockEntryOf(twice, "a", "(root)")[1].version,
    "1.0.0",
  );
  check("lockEntryOf: none", G.lockEntryOf(twice, "zz", "(root)"), []);
}

// ── referencedIssues: only the entries in play ─────────────────────────────
{
  const register = {
    dependencies: [
      entry({ followUp: 11 }),
      entry({ name: "other", followUp: 12 }),
      entry({
        name: "ov",
        status: "override",
        override: { reason: "r", issue: 13 },
      }),
    ],
    cooldownOverrides: [
      { package: "foo", version: "1.2.3", reason: "r", issue: 14 },
      { package: "foo", version: "9.9.9", reason: "r", issue: 15 },
    ],
  };
  check(
    "referencedIssues: new deps evaluated and matched cooldown overrides",
    G.referencedIssues(
      register,
      [dep, { ...dep, name: "ov" }],
      [{ name: "foo", version: "1.2.3" }],
    ),
    [11, 13, 14],
  );
}

// ── gatherFacts with a fake fetch ──────────────────────────────────────────
const leftPad = {
  "dist-tags": { latest: "3.2.5" },
  time: { "3.2.5": "2026-10-01T00:00:00Z" },
  maintainers: [{ name: "a" }, { name: "b" }],
  license: "MIT",
  repository: { url: "git+https://github.com/pad/left-pad.git" },
  versions: { "3.2.5": {} },
};
{
  const facts = await G.gatherFacts({
    wanted: new Map([["left-pad", new Set(["3.2.5"])]]),
    changed: [],
    issues: [5, 6, 8],
    env: { GITHUB_REPOSITORY: "o/r" },
    opts: {
      fetchImpl: fakeFetch({
        "https://registry.npmjs.org/left-pad": leftPad,
        "https://api.github.com/repos/pad/left-pad": 404,
        "https://api.github.com/repos/o/r/issues/5": { state: "open" },
        "https://api.github.com/repos/o/r/issues/6": 410,
        "https://api.github.com/repos/o/r/issues/8": {
          state: "open",
          pull_request: {},
        },
      }),
      sleep: noSleep,
    },
  });
  check(
    "gatherFacts: a repository that is gone is evidence",
    facts.repos.get("pad/left-pad"),
    { notFound: true },
  );
  check(
    "gatherFacts: issue states (open, 410, pull request)",
    [5, 6, 8].map((n) => facts.issueStates.get(n)),
    ["open", "missing", "pull request"],
  );
  check(
    "gatherFacts: keeps the evidence and times, not the packument",
    [facts.evidence.get("left-pad@3.2.5").repo, facts.times.get("left-pad")],
    ["pad/left-pad", leftPad.time],
  );
  let err = null;
  await G.gatherFacts({
    wanted: new Map([["left-pad", new Set(["3.2.5"])]]),
    changed: [],
    issues: [],
    env: {},
    opts: {
      fetchImpl: fakeFetch({
        "https://registry.npmjs.org/left-pad": leftPad,
        "https://api.github.com/repos/pad/left-pad": 403,
      }),
      sleep: noSleep,
    },
  }).catch((e) => (err = e));
  ok(
    "gatherFacts: other GitHub errors stay exit 2",
    err instanceof InputError && /403/.test(err.message),
  );
}

// ── renderGate: evidence table, failure, combined comment ──────────────────
{
  const row = {
    name: "tsx",
    manifest: "packages/backend",
    field: "devDependencies",
    entry: entry({
      criteria: {
        ...entry().criteria,
        footprint: { holds: true, why: "a | pipe" },
      },
    }),
    evidence: {
      lockedVersion: "4.23.15",
      repo: "privatenumber/tsx",
      lastRelease: "2026-11-01T00:00:00Z",
      maintainers: 1,
      orgOwned: false,
      archived: false,
      licence: "MIT",
      deprecated: null,
      installScripts: ["esbuild@0.28.2"],
    },
    blocking: ["footprint: the entry says it holds, but install script in x"],
    warnings: [],
  };
  const md = G.renderGate({
    rows: [row],
    cooldown: { blocking: [], exceptions: [] },
    renovateSecurity: false,
  });
  ok("render: locked version shown", md.includes("Locked `4.23.15`"));
  ok(
    "render: evidence table row for footprint, pipe escaped",
    md.includes(
      "| footprint | install script in `esbuild@0.28.2` | holds: a \\| pipe | ✗ |",
    ),
  );
  ok(
    "render: maintainers evidence",
    md.includes(
      "| maintainers | 1 npm maintainer; repository owned by a user |",
    ),
  );
  ok(
    "render: maintained evidence",
    md.includes(
      "last release 2026-11-01; not deprecated; repository not archived",
    ),
  );
  ok(
    "render: licence evidence",
    md.includes("| licence | `MIT` | holds | ✓ |"),
  );
  const failure = G.renderGateFailure("registry x: boom");
  ok(
    "renderGateFailure: its own section, no marker",
    failure.startsWith("#### Dependency gate") &&
      !failure.includes("<!-- lockfile-review -->") &&
      !failure.includes("### Lockfile review") &&
      failure.includes("`registry x: boom`"),
  );
  const report = [
    "<!-- lockfile-review -->",
    "### Lockfile review",
    "",
    "**✓ No blocking findings.**",
    "",
    "1 added.",
    "",
    "<details>",
    "<summary>Added (1)</summary>",
    "",
    ...Array.from({ length: 2000 }, (_, i) => `- line ${i} ${"x".repeat(40)}`),
    "",
    "</details>",
  ].join("\n");
  const gateMd = "#### Dependency gate\n\nGATE BODY";
  const blocked = G.combineComment(report, gateMd, 1);
  ok(
    "combine: a blocking gate replaces the clean verdict",
    !blocked.summary.includes("No blocking findings") &&
      blocked.summary.includes("**✗ The dependency gate blocks**"),
  );
  ok(
    "combine: gate right under the verdict",
    blocked.summary.indexOf("GATE BODY") < blocked.summary.indexOf("1 added."),
  );
  ok(
    "combine: truncation keeps the gate",
    blocked.summary.length > 65536 &&
      blocked.comment.length <= 65536 &&
      blocked.comment.includes("GATE BODY") &&
      blocked.comment.startsWith("<!-- lockfile-review -->"),
  );
  ok(
    "combine: clean gate keeps the clean verdict",
    G.combineComment(report, gateMd, 0).summary.includes(
      "**✓ No blocking findings.**",
    ),
  );
  const both = G.combineComment(
    report.replace("**✓ No blocking findings.**", "**✗ 1 blocking finding**"),
    gateMd,
    2,
  ).summary;
  ok(
    "combine: both verdicts when both fail",
    both.includes("**✗ 1 blocking finding**") &&
      both.includes("**✗ The dependency gate could not run**"),
  );
  ok(
    "combine: no report still starts with the marker",
    G.combineComment("", gateMd, 0).summary.startsWith(
      "<!-- lockfile-review -->\n### Lockfile review",
    ),
  );
}

// ── CLI ────────────────────────────────────────────────────────────────────

const SCRIPT = fileURLToPath(new URL("./dependency-gate.mjs", import.meta.url));
const dir = mkdtempSync(join(tmpdir(), "dep-gate-"));
const cli = (args, env = {}) =>
  spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: "utf8",
    env: { ...process.env, PR_AUTHOR: "", PR_NUMBER: "", ...env },
  });
{
  const bad = join(dir, "bad.json");
  writeFileSync(bad, "{ not json");
  const r = cli(["--check-register", "--register", bad]);
  check("--check-register on a malformed file exits 2", r.status, 2);
  const good = join(dir, "good.json");
  writeFileSync(good, '{"dependencies":[],"cooldownOverrides":[]}');
  check(
    "--check-register on a valid file exits 0",
    cli(["--check-register", "--register", good]).status,
    0,
  );
  const missing = cli([
    "--check-register",
    "--register",
    join(dir, "none.json"),
  ]);
  check(
    "--check-register on a missing file exits 0 with a note",
    [missing.status, /no dependency-register.json/.test(missing.stdout)],
    [0, true],
  );
  // Renovate as the author needs the number to ask the API for the label.
  const emptyLock = join(dir, "lock.json");
  writeFileSync(emptyLock, '{"lockfileVersion":3,"packages":{"":{}}}');
  const gateOut = join(dir, "gate.md");
  const noNumber = cli(
    [emptyLock, emptyLock, "--register", good, "--out", gateOut],
    { PR_AUTHOR: "renovate[bot]", PR_NUMBER: "" },
  );
  check(
    "Renovate author without PR_NUMBER exits 2 and says why",
    [noNumber.status, /PR_NUMBER/.test(noNumber.stderr)],
    [2, true],
  );
  const failed = readFileSync(gateOut, "utf8");
  ok(
    "exit 2 writes the gate's own failure section, without the marker",
    failed.startsWith("#### Dependency gate") &&
      !failed.includes("<!-- lockfile-review -->") &&
      /could not run/.test(failed),
  );
  const out = join(dir, "out.md");
  const nofile = cli([
    join(dir, "nobase.json"),
    join(dir, "nohead.json"),
    "--out",
    out,
  ]);
  check("unreadable lockfile exits 2", nofile.status, 2);
  ok(
    "exit 2 writes a failure report to --out",
    /could not run/.test(readFileSync(out, "utf8")),
  );
}

// ── run(): one full evaluation against a fake registry and GitHub ─────────
{
  const base = lock({
    "packages/backend": { name: "backend", dependencies: {} },
    "node_modules/old": reg("old", "1.0.0"),
  });
  const head = lock({
    "packages/backend": {
      name: "backend",
      dependencies: { "left-pad": "^3" },
    },
    "node_modules/old": reg("old", "1.0.0"),
    "node_modules/left-pad": reg("left-pad", "3.2.5"),
  });
  const files = {
    base: join(dir, "run-base.json"),
    head: join(dir, "run-head.json"),
    config: join(dir, "run-config.json"),
    register: join(dir, "run-register.json"),
  };
  writeFileSync(files.base, JSON.stringify(base));
  writeFileSync(files.head, JSON.stringify(head));
  writeFileSync(
    files.config,
    JSON.stringify({ allowLicenses: ["MIT"], minReleaseAgeDays: 14 }),
  );
  writeFileSync(files.register, doc([entry({ followUp: 21 })]));
  const routes = {
    "https://registry.npmjs.org/left-pad": leftPad,
    "https://api.github.com/repos/pad/left-pad": {
      archived: false,
      owner: { type: "Organization" },
    },
    "https://api.github.com/repos/o/r/issues/21": { state: "open" },
  };
  const seen = [];
  const args = [
    files.base,
    files.head,
    "--config",
    files.config,
    "--register",
    files.register,
  ];
  const env = { GITHUB_REPOSITORY: "o/r", PR_AUTHOR: "someone" };
  const result = await G.run(args, env, NOW, {
    fetchImpl: fakeFetch(routes, seen),
    sleep: noSleep,
  });
  check("run: a valid entry passes", result.code, 0);
  ok(
    "run: the evidence table is rendered",
    result.report.includes("Locked `3.2.5`, repository `pad/left-pad`.") &&
      result.report.includes("| needed | none: a judgement | holds:"),
  );
  ok(
    "run: only the cited issue is looked up, no pull request lookup",
    seen.filter((u) => u.includes("/issues/")).join() ===
      "https://api.github.com/repos/o/r/issues/21",
  );
  const young = await G.run(args, env, new Date("2026-10-05T00:00:00Z"), {
    fetchImpl: fakeFetch(routes),
    sleep: noSleep,
  });
  ok(
    "run: a version under the cooldown blocks",
    young.code === 1 && /14-day cooldown/.test(young.report),
  );
  writeFileSync(files.register, doc([]));
  const missing = await G.run(args, env, NOW, {
    fetchImpl: fakeFetch(routes),
    sleep: noSleep,
  });
  ok(
    "run: no entry blocks",
    missing.code === 1 &&
      /no entry in dependency-register.json/.test(missing.report),
  );
  let err = null;
  await G.run(args, env, NOW, {
    fetchImpl: fakeFetch({}),
    sleep: noSleep,
  }).catch((e) => (err = e));
  ok(
    "run: a registry 404 is exit 2, never clean",
    err instanceof InputError && /registry left-pad/.test(err.message),
  );
}

if (failures.length) {
  console.error(`FAIL: ${failures.length} failed, ${passed} passed`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`PASS: ${passed} checks`);
