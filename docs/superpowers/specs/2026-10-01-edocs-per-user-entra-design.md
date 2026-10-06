# eDOCS per user, through Entra ID — design

Branch: `feat/edocs-per-user-entra`
Date: 2026-10-01

## Goal

People act in eDOCS **as themselves**; machines act as an **explicit, visible service
identity**. Concretely:

- An interactive eDOCS call made by an employee — through `/v1/edocs` or through the AI
  assistant's eDOCS tools — opens an eDOCS session with that employee's own Entra ID
  token. No password, no lockouts, and eDOCS enforces and records that person's rights.
- Background work — the Operaton worker's RIP archiving and ValidSign's archiving of the
  signed PDF — runs as the service account `testuser001`, and records the employee who caused
  it as the document's author.
- A person is never silently turned into the service account.

## Decisions

| Question                                | Decision                                                                                                                                                                                                   |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Purpose                                 | Both: no stored personal password, _and_ eDOCS sees the real employee. Per user for people, a visible service identity for machines                                                                        |
| Background archiving                    | Service session; the employee is recorded as "namens <naam> (<e-mail>)" in a free-text profile field — the service account cannot set `AUTHOR_ID` to another user (probe and Flevoland IT, 6 October 2026) |
| Service identity                        | Dedicated eDOCS account `testuser001` ("TestUser001 (voor iou)"), password login — replacing the personal `GORTS01` and the locked-out `IOUTEST`                                                           |
| A person without an Entra token         | Refused; `EDOCS_ALLOW_SERVICE_FALLBACK=true` allows a visible fallback to the service, never on production                                                                                                 |
| How the backend gets the person's token | Keycloak stores the brokered Entra tokens; the backend reads them through the broker token endpoint with the person's own Keycloak token, and refreshes them at Entra itself                               |
| Errors                                  | RFC 9457 problem details through `sendProblem` (`application/problem+json`, the code as the `code` member), like every other route since v2026.10.0                                                        |

## Background

### What eDOCS accepts (spike, 2026-10-01)

- InfoCenter (`infocenter-test.flevoland.nl:9443`, MSAL.js, Entra client `bbc4da06-…`)
  opens a session with `POST /edocsapi/v1.0/connect?library=SQLDocuVitT`, sending the
  user's **Entra ID token** in the header **`X-DM-AUTH`**. It also sends a Microsoft Graph
  access token as `data.profileToken`; eDOCS does not need it.
- A server-side call with only `X-DM-AUTH` and the body
  `{"data":{"library":"SQLDocuVitT","tzOffset":-120,"timezone":"Europe/Berlin","tzDST":true}}`
  returns `200`, the cookies `X-DM-DST` and `X-DM-CSRF-TOKEN`, and the full session
  data (`USER_ID`, `EFFECTIVE_RIGHTS`, `SESSION_DURATION`, …). An empty body returns
  `400 rapi_code 1`.
- An ID token issued to **RBA's own app registration** (IOU-demonstrator, client
  `ef967eb0-…`) is accepted as well: `USER_ID` `GORTS01`. eDOCS matched on
  `preferred_username`; the token carried no `upn`. eDOCS evidently does not restrict the
  audience to InfoCenter. That has been raised with Flevoland; if they introduce an
  allow-list, `ef967eb0-…` must be on it.

### The connector today

- `services/edocs.service.ts` is a singleton holding **one** session for the whole
  process: `connect()` posts `{userid, password, library}` from `EDOCS_USER_ID` /
  `EDOCS_PASSWORD` (`GORTS01`, a personal account), stores `X-DM-DST` and
  `X-DM-CSRF-TOKEN` as a cookie string, and `withAuth()` reconnects once on 401/403.
  `uploadDocument` and `ensureWorkspace` set `AUTHOR_ID` and `TYPIST_ID` to
  `config.edocs.userId`.
- **No eDOCS write happens while a person is signed in.** Writes come from the Operaton
  worker (`rip-edocs-workspace`, `rip-edocs-document`) and from ValidSign completion
  (webhook, poller, stub ceremony).
- The AI assistant's eDOCS tools run in an MCP subprocess that authenticates with
  `client_credentials` (`edocs-mcp-client`) and calls the backend's own `/v1/edocs`
  routes. `McpProvider.callTool(name, args)` carries no user, so the caseworker behind the
  call is lost.
- `/v1/edocs` only requires a valid token: no role, no client check. A citizen's token
  passes.
- Keycloak's `entra-flevoland` provider has `storeToken: false`; nothing in the repo reads
  brokered tokens.
- `validateConfig()` checks nothing about eDOCS.

## Design

### 1. Who connects to eDOCS as whom

| Caller                                                                               | eDOCS session as                                  | Credential                                  |
| ------------------------------------------------------------------------------------ | ------------------------------------------------- | ------------------------------------------- |
| A person through `/v1/edocs` (Keycloak token, `azp = ronl-business-api`)             | the person                                        | their Entra ID token in `X-DM-AUTH`         |
| AI-assistant eDOCS tools on behalf of a caseworker                                   | the person                                        | the caseworker's token, passed through (§5) |
| A machine client (`edocs-mcp-client` without a user context, `copilot-studio-edocs`) | `testuser001`                                     | eDOCS password                              |
| Operaton worker, ValidSign archiving                                                 | `testuser001`, "namens <employee>" in the profile | eDOCS password, attribution (§6)            |

### 2. The Entra token service — `auth/entra-token.service.ts` (new)

`getEntraIdToken(userSub, keycloakAccessToken): Promise<string>`

1. Cache hit for `userSub` with an ID token valid for at least 60 s → return it.
2. Otherwise read the stored tokens: `GET {KEYCLOAK_URL}/realms/{realm}/broker/entra-flevoland/token`
   with `Authorization: Bearer <the person's Keycloak access token>`. Keycloak answers
   with the Entra token response it stored at login (`id_token`, `refresh_token`,
   `expires_in`, …).
   - `400`/`404`/no stored token (a Keycloak-native account such as
     `test-caseworker-flevoland`) → `UserTokenUnavailableError`.
3. If that ID token has expired, refresh at Entra:
   `POST https://login.microsoftonline.com/{ENTRA_TENANT_ID}/oauth2/v2.0/token` with
   `grant_type=refresh_token`, the stored refresh token, `scope=openid profile email offline_access`,
   `ENTRA_CLIENT_ID` and `ENTRA_CLIENT_SECRET`. The response carries a new `id_token` and
   refresh token; both are cached for this user (Keycloak's stored copy is not updated).
   - Refresh refused (`invalid_grant`, revoked, expired) → `ReauthRequiredError`.
4. The cache is per `userSub`, bounded (LRU, a configurable maximum) and in memory only.

Because the broker endpoint is called with the person's own Keycloak token, the backend
can only ever read the Entra tokens of the person making the request.

### 3. Per-principal eDOCS sessions — `services/edocs.service.ts`

- A **principal** is `{ kind: 'service' }` or `{ kind: 'user', sub, idToken }`. Callers
  obtain a scoped client — `edocsService.forService()` or
  `edocsService.forUser(sub, idToken)` — and call the existing methods on it. There is no
  unscoped call path left, so no caller can fall back to a shared session by accident.
- Sessions are kept per principal key (`service` or `user:<sub>`): the `X-DM-DST` and
  `X-DM-CSRF-TOKEN` cookies, the eDOCS `USER_ID`, and an expiry derived from
  `SESSION_DURATION` in the connect response. The request interceptor sends the cookies
  of the session the call belongs to.
- `connect(principal)`:
  - service → today's password body, with `EDOCS_USER_ID` / `EDOCS_PASSWORD` (`testuser001`);
  - user → `X-DM-AUTH: <idToken>` with the body
    `{"data":{"library", "tzOffset", "timezone", "tzDST"}}`, no password.
- `withAuth` keeps its "reconnect once on 401/403" behaviour, per principal. For a user,
  the reconnect asks the Entra token service for a fresh ID token first.
- The 30-second throttle on the authentication probe stays for the service session; it
  protects `testuser001` from lockout.
- Every interactive connect records `email → USER_ID` in the attribution cache (§6).
- Stub mode is unchanged and applies to every principal.
- Write calls send `X-DM-CSRF-TOKEN` as a header too if eDOCS turns out to require it;
  PR 1 probes this with a person's session.

### 4. `/v1/edocs` routes

A new middleware, `edocsPrincipal`, runs after `jwtMiddleware`:

1. **Who may call.** A person (`azp = ronl-business-api`) needs the role `caseworker` or
   `admin`; a machine client must be in `EDOCS_ALLOWED_CLIENTS`
   (default `edocs-mcp-client,copilot-studio-edocs,operaton-mcp-client` — the last is the
   client every live smoke script and ACC run authenticates as). A person without the role
   gets `403 FORBIDDEN`, an unlisted client `403 EDOCS_CLIENT_NOT_ALLOWED`. All refusals are
   problem details (`sendProblem`), with the code in the `code` member.
2. **As whom.**
   - A machine client → service principal.
   - A person → `getEntraIdToken(...)` → user principal.
     - `UserTokenUnavailableError` → `403 EDOCS_USER_TOKEN_UNAVAILABLE`, **unless**
       `EDOCS_ALLOW_SERVICE_FALLBACK=true`: then the service principal, the response carries
       `"actingAs": "service"`, and an audit entry records "testuser001 namens <user>".
     - `ReauthRequiredError` → `401 EDOCS_REAUTH_REQUIRED`.
3. The resolved principal is attached to the request; handlers call
   `edocsService.forPrincipal(req.edocsPrincipal)`.

`jwtMiddleware` keeps the raw bearer token on `req.auth.token`, because the broker
endpoint needs it. It is never logged.

eDOCS rejecting a person's token (a `rapi_code` other than an expired session) →
`403 EDOCS_ACCESS_DENIED`; the upstream detail goes to the log, not the response.

### 5. The AI assistant as the person

- `McpProvider.callTool(name, args, context?)` and `McpRegistry.callTool` gain an optional
  `context: { userToken?: string }`. `mcp.routes.ts` passes the caller's raw token. The
  other providers ignore it.
- `EdocsMcpProvider` puts the token in the MCP request's **`_meta`**, never in the tool
  arguments, so the language model never sees it.
- The eDOCS MCP server uses `_meta.userToken`, when present, as the bearer for that one
  call to `/v1/edocs`, instead of its `client_credentials` token. The backend route then
  sees a person (§4) and eDOCS works as them. Without `_meta`, the server keeps its own
  token and the route treats it as the machine client.
- A refusal comes back as a tool result with `isError: true` and a short Dutch explanation,
  so the assistant can say that the user has no eDOCS access through their account.

### 6. Background archiving with attribution

- **Which employee.** A new reserved process variable **`edocsAuthor`** holds the e-mail
  address of the employee who last acted on the process through RBA. The backend sets it
  when a person **starts a process** and when a person **completes a user task**, from the
  token's `email` (falling back to `preferred_username`). It joins `municipality`,
  `originTenantId` and `applicantId` in `RESERVED_PROCESS_VARIABLES`: a client sending it
  in a completion gets `400 RESERVED_VARIABLE`.
- **How the employee is recorded: "namens …", not `AUTHOR_ID`.** The probe of 6 October
  2026 showed that the service account cannot set `AUTHOR_ID` to another user: eDOCS
  accepts `testuser001` as its own author and refuses `GORTS01` with "U hebt een ongeldige
  eigenschapswaarde ingevoerd". Flevoland IT confirmed the right cannot be granted. So
  `AUTHOR_ID` and `TYPIST_ID` stay `testuser001`, and the employee is recorded as
  **"namens <naam> (<e-mail>)"** in a free-text profile field. The probe found two empty
  candidates on the `D_INTERN_NIEUW` form, `ABSTRACT` and `DESCRIPTION`; PR 3 settles
  which one InfoCenter shows.
- **Archiving.** The worker (`rip-edocs-workspace`, `rip-edocs-document`) and ValidSign
  completion read `edocsAuthor` and pass `author` (e-mail and display name) to
  `ensureWorkspace` / `uploadDocument` on the service client. One function turns `author`
  into profile fields; it is the only place that knows how attribution is expressed.
- **A later switch to `AUTHOR_ID`.** Flevoland's authority may decide differently once
  RBA's design is assessed. That change is confined to the attribution function: it would
  also set `AUTHOR_ID` to the employee's eDOCS user id, taken from the `email → USER_ID`
  record that every interactive connect keeps (§3). No setting is added for a right that
  does not exist yet. The people lookups (`PEOPLE`, `_PEOPLE_ALL`, `PD_PEOPLE_LUP`) answered
  `missing key` to every call form tried; finding a user by e-mail through eDOCS stays
  open until then.
- No `edocsAuthor` (a process started outside RBA) → today's behaviour: `testuser001`, no
  "namens" text.

### 7. Configuration

| Setting                                                     | Purpose                                                                                                     |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `EDOCS_USER_ID`, `EDOCS_PASSWORD`                           | The service account, now `testuser001`                                                                      |
| `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET` | Refreshing a person's Entra ID token; the same values Keycloak's `entra-flevoland` provider holds           |
| `EDOCS_ALLOW_SERVICE_FALLBACK`                              | Default `false`; allows the visible service fallback for people without an Entra token                      |
| `EDOCS_ALLOWED_CLIENTS`                                     | Machine clients allowed on `/v1/edocs`; default `edocs-mcp-client,copilot-studio-edocs,operaton-mcp-client` |

`validateConfig()` gains eDOCS checks when `EDOCS_STUB_MODE=false`: the service
credentials and the three `ENTRA_*` settings must be present, and
`EDOCS_ALLOW_SERVICE_FALLBACK=true` is refused when `DEPLOYMENT_ENV=production`.

**Keycloak**, through `scripts/keycloak-entra-idp.json` and the existing script:
`storeToken: true`, `addReadTokenRoleOnCreate: true`, and `offline_access` added to the
default scope. Existing brokered users get the `broker` client's `read-token` role once,
by a small script step. A user must sign in again after the change for Keycloak to hold
their tokens.

### 8. Health

`/v1/edocs/status` keeps reporting the service session (`testuser001`): reachable,
authenticated. For a person it adds their own path — whether an eDOCS session can be
opened as them — without affecting the service probe's lockout throttle.

### 9. Security

- Entra and eDOCS tokens are never logged, returned or written to disk or the database.
  The caches are in memory, per user, bounded and expiring.
- The broker endpoint only yields the requesting person's own tokens.
- `_meta` carries a token only for the duration of one tool call; the language model never
  sees it.
- `/v1/edocs` is closed to citizens and to unknown machine clients.
- The service fallback cannot be enabled on production.

## Testing

TDD per component:

- **Entra token service** (broker endpoint and Entra mocked): a valid stored token is
  used; an expired one is refreshed; no stored token → `UserTokenUnavailableError`; a
  refused refresh → `ReauthRequiredError`; the cache is per user, so user A is never given
  user B's token; the cache bound evicts.
- **eDOCS service**: user connect sends `X-DM-AUTH` and no password; service connect sends
  the password; sessions are separate per principal; expiry triggers a reconnect; the 401
  retry fetches a fresh ID token for a user; `author` produces the "namens …" text and
  leaves `AUTHOR_ID` the service account; connect records `email → USER_ID`.
- **Routes**: the principal follows from the token; the fallback setting behaves as
  decided; the role and client allow-list are enforced; the error codes of §4.
- **Assistant**: the token travels in `_meta`, never in the tool arguments; the MCP server
  uses it as the bearer for that call only.
- **Process variables**: `edocsAuthor` is stamped on start and completion and refused as a
  client-sent variable.
- **Config**: the fallback is refused on production; missing `ENTRA_*` settings fail
  validation in live mode.
- **Live, by the user**, against `infocenter-test`: the assistant lists eDOCS workspaces as
  `GORTS01`; a Keycloak test account gets `403 EDOCS_USER_TOKEN_UNAVAILABLE`; with the
  fallback on, the same request runs as `testuser001` and says so.

## Prerequisites

1. **A working service account** — done. Flevoland IT provided `testuser001`
   ("TestUser001 (voor iou)") in place of the locked-out `IOUTEST`; `test-edocs-live.sh`
   passed 15/15 with it on 6 October 2026.
2. **The attribution probe** — done, 6 October 2026: the service account may only record
   itself as `AUTHOR_ID`, and the right cannot be granted (Flevoland IT). §6 follows.
3. The Keycloak changes of §7, locally and on ACC.
4. For PR 3: which of `ABSTRACT` / `DESCRIPTION` InfoCenter shows.

## Delivery

Three pull requests, each useful on its own:

1. **Per-user eDOCS sessions for people** — the Entra token service, per-principal
   sessions, the `/v1/edocs` principal middleware with the role and client checks, the
   fallback setting, `validateConfig`, the Keycloak script changes, and the CSRF probe.
   Testable at once with the user's own account.
2. **The AI assistant as the person** — `callTool` context and `_meta` through the eDOCS
   MCP server.
3. **Background attribution** — `edocsAuthor` and the "namens …" text (§6). No longer
   blocked; planned once PR 1 is in.

Docs: `docs/EDOCS-GO-LIVE.md`, the Entra runbook in iou-architectuur (the new Keycloak
settings and the `read-token` role), and the documentation site's eDOCS connector pages.

## Deferred

- The Copilot Studio connector with delegated authentication. It fits this model — Power
  Platform prefers delegated user auth — but needs its own design.
- Write operations by people through `/v1/edocs` beyond those that exist today.
- An eDOCS-side audience allow-list, which is Flevoland's to introduce.
