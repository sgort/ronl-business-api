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

**60 tests · route integration · mocked DB, source clients, and auth**

Covers the full PA route surface, not just the gate. `jwtMiddleware` is a test stub
reading an `x-test-roles` header; `requireRoles` is the real implementation; `db`
(pg-promise), the TK/OB/agenda source clients, and `curation.service` are mocked.

| Group                 | What is tested                                                                                              |
| --------------------- | ----------------------------------------------------------------------------------------------------------- |
| Role gating           | Anonymous → 401; non-PA role → 403; `public-affairs` → through, on every route                              |
| `GET /signals`        | tab/dossierId/status filters, single-vs-`ANY` status branch, `meta` cap envelope, 500                       |
| `POST /signals`       | promote raw hit → 201; `MISSING_FIELDS` → 400; promote failure → 500                                        |
| confirm / link        | confirm (watchlist routing), `PATCH /signals/:id` link-dossier, unknown → 404, 500s                         |
| `GET /feed`           | TK+OB merge + total sum, `source=tk`/`ob` routing, `allSettled` partial-failure tolerance, sync-throw → 502 |
| `GET /agenda`         | dossier enrichment match/no-match, 502 on upstream failure                                                  |
| `GET /types`          | TK + OB taxonomy passthrough                                                                                |
| curator               | `POST /curator/run` (background cycle + `.catch`), `GET /curator/status` counts + 500                       |
| searches CRUD         | list, create (+`MISSING_QUERY`), delete (+404), PATCH (`MISSING_FIELDS`/`BAD_SCOPE`/`EMPTY_QUERY`), 500s    |
| `GET /sources/status` | reflects the configured connector flags                                                                     |

---

### `packages/backend/src/pa-monitoring/sources/eu.client.test.ts`

**30 tests · unit · fixture + mocked fetch/cache**

Covers `parseRssFeed` (pure, fixture `__fixtures__/ep-plenary.rss.xml`) plus the fetch
layer with global `fetch` and `pa-cache` mocked — no network is required.

| Group             | What is tested                                                                               |
| ----------------- | -------------------------------------------------------------------------------------------- |
| Basic parsing     | Returns at least one item; every item has a non-empty title                                  |
| Ref extraction    | `guid` → EP document ref (e.g. `A-10-2026-0181`)                                             |
| Doceo URL         | Provenance link points to `doceo.europarl.europa.eu`                                         |
| Date parsing      | ISO date extracted from `<pubDate>`                                                          |
| Dutch type labels | `<category domain="type">` mapped to Dutch label (Verslag, Motie, …)                         |
| Term expansion    | `EU_TO_NL_TERMS` appends Dutch equivalents to `description` for scoring                      |
| Agenda filtering  | Items without an EP document ref in the guid are excluded                                    |
| `inferType`       | ref-prefix → Dutch type label for all six prefixes; unknown prefix → null                    |
| `parseRssFile`    | reads + parses a local file; missing file → `[]`                                             |
| `fetchEuFeed`     | fetches both feeds, dedupes by ref, skip/top paging, cache-hit shortcut, non-ok/throw → `[]` |

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

A dedicated coverage campaign (branch `test/backend-coverage`, **786 tests**) brought
every backend feature area under test. Current headline: **92% stmts · 71% branch ·
93% funcs · 94% lines**. A word on terminology this campaign learned the hard way:
_file-touched ≠ behavior-covered_. Several files had a test file that only exercised a
pure helper (a mapper, a parser) while the real work — the HTTP fetch, the pagination,
the SSRF guard — went untested. The table below is the **complete per-file inventory**
so that distinction is visible at a glance.

### Complete file inventory

Line-% and branch-% for every non-excluded source file. The gap between the two columns
is where the remaining work is: a file can be 100% lines but well below 100% branch when
its uncovered branches are defensive defaults — `?? null` fallbacks, `if (!req.user)`
guards behind real middleware, or catch blocks that can't be reached through a legal
input. "Defensive branches" in the status column means exactly that residue.

#### `auth/` · `middleware/`

| File                              | Lines | Branch | Status                                                                                                                   |
| --------------------------------- | ----- | ------ | ------------------------------------------------------------------------------------------------------------------------ |
| `auth/jwt.middleware.ts`          | 88.1% | 85.7%  | jwt/optional/roles/assurance covered; JWKS `getKey` runs only inside the mocked `jwt.verify`, so intentionally uncovered |
| `middleware/tenant.middleware.ts` | 100%  | 100%   | fully covered                                                                                                            |
| `middleware/audit.middleware.ts`  | 100%  | 94.4%  | fully covered; module-level prune-interval branch is the only residual                                                   |

#### `routes/`

| File                 | Lines | Branch | Status                                                             |
| -------------------- | ----- | ------ | ------------------------------------------------------------------ |
| `admin.routes.ts`    | 100%  | 83.3%  | fully covered                                                      |
| `brp.routes.ts`      | 95.8% | 86.7%  | happy + error paths; one validation branch                         |
| `capacity.routes.ts` | 91.9% | 50.0%  | happy + error paths; upstream-failure branches                     |
| `decision.routes.ts` | 94.0% | 71.4%  | happy + error paths; a few validation branches                     |
| `edocs.routes.ts`    | 100%  | 81.8%  | fully covered (see eDOCS live-switch path above)                   |
| `health.routes.ts`   | 100%  | 80.0%  | fully covered                                                      |
| `hr.routes.ts`       | 96.3% | 62.5%  | happy + error paths; one branch                                    |
| `m2m.routes.ts`      | 96.7% | 48.3%  | happy + error paths; auth-edge branches                            |
| `mcp.routes.ts`      | 87.0% | 60.0%  | list/call + SSE stream + error event; residual stream-abort branch |
| `process.routes.ts`  | 93.3% | 68.7%  | all endpoints happy + error; per-endpoint upstream branches        |
| `public.routes.ts`   | 93.9% | 81.5%  | happy + validation + error; a few defensive branches               |
| `rip.routes.ts`      | 91.9% | 50.0%  | happy + error; error-detail branches                               |
| `task.routes.ts`     | 88.2% | 52.6%  | all endpoints happy + error; per-endpoint upstream branches        |

#### `services/`

| File                            | Lines | Branch | Status                                                                                                           |
| ------------------------------- | ----- | ------ | ---------------------------------------------------------------------------------------------------------------- |
| `audit.service.ts`              | 100%  | 90.5%  | fully covered                                                                                                    |
| `berichten.service.ts`          | 100%  | 91.7%  | fully covered                                                                                                    |
| `edocs.service.ts`              | 98.4% | 85.7%  | stub + live paths; see eDOCS section                                                                             |
| `externalTaskWorker.service.ts` | 83.5% | 87.0%  | topic dispatch + eDOCS handlers covered; timer-driven poll loop and some handler-error branches left             |
| `mcpChat.service.ts`            | 100%  | 77.8%  | fully covered                                                                                                    |
| `nieuws.service.ts`             | 100%  | 94.4%  | fully covered                                                                                                    |
| `operaton.service.ts`           | 88.3% | 61.1%  | both handler groups + happy/error paths; residual is per-endpoint upstream-error branches across a large surface |
| `productenDiensten.service.ts`  | 100%  | 92.9%  | fully covered                                                                                                    |
| `regelcatalogus.service.ts`     | 98.4% | 76.6%  | fully covered bar one branch                                                                                     |

#### `services/llm/` · `services/mcp/`

| File                          | Lines | Branch | Status                                      |
| ----------------------------- | ----- | ------ | ------------------------------------------- |
| `llm/AnthropicLlmProvider.ts` | 100%  | 100%   | fully covered                               |
| `llm/OpenAILlmProvider.ts`    | 97.4% | 86.4%  | fully covered bar one branch                |
| `llm/LlmProvider.ts`          | 100%  | 100%   | fully covered                               |
| `llm/LlmRegistry.ts`          | 100%  | 100%   | fully covered                               |
| `mcp/CprmvMcpProvider.ts`     | 98.1% | 53.8%  | tool calls + errors; connect/guard branches |
| `mcp/LdeMcpProvider.ts`       | 87.5% | 41.7%  | tool calls + errors; connect/guard branches |
| `mcp/OperatonMcpProvider.ts`  | 83.3% | 52.9%  | tool calls + errors; connect/guard branches |
| `mcp/TriplyDbMcpProvider.ts`  | 91.1% | 45.5%  | tool calls + errors; connect/guard branches |
| `mcp/McpRegistry.ts`          | 100%  | 77.8%  | fully covered                               |

#### `pa-monitoring/`

| File                                   | Lines | Branch | Status                                                                                                                                     |
| -------------------------------------- | ----- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `pa.routes.ts`                         | 100%  | 79.6%  | every route + query-builder branches; residual is `?? null` defaults                                                                       |
| `rules.ts`                             | 100%  | 87.1%  | `scoreItem` fully covered (29 tests)                                                                                                       |
| `curation.service.ts`                  | 82.3% | 69.3%  | orchestration + routing + dedup + resilience; residual is source-specific fetch-error edges                                                |
| `pa-cache.ts`                          | 97.4% | 83.3%  | Redis wrapper; no-client branch left                                                                                                       |
| `pa-monitoring.db.ts`                  | 100%  | 66.7%  | fully covered                                                                                                                              |
| `sources/tk.client.ts`                 | 100%  | 84.4%  | fully covered                                                                                                                              |
| `sources/agenda.client.ts`             | 98.6% | 69.7%  | fully covered bar one branch                                                                                                               |
| `sources/eu.client.ts`                 | 98.9% | 65.9%  | `parseRssFeed` + `fetchFeed`/`fetchEuFeed` (cache/dedup/paging) + `inferType` + `parseRssFile`; residual is the XML-parse catch            |
| `sources/ep-texts-submitted.client.ts` | 97.9% | 83.3%  | parsers + the fetch/pagination engine (dedup, early-stop, per-tab tolerance); residual is malformed-card warn + `allSettled` reject branch |
| `sources/media.client.ts`              | 96.3% | 80.0%  | `articleToFeedItem` mapper + `fetchFlevolandNews` (request shape, skip, retry); residual is an unreachable trailing `return []`            |
| `sources/ob.client.ts`                 | 88.7% | 42.9%  | RSS parser covered; residual is fetch error/paging branches (the `numberOfRecords → null` quirk noted below lives here)                    |

#### `media-aggregator/`

| File                         | Lines | Branch | Status                                                                                 |
| ---------------------------- | ----- | ------ | -------------------------------------------------------------------------------------- |
| `net-guard.ts`               | 100%  | 98.0%  | SSRF guard fully covered — IPv4/IPv6 rules, all DNS paths, `fetchLimited`, `safeFetch` |
| `store.ts`                   | 100%  | 90.9%  | fully covered                                                                          |
| `search.ts`                  | 100%  | 64.3%  | OR-term search covered; residual is query-parse edge branches                          |
| `dedup.ts`                   | 100%  | 100%   | fully covered                                                                          |
| `feeds.ts`                   | 100%  | 100%   | static source config                                                                   |
| `media-aggregator.routes.ts` | 100%  | 92.9%  | fully covered                                                                          |
| `ingest.ts`                  | 94.7% | 75.9%  | parse (RSS/Atom) + `toArticle` + `ingestAll` dedup; a few feed-parse edges             |
| `stable-id.ts`               | 97.4% | 86.7%  | fully covered bar one branch                                                           |
| `sanitize.ts`                | 91.7% | 80.0%  | HTML strip covered; two entity-edge branches                                           |
| `enrich.ts`                  | 91.3% | 91.7%  | region/geo tagging covered; two geo-edge branches                                      |

#### `mcp-servers/` · `utils/`

| File                            | Lines | Branch | Status                                                                                                                                                        |
| ------------------------------- | ----- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mcp-servers/triplydb/index.ts` | 100%  | 90.9%  | fully covered (see Standalone MCP servers)                                                                                                                    |
| `mcp-servers/lde/index.ts`      | 98.0% | 82.1%  | fully covered bar one not-found branch                                                                                                                        |
| `utils/altcha.ts`               | 100%  | 100%   | fully covered                                                                                                                                                 |
| `utils/env.ts`                  | 100%  | 100%   | env parsers fully covered                                                                                                                                     |
| `utils/errors.ts`               | 100%  | 100%   | fully covered                                                                                                                                                 |
| `utils/logger.ts`               | 72.7% | 25.0%  | **artifact** — winston fully mocked so no real transport runs; `createLogger` delegation is asserted, but the transport-wiring lines can't run under the mock |
| `utils/config.ts`               | 0%    | 0%     | **artifact** — self-runs `dotenv` + `validateConfig` on import (needs a full env); its pure parsers were extracted to `utils/env.ts`, which is at 100%        |

### Documented artifacts & known quirks

- **`utils/config.ts` (0%)** and **`utils/logger.ts` (73%)** — see the table; both are
  deliberate, not gaps.
- **Defensive `if (!req.user)` guards** across the routes and JSON-unreachable
  `inferType`-style defaults can't be reached through the real middleware stack or a
  legal JSON payload, so neither unit nor live tests exercise them.
- **`ob.client` `total` always resolves to `null`** — a latent product quirk, not a test
  gap: `fast-xml-parser` parses `<numberOfRecords>` as a number and the client's `str()`
  helper only handles strings/`#text`. The test asserts the current (null) behavior.

---

## Adding tests

All test files follow the pattern `src/**/*.test.ts` and are picked up automatically.
Place new tests next to the file they cover. Shared test helpers (factories, stubs) can
live in a `__helpers__` subdirectory alongside the test files.

The backend Jest config is at `packages/backend/jest.config.js`. Path aliases (`@utils/`,
`@services/`, `@auth/`, `@middleware/`, `@ronl/shared`) are mapped there and work inside
test files.
