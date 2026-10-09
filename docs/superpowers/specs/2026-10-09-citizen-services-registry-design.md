# Citizen services from a registry and the deployments, not from `features`

Issue: #344. Date: 2026-10-09.

## Problem

The citizen dashboard showed a service card for each `features` flag in a tenant's `tenants.json` entry, but each card starts one fixed process whatever the tenant. Nothing tied a flag to where its process is deployed or to which authority handles the case. `resolveStartTenant` hands a citizen's start to the deploying tenant, so an Amsterdam resident who applied for a Kapvergunning got a case at Provincie Flevoland. That is right for Zorgtoeslag, a national allowance Dienst Toeslagen handles for any channel, and wrong for a municipal permit or a provincial subsidy. The stopgap (flags off for municipalities, guarded by `tenant-features.test.ts`) still leaves a hand-kept list that the next tenant can get wrong.

## Intent

A citizen sees, and can start, only a service whose application lands at the right authority: their own organisation, or a deliberately cross-tenant service such as Zorgtoeslag at Toeslagen.

Done when:

- a tenant never offers a service whose case would land at another authority, unless that service is cross-tenant by design;
- adding a tenant needs no per-tenant service configuration;
- the cross-tenant route for Zorgtoeslag keeps working (`e2e/zorgtoeslag-journey.spec.ts`, `e2e/tenant-isolation.spec.ts`);
- the existing e2e journeys stay green.

Decisions taken during brainstorming:

- A code registry plus a deployment check now; a fully data-driven catalogue (cards described by BPMN metadata) is a separate issue.
- Two scopes, `own-tenant` and `cross-tenant`. Tenant is mandatory: an untenanted process deployment never counts. Localhost Operaton is the reference.
- The backend enforces the scope at start, not only the dashboard.
- `features` is retired. Meldingen, which has no process, leaves the dashboard until it has one.
- DVTP is retired.
- Every citizen now sees Zorgtoeslag, including Flevoland, Toeslagen and UWV, which had it off. By design: it is cross-tenant and the case goes to Dienst Toeslagen.
- The engine cleanup is limited to RBA drift plus DVTP (see section 7).

## Design

### 1. Registry in `@ronl/shared`

`packages/shared/src/citizen-services.ts`, data only (the package holds declarations, not logic; `scripts/check-shared-declarations.mjs` enforces that):

```ts
export const CITIZEN_SERVICES = [
  { id: 'zorgtoeslag', processKey: 'AwbZorgtoeslagProcess', scope: 'cross-tenant' },
  { id: 'vergunningen', processKey: 'AwbShellProcess', scope: 'own-tenant' },
  { id: 'subsidies', processKey: 'ThuisbatterijSubsidieAanvraagProcess', scope: 'own-tenant' },
  { id: 'heusdenpas', processKey: 'HeusdenpasAanvraagProcess', scope: 'own-tenant' },
] as const;

export type CitizenServiceId = (typeof CITIZEN_SERVICES)[number]['id'];
export type CitizenServiceScope = 'own-tenant' | 'cross-tenant';
```

Exported from `index.ts`. Labels, icons and forms stay in the frontend. A new citizen service is one entry here plus its UI.

### 2. `GET /v1/process/available`

Citizens only (`citizen` role); others get 403. Answers `{ success: true, data: { services: CitizenServiceId[] } }`, in registry order.

Rule, per registry entry, from one Operaton query (`GET /process-definition?keysIn=<all registry keys>&latestVersion=true`, which returns the latest version per tenant):

- `own-tenant`: available when a deployment exists under the citizen's tenant (`user.tenantId`).
- `cross-tenant`: available when it is deployed under exactly one tenant. Under none, or under several (the start would be ambiguous, 409), it is not offered.
- A deployment without a tenant never counts.

The rule is a pure function in the backend (`citizenServicesAvailable(deployments, tenantId)`), so it is tested without HTTP. If Operaton fails, the endpoint answers 503 `SERVICES_UNAVAILABLE`; it never falls back to offering everything. Documented in the OpenAPI document with its own conformance test, like the other `/v1/process` operations.

### 3. Enforcement at start

`resolveStartTenant(user, deployedTenant, processKey)` in `auth/tenant-access.ts`:

- deployed under the caller's own tenant: allowed, as today;
- deployed under another tenant: a citizen is allowed only if the registry marks the process `cross-tenant`, and the case then goes to that tenant with `originTenantId` = the caller's tenant, as today; otherwise 403 `TENANT_MISMATCH`. Staff are refused, as today;
- deployed without a tenant (`deployedTenant === null`): refused for citizens (tenant is mandatory); unchanged for staff, because HR onboarding still runs untenanted (follow-up issue).

`process.routes.ts` passes the key. The refusal uses the existing 403 problem, so the frontend's start-failure notice needs no change.

### 4. Citizen dashboard

`Dashboard.tsx` fetches `GET /v1/process/available` on load (new `businessApi.process.available()`); the cards are exactly the returned services, in registry order. A frontend map `pages/citizen/citizenServiceUi.ts` gives label, description and icon per service id. What a card opens is unchanged: the Zorgtoeslag calculator, `VergunningForm`, `SubsidieForm`, `HeusdenpasForm`. The "in ontwikkeling" placeholder branch goes. On failure the page shows "De diensten konden niet worden geladen" with a retry button. A test checks that the UI map and the registry cover the same ids.

### 5. `features` retired

Removed from every tenant in `public/tenants.json`, from `TenantFeatures` and `TenantConfig.features` in `packages/frontend/src/services/tenant.ts` and `packages/shared/src/types/tenant.types.ts`. Nothing in the backend reads it. `tenant-features.test.ts` is replaced by a registry test stating the scopes (Kapvergunning, Thuisbatterij, Heusdenpas own-tenant; Zorgtoeslag cross-tenant).

### 6. DVTP retired

- Citizen dashboard: the "Mijn toestemming" tab and its sub-views.
- Caseworker V2: the DVTP rail group (`dvtp-start`, `dvtp-taken`) in `modes.config.ts`, including the shell-global ids, and their `SectionRouter` cases.
- `DvtpStartSection.tsx`, `DvtpTakenSection.tsx` and their tests.
- Kept: the Procesbibliotheek test, which uses DVTP only as LDE catalogue data, and historical changelog entries.

### 7. Engine cleanup

`operaton.open-regels.nl` serves both ACC and PROD. After the PR is merged and deployed to ACC, every untenanted version of these process definitions is deleted, per process definition (`DELETE /process-definition/{id}?cascade=true`), not per deployment, because a deployment can also hold untenanted decisions that the tenanted processes still call:

- `ThuisbatterijSubsidieAanvraagProcess`, `ThuisbatterijSubsidieDecisionSubProcess` (drift: a `flevoland` version exists);
- `ManagementCapacityClaimProcess` (drift: a `flevoland` version exists; 2 running untenanted instances end);
- `DvtpToestemmingGevenProcess` (retired; 1 running instance ends).

The exact list of definition ids is shown and approved before anything is deleted. Decisions are not touched: they are untenanted on purpose. PROD still runs the older `main`, whose DVTP tab breaks until the next release; PROD has no real users yet.

Not in this pass (follow-up issue): `HrOnboardingProcess` (untenanted only, used by RBA's HR onboarding) and the processes no RBA or LDE code references (Chain Composer orchestrators, test processes, Migratie en Asiel, bezwaar processes), to be resolved with their owners.

### 8. Testing

- Backend: the availability rule (own tenant, cross-tenant, untenanted ignored, several tenants); the endpoint (citizen only, 503 on failure, conformance); `resolveStartTenant` (own-tenant service under another tenant refused, Zorgtoeslag allowed, untenanted refused for citizens and unchanged for staff); the start route passing the key.
- Frontend: cards follow the endpoint; the error state and retry; no "Mijn toestemming" tab; registry and UI map in step; no DVTP in the caseworker rail.
- e2e: existing journeys unchanged (Flevoland Kapvergunning and Thuisbatterij, Univé Zorgtoeslag, Heusdenpas). New: `test-citizen-amsterdam` sees exactly Zorgtoeslag; `test-citizen-heusden` sees Zorgtoeslag and Heusdenpas.

### 9. Follow-up issues, filed with this work

- A fully data-driven citizen-service catalogue (cards from BPMN metadata).
- HR onboarding and the remaining untenanted processes on the shared engine.

## Delivery

One PR from `feat/citizen-services-registry`, in three commits: shared registry and backend (endpoint, rule, enforcement); frontend (dashboard from the endpoint, `features` and DVTP retired); and the `tenants.json` cleanup with the replacement guard test. The engine cleanup follows the ACC deploy, as a separate approved step.
