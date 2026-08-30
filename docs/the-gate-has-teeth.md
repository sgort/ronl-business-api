# The gate now has teeth

How `ronl-business-api` enforces supply-chain pinning in CI — what it delivers,
how it is built, how it behaves day to day, and where its coverage stops.

**This document explains the machinery. `SECURITY-PIPELINE.md` is the register**
— what is pinned right now, what cannot be, and what is queued. When a digest
changes, the register changes; this document should not need to.

The pattern was piloted in `ttl-editor`, whose own `docs/the-gate-has-teeth.md`
tells that story. This is not a copy: RBA is a monorepo with nine workflows, a
build shape that makes it _stronger_ in one respect, and a backend deploy path
that falls entirely outside the gate. Those differences are the interesting part.

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

| Property                                                   | Enforced by                               |
| ---------------------------------------------------------- | ----------------------------------------- |
| Every action reference is an immutable commit digest       | zizmor `unpinned-uses`, policy `hash-pin` |
| No job carries more token scope than it needs              | zizmor `excessive-permissions`            |
| No git credential is left in the workspace for later steps | zizmor `artipacked`                       |
| Pins stay current instead of freezing                      | Renovate, under a 14-day cooldown         |
| What cannot be pinned is written down                      | `SECURITY-PIPELINE.md`                    |

Measured on adoption: **49 findings → 0**, across 8 workflows.

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
and rewrites it on update. Current digests live in `SECURITY-PIPELINE.md`.

Pins were taken **at the then-current major, not upgraded**, so adopting the
policy was behaviour-preserving. Renovate offers v7 of `checkout`, `setup-node`
and `upload-artifact` on its dashboard; those are deliberately separate work,
because bundling an upgrade with the pinning would make a broken deploy
ambiguous.

Least privilege, applied to 8 workflows and 11 jobs:

- workflow-level default `permissions: contents: read`
- `pull-requests: write` on the six `build_and_deploy_job`s — they pass
  `repo_token` so the SWA action can comment on PRs
- `permissions: {}` on the three `close_pull_request_job`s — they check out
  nothing and receive only the Azure token
- `contents: read` on the two backend `build` jobs; `upload-artifact` needs no
  extra scope

`actions/checkout` sets `persist-credentials: false` everywhere. Before this, a
live `GITHUB_TOKEN` was written into `.git/config` and mounted into a
closed-source third-party container. Verified safe here: no step runs `git` after
checkout, and there is no `.gitmodules`, so the existing `submodules: true` was
already a no-op.

### 3.3 `.github/workflows/zizmor.yml` — the gate

Runs on `pull_request` and `push` for `acc` and `main`. Job name: **`audit`**.

Three inputs are deliberate:

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

### 3.4 `renovate.json` — keeping pins alive

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

`dependencyDashboardApproval` was set during adoption so Renovate raised nothing
until ticked, preventing it from pinning `acc`'s workflows while the same files
were being pinned on a branch. Remove it once pinning has landed.

### 3.5 The `acc` ruleset — what makes it _enforcement_

A workflow that runs but cannot block is advice. The ruleset requires a pull
request and a passing `audit` check on `acc`. Both are needed together: the check
alone still lets a direct push bypass the gate.

Squash and rebase merging are **disabled repo-wide**, leaving merge commits only.
Changelog entries name commits by SHA, and both alternatives rewrite those hashes
— rebase deceptively so, since it preserves the commit count while replacing
every hash.

## 4. How it works, day to day

```
push to a feature branch          → nothing runs
open a PR against acc             → audit + the acc deploys run
audit fails                       → merge blocked by the ruleset
direct push to acc                → rejected: a PR is required
```

Renovate raises its PRs against `acc` like any contributor, so **the bot's own
PRs are gated by the policy it maintains**.

Two quirks worth knowing:

- **Every PR to `acc` redeploys three sites.** `frontend-acc`, `pa-demo-acc` and
  `publicsite-acc` have no `paths:` filter, so a one-file change redeploys all
  three. The backend workflows are path-filtered and behave better.
- **Preview sites cannot reach the backend.** A preview gets an ephemeral origin
  that is not in the backend's `CORS_ORIGIN` allowlist, and `VITE_API_URL` is
  baked in at build time. A preview demonstrates that static pages render;
  nothing more.

## 5. Where the coverage stops

Fully enumerated in `SECURITY-PIPELINE.md`. The one that most often surprises
people:

**The backend is not deployed by CI.** `azure-backend-{acc,prod}.yml` build,
test, package and upload an artifact — and contain no deploy step. The backend
reaches acceptance and production through gitignored
`deploy-backend-to-*.sh` scripts run from a developer machine, because a
workflow-based App Service deploy could not be made to work.

So the gate does not see the backend's path to production at all, and the
dependency tree that ships there is resolved by an `npm install` with no
lockfile. That is the widest floating surface in the repository, and unlike the
container exception it is fixable from our side.

**zizmor validates pin format, never pin truth.** A wrong or hostile digest with
a plausible `# v4.4.0` comment passes the gate, Prettier and review alike.
Nothing re-checks that a digest resolves to the tag it claims, or that the
register still matches the workflows — Renovate updates pins and never touches
the register.

## 6. Where this repo is stronger than the pilot

All six SWA **deploy** steps set **`skip_app_build: true`** and point
`app_location` at an already-built `dist/`. (The remaining three SWA references
are `action: 'close'` steps, which build nothing.) The floating `staticappsclient:stable` container therefore
**uploads an artifact this pipeline built** — it does not build it. The build runs
earlier in the same job on pinned `setup-node`, installing via `npm ci` against
the lockfile.

So for the three static sites, lockfile integrity covers **what ships**, not
merely what is tested. In `ttl-editor` the opposite holds: Oryx builds inside the
floating container there. The difference is one flag, and it is worth preserving
deliberately.

## 7. Operating it

- **Adding a workflow?** It is audited automatically. Pin every `uses:` with a
  digest and a version comment, and give it a `permissions:` block.
- **Renovate opened a digest PR?** That is the system working. Merge it once the
  cooldown check passes; the version comment is updated for you.
- **`audit` failed on your PR?** Read the annotation on the diff. It names the
  file, line and rule.
- **Changed a pin by hand?** Update `SECURITY-PIPELINE.md` in the same commit.
  Nothing enforces that yet.
- **Cutting a release?** `/bump-release` handles it, including reconciling open
  PRs first. It opens a PR rather than fast-forwarding `acc`, because the ruleset
  forbids the latter.
