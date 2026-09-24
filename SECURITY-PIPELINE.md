# Pipeline supply-chain posture

Policy: nothing downloaded or executed by a pipeline may float. No `latest`, no
empty versions — a hash, digest or verified checksum wherever one exists.
Enforced in-repo by `.github/zizmor.yml` and the `Supply-chain audit` workflow,
and kept current by Renovate under a 14-day cooldown.

Pattern and rationale: `ttl-editor`'s `docs/the-gate-has-teeth.md`. The
exceptions below are **re-derived for this repository**, not copied — RBA's
build shape differs, and the differences matter in both directions.

## Manual prerequisites

These are GitHub settings, not files. Without them parts of the policy are inert.

| Setting                         | Required state                                                                  | Why                                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Renovate GitHub App             | installed, scoped to this repo                                                  | `renovate.json` is inert until it is                                                           |
| Dependabot **alerts**           | enabled                                                                         | `vulnerabilityAlerts` consumes this feed; without it the no-cooldown security lane never fires |
| Dependabot **security updates** | **disabled**                                                                    | it opens competing PRs that ignore the 14-day cooldown                                         |
| Merge methods                   | merge commits only                                                              | squash and rebase rewrite the SHAs a changelog entry names                                     |
| `acc` ruleset                   | PR + `audit` + `scan` + the four build checks + `deletion` + `non_fast_forward` | a workflow that runs but cannot block is advice, not a gate                                    |
| `main` ruleset                  | PR + `audit` + `deletion` + `non_fast_forward`                                  | `main` is promoted from `acc`; the branch that deploys production must not be the weaker one   |

The four build checks on `acc` are `build`, `Build and Deploy ACC Frontend`,
`Build and Deploy ACC PA Demo` and `Build and Deploy ACC Public Site`, added with
`scan` for [linked-data-explorer#119](https://github.com/sgort/linked-data-explorer/issues/119). Their workflows used to
path-filter the `pull_request` trigger, and a workflow its trigger filters out
reports no check, so a required one would block every unrelated pull request
forever. Each now filters in a `changes` job instead (#160): the build job is
skipped on an unrelated pull request, a skipped job counts as passed, and if
`changes` fails the build runs anyway. Required checks match by job name, so
renaming one of these jobs means updating the ruleset in the same change.

`main` stays on `audit` alone, deliberately, and that makes it the weaker branch
in this one respect: none of the production workflows has a `pull_request`
trigger, so their checks could never report on a promotion, and a promotion
carries commits that already passed every check on `acc`.

## Pinned

**36 `uses:` references across 12 workflows, all 36 digest-pinned.** Verified on
`acc` at `829dc27`, 24 September 2026 — by `npm run check-supply-chain`, which
blocks the `audit` job, so this headline cannot drift from the workflows without
failing a merge.

| Dependency                          | Pin                                                 | Version           | Maintained by                                                                                 |
| ----------------------------------- | --------------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------- |
| `actions/checkout` (×12)            | `3d3c42e5aac5ba805825da76410c181273ba90b1`          | v7.0.1            | Renovate                                                                                      |
| `actions/setup-node` (×10)          | `820762786026740c76f36085b0efc47a31fe5020`          | v7.0.0            | Renovate                                                                                      |
| `Azure/static-web-apps-deploy` (×9) | `4d27395796ac319302594769cfe812bd207490b1`          | v1                | **manual** — Renovate updates are disabled for it, see below                                  |
| `actions/upload-artifact` (×2)      | `043fb46d1a93c77aae656e7c1c64a875d1fc6a0a`          | v7.0.1            | Renovate                                                                                      |
| `azure/login` (×2)                  | `a641126d1b8aa4d1fa005f4f92df94a3a4c4c906`          | v3.1.0            | Renovate                                                                                      |
| `zizmorcore/zizmor-action`          | `cc914d7f3750a2d13d75c7f184a1060aa0e9d482`          | v0.6.4            | Renovate                                                                                      |
| zizmor itself                       | `version: '1.29.0'` input, not `latest`             | 1.29.0            | Renovate — as the image `ghcr.io/zizmorcore/zizmor`, in the `github actions` group; see below |
| `renovate-config-validator`         | `npx --package renovate@44.50.3`                    | 44.50.3           | **manual** — an inline npx argument, not a manifest entry                                     |
| Semgrep itself                      | `pip install semgrep==1.176.1`                      | 1.176.1           | **manual** — a version inside a `run:` block, which no Renovate manager parses                |
| npm dependencies                    | `package-lock.json`, `sha512` integrity per package | lockfileVersion 3 | Renovate                                                                                      |

The zizmor pin is stronger than it looks: `zizmor-action` resolves the requested
version through an internal digest table and runs
`ghcr.io/zizmorcore/zizmor:1.29.0@sha256:863026d5…` — a genuine container digest
pin.

**Renovate maintains that input, although this table said `manual` until
15 September 2026.** Its `github-actions` manager does not parse action inputs in
general, but it maps `zizmor-action` to the Docker image
`ghcr.io/zizmorcore/zizmor` (`known-actions.ts` in Renovate), and the Dependency
Dashboard (#16) lists `ghcr.io/zizmorcore/zizmor 1.29.0` with 1.30.1 queued.
linked-data-explorer#139 and ttl-editor#144 corrected the same claim. Two things
follow:

- **The image and the action must move together.** `zizmor-action` runs only the
  zizmor versions in its own digest table: 1.30.1 is in v0.6.4's and not in
  v0.6.3's. This repository is already on v0.6.4, so the queued 1.30.1 is safe.
  In general the `github actions` group, which collects minor, patch and digest
  updates for every `github-actions` dependency, brings both in one pull request.
  Not always: each clears the 14-day cooldown on its own clock, and zizmor
  publishes before the action release that adds it, so a group branch can briefly
  hold the image update alone and fail `audit` at "Run zizmor". Do not merge it in
  that state. A major zizmor release waits for dashboard approval separately, and
  then the action bump has to merge first.
- **This row is still kept current by hand.** `check-supply-chain` reads `uses:`
  lines and skips prose rows like this one, so nothing fails when it goes stale —
  which is how it came to say `manual` with an update queued. Before recording
  that Renovate cannot see something, read the dashboard's detected dependencies.

## Where this repo is _stronger_ than the ttl-editor pattern

**The deployed artifact is built by our own pipeline, not inside the vendor
container.** All six Static Web Apps **deploy** steps set `skip_app_build: true` and point
`app_location` at an already-built `dist/`. (The other three SWA references are
`action: 'close'` steps, which tear down a preview environment and build nothing.) The build runs earlier in the same
job, on pinned `actions/setup-node`, installing via `npm ci` against
`package-lock.json`.

So the `sha512` integrity row above covers **what is shipped**, not merely what
is tested. In `ttl-editor` the opposite holds: Oryx builds inside the floating
container there, so its lockfile integrity covers only the test run. The
difference is `skip_app_build`, and it is worth preserving deliberately.

## Dependency audit, daily

Every gate above runs on a commit. A new advisory lands against code that has
not changed, so a pipeline that only reacts to commits never sees it — and
Dependabot alerts watch the default branch, `acc`, not the `main` that
production deploys from. ICTU recommendation 10, tracked in [linked-data-explorer#119](https://github.com/sgort/linked-data-explorer/issues/119).

`.github/workflows/dependency-audit.yml` runs at 05:17 UTC daily, and on
demand. It audits **both `acc` and `main`**, reading each branch's lockfile
with `npm audit --package-lock-only`, so it installs nothing.

|                           |                                                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Job / check context       | `dependency-audit` — deliberately not `audit`, which is zizmor's required check in every one of these repositories |
| Fails on                  | a **high or critical** advisory in **production** dependencies                                                     |
| Reports but does not fail | moderate and low advisories, and everything dev-only                                                               |
| Where it reports          | the run's step summary, and one tracking issue it opens, updates and closes                                        |
| Node                      | an exact literal, not `.nvmrc` — it audits a branch that need not carry one                                        |

**It counts advisories, not packages.** `npm audit` reports one entry per
affected package, so one advisory on a widely-used package looks like dozens of
findings: on 24 September 2026 linked-data-explorer's 28 "moderate" entries were
three advisories, 24 of them the same `@tiptap/core` reached through its
extensions. `scripts/audit-tree.mjs` groups by advisory before reporting.
A number that overstates the problem gets ignored, which is the failure mode a
daily audit exists to avoid.

**A run that cannot audit exits 2, and is treated like a finding.** A tool that
fails to run must not report a clean tree — the same rule `--no-suppress-errors`
enforces for Semgrep.

**What it will report here on its first runs:** one production high,
`adm-zip` 0.6.0, reached only through the unused `keycloak-connect` (#204).
`adm-zip` 0.6.1 clears the 14-day cooldown on 25 September, so the next
lock-file maintenance closes it and the issue closes itself.

## Exceptions

### `mcr.microsoft.com/appsvc/staticappsclient:stable` — cannot be pinned

`Azure/static-web-apps-deploy` is a three-line wrapper whose `action.yml`
declares `runs: using: docker, image: "Dockerfile"`, and that Dockerfile is:

```dockerfile
FROM mcr.microsoft.com/appsvc/staticappsclient:stable
COPY entrypoint.sh /entrypoint.sh
ENTRYPOINT ["sh", "/entrypoint.sh"]
```

A floating tag, hardcoded inside a third-party action, unreachable from our side.

**Scope of the exposure, stated precisely.** Because `skip_app_build: true` is
set everywhere, this container does **not** build the production bundle — it
uploads and deploys one we built ourselves. It still receives the deploy token
and the built artifact, so a compromised image could alter what is published or
exfiltrate the token. That is serious, but narrower than the `ttl-editor` case,
where the same image is also the build toolchain.

**Reachable from our side:** no. **Would require:** Microsoft publishing
digest-pinned image references, or IOU forking the action. **Accepted risk,**
reviewed when this document is next revised.

### `Azure/static-web-apps-deploy@v1` — ambiguous ref, and Renovate would revert it

`v1` exists as **both** a tag (`1a947af9992250f3bc2e68ad0754c0b0c11566c9`,
2021-03-03) and a branch head (`4d27395796ac319302594769cfe812bd207490b1`,
2024-09-11), 3.5 years apart. Resolution of ambiguous refs is undocumented, so
the pinned digest was taken from evidence rather than inference: the executed
surface — `action.yml`'s `runs` block, the Dockerfile and `entrypoint.sh` — is
byte-identical at both commits, GitHub's own API resolves `v1` to the branch, and
the branch declares a strict superset of inputs.

Renovate's `github-tags` datasource resolves `v1` to the **tag**, so it would
open a routine-looking digest update reverting **all nine** references to
2021 code. `minimumReleaseAge` gives no protection — the target commit is years
old. Updates for this dependency are therefore disabled in `renovate.json`, with
the reasoning recorded inline there too.

### ~~`node-version` floats — and three sources disagree~~ — closed 2026-09-12

**No longer an exception.** Kept here rather than deleted, because what it got
wrong is worth more than what it got right.

It read: eight of the nine workflows request `node-version: '20'`, resolving to
whatever 20.x the runner downloads; `.nvmrc` says `22`; `engines.node` says
`>=20.13.0`; developers therefore work on a different major than the one
producing the deployed artifact.

**There was a fourth source, and it was the one that settled it.** Both App
Service plans run **`NODE|22-lts`**. So the workflows were not merely floating —
they were building the deployed backend on a major the host does not run. That
fact appears nowhere in the paragraph above, and it is what turned a
three-way stylistic disagreement into a one-sided answer.

Closed by [#36](https://github.com/sgort/ronl-business-api/issues/36): the eight
deploy workflows now read `node-version-file: .nvmrc`, `.nvmrc` carries an exact
`22.22.0` rather than a bare major — the same "may not float" rule the digests
above follow — and `engines.node` is `>=22`. Renovate's `node` manager parses
`.nvmrc`, so it stays maintained rather than hand-bumped.

`zizmor.yml` keeps its own literal `node-version` on Node 24, and that part was
right all along: `renovate@44.50.3` declares `engines.node ^24.11.0`, and npm
accepts a mismatch with an `EBADENGINE` **warning** rather than refusing — so the
validator had been running unsupported and green. That pin is load-bearing; do
not sweep it into the shared file. It was a bare `'24'` until
[#139](https://github.com/sgort/ronl-business-api/pull/139) made it an exact
`24.20.0` on 2026-09-14, closing the last floating Node version in CI under the
same rule as `.nvmrc`; Renovate's `node` manager keeps it current, behind the
14-day cooldown like every other dependency.

### The runner image — `ubuntu-24.04` pins a release, not an image

Every job ran on `ubuntu-latest` until
[linked-data-explorer#119](https://github.com/sgort/linked-data-explorer/issues/119),
a label GitHub moves to a new Ubuntu release on its own schedule. All thirteen
jobs now name `ubuntu-24.04`, so a change of OS release arrives as a diff in
this repository rather than silently under every job at once. ICTU
recommendation 2.

That pins the **release**, not the image. GitHub rebuilds `ubuntu-24.04` about
weekly, and a hosted runner cannot be pinned to a digest. What the jobs depend
on is pinned separately — Node through `.nvmrc`, actions by digest, npm packages
by the lockfile — so the weekly rebuild changes the environment around the
build, not its inputs. Renovate's `github-actions` manager documents reading a
versioned `runs-on` label as a `github-runner` dependency; confirm it is listed
on the Dependency Dashboard before relying on that.

**Reachable from our side:** the release, yes, and done; the image, no.
**Accepted risk** for the image, reviewed when this document is next revised.

### The App Service runtime — `NODE|22-lts` pins a major, and that is all Azure offers

Both App Services run `NODE|22-lts`, and so do Linked Data Explorer's two. ICTU
recommendation 2 asks for a pin at the highest precision the platform allows.
Here the platform allows very little: `az webapp list-runtimes --os linux`
returns, for Node, exactly

```
NODE|22-lts   NODE|24-lts   NODE|26
```

Major-level only. There is no `NODE|22.23.2`, no digest, and no setting that
takes one. **So the answer to "pin exactly" is that it cannot be done, and this
paragraph is the record of why** — the resolution linked-data-explorer#119 asks
for when the platform will not cooperate.

What remains reachable is the thing that actually bites: keeping the App
Service's major in step with `.nvmrc`'s. Today both are 22 and they agree. They
can disagree, and the failure is quiet — the build runs on one major and the
host runs the artifact on another, which is the mismatch #36 closed for the
workflows and this document's `node-version` section describes. It is live right
now in the other repository: linked-data-explorer#80 bumps `.nvmrc` from 22 to
24 and is held open precisely because merging it alone would build on 24 and run
on 22.

**The ordering is therefore part of the pin.** A Node major bump changes two
things in two places, and the App Service must move first:

1. switch both App Services to the new `NODE|<major>-lts`,
2. then merge the `.nvmrc` bump.

No pull-request check runs against an App Service, so nothing enforces this. It
is a written rule, and it is written here because this is the file that is read
before a promotion.

**Reachable from our side:** the major, yes; an exact version, no — Azure does
not offer one. **Accepted**, with the ordering rule above as the compensating
control.

### Container images — pinned by digest where this repository applies them

The local development stack in `docker-compose.yml` pins all five of its images
by tag **and** digest, and Renovate maintains them: `docker:pinDigests` is in
`renovate.json`'s `extends`, beside `helpers:pinGitHubActionDigests`. The same
rule that file already states for actions applies here — pinning without
automated updates decays into an unpatched tree, which is worse than floating.

Two of those five were `:latest` before, and they are the reason this mattered
more than it looked. **A floating tag is invisible to Renovate**: it has no
version to compare, so `alpine:latest` and `operaton/operaton:latest` were the
only images in the tree that nothing was watching at all. The other three were
already tracked by version and merely unpinned by digest.

The digests recorded are the **index** digests, not per-platform ones, so the
pin stays correct on an amd64 and an arm64 workstation alike.

**The three compose files under `deployment/vm/` are deliberately not pinned
yet**, and that is #196. Nothing in this repository applies them — no workflow,
no script reads them — so a digest there would record a value no deploy
consults, against a host whose running image cannot be read from here. A pin
that cannot be verified is a pin that can be wrong with nothing saying so. That
issue brings the ACC and PROD VM deployment under action control first, and pins
second.

### The package-manager cooldown — `.npmrc`, and where it does not reach

Renovate's `minimumReleaseAge` covers only the updates Renovate proposes.
Lock-file maintenance hands the refresh to npm, which is where the transitive
tree moves, and Renovate documents that its own cooldown cannot apply there.
Since [linked-data-explorer#119](https://github.com/sgort/linked-data-explorer/issues/119),
the root `.npmrc` sets `min-release-age=14`, so npm itself will not resolve a
version younger than 14 days. For its own update pull requests Renovate uses
whichever cutoff is stricter, and if npm answers `ETARGET` on a security fix it
retries without the cutoff. ICTU recommendation 6.

Three places it does not reach, all measured on 19 September 2026:

- **`npm ci`** ignores it on purpose (npm/cli#9281). CI's test and build jobs
  only run `npm ci`, so they cannot fail on it, and are not protected by it.
- **npm older than 11.10** ignores it without a warning. Node 22.23.2, which
  `.nvmrc` names, bundles npm 10.9.8. `scripts/check-deps.sh` warns about this at
  every dev-server start and push, and names `npm install -g npm@11`.
- **The backend deploy** installs in `packages/backend/deploy/`, which has its
  own `package.json`, so npm treats it as a separate project and never reads the
  root `.npmrc`. That install has no lockfile either; see the next section and
  #34.

**Reachable from our side:** yes, and done for the first two as far as npm
allows; the third closes with #34.

### The backend is deployed outside CI, and its dependencies are unpinned

`azure-backend-{acc,prod}.yml` run build, lint, test, package a zip and call
`upload-artifact`. **Neither contains a deploy step.** They are build-and-test
gates; nothing consumes the artifact they produce.

The backend actually reaches acceptance and production through
`deploy-backend-to-{acc,prod}.sh`, run from a developer machine. They exist
because a workflow-based App Service deploy could not be made to work.

**Both scripts are tracked and reviewable in git.** `.gitignore` carries a broad
`deploy-backend-to-*.sh` followed by an explicit `!` negation for each script that
belongs in the repository. The pattern exists so an ad-hoc local variant is not
committed by accident; it was never hiding the real ones. That matters for this
register's purpose - the deployed dependency tree is resolved by these scripts, so
their contents have to be readable by someone other than the person who runs them.

Until 29 August 2026 that was only half true. An untracked
`deploy-backend-to-acc-portable.sh` carried an archiver fallback the tracked script
lacked, and on a managed Windows laptop it was the one that actually ran - so the
script really performing acceptance deploys was the single one nobody could
review. It has now replaced `deploy-backend-to-acc.sh` outright. The merged script
prefers Info-ZIP's `zip` when it is present, leaving Ubuntu behaviour unchanged,
and falls back to the bsdtar that Windows bundles at `System32	ar.exe` when it is
not, because `zip` cannot be installed on a managed Windows laptop.

`deploy-backend-to-prod.sh` carries the identical archiver logic, so both scripts
run from either platform. It was Ubuntu-only until the same day, for no reason
other than that nobody had needed it from Windows yet - which would have been an
unwelcome discovery during a production release.

Both scripts now open with an Azure-session preflight. `az account show` is not
sufficient for this and was the original trap: it reads cached local state and
succeeds against a refresh token that expired days earlier, so the deploy failed
only after both builds, the production install and the zip. Only a real ARM call
proves the session works, so the preflight asks for the target App Service itself

- covering an expired session, the wrong subscription, and a missing app in one
  request, before the builds rather than after them.

What that means for this document's scope:

- **Nothing here covers the backend deploy path.** Pinning the workflows does not
  touch it, the `audit` gate never sees it, and the `acc` ruleset cannot gate it.
  The pinning work covers what CI runs, and CI does not deploy the backend.
- **The deployed dependency tree is unpinned.** The script runs
  `npm pkg delete dependencies.@ronl/shared` and then
  `npm install --production --omit=dev` inside `packages/backend/deploy/` — a
  directory with a `package.json` but **no lockfile**. Resolution happens against
  semver ranges, on a developer machine, leaving no CI record of what was
  installed. The CI workflows' "Prepare deployment package" step used to carry
  the same pattern; it now installs from the root lockfile in a staging copy,
  filtered to the backend workspace with production dependencies only.
- The scripts do carry real safety rails: they refuse to run off `acc`, refuse a
  dirty working tree, and resolve an archiver before building anything. The gap is
  structural, not carelessness.

This was the widest floating surface in the repository and, unlike the container
exception above, it was fixable from our side. The workflow path is now fixed:
[#35](https://github.com/sgort/ronl-business-api/issues/35) moved the deploy
into `azure-backend-{acc,prod}.yml`, which installs from the lockfile and so
closes [#34](https://github.com/sgort/ronl-business-api/issues/34) for anything
that ships through CI.

**The scripts remain, and so does the exception — narrowed.** They are the
break-glass path when CI cannot deploy, they still resolve dependencies on a
developer machine against semver ranges, and nothing stops someone running one.
The exception closes when they are retired, not when the workflow lands.

## What the audit cannot see

zizmor validates pin **format**, never pin **truth**. A wrong or hostile digest
carrying a plausible `# v7.0.1` comment passes zizmor, Prettier and review alike,
because nothing in that gate re-resolves the reference. Nor does zizmor check
that this document still matches the workflows.

Both of those gaps are now covered by `scripts/check-supply-chain.mjs` — see
[Keeping this register true](#keeping-this-register-true) below. What follows
here is what remains outside any check.

**How a deploy credential reaches CI is not checked either.** Nothing verifies
that a secret holds what its author meant. Piping a token straight out of the
Azure CLI stores a trailing newline —

```bash
az staticwebapp secrets list … --query properties.apiKey -o tsv | gh secret set <NAME>
```

— 120 bytes where the key is 119. Both halves are the documented way to do their
job; the composition is what goes wrong. It cost the public site's first
production deploy on 12 September 2026, and the failure named nothing: every
build step passed, then `An unknown exception has occurred` with a DeploymentId
printed first, so it read as an upload that began and failed rather than an
authentication that never happened.

A secret's value cannot be read back, so no check can confirm this after the
fact and none is proposed. `scripts/set-secret.sh` removes the trap at the point
of use instead: it reads the value from stdin, strips whitespace, refuses an
empty result, and reports the byte count it stored — the one piece of evidence
that survives.

```bash
az staticwebapp secrets list … -o tsv | bash scripts/set-secret.sh <NAME>
```

The value is never echoed, never passed as an argument, and never written to a
file. Issue #97.

**Production is not yet protected.** The `*-prod.yml` files are pinned by this
change, but GitHub Actions runs the workflow file _from the branch being pushed_.
Measured on `origin/main`, 29 August 2026: **4 workflows, 13 `uses:` references,
0 digest-pinned.** `main` will keep using those copies until `acc` is promoted.
Pinning the file is not the same as pinning the branch that runs it.

## Keeping this register true

The Pinned table is the only part of this document a machine reads.
`scripts/check-supply-chain.mjs` runs in the `audit` job and compares it with
the workflows — digests, versions, the `(×N)` multiplicities, and the
`30 uses: references across 9 workflows` headline — then resolves every digest
against the GitHub API to confirm it is the version its comment claims. Run it
by hand with `npm run check-supply-chain`; `--offline` skips the API and checks
format and register agreement only.

**This repository is why the count half exists.** Between the v7 upgrades
(`2026.08.33`) and 29 August 2026 the table still listed superseded v4 digests
for `actions/checkout`, `actions/setup-node` and `actions/upload-artifact`: the
workflows had moved, the register had not, and every gate stayed green
throughout. A quieter drift came with it — `setup-node` had gone from ×8 to ×9
when the `renovate-config-validator` step was added, and the `renovate@44.50.3`
pin that step introduced was missing from the table entirely. A count is as easy
to falsify as a digest, and neither the audit nor review caught it. That
reconciliation was manual, prompted by a documentation review rather than by any
check here. It is no longer an assumption.

**Renovate does not maintain this table.** It rewrites workflow pins and their
version comments together, honestly and correctly, and never touches this file.
So an action-bump pull request leaves the register describing a policy the
workflows no longer follow — the same drift as above, arriving by the most
routine route there is.

**So: when a Renovate pull request bumps an action, update this table on that
pull request's branch, before merging it.** Not afterwards. The check runs on the
pull request, so a register fixed after the merge leaves the check red for that
pull request's entire life — and makes the step impossible to promote to
blocking, because no bump could ever show a green result to merge on.

Adding or removing a workflow step that carries a `uses:` line also moves the
`(×N)` count and the totals headline. That is the ×8→×9 case above, and the check
now fails on it rather than leaving it to a reader.

**The step blocks.** It ran `continue-on-error: true` from its adoption
([#81](https://github.com/sgort/ronl-business-api/issues/81)) until
[#83](https://github.com/sgort/ronl-business-api/issues/83) promoted it, waiting
on exactly one thing: evidence that the paragraph above — update the register on
the bump's own branch — is a habit that holds _here_, and not only in
linked-data-explorer, where it was proven over two bumps
([#66](https://github.com/sgort/linked-data-explorer/pull/66),
[#67](https://github.com/sgort/linked-data-explorer/pull/67)).

[#101](https://github.com/sgort/ronl-business-api/pull/101) supplied it.
Renovate bumped `zizmorcore/zizmor-action` from v0.6.2 to v0.6.4 and, as
described above, left this register behind; the register was then updated on
Renovate's branch and the check went green there, before any merge.

That same pull request is also the argument against waiting any longer. Before
the register was fixed, the check reported:

```
1 finding(s):
  [register] zizmorcore/zizmor-action: workflow pins cc914d7f3750… (v0.6.4)
             but SECURITY-PIPELINE.md records only 3dc1ecc9bcb9… (v0.6.2)
```

— while the step, the job and the pull request's checks list **all read
"success"**. `continue-on-error` rewrites the _step's_ reported conclusion as
well as the job's, and the honest result (`outcome: failure`) is not exposed by
the REST API at all, so nothing outside that one log knew. A check nobody can
see fail is not protecting anything; it is a check that has to be remembered,
which is the condition this register drifted in to begin with.

The cost, stated plainly: a network call now sits inside a required check, so a
GitHub API outage or rate limit can fail a gate unrelated to the change under
review. `--offline` is the answer if that ever bites — it keeps the register
half blocking and drops only the half that needs the network. Restoring
`continue-on-error` is not, because it restores the invisibility above.

## Pending work

This document records what _is_. Pending work lives in
[`docs/superpowers/plans/2026-08-28-ci-follow-ups.md`](docs/superpowers/plans/2026-08-28-ci-follow-ups.md),
following the same convention as the other follow-up lists in that directory.

Highest value there, and the only item on this page's exceptions list that is
fixable from our side: **pin the backend deploy bundle's dependencies**, which
today are resolved by an `npm install` with no lockfile, on a developer machine,
for the artifact that ships to production.
