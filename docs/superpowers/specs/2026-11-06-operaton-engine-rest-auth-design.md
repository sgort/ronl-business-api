# Operaton engine REST API behind credentials — design

Issue: [#415](https://github.com/sgort/ronl-business-api/issues/415) · Branch: `fix/operaton-engine-rest-auth` · Date: 6 November 2026

## Why

`operaton.open-regels.nl/engine-rest/*` answers anyone on the internet without credentials. Caddy
proxies it straight to the engine and adds `Access-Control-Allow-Origin "*"` to every response. On
6 November 2026 `GET /engine-rest/version` and `GET /engine-rest/deployment/count` both answered `200`
without credentials.

That bypasses everything the Business API enforces in front of the engine: the per-case tenant check
(`packages/backend/src/auth/tenant-access.ts`), level-of-assurance gating, and audit logging. The engine
is the one instance shared by ACC and PROD, so this exposes production case data and lets anyone change
it.

The IOU Project Start Architecture records "a Business API stands between every portal and the engine;
the engine is never reachable from outside" as a core decision (AB-13). This work makes that true, with
one deliberate, narrow exception: the rules themselves stay publicly readable.

## Goals

1. **Rules stay open.** Anyone may, without credentials:
   - read process, decision and decision-requirements definitions, including their BPMN/DMN XML;
   - read deployments and their resource data (DMN/BPMN source);
   - evaluate a decision.

   These are public material by design. The CPRMV rules API fetches DMN source from
   `engine-rest/deployment/{id}/resources/{rid}/data` without credentials, and published linked data
   (TTL `implementedBy`) links to `engine-rest/decision-definition/key/{key}/evaluate`.

2. **Cases are closed.** Process instances, variables, tasks, incidents, jobs, history, and anything
   else that returns or touches case data need credentials.
3. **Changes are closed.** Every state-changing call needs credentials: deploying, starting a process,
   completing a task, setting variables, and deleting deployments, definitions or instances.
4. **Each legitimate caller has its own account**, so access can be rotated or revoked per caller.

## Non-goals

- **Moving PROD onto its own engine.** That is
  [linked-data-explorer#263](https://github.com/sgort/linked-data-explorer/issues/263). The PROD engine
  already exists: `https://operaton.dbconnector.nl/`, the repository owner's infrastructure. On
  6 November 2026 it answered `401` without credentials on both calls from the issue, so it is not
  exposed the way `operaton.open-regels.nl` is. Until PROD moves, `operaton.open-regels.nl` stays the
  engine for both tiers, and this work closes it for both. Afterwards `operaton.open-regels.nl` is the
  ACC engine and the `-prod` accounts on it are removed (see the PROD engine section).
- **The VM reconciling `deployment/vm/` itself, and digest pins.** That is #196. This work brings
  Operaton's VM configuration into the repository and pins its version tag, but it is still applied by
  hand.
- **`operaton-dev.open-regels.nl` and `operaton-doc.open-regels.nl`.** They are equally open, but they are
  obsolete and will be removed after this work. Some published `implementedBy` links (for example in
  LDE's `packages/backend/tests/curl-localhost-dmns.json`) point at `operaton-doc`; removing that host
  breaks them, and that is accepted.
- **Narrowing what the backends may do in the engine.** They keep today's full access (see the accounts
  section). Least privilege inside the engine is a later step.
- **The Cockpit and Tasklist web apps** (`/operaton/app/…`). They already have their own login and are
  unchanged, apart from what switching on authorisation implies (see the risks section).

## Anti-goals: failures even if it technically works

- **A caller silently stops working.** In particular, the external-task workers poll in the background,
  and a `401` there shows up as stuck processes, not as an error page.
- **CPRMV or a published `evaluate` link starts answering `401`.**
- **Credentials end up in the public repository.**
- **The engine's own permission checks are skipped.** Without them, a mistake in the Caddy allowlist
  reopens case data. The two layers below exist so that one mistake does not undo the fix.

## The callers, mapped on 6 November 2026

| Caller                                                   | Where it reaches the engine                                                       | Today                                                                                                             | After this work                                     |
| -------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| RBA backend (ACC, PROD)                                  | `OPERATON_BASE_URL` = public host                                                 | `operaton.service.ts` sends basic auth if `OPERATON_USERNAME`/`OPERATON_PASSWORD` are set (they are likely unset) | its own account per tier                            |
| RBA external-task worker                                 | `externalTaskWorker.service.ts`, bare `axios`                                     | **no credentials, ever**                                                                                          | must send the same credentials                      |
| RBA AI-assistant MCP server                              | `OperatonMcpProvider.ts` passes the URL, username and password to a child process | passes credentials if set                                                                                         | covered by the RBA account                          |
| LDE backend (ACC, PROD)                                  | `operaton.service.ts`                                                             | sends `Authorization: Bearer ${OPERATON_API_KEY}`, **which Operaton does not accept**                             | switch to basic auth, its own account per tier      |
| LDE external-task worker                                 | `externalTaskWorker.service.ts`, bare `axios`                                     | **no credentials, ever**                                                                                          | must send the same credentials                      |
| LDE health route                                         | `health.routes.ts`, bare `axios.get(…/version)`                                   | no credentials                                                                                                    | must send credentials (or it reports Operaton down) |
| ttl-editor                                               | goes through the LDE backend (`/v1/dmns/deploy`, `/v1/dmns/evaluate`)             | no direct engine calls                                                                                            | nothing to change                                   |
| CPRMV rules API                                          | `GET …/deployment/{id}/resources/{rid}/data`                                      | anonymous                                                                                                         | stays anonymous (public allowlist)                  |
| Published `implementedBy` links                          | `POST …/decision-definition/key/{key}/evaluate`                                   | anonymous                                                                                                         | stays anonymous (public allowlist)                  |
| Operator (repository owner), curl                        | `scripts/rip-*.sh`, `OPERATON_URL`                                                | anonymous                                                                                                         | personal account                                    |
| RBA e2e helpers against ACC/PROD                         | `packages/frontend/e2e/helpers/{target,operaton-cleanup}.ts`                      | anonymous                                                                                                         | personal account through env vars                   |
| ttl-editor e2e probe                                     | `e2e/stack.js`, `GET …/engine-rest/version`                                       | anonymous; defaults to localhost                                                                                  | credentials, or probe a public path                 |
| Cockpit / Tasklist users (repository owner, a colleague) | `/operaton/app/…`                                                                 | own Operaton login                                                                                                | unchanged                                           |

No browser calls `engine-rest` directly any more. ttl-editor's DMN tab routes through the LDE backend for
exactly the CORS reason.

## The design: two layers

### Layer 1 — Operaton requires a login and checks permissions

- **Switch on REST authentication** (HTTP basic) for `engine-rest`. In Operaton Run that is the
  `operaton.bpm.run.auth.enabled` setting (environment `OPERATON_BPM_RUN_AUTH_ENABLED=true`). _To verify
  on localhost:_ the exact key in Operaton 2.1.x.
- **Switch on authorisation checks** (`operaton.bpm.authorization.enabled=true`), so the engine itself
  limits what each account may do.
- **Accounts:**

  | Account                               | Group       | Purpose                                          |
  | ------------------------------------- | ----------- | ------------------------------------------------ |
  | `rba-backend-acc`, `rba-backend-prod` | admin group | the RBA backend, worker and MCP server, per tier |
  | `lde-backend-acc`, `lde-backend-prod` | admin group | the LDE backend and worker, per tier             |
  | personal account (repository owner)   | admin group | curl, scripts, e2e cleanup                       |
  | existing Cockpit users                | unchanged   | the web apps                                     |
  | `public-reader`                       | none        | used only by Caddy for the public allowlist      |

  Admin-group accounts keep exactly what anonymous callers have today, including every tenant.
  ACC and PROD get separate accounts even though they share the engine, so either tier can be revoked
  without the other (the rule #196 sets for the VM deploy).

- **`public-reader` gets only:** `READ` on process definitions, decision definitions,
  decision-requirements definitions and deployments, plus whatever permission Operaton requires to
  evaluate a decision. _To verify on localhost:_ in Camunda 7 heritage evaluation needs
  `CREATE_INSTANCE` on the decision definition. It gets nothing on process instances, tasks, history or
  variables.
- **Tenants:** rules of every tenant are public (for example `flevoland`-scoped DMNs). `public-reader`
  must therefore see definitions of all tenants. _Builder's call, validated on localhost:_ either make
  `public-reader` a member of every tenant, which means adding new tenants to it, or confirm that
  tenant checks do not apply to the permissions above. Whatever is chosen is documented with how a new
  tenant is added.

### Layer 2 — Caddy decides what the internet reaches without a login

In `deployment/vm/caddy/Caddyfile`, inside the `operaton.open-regels.nl` block:

- **The public allowlist.** These requests are forwarded with `public-reader`'s basic-auth header
  injected, **only when the request carries no `Authorization` header of its own**, so an authenticated
  caller keeps its own identity:
  - `GET` on `/engine-rest/process-definition…`, `/engine-rest/decision-definition…`,
    `/engine-rest/decision-requirements-definition…` and `/engine-rest/deployment…`, **excluding**
    sub-resources that return instance data (for example `…/statistics`, `…/form-variables`, and
    anything with `instance`, `task`, `history`, `variable` or `incident` in it);
  - `POST /engine-rest/decision-definition/key/{key}/evaluate`, its
    `…/key/{key}/tenant-id/{tenant}/evaluate` form, and `…/{id}/evaluate`.

  _Builder's call:_ the exact matcher list, written as explicit path patterns with a comment per entry.
  The rule is that nothing on the list may return or change case data, and the engine's permissions are
  the backstop if the list is wrong.

- **Everything else under `/engine-rest/*`** is forwarded unchanged. Without credentials, Operaton
  answers `401`.
- **CORS.** _My call:_ `Access-Control-Allow-Origin "*"` stays only on public-allowlist responses, so
  the published `evaluate` links keep working from a browser. `Access-Control-Allow-Credentials "true"`
  goes, because it is invalid together with `*` anyway. Every other `engine-rest` response gets no CORS
  headers. The global `OPTIONS` handler answers only for allowlisted paths.
- `public-reader`'s password reaches Caddy as an environment variable (for example
  `{$OPERATON_PUBLIC_READER_AUTH}`, the base64 `user:password`), set in the VM's Caddy environment,
  **never in the Caddyfile**.

### Why both layers

- **Caddy alone:** the credentials would live in the proxy, and the engine would stay open on the Docker
  network.
- **Operaton alone:** CPRMV and the `implementedBy` links would break.
- **Both:** a mistake in the allowlist exposes at most "read the rules", because the engine refuses
  `public-reader` everything else.

## Operaton's VM configuration into the repository (taken from #196)

- **The repository owner copies the current VM files** into `deployment/vm/operaton/`: the compose
  file, every mounted configuration file, and any start-up user/authorisation setup. Before committing,
  each inline secret becomes a `${VAR}` reference to an env file that stays on the VM. Also recorded:
  the network definition, so the engine stays at `172.18.0.10:8080`, and the running image as reported
  by `docker inspect`.
- **Also recorded: the users and groups that exist on the engine today**, the name of the admin group,
  and whether any is a default or shared login (for example Operaton Run's stock `demo`/`demo`). If the
  VM still has a well-known admin login, switching on authentication only stops anonymous callers, so
  those accounts are deleted or get a new password in rollout step 5.
- **How Caddy is started on the VM**, so the plan knows how `{$OPERATON_PUBLIC_READER_AUTH}` reaches it
  (env file, compose `environment:`, or systemd).
- **The `latest` tag is replaced** by the version tag the VM is actually running. No digest pin; that
  stays with #196. _My call:_ the VM's version wins. If it is not 2.1.5, the local stack moves to the
  VM's version in this change, so that what localhost proves carries over.
- **These files land before the plan is written.** The apply steps and the Operaton configuration keys
  cannot be written concretely without them.
- **#415's Operaton changes are made in those files** and reviewed in the pull request.
- **Still applied by hand.** The pull request includes the exact apply steps (below). #196 gets a comment
  that `deployment/vm/operaton/` exists.

## Code changes

**RBA (this repository):**

- `externalTaskWorker.service.ts`: send `config.operaton.username`/`password` on `fetchAndLock`,
  `complete` and `failure`. _Builder's call:_ reuse `operaton.service.ts`'s client rather than adding a
  second credential path.
- Make `OPERATON_USERNAME`/`OPERATON_PASSWORD` required when `NODE_ENV=production`, in `validateConfig`,
  next to the existing `OPERATON_BASE_URL` check. A deploy without them should fail at start-up, not
  in the background later.
- The e2e helpers (`target.ts`, `operaton-cleanup.ts`, `global-setup.ts`) send credentials from new
  `OPERATON_USERNAME`/`OPERATON_PASSWORD` env vars when set. Localhost runs pass the local accounts.
- `scripts/rip-*.sh` and `docs/RIP-WALKTHROUGH-SCRIPTS.md`: `curl -u` from the same env vars.
- Local stack (`docker-compose.yml`): the `operaton` service gets the same authentication and
  authorisation settings as the VM, and a small init step creates the local accounts (admin,
  `rba-backend`, `lde-backend`, `public-reader`) with the permissions above. `packages/backend/.env.example`
  documents the credentials.
- `deployment/vm/caddy/Caddyfile`: layer 2.

**LDE (linked-data-explorer), a separate pull request:**

- `operaton.service.ts`: basic auth (`OPERATON_USERNAME`/`OPERATON_PASSWORD`) instead of
  `Bearer ${OPERATON_API_KEY}`. Remove `OPERATON_API_KEY`.
- `externalTaskWorker.service.ts` and `health.routes.ts`: send the same credentials.
- Required in production in its config validation, like RBA.

**ttl-editor:** only the e2e probe in `e2e/stack.js`, if it ever targets the public host.

**Documentation (iou-architectuur), a separate pull request:**

- `reference/standards-compliance.md` (API-53): state accurately what is exposed (the rules) and what is
  not.
- `developer/deployment/operaton.md`: point at `deployment/vm/operaton/`, the accounts, and the apply
  steps. Drop the inline compose file and `latest`.
- Environment-variable references for RBA and LDE.
- PSA AB-13: the open risk can be closed once this is live.

## Validation on localhost:8081

All behaviour is proven against the local Operaton before anything touches the VM:

1. Without credentials: the public allowlist works (definitions, DMN source, evaluate, including a
   tenant-scoped decision), and everything else answers `401`. Run this through a local Caddy, or through
   a test of the matcher list, so the allowlist itself is exercised and not just the engine.
2. As `public-reader` directly against the engine: process-instance, task, history and variable reads
   are refused, and deploy is refused.
3. As the backend accounts: everything works as today. The full RBA unit suite plus the localhost e2e
   suite pass with the RBA and LDE backends pointing at the authenticated local engine. Both external-task
   workers pick up and complete tasks.
4. Switching on authorisation changes nothing for admin-group accounts, including tenant visibility.

## Rollout

Order matters, because switching on the login breaks every caller that does not yet send credentials.

Each of steps 1 to 4 is harmless while authentication is still off: Operaton ignores an
`Authorization` header it does not check. The new start-up check (`OPERATON_USERNAME`/`OPERATON_PASSWORD`
required when `NODE_ENV=production`, which ACC and PROD both run) is why the settings come **before**
the code. Code that reaches a tier without them refuses to start.

1. **Find every caller.** The `operaton.open-regels.nl` block has no access log today, so turn one on for
   `/engine-rest/*` (method, path, status, client IP, user agent) and leave it for **7 days**. Account
   for every client before step 6. _My call:_ the callers are servers and the owner, so client IPs are
   acceptable here; the log is deleted once reviewed (step 8).
2. **Create the accounts** on the VM engine, while authentication is still off. With it off, user and
   authorisation management is open to anyone, which is today's state.
3. **Set the credentials in the App Service settings** of RBA ACC, RBA PROD, LDE ACC and LDE PROD. First
   **read** what is there: the RBA changelog records `OPERATON_USERNAME`/`OPERATON_PASSWORD` being added
   to ACC once, so ACC may already authenticate as some existing user. The repository owner sets the
   values (assistant writes to App Service settings are blocked) and restarts each app. Verify that
   `/v1/health` reports Operaton up on all four.
4. **Merge the code.** The RBA and LDE pull requests merge to `acc` and reach PROD through their normal
   promotions. Credentials are now sent, and still ignored.
5. **Switch on authentication and authorisation** on the VM's Operaton (the repository's
   `deployment/vm/operaton/` files), and restart. Brief engine outage. In the same step, delete default
   or shared logins found when the files were copied, or give them new passwords.
6. **Apply the Caddyfile** with the public allowlist, and reload Caddy.
7. **Verify from outside:** the two calls from the issue now answer `401`, and so does a default login
   such as `demo:demo`. A public DMN source fetch and a public `evaluate` answer `200` without
   credentials. All four `/v1/health` endpoints are green. One RIP process runs end to end on ACC, and
   the e2e suite passes on ACC.
8. **Remove the temporary access log** from step 1, and delete what it collected.

**Rollback:** step 5 is undone by setting authentication off and restarting Operaton. Step 6 is undone by
restoring the previous Caddyfile. Steps 1 to 4 are harmless left in place.

## Risks

- **Cockpit users who are not in the admin group lose visibility** once authorisation checks are on.
  Check the colleague's account before step 4.
- **A caller we did not find.** Mitigation: the 7-day access log in rollout step 1. CPRMV was checked
  directly: it fetches only through its `repository-publication-location-format`,
  `…/deployment/{deploymentid}/resources/{resourceid}/data`, which is on the allowlist.
- **Operaton 2.1.x configuration keys** differ from Camunda's. Everything marked _to verify_ is proven
  on localhost first.
- **Existing PROD data** is not migrated or touched. Only access changes.

## Later: the engine move (not this work)

The repository owner plans a separate move after this work: the current engine (`operaton.open-regels.nl`)
becomes `acc.operaton.open-regels.nl` for ACC, and the PROD engine (`operaton.dbconnector.nl`) takes over
the name `operaton.open-regels.nl`. This work closes the current engine first, under its current name,
for both tiers. Recorded here so the move does not undo it:

- **The public allowlist must exist in front of the PROD engine too.** After the move, the published
  `implementedBy` links and CPRMV's URLs, which all name `operaton.open-regels.nl`, reach PROD. That
  engine answers `401` to anonymous callers today, so without the allowlist those links break.
- **CPRMV's links contain deployment IDs** (`…/deployment/{id}/resources/{rid}/data`) from the current
  engine. On another engine they answer `404`, unless the database moves with them or the identifiers
  are reissued. The key-based `evaluate` links survive if the same decisions are deployed on PROD.
- **The Caddy rules move** from the `operaton.open-regels.nl` block to `acc.operaton.open-regels.nl`.
- **The `-prod` accounts on the current engine are removed** once no PROD backend points at it.

## What is left to the builder

Items marked _builder's call_ above: the exact Caddy matcher list, how `public-reader` sees every tenant,
and how the RBA worker reuses the authenticated client. Also the local init mechanism for accounts and
authorisations, and the shape of the tests that prove the allowlist.
