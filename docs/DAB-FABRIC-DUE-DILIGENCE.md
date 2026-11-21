# Due diligence: Data API Builder (+ Microsoft Fabric) for RBA and LDE

Status: **exploratory — findings so far, no code built.** Started 21 November 2026.

## 1. Why this document exists

The question is whether the combination of **Microsoft Fabric** (as a data
portal) and **Data API Builder** (DAB, as the data-access layer) can carry the
RBA backend into a production-ready state for the Province of Flevoland, and
for other tenants who may adopt the same stack.

The target picture sketched for this:

```
 Djuma   Basisregistraties   KVK   eDocs   etc.
   └──────────┴───────────────┴──────┴──────┘
                        │
               Dataportaal (Fabric)
                        │
        Dataontsluiting (Data API Builder)
           REST  ·  MCP  ·  GraphQL
                        │
               IOU Experience Laag
```

The experiment was then narrowed to **DAB first, Fabric later**, applied to the
two Node.js back ends of the IOU architecture:

- the **RBA Business API** (`ronl-business-api/packages/backend`), and
- the **LDE Orchestration Service** (`linked-data-explorer/packages/backend`).

This document records what has been established so far, separates verified
facts from assumptions, and lists what still has to be investigated once
Fabric is in scope.

## 2. What DAB is (verified against the repository)

Source: <https://github.com/Azure/data-api-builder>, latest release **v2.1.7
(20 November 2026)**, MIT licence, free.

| Aspect          | Finding                                                                                                                                                                                                                                                  |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What it does    | Generates REST and GraphQL (and MCP) endpoints for **tables, views and stored procedures** of one database, driven by a `dab-config.json`. No-code CRUD engine.                                                                                          |
| Runtime         | A single container (or `dotnet` tool), .NET 8+. Runs on Azure, on-prem or any cloud.                                                                                                                                                                     |
| Database types  | `MSSQL`, `PostgreSQL`, `MySQL`, `CosmosDB_NoSQL`, `CosmosDB_PostgreSQL`, `DWSQL`. There is **no "Fabric" type**: Fabric is reached as `DWSQL` (Warehouse / SQL analytics endpoint) or `MSSQL` (Fabric SQL database).                                     |
| MCP             | First-class endpoint. Built-in tools: `describe_entities`, `read_records`, `aggregate_records`, `create_record`, `update_record`, `delete_record`, `execute_entity` (stored procedures).                                                                 |
| Authentication  | Providers: `StaticWebApps`, `AppService` (EasyAuth), `Simulator`, `Unauthenticated`, or **any JWT issuer** (issuer + audience configured). Roles are read from a top-level **`roles`** claim; the active role is chosen with the `X-MS-API-ROLE` header. |
| Authorisation   | Per-entity, per-role permissions on actions, field include/exclude lists, and **database policies** (row filters that can reference token claims).                                                                                                       |
| Multiple-create | Nested inserts are supported for `MSSQL` only.                                                                                                                                                                                                           |

**Core limitation:** everything DAB serves comes out of one database. It cannot
call another HTTP system, orchestrate, or trigger side effects.

## 3. Current state of the two Node.js back ends

Both services are largely **integration code**: they call other systems over
HTTP. Only a minority of what they do is CRUD on their own tables, and both
keep those tables in **PostgreSQL**, which DAB supports.

### 3.1 Own tables (DAB candidates)

| Service                   | Tables                                                                                                                                                     | Where                                                                                               |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| RBA Business API          | `pa_dossiers`, `pa_dossier_versions`, `pa_templates`, `pa_snippets`, `pa_saved_searches`, `pa_signals`, `pa_notifications`, `pa_feed_tokens`, `audit_logs` | `pa-monitoring/pa-dossiers.db.ts`, `pa-monitoring/pa-monitoring.db.ts`, `services/audit.service.ts` |
| LDE Orchestration Service | `process_definitions`, `form_schemas`, `document_templates`, `ropa_records`, `ropa_personal_data_fields` (+ `process_definitions_dedup_archive`)           | `db/migrate.ts`; used by `assets.*` and `ropa.*` routes and services                                |

**Notable coupling found:** RBA's own LDE MCP server
(`packages/backend/src/mcp-servers/lde/index.ts`) opens a `pg` pool on
`LDE_DATABASE_URL` and queries **LDE's database directly**. That is a
cross-service database dependency. A DAB instance in front of the LDE asset
tables, exposing MCP, is a natural replacement and arguably the strongest
single use case found so far.

### 3.2 Integration logic (not DAB candidates as-is)

| System                     | Used by  | Nature                                                              |
| -------------------------- | -------- | ------------------------------------------------------------------- |
| Operaton (BPMN/DMN engine) | RBA, LDE | Start processes, complete tasks, deploy BPMN+DMN — **actions**      |
| eDocs                      | RBA      | Metadata reads, uploads, per-user calls — **mixed**                 |
| BRP (Haal Centraal)        | RBA      | Live lookups with mandatory BSN audit log — **live, legally bound** |
| ValidSign                  | RBA      | Signing transactions, callbacks, polling — **actions**              |
| TriplyDB (SPARQL)          | LDE, RBA | Knowledge-graph queries — **reads**, but not SQL                    |

## 4. Fit analysis

Integration logic falls into three kinds. Only the first can ever move behind
DAB, and only once something (Fabric) copies the data into tables:

| Kind                                            | Examples                                                        | Destination                                                                   |
| ----------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| **A. Reading reference / overview data**        | KVK, Basisregistraties, Djuma, eDocs metadata, TriplyDB content | Fabric ingests into tables; DAB serves them. Node read code could be retired. |
| **B. Acting on another system**                 | Operaton starts/tasks/deploys, ValidSign signing, eDocs upload  | Stays in Node. DAB cannot trigger anything elsewhere.                         |
| **C. Live or per-user calls with legal limits** | BRP with BSN audit log, eDocs as the signed-in user             | Stays in Node. A data-lake copy breaks purpose limitation and freshness.      |

### Preliminary conclusions

1. **DAB alone** can replace, at most, the own-table CRUD of both services
   (§3.1), plus the direct-DB coupling in RBA's LDE MCP server.
2. **DAB + Fabric** can additionally take over kind A. It can never take over
   kinds B and C.
3. In every scenario **both Node.js services remain**, just slimmer. "Moving the
   RBA backend onto Fabric + DAB" is therefore better framed as "moving the
   read side of the RBA backend onto Fabric + DAB".
4. Whether the DAB-only step is worth doing depends on the size of §3.1
   relative to the whole (see open item D1).

## 5. Identity and tenancy (partly verified)

- **Keycloak works as a JWT issuer** for DAB (custom issuer + audience).
- **Role claim mismatch:** Keycloak emits roles under `realm_access.roles`;
  DAB reads a top-level `roles` claim. A Keycloak protocol mapper (per client)
  must flatten them. Not yet tried.
- **Role selection:** a caller holding several roles must send
  `X-MS-API-ROLE`; otherwise DAB uses `authenticated`. Clients (frontends, MCP
  callers) must be adapted.
- **Tenant isolation:** RBA routes all tenant access through
  `auth/tenant-access.ts` (`municipality` claim, `403 TENANT_MISMATCH`). The DAB
  equivalent is a database policy such as
  `@item.municipality eq @claims.municipality` on every entity. Whether this is
  complete (GraphQL relationships, aggregates, MCP tools) is the first thing
  to prove.
- **Brokered Entra ID login** (`entra-flevoland`): tokens still come from
  Keycloak, so DAB should be unaffected — to confirm.

## 6. Open items

### 6.1 DAB only (can start now)

| #   | Item                                                                                                                                                  | Why it matters                                                                       |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| D1  | Route inventory: share of RBA and LDE routes that are own-table CRUD vs kinds A/B/C.                                                                  | Decides whether a DAB-only experiment saves meaningful code.                         |
| D2  | Keycloak → DAB: roles mapper, audience, `X-MS-API-ROLE` handling, token lifetime.                                                                     | Every endpoint depends on it.                                                        |
| D3  | Tenant isolation via database policies across REST, GraphQL (incl. relationships), aggregates and MCP tools.                                          | A leak here is a blocker, not a defect.                                              |
| D4  | Replace `mcp-servers/lde` direct DB access with DAB MCP over LDE asset tables.                                                                        | Strongest concrete use case; removes cross-service DB coupling.                      |
| D5  | Contract compatibility: DAB REST shape (`value` envelope, OData-style `$filter`/`$orderby`/`$first`, cursor paging) vs existing routes and frontends. | Replacing routes means changing every consumer.                                      |
| D6  | Error format: DAB errors vs RBA's RFC 9457 problem details (`sendProblem`).                                                                           | Uniform error handling is an existing contract.                                      |
| D7  | Business rules now in Node around table writes (validation, versioning of `pa_dossier_versions`, dedup in LDE) — where do they go?                    | DAB has no hooks; logic must move into the database (constraints, triggers) or stay. |
| D8  | PostgreSQL feature gaps: stored-procedure / function support, multiple-create (MSSQL-only).                                                           | Limits what can move off Node on PostgreSQL.                                         |
| D9  | Conformance with the NL API Design Rules (NLGov REST), OpenAPI publication, versioning.                                                               | Expected of government APIs.                                                         |
| D10 | Operations: hosting next to the App Services, config in CI/CD, health, telemetry, rate limiting, caching, `audit_logs` continuity.                    | Production readiness, not just function.                                             |
| D11 | Security posture: .NET runtime patch cadence, release stability (2.x pre-releases are frequent), SBOM and Semgrep coverage of a non-Node component.   | New stack in the supply chain.                                                       |

### 6.2 With Fabric in scope

| #   | Item                                                                                                                                                                              | Why it matters                                                                  |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| F1  | **Store type under DAB:** Warehouse / SQL analytics endpoint (`DWSQL`, read-only) vs Fabric SQL database (`MSSQL`, writable — to confirm).                                        | Decides whether anything but reads can go through Fabric.                       |
| F2  | **Ingestion per source:** for Djuma, Basisregistraties, KVK, eDocs, TriplyDB — mirroring, pipelines, shortcuts, or not possible. Licensing/terms of each source for copying.      | Kind A only moves if each source can actually be landed.                        |
| F3  | **Freshness:** acceptable lag per screen and per use case; how lag is surfaced to users.                                                                                          | Caseworker screens may not tolerate stale data.                                 |
| F4  | **Privacy / AVG:** DPIA, purpose limitation (doelbinding) per dataset, BSN handling, retention, logging of data processing (Logboek Dataverwerkingen). BRP expected out of scope. | Copying personal data into a lake is a legal decision, not a technical one.     |
| F5  | **Multi-tenancy model:** workspace per tenant vs shared workspace with row-level security; how DAB policies and Fabric RLS combine.                                               | Other tenants are an explicit goal.                                             |
| F6  | **Identity between DAB and Fabric:** managed identity / service principal; whether end-user identity must be passed through; Keycloak users have no Entra identity.               | Determines whether Fabric-side security can apply per user or only per service. |
| F7  | **Network and residency:** private endpoints, egress from App Service, EU data boundary, BIO compliance.                                                                          | Government hosting requirements.                                                |
| F8  | **Cost and capacity:** F-SKU sizing, who owns the capacity (Flevoland, ICTU, per tenant), cost of always-on API traffic against capacity units.                                   | Fabric bills capacity; API traffic competes with analytics.                     |
| F9  | **Ownership and governance:** who runs the data portal, schema changes, contracts between Fabric data products and DAB entities.                                                  | Schema drift breaks DAB silently.                                               |
| F10 | **Alternatives within Fabric:** Fabric's own _API for GraphQL_ vs self-hosted DAB.                                                                                                | Possible overlap; DAB adds REST + MCP and portability.                          |
| F11 | **Exit strategy:** what remains usable if Fabric is dropped (DAB itself is portable; ingestion is not).                                                                           | Lock-in risk for a multi-tenant platform.                                       |

## 7. Suggested next steps

1. **D1** — route inventory of RBA and LDE (read-only; gives the numbers behind
   conclusion 4).
2. **Local DAB spike** on the LDE asset tables in Docker against the existing
   local PostgreSQL and Keycloak, covering D2, D3, D4 and D5. Throwaway.
3. Decide, from 1 and 2, whether a Fabric trial is warranted; if so, start with
   **one kind-A source** end-to-end (F1, F2, F3, F5), with privacy (F4) cleared
   first.
