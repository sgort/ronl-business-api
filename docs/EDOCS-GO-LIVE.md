# eDOCS go-live runbook

How to switch the eDOCS connector from stub mode to a live OpenText eDOCS DM
server, validate it from the command line before touching the UI, and roll back.

The switch is a **config change, not a code change** — it is driven entirely by
`config.edocs.stubMode` ([edocs.service.ts](../packages/backend/src/services/edocs.service.ts)).
In stub mode every method returns realistic fake data; in live mode the same
methods talk to the DM server. Callers cannot tell the difference, so the switch
is transparent to the routes, the BPMN worker, and the frontend.

## What runs when you flip the flag

The whole chain below is under test (see [TESTS.md](./TESTS.md)), so going live
exercises code that already has coverage:

```
Frontend / BPMN
      │
      ▼
/v1/edocs routes ──► EdocsService ──► OpenText eDOCS DM REST API
      ▲                   ▲
      │                   └── externalTaskWorker (rip-edocs-workspace / -document topics)
      └── jwt + audit middleware
```

- `EdocsService` — connect/re-auth, workspace ensure, document upload, listing.
- `externalTaskWorker` — the Operaton external-task worker that calls
  `EdocsService` for the `rip-edocs-workspace` and `rip-edocs-document` topics.
  This is how eDOCS is driven in production (from BPMN), not just the direct API.

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

---

## Step 0 — Green baseline

```bash
npm test --workspace=@ronl/backend
```

All backend tests must pass. This is the safety net: the live code path is
already covered, so a regression here is caught before you touch eDOCS.

## Step 1 — Configure live (local)

Edit `packages/backend/.env.development`:

```
EDOCS_STUB_MODE=false
EDOCS_BASE_URL=https://<host>:<port>/edocsapi/v1.0     # root, no /connect
EDOCS_USER_ID=<service-account>
EDOCS_PASSWORD=<service-account-password>
EDOCS_LIBRARY=<library>
```

## Step 2 — Restart the backend

```bash
npm run dev --workspace=@ronl/backend
```

Restart rather than relying on hot reload — `tsx watch` reloads on source
changes, not `.env` edits. On boot the `[EdocsService] Running in STUB MODE` log
line should be **gone**.

## Step 3 — CLI smoke test against live (before the UI)

> **Fast check first (no Keycloak, no backend).** To answer just "is eDOCS
> reachable and can we log in?" run the in-process probe — it calls
> `EdocsService.healthCheck()` against your local `.env`, so it needs no
> `CLIENT_SECRET` and no running backend:
>
> ```bash
> cd packages/backend && npm run edocs:health
> ```
>
> It prints `reachable` + `authenticated` and exits `0` (ok), `3` (reachable but
> login failed — e.g. account locked out), or `4` (unreachable). The full smoke
> test below now runs this same probe as a pre-flight and aborts before the token
> dance if it fails.

This is the pre-flight. It hits the same `/v1/edocs` path the frontend uses, from
the shell, so nothing UI-related can mask the result.

```bash
# Local backend → live eDOCS:
CLIENT_SECRET=<m2m-secret> \
BASE_URL=http://localhost:3002 \
KEYCLOAK_URL=http://localhost:8080 \
bash scripts/test-edocs-live.sh

# Or straight against ACC (script defaults):
CLIENT_SECRET=<m2m-secret> bash scripts/test-edocs-live.sh
```

It obtains a Keycloak `client_credentials` token (the same `operaton-mcp-client`
used by `test-m2m-routes.sh`), then runs, in order:

1. `GET /v1/edocs/status` — the **gate**. It asserts:
   - `stubMode: false` — the switch took effect,
   - `reachable: true` — the DM server responds,
   - `authenticated: true` — the credentials can actually log in.

   If any fail, the script **stops here and creates nothing**.

2. `GET /v1/edocs/workspaces` — list.
3. `POST /v1/edocs/workspaces/ensure` — create a timestamped `SMOKE-<date>` workspace.
4. `POST /v1/edocs/documents` — upload a small text document to it.
5. `GET /v1/edocs/workspaces/:id/documents` — list it back.

> **reachable vs. authenticated.** `/status` reports these separately on purpose.
> `reachable` is an unauthenticated `GET /libraries`; `authenticated` performs a
> real login. Early on we saw `status: up` while `connect()` was failing — that
> was reachability passing while login failed. The gate now checks
> `authenticated`, so a green pre-flight means login genuinely works.

> **Real artifacts.** A successful run creates a real workspace + document in
> eDOCS (the service has no delete). The `SMOKE-<timestamp>` naming keeps them
> identifiable for manual cleanup.

### Reading a failure

The backend now logs the upstream eDOCS error body, e.g.:

```
eDOCS connect returned an error response {
  status: 400,
  upstream: { ERROR: { message: "The referenced account is currently locked out …",
                       rapi_code: "0X80070775" } }
}
```

| Symptom (`/status`)                       | Likely cause / action                                       |
| ----------------------------------------- | ----------------------------------------------------------- |
| `stubMode: true`                          | `EDOCS_STUB_MODE` still `true`, or backend not restarted    |
| `reachable: false`                        | Wrong `EDOCS_BASE_URL`, network/TLS, or server down         |
| `reachable: true`, `authenticated: false` | Login rejected — bad credentials, or **account locked out** |

> **Lockout warning.** Repeated failed logins can lock the service account. The
> health check throttles the login probe (reuses a live session; caches a failed
> probe for 30 s) so `/status` polling cannot lock the account — but a wrong
> password in `.env` will still lock it via real calls. **Verify the password
> before retrying**, and unlock the account (eDOCS admin) after a lockout.

## Step 4 — (Recommended) the BPMN worker path

The routes above are the direct API; in production eDOCS is driven by the
external-task worker reacting to Operaton tasks. To rehearse that, run a RIP
process instance far enough to hit the `rip-edocs-workspace` /
`rip-edocs-document` tasks and confirm the worker completes them (the workspace
id and document number land back in the process variables).

## Step 5 — Frontend

Only once Steps 3 (and ideally 4) are green, exercise the UI. Any failure now is
far more likely UI wiring than eDOCS integration — you've already proven the
integration from the shell.

---

## Rollback (instant)

```
EDOCS_STUB_MODE=true
```

then restart. No code change, no deploy. Every caller transparently returns stub
data again.

## Promote to ACC / production

1. Set the same five `EDOCS_*` variables in the **deployment environment** (not
   `.env.development`).
2. Deploy / restart the backend.
3. Run the smoke script against that environment before anyone uses its UI:
   ```bash
   CLIENT_SECRET=<env-m2m-secret> bash scripts/test-edocs-live.sh
   # (BASE_URL / KEYCLOAK_URL default to ACC; override for other environments)
   ```
4. Roll back by setting `EDOCS_STUB_MODE=true` and restarting.

## Operational notes

- Prefer a **dedicated service account** over a personal user id — a personal
  account lockout would take the integration down.
- The eDOCS service has **no delete**; smoke-test artifacts must be cleaned up
  manually if your library requires it.
- Related: [TESTS.md](./TESTS.md) (eDOCS test coverage),
  [scripts/test-edocs-live.sh](../scripts/test-edocs-live.sh) (the smoke suite).
