# npm cooldown on Node 24 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every path that resolves npm versions in ronl-business-api honours `min-release-age=14`, by moving the repository to Node 24 (npm 11.19), stating the npm floor, failing `deps:check` below npm 11.10, and proving the refusal with a script.

**Architecture:** Runtime first (App Services, by the user), then one PR into `acc` on branch `chore/node-24-npm-cooldown`: `.nvmrc`, `engines`, Renovate rule, `check-deps.sh`, a new `scripts/cooldown-proof.mjs` run daily in `dependency-audit.yml`, and the documents. The lockfile-level cooldown check arrives separately with the dependency-register gate port (linked-data-explorer plan `2026-11-27-dependency-register-gate.md`, Task 7).

**Tech Stack:** Node 24.22.2 / npm 11.19.1, bash (`check-deps.sh`), Node ESM script, GitHub Actions, Azure App Service (`az`, run by the user).

**Spec:** `docs/superpowers/specs/2026-11-27-npm-cooldown-node-24-design.md`

## Global Constraints

- `.nvmrc` = `24.22.2`. `engines` in `package.json` and `packages/backend/package.json`: `"node": ">=24.22.1"`, `"npm": ">=11.10.0"`. No `packageManager`, no `engine-strict`.
- npm threshold in every check: major > 11, or 11 with minor ≥ 10.
- The cooldown proof passes only if npm refuses the young version **and** the same command with `--min-release-age=0` succeeds; anything else is a failure (exit 1) or "could not run" (exit 2), never a pass.
- App Service writes are the user's: hand a script per the global "Azure: changing an App Service setting" procedure (read first, `! bash ~/<name>.sh`, verify `linuxFxVersion` and `/v1/health` uptime; delete the script afterwards).
- **No commits by implementers**: stage and report; the controller asks the user before every commit. No Claude attribution. Never `--no-verify`. Never start/stop/restart dev servers or run `npm ci` (outside triage it is the user's). One PR into `acc`; no merges, no pushes to `acc`/`main`.

## Review Focus

1. No package version younger than 14 days available at run time (quiet registry week): the proof must try a fallback list of frequently published packages and exit 2 "no young version found" rather than pass — test in Task 1.
2. Registry or network down: the control command (`--min-release-age=0`) fails too → exit 2, not "refused" — test in Task 1.
3. A developer on Node 22 after the merge: `deps:check` (dev-server start and pre-push) fails with the `nvm use` hint, exit 1 — Task 2 verification.
4. `npm --version` printing something unparseable (`unknown`): treated as too old → fail — test in Task 2.
5. The lockfile regenerated for the new `engines` must change only the two `engines` blocks — Task 3 verification diff.

---

### Task 1: `scripts/cooldown-proof.mjs`

**Files:**

- Create: `scripts/cooldown-proof.mjs`, `scripts/cooldown-proof.test.mjs` (self-contained style of `scripts/lockfile-diff.test.mjs`: `check()`, PASS count, exit 1)

**Interfaces:**

- Produces: `pickYoungVersion(packument, now, minDays) → string|null` (newest stable version with `time[v]` younger than `minDays`); `verdict({ refused, controlOk }) → "refused"|"not refused"|"could not run"`; CLI `node scripts/cooldown-proof.mjs [--npm "<command>"]` (default `npm`; e.g. `--npm "npx -y -p npm@latest npm"`), exit 0 refused, 1 not refused, 2 could not run. Reads `min-release-age` from the repo `.npmrc` (absent → exit 2).

- [ ] **Step 1: Failing tests:** `pick: newest stable under 14 days`; `pick: ignores prereleases`; `pick: none young → null`; `verdict: refused + control ok → refused`; `verdict: not refused → not refused`; `verdict: control fails → could not run`; `refusal text recognised` — `isCooldownRefusal(stderr)` true for npm's `with a date before` / `ETARGET` message, false for `ENOTFOUND`.
- [ ] **Step 2:** `node scripts/cooldown-proof.test.mjs` → FAIL.
- [ ] **Step 3: Implement.** Candidates in order: `@types/node`, `typescript`, `@playwright/test`, `vite` (first with a young version wins). Each run in a fresh `mkdtemp` dir holding a copy of `.npmrc` and a minimal `package.json`; command `install --dry-run --no-save --ignore-scripts --no-audit --no-fund <pkg>@<version>`; control adds `--min-release-age=0`. Print npm version used, package, version, publish date, age, verdict.
- [ ] **Step 4:** Tests PASS. **Record the regression** on the current Node 22: `node scripts/cooldown-proof.mjs` → exit 1 "not refused (npm 10.9.9)"; and `node scripts/cooldown-proof.mjs --npm "npx -y -p npm@latest npm"` → exit 0 "refused" (Renovate's npm). Save both outputs for the PR body.
- [ ] **Step 5:** Stage; report.

### Task 2: `check-deps.sh` fails below npm 11.10

**Files:**

- Modify: `scripts/check-deps.sh:75-89` (check 2) and its header comment; the `STALE` message block `:93-108` stays for check 1.

- [ ] **Step 1:** Change check 2 to set its own `NPM_TOO_OLD=true` and, at the end, exit 1 with: `npm <v> ignores the min-release-age cooldown in .npmrc; it needs 11.10 or newer. Run: nvm use   (.nvmrc → Node 24.22.2, npm 11.19)`. An unparseable version counts as too old. Comment: why a failure now (on the pinned toolchain it fires only when the wrong Node is active, and then the next `npm install` resolves without the cooldown); link `docs/superpowers/specs/2026-11-27-npm-cooldown-node-24-design.md`.
- [ ] **Step 2: Verify** on the current Node 22: `bash scripts/check-deps.sh; echo $?` → the npm message and `1`. `bash -n scripts/check-deps.sh` → no output.
- [ ] **Step 3:** Stage; report. (Pre-push will now refuse on Node 22 — the user switches Node in Task 3 before any push.)

### Task 3: Node 24 toolchain and the npm floor

**Files:**

- Modify: `.nvmrc`; `package.json:75-77`; `packages/backend/package.json:97-99`; `package-lock.json` (the two `engines` blocks only); `renovate.json:169-184` (remove the Node-major rule) and `:303-325` (one sentence: the npm floor is the cooldown's, see `.npmrc`)

- [ ] **Step 1 (user):** controller hands the user `nvm install 24.22.2 && nvm use 24.22.2` (then `nvm reshim` if NVM4306 appears) and `npm ci` (dev servers go down with it; the user restarts them). Wait for confirmation that `node -v` = v24.22.2, `npm -v` = 11.19.1.
- [ ] **Step 2:** Edit the files to the Global Constraints values; regenerate the lockfile with `npm install --package-lock-only --ignore-scripts --no-audit --no-fund` (now on npm 11.19, cooldown honoured).
- [ ] **Step 3: Verify:** `git diff --stat package-lock.json` shows only engines lines (`git diff package-lock.json` → exactly the `engines` of `""` and `packages/backend`); `npx --yes --package renovate@44.50.3 renovate-config-validator --strict` → valid; `bash scripts/check-deps.sh` → exit 0 (after the user's `npm ci`); `node scripts/cooldown-proof.mjs` → exit 0 "refused (npm 11.19.1)".
- [ ] **Step 4:** Stage; report.

### Task 4: Daily proof in CI

**Files:**

- Modify: `.github/workflows/dependency-audit.yml` (new step after "Setup Node.js", `:52-60`; keep the `24.22.2` pin and its comment); paths filter of its `pull_request` trigger gains `scripts/cooldown-proof.mjs` if the workflow has one.

- [ ] **Step 1:** Add step `Cooldown proof` running `node scripts/cooldown-proof.test.mjs && node scripts/cooldown-proof.mjs`, placed before "Audit acc and main" (that step checks out other branches and replaces the tree). Its failure must reach the tracking-issue step: fold its exit (1 → status 1, 2 → 2) into the step's `status` output, or give it an `id` and make the issue step's `STATUS` the worse of the two. Comment: ICTU R6, the spec path.
- [ ] **Step 2: Verify:** `actionlint .github/workflows/dependency-audit.yml` if installed; otherwise the zizmor job on the PR. Stage; report.

### Task 5: Documents say what is now true

**Files:**

- Modify: `.npmrc:1-25`; `SECURITY-PIPELINE.md:387-410`; `docs/promote-ACC-to-PROD.md` (an added note at `:45-46` and `:797-806`, not a rewrite of the historical runbook); comments in `.github/workflows/azure-backend-acc.yml:137-150`, `azure-backend-prod.yml:85-98` only where "22" is stated as the current version.

- [ ] **Step 1: `.npmrc` header** — Renovate's own updates and lock-file maintenance: Renovate passes no `--before` when this key exists and npm enforces it; Renovate installs npm from `engines.npm` (≥ 11.10.0); security PRs pass no minimum age. Remaining exception: `npm ci` (npm/cli#9281), covered at PR time by the lockfile gate. Below 11.10 `deps:check` refuses. Remove the "stricter cutoff" and "ETARGET retry" sentences.
- [ ] **Step 2: `SECURITY-PIPELINE.md`** "The package-manager cooldown": same facts, the Renovate source references of spec §2.2, the proof (`cooldown-proof.mjs`, daily), the remaining exception, and "Reachable from our side: yes, closed" with the date.
- [ ] **Step 3: promote doc and workflow comments:** a dated note: moved to Node 24 on <date>, `operaton-mcp`'s `>=22.0.0` is a floor; App Services `NODE|24-lts`.
- [ ] **Step 4:** `npx prettier --check .npmrc SECURITY-PIPELINE.md docs/promote-ACC-to-PROD.md` (md only; never prettier CSS) → clean. Stage; report.

### Task 6: Runtime switch, PR and promotion handoff

- [ ] **Step 1: Batch end.** Controller hands the user `npm test` (full suite) and `node scripts/cooldown-proof.test.mjs`; waits for green; asks to commit (one commit per task or one squashed — the user's choice).
- [ ] **Step 2: ACC App Service.** Hand the user a script that reads `linuxFxVersion` of `ronl-business-api-acc` (`--subscription "PDR - C1380" -g rg-ronl-acc`), sets `NODE|24-lts`, reads it back; then check `/v1/health` uptime and hand `az webapp restart` if it did not restart. Do this right before the merge (spec §4.1 window).
- [ ] **Step 3:** With the user's go-ahead, push `chore/node-24-npm-cooldown` and open the PR into `acc`. Body: what changed, the Task 1 before/after proof outputs, the App Service step, and the PROD step still to come. No attribution.
- [ ] **Step 4: After the user merges:** check the ACC backend deploy run, `/v1/health` version and uptime, and ask the user for an AI-assistant call that starts `operaton-mcp` plus their e2e run.
- [ ] **Step 5: PROD** (at the next promotion, not now): the same script for `ronl-business-api-prod` / `rg-ronl-prod`, immediately before the ACC→PROD PR is opened. Recorded in the final report as open until then.
