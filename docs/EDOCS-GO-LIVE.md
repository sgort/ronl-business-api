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

- `EdocsService` — connect/re-auth, workspace ensure/delete, document
  upload/download/profile/versions/delete, listing.
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
# Local backend → live eDOCS (default target — CLIENT_SECRET auto-loads from
# packages/backend/.env.<NODE_ENV>, same as test-smoke-live.sh):
bash scripts/test-edocs-live.sh

# Against ACC — always needs an explicit ACC CLIENT_SECRET:
TARGET=acc CLIENT_SECRET=<acc-m2m-secret> bash scripts/test-edocs-live.sh
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
   **Creating one is currently broken on infocenter-test.flevoland.nl — see
   [Known issues](#known-issues) below.** Point `PROJECT_NUMBER` at a workspace
   that already exists (e.g. created by hand in InfoCenter) to skip past it —
   the search branch works. This step no longer gates anything below it.
4. `POST /v1/edocs/documents` — upload a small generated PDF **standalone** (no
   `workspaceId`) — the only upload path confirmed working live, see
   [Known issues](#known-issues). Requires `metadata.department`.
5. `GET /v1/edocs/workspaces/:id/documents` — list the workspace's content
   (only runs if step 3 produced a workspace id). Exercises the endpoint fix;
   won't show the document above since it's standalone.
6. `GET /v1/edocs/documents/:id/profile` — read its profile.
7. `GET /v1/edocs/documents/:id/versions` — find its version id.
8. `GET /v1/edocs/documents/:id/versions/:version` — download it and verify the
   content matches what was uploaded (sha256 of the decoded bytes).
9. Prints whatever was created (workspace and/or document ids, plus an
   `EDOCS_PORTAL_URL` link if set) and pauses for a `y/N` confirmation before
   deleting — so you can open eDOCS InfoCenter and look first.
   `DELETE /v1/edocs/documents/:id` and/or `DELETE /v1/edocs/workspaces/:id`
   only run if confirmed (or `AUTO_CONFIRM_CLEANUP=1` for non-interactive/CI
   use); otherwise the artifacts are left in place.

> **reachable vs. authenticated.** `/status` reports these separately on purpose.
> `reachable` is an unauthenticated `GET /libraries`; `authenticated` performs a
> real login. Early on we saw `status: up` while `connect()` was failing — that
> was reachability passing while login failed. The gate now checks
> `authenticated`, so a green pre-flight means login genuinely works.

> **Real artifacts.** A successful run creates a real workspace (via ensure)
> and a real standalone document in eDOCS — independently of each other, not
> linked — and downloads the document back to verify the content round-trips.
> The script then pauses for confirmation before deleting them — decline (or
> run non-interactively without `AUTO_CONFIRM_CLEANUP=1`) and they're left
> behind, identifiable by the `SMOKE-<timestamp>` naming, for manual cleanup.

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

## Known issues

### `POST /v1/edocs/workspaces/ensure` — DM server 500 on workspace create (open)

On `infocenter-test.flevoland.nl`, workspace **search** (`GET workspaces?filter=...`)
works fine, but workspace **create** (`POST workspaces`) reliably returns:

```
HTTP 500, Content-Length: 0, Content-Type: application/json
(empty body)
```

Reproduced directly against the DM server (bypassing the backend entirely) with
two different project numbers — not a collision, not a payload validation issue.
Unlike a malformed-request rejection (which this server returns as a structured
`400` with an `ERROR.message`/`rapi_details` body — see "Reading a failure"
above), a bare `500` with no body and `Content-Length: 0` looks like an unhandled
exception **on the server side**. This blocks `ensureWorkspace()`'s create path;
it needs investigation by whoever administers that DM server, not a client-side
fix. `test-edocs-live.sh` reflects this: it aborts with a failed assertion at
the "Ensure workspace" step whenever the search doesn't already find a match.

**Workaround to test past it**: create the workspace once by hand in InfoCenter,
then run the script with `PROJECT_NUMBER=<that workspace's name>` — the search
branch (confirmed working, see below) finds it and `ensureWorkspace()` never
calls the broken create path, so the rest of the script (including upload) runs.

Separately, testing this workaround surfaced a second, now-fixed bug: the search
branch's _parsing_ was broken — `ensureWorkspace()` read `existing.data.DOCNAME`,
but a real match's fields are flat (`existing.DOCNAME`, `existing.id`, no nested
`data`), so every real search hit crashed with `Cannot read properties of
undefined (reading 'DOCNAME')`. Fixed in `edocs.service.ts`; the still-unverified
create-response parsing was given a matching flat-shape fallback
(`data.list[0].id`) alongside the original guesses, since creation itself still
500s and its real response shape has never been observed.

### `POST /v1/edocs/documents` — required real multipart, `APP_ID`, and `UV_AFD_NAAM` (fixed)

Document upload was fixed after live testing showed three things the original
implementation got wrong, discovered by testing a **workspace-less** upload
directly (bypassing the then-broken workspace create above):

1. The endpoint's declared `multipart/form-data` content-type is real — the DM
   server rejects a JSON body with an inline base64 `file` field (`400: "No
JSON data for document copy request"`, i.e. it's interpreted as a _copy_
   operation, which needs a source we never supplied). `EdocsService.uploadDocument()`
   now sends an actual multipart body (`data` part as JSON text, `file` part as
   the raw bytes) via the `form-data` package.
2. `APP_ID` must be `"DEFAULT"` — the previous default, `"INFRA"`, is rejected
   as an unrecognized linked application (`0X800401FF`).
3. `UV_AFD_NAAM` ("Behandelgroep" in InfoCenter) is a **mandatory** profile
   field with no default — omitting it fails with `"Voer alle vereiste waarden
in.:Property = UV_AFD_NAAM"`. It's now `metadata.department` on
   `EdocsDocumentMetadata` — required, same as `docName`.

Also worth knowing: a validation failure on this endpoint comes back as
**`HTTP 206`** (not a 4xx/5xx) with an `error_list` in the body — axios treats
206 as success, so `uploadDocument()` explicitly checks `error_list` and throws
if it's non-empty; otherwise a rejected upload would look like success to callers.

Verified live with a direct, workspace-less multipart POST (`APP_ID: "DEFAULT"`,
`UV_AFD_NAAM: "IVR"`) → `HTTP 200`, document created (`DOCNUM 3349815`, visible
in InfoCenter).

### `uploadDocument(workspaceId, ...)` — the workspace-ref path itself is still broken (open); standalone is now primary

Once the ensure-workspace bug above was fixed enough to reach a real workspace,
the **workspace-ref** upload path was tried against it and failed — twice, with
two different errors:

1. Without `formName`: `HTTP 206`, `error_list` message `"Kan klasse-id niet
vinden voor dit objecttype... :%OBJECT_TYPE_ID = DEFAULT"` ("cannot find a
   class-id for this object type").
2. With `formName: "D_INTERN_NIEUW"` added (the form that worked for the
   workspace-less upload) _and_ the workspace ref together: `HTTP 206`,
   `error_list` code `15`, no message text.

Neither combination tried so far succeeds when a workspace `ref` is present —
suggests items added _into_ a workspace may need a different
form/profile/object-type than a top-level document create, which isn't
something to keep guessing at blindly. Needs either eDOCS admin/vendor input on
what's valid for workspace-contained documents, or more trial-and-error.

**Given that, `uploadDocument()` now defaults to standalone**: `workspaceId` is
`string | null` (was required), and `null` skips `_restapi.ref` entirely while
defaulting `_restapi.form_name` to `"D_INTERN_NIEUW"` (the confirmed-working
form) when the caller doesn't supply one. `POST /v1/edocs/documents` reflects
this — `workspaceId` in the request body is now optional. Passing a
`workspaceId` still exercises the ref path (kept, not removed, for when the
issue above is resolved), but it does not currently work.
`test-edocs-live.sh` uploads standalone by default now, decoupled from the
"Ensure workspace" step.

### `GET /v1/edocs/workspaces/:id/documents` — endpoint didn't exist (fixed)

Once a real workspace existed to test against, `getWorkspaceDocuments()` failed
with `400: "Unknown component \"documents\""`. There is no
`workspaces/{id}/documents` sub-resource in the API — the OpenAPI spec (and a
live `GET` returning `200`) confirms workspace content is retrieved from the
workspace resource itself, `GET /workspaces/{id}`. Fixed in `edocs.service.ts`,
along with the same flat-list-item parsing fix as the search bug above. Not yet
live-verified with an actual document inside, since no upload into a workspace
has succeeded (see above) — the empty-list case was confirmed live, the
non-empty shape is inferred from the same confirmed flat pattern used elsewhere.

### Full standalone chain confirmed live (2026-07-16)

`test-edocs-live.sh` ran end-to-end against `infocenter-test.flevoland.nl`:
status → list workspaces → ensure workspace (search branch) → **standalone
upload → workspace-content list → document profile**, all `HTTP 200`. This is
the first live confirmation of the full standalone create/read chain, not just
the isolated upload probe above.

Two things in that same run need vendor input, not further guessing:

- **`GET /documents/:id/versions` returns `200` with an empty list** for a
  document created moments earlier — no error, just nothing in `data.versions`.
  Either this server doesn't expose the initial content as a discrete "version
  1" the way the OpenAPI spec implies, or versions only appear once a second
  version is added. Blocks the download-and-verify step, since it needs a
  version id.
- **`DELETE /documents/:id` failed with `400`, not a server error**:
  `"U bent niet gemachtigd de gevraagde bewerking uit te voeren"` ("not
  authorized to perform the requested operation", `rapi_code 0X8004013A`). The
  `IOUTEST` service account likely lacks delete rights (consistent with the
  "Restricted" permission shown in InfoCenter's Create Profile dialog) — ask
  the vendor/admin whether it should.

### Possible workspace-search filter issue (unconfirmed, needs follow-up)

In the same run, `PROJECT_NUMBER` was left at its default (a fresh
`SMOKE-<timestamp>`, not the `TEST-SMOKE-LIVE-IOU` workspace used earlier), yet
`ensureWorkspace()`'s search still returned `created: false` for workspace
`3349816` — the `TEST-SMOKE-LIVE-IOU` workspace. A
`DOCNAME like 'SMOKE-<timestamp>%'` filter should not match a `DOCNAME` of
`TEST-SMOKE-LIVE-IOU`. Not yet root-caused — could be the DM server not
honoring/parsing the `filter` query param, or something in how this client
builds/encodes it. Worth checking before relying on `ensureWorkspace()`'s
"found existing" result for anything that matters, and worth raising with the
vendor alongside the items above.

## Step 4 — (Recommended) the BPMN worker path

The routes above are the direct API; in production eDOCS is driven by the
external-task worker reacting to Operaton tasks. To rehearse that, run a RIP
process instance far enough to hit the `rip-edocs-workspace` /
`rip-edocs-document` tasks and confirm the worker completes them (the workspace
id and document number land back in the process variables).

> **Currently blocked for new workspaces.** `externalTaskWorker.service.ts`
> still uses the workspace-ref upload path (unchanged — see
> [Known issues](#known-issues)), so `rip-edocs-document` won't succeed until
> that's resolved. In practice `rip-edocs-workspace` already fails first for
> any project needing a genuinely new workspace, since it hits the same
> `POST /workspaces` 500 — the process won't reach the document task at all in
> that case.

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
   TARGET=acc CLIENT_SECRET=<acc-m2m-secret> bash scripts/test-edocs-live.sh
   # (TARGET=local is the default; BASE_URL / KEYCLOAK_URL override either preset)
   ```
4. Roll back by setting `EDOCS_STUB_MODE=true` and restarting.

## Operational notes

- Prefer a **dedicated service account** over a personal user id — a personal
  account lockout would take the integration down.
- The smoke test can delete its own artifacts (`deleteDocument` /
  `deleteWorkspace`), but only after an explicit `y/N` confirmation — it never
  deletes silently. Decline, or run non-interactively, to leave them for manual
  cleanup instead.
- Related: [TESTS.md](./TESTS.md) (eDOCS test coverage),
  [scripts/test-edocs-live.sh](../scripts/test-edocs-live.sh) (the smoke suite).
