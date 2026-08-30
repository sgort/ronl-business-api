# Supply-chain pinning — CI follow-ups

Carried out of `chore/supply-chain-pinning` (released as `2026.08.31`), which
pinned all 27 action references to commit digests, scoped `GITHUB_TOKEN` to least
privilege, and added the blocking `Supply-chain audit` gate — taking zizmor from
49 findings to 0.

**None of these block anything.** They were surfaced while pinning and
deliberately left out of it, because that change was kept behaviour-preserving:
if a deploy had broken, the cause had to be attributable to pinning rather than to
an improvement bundled alongside it.

Ordered by value-for-effort, not severity. Nothing here leaks today. The current
state of what is pinned, and what cannot be, lives in `SECURITY-PIPELINE.md`; this
file is the pending work.

---

## 1. Pin the backend deploy bundle's dependencies

> Tracked as [#34](https://github.com/sgort/ronl-business-api/issues/34).

The widest floating surface in the repository, and the only one on this list that
is both reachable from our side and about what actually ships.

`deploy-backend-to-{acc,prod}.sh` build a bundle in `packages/backend/deploy/`,
then run:

```
npm pkg delete dependencies.@ronl/shared
npm install --production --omit=dev
```

That directory has a `package.json` but **no lockfile**. The dependency tree
deployed to the backend App Service is therefore resolved fresh against semver
ranges, on a developer machine, with no integrity checking and no record of what
was installed. The same pattern exists in the CI workflows' "Prepare deployment
package" step, but that copy is never deployed.

**The fix is `npm ci --omit=dev` against a copied lockfile**, and it is not a
one-word change. `@ronl/shared` is a workspace dependency npm cannot fetch from
the registry, which is why it is deleted from `package.json` before the install
and copied into `node_modules` afterwards. A lockfile-based install needs the
same treatment, or it will fail resolving a package that does not exist on the
registry.

## 2. Move the backend deploy into a workflow

> Tracked as [#35](https://github.com/sgort/ronl-business-api/issues/35).

`azure-backend-{acc,prod}.yml` build, test, package a zip and call
`upload-artifact`. **Neither has a deploy step**; nothing consumes the artifact.
The deploy is the script in item 1, run by hand.

The blocker was authentication, not workflow YAML. A previous attempt could not be
made to work.

**The hypothesis this item carried has been disproved.** It read: `azure/webapps-deploy`
fails because it authenticates over SCM basic auth, which Azure now disables by
default.

`linked-data-explorer` runs exactly that action against the same subscription and
deploys its backend successfully. Its `azure-backend-acc.yml` uses
`azure/webapps-deploy@v3` with a `publish-profile` secret, and it ran green on
2026-08-29, including a post-deploy health check and endpoint verification. So SCM
basic auth is **not** disabled subscription-wide, and the blocker here is
per-App-Service configuration rather than a platform default.

That also changes the recommended route. This item proposed OIDC — an app
registration with a federated credential, `azure/login`, `permissions: id-token:
write`. LDE shows a **publish-profile secret is sufficient**, which is materially
cheaper and needs no app registration at all. Try it in this order:

1. Download the publish profile for the App Service and store it as a repository
   secret, the way LDE stores `AZURE_WEBAPP_PUBLISH_PROFILE_ACC`.
2. Add the deploy step: `azure/webapps-deploy` with `publish-profile:` and
   `package:` pointing at the artifact these workflows already build.
3. Only if that fails, check whether basic auth is disabled on **that specific App
   Service** — and reach for OIDC only if it is and cannot be re-enabled.

The original caution still stands for step 3: confirm against a real failed run
rather than reasoning from a symptom.

Doing this also dissolves item 6 and closes the gap in item 1 at the same time,
since a workflow-based deploy would install from the lockfile in CI.

## 3. Pin the Node runtime

> Tracked as [#36](https://github.com/sgort/ronl-business-api/issues/36).

The workflows request `node-version: '20'`, which resolves to whatever 20.x
`actions/setup-node` downloads at run time. Under a policy of "nothing a pipeline
downloads may float", that is an exception.

There are currently three answers to the same question:

| Source         | Says         |
| -------------- | ------------ |
| workflows      | `20`         |
| `.nvmrc`       | `22`         |
| `engines.node` | `>= 20.13.0` |

So developers work on a different Node major than the one producing the deployed
artifact. `node-version-file: .nvmrc` would settle it in one place — once the
three are meant to agree, which is the question to answer first.

## 4. Make PR previews worth opening

> Tracked as [#37](https://github.com/sgort/ronl-business-api/issues/37).

A preview frontend gets an ephemeral `*.azurestaticapps.net` origin that is not in
the backend's `CORS_ORIGIN` allowlist, and `VITE_API_URL` is baked in at build
time. The backend is not deployed per-PR at all — `azure-backend-acc.yml` has no
`pull_request` trigger — so every preview talks to the one shared acc backend, and
is refused.

Today a preview only demonstrates that static pages render. Allowing the preview
origin, and adding matching Keycloak redirect URIs where auth is involved, would
make preview deployments worth the three deploys each PR already costs.

## 5. The `pull_request` trigger has no `paths:` filter

> **Done.** The push filter is mirrored onto `pull_request` in
> `azure-frontend-acc.yml`, `azure-pa-demo-acc.yml` and
> `azure-publicsite-acc.yml` — 4, 4 and 2 paths respectively, copied rather than
> re-derived, so `packages/pa-cockpit/**` travels with them.
>
> `zizmor.yml` deliberately keeps **no** `paths:` filter: the audit must run on
> every pull request regardless of what changed. The backend workflows have no
> `pull_request` trigger at all.

`frontend-acc`, `pa-demo-acc` and `publicsite-acc` trigger on every pull request to
`acc` regardless of what changed — a one-file config PR redeploys three sites, and
each preview holds a Static Web Apps staging environment. With three apps and a
three-environment ceiling, five open PRs exhausted the quota on 2026-08-28 and two
Renovate PRs failed on `BadRequest … maximum number of staging environments`.

**This is smaller than it looks.** The `paths:` blocks already exist and are
correct — on the `push` trigger, including the `packages/pa-cockpit/**` dependency
that a naive filter would have missed:

```yaml
on:
  push:
    branches: [acc]
    paths: # ← already here, already right
      - 'packages/frontend/**'
      - 'packages/shared/**'
      - 'packages/pa-cockpit/**'
      - '.github/workflows/azure-frontend-acc.yml'
  pull_request:
    types: [opened, synchronize, reopened, closed]
    branches: [acc] # ← no paths: at all
```

So the work is **mirroring an existing correct filter onto `pull_request`**, not
designing one.

One wrinkle to think through rather than copy blindly: `close_pull_request_job`
fires on the `closed` type. Once `pull_request` is filtered, a PR touching no
frontend files will not run the close job either — which is right, since it never
created a preview. But a PR that _did_ touch frontend files and then reverted them
before merging could leave an environment stranded.

Weigh this against item 6: a path filter is what makes that false positive
possible, so the answer may be narrower filters rather than simply more of them.

## 6. A `package.json`-only change triggers the backend build

> Tracked as [#38](https://github.com/sgort/ronl-business-api/issues/38).

`azure-backend-acc.yml` is path-filtered on `packages/backend/**`, which matches
`package.json`. Adding a script or bumping `engines` fires a full backend build
even though no source changed, and — because the habit is to run the deploy script
whenever that workflow fires — invites a deploy of byte-identical code.

Observed on the `2026.08.32` release merge: the only backend change was a
`test:serial` script and an `engines` floor, and the workflow ran.

The question to ask before deploying is not "did the workflow run" but:

```bash
git diff --name-only <last-deployed-sha>..HEAD -- packages/backend/src packages/shared/src
```

Empty output means there is nothing to deploy. Item 2 dissolves this properly, by
making "did it run" and "was it deployed" the same question.

## 7. Action major upgrades

> **Done.** Shipped in `2026.08.33` (#21, #22, #23). `actions/checkout` →
> `3d3c42e5` v7.0.1, `actions/setup-node` → `820762786` v7.0.0,
> `actions/upload-artifact` → `043fb46d` v7.0.1. The Node-runtime deprecation is
> closed: v7 declares node24 natively, where the pinned v4 actions targeted a
> version the runner had begun force-upgrading.
>
> The checkout upgrade also covers `zizmor.yml`, so the audit gate now runs on
> v7 — the one change whose failure would have been self-obscuring. It passed on
> all three merges, verifying the upgrade by the mechanism it upgrades.

Renovate offers `actions/checkout` v7, `actions/setup-node` v7 and
`actions/upload-artifact` v7 on its dependency dashboard.

Kept separate from pinning deliberately: pinning is behaviour-preserving,
upgrading is not, and bundling them would make any failure ambiguous. This is also
what closes the Node-runtime deprecation path — the pilot repo hit a warning that
its pinned actions target a Node version the runner now force-upgrades.

## 8. Remove `dependencyDashboardApproval` from `renovate.json`

> Tracked as draft PR [#20](https://github.com/sgort/ronl-business-api/pull/20), open since 2026-08-28.

Set during adoption so Renovate raised nothing while the same workflow files were
being pinned on a branch — two agents editing the same `uses:` lines would have
conflicted.

That race is over: `renovate/pin-dependencies` has already dropped off the
dashboard, which is Renovate confirming it has nothing left to pin. Removing the
key lets it open PRs normally under the 14-day cooldown, which is the steady state
this was all built for.

One line. It needs a release to ship, so it should ride with the next one rather
than justify its own.

## 9. The deploy workflows need a `concurrency:` group

> **Done.** Added to all six workflows that deploy to Azure, keyed
> `${{ github.workflow }}-${{ github.ref }}` — per workflow file, so acc and prod
> never cancel each other, and per ref, so pull requests never cancel each other's
> previews, only their own superseded runs.
>
> The three acc workflows use `cancel-in-progress: true`; a superseded acceptance
> deploy is wasted work. The three prod workflows use **`false`** so runs queue
> instead: interrupting a live production deployment to start another is worse
> than waiting for it, and production deploys are rare enough that the wait costs
> nothing.
>
> The backend workflows are untouched — they build and upload an artifact and
> never reach Azure, so no race exists there.
>
> **Corrected the same day.** The first key was
> `${{ github.workflow }}-${{ github.ref }}`, which looked like it separated a
> pull request from a push but did not: merging #25 fired the
> `pull_request(closed)` teardown and the `push` deploy simultaneously, they
> landed in one group, and each pair cancelled one of its two members at random —
> two acc deploys skipped and one preview left standing. The key now reads
> `${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}`,
> which keys pull requests on their number and pushes on the ref, so the two can
> never collide.

None of the deploy workflows declares one, so two merges within a few minutes send
two deployments at the same Azure Static Web Apps environment and **Azure picks a
loser** — reporting `Deployment Canceled` on a job that did nothing wrong.

Observed while merging #21, #22 and #23 for `2026.08.33`:

```
35a7b0c  success   start 05:41:41   end 05:45:26
9fe004c  failure   start 05:42:01   end 05:45:22   ← cancelled by Azure
```

Twenty seconds apart, same environment. Nothing was actually broken — zero files
differ in `packages/public-site` between those two commits, so the successful run
had already published the correct bytes — but the run history carried a red mark
that reads like a real deployment failure, and clearing it took a manual
`workflow_dispatch`.

**The fix** is a `concurrency:` block per deploy workflow, so GitHub serialises
them and cancels the _superseded_ run cleanly rather than letting Azure arbitrate:

```yaml
concurrency:
  group: publicsite-acc
  cancel-in-progress: true
```

Two things to get right when writing it:

- **The group must be per environment, not per workflow file.** `acc` and `prod`
  deploy to different Static Web Apps and must not cancel each other.
- **Think about PR previews.** Each pull request deploys to its own preview
  environment, so a group keyed only on the workflow would make two PRs cancel
  each other's previews. The group likely needs the ref or PR number in it —
  something like `${{ github.workflow }}-${{ github.ref }}`.

This will recur, and more often as the Renovate queue drains: any two PRs merged
in quick succession can produce a spurious failure on any of the three sites.

**Do this alongside item 5** — it touches exactly the same workflow files, and
both are about the `pull_request` half of those triggers behaving differently
from the `push` half.

---

## Not follow-ups — resolved, recorded so they are not re-raised

**The `staticappsclient:stable` container cannot be pinned.** It is hardcoded
inside a third-party action and unreachable from our side. Its exposure here is
narrower than it first appears, because all six deploy steps set
`skip_app_build: true` — the container uploads an artifact this pipeline built
rather than building it. (The other three references to that action are
`action: 'close'` steps, which build nothing.) Recorded in `SECURITY-PIPELINE.md`.

**The `@v1` ambiguity is settled.** `Azure/static-web-apps-deploy` publishes `v1`
as both a 2021 tag and a 2024 branch head. The pinned digest is the branch commit,
chosen on evidence: the executed surface is byte-identical at both, GitHub's API
resolves the ref to the branch, and the branch declares a superset of inputs.
Renovate is blocked from "updating" it back to the tag by a `packageRules` entry.

**The zizmor version pin is manual, by necessity.** It lives in a `with:` input,
which Renovate's github-actions manager does not parse. Not a defect to fix — a
property to remember, recorded in the register's Maintained-by column.
