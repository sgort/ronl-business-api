# The gate now has teeth

How `ronl-business-api` enforces supply-chain policy in CI — what it delivers,
how it is built, how it behaves day to day, and where its coverage stops.

**This document explains the machinery. `SECURITY-PIPELINE.md` is the register**
— what is pinned right now, what cannot be, and what is queued. When a digest
changes, the register changes; this document should not need to.

The pattern was piloted in `ttl-editor`, whose own `docs/the-gate-has-teeth.md`
tells that story. This is not a copy: RBA is a monorepo with **ten workflows**, a
build shape that makes it _stronger_ in one respect, and a backend deploy path
that falls entirely outside the gate. Those differences are the interesting part.

> **Revised 12 September 2026.** The gate started as one zizmor check that could
> not block. It is now eight steps in a required job, four of which can fail a
> merge. Three claims this page used to make are now false and are called out
> below rather than quietly deleted — a document that only records its current
> state teaches nothing about which of its statements decay.

---

## 1. What problem this solves

IOU policy after a supply-chain incident: **nothing downloaded or executed by a
pipeline may float.** No `latest`, no empty versions — a hash, digest or verified
checksum wherever one exists.

`github.com/ictu` enforces this at the organisation level. This repo is not in
that organisation, so enforcement is built **inside the repository**, where it
travels with the code.

### The concrete risk

`uses: some/action@v1` executes whatever that tag points at _today_. Whoever
controls the tag controls the pipeline — including the step holding a deploy
token. `Azure/static-web-apps-deploy` shows the problem at its sharpest: it
publishes `v1` as **both** a 2021 tag and a 2024 branch head, 3.5 years apart, so
`@v1` was ambiguous _and_ partly mutable. This repo references it **nine times**
across four acceptance and production pipelines.

## 2. What it delivers

| Property                                                     | Enforced by                               | Blocks a merge      |
| ------------------------------------------------------------ | ----------------------------------------- | ------------------- |
| Every action reference is an immutable commit digest         | zizmor `unpinned-uses`, policy `hash-pin` | yes                 |
| No job carries more token scope than it needs                | zizmor `excessive-permissions`            | yes                 |
| No git credential is left in the workspace for later steps   | zizmor `artipacked`                       | yes                 |
| **Each digest resolves to the version its comment claims**   | `check-supply-chain`                      | **yes, since #83**  |
| **The register still describes the workflows**               | `check-supply-chain`                      | **yes, since #83**  |
| `renovate.json` is valid and not silently auto-migrated      | `renovate-config-validator --strict`      | yes                 |
| Formatting holds on the shared branch, not just pre-push     | `prettier --check`                        | yes                 |
| **`@ronl/shared` stays free of unmeasured logic**            | `check-shared`                            | **yes, since #84**  |
| Backend tests and the per-file branch floor run before merge | `Build Backend for ACC` on `pull_request` | no — not required   |
| Vulnerable and outdated npm packages are surfaced            | Semgrep Code + Supply Chain               | no — reporting only |
| Pins stay current instead of freezing                        | Renovate, under a 14-day cooldown         | n/a                 |
| The GitLab mirror has not silently drifted                   | `check-mirror`, at each release           | no — runs locally   |
| What cannot be pinned is written down                        | `SECURITY-PIPELINE.md`                    | n/a                 |

Measured on adoption: **49 findings → 0**, across the 8 workflows that existed
then.

| Stage                                     | unpinned-uses | excessive-permissions | artipacked | Total  |
| ----------------------------------------- | ------------- | --------------------- | ---------- | ------ |
| Before                                    | 27            | 14                    | 8          | **49** |
| After digest pins + `persist-credentials` | 0             | 14                    | 0          | **14** |
| After `permissions:` blocks               | 0             | 0                     | 0          | **0**  |

Unlike `ttl-editor`, this happened in one pass rather than three, because every
digest was resolved before any file was edited.

## 3. How it is built

### 3.1 `.github/zizmor.yml` — the policy

Requires a commit hash for **every** namespace, with no exemption for first-party
`actions/*`. zizmor 1.29.0 already enforces that by default, so the file changes
no findings today. It is committed so enforcement does not depend on a tool
default a future release could relax.

### 3.2 Pinned workflows

Every `uses:` is a 40-character commit SHA plus a `# vX.Y.Z` comment. The comment
is **functional** — Renovate parses it to know which version a digest represents
and rewrites it on update. Current digests live in `SECURITY-PIPELINE.md`, which
records **31 `uses:` references across 10 workflows, all 31 digest-pinned**.

Pins were taken **at the then-current major, not upgraded**, so adopting the
policy was behaviour-preserving. The v7 upgrades of `checkout`, `setup-node` and
`upload-artifact` were done afterwards as separate work, exactly so that a broken
deploy would not be ambiguous; the register now carries them at v7.0.1, v7.0.0
and v7.0.1.

Least privilege, applied to **10 workflows and 13 jobs** — every job carries an
explicit `permissions:` block:

- workflow-level default `permissions: contents: read`
- `pull-requests: write` on the six `build_and_deploy_job`s — they pass
  `repo_token` so the SWA action can comment on PRs
- `permissions: {}` on the three `close_pull_request_job`s — they check out
  nothing and receive only the Azure token
- `contents: read` on the two backend `build` jobs, on `audit`, and on `scan`

`actions/checkout` sets `persist-credentials: false` everywhere. Before this, a
live `GITHUB_TOKEN` was written into `.git/config` and mounted into a
closed-source third-party container. Verified safe here: no step runs `git` after
checkout, and there is no `.gitmodules`, so the existing `submodules: true` was
already a no-op.

### 3.3 `.github/workflows/zizmor.yml` — the gate

Runs on `pull_request` (no `branches:` or `paths:` filter) and on `push` to `acc`
and `main`. Job name: **`audit`**. It is the only required check in either
ruleset.

**It is no longer just zizmor.** Eight steps run, and `if: always()` on each
check means one run reports on every half of the policy rather than stopping at
the first failure:

| Step                                    | What fails it                                                                               |
| --------------------------------------- | ------------------------------------------------------------------------------------------- |
| Set up Node 24 for the config validator | —                                                                                           |
| Run zizmor                              | an unpinned `uses:`, excessive permissions, artipacked                                      |
| Validate renovate.json                  | invalid or auto-migratable Renovate config                                                  |
| Install dependencies for the formatter  | —                                                                                           |
| Check formatting                        | anything Prettier would rewrite                                                             |
| Verify `@ronl/shared` holds no logic    | a function, `if`, loop or class in that package                                             |
| Verify pin truth and register agreement | a digest that is not the version it claims, or a register that disagrees with the workflows |

The unfiltered `pull_request` trigger is deliberate and load-bearing: a pull
request opened against a **feature** branch matches no filtered trigger, so it
accumulates no audit at all and reports `mergeStateStatus CLEAN` with zero
checks. When its parent merges and GitHub retargets it, the required check is
missing and it blocks permanently, because retargeting emits no event either. It
cost four rounds of manual intervention in linked-data-explorer, and blocked #45
here.

Three zizmor inputs are deliberate:

- **`version: '1.29.0'`** — the action's `version` input defaults to `latest`. A
  supply-chain gate pulling an unpinned tool would defeat itself. The action
  resolves this through an internal digest table and runs a
  `ghcr.io/zizmorcore/zizmor@sha256:…` image, so it is a real container pin.
- **`advanced-security: false`** — the default uploads SARIF and needs
  `security-events: write`. This job is `contents: read` only, which also means
  **fork PRs work**, having no upload step to fail.
- **`annotations: true`** — findings appear inline on the PR diff. Mutually
  exclusive with `advanced-security`; the action errors if both are true.

**Do not set `token: ''`.** It looks like sound hardening and breaks the gate
outright — zizmor's `--gh-token` is env-backed, and an empty value is rejected at
argument parsing before any audit runs, even offline. Learned the hard way in
`ttl-editor`; the workflow carries a comment saying so.

### 3.4 `scripts/check-supply-chain.mjs` — the preflight zizmor cannot be

zizmor validates pin **format**: it will tell you that `uses:` names a
40-character SHA. It cannot tell you the SHA is the **right** one. This script
resolves every digest against the GitHub API and compares the register with the
workflows — digests, versions, the `(×N)` multiplicities and the totals headline.

**It blocks, and getting there took a deliberate detour.** It ran
`continue-on-error: true` from its adoption (#81) until #83 promoted it, waiting
for evidence that the register gets updated on a bump's own branch rather than
after the merge. #101 supplied it. That same pull request is also why waiting
longer was wrong: before its register was fixed, the check reported

```
[register] zizmorcore/zizmor-action: workflow pins cc914d7f3750… (v0.6.4)
           but SECURITY-PIPELINE.md records only 3dc1ecc9bcb9… (v0.6.2)
```

while the step, the job and the checks list **all read "success"**.
`continue-on-error` rewrites the _step's_ conclusion as well as the job's, and
the honest `outcome: failure` is not exposed by the REST API at all. A check
nobody can see fail is not protecting anything.

It puts a network call inside a required check. If that ever proves flaky, the
remedy is `--offline`, which keeps the register half blocking and drops only the
half that needs the network — **not** restoring `continue-on-error`.

### 3.5 `.github/workflows/semgrep.yml` — the other supply chain

`check-supply-chain` says nothing about the packages in `package-lock.json`.
Renovate remediates that tree; nothing verified it. The `scan` job runs Semgrep
Code and Supply Chain against an authenticated scan, reporting to the
`sgort/ronl-business-api` project in Semgrep Cloud.

Its first full scan on `acc`, 12 September 2026, found **435 findings, none
policy-blocking**: 249 reachable, 101 undetermined and 69 unreachable Supply
Chain findings across 1,266 npm dependencies, plus 16 Code findings.

**`scan` is deliberately not a required check.** Requiring a gate before knowing
what it reports is how gates get resented and bypassed; promotion is a ruleset
edit, reversible without touching the file. `continue-on-error` would be the
wrong tool for the same reason §3.4 gives.

`.semgrepignore` **replaces** Semgrep's built-in default ignore list rather than
extending it — which is why it restores `test/` and `tests/`. Adding the file at
all would otherwise have silently re-admitted the support files those defaults
were excluding.

### 3.6 `renovate.json` — keeping pins alive

The 14-day `minimumReleaseAge` gives vendors and researchers time to find problems
before adoption, with `internalChecksFilter: "strict"` suppressing the PR until
the age is genuinely met. A `vulnerabilityAlerts` override sets
`minimumReleaseAge: null`, so **security advisories bypass the cooldown** — the
rule most cooldown policies omit, and the reason such policies get disabled
mid-incident.

A `packageRules` entry **disables updates for `Azure/static-web-apps-deploy`**.
The workflows pin its branch head; Renovate's `github-tags` datasource resolves
the tag, so without the guard it would open a routine-looking digest update
reverting all nine references to 2021 code — and `minimumReleaseAge` gives no
protection, because the target commit is years old.

The global `dependencyDashboardApproval` that governed adoption is **gone**
(#105). It was set so Renovate raised nothing while the same workflow files were
being pinned by hand on a branch; that race ended when pinning finished. It is
replaced by a rule scoped to **majors only** — of 35 entries pending approval
when it changed, all but four were majors, which nobody merges on autopilot.
Majors stay checkboxes holding no slot in `prConcurrentLimit`; everything else
flows under the cooldown.

`lockFileMaintenance` runs Mondays with `prPriority: 10`. It had never run here:
it is the only mechanism that moves the transitive tree, and in
linked-data-explorer a single refresh closed 63 of 66 Supply Chain findings with
no manifest change.

### 3.7 The rulesets — what makes it _enforcement_

A workflow that runs but cannot block is advice. **Two** rulesets exist, and both
require a pull request and a passing `audit`:

| Ruleset                 | Branch | Requires               |
| ----------------------- | ------ | ---------------------- |
| `acc supply-chain gate` | `acc`  | pull request + `audit` |
| `main promotion gate`   | `main` | pull request + `audit` |

Both are needed together: the check alone still lets a direct push bypass the
gate. Neither sets `strict_required_status_checks_policy`, so a branch need not
be up to date with its base to merge — which is why a stale red check on an
un-rebased branch is not always a real failure.

Squash and rebase merging are **disabled repo-wide**, leaving merge commits only.
Changelog entries name commits by SHA, and both alternatives rewrite those hashes
— rebase deceptively so, since it preserves the commit count while replacing
every hash.

## 4. How it works, day to day

```
push to a feature branch            → nothing runs
open a PR against acc               → audit + scan always; build and the
                                      acc deploys if their paths match
audit fails                         → merge blocked by the ruleset
scan or build fails                 → merge NOT blocked; neither is required
direct push to acc                  → rejected: a PR is required
```

Renovate raises its PRs against `acc` like any contributor, so **the bot's own
PRs are gated by the policy it maintains**.

Three things worth knowing:

- **A pull request no longer redeploys all three sites.** This page used to say
  `frontend-acc`, `pa-demo-acc` and `publicsite-acc` had no `paths:` filter and
  that a one-file change redeployed everything. That has been false since the
  push filters were mirrored onto `pull_request`. What actually happens now:

  | a change touching                                | previews consumed                            |
  | ------------------------------------------------ | -------------------------------------------- |
  | `packages/frontend/**`                           | 1                                            |
  | `packages/public-site/**`                        | 1                                            |
  | `packages/pa-demo/**`                            | 1                                            |
  | `packages/shared/**` or `packages/pa-cockpit/**` | **2** — frontend and pa-demo both watch them |
  | the root lockfile or `package.json` alone        | **0** — no acc SWA workflow watches them     |
  | backend, docs, workflows                         | 0                                            |

  That last row is why most dependency pull requests cost no staging environment
  at all.

- **Preview sites cannot reach the backend.** A preview gets an ephemeral origin
  that is not in the backend's `CORS_ORIGIN` allowlist, and `VITE_API_URL` is
  baked in at build time. A preview demonstrates that static pages render;
  nothing more. Tracked as #37.

- **The backend suite runs before the merge now**, not after it (#87). The
  per-file 80% branch floor was real in four workspaces and retrospective in the
  fifth until that changed.

## 5. Where the coverage stops

Fully enumerated in `SECURITY-PIPELINE.md`. The one that most often surprises
people:

**The backend is not deployed by CI.** `azure-backend-{acc,prod}.yml` build,
test, package and upload an artifact — and contain no deploy step. The backend
reaches acceptance and production through gitignored `deploy-backend-to-*.sh`
scripts run from a developer machine, because a workflow-based App Service deploy
could not be made to work (#35).

So the gate does not see the backend's path to production at all, and the
dependency tree that ships there is resolved by an `npm install` with no
lockfile (#34). That is the widest floating surface in the repository, and unlike
the container exception it is fixable from our side.

**The mirror is outside every gate.** All three IOU repositories are mirrored to
`git.open-regels.nl`, and every check on this page runs on GitHub Actions. The
`gitlab` remote lives in `.git/config`, so a runner has no such remote, no key
for it and no route to it. `npm run check-mirror` closes the observation half —
it is called at each release from `/bump-release` and distinguishes **behind**
(one fast-forward) from **diverged** (needs archiving first, as ttl-editor's
`main` did). It never pushes; it prints the command. Nothing keeps the mirror
synced _between_ releases.

### Two things this section used to claim, now closed

**"zizmor validates pin format, never pin truth… Nothing re-checks that a digest
resolves to the tag it claims, or that the register still matches the
workflows."** `check-supply-chain` does both, and blocks (§3.4). It caught the
register drifting within a week of this page predicting it would.

**"Changed a pin by hand? Update `SECURITY-PIPELINE.md` in the same commit.
Nothing enforces that yet."** Enforced since #83. The register and the workflows
cannot disagree on `acc`.

## 6. Where this repo is stronger than the pilot

All six SWA **deploy** steps set **`skip_app_build: true`** and point
`app_location` at an already-built `dist/`. (The remaining three SWA references
are `action: 'close'` steps, which build nothing.) The floating
`staticappsclient:stable` container therefore **uploads an artifact this pipeline
built** — it does not build it. The build runs earlier in the same job on pinned
`setup-node`, installing via `npm ci` against the lockfile.

So for the three static sites, lockfile integrity covers **what ships**, not
merely what is tested. In `ttl-editor` the opposite holds: Oryx builds inside the
floating container there. The difference is one flag, and it is worth preserving
deliberately.

**One Node version, read from one file.** Every deploy workflow sets
`node-version-file: .nvmrc`, pinned to an exact `22.22.0` rather than a bare
major — the same "may not float" rule the digests follow, and Renovate's `node`
manager maintains it. Before #36 there were four answers and they disagreed: the
workflows said `20`, `.nvmrc` said `22`, `engines.node` said `>=20.13.0`, and both
App Service plans run `NODE|22-lts` — so the deployed artifact was **built on a
major the host does not run**. `zizmor.yml` keeps a literal `'24'`, because
`renovate@44.50.3` declares `engines.node ^24.11.0` and npm accepts a mismatch
with a warning rather than refusing.

This is one place RBA deliberately diverges from linked-data-explorer, which
pins exact literals per workflow and has no `.nvmrc`. That shape is what its own
#80 is open about: a Node 24 bump moved `engines.node` while all four workflows
stayed behind.

## 7. Operating it

- **Adding a workflow?** It is audited automatically. Pin every `uses:` with a
  digest and a version comment, give it a `permissions:` block, and update the
  register — `check-supply-chain` counts references and workflows, so a new one
  moves the totals headline and the `(×N)` multiplicities.
- **Renovate opened a digest PR?** That is the system working. **Update
  `SECURITY-PIPELINE.md` on that PR's own branch before merging**, not
  afterwards: the check runs on the pull request, so a register fixed after the
  merge leaves it red for that PR's entire life.
- **`audit` failed on your PR?** Read the annotation on the diff, or the step
  log. Each of the seven checks names the file and the rule.
- **Adding a helper to `@ronl/shared`?** Don't — it has no test runner, so the
  logic would escape the per-file branch floor entirely. `check-shared` fails the
  audit and says where the function should live. `packages/shared/README.md`
  records the decision and the documented way out.
- **Cutting a release?** `/bump-release` handles it, including reconciling open
  PRs first and checking the mirror afterwards. It opens a PR rather than
  fast-forwarding `acc`, because the ruleset forbids the latter.
