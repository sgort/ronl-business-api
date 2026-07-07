# Test suite — ronl-business-api

## Running the tests

All backend tests run with Jest. The test script lives in `packages/backend`.

```bash
# Run all backend tests once (with coverage report)
npm test --workspace=@ronl/backend

# Run without coverage (faster)
npx jest --config packages/backend/jest.config.js --no-coverage

# Watch mode during development
npm run test:watch --workspace=@ronl/backend

# Single file / pattern
npx jest --config packages/backend/jest.config.js --no-coverage --testPathPattern=rules
```

From the repo root, `npm test` runs every workspace's test script — the backend
Jest suite and the frontend Vitest suite.

---

## Test files

### `packages/backend/src/pa-monitoring/rules.test.ts`

**29 tests · pure unit · no mocks needed**

Covers `scoreItem` — the pure scoring function that assigns a relevance score (1–10),
a tab (`politiek` / `regionaal` / `europa`), and a `dossierId` to each raw feed item
before it enters the curation inbox.

| Group                 | What is tested                                                                                                                                      |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tab assignment        | `tk → politiek`, `ob → regionaal`, `eu → europa`                                                                                                    |
| No-match floor        | Items matching no saved search are capped at rel 3, even with a high-value document type                                                            |
| Title match           | +3 per matching term; `OR`-split queries; `bestScore` capped at 5                                                                                   |
| Description match     | +1 per matching term; title match always outscores desc match for the same term                                                                     |
| High-value type bonus | TK: Motie, Kamervraag, Brief, Amendement → +2; EU: Verslag, Motie, Aangenomen tekst, Resolutie → +2; non-listed types → no bonus                    |
| rel ceiling           | `min(rel, 10)` — TK Motie (3+2) + bestScore 5 → exactly 10                                                                                          |
| Tag bonus             | +1 per tag that appears in title or description                                                                                                     |
| Quoted terms          | `"green deal"` is stripped to `green deal` before matching                                                                                          |
| dossierId assignment  | From the highest-scoring search; null when winning search has no dossier; lower-scoring search's dossierId does not carry over when winner has null |

The last dossierId case revealed a **bug** fixed in this session: `rules.ts` used
`if (search.dossierId) dossierId = search.dossierId`, which never cleared the value
when the winning search had `dossierId: null`. Fixed to unconditional assignment.

---

### `packages/backend/src/pa-monitoring/curation.service.test.ts`

**17 tests · unit · mocked feeds, DB, and scoreItem**

Covers `runCurationCycle` — the orchestration layer that loads saved searches, fetches
the right feeds, deduplicates items, scores them, and persists candidates above the
relevance threshold.

`scoreItem` is mocked here (tested in isolation in `rules.test.ts`).

| Group              | What is tested                                                                                                                                                    |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No searches        | Returns early; no feeds fetched                                                                                                                                   |
| Source routing     | TK-only → only `fetchTkFeed`; OB-only → only `fetchObFeed`; EU-only → only `fetchEuFeed`; TK+OB → both, not EU; missing `source` field defaults to `['tk', 'ob']` |
| EU fetch count     | Multiple EU searches still trigger exactly one `fetchEuFeed` call per cycle                                                                                       |
| EU config flag     | `PA_EU_SOURCE_ENABLED=false` suppresses EU fetch even when EU searches exist                                                                                      |
| TK/OB query dedup  | Identical query string in two searches fetches that API once, not twice                                                                                           |
| rel threshold      | Items scoring below 4 are not written to DB; items at exactly 4 are persisted                                                                                     |
| Item deduplication | Two feed results with the same `source:id` are written once; same `id` from different sources are treated as distinct                                             |
| Error resilience   | A failing TK fetch does not abort the cycle — OB and EU are still attempted; EU fetch failure resolves cleanly                                                    |

---

### `packages/backend/src/pa-monitoring/pa.routes.test.ts`

**7 tests · route integration · mocked DB and auth**

Covers the role-gating middleware on PA data routes. `jwtMiddleware` is replaced with a
test stub that reads an `x-test-roles` header; `requireRoles` is the real implementation.

| Scenario                                  | Expected                                |
| ----------------------------------------- | --------------------------------------- |
| No `Authorization` header                 | 401 `MISSING_TOKEN`                     |
| Valid JWT, role `caseworker`              | 403 `FORBIDDEN`                         |
| Valid JWT, role `public-affairs`          | 200 (signals) / 404 (unknown signal id) |
| Valid JWT, `public-affairs`, known signal | 200 with confirmed signal shape         |

Routes tested: `GET /v1/pa/signals`, `POST /v1/pa/signals/:id/confirm`.

---

### `packages/backend/src/pa-monitoring/sources/eu.client.test.ts`

**12 tests · pure unit · fixture-based, no network**

Covers `parseRssFeed` — the RSS parser for the European Parliament plenary feed.
Uses a static fixture (`__fixtures__/ep-plenary.rss.xml`) so no network is required.

| Group             | What is tested                                                          |
| ----------------- | ----------------------------------------------------------------------- |
| Basic parsing     | Returns at least one item; every item has a non-empty title             |
| Ref extraction    | `guid` → EP document ref (e.g. `A-10-2026-0181`)                        |
| Doceo URL         | Provenance link points to `doceo.europarl.europa.eu`                    |
| Date parsing      | ISO date extracted from `<pubDate>`                                     |
| Dutch type labels | `<category domain="type">` mapped to Dutch label (Verslag, Motie, …)    |
| Term expansion    | `EU_TO_NL_TERMS` appends Dutch equivalents to `description` for scoring |
| Agenda filtering  | Items without an EP document ref in the guid are excluded               |

---

## eDOCS live-switch path

These suites cover the full chain that runs when `EDOCS_STUB_MODE=false`, so the
switch to live exercises code that is already under test. In stub mode none of the
live paths run, which is exactly why they are pinned down here.

### `packages/backend/src/services/edocs.service.test.ts`

**22 tests · unit · mocked axios + config**

Covers `EdocsService` in both stub and live mode. Constructing with
`stubMode: false` and driving a mocked axios client exercises the OpenText paths.

| Group                 | What is tested                                                                                                                                                                                                    |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stub mode             | Every method short-circuits without a network call; deterministic stub ids                                                                                                                                        |
| connect()             | Extracts `X-DM-DST` + CSRF cookies; caches the session; throws when `X-DM-DST` absent                                                                                                                             |
| Re-auth               | 401/403 → one re-connect then retry; non-auth errors propagate without retry                                                                                                                                      |
| ensureWorkspace       | Existing match → `created:false`; empty search → create → `created:true`                                                                                                                                          |
| uploadDocument        | `_restapi.form_name` present with a formName, omitted without; DOCNUMBER fallback                                                                                                                                 |
| getWorkspaceDocuments | Maps raw eDOCS list → `{ id, name, documentNumber }`                                                                                                                                                              |
| Upstream errors       | connect() rejection (e.g. account lockout) surfaces the eDOCS `ERROR` body                                                                                                                                        |
| healthCheck           | Distinguishes **reachable** (unauth `GET libraries`) from **authenticated** (login): up+auth / unreachable / reachable-but-not-authenticated; reuses a live session and caches failed login probes (lockout-safe) |
| Interceptor           | Attaches `Cookie` and `X-DM-DST` headers once a session exists                                                                                                                                                    |

### `packages/backend/src/routes/edocs.routes.test.ts`

**15 tests · route integration · supertest · mocked service + auth**

Covers the `/v1/edocs` HTTP surface: the jwt gate, `/status` shape, and each
endpoint's happy path, field validation, and service-failure mapping.

| Scenario                        | Expected                                                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| No auth                         | 401 `MISSING_TOKEN`                                                                                                                         |
| `GET /status`                   | Passes through `stubMode` / `reachable` / `authenticated` / latency / error; distinguishes reachable-but-not-authenticated from unreachable |
| `GET /workspaces`               | 200 list · service throw → 502 `EDOCS_ERROR`                                                                                                |
| `POST /workspaces/ensure`       | 400 `MISSING_FIELDS` · 200 result · 502 on fail                                                                                             |
| `POST /documents`               | 400 when `metadata.docName` missing · 200 · 502                                                                                             |
| `GET /workspaces/:id/documents` | 200 scoped docs · 502 on fail                                                                                                               |

### `packages/backend/src/services/externalTaskWorker.service.test.ts`

**20 tests · unit · mocked axios + edocsService**

Covers the Operaton external-task worker that drives eDOCS from BPMN. The
`rip-edocs-workspace` and `rip-edocs-document` topics call `edocsService`. Private
handlers are exercised via a typed internals view.

| Group           | What is tested                                                                                        |
| --------------- | ----------------------------------------------------------------------------------------------------- |
| ensureWorkspace | Calls `edocsService.ensureWorkspace`, maps output vars; throws on missing vars                        |
| relatics (sim)  | Deterministic simulated workspace, flagged `relaticsWorkspaceSimulated`                               |
| uploadDocument  | Renders content → base64 → `edocsService.uploadDocument`; default output var; throws                  |
| Document render | Intake / PSU / PDP templates + unknown-template fallback; template→label mapping                      |
| fetchAndLock    | Posts the three topics; returns `[]` when the response has no data                                    |
| Dispatch        | Completes on success; reports failure on unknown topic / handler error                                |
| Resilience      | `failTask` swallows an error when reporting failure itself fails                                      |
| Lifecycle       | `start()` polls once and is idempotent; `stop()` halts. Timer-driven `poll()` loop is not unit-tested |

---

## Auth & middleware — the shared route gate

Every route (including eDOCS) sits behind these.

### `packages/backend/src/auth/jwt.middleware.test.ts`

**13 tests · unit · mocked jsonwebtoken + jwks-rsa**

| Group                 | What is tested                                                                                                                    |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| jwtMiddleware         | Missing/non-Bearer header → 401 `MISSING_TOKEN`; valid → user+auth attached; invalid → 401 `INVALID_TOKEN`; roles default to `[]` |
| optionalJwtMiddleware | No token → continue unauthenticated; token present → validate                                                                     |
| requireRoles          | No user → 401; has role → next; missing role → 403 `FORBIDDEN`                                                                    |
| requireAssuranceLevel | No user → 401; meets minimum → next; below → 403 `INSUFFICIENT_ASSURANCE`                                                         |

The JWKS signing-key callback (`getKey`) runs only inside the real `jwt.verify`,
which is mocked, so it is intentionally left uncovered.

### `packages/backend/src/middleware/tenant.middleware.test.ts`

**11 tests · unit · mocked config**

| Group                       | What is tested                                                                                             |
| --------------------------- | ---------------------------------------------------------------------------------------------------------- |
| tenantMiddleware            | Isolation off → next; no user → 401; no tenantId → 403 `MISSING_TENANT`; success syncs `req.auth.tenantId` |
| validateTenantParam         | No user → 401; mismatch → 403 `TENANT_MISMATCH`; match → next; custom param name                           |
| addTenantToProcessVariables | No user → pass-through; injects `businessKey` + tenant vars; preserves existing variables                  |

### `packages/backend/src/middleware/audit.middleware.test.ts`

**13 tests · unit · mocked config + audit.service · fake timers**

Fake timers are enabled before the module is required so its module-level
`setInterval(pruneAuditQueue)` never keeps Jest alive.

| Group                          | What is tested                                                                                                                                                                                                                                |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| createAuditLog                 | No-op when disabled; queues + timestamps + persists when enabled                                                                                                                                                                              |
| auditMiddleware                | Unwrapped when disabled; success entry with `resourceType`/`resourceId` from path; 4xx → `failure` + extracted error; 5xx non-error body → `errorMessage` undefined; `includeIp:false` omits IP; skips `/audit` + `/chat`; no user → no audit |
| auditLog                       | No-op without `req.auth`; records an explicit entry when present                                                                                                                                                                              |
| getAuditLogs / pruneAuditQueue | Returns most-recent N; caps the in-memory queue at 1000                                                                                                                                                                                       |

---

## Infrastructure & utilities

### `packages/backend/src/utils/env.test.ts`

**10 tests · pure unit**

Covers the env parsers (`parseEnvBool`, `parseEnvInt`, `parseEnvArray`) extracted
from `config.ts` into `utils/env.ts` so they can be tested without triggering
`config.ts`'s import-time `dotenv` + `validateConfig` side effects. Covers defaults,
case-insensitive boolean parsing, `parseInt` semantics, and comma-split + trim.

### `packages/backend/src/services/audit.service.test.ts`

**5 tests · unit · mocked pg-promise**

The durable half of the audit trail that `audit.middleware` delegates to.

| Group           | What is tested                                                                                                                                        |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| persistAuditLog | SQL parameter mapping; `:port` stripped from IP; `tenantId → azp → "unknown"` fallback; optional fields nulled; a DB error is swallowed, never thrown |
| initDb          | Acquires + releases a connection on success; does not throw when the DB is unavailable                                                                |

### `packages/backend/src/routes/health.routes.test.ts`

**10 tests · route integration · supertest · mocked operatonService + fetch**

| Route                  | What is tested                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `GET /health`          | 200 healthy (both deps up); 503 degraded (Operaton down); Keycloak non-OK / fetch throw → down; Operaton throw → 503 unhealthy |
| `GET /health/live`     | Always 200 `alive`, no dependency calls                                                                                        |
| `GET /health/ready`    | Operaton up → 200 ready; down → 503 not ready; throw → 503 error                                                               |
| `GET /health/external` | Maps each external target to up/down by reachability                                                                           |

---

## Standalone MCP servers

The two servers under `src/mcp-servers/` are separate executables (their own stdio
entrypoints), not part of the Express app. Each module has **no exports** and
**self-connects a stdio transport on import**, so the tests mock the MCP SDK's
`Server` to capture the `ListTools` / `CallTool` handlers it registers, then drive
those handlers directly.

### `packages/backend/src/mcp-servers/lde/index.test.ts`

**15 tests · unit · mocked MCP SDK + pg**

Covers the LDE process-library server. `pg` is mocked and `LDE_DATABASE_URL` is set
before the module is required (exercising the `sslmode` connection-string branch).

| Group          | What is tested                                                                                 |
| -------------- | ---------------------------------------------------------------------------------------------- |
| ListTools      | Advertises the six tools (`bundle_list/get`, `form_list/get`, `document_list/get`)             |
| bundle tools   | `bundle_list` maps rows to the bundle shape; `bundle_get` binds the id; not-found → `isError`  |
| form/doc tools | `form_list` / `document_list` pass rows through; `*_get` found vs not-found → `isError`        |
| Error handling | Unknown tool → `isError`; a query rejection is caught and returned as an `isError` text result |

### `packages/backend/src/mcp-servers/triplydb/index.test.ts`

**18 tests · unit · mocked MCP SDK + global fetch**

Covers the TriplyDB SPARQL server. Global `fetch` is mocked and `TRIPLYDB_TOKEN` is
set before require (exercising the bearer-auth branch). Each tool's query is verified
by decoding the form-encoded body of the posted request.

| Group          | What is tested                                                                                                         |
| -------------- | ---------------------------------------------------------------------------------------------------------------------- |
| ListTools      | Advertises all eleven tools                                                                                            |
| Query routing  | Every tool builds and posts its dedicated SPARQL; `dmn_get` uri-vs-identifier branches + the "provide either" guard    |
| Optional args  | `rule_list` service-title filter; `service_rules_metadata` service-id filter; `sparql_query` passthrough + empty guard |
| Endpoint/auth  | Posts to the default endpoint with the bearer token; honours a per-call `endpoint` override                            |
| Error handling | Unknown tool; non-ok HTTP (`HTTP 502 …`); network failure — all surfaced as `isError` text results                     |

---

## Coverage

Run `npm test --workspace=@ronl/backend` to generate a coverage report in
`packages/backend/coverage/`.

`jest.config.js` sets `collectCoverageFrom` across `src/**/*.ts` (excluding tests,
fixtures, `types/`, and `index.ts`), so **untested files report as 0% instead of
being omitted** — the "All files" number reflects the whole backend, not just the
files a test happens to import.

A dedicated coverage campaign (branch `test/backend-coverage`, ~700 tests) has now
brought every backend feature area under test:

- **eDOCS live-switch path** — `edocs.service`, `edocs.routes`, `externalTaskWorker`
- **Shared gate** — `jwt` / `tenant` / `audit` middleware, `audit.service`, `env`
- **Services** — `operaton.service` (both handler groups), `nieuws`, `berichten`,
  `productenDiensten`, `regelcatalogus`, `mcpChat`, the LLM + MCP registries
- **Routes** — `admin`, `brp`, `hr`, `capacity`, `rip`, `decision`, `task`, `mcp`,
  `public`, `m2m`, `process`, `health`
- **LLM / MCP providers** — the Anthropic + OpenAI providers and the four MCP providers
- **PA monitoring** — `rules`, `curation.service`, `pa.routes`, the `tk`/`ob`/`agenda`/`eu`
  source clients, `pa-cache`, `pa-monitoring.db`
- **Media aggregator** — `store`, `search`, `ingest`, the routes, and `net-guard`
- **Utilities** — `errors`, `altcha`, `logger`
- **Standalone MCP servers** — `mcp-servers/lde`, `mcp-servers/triplydb`

Deliberately left uncovered (documented artifacts, not gaps): `utils/config.ts`
self-validates on import and only re-exports the env parsers already covered by
`env.test.ts`; and a handful of defensive `if (!req.user)` guards and JSON-unreachable
`inferType` defaults that cannot be reached through the real middleware stack or a
JSON payload, so neither unit nor live tests can exercise them.

---

## Adding tests

All test files follow the pattern `src/**/*.test.ts` and are picked up automatically.
Place new tests next to the file they cover. Shared test helpers (factories, stubs) can
live in a `__helpers__` subdirectory alongside the test files.

The backend Jest config is at `packages/backend/jest.config.js`. Path aliases (`@utils/`,
`@services/`, `@auth/`, `@middleware/`, `@ronl/shared`) are mapped there and work inside
test files.
