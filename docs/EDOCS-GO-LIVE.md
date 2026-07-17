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

`config.ts` reads five eDOCS variables
([config.ts](../packages/backend/src/utils/config.ts)):

| Variable          | Meaning                               | Default    |
| ----------------- | ------------------------------------- | ---------- |
| `EDOCS_STUB_MODE` | `false` to go live                    | `true`     |
| `EDOCS_BASE_URL`  | DM REST API **root** (see note below) | _(empty)_  |
| `EDOCS_USER_ID`   | service account user id               | _(empty)_  |
| `EDOCS_PASSWORD`  | service account password              | _(empty)_  |
| `EDOCS_LIBRARY`   | eDOCS library / docbase               | `DOCUVITT` |

> **`EDOCS_BASE_URL` must be the API root, not the login endpoint.** The client
> appends `connect`, `workspaces`, `documents`, and `libraries` to the base URL.
> Use `https://<host>:<port>/edocsapi/v1.0` — **not** `.../v1.0/connect`. A
> trailing `/connect` makes every call resolve to `.../connect/<endpoint>` and 404.

Locally these go in `packages/backend/.env.development` (gitignored). On ACC /
production they are set in the deployment environment.

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

- Prefer a **dedicated service account** over a personal user id — a personal
  account lockout would take the integration down.
- The smoke test can delete its own artifacts (`deleteDocument` /
  `deleteWorkspace`), but only after an explicit `y/N` confirmation — it never
  deletes silently.
- Related: [TESTS.md](./TESTS.md), [scripts/test-edocs-live.sh](../scripts/test-edocs-live.sh).
