// Tests for dependency-review.mjs. Self-contained, like the other
// scripts/*.test.mjs: no test runner, prints a PASS count, exits 1 on any
// failure. No network: registry and GitHub answers are fixtures.
import * as R from "./dependency-review.mjs";

let passed = 0;
const failures = [];
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed += 1;
  else failures.push(`${label}\n    expected ${e}\n    actual   ${a}`);
}

const NOW = new Date("2026-10-10T00:00:00Z");
const ALLOW = new Set(["MIT", "ISC", "Apache-2.0"]);

// ── quarter ─────────────────────────────────────────────────────────────────

check(
  "quarter of a date",
  R.quarterOf(new Date("2026-10-02T06:00:00Z")),
  "2026-Q4",
);
check(
  "quarter of January",
  R.quarterOf(new Date("2027-01-01T00:00:00Z")),
  "2027-Q1",
);

// ── packages from the lockfile ──────────────────────────────────────────────

const lockfile = {
  lockfileVersion: 3,
  packages: {
    "": { name: "fixture", devDependencies: { prettier: "^3.9.0" } },
    "packages/frontend": {
      name: "@fixture/frontend",
      dependencies: { react: "^19.0.0", "@fixture/shared": "*" },
      devDependencies: { vitest: "^5.0.0" },
    },
    "packages/backend": {
      name: "@fixture/backend",
      dependencies: { libxmljs2: "^0.35.0" },
      devDependencies: { react: "^19.0.0" },
    },
    "packages/shared": { name: "@fixture/shared" },
    "node_modules/@fixture/shared": { resolved: "packages/shared", link: true },
    "node_modules/react": { version: "19.2.0", license: "MIT" },
    "node_modules/prettier": { version: "3.9.8", license: "MIT" },
    "node_modules/vitest": { version: "5.0.1", license: "MIT" },
    "packages/backend/node_modules/libxmljs2": {
      version: "0.35.0",
      license: "MIT",
      hasInstallScript: true,
    },
  },
};
check(
  "every direct dependency once, production when any manifest needs it at runtime",
  R.packagesFromLockfile(lockfile),
  [
    {
      name: "libxmljs2",
      version: "0.35.0",
      production: true,
      installScript: true,
      manifests: ["packages/backend"],
    },
    {
      name: "prettier",
      version: "3.9.8",
      production: false,
      installScript: false,
      manifests: ["(root)"],
    },
    {
      name: "react",
      version: "19.2.0",
      production: true,
      installScript: false,
      manifests: ["packages/backend", "packages/frontend"],
    },
    {
      name: "vitest",
      version: "5.0.1",
      production: false,
      installScript: false,
      manifests: ["packages/frontend"],
    },
  ],
);

// ── registry and GitHub evidence ────────────────────────────────────────────

const packument = {
  name: "libxmljs2",
  "dist-tags": { latest: "0.35.0" },
  time: {
    created: "2019-01-01T00:00:00Z",
    modified: "2026-09-01T00:00:00Z",
    "0.34.0": "2024-11-01T00:00:00Z",
    "0.35.0": "2025-06-01T17:05:46Z",
  },
  maintainers: [{ name: "marudor" }],
  license: "MIT",
  repository: { url: "git+ssh://git@github.com/marudor/libxmljs2.git" },
  versions: { "0.35.0": {} },
};
check(
  "evidence from a packument: last release ignores 'modified'",
  R.evidenceFrom(packument, "0.35.0"),
  {
    lastRelease: "2025-06-01T17:05:46Z",
    maintainers: 1,
    licence: "MIT",
    deprecated: null,
    repo: "marudor/libxmljs2",
  },
);
check(
  "deprecation of the installed version counts",
  R.evidenceFrom(
    { ...packument, versions: { "0.35.0": { deprecated: "use libxmljs" } } },
    "0.35.0",
  ).deprecated,
  "use libxmljs",
);
check(
  "a deprecated latest counts too",
  R.evidenceFrom(
    {
      ...packument,
      versions: { "0.35.0": {}, "0.36.0": { deprecated: "gone" } },
      "dist-tags": { latest: "0.36.0" },
    },
    "0.35.0",
  ).deprecated,
  "gone",
);
for (const [url, repo] of [
  ["https://github.com/facebook/react.git", "facebook/react"],
  ["git+https://github.com/vitest-dev/vitest.git", "vitest-dev/vitest"],
  ["github:prettier/prettier", "prettier/prettier"],
  ["https://gitlab.com/x/y.git", null],
]) {
  check(`repository ${url}`, R.githubRepo(url), repo);
}

// ── assessment ──────────────────────────────────────────────────────────────

const healthy = {
  lastRelease: "2026-09-01T00:00:00Z",
  maintainers: 3,
  licence: "MIT",
  deprecated: null,
  repo: "facebook/react",
  archived: false,
  orgOwned: true,
};
check("a healthy package raises nothing", R.assess(healthy, NOW, ALLOW), {
  fail: [],
  check: [],
});
check(
  "deprecated or archived fails",
  R.assess({ ...healthy, deprecated: "use x", archived: true }, NOW, ALLOW)
    .fail,
  ["deprecated: use x", "repository archived"],
);
check(
  "no release in 12 months asks for a judgement",
  R.assess({ ...healthy, lastRelease: "2025-06-01T17:05:46Z" }, NOW, ALLOW)
    .check,
  ["no release in 16 months"],
);
check(
  "one maintainer without an organisation asks for a judgement",
  R.assess({ ...healthy, maintainers: 1, orgOwned: false }, NOW, ALLOW).check,
  ["one maintainer, no organisation"],
);
check(
  "one maintainer under an organisation is fine",
  R.assess({ ...healthy, maintainers: 1, orgOwned: true }, NOW, ALLOW).check,
  [],
);
check(
  "a licence off the allow-list asks for a judgement",
  R.assess({ ...healthy, licence: "MPL-2.0" }, NOW, ALLOW).check,
  ["licence MPL-2.0 not on the allow-list"],
);
check(
  "missing evidence is said, never read as fine",
  R.assess(
    { ...healthy, archived: null, orgOwned: null, maintainers: 1 },
    NOW,
    ALLOW,
  ).check,
  ["repository not checked", "one maintainer, organisation not checked"],
);
check(
  "a registry failure is a failure to review, not a pass",
  R.assess({ error: "registry answered 404" }, NOW, ALLOW),
  { fail: ["registry answered 404"], check: [] },
);

// ── report ──────────────────────────────────────────────────────────────────

const rows = [
  {
    name: "react",
    version: "19.2.0",
    production: true,
    installScript: false,
    evidence: healthy,
    verdict: { fail: [], check: [] },
  },
  {
    name: "libxmljs2",
    version: "0.35.0",
    production: true,
    installScript: true,
    evidence: {
      ...healthy,
      lastRelease: "2025-06-01T17:05:46Z",
      maintainers: 1,
      orgOwned: false,
      repo: "marudor/libxmljs2",
    },
    verdict: {
      fail: [],
      check: ["no release in 16 months", "one maintainer, no organisation"],
    },
  },
  {
    name: "vitest",
    version: "5.0.1",
    production: false,
    installScript: false,
    evidence: healthy,
    verdict: { fail: ["repository archived"], check: [] },
  },
];
const report = R.renderReview({
  repository: "sgort/fixture",
  quarter: "2026-Q4",
  rows,
  date: NOW,
});
check("the report names the quarter", report.includes("2026-Q4"), true);
check(
  "flagged packages come first, each with an outcome to record",
  report.indexOf("libxmljs2") < report.indexOf("react") &&
    report.includes("- [ ] **keep**") &&
    report.includes("**replace**") &&
    report.includes("**accept**"),
  true,
);
check(
  "failures are listed before judgement calls",
  report.indexOf("`vitest`") < report.indexOf("`libxmljs2`"),
  true,
);
check(
  "the counts add up",
  report.includes(
    "3 direct dependencies (2 production) · 1 failing · 1 to judge",
  ),
  true,
);
check(
  "the criteria are linked",
  report.includes("docs/dependency-criteria.md"),
  true,
);
check(
  "a name from the registry cannot break out of its code span",
  R.renderReview({
    repository: "x",
    quarter: "2026-Q4",
    date: NOW,
    rows: [{ ...rows[2], name: "a`\n- [x] **keep**" }],
  })
    .split("\n")
    .some((l) => /^\s*- \[x\]/.test(l)),
  false,
);

// ── register section ────────────────────────────────────────────────────────

{
  const base = { repository: "x", quarter: "2026-Q4", rows: [], date: NOW };
  const register = {
    dependencies: [
      {
        name: "left-pad",
        manifest: "package.json",
        status: "override",
        outcome: "keep",
        followUp: null,
        override: { reason: "r", issue: 7 },
      },
      {
        name: "old-lib",
        manifest: "packages/a/package.json",
        status: "approved",
        outcome: "replace",
        followUp: 42,
      },
      {
        name: "fine",
        manifest: "package.json",
        status: "approved",
        outcome: "keep",
        followUp: null,
      },
    ],
    cooldownOverrides: [
      { package: "zod", version: "4.1.0", reason: "fix", issue: 9 },
    ],
  };
  const open = R.renderReview({ ...base, register });
  check(
    "review lists open overrides",
    open.includes("### Register: still open") &&
      open.includes("`left-pad`") &&
      !open.includes("`fine`"),
    true,
  );
  check(
    "review lists replace outcomes with follow-up",
    open.includes("`old-lib`") && open.includes("#42"),
    true,
  );
  check(
    "review lists cooldown overrides",
    open.includes("`zod`") && open.includes("4.1.0") && open.includes("#9"),
    true,
  );
  check(
    'review without register says "no register entries open"',
    R.renderReview(base).includes("No register entries open"),
    true,
  );
  const sec = R.renderReview({
    ...base,
    securityQuarter: "2026-Q3",
    securityExceptions: [
      {
        number: 12,
        title: "Update foo [SECURITY]",
        mergedAt: "2026-10-05T10:00:00Z",
      },
    ],
  });
  check(
    "review lists security exceptions",
    sec.includes("### Renovate security exceptions, 2026-Q3") &&
      sec.includes("#12") &&
      sec.includes("2026-10-05"),
    true,
  );
  check(
    "review without a quarter still has a heading",
    R.renderReview(base).includes(
      "### Renovate security exceptions, previous quarter",
    ),
    true,
  );
  check(
    "review notes a failed security search",
    R.renderReview({ ...base, securityExceptionsError: "boom" }).includes(
      "could not list security exceptions: boom",
    ),
    true,
  );
}

// ── security exceptions search (no network) ────────────────────────────────

{
  check(
    "no token, no search",
    await R.securityExceptionsOf("o/r", "2026-07-01", "2026-09-30", ""),
    { items: [], error: null },
  );
  let url;
  const ok = async (u) => {
    url = u;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        items: [
          {
            number: 5,
            title: "t",
            pull_request: { merged_at: "2026-10-02T00:00:00Z" },
          },
        ],
      }),
    };
  };
  check(
    "the search lists merged security PRs",
    await R.securityExceptionsOf("o/r", "2026-07-01", "2026-09-30", "tok", {
      fetchImpl: ok,
    }),
    {
      items: [{ number: 5, title: "t", mergedAt: "2026-10-02T00:00:00Z" }],
      error: null,
    },
  );
  check(
    "the search is scoped to the quarter, both ends",
    decodeURIComponent(url).includes("merged:2026-07-01..2026-09-30"),
    true,
  );
  const bad = async () => ({ ok: false, status: 403, json: async () => ({}) });
  const failed = await R.securityExceptionsOf(
    "o/r",
    "2026-07-01",
    "2026-09-30",
    "tok",
    { fetchImpl: bad, sleep: async () => {} },
  );
  check(
    "a failed search is reported, not thrown",
    failed.items.length === 0 && /403/.test(failed.error),
    true,
  );
  check(
    "quarterStart",
    R.quarterStart(new Date("2026-11-27T00:00:00Z")),
    "2026-10-01",
  );
  // The cron runs on the second day of a quarter: list the quarter just ended.
  check(
    "previousQuarter on 2 January is the last quarter of the year before",
    R.previousQuarter(new Date("2026-01-02T06:23:00Z")),
    { quarter: "2025-Q4", since: "2025-10-01", until: "2025-12-31" },
  );
  check(
    "previousQuarter on 2 April",
    R.previousQuarter(new Date("2026-04-02T06:23:00Z")),
    { quarter: "2026-Q1", since: "2026-01-01", until: "2026-03-31" },
  );
}

// ── fetchJson: retry (no network) ───────────────────────────────────────────

{
  const res = (status, body = {}) => ({
    ok: status < 400,
    status,
    json: async () => body,
  });
  const noSleep = async () => {};
  let calls = 0;
  const flaky = async () => (++calls <= 2 ? res(429) : res(200, { a: 1 }));
  check(
    "fetchJson retries 429 twice then succeeds",
    await R.fetchJson(
      "https://x.test/a",
      {},
      { fetchImpl: flaky, sleep: noSleep },
    ),
    { a: 1 },
  );
  check("fetchJson made three calls", calls, 3);
  let n = 0;
  const down = async () => (n++, res(503));
  let err = null;
  try {
    await R.fetchJson(
      "https://x.test/a",
      {},
      { fetchImpl: down, sleep: noSleep },
    );
  } catch (e) {
    err = e;
  }
  check("fetchJson gives up after 3", [n, err?.status], [3, 503]);
  n = 0;
  const gone = async () => (n++, res(404));
  err = null;
  try {
    await R.fetchJson(
      "https://x.test/a",
      {},
      { fetchImpl: gone, sleep: noSleep },
    );
  } catch (e) {
    err = e;
  }
  check("fetchJson does not retry a 404", [n, err?.status], [1, 404]);
  // Pauses: 2 s then 5 s by default, or what Retry-After asks for.
  const pauses = [];
  const record = async (ms) => {
    pauses.push(ms);
  };
  n = 0;
  await R.fetchJson(
    "https://x.test/a",
    {},
    {
      fetchImpl: async () => (n++, res(503)),
      sleep: record,
    },
  ).catch(() => {});
  check("fetchJson backs off 2 s then 5 s", pauses, [2000, 5000]);
  pauses.length = 0;
  n = 0;
  const limited = async () =>
    ++n === 1
      ? { ...res(429), headers: new Headers({ "retry-after": "7" }) }
      : res(200, { ok: 1 });
  await R.fetchJson(
    "https://x.test/a",
    {},
    {
      fetchImpl: limited,
      sleep: record,
    },
  );
  check("fetchJson honours Retry-After", pauses, [7000]);
  check("retryAfterMs is capped", R.retryAfterMs("3600"), 60000);
  check("retryAfterMs without a value", R.retryAfterMs(null), null);
  let signal;
  await R.fetchJson(
    "https://x.test/a",
    {},
    {
      fetchImpl: async (u, init) => ((signal = init.signal), res(200, {})),
    },
  );
  check(
    "fetchJson gives each request a timeout signal",
    signal instanceof AbortSignal,
    true,
  );
  n = 0;
  const hangs = async () => {
    n++;
    const e = new Error("The operation was aborted due to timeout");
    e.name = "TimeoutError";
    throw e;
  };
  err = null;
  await R.fetchJson(
    "https://x.test/a",
    {},
    {
      fetchImpl: hangs,
      sleep: noSleep,
    },
  ).catch((e) => (err = e));
  check(
    "fetchJson retries a timeout, then gives up",
    [n, err?.name],
    [3, "TimeoutError"],
  );
  check(
    "mapLimited keeps order",
    await R.mapLimited([3, 1, 2], 2, async (x) => x * 2),
    [6, 2, 4],
  );
}

// ── summary ─────────────────────────────────────────────────────────────────
if (failures.length) {
  console.error(
    `FAIL: ${failures.length} of ${passed + failures.length} checks\n`,
  );
  for (const f of failures) console.error(`  ✗ ${f}\n`);
  process.exit(1);
}
console.log(`PASS: ${passed} checks`);
