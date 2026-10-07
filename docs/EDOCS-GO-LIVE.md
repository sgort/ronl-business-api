# eDOCS go-live runbook

How to switch the eDOCS connector from stub mode to a live OpenText eDOCS DM
server and validate it from the command line before touching the UI.

The switch is a **config change, not a code change** — it is driven entirely
by `config.edocs.stubMode` ([edocs.service.ts](../packages/backend/src/services/edocs.service.ts)).
In stub mode every method returns realistic fake data; in live mode the same
methods talk to the DM server. Callers cannot tell the difference, so the
switch is transparent to the routes, the BPMN worker, and the frontend.

> **Live-tested results, per-endpoint status, and known issues now live on the
> architecture documentation site**, not here — see
> [eDOCS — Live Testing](https://iou-architectuur.open-regels.nl/ronl-business-api/developer/edocs-live-testing/)
> for the full picture (what's confirmed working, what's broken, and why).
> This file stays a short local runbook: env vars and the commands to run.

## Configuration

`config.ts` reads these variables
([config.ts](../packages/backend/src/utils/config.ts)):

| Variable                       | Meaning                                                                 | Default                                                     |
| ------------------------------ | ----------------------------------------------------------------------- | ----------------------------------------------------------- |
| `EDOCS_STUB_MODE`              | `false` to go live                                                      | `true`                                                      |
| `EDOCS_BASE_URL`               | DM REST API **root** (see note below)                                   | _(empty)_                                                   |
| `EDOCS_USER_ID`                | service account user id (`testuser001`)                                 | _(empty)_                                                   |
| `EDOCS_PASSWORD`               | service account password                                                | _(empty)_                                                   |
| `EDOCS_LIBRARY`                | eDOCS library / docbase                                                 | `DOCUVITT`                                                  |
| `ENTRA_TENANT_ID`              | Flevoland's Entra tenant, for refreshing a person's ID token            | _(empty)_                                                   |
| `ENTRA_CLIENT_ID`              | the IOU-demonstrator app registration (the one Keycloak brokers)        | _(empty)_                                                   |
| `ENTRA_CLIENT_SECRET`          | its client secret — the same value Keycloak's `entra-flevoland` holds   | _(empty)_                                                   |
| `EDOCS_ALLOW_SERVICE_FALLBACK` | a person without an Entra token may act as the service account, visibly | `false`; refused on `DEPLOYMENT_ENV=production`             |
| `EDOCS_ALLOWED_CLIENTS`        | machine clients (token `azp`) allowed on `/v1/edocs`                    | `edocs-mcp-client,copilot-studio-edocs,operaton-mcp-client` |

With `EDOCS_STUB_MODE=false` the backend **refuses to start** unless
`EDOCS_USER_ID`, `EDOCS_PASSWORD` and the three `ENTRA_*` settings are set.

> **`EDOCS_BASE_URL` must be the API root, not the login endpoint.** The client
> appends `connect`, `workspaces`, `documents`, and `libraries` to the base URL.
> Use `https://<host>:<port>/edocsapi/v1.0` — **not** `.../v1.0/connect`. A
> trailing `/connect` makes every call resolve to `.../connect/<endpoint>` and 404.

Locally these go in `packages/backend/.env.development` (gitignored). On ACC /
production they are set in the deployment environment.

## People act as themselves (Entra ID)

Two identities reach eDOCS
([design](superpowers/specs/2026-10-01-edocs-per-user-entra-design.md)):

- **A person** — a caseworker or admin signed in with the _Inloggen met uw
  Flevoland-account_ button — opens an eDOCS session **as themselves**: the
  backend reads the Entra ID token Keycloak stored at their login and sends it
  in `X-DM-AUTH` on `/connect`. No password; eDOCS enforces and records that
  person's rights.
- **The service account** (`EDOCS_USER_ID`, `testuser001`) serves machine
  clients on `EDOCS_ALLOWED_CLIENTS` and background archiving (the BPMN worker,
  ValidSign).

Every `/v1/edocs` data response says which one acted: `actingAs: "user"` or
`"service"`. `GET /v1/edocs/status` adds, for a person, whether eDOCS knows
them (`data.user`). Refusals are problem details:

| Code                           | Status | Meaning                                                                                                                    |
| ------------------------------ | ------ | -------------------------------------------------------------------------------------------------------------------------- |
| `EDOCS_USER_TOKEN_UNAVAILABLE` | 403    | the person has no stored Entra token — a Keycloak account, or signed in before tokens were stored. Sign in with the button |
| `EDOCS_REAUTH_REQUIRED`        | 401    | Entra no longer refreshes the person's session — sign in again                                                             |
| `EDOCS_ACCESS_DENIED`          | 403    | eDOCS refused the person: no rights on the item, or not a user of the library / account disabled (`0X8004020C`)            |
| `EDOCS_CLIENT_NOT_ALLOWED`     | 403    | a machine client not on `EDOCS_ALLOWED_CLIENTS`                                                                            |
| `FORBIDDEN`                    | 403    | a person without the `caseworker` or `admin` role                                                                          |

**Keycloak prerequisite**, per environment: run
`scripts/keycloak-add-entra-idp.sh` (see the Entra runbook on the architecture
site). It makes `entra-flevoland` store the tokens (`offline_access`), adds the
`broker` client's `read-token` role to `default-roles-ronl`, and puts the
broker roles in `ronl-business-api`'s access token (`broker-roles` mapper).
Afterwards **each person signs in once more** for Keycloak to hold their
tokens. Until then they get `EDOCS_USER_TOKEN_UNAVAILABLE` — not the service
account — unless `EDOCS_ALLOW_SERVICE_FALLBACK=true`.

**Accepted risk** ([#325](https://github.com/sgort/ronl-business-api/issues/325)):
a person's Keycloak access token — the one the browser holds — can read their
own stored Entra token from Keycloak's broker endpoint, and so reach eDOCS as
them past RBA's audit for about an hour.

## Running it

```bash
# Green baseline first
npm test --workspace=@ronl/backend

# Restart the backend after editing .env — tsx watch does not reload .env edits
npm run dev --workspace=@ronl/backend

# Fast reach/login check only — no Keycloak, no running backend:
cd packages/backend && npm run edocs:health

# Full live smoke test (local backend → live eDOCS, default target):
bash scripts/test-edocs-live.sh
#   1b checks a Keycloak person without an Entra token is refused;
#   1c (PERSON_TOKEN=<a Flevoland-signed-in person's Keycloak token>) checks
#   eDOCS knows that person and answers actingAs "user"

# Against ACC — always needs an explicit ACC CLIENT_SECRET:
TARGET=acc CLIENT_SECRET=<acc-m2m-secret> bash scripts/test-edocs-live.sh
```

The workspace-**create** path is currently broken server-side (see the
architecture site) — point `PROJECT_NUMBER` at a workspace that already
exists (created by hand in InfoCenter) to skip past it; document upload no
longer depends on a workspace at all (standalone is the primary, only
confirmed-working path).

## Known issues

See [eDOCS — Live Testing](https://iou-architectuur.open-regels.nl/ronl-business-api/developer/edocs-live-testing/)
on the architecture site — that page is now the source of truth for
per-endpoint results and known issues, kept current as testing continues.

## Rollback (instant)

```
EDOCS_STUB_MODE=true
```

then restart. No code change, no deploy. Every caller transparently returns
stub data again.

## Operational notes

- The service account is `testuser001`; a person's eDOCS work no longer goes
  through it. It is still a password login, so verify `EDOCS_PASSWORD` before
  live runs — every failed attempt counts towards a lockout.
- The smoke test can delete its own artifacts (`deleteDocument` /
  `deleteWorkspace`), but only after an explicit `y/N` confirmation — it never
  deletes silently.
- Related: [testing docs](https://iou-architectuur.open-regels.nl/ronl-business-api/developer/testing/overview/), [scripts/test-edocs-live.sh](../scripts/test-edocs-live.sh).
