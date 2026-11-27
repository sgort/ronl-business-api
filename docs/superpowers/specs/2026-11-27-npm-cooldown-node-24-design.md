# The npm cooldown on every path that resolves versions — design

Date: 2026-11-27 · Repository: sgort/ronl-business-api (RBA) · Base branch: `acc`
Companion design: linked-data-explorer `docs/superpowers/specs/2026-11-27-dependency-register-gate-design.md`
(the new-dependency gate; it also carries the cooldown proof described in §6 below).

## 1. Intent

`.npmrc` asks npm to refuse any version published less than 14 days ago (ICTU
recommendation 6, sgort/linked-data-explorer#119). On this repository's own
toolchain that request is silently ignored, so the R6 cell for RBA cannot move.
The aim is that **every path that resolves versions honours the cooldown**, or
that the one remaining exception is written down with its reason — and that a
test shows a too-young version being refused on each path.

## 2. What is true today (evidence)

### 2.1 The setting and the toolchain

- `.npmrc:26` — `min-release-age=14`.
- `.nvmrc:1` — `22.23.4`. nodejs.org `dist/index.json`: `v22.23.4 … npm 10.9.9`;
  no Node 22 release bundles npm 11. Node 24.22.2 bundles npm 11.19.1.
- npm first honours the key in 11.10.0 (npm/cli CHANGELOG, `[11.10.0]
(2026-02-11)`: "#8965 add min-release-age"). Measured on this workstation:
  npm 10.9.9 `npm config get min-release-age` prints `14` and nothing on
  stderr — it reads the key and does not enforce it (`.npmrc:14-16` says so).
- `package.json:75-77` and `packages/backend/package.json:97-99` —
  `"node": ">=22", "npm": ">=10.0.0"`.
- `scripts/check-deps.sh:75-89` — warns, never fails: "A warning, not a
  failure" (`:78`), exit status untouched.

### 2.2 Who resolves versions, and on which npm

| Path                                                                | Where                                                                                                                              | npm today                               | Honours cooldown?                                                            |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------- |
| `npm install` / `npm update` / `npm install <pkg>` on a workstation | `package.json:50` (`"setup": "npm install && …"`); `scripts/check-deps.sh:101` names `npm install <package>` as the way to add one | 10.9.9 (`.nvmrc`)                       | **No**                                                                       |
| `npx -y -p "npm@$CI_NPM" …` during a release                        | `.claude/commands/bump-release.md:364`, `:395`                                                                                     | 10.9.9 resolves the `npm` package       | **No** (exact version, so the exposure is that one tarball)                  |
| `npx -y operaton-mcp` fallback                                      | `packages/backend/src/services/mcp/OperatonMcpProvider.ts:33` (win32/darwin), `:41` (Linux when not installed)                     | workstation npm                         | **No** on a workstation; App Service takes the `node <path>` branch at `:37` |
| Renovate update PRs and lock-file maintenance                       | hosted Mend Renovate 44.228.0 (PR #458 debug block `createdInVer`)                                                                 | **12.x** (derivation below)             | **Yes**                                                                      |
| `npx --package renovate@44.50.3 renovate-config-validator`          | `.github/workflows/zizmor.yml:105`                                                                                                 | 11.19.1 (`zizmor.yml:57`, Node 24.22.2) | Yes                                                                          |
| Every `npm ci` (deploys, audit, zizmor)                             | `azure-*-{acc,prod}.yml`, `zizmor.yml:135,148`                                                                                     | n/a                                     | Not applicable: installs the lockfile (npm/cli#9281) — accepted, see §5      |

**Which npm Renovate uses.** The docs (https://docs.renovatebot.com/node/,
"Configuring which version of npm Renovate uses") say the Mend app installs npm
dynamically and is steered by `engines.npm` or `constraints`. The order is in
Renovate's source at tag 44.228.0: `lib/modules/manager/npm/post-update/npm.ts`
L122-131 with `lib/modules/manager/util.ts` `resolveToolConstraint` L119-131 —
`constraints.npm`, then `packageManager`, then the lockfile version (v3 → no
constraint), then `engines.npm`. RBA has no `constraints` (renovate.json), no
`packageManager` (package.json), lockfileVersion 3, so the constraint is
`>=10.0.0`. containerbase takes the highest stable match
(`lib/util/exec/containerbase.ts` L385-387), i.e. the registry's `latest`,
npm 12.2.x today. Not confirmed from a job log — the Mend log needs a sign-in.

So the gap the prompt suspected in lock-file maintenance is **not** open today,
but it is open **by accident**: it holds only because `engines.npm` is an open
floor. A `packageManager: npm@10…` or `constraints.npm` added for any other
reason would close the cooldown silently.

**How Renovate applies `.npmrc`.** 44.228.0 `npm.ts` L171-179: "npm rejects
--before when min-release-age is set in .npmrc, so let the .npmrc handle
cooldown natively" — Renovate passes no `--before`. Its "stricter cutoff"
branch (main L159-167) applies only to a `before=` key, and its ETARGET retry
(44.228.0 L333) requires `beforeFlag`, so it never fires here. Security updates
"pass no minimum release age to the package manager" (docs,
`minimumReleaseAgePackageManager`).

Three of our own statements are therefore wrong and get corrected (§4.5):
`.npmrc:7-8`, `.npmrc:24-25`, `SECURITY-PIPELINE.md:389-391` and `:394-396`.

### 2.3 Why the repository is on Node 22

- Both App Services: `az webapp config show … ronl-business-api-acc` and
  `… -prod --query linuxFxVersion` → `NODE|22-lts` (read 2026-11-27).
- `renovate.json:169-184` disables Node majors until both App Services run
  `NODE|24-lts`, and prescribes the order: switch App Services, then remove the
  rule in the same change as the `.nvmrc` bump.
- `docs/promote-ACC-to-PROD.md:45-46`: "`operaton-mcp` 1.1.0 declares
  `engines.node >=22.0.0`". That is a floor, not a ceiling: the registry's
  `operaton-mcp@1.1.0` (also latest) has `{"node":">=22.0.0"}`. **The claim
  "needs 22" does not mean "cannot run 24".**
- No entry of `package-lock.json` (919 with an `engines.node` string) rejects
  24.22.3. The only lockfile entries with install scripts are dev tooling
  (esbuild ×2, msw, @scarf/scarf, fsevents) and two @carbon style packages; no
  native addon is in the production backend tree (cf. linked-data-explorer's
  libxmljs2, which needed a rebuild on its Node 24 move, LDE #203).
- The CI jobs that do not deploy are already on Node 24.22.2
  (`dependency-audit.yml:60`, `dependency-review.yml:48`, `sbom.yml:65`,
  `upstream-certs.yml:51`, `zizmor.yml:57,358`).

## 3. Approaches

|                                                                   | What it takes                                                                                                                           | Trade-off                                                                                                                                                |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **(a) Stay on Node 22, require npm ≥ 11.10**                      | `npm i -g npm@11` on every workstation; `engines.npm`/`packageManager`; `check-deps.sh` fails; explicit npm step in resolving workflows | Every machine depends on a manual global install that `nvm install` undoes; the repository's runtime and its tooling stay on different npm majors.       |
| **(b) Move to Node 24, as linked-data-explorer did** — **chosen** | App Services to `NODE                                                                                                                   | 24-lts`first, then one PR:`.nvmrc`, Renovate rule removed, `engines`floors,`check-deps.sh` fails, docs                                                   | Needs an App Service switch on ACC and PROD (a brief restart each). The toolchain that ships the cooldown is the one `.nvmrc` already installs. |
| (c) Rely on the lockfile gate only (§6)                           | Nothing on the toolchain                                                                                                                | Catches a too-young version after the fact, in a PR; leaves `npm install` resolving unprotected on the machine. Kept as the proof layer, not as the fix. |

The user chose (b) on 2026-11-27.

## 4. Design

### 4.1 Order of operations

1. **ACC App Service → `NODE|24-lts`** (the user runs it; the assistant's
   permissions block App Service writes). Hand the user a short script per the
   global "Azure: changing an App Service setting" procedure, check whether the
   app restarted (`/v1/health` `uptime`), verify `linuxFxVersion`.
2. **PR into `acc`** (this design's changes, §4.2–4.5). Its ACC deploy builds on
   `.nvmrc` = Node 24 and ships to a host now on 24. Smoke: `/v1/health`, an
   AI-assistant/MCP call that starts `operaton-mcp`, plus the user's e2e run.
3. **PROD App Service → `NODE|24-lts`** immediately before the ACC→PROD
   promotion PR is opened, the order LDE used (LDE #209). Between steps 1 and 3
   PROD still runs Node 22 code built on 22: consistent.

**The window, accepted (my call, 2026-11-27).** Between a switch and the
merge (ACC) or the promotion (PROD), a deploy can ship code built on Node 22 to a
Node 24 host. That direction is accepted: the production backend tree has no
native addon (§2.3), so nothing is compiled against Node 22's ABI, and LDE ran
the same order. The dangerous direction — built on 24, running on 22 — cannot
happen in this order. The window is kept short: the user switches ACC right
before the PR is merged, and PROD right before the promotion PR is opened.

### 4.2 `.nvmrc`

`24.22.2`, the Node 24 release linked-data-explorer runs (bundles npm 11.19.1).
Renovate maintains it from there.

### 4.3 `package.json` and `packages/backend/package.json` — `engines`

- `"node": ">=24.22.1"` — the floor LDE set for CVE-2026-111497 (LDE bf2467c,
  #309), kept identical across the two repos.
- `"npm": ">=11.10.0"` — the first npm that enforces `min-release-age`. This is
  also what Renovate derives its npm from (§2.2), so it turns today's accidental
  coverage into a stated one: a future `packageManager` or `constraints.npm`
  below 11.10 would contradict a floor with a written reason.
- The `widen` rule (`renovate.json:303-325`) stays; its description gains one
  sentence: the npm floor is the cooldown's, not a version to chase. Its
  example about "a floor that no Node 22 release satisfies" is history and stays.
- No `packageManager` field: it would make Renovate install exactly one npm and
  freeze it, and Corepack is not used here. No `engine-strict`: `check-deps.sh`
  enforces the npm floor where it matters (§4.4).

### 4.4 `scripts/check-deps.sh` — fail, not warn

Check 2 (`:75-89`) sets `STALE=true`-style failure (its own flag and message)
when `npm --version` is below 11.10, so `deps:check` — run on dev-server start
and in the pre-push hook — refuses. The message names the fix: `nvm use` (picks
up `.nvmrc` → Node 24 → npm 11.19). The comment says why it is now a failure: on
the pinned toolchain it can only fire when the wrong Node is active, and then the
next `npm install` would resolve without the cooldown.

### 4.5 Documents that must say what is now true

- `.npmrc` header: Renovate lets npm enforce the key and passes no `--before`;
  no "stricter cutoff", no ETARGET retry (security PRs pass no minimum age
  instead). Drop the npm-10 bullet; state the remaining exception (§5).
- `SECURITY-PIPELINE.md` "The package-manager cooldown" (`:387-410`): same
  corrections; the Renovate npm derivation; the table of §2.2 reduced to what
  remains; the proof (§6).
- `renovate.json:169-184` (Node-major rule): removed.
- `docs/promote-ACC-to-PROD.md:45-46` and the other Node 22 mentions the
  builder finds there (`:472`, `:797-806`, `:1109` per the analysis): record the
  move to 24 and that `operaton-mcp`'s `>=22.0.0` is a floor.
- Comments in `azure-backend-{acc,prod}.yml:137-147` / `:85-95` that name 22 as
  the example, where they would now mislead.

## 5. The remaining exception, written down

`npm ci` ignores `min-release-age` by design (npm/cli#9281). Accepted: it
installs the committed lockfile, which only changes through a pull request into
`acc`, and every lockfile change in a PR is checked for too-young versions by
the gate in §6. That is the one exception, and it is covered one step earlier.

## 6. Proof: a too-young version is refused on each path

Two tests, one per kind of path:

1. **Resolving with npm** — `scripts/cooldown-proof.mjs` (new, RBA). It asks
   the registry for a package that publishes often (e.g. `@types/node`) and
   picks a version younger than 14 days, then runs, in a temp directory with a
   copy of the repo `.npmrc`: `npm install --dry-run --no-save <pkg>@<version>`.
   It passes only if npm refuses (non-zero exit and npm's "with a date before"
   message) **and** the same command with `--min-release-age=0` succeeds (so a
   network failure can never pass as a refusal). Run it:
   - with the workstation npm (`.nvmrc` → 11.19) — the `npm install` path;
   - with `npx -y -p npm@<latest> npm …` — the npm Renovate installs (§2.2).
     CI runs it as a step in the daily `dependency-audit.yml` (no new workflow),
     on that job's pinned Node (`dependency-audit.yml:57-61`, 24.22.2 — the same
     release `.nvmrc` will name; the pin stays, as its comment explains). Locally the user runs `node scripts/cooldown-proof.mjs`.
     Before the Node 24 move the same script, run on npm 10.9.9, must report
     "not refused" — that is the regression the change fixes, recorded in the PR.
2. **Anything that reaches the lockfile, by any path** (workstation, Renovate,
   an `npx` that wrote it, a hand edit) — the lockfile gate in the companion
   design gains a cooldown check: every package version added or changed in the
   PR's lockfile diff must have been published ≥ `minReleaseAgeDays` (from
   `lockfile-review.json`, 14) before the run. Younger → blocking. Two ways
   through, both logged (companion design §4.5): Renovate's own security PRs
   (author `renovate[bot]` **and** label `security`) are exempt automatically and
   the gate records each young version in the PR comment, the job summary and
   the quarterly review; a person's urgent fix uses a committed register
   override with an issue. Shared script, so it lands in LDE first and reaches
   RBA with the gate's port.

## 7. Goals, non-goals, anti-goals

- **Goals:** every resolving path honours the cooldown; docs state the truth;
  R6 for RBA can move with evidence (the proof output + the gate).
- **Non-goals:** changing Renovate's own `minimumReleaseAge`; moving PROD before
  its promotion; Keycloak, Redis or other runtime upgrades.
- **Anti-goals:** a deploy whose build Node differs from the host's (the #36
  mismatch); a check that passes on a network failure; any bypass of the
  pre-push `deps:check`.

## 8. Left to the builder

- Choice of the frequently-published package in `cooldown-proof.mjs` and its
  fallback if none is under 14 days.
- Exact wording of the docs, within §4.5.
- Whether `npm run setup` should call `deps:check` first (small, optional).

## 9. Done when

- ACC and PROD App Services report `NODE|24-lts`; `.nvmrc` = 24.22.2; Node-major
  rule gone; engines floors as in §4.3; `check-deps.sh` fails below npm 11.10.
- `cooldown-proof.mjs` refuses a too-young version on npm 11.19 and on npm
  `latest`, and its PR records that npm 10.9.9 did not.
- The lockfile gate's cooldown check is live in RBA (via the companion port).
- `.npmrc`, `SECURITY-PIPELINE.md`, `check-deps.sh`, `docs/promote-ACC-to-PROD.md`
  say what is now true.
