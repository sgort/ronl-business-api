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

| Dependency                          | Pin                                                 | Version           | Maintained by                                                                        |
| ----------------------------------- | --------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------ |
| `actions/checkout` (×9)             | `11d5960a326750d5838078e36cf38b85af677262`          | v4.4.0            | Renovate                                                                             |
| `actions/setup-node` (×8)           | `49933ea5288caeca8642d1e84afbd3f7d6820020`          | v4.4.0            | Renovate                                                                             |
| `Azure/static-web-apps-deploy` (×9) | `4d27395796ac319302594769cfe812bd207490b1`          | v1                | **manual** — Renovate updates are disabled for it, see below                         |
| `actions/upload-artifact` (×2)      | `ea165f8d65b6e75b540449e92b4886f43607fa02`          | v4.6.2            | Renovate                                                                             |
| `zizmorcore/zizmor-action`          | `3dc1ecc9bcb9e94e9b2c709687979e1298497054`          | v0.6.2            | Renovate                                                                             |
| zizmor itself                       | `version: '1.29.0'` input, not `latest`             | 1.29.0            | **manual** — an action input, which Renovate's github-actions manager does not parse |
| npm dependencies                    | `package-lock.json`, `sha512` integrity per package | lockfileVersion 3 | Renovate                                                                             |

The zizmor pin is stronger than it looks: `zizmor-action` resolves the requested
version through an internal digest table and runs
`ghcr.io/zizmorcore/zizmor:1.29.0@sha256:863026d5…` — a genuine container digest
pin.

## Where this repo is _stronger_ than the ttl-editor pattern

**The deployed artifact is built by our own pipeline, not inside the vendor
container.** Every Static Web Apps step sets `skip_app_build: true` and points
`app_location` at an already-built `dist/`. The build runs earlier in the same
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

### `node-version: '20'` floats — and disagrees with `.nvmrc`

The workflows request `node-version: '20'`, which resolves to whatever 20.x
`actions/setup-node` downloads at run time. Under a policy of "nothing a pipeline
downloads may float", that is an exception.

Worth recording alongside it: **`.nvmrc` says `22`** while CI builds on 20, and
`package.json` declares `engines.node >= 20.13.0`. Developers therefore work on a
different Node major than the one producing the deployed artifact. Not a
supply-chain defect, but a divergence that belongs on the record — and
`node-version-file: .nvmrc` would close both issues at once if the two are meant
to agree.

### The backend deployment package installs without a lockfile

`azure-backend-{acc,prod}.yml` builds a deploy bundle and then runs, inside it:

```
npm pkg delete dependencies.@ronl/shared
npm install --production --omit=dev
```

That `npm install` runs in `packages/backend/deploy/`, which has a `package.json`
but **no lockfile**. Dependency resolution for the artifact that ships to the
backend App Service therefore happens fresh at CI time, against semver ranges,
with no integrity pinning — the root `package-lock.json` does not govern it.

This is the widest floating surface in the repository, and unlike the two
exceptions above it _is_ reachable from our side: copying the lockfile into the
bundle and using `npm ci --omit=dev` would close it. Deliberately not changed
here, to keep the pinning change behaviour-preserving. Queued for the CI
improvement pass.

## What the audit cannot see

zizmor validates pin **format**, never pin **truth**. A wrong or hostile digest
carrying a plausible `# v4.4.0` comment passes the gate, Prettier and review
alike. Nothing here re-checks that a digest resolves to the tag it claims, and
nothing checks that this document still matches the workflows — Renovate updates
pins and never touches it. A `scripts/check-supply-chain.mjs` preflight covering
both is planned.

**Production is not yet protected.** The `*-prod.yml` files are pinned by this
change, but GitHub Actions runs the workflow file _from the branch being pushed_.
`main` still carries unpinned copies and will keep using them until `acc` is
promoted. Pinning the file is not the same as pinning the branch that runs it.
