# Python MCP Server — Proof of Concept (plan)

**Goal**: prove that a Python-SDK MCP server, running in its own local Docker
container, can be registered as an `McpProvider` in this backend's existing
`McpRegistry` and driven through the AI Assistant's chat UI against a
pre-selected LLM — exactly like the existing `edocs` / `operaton` / `lde` /
`triplydb` / `cprmv` providers, just with a Python server instead of a
Node/TypeScript one.

**Scope for the POC**: read-only. The Python server exposes MCP tools that
call existing, already-proven routes on this backend —
`GET /v1/m2m/process` (list active Operaton process instances, no tenant
filter; `packages/backend/src/routes/m2m.routes.ts:110`),
`GET /v1/m2m/process/:id/status`, and the same 4 read-only eDOCS routes
already exposed by the Node `EdocsMcpProvider` (`GET /v1/edocs/workspaces`,
`GET /v1/edocs/workspaces/:id/documents`, `GET /v1/edocs/documents/:id/profile`,
`GET /v1/edocs/documents/:id/versions`) — rather than inventing new backend
capability. Covering two unrelated upstream systems (Operaton, eDOCS) through
the same container/client/auth plumbing is deliberate: it proves the
architecture generalizes, not just that one route works. The point of this
POC is the _plumbing_ (Docker → Python MCP SDK → streamable HTTP → Node
`McpProvider` → AI Assistant), not new data access.

---

## Architecture

```
┌────────────────────────────────┐        ┌───────────────────────────────────┐
│ ronl-business-api (Node)       │  HTTP  │ python-mcp-poc (new container)    │
│ runs on host (npm run dev)     │──────► │ Python MCP SDK (FastMCP),         │
│ PythonPocMcpProvider.ts        │ :8765  │ streamable-http transport,        │
│ (StreamableHTTPClientTransport)│        │ on ronl-network                   │
└───────────────┬────────────────┘        └────────────────┬──────────────────┘
                │                                          │
                │ client_credentials                       │ client_credentials
                ▼                                          ▼
        ┌─────────────────────────────────────────────────────────────┐
        │ Keycloak (ronl-keycloak, already running in docker-compose) │
        └─────────────────────────────────────────────────────────────┘
                                                           │
                                  GET /v1/m2m/process(/:id/status)  — Operaton
                                  GET /v1/edocs/workspaces(/...)/documents(/...) — eDOCS
                                  Authorization: Bearer <token>
                                                           ▼
                                          ronl-business-api itself (:3002)
```

This is the same shape as `CprmvMcpProvider` (`StreamableHTTPClientTransport`
against a remote HTTP MCP endpoint) rather than the `EdocsMcpProvider` /
`LdeMcpProvider` / `TriplyDbMcpProvider` shape (spawn a local subprocess over
stdio) — stdio doesn't cross a container boundary cleanly, streamable HTTP
does, and the codebase already has a working precedent for it.

The backend itself is **not** containerized (confirmed: `docker-compose.yml`
only defines `keycloak`, `postgres`, `redis`) — it runs on the host via
`npm run dev`, the same way it already reaches Keycloak at
`http://localhost:8080`. So the Node side reaches the new container via
`http://localhost:8765`, not a Docker-internal hostname.

---

## 1. Python MCP server — `packages/backend/src/python-mcp/`

New files:

| File               | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server.py`        | `FastMCP` app. Chat-exposed tools: `process_list` (→ `GET /v1/m2m/process`), `process_status(instance_id)` (→ `GET /v1/m2m/process/:id/status`), `workspace_list` (→ `GET /v1/edocs/workspaces`), `workspace_documents(workspace_id)` (→ `GET /v1/edocs/workspaces/:id/documents`), `document_profile(document_id)` (→ `GET /v1/edocs/documents/:id/profile`), `document_versions(document_id)` (→ `GET /v1/edocs/documents/:id/versions`). Also `document_upload(filename, content_base64, doc_name, department)` (→ `POST /v1/edocs/documents`, standalone) and `document_download(document_id, version)` (→ `GET /v1/edocs/documents/:id/versions/:version`) — both exist on the server and are callable over raw MCP, but are **not** allow-listed for chat (see §4); they exist solely so `scripts/test-edocs-live.sh` can prove this route creates and reads back its own document, independent of the direct `/v1/edocs` route. Runs via `mcp.run(transport="streamable-http")` on port 8765. |
| `auth.py`          | Keycloak `client_credentials` token fetch + cache (mirrors `getToken()` in `src/mcp-servers/edocs/index.ts:27` — cache with early refresh, one retry on 401/403).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `requirements.txt` | `mcp`, `httpx`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `Dockerfile`       | `python:3.12-slim`, `pip install -r requirements.txt`, `EXPOSE 8765`, `CMD ["python", "server.py"]`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

Config via environment (injected by `docker-compose.yml`, see §2):

```
KEYCLOAK_URL=http://keycloak:8080        # Docker-internal hostname — this container IS on ronl-network
KEYCLOAK_REALM=ronl
PYTHON_MCP_CLIENT_ID=python-mcp-poc-client
PYTHON_MCP_CLIENT_SECRET=<matches the Keycloak client secret, §3>
BACKEND_BASE_URL=http://host.docker.internal:3002   # backend runs on the host, not in Docker
```

`host.docker.internal` resolves to the host from inside a Linux container
under Docker Desktop (Windows) without extra config — this repo already runs
under Docker Desktop for Windows per `docker-compose.yml`. Note this is the
opposite direction from `KEYCLOAK_URL`: the Python container reaches Keycloak
_inside_ `ronl-network` by service name, but reaches the backend _outside_
Docker via `host.docker.internal`.

No changes to `EdocsService`-style "call the backend's own REST API instead
of the upstream system directly" pattern — same principle, applied here to
both `m2m.routes.ts` (Operaton) and `edocs.routes.ts` (eDOCS). The eDOCS
tools reuse the exact same read-only route set and policy already applied to
the Node `EdocsMcpProvider` — no new backend capability, just a second
client of the same routes.

---

## 2. `docker-compose.yml` changes

New service, alongside `keycloak` / `postgres` / `redis`:

```yaml
# Python MCP POC server
python-mcp-poc:
  build:
    context: ./packages/backend/src/python-mcp
  container_name: ronl-python-mcp-poc
  environment:
    KEYCLOAK_URL: http://keycloak:8080
    KEYCLOAK_REALM: ronl
    PYTHON_MCP_CLIENT_ID: python-mcp-poc-client
    PYTHON_MCP_CLIENT_SECRET: change-me-in-keycloak-console
    BACKEND_BASE_URL: http://host.docker.internal:3002
  ports:
    - '8765:8765'
  depends_on:
    keycloak:
      condition: service_healthy
  networks:
    - ronl-network
```

Follows the existing convention in this file (values inlined directly in
`environment:`, no `.env` interpolation — same as `keycloak`'s
`KEYCLOAK_ADMIN_PASSWORD: admin`). The secret placeholder matches the
`"change-me-in-keycloak-console"` convention already used for every other
M2M client `secret` in `ronl-realm.json`.

---

## 3. Keycloak — new client in `config/keycloak/ronl-realm.json`

Added directly to the realm import file, copying the exact shape of
`edocs-mcp-client` (`config/keycloak/ronl-realm.json:195-224`):

```json
{
  "clientId": "python-mcp-poc-client",
  "name": "Python MCP POC Client",
  "description": "Machine-to-machine client used by the Python MCP POC container to call this backend's own /v1/m2m/process* and /v1/edocs/* HTTP surfaces",
  "enabled": true,
  "clientAuthenticatorType": "client-secret",
  "secret": "change-me-in-keycloak-console",
  "protocol": "openid-connect",
  "publicClient": false,
  "standardFlowEnabled": false,
  "implicitFlowEnabled": false,
  "directAccessGrantsEnabled": false,
  "serviceAccountsEnabled": true,
  "fullScopeAllowed": false,
  "redirectUris": [],
  "webOrigins": [],
  "protocolMappers": [
    {
      "name": "audience-python-mcp-poc",
      "protocol": "openid-connect",
      "protocolMapper": "oidc-audience-mapper",
      "consentRequired": false,
      "config": {
        "included.client.audience": "ronl-business-api",
        "id.token.claim": "false",
        "access.token.claim": "true"
      }
    }
  ]
}
```

The `ronl-business-api` audience mapper is what lets `jwtMiddleware` accept
this client's token — both `m2m.routes.ts` (`m2m.routes.ts:71`) and
`edocs.routes.ts` (`edocs.routes.ts:9`) call only `jwtMiddleware`, no
`requireRoles`, so a valid audience is all that's required for either. One
client, one token, both upstream systems.

**Realm-import caveat, hit for real during implementation**: on a dev
Keycloak that already has a persisted `ronl` realm (i.e. any Keycloak that
isn't being bootstrapped for the first time), `--import-realm` logs
`Realm 'ronl' already exists. Import skipped` and does **not** merge in new
clients from the file — even a full container recreate. The realm-import
file only bootstraps a brand-new realm; it is not re-synced against an
existing one. On the running dev instance the client was created directly
via `kcadm.sh create clients -r ronl -f -` (see `docker exec -i ronl-keycloak
/opt/keycloak/bin/kcadm.sh ...`), with `ronl-realm.json` kept in sync as the
source of truth for anyone bootstrapping a fresh realm from scratch.

---

## 4. Node-side integration

| File                                                                   | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/backend/src/services/mcp/PythonPocMcpProvider.ts` (new)      | Modeled directly on `CprmvMcpProvider.ts`: `id: 'python-poc'`, `displayName: 'Python MCP POC'`. `StreamableHTTPClientTransport(new URL(config.pythonMcpPoc.url))`. `ALLOWED_TOOLS = new Set(['process_list', 'process_status', 'workspace_list', 'workspace_documents', 'document_profile', 'document_versions'])` — deliberately excludes `document_upload`/`document_download` even though the server advertises them (see §1), keeping the AI Assistant chat read-only. `systemPromptContribution()` describes only the six allow-listed tools. Same session-expiry reconnect-and-retry logic as `CprmvMcpProvider` (`Session not found` catch). |
| `packages/backend/src/services/mcp/PythonPocMcpProvider.test.ts` (new) | Mirrors `CprmvMcpProvider.test.ts` conventions.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `packages/backend/src/utils/config.ts`                                 | `pythonMcpPoc: { enabled: boolean; url: string }`, reading `PYTHON_MCP_POC_ENABLED` / `PYTHON_MCP_POC_URL` (default `http://localhost:8765/mcp`) — same shape as `config.cprmv`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `packages/backend/src/index.ts`                                        | `if (config.pythonMcpPoc.enabled) mcpRegistry.register(new PythonPocMcpProvider());` alongside the other conditional registrations (`index.ts:257-270`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

No frontend changes — `GET /v1/mcp/sources` and `GET /v1/mcp/models` are
already fetched dynamically by the AI Assistant UI, so `python-poc` appears
in the source picker automatically once registered and connected.

---

## 5. `.env.example` additions

```bash
# Python MCP POC provider (proof of concept)
PYTHON_MCP_POC_ENABLED=true
PYTHON_MCP_POC_URL=http://localhost:8765/mcp
```

(`PYTHON_MCP_CLIENT_ID` / `PYTHON_MCP_CLIENT_SECRET` are consumed by the
Python container itself via `docker-compose.yml`, not by the Node process —
same split as `EDOCS_MCP_CLIENT_ID`/`SECRET` today, which the Node
`EdocsMcpProvider` passes through to its spawned subprocess's `env`.)

---

## 6. Validation checklist — all confirmed

1. ✅ `docker compose up -d --build python-mcp-poc` — container builds and
   starts cleanly (`uvicorn running on http://0.0.0.0:8765`).
2. ✅ Direct MCP handshake against the container (initialize →
   `notifications/initialized` → `tools/list`), independent of the Node
   backend — confirms all six tools are advertised. Automated by
   `scripts/test-smoke-live.sh` (see its "Python MCP POC" section).
3. ✅ Backend (`npm run dev`) logs `MCP provider connected` with
   `id: 'python-poc'` and a tool count of 6.
4. ✅ `GET /v1/mcp/sources` (role-gated) includes
   `{ id: 'python-poc', connected: true, ... }` — also automated in
   `test-smoke-live.sh` (Tier 2b, python-poc-specific check).
5. ✅ AI Assistant UI: selected the `python-poc` source with
   **Anthropic — Claude Sonnet 4.6**, asked "What processes are available?" —
   the model called `process_list` and returned the real active Operaton
   instances (3 instances, 2 distinct process definitions), formatted as a
   table with a summary. No tool-call narration leaked into the response.
6. ✅ eDOCS tools proved with real data too: a direct `tools/call` for
   `workspace_list` against the running container returned live eDOCS
   workspace records (e.g. `TEST-SMOKE-LIVE-IOU-2`) — confirming the
   container → Keycloak → backend → eDOCS DM server chain works for the
   second upstream system, not just Operaton.

Together, 5 and 6 are the actual proof this POC set out to get: the same
container/client/auth plumbing, driven from the AI Assistant against a
pre-selected LLM, correctly reaches two unrelated upstream systems.

---

## 7. `scripts/test-edocs-live.sh`

A live, mutating smoke test of both eDOCS routes side by side, run directly
against the same OpenText eDOCS DM server the AI Assistant talks to — not
mocked. It exercises **two separate routes** in one script:

1. **Direct HTTP** — `GET /v1/edocs/*`, the same path the frontend uses.
2. **Python MCP POC** — the same operations over the MCP streamable-HTTP
   protocol instead of plain HTTP, calling `PythonPocMcpProvider`'s backing
   container directly (bypassing the AI Assistant chat entirely, since
   `document_upload`/`document_download` aren't chat-exposed — see §4).

Each route lists the existing workspaces (view-only, see below), then
**independently uploads its own standalone document, fetches its profile and
version list, downloads it back, and hashes the content to prove a clean
round-trip** — genuine create+read parity between the two routes, not route 2
just reading what route 1 made.

**Two live findings shaped this script, both discovered while building it,
neither a bug in this POC's own code:**

- **Workspace create/delete is not exercised.** The live workspace search
  (`ensureWorkspace`'s `DOCNAME like '<projectNumber>%'` filter) was found not
  to reliably scope by project number during testing — two runs with
  different, non-overlapping project-number prefixes both matched the same
  pre-existing workspace. Automating create+delete around a search that
  doesn't reliably scope risked the script deleting workspaces it didn't
  create (it very nearly did — see the git history around this file).
  Workspaces are listed only, never created or deleted.
- **Document delete always returns HTTP 502.** The eDOCS service account this
  script authenticates as has no delete-document right on the live DM server.
  This is a permissions fact, not a script bug, so there's no cleanup step
  and no `[y/N]` confirmation prompt — every run leaves its two uploaded
  documents behind in eDOCS by design.

### Terminal output (real run, TARGET=local)

```
── Pre-flight: eDOCS reach + login (direct · no Keycloak · local .env) ───
  ✓ eDOCS reachable
  ✓ eDOCS login OK - proceeding to the authenticated backend path.

── Obtaining token ──────────────────────────────────────────────────────
  · CLIENT_SECRET loaded from .env.development (client: operaton-mcp-client)
  ✓ Token obtained

── eDOCS status (must be live, not stub) ────────────────────────────────
  ✓ GET /v1/edocs/status (HTTP 200)
  ✓ stub mode disabled (.data.stubMode = false)
  ✓ eDOCS reachable (.data.reachable = true)
  ✓ eDOCS login succeeds (.data.authenticated = true)

── Workspaces ───────────────────────────────────────────────────────────
  ✓ GET /v1/edocs/workspaces (HTTP 200)
  ✓ workspace list body (.success = true)
  Workspaces (3):
    3349847  -  IOU TEST WORKSPACE 1
    3349848  -  IOU TEST WORKSPACE 2
    3349849  -  IOU TEST WORKSPACE 3

── Upload document (standalone) ─────────────────────────────────────────
  ✓ POST /v1/edocs/documents (standalone) (HTTP 200)
  ✓ document uploaded (documentNumber=3349854, documentId=3349854)

── Document profile ─────────────────────────────────────────────────────
  ✓ GET /v1/edocs/documents/:id/profile (HTTP 200)
  ✓ profile body (.success = true)

── Document versions ────────────────────────────────────────────────────
  ✓ GET /v1/edocs/documents/:id/versions (HTTP 200)
  ✓ versions listed (1 found)

── Download + verify content round-trip ─────────────────────────────────
  ✓ GET /v1/edocs/documents/:id/versions/0 (HTTP 200)
  ✓ downloaded content matches uploaded content (sha256 13ef62e43cb0…)

── eDOCS via Python MCP POC (read-only mirror, route 2) ──────────────────
  ✓ workspace_list via MCP (.success = true)
  Workspaces via MCP (3):
    3349847  -  IOU TEST WORKSPACE 1
    3349848  -  IOU TEST WORKSPACE 2
    3349849  -  IOU TEST WORKSPACE 3
  ✓ document_profile via MCP (same document as route 1) (.success = true)
  ✓ document_versions via MCP (same document as route 1) (.success = true)
  ✓ versions listed via MCP (1 found)

── eDOCS via Python MCP POC - own upload (route 2 parity) ────────────────
  ✓ document_upload via MCP (.success = true)
  ✓ document uploaded via MCP (documentNumber=3349855, documentId=3349855)
  ✓ document_profile via MCP (own upload) (.success = true)
  ✓ document_download via MCP (own upload) (.success = true)
  ✓ MCP-uploaded content round-trips correctly (sha256 3524d3139510…)

─────────────────────────────────────────────────────────────────────────
  Created in eDOCS this run (left in place - see header):
    document : 3349854  (documentNumber=3349854)  [route 1 - direct HTTP]
    document : 3349855  (documentNumber=3349855)  [route 2 - Python MCP POC]
    (set EDOCS_PORTAL_URL to print a direct InfoCenter link here)
─────────────────────────────────────────────────────────────────────────

─────────────────────────────────────────────────────────────────────────
  Results: 24 passed, 0 failed
```

Note the plain `-` separators rather than an em dash (`—`) in the script's
own echoed output: an earlier version used `—`, which rendered as mojibake
(`ÔÇö`) in this environment's terminal — a UTF-8-interpreted-as-CP1252
encoding mismatch, not a script logic bug. Fixed by using ASCII-only
separators in every runtime `echo`/`pass`/`fail` string (comments, which
never reach a terminal, were left as-is).

---

## Decisions

1. **Python server location** — `packages/backend/src/python-mcp/`, alongside
   the existing (Node) `src/mcp-servers/*` folder, rather than a new top-level
   `poc/` directory. It's built by its own Dockerfile, not by the backend's
   `tsc` build, so living under `src/` doesn't put it in the TypeScript
   compile path.
2. **Keycloak client** — added directly to `config/keycloak/ronl-realm.json`
   (not created manually via the admin console), matching how every other
   M2M client in this repo is provisioned.
3. **Transport** — streamable HTTP (`StreamableHTTPClientTransport`), same as
   `CprmvMcpProvider`, not stdio-via-`docker exec`. Least new code, no
   Docker-CLI-on-PATH dependency.
4. **Tool scope** — read-only, six tools across two unrelated upstream
   systems: `/v1/m2m/process` + `/v1/m2m/process/:id/status` (Operaton), and
   `/v1/edocs/workspaces` + `/v1/edocs/workspaces/:id/documents` +
   `/v1/edocs/documents/:id/profile` + `/v1/edocs/documents/:id/versions`
   (eDOCS — same 4 routes and same read-only policy as the Node
   `EdocsMcpProvider`). No new backend capability is added for this POC;
   covering a second upstream system was added deliberately, after the first
   pass proved out with Operaton alone, to confirm the container/client/auth
   plumbing generalizes rather than being an Operaton-specific shortcut.
5. **`document_upload`/`document_download`** — added to `server.py` so
   `scripts/test-edocs-live.sh` can prove the MCP route has genuine create+
   read parity with the direct route, not just mirror-read access. Not added
   to `PythonPocMcpProvider.ts`'s `ALLOWED_TOOLS` — the AI Assistant chat
   stays read-only per decision 4; these two tools are only ever called
   directly by the test script over raw MCP.
6. **`test-edocs-live.sh` never creates or deletes a workspace** — the live
   `ensureWorkspace` search was found not to reliably scope by project
   number during testing (two different, non-overlapping project-number
   prefixes both matched the same pre-existing workspace), so an automated
   create+delete cycle around it risked deleting workspaces the script
   didn't create. Workspaces are listed only (both routes), never mutated.
   Document delete is not attempted either — the test account has no
   delete-document right in the live DM server (confirmed via a persistent
   HTTP 502) — so both routes' uploaded documents are always left behind,
   and there is no cleanup confirmation prompt.
7. **ASCII-only separators in script output** — `test-edocs-live.sh`'s
   runtime `echo`/`pass`/`fail` strings use `-` instead of `—` (em dash).
   The em dash rendered as mojibake (`ÔÇö`) in this environment's terminal —
   a UTF-8-vs-CP1252 encoding mismatch — so every user-facing output string
   was switched to plain ASCII. Comments (never printed to a terminal) were
   left as-is.
