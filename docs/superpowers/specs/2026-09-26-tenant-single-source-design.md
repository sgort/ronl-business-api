# Tenant isolation: one source of truth — design

Issues: [#218](https://github.com/sgort/ronl-business-api/issues/218), [#219](https://github.com/sgort/ronl-business-api/issues/219)
Branch: `fix/tenant-single-source-218-219`
Date: 2026-09-26

## Problem

A process instance carries two tenant labels, and the backend's access checks
read different ones:

- the **`municipality` process variable** — set by `addTenantToProcessVariables`
  from the caller's token at start (and overridden to `toeslagen` by the
  `AwbZorgtoeslagProcess` block in `process.routes.ts`);
- **Operaton's `tenantId`** — taken from the deployment, which `startProcess`
  resolves via `resolveDeployedTenant` and starts under.

Nothing forces the two to agree. They diverge whenever a caller starts a process
deployed under a tenant other than their own. #218 reproduced this on ACC: a
utrecht caseworker started `AwbShellProcess` (deployed under `flevoland`), and the
instance became half-readable by each tenant and fully usable by neither.

### Where each label is read

| reads the `municipality` variable                                                                                                                                                | reads Operaton `task.tenantId`                                            |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| lists: `GET /task` (`processVariables=municipality_eq_…`), `/task/history`, `/process/history`, capacity lists, RIP lists, HR lists                                              | —                                                                         |
| details: `/process/:id/status`, `/variables`, `DELETE /process/:id`, `/historic-variables`, `/activity-history`, `/decision-document`, capacity `:instanceId`, RIP `:instanceId` | `GET /task/:id`, `/variables`, `/form-schema`, `POST /claim`, `/complete` |

### #219 is the same defect

#219 attributes the list/detail disagreement to the role filter. It is not: in
`getUserTasks` the tenant filter is applied, through
`processVariables=municipality_eq_<tenant>`. The utrecht caller's list contained
the task because its variable said `utrecht`; the detail check refused it
because Operaton said `flevoland`. The role filter behaves as documented. Making
the two labels agree resolves both issues.

### Related defects in the same checks

1. **Missing labels let everything through.** `task.tenantId && …` means a task from
   an untenanted deployment can be opened by any tenant that knows its ID;
   `/activity-history`, `/historic-variables`, capacity and RIP detail do the same
   when `municipality` is absent. `/status`, `/variables` and `DELETE` refuse.
2. **Two messages share one code.** `FORBIDDEN` carries both "municipality
   mismatch" and "organisation mismatch"; `validateTenantParam` uses
   `TENANT_MISMATCH`. No client matches on either (frontend, pa-demo,
   public-site and e2e were checked).

## Decisions

|        | decision                                                                                                                                                                                                |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1** | The `municipality` process variable is the single source of truth for tenant. Operaton's `tenantId` is no longer read by any access check.                                                              |
| **D2** | On `POST /process/:key/start`, when the caller's tenant differs from the process's deployed tenant: a **citizen** is allowed and the case gets `municipality` = deployed tenant; **staff** are refused. |
| **D3** | A missing or empty `municipality` refuses access (fails closed).                                                                                                                                        |
| **D4** | Every tenant refusal returns `403` with code `TENANT_MISMATCH` and message `Access denied: organisation mismatch`.                                                                                      |
| **D5** | The citizen own-process exception (`applicantId === userId`) stays exactly where it is today: `/historic-variables` and `/decision-document`. Making it uniform is a separate follow-up.                |

### Why the variable (D1)

It is already what every list query filters on and what 8 of the 13 detail checks
read. It is also the only label that exists for an untenanted deployment, where
Operaton's `tenantId` is `null`. Choosing Operaton's tenant would mean rewriting
every list query and would leave untenanted deployments with no tenant at all.

D2 is what makes D1 sound: once start stamps the deployed tenant into the
variable, the variable and Operaton's tenant agree for every tenant-scoped
deployment, so moving the task checks onto the variable changes no outcome for a
correctly started instance.

### Citizen versus staff (D2)

A caller is a **citizen** when their token carries the `citizen` realm role.
Everyone else is **staff**. The rule fails closed: a user whose roles match
neither pattern is treated as staff, so an unexpected role never gains a
cross-tenant start. `caseworker` cannot be the staff marker, because
`test-pa-flevoland` and `test-woo-flevoland` hold neither role. No seed user
holds both `citizen` and a staff role.

## Design

### 1. `packages/backend/src/auth/tenant-access.ts` (new)

The one module that decides tenant questions. Pure functions apart from
`denyTenant`, which writes the response.

```ts
isCitizen(user: AuthenticatedUser): boolean
// true iff user.roles includes 'citizen'

tenantAllows(user: AuthenticatedUser, municipality: unknown): boolean
// true iff municipality is a non-empty string equal to user.tenantId (D3)

denyTenant(req: Request, res: Response, context: Record<string, unknown>): Response
// logs a warning (userId, userTenant, path, ...context) and returns
// 403 { code: 'TENANT_MISMATCH', message: 'Access denied: organisation mismatch' } (D4)

resolveStartTenant(
  user: AuthenticatedUser,
  deployedTenant: string | null
): { allowed: true; municipality: string; originTenantId: string } | { allowed: false }
```

`resolveStartTenant` implements D2:

| deployed tenant        | caller  | result                           |
| ---------------------- | ------- | -------------------------------- |
| `null` (untenanted)    | anyone  | `municipality` = caller tenant   |
| equal to caller tenant | anyone  | `municipality` = caller tenant   |
| different              | citizen | `municipality` = deployed tenant |
| different              | staff   | refused                          |

`originTenantId` is always the caller's tenant: it records the channel the case
came in through, which is true whether or not it differs from `municipality`.

`validateTenantParam` in `tenant.middleware.ts` already returns the D4 shape. It
is left as it is; the new module does not import from it.

### 2. Start path — `POST /process/:key/start`

1. `addTenantToProcessVariables` runs as today and stamps `municipality` from the
   token.
2. The route calls `operatonService.resolveDeployedTenant(key)` (made public;
   behaviour unchanged, still returns `null` on failure or for an untenanted
   deployment).
3. The route applies `resolveStartTenant`. If refused, it answers via
   `denyTenant` with context `{ processKey, deployedTenant }`, and no instance is
   created. Otherwise it overwrites `operatonVariables.municipality` and sets
   `operatonVariables.originTenantId` from the result.
4. `startProcess` receives the already-resolved deployed tenant as a new optional
   parameter, and uses it instead of resolving again. Its existing fallback (the
   untenanted `/start` shorthand when the scoped start reports no matching
   definition) is unchanged. When the lookup returned `null`, `scopeTenant`
   falls back to the caller's tenant exactly as today.
5. The `AwbZorgtoeslagProcess` block keeps its type coercions and the
   `overlijdensdatum` removal. Its hardcoded `municipality = 'toeslagen'` and
   `originTenantId` assignments are removed: the general rule produces the same
   values, because `AwbZorgtoeslagProcess` is deployed under `toeslagen` (see
   Verified facts).

The `municipality` fallback inside `startProcess` changes from the caller's
tenant to the **scope tenant** (deployed tenant, or the caller's tenant for an
untenanted deployment). The user route always sets `municipality` first, so this
only decides the M2M start (`POST /v1/m2m/process/:key/start`), which calls
`startProcess` with tenant `'m2m'` and no user: without this, an M2M-started
instance would carry `municipality = 'm2m'` while its tasks carry the deployed
tenant — the #218 split again. An M2M client that supplies `municipality`
explicitly is trusted, as today.

### 3. Detail checks

Every detail check reads the variable and calls `tenantAllows`; on refusal it
returns `denyTenant`.

- **Task** (`GET /task/:id`, `/variables`, `/form-schema`, `POST /claim`,
  `/complete`): after `getTask`, read `municipality` from
  `getProcessVariables(task.processInstanceId)` rather than `task.tenantId`. For a
  task in a called subprocess this is the child instance's variable, which it
  inherits (see Verified facts). `/variables` checks the map it already fetches
  instead of making a second call.
- **Process** (`/status`, `/variables`, `DELETE`, `/historic-variables`,
  `/activity-history`, `/decision-document`): the existing runtime or historic
  read, through `tenantAllows`. On `/historic-variables` and
  `/decision-document` the own-process exception still applies (D5):
  `tenantAllows(...) || applicantId === userId`.
- **Capacity** `GET /capacity/:instanceId` and **RIP** `GET /rip/:instanceId`:
  `result.variables.municipality` through `tenantAllows`.

The logged context keeps what each site logs today (`processInstanceId`,
`taskId`, `processTenant`/`taskTenant`) so log searches continue to work.

### 4. Lists

No change. They already filter on the variable, and after §2 the variable is the
deployed tenant for tenant-scoped deployments, which is what closes #219.

### 5. The label is immutable after start

The whole-branch review found that `POST /v1/task/:id/complete` forwarded
every body variable to Operaton, which stores completion variables on the
process instance: a completion carrying `municipality` would relabel the
case, and one carrying `applicantId` would unlock the applicant exception for
another user. Under D1 that is a tenant bypass.

`municipality`, `originTenantId` and `applicantId` are reserved
(`RESERVED_PROCESS_VARIABLES` in `tenant-access.ts`). A user completion whose
variables contain any of them is refused with `400 RESERVED_VARIABLE`, after
the tenant check and before anything reaches Operaton. The M2M complete route
is trusted and unchanged, as with the M2M start.

## Verified facts

Read-only checks against the local Operaton (`localhost:8081`, which holds the
same deployments as ACC), 2026-09-26:

- **Every deployed process definition is tenant-scoped.** 19 latest definitions,
  none untenanted: `AwbZorgtoeslagProcess` and
  `ZorgtoeslagProvisionalSubProcessE2E` under `toeslagen`, all others (AwbShell,
  Thuisbatterij, TreeFelling, RIP R2.1–R6.1) under `flevoland`.
  Consequences under D2: the only staff who can start a process are `flevoland`
  staff (any flevoland process) and `toeslagen` staff (AWB). Citizens of any
  tenant can start either, and their case lands with the processing tenant.
- **Called subprocesses inherit `municipality`.** Every call activity in the
  deployed BPMNs (AwbShell, Thuisbatterij, AwbZorgtoeslag — in the LDE
  `e2e-fixtures` and examples) declares `<camunda:in variables="all"/>`.
- **The e2e suite only crosses tenants the citizen way.**
  `tenant-isolation.spec.ts` and `zorgtoeslag-journey.spec.ts` use
  `test-citizen-unive` → `toeslagen`, which D2 keeps. The comment in
  `zorgtoeslag-journey.spec.ts` that attributes the routing to "process.routes.ts
  overrides the municipality variable explicitly" is updated to name the
  general rule.

## What #211 documents

#211 documents the 403s as settled here, replacing the "describe as-is and point
at #218" plan:

- Every tenant refusal on `/v1/process/*`, `/v1/task/*`, `/v1/capacity/*` and
  `/v1/rip/*`: `403`, code `TENANT_MISMATCH`, message
  `Access denied: organisation mismatch`. The resource exists but belongs to
  another organisation, or has no organisation label.
- `POST /v1/process/{key}/start`: the same `403 TENANT_MISMATCH` when a staff
  caller starts a process deployed under another organisation. Citizens are not
  refused; their case is assigned to the processing organisation and
  `originTenantId` records theirs.
- The two process variables every started instance carries: `municipality`
  (owning organisation — what access checks enforce) and `originTenantId`
  (the caller's organisation at start).
- `FORBIDDEN` remains for non-tenant refusals (for example, a citizen requesting
  another applicant's `/process/history`).
- `POST /v1/task/{id}/complete`: `400 RESERVED_VARIABLE` when the body's
  variables include `municipality`, `originTenantId` or `applicantId`.

#216 (problem details) later maps `TENANT_MISMATCH` to its own `type`.

## Testing

**Unit** — `tenant-access.test.ts`: every row of the `resolveStartTenant` table,
`tenantAllows` with equal, different, missing, empty and non-string labels,
`isCitizen` with citizen, staff and role-less users, and the `denyTenant`
response shape.

**Route** — in the existing `process.routes.test.ts`, `task.routes.test.ts`,
`capacity.routes.test.ts` and `rip.routes.test.ts`, for each changed site: allowed,
wrong tenant, missing label (all refused with `TENANT_MISMATCH`), and, on the two
D5 sites, the applicant exception. Start: staff mismatch refused and no instance
created; citizen mismatch started with `municipality` = deployed tenant and
`originTenantId` = caller; AWB still yields `toeslagen`; the deployed tenant is
resolved once. Task: a task whose Operaton `tenantId` disagrees with its variable
is decided by the variable. Existing tests asserting `FORBIDDEN` on tenant
refusals change to `TENANT_MISMATCH`. The per-file 80% branch floor holds.

**Live, on the local stack** (the user runs the stack; nothing here starts or
stops it):

1. #218 replay: `test-caseworker-utrecht` starts `AwbShellProcess` → `403
TENANT_MISMATCH`, no instance created.
2. #219 replay: `test-citizen-utrecht` starts `AwbShellProcess` → `201`,
   `municipality = flevoland`, `originTenantId = utrecht`. The resulting task
   appears in `GET /task` for `test-caseworker-flevoland` and opens on
   `GET /task/:id`; `test-caseworker-utrecht` sees it in neither.
3. `test-citizen-unive` → `AwbZorgtoeslagProcess` still reaches
   `test-caseworker-toeslagen`.
4. The instances created are deleted afterwards.

**E2E** — the user runs the full suite and reports the result.

## Out of scope

- Problem-details mapping (#216).
- Making the D5 own-process exception uniform — a follow-up issue.
- Existing instances. The change starts from a clean sheet, locally and on ACC:
  no migration, and no handling for instances started under the old rules.
