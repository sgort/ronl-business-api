# ValidSign — promote to PROD: to-do list

What has to happen before production signs live. The feature itself is
described in [VALIDSIGN.md](VALIDSIGN.md); the general promotion procedure is
[promote-ACC-to-PROD.md](promote-ACC-to-PROD.md).

**Starting point, verified 14 September 2026:**

| Item                                   | ACC                                   | PROD (`ronl-business-api-prod`, `rg-ronl-prod`)          |
| -------------------------------------- | ------------------------------------- | -------------------------------------------------------- |
| Backend code                           | `acc` with #130, #131, #132           | `main` at `311d732` — has the feature, **not** #131/#132 |
| `VALIDSIGN_*` settings                 | five set, live                        | **none** → stub mode                                     |
| `DEPLOYMENT_ENV`                       | `acceptance`                          | `production`                                             |
| Container logging (filesystem)         | on                                    | on                                                       |
| `EDOCS_STUB_MODE`                      | `true`                                | `true`                                                   |
| First `CORS_ORIGIN` (hand-over target) | `https://acc.mijn.open-regels.nl`     | `https://mijn.open-regels.nl`                            |
| ValidSign callback handler             | registered → `acc.api.open-regels.nl` | **not registered**                                       |

Work top to bottom: each phase assumes the previous one is done.

---

## Phase 0 — Decisions with Flevoland and ValidSign

- [ ] **Does PROD sign live at all yet**, and who may sign during the first
      weeks? Every live signing is a real, binding transaction on the
      production account.
- [ ] **Callback handler for PROD.** Register a separate handler for
      `https://api.open-regels.nl/v1/validsign/callback`, or confirm how
      ValidSign scopes handlers (per API name / origin key / account). If one
      account-level handler serves both environments, PROD's callbacks would
      go to ACC — ACC answers 200 and ignores the unknown package, and PROD's
      signatures would only complete via its poller. Settle this before going
      live.
- [ ] **A PROD callback key**, distinct from ACC's test value.
- [ ] **Sender.** `VALIDSIGN_SENDER_EMAIL` is a personal address on ACC. Decide
      whether PROD uses a dedicated integration sender (recommended in the
      design) and whether the API key stays the personal account key.
- [ ] **Package name in Dutch?** ValidSign shows the English template name
      _"RIP — Preliminary Design Principles (Column 4)"_ to signers. Changing only
      the ValidSign package name leaves eDOCS names untouched.
- [ ] **Embedding on the PROD origin.** The ceremony loads in an iframe on
      `mijn.open-regels.nl`. It works from `acc.mijn.open-regels.nl`; confirm
      ValidSign allows the PROD origin too.

## Phase 1 — Tidy the callback before it ships

- [ ] **Narrow the callback check to the form ValidSign sends.** Only
      `credential: basic-raw` has been observed. Remove `basic-base64` and
      `basic-base64-pair`; decide whether `bearer` and `x-validsign-secret`
      stay. Small PR on `acc`, deployed and re-tested on ACC with one signing.
- [ ] **Rotate ACC's callback key** (agreed test value) — see
      [VALIDSIGN.md §8](VALIDSIGN.md#rotate-the-callback-key).
- [ ] Optional: the Dutch package name, if decided in phase 0.

## Phase 2 — Code on `main`

- [ ] Cut a release with `/bump-release` so the changelog records #130, #131,
      #132 (and phase 1), with the correct scope per entry.
- [ ] Promotion PR `acc` → `main`; required checks green; merged by you.
- [ ] Frontend: the production workflow deploys on merge — confirm the run.
- [ ] Backend: `deploy-backend-to-prod.sh` from a clean `main` equal to
      `origin/main` (the script refuses otherwise).
- [ ] PROD `/v1/health` healthy with a fresh uptime. VALIDSIGN is still stub at
      this point, so nothing signs live yet.

## Phase 3 — Keycloak PROD (`keycloak.open-regels.nl`, realm `ronl`)

- [ ] Protocol mappers `email`, `given_name`, `family_name` on the
      `ronl-business-api` client (`scripts/keycloak-add-token-claim-mappers.sh`).
      Without `email` the panel refuses with `MISSING_SIGNER_EMAIL`.
- [ ] The `rip-*` realm roles (`scripts/keycloak-add-rip-roles.sh`), so the
      approval task is visible at all.
- [ ] **Every intended signer has the right email address** on their account —
      on ACC it had to be set before the first proper signing session.

## Phase 4 — ValidSign side

- [ ] PROD callback handler registered (phase 0 decision): API name, origin key,
      environment, callback URL `https://api.open-regels.nl/v1/validsign/callback`,
      callback key.
- [ ] Record the registered values next to ACC's in
      [VALIDSIGN.md §7](VALIDSIGN.md#validsign-side--the-callback-handler).

## Phase 5 — PROD App Service settings

- [ ] Set all five in **one** `az webapp config appsettings set` (one restart);
      the backend refuses to start if any lock is incomplete:

| Setting                     | Value                          |
| --------------------------- | ------------------------------ |
| `VALIDSIGN_STUB_MODE`       | `false`                        |
| `VALIDSIGN_LIVE_TIERS`      | `production`                   |
| `VALIDSIGN_API_KEY`         | agreed key (secret)            |
| `VALIDSIGN_CALLBACK_SECRET` | the PROD callback key (secret) |
| `VALIDSIGN_SENDER_EMAIL`    | agreed sender                  |

- [ ] Verify stored values without printing them (compare hashes), as done for
      ACC.
- [ ] PROD restarts healthy; the startup log shows _"ValidSign service
      initialised"_ with `stubMode: false`, `deploymentEnv: production`,
      `liveTiers: ["production"]`, and _"ValidSign poller started"_.

## Phase 6 — First live signing on PROD

- [ ] One agreed signer, one agreed project: drive it to _Accorderen
      Projectplan 4_, claim, sign.
- [ ] PROD log: _"ValidSign package created"_, _"ValidSign callback received"_
      with the expected `credential`, _"Signature completed"_ within seconds of
      `PACKAGE_COMPLETE`. A _"callback rejected"_ line means the key or handler
      is wrong; no callback line at all means the handler does not point at PROD.
- [ ] ValidSign's evidence email: transaction id equals the process variable
      `validsignPackageId`.
- [ ] The process moved past the approval gateway with `approvalStatus=approved`;
      `validsignArchiveStatus` is `ok` (archived to the eDOCS **stub** while
      `EDOCS_STUB_MODE=true`).
- [ ] Update the status table in [VALIDSIGN.md](VALIDSIGN.md) and tick the
      promotion issue.

## Rollback

- [ ] Know it before phase 5: set `VALIDSIGN_STUB_MODE=true` on PROD (restart).
      Resolve any in-flight live package first — in stub mode it will not
      complete.
- [ ] To take signing off the task entirely: remove `ronl:signatureRef` from
      `Task_AccorderenProjectplan4` in LDE's `RipR21Process.bpmn` and redeploy;
      the task falls back to its form.

## Later, not blocking

- [ ] eDOCS live on PROD, so signed PDFs are archived for real
      ([EDOCS-GO-LIVE.md](EDOCS-GO-LIVE.md)).
- [ ] A dedicated integration sender and key instead of a personal account.
- [ ] Signing on other RIP phase exits (BPMN tag per task).
