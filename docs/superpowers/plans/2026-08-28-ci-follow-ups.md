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

`azure-backend-{acc,prod}.yml` build, test, package a zip and call
`upload-artifact`. **Neither has a deploy step**; nothing consumes the artifact.
The deploy is the script in item 1, run by hand.

The blocker was authentication, not workflow YAML. A previous attempt could not be
made to work.

**Hypothesis, unconfirmed:** `az webapp deploy` works locally because it uses the
operator's `az login` identity, while `azure/webapps-deploy` authenticates over
SCM basic auth — which Azure now disables by default. If that is the cause, the
route is OIDC: an app registration with a federated credential for this repo,
`azure/login`, `permissions: id-token: write`, then the same `az webapp deploy`
the scripts already run.

**Confirm against a real failed run before acting on this.** It is a plausible
diagnosis reasoned from a symptom, not something observed.

Doing this also dissolves item 6 and closes the gap in item 1 at the same time,
since a workflow-based deploy would install from the lockfile in CI.

## 3. Pin the Node runtime

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

A preview frontend gets an ephemeral `*.azurestaticapps.net` origin that is not in
the backend's `CORS_ORIGIN` allowlist, and `VITE_API_URL` is baked in at build
time. The backend is not deployed per-PR at all — `azure-backend-acc.yml` has no
`pull_request` trigger — so every preview talks to the one shared acc backend, and
is refused.

Today a preview only demonstrates that static pages render. Allowing the preview
origin, and adding matching Keycloak redirect URIs where auth is involved, would
make preview deployments worth the three deploys each PR already costs.

## 5. Consider `paths:` filters on the frontend workflows

`frontend-acc`, `pa-demo-acc` and `publicsite-acc` trigger on every pull request to
`acc` regardless of what changed — a one-file config PR redeploys three sites. The
backend workflows already filter correctly.

Weigh this against the fact that a path filter is what makes item 6 possible; the
answer may be narrower filters rather than more of them.

## 6. A `package.json`-only change triggers the backend build

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

Renovate offers `actions/checkout` v7, `actions/setup-node` v7 and
`actions/upload-artifact` v7 on its dependency dashboard.

Kept separate from pinning deliberately: pinning is behaviour-preserving,
upgrading is not, and bundling them would make any failure ambiguous. This is also
what closes the Node-runtime deprecation path — the pilot repo hit a warning that
its pinned actions target a Node version the runner now force-upgrades.

## 8. Remove `dependencyDashboardApproval` from `renovate.json`

Set during adoption so Renovate raised nothing while the same workflow files were
being pinned on a branch — two agents editing the same `uses:` lines would have
conflicted.

That race is over: `renovate/pin-dependencies` has already dropped off the
dashboard, which is Renovate confirming it has nothing left to pin. Removing the
key lets it open PRs normally under the 14-day cooldown, which is the steady state
this was all built for.

One line. It needs a release to ship, so it should ride with the next one rather
than justify its own.

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
