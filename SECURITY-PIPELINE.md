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

| Setting                         | Required state                 | Why                                                                                            |
| ------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------- |
| Renovate GitHub App             | installed, scoped to this repo | `renovate.json` is inert until it is                                                           |
| Dependabot **alerts**           | enabled                        | `vulnerabilityAlerts` consumes this feed; without it the no-cooldown security lane never fires |
| Dependabot **security updates** | **disabled**                   | it opens competing PRs that ignore the 14-day cooldown                                         |
| Merge methods                   | merge commits only             | squash and rebase rewrite the SHAs a changelog entry names                                     |
| `acc` ruleset                   | require PR + `audit` check     | a workflow that runs but cannot block is advice, not a gate                                    |

## Pinned

**30 `uses:` references across 9 workflows, all 30 digest-pinned.** Verified on
`acc` at `570f973`, 29 August 2026.

| Dependency                          | Pin                                                 | Version           | Maintained by                                                                        |
| ----------------------------------- | --------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------ |
| `actions/checkout` (×9)             | `3d3c42e5aac5ba805825da76410c181273ba90b1`          | v7.0.1            | Renovate                                                                             |
| `actions/setup-node` (×9)           | `820762786026740c76f36085b0efc47a31fe5020`          | v7.0.0            | Renovate                                                                             |
| `Azure/static-web-apps-deploy` (×9) | `4d27395796ac319302594769cfe812bd207490b1`          | v1                | **manual** — Renovate updates are disabled for it, see below                         |
| `actions/upload-artifact` (×2)      | `043fb46d1a93c77aae656e7c1c64a875d1fc6a0a`          | v7.0.1            | Renovate                                                                             |
| `zizmorcore/zizmor-action`          | `3dc1ecc9bcb9e94e9b2c709687979e1298497054`          | v0.6.2            | Renovate                                                                             |
| zizmor itself                       | `version: '1.29.0'` input, not `latest`             | 1.29.0            | **manual** — an action input, which Renovate's github-actions manager does not parse |
| `renovate-config-validator`         | `npx --package renovate@44.50.3`                    | 44.50.3           | **manual** — an inline npx argument, not a manifest entry                            |
| npm dependencies                    | `package-lock.json`, `sha512` integrity per package | lockfileVersion 3 | Renovate                                                                             |

The zizmor pin is stronger than it looks: `zizmor-action` resolves the requested
version through an internal digest table and runs
`ghcr.io/zizmorcore/zizmor:1.29.0@sha256:863026d5…` — a genuine container digest
pin.

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

### `node-version` floats — and three sources disagree

Eight of the nine workflows request `node-version: '20'`, which resolves to
whatever 20.x `actions/setup-node` downloads at run time. Under a policy of
"nothing a pipeline downloads may float", that is an exception.

The ninth is deliberate and pinned differently: the `renovate-config-validator`
step in `zizmor.yml` sets `node-version: '24'`, because `renovate@44.50.3`
declares `engines.node ^24.11.0` and npm accepts a mismatch with an
`EBADENGINE` **warning** rather than refusing — so the validator had been
running unsupported and green.

Worth recording alongside it: **`.nvmrc` says `22`** while CI builds on 20, and
`package.json` declares `engines.node >= 20.13.0`. Developers therefore work on a
different Node major than the one producing the deployed artifact. Not a
supply-chain defect, but a divergence that belongs on the record — and
`node-version-file: .nvmrc` would close both issues at once if the two are meant
to agree.

### The backend is deployed outside CI, and its dependencies are unpinned

`azure-backend-{acc,prod}.yml` run build, lint, test, package a zip and call
`upload-artifact`. **Neither contains a deploy step.** They are build-and-test
gates; nothing consumes the artifact they produce.

The backend actually reaches acceptance and production through
`deploy-backend-to-{acc,prod}.sh`, run from a developer machine. They exist
because a workflow-based App Service deploy could not be made to work.

**`.gitignore` lists them, but two of the three are tracked anyway.**
`.gitignore` carries `deploy-backend-to-*.sh`, which reads as though none of them
is in the repository. In fact `deploy-backend-to-acc.sh` and
`deploy-backend-to-prod.sh` are both **tracked** — an ignore rule does not
untrack a file that was already committed. Only
`deploy-backend-to-acc-portable.sh` is genuinely ignored. This matters for the
register's purpose: the deployed dependency tree is resolved by a script whose
contents are reviewable in git, not by a local file nobody else can see. That is
better than the ignore rule implies, and worth stating accurately rather than
repeating the tidier claim. A
`-portable` variant exists alongside them: the original targets Ubuntu, while the
portable one falls back to the bsdtar Windows bundles at `System32\tar.exe`,
because Info-ZIP's `zip` cannot be installed on a managed Windows laptop.

What that means for this document's scope:

- **Nothing here covers the backend deploy path.** Pinning the workflows does not
  touch it, the `audit` gate never sees it, and the `acc` ruleset cannot gate it.
  The pinning work covers what CI runs, and CI does not deploy the backend.
- **The deployed dependency tree is unpinned.** The script runs
  `npm pkg delete dependencies.@ronl/shared` and then
  `npm install --production --omit=dev` inside `packages/backend/deploy/` — a
  directory with a `package.json` but **no lockfile**. Resolution happens against
  semver ranges, on a developer machine, leaving no CI record of what was
  installed. The same pattern exists in the CI workflows' "Prepare deployment
  package" step, but that copy is never deployed.
- The scripts do carry real safety rails: they refuse to run off `acc`, refuse a
  dirty working tree, and resolve an archiver before building anything. The gap is
  structural, not carelessness.

This is the widest floating surface in the repository and, unlike the container
exception above, it is fixable from our side — see "Queued CI improvements".

## What the audit cannot see

zizmor validates pin **format**, never pin **truth**. A wrong or hostile digest
carrying a plausible `# v4.4.0` comment passes the gate, Prettier and review
alike. Nothing here re-checks that a digest resolves to the tag it claims, and
nothing checks that this document still matches the workflows — Renovate updates
pins and never touches it. A `scripts/check-supply-chain.mjs` preflight covering
both is planned.

**That second gap is not hypothetical — it already bit.** Between the v7 action
upgrades (`2026.08.33`) and 29 August 2026, this document's Pinned table still
listed the superseded v4 digests for `actions/checkout`, `actions/setup-node` and
`actions/upload-artifact`. The workflows had moved; the register had not, and
every gate stayed green throughout — which is exactly the failure mode described
above.

A second, quieter drift came with it: `setup-node` had gone from ×8 to ×9 when
the `renovate-config-validator` step was added, and the `renovate@44.50.3` pin
that step introduced was absent from the table entirely. A count is as easy to
falsify as a digest, and neither the audit nor review catches it.

The reconciliation was manual, prompted by a documentation review rather than by
any check in this repository. Until the planned preflight exists, **treat "the
register matches the workflows" as an assumption, not a guarantee** — and
re-derive the table from the workflow files whenever a pin changes.

**Production is not yet protected.** The `*-prod.yml` files are pinned by this
change, but GitHub Actions runs the workflow file _from the branch being pushed_.
Measured on `origin/main`, 29 August 2026: **4 workflows, 13 `uses:` references,
0 digest-pinned.** `main` will keep using those copies until `acc` is promoted.
Pinning the file is not the same as pinning the branch that runs it.

## Pending work

This document records what _is_. Pending work lives in
[`docs/superpowers/plans/2026-08-28-ci-follow-ups.md`](docs/superpowers/plans/2026-08-28-ci-follow-ups.md),
following the same convention as the other follow-up lists in that directory.

Highest value there, and the only item on this page's exceptions list that is
fixable from our side: **pin the backend deploy bundle's dependencies**, which
today are resolved by an `npm install` with no lockfile, on a developer machine,
for the artifact that ships to production.
