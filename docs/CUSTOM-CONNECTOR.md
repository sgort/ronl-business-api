# Custom Connector & Azure OpenAI — plan

Two independent tracks, both born from the same finding: **Power Platform
custom connectors don't support arbitrary OAuth 2.0 Client Credentials the
way this repo's other M2M clients (`copilot-studio-edocs`, `edocs-mcp-client`,
`operaton-mcp-client`) use it.** Copilot Studio's built-in OAuth experience is
built for delegated user auth, not a machine-to-machine `client_credentials`
exchange — confirmed by hitting this directly while trying to wire up
`copilot-studio-edocs` as a working connector.

**Task 1** routes around that limitation on the _connector_ side: Copilot
Studio authenticates to our own backend with a plain API key (an auth type
Power Platform custom connectors fully support), and our backend keeps doing
the Keycloak dance internally, same as it already does for the AI Assistant's
own `edocs-mcp-client`.

**Task 2** is unrelated — it adds Azure OpenAI as a third `LlmProvider` next
to Anthropic and OpenAI in the AI Assistant, in two parts (static key, then
Entra ID). No shared code with Task 1; do in either order, or in parallel.

---

## Task 1 — eDOCS custom connector (API key auth)

**Goal**: let a Copilot Studio custom connector browse eDOCS workspaces and
documents through the RONL Business API, authenticated with a static API key
instead of OAuth.

### 1.1 Architecture

```
Copilot Studio
      │
      │  X-API-Key: <shared secret>
      ▼
RONL Business API — /v1/copilot/edocs/*  (new, API-key gated)
      │
      │  reuses edocsService directly — same class /v1/edocs/* already uses
      ▼
EdocsService → OpenText eDOCS DM server
```

A **new**, purpose-built route file — not a change to the existing
`/v1/edocs/*` surface, which stays JWT-only (Keycloak) for the AI Assistant's
own MCP subprocess and any other Bearer-JWT-holding internal caller. Keeping
them separate means zero risk to the already-tested `edocs.routes.ts` /
`edocs.routes.test.ts`, and a purpose-built minimal surface for the connector
rather than exposing everything `/v1/edocs/*` can do.

### 1.2 New files / changes

| File                                                             | Change                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/backend/src/middleware/apiKey.middleware.ts` (new)     | `X-API-Key` header check against `config.edocsCopilot.apiKey`, constant-time compare. Mirrors the existing `media-aggregator` route-local `authorized()` pattern (`MEDIA_AGGREGATOR_ACCEPT_KEY`) but as reusable middleware, and on a **dedicated header** — `Authorization: Bearer` is already claimed by `jwtMiddleware` elsewhere, and Power Platform's built-in "API Key" connector security type expects its own header/query param anyway. |
| `packages/backend/src/routes/edocs.copilot.routes.ts` (new)      | Mounted at `/v1/copilot/edocs`. Read-only to start, mirroring the same 4 routes already proven for the AI Assistant's `edocs` MCP source: `GET /status`, `GET /workspaces`, `GET /workspaces/:id/documents`, `GET /documents/:id/profile`, `GET /documents/:id/versions`. Calls `edocsService` directly — no new eDOCS logic, just auth + routing.                                                                                               |
| `packages/backend/src/index.ts`                                  | `app.use('/v1/copilot/edocs', edocsCopilotRoutes)`; add `copilotEdocs` to the root endpoint map.                                                                                                                                                                                                                                                                                                                                                 |
| `packages/backend/src/utils/config.ts`                           | `edocsCopilot: { apiKey: string }` reading `EDOCS_COPILOT_API_KEY`.                                                                                                                                                                                                                                                                                                                                                                              |
| `packages/backend/src/routes/edocs.copilot.routes.test.ts` (new) | Mirrors `edocs.routes.test.ts` conventions — 401 without the key, 200 with it, error mapping per route.                                                                                                                                                                                                                                                                                                                                          |

**Decided — read-only, no CRUD.** Same policy already applied to the AI
Assistant's eDOCS MCP tools: only routes `scripts/test-edocs-live.sh`
actually touches and confirms working, nothing added on the strength of the
OpenAPI spec or "it should also support X" reasoning. That means `GET
/status`, `GET /workspaces`, `GET /workspaces/:id/documents`, `GET
/documents/:id/profile`, `GET /documents/:id/versions` — and explicitly
**not** `POST /workspaces/ensure` or `POST /documents`, even though the
smoke test happens to prove narrow slices of those work too (ensure's search
branch, standalone-only upload). A Copilot Studio flow calling `POST
/documents` unattended is a materially different risk than the AI
Assistant's tool-call loop, which is human-in-the-loop by construction (a
caseworker is driving the conversation) — no reason to reopen that question
for the connector when the same conclusion applies at least as strongly.

### 1.3 Config

```bash
EDOCS_COPILOT_API_KEY=<random-secret>     # shared with the Copilot Studio connector config; generate with:
                                           # node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Azure App Service setting on ACC, same as every other secret in this repo —
never in a committed `.env` file.

### 1.4 Update the existing connector scaffold

`config/copilot-studio/ronl-edocs-connector.json` already exists (Swagger
2.0) but currently defines `securityDefinitions.keycloak_client_credentials`
— the OAuth2 `application` (client_credentials) flow that doesn't work as a
Power Platform connector. Needs:

- `securityDefinitions` → replace with an `apiKey` scheme:
  ```json
  "securityDefinitions": {
    "api_key": { "type": "apiKey", "name": "X-API-Key", "in": "header" }
  },
  "security": [{ "api_key": [] }]
  ```
- `basePath` → `/v1/copilot/edocs` (was `/v1/edocs`)
- `paths` → **remove** `/workspaces/ensure` and `/documents` (the two `POST` write operations) entirely; keep only the 5 read-only paths from §1.2
- `description` → update; it currently says "Authenticates against Keycloak using client credentials"

### 1.5 Import into Power Platform

1. [make.powerapps.com](https://make.powerapps.com) → **Custom connectors** → **New custom connector** → **Import an OpenAPI file** → upload the updated `ronl-edocs-connector.json`
2. **Security** tab → confirm it picked up **API Key**, header `X-API-Key`
3. **Test** tab → new connection → paste the `EDOCS_COPILOT_API_KEY` value → test `GetEdocsStatus` first (no params, cheapest smoke test)
4. **Create connector** / publish
5. In Copilot Studio → the agent → **Tools** (or **Actions**, depending on the Copilot Studio UI version at the time) → add the custom connector's operations as callable actions

### 1.6 Testing

- Unit: `edocs.copilot.routes.test.ts` (per 1.2).
- Live smoke test: extend `scripts/test-edocs-live.sh` with a
  `--copilot` mode that sends `X-API-Key` instead of doing the Keycloak
  token dance, hitting `/v1/copilot/edocs/*` — or a small standalone
  `scripts/test-edocs-copilot-live.sh` if that's cleaner than branching the
  existing script.
- Manual: the Power Platform **Test** tab (1.5 step 3) is the real proof —
  it's the same HTTP client Copilot Studio itself will use.

---

## Task 2 — Azure OpenAI as an AI Assistant LLM provider

**Goal**: a third `LlmProvider` next to `AnthropicLlmProvider` and
`OpenAILlmProvider`, so Azure-hosted GPT models are selectable in the AI
Assistant's model dropdown. Zero changes needed to `McpChatSection.tsx`,
`mcpChat.service.ts`, or `mcp.routes.ts` — they already work against the
provider-agnostic `LlmProvider` interface (`streamTurn()` in/out, `isAvailable()`
gate). `openai@^6.33.0` (already a dependency) natively supports the
`AzureOpenAI` client — no new package needed for 2a.

### Shared refactor (do once, before 2a)

`OpenAILlmProvider.ts` currently keeps `flattenForOpenAI` / `toOpenAITool` /
`toOpenAIMessage` as private, unexported functions. Azure OpenAI is wire-
compatible with the same Chat Completions format, so extract these three into
`packages/backend/src/services/llm/openaiWireFormat.ts` and have both
providers import from it, rather than duplicating ~40 lines.

### Task 2a — static API key

The simple version, matching the existing `ANTHROPIC_API_KEY`/`OPENAI_API_KEY`
convention (a secret in App Settings, nothing fancier).

**Key design point**: Azure OpenAI doesn't let you address a model by its
public name (`gpt-4o`) — you provision a **deployment** under a name _you_
choose in the Azure OpenAI resource, and the API call's `model` field must be
that deployment name. Unlike `OpenAILlmProvider`'s hardcoded `meta.models`,
this provider's model list has to come from config, since deployment names
are resource-specific.

| File                                                                | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/backend/src/services/llm/openaiWireFormat.ts` (new)       | Extracted shared translation functions (see above).                                                                                                                                                                                                                                                                                                                                                                                                           |
| `packages/backend/src/services/llm/AzureOpenAiLlmProvider.ts` (new) | `id: 'azure-openai'`, `displayName: 'Azure OpenAI'`. `meta.models` sourced from `config.azureOpenai.deployments`. `isAvailable()` checks `apiKey && endpoint && deployments.length > 0`. `streamTurn()` constructs an `AzureOpenAI` client (`apiKey`, `endpoint`, `apiVersion`, `deployment: params.modelId`) and otherwise mirrors `OpenAILlmProvider.streamTurn()` exactly (same streaming/tool-call accumulation loop, via the shared wire-format module). |
| `packages/backend/src/utils/config.ts`                              | `azureOpenai: { apiKey, endpoint, apiVersion, deployments }` — `deployments` parsed from a `id:displayName,id:displayName` env string (new small parse helper, e.g. `parseEnvDeployments`, alongside the existing `parseEnvArray`/`parseEnvBool` in `utils/env.ts`).                                                                                                                                                                                          |
| `packages/backend/src/index.ts`                                     | `llmRegistry.register(new AzureOpenAiLlmProvider());` — unconditional registration, same pattern as Anthropic/OpenAI (no env-gate needed; `isAvailable()` already handles "not configured").                                                                                                                                                                                                                                                                  |
| `AzureOpenAiLlmProvider.test.ts` (new)                              | Mirrors `OpenAILlmProvider.test.ts` / `AnthropicLlmProvider.test.ts` conventions.                                                                                                                                                                                                                                                                                                                                                                             |

**Config:**

```bash
AZURE_OPENAI_API_KEY=<key>
AZURE_OPENAI_ENDPOINT=https://<resource-name>.openai.azure.com
AZURE_OPENAI_API_VERSION=2024-10-21          # or whatever's current when this is built — verify against Azure docs, don't assume
AZURE_OPENAI_DEPLOYMENTS=gpt-4o:GPT-4o,gpt-4o-mini:GPT-4o Mini
```

### Task 2b — Entra ID / Managed Identity (deferred until 2a is proven in ACC)

Same provider, same deployments, same wire format — only the _authentication_
changes. Avoids a long-lived `AZURE_OPENAI_API_KEY` secret sitting in App
Settings, at the cost of more setup.

| Change                       | Detail                                                                                                                                                                                          |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New dependency               | `@azure/identity` (not currently in `package.json`)                                                                                                                                             |
| Client construction          | `AzureOpenAI` accepts an `azureADTokenProvider` callback instead of `apiKey` — built via `getBearerTokenProvider(new DefaultAzureCredential(), 'https://cognitiveservices.azure.com/.default')` |
| Infra (portal/CLI, not code) | The Azure App Service needs a system-assigned (or user-assigned) **Managed Identity**, granted the **Cognitive Services OpenAI User** role on the Azure OpenAI resource via Azure RBAC          |
| Config                       | `AZURE_OPENAI_AUTH_MODE=api-key \| managed-identity` toggles which credential path `AzureOpenAiLlmProvider` takes; `AZURE_OPENAI_API_KEY` becomes optional (only required in `api-key` mode)    |
| Local dev                    | `DefaultAzureCredential` falls back to `az login`'s cached credential locally, so local dev doesn't need a Managed Identity — just an Azure CLI login with access to the resource               |

**Decided — ship 2a first, 2b as a follow-up.** Land the static-API-key
version fully working and proven in ACC before starting the Entra ID /
Managed Identity work. Same `streamTurn()` logic either way, only client
construction changes, so nothing from 2a is thrown away — 2b is additive,
not a rebuild.

---

## Decisions

1. **Task 1 route path** — `/v1/copilot/edocs` (not the generic
   `/v1/connector/edocs` originally sketched). Every internal identifier that
   named itself after "connector" was renamed to match: `edocs.copilot.routes.ts`,
   `edocsCopilotRoutes`, `copilotEdocs` (endpoint map key), `config.edocsCopilot`,
   `EDOCS_COPILOT_API_KEY`, `edocs.copilot.routes.test.ts`, the `--copilot`
   smoke-test mode. (The existing scaffold file itself,
   `config/copilot-studio/ronl-edocs-connector.json`, keeps its current name —
   only its contents change per §1.4.)
2. **Task 1 CRUD scope** — read-only only, matching the AI Assistant eDOCS
   tools policy exactly (see §1.2).
3. **Task 2 `AZURE_OPENAI_API_VERSION`** — left as a placeholder in this plan
   deliberately; **to be confirmed against current Azure OpenAI docs at build
   time**, not now. Azure revs API versions independently of this repo, so
   pinning a value today would likely be stale by the time 2a is actually built.
4. **Task 2b timing** — see above: 2a first, 2b once 2a is proven in ACC.

---

## Implementation log

### Task 1 — built and verified locally; paused before deploy

All of §1.2–§1.4 built on `feature/custom-connector-x-api`:

- `packages/backend/src/middleware/apiKey.middleware.ts` — `X-API-Key` check,
  constant-time compare, factory function (`apiKeyMiddleware(expectedKey)`)
  rather than hardcoded to one config value.
- `packages/backend/src/routes/edocs.copilot.routes.ts` — the 5 read-only
  routes from §1.2, calling `edocsService` directly.
- `packages/backend/src/routes/edocs.copilot.routes.test.ts` — 17 tests:
  auth gate (missing/wrong/correct key), all 5 routes' happy path + 502
  mapping, and an explicit regression guard proving the 4 write routes
  (`POST /workspaces/ensure`, `POST /documents`, `DELETE /documents/:id`,
  `DELETE /workspaces/:id`) 404 on this router — don't exist, not just
  disallowed.
- `config.ts` / `index.ts` / `.env.example` — wired per §1.2/§1.3.
- `config/copilot-studio/ronl-edocs-connector.json` — updated per §1.4
  (API-key security scheme, `basePath` → `/v1/copilot/edocs`, both `POST`
  paths removed). Also **added** `GET /documents/{documentId}/profile` and
  `GET /documents/{documentId}/versions` — the old scaffold predated those
  two routes entirely and was missing them; the connector now matches the
  real 5-route surface exactly.

**Verified**: `tsc --noEmit` clean, `eslint` clean, full backend suite
**68/68 test files, 1071/1071 tests** passing, `prettier --check` clean.

**Also improved while testing**: `scripts/test-edocs-live.sh` gained a
liveness gate (`GET /v1/health/live`, checked before the pre-flight or token
dance) mirroring `test-smoke-live.sh` — a stopped backend now fails
immediately with a clear message instead of running through several minutes
of pre-flight/token work only to hit a confusing `HTTP 000` deep into the
run.

**Local config**: `EDOCS_COPILOT_API_KEY` generated
(`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
and added to `packages/backend/.env.development` (gitignored, not this
value). A **separate** value still needs generating and setting as an Azure
App Service setting on ACC when this deploys — never reuse the local one.

**Power Platform**: the connector was imported and a connection created
("RONL CUSTOM CONNECTOR", status `Connected`) — but that only validates the
API-key security scheme client-side, it doesn't prove a live call works.
Confirmed live: `GET https://acc.api.open-regels.nl/v1/copilot/edocs/status`
→ `404`, because **this branch hasn't been merged/deployed to `acc` yet**.
Separately, the caseworker also flagged that the OpenText eDOCS DM server
itself is not network-reachable from ACC right now (an existing
infra/network issue, unrelated to this connector). That's not expected to
block the connector smoke test once deployed, though —
`edocsService.healthCheck()` is designed to report
`reachable: false` / `authenticated: false` gracefully rather than error, so
`GetEdocsStatus` should still return a clean `200` and prove the
connector → API-key → route chain end-to-end even before that network issue
is resolved separately.

**Paused here, deliberately** — picking back up later. Next steps when
resumed:

1. Generate a fresh `EDOCS_COPILOT_API_KEY` and set it as an ACC App Service
   setting (never the local `.env.development` value).
2. Commit + merge/deploy `feature/custom-connector-x-api` → `acc`.
3. Re-run the Power Platform Test tab against `GetEdocsStatus` — expect `200`
   with `reachable: false` until the OpenText network issue is separately
   resolved.
4. §1.6's live-test-script extension (`--copilot` mode or a standalone
   script) is still open — not started.
