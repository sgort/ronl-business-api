# Python MCP Server — Proof of Concept (plan)

**Goal**: prove that a Python-SDK MCP server, running in its own local Docker
container, can be registered as an `McpProvider` in this backend's existing
`McpRegistry` and driven through the AI Assistant's chat UI against a
pre-selected LLM — exactly like the existing `edocs` / `operaton` / `lde` /
`triplydb` / `cprmv` providers, just with a Python server instead of a
Node/TypeScript one.

**Scope for the POC**: read-only. The Python server exposes MCP tools that
call one existing, already-proven route on this backend —
`GET /v1/m2m/process` (list active Operaton process instances, no tenant
filter; `packages/backend/src/routes/m2m.routes.ts:110`) and
`GET /v1/m2m/process/:id/status` — rather than inventing new backend
capability. The point of this POC is the _plumbing_ (Docker → Python MCP SDK
→ streamable HTTP → Node `McpProvider` → AI Assistant), not new data access.

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
                                          GET /v1/m2m/process(/:id/status)
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

| File               | Purpose                                                                                                                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server.py`        | `FastMCP` app. Tools: `process_list` (→ `GET /v1/m2m/process`), `process_status(instance_id)` (→ `GET /v1/m2m/process/:id/status`). Runs via `mcp.run(transport="streamable-http")` on port 8765. |
| `auth.py`          | Keycloak `client_credentials` token fetch + cache (mirrors `getToken()` in `src/mcp-servers/edocs/index.ts:27` — cache with early refresh, one retry on 401/403).                                 |
| `requirements.txt` | `mcp`, `httpx`.                                                                                                                                                                                   |
| `Dockerfile`       | `python:3.12-slim`, `pip install -r requirements.txt`, `EXPOSE 8765`, `CMD ["python", "server.py"]`.                                                                                              |

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
`m2m.routes.ts` instead of `edocs.routes.ts`.

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
  "description": "Machine-to-machine client used by the Python MCP POC container to call this backend's own /v1/m2m/process* HTTP surface",
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
this client's token — `m2m.routes.ts` only calls `jwtMiddleware`, no
`requireRoles`, so a valid audience is all that's required (confirmed in
`m2m.routes.ts:71`). Realm re-import (`--import-realm`) picks this up on the
next `docker compose up` of the `keycloak` service; existing running
containers need a recreate (`docker compose up -d --force-recreate
keycloak`) since Keycloak only imports on startup.

---

## 4. Node-side integration

| File                                                                   | Change                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/backend/src/services/mcp/PythonPocMcpProvider.ts` (new)      | Modeled directly on `CprmvMcpProvider.ts`: `id: 'python-poc'`, `displayName: 'Python MCP POC'`. `StreamableHTTPClientTransport(new URL(config.pythonMcpPoc.url))`. `ALLOWED_TOOLS = new Set(['process_list', 'process_status'])`. `systemPromptContribution()` describing the two tools. Same session-expiry reconnect-and-retry logic as `CprmvMcpProvider` (`Session not found` catch). |
| `packages/backend/src/services/mcp/PythonPocMcpProvider.test.ts` (new) | Mirrors `CprmvMcpProvider.test.ts` conventions.                                                                                                                                                                                                                                                                                                                                           |
| `packages/backend/src/utils/config.ts`                                 | `pythonMcpPoc: { enabled: boolean; url: string }`, reading `PYTHON_MCP_POC_ENABLED` / `PYTHON_MCP_POC_URL` (default `http://localhost:8765/mcp`) — same shape as `config.cprmv`.                                                                                                                                                                                                          |
| `packages/backend/src/index.ts`                                        | `if (config.pythonMcpPoc.enabled) mcpRegistry.register(new PythonPocMcpProvider());` alongside the other conditional registrations (`index.ts:257-270`).                                                                                                                                                                                                                                  |

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

## 6. Validation checklist

1. `docker compose up -d --build python-mcp-poc` — container starts, logs
   show a successful Keycloak token fetch.
2. `curl -X POST http://localhost:8765/mcp -H "Accept: application/json, text/event-stream" ...` (or the Python MCP SDK's own test client) — confirm the server responds and lists `process_list` / `process_status` as tools, standalone, before touching the Node side.
3. Start the backend (`npm run dev`), confirm the log line `MCP provider connected` with `id: 'python-poc'` and a tool count of 2.
4. `GET /v1/mcp/sources` — response includes `{ id: 'python-poc', connected: true, ... }`.
5. AI Assistant UI: select the `python-poc` source, pick any configured LLM (`modelId`), ask e.g. "what active process instances are there?" — confirm the model calls `process_list` and returns real data from the running Operaton instance.

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
4. **Tool scope** — read-only, two tools, calling the existing
   `/v1/m2m/process` and `/v1/m2m/process/:id/status` routes. No new backend
   capability is added for this POC.
