# Citizen services from a registry and the deployments — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The citizen dashboard offers exactly the services whose process is deployed for the citizen (own tenant) or deliberately cross-tenant, and the backend refuses any other start; `features` and DVTP are retired.

**Architecture:** A data-only registry in `@ronl/shared` names each citizen service, its process key and its scope. The backend derives availability from Operaton's latest deployments per tenant (`GET /v1/process/available`) and enforces the scope in `resolveStartTenant`. The dashboard renders cards from the endpoint through a frontend UI map; `tenants.json` loses `features`.

**Tech Stack:** TypeScript; Express + Jest + supertest (backend); React + Vitest + Testing Library (frontend); Playwright (e2e); OpenAPI 3.1 YAML built to JSON (`npm run build:openapi`); Operaton REST.

**Spec:** `docs/superpowers/specs/2026-10-09-citizen-services-registry-design.md`

## Global Constraints

- Scopes are exactly `own-tenant` and `cross-tenant`. A deployment with `tenantId: null` never counts.
- Registry (spec §1): `zorgtoeslag` → `AwbZorgtoeslagProcess` cross-tenant; `vergunningen` → `AwbShellProcess`, `subsidies` → `ThuisbatterijSubsidieAanvraagProcess`, `heusdenpas` → `HeusdenpasAanvraagProcess` own-tenant.
- `@ronl/shared` holds declarations and constant data only; `node scripts/check-shared-declarations.mjs` must pass. Logic goes in the backend.
- After changing `@ronl/shared`, build it (`npm run build --workspace=@ronl/shared`): the frontend resolves it from `dist/`. The backend's Jest maps it to `src/`.
- Endpoint answer: `{ success: true, data: { services: CitizenServiceId[] } }` in registry order; non-citizens 403 `FORBIDDEN`; Operaton failure 503 `SERVICES_UNAVAILABLE`, never a fallback to all services.
- Start refusal reuses the existing 403 `TENANT_MISMATCH` (`denyTenant`).
- Dashboard error copy: "De diensten konden niet worden geladen." with a button "Opnieuw proberen".
- Per-file branch coverage floor 80% in backend and frontend.
- Prettier covers ts/tsx/json/md only, never CSS. No `--no-verify`.
- Git: never commit without the user's fresh approval; the user runs the full suites (`npm test --workspace=@ronl/backend`, `npm test --workspace=@ronl/frontend`) and e2e and gives their green first. No Claude attribution in commits or PRs. Three commits (spec "Delivery"), one PR to `acc`.
- Do not start, stop or restart dev servers. A stale Vite prebundle of `@ronl/shared` (white page) is the user's to clear.

## Review Focus

- Operaton unreachable when the dashboard loads → `/available` answers 503 and the dashboard shows the error with a retry, never every card (Task 3, Task 6).
- A registry process deployed under several tenants → an own-tenant service is offered to a citizen of one of them; a cross-tenant service is offered to nobody (Task 2).
- A registry process deployed only untenanted (ACC drift before cleanup) → not offered, and a citizen's direct start is refused (Task 2, Task 4).
- A citizen token without a tenant (`tenantId` empty) → only cross-tenant services, no crash (Task 2).
- The deployment lookup failing at start (`resolveDeployedTenant` → `null`) → a citizen's start is refused, not sent to the untenanted path (Task 4).

---

## File structure

| File                                                                                                                                                 | Responsibility                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `packages/shared/src/citizen-services.ts` (new)                                                                                                      | `CITIZEN_SERVICES`, `CitizenServiceId`, `CitizenServiceScope` — data only                       |
| `packages/shared/src/index.ts`                                                                                                                       | export it                                                                                       |
| `packages/backend/src/auth/citizen-services.ts` (new)                                                                                                | `citizenServicesAvailable`, `isCrossTenantProcess`, `CITIZEN_SERVICE_PROCESS_KEYS` — the policy |
| `packages/backend/src/services/operaton.service.ts`                                                                                                  | `getLatestProcessDeployments(keys)`                                                             |
| `packages/backend/src/routes/process.routes.ts`                                                                                                      | `GET /available`; pass the key to `resolveStartTenant`                                          |
| `packages/backend/src/auth/tenant-access.ts`                                                                                                         | `resolveStartTenant(user, deployedTenant, processKey)`                                          |
| `packages/backend/openapi/openapi.yaml`                                                                                                              | `/process/available`                                                                            |
| `packages/frontend/src/services/api.ts`                                                                                                              | `businessApi.process.available()`                                                               |
| `packages/frontend/src/pages/citizen/citizenServiceUi.ts` (new)                                                                                      | label, description, icon per service id                                                         |
| `packages/frontend/src/pages/Dashboard.tsx`                                                                                                          | cards from the endpoint; DVTP tab and stub removed                                              |
| `packages/frontend/src/pages/caseworker-v2/modes.config.ts`, `components/CaseworkerDashboardV2/SectionRouter.tsx`, `pages/CaseworkerDashboardV2.tsx` | DVTP rail removed                                                                               |
| `packages/frontend/src/components/CaseworkerDashboard/DvtpStartSection.tsx`, `DvtpTakenSection.tsx` (+ tests)                                        | deleted                                                                                         |
| `packages/frontend/public/tenants.json`, `src/services/tenant.ts`, `packages/shared/src/types/tenant.types.ts`                                       | `features` removed                                                                              |
| `packages/frontend/src/services/tenant-features.test.ts`                                                                                             | replaced by `src/pages/citizen/citizenServices.test.ts`                                         |
| `packages/frontend/e2e/citizen-services.spec.ts` (new)                                                                                               | which cards a citizen sees                                                                      |

---

### Task 1: The registry in `@ronl/shared`

**Files:**

- Create: `packages/shared/src/citizen-services.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**

- Produces: `CITIZEN_SERVICES` (readonly tuple of `{ id, processKey, scope }`), `type CitizenServiceId`, `type CitizenServiceScope`.

- [ ] **Step 1: Create the registry**

```ts
/**
 * The services a citizen can apply for on the dashboard (#344), one entry
 * each: the process it starts and whose case it becomes.
 *
 * - own-tenant: offered only when the process is deployed under the citizen's
 *   own tenant, so the case lands at their own organisation.
 * - cross-tenant: offered to every citizen when the process is deployed under
 *   one tenant, which handles the case for any channel (Zorgtoeslag at Dienst
 *   Toeslagen).
 *
 * The backend derives the dashboard's cards and checks every start against
 * this list; labels, icons and forms are the frontend's. Data only: this
 * package holds no logic (scripts/check-shared-declarations.mjs).
 */
export const CITIZEN_SERVICES = [
  { id: 'zorgtoeslag', processKey: 'AwbZorgtoeslagProcess', scope: 'cross-tenant' },
  { id: 'vergunningen', processKey: 'AwbShellProcess', scope: 'own-tenant' },
  { id: 'subsidies', processKey: 'ThuisbatterijSubsidieAanvraagProcess', scope: 'own-tenant' },
  { id: 'heusdenpas', processKey: 'HeusdenpasAanvraagProcess', scope: 'own-tenant' },
] as const;

export type CitizenServiceId = (typeof CITIZEN_SERVICES)[number]['id'];
export type CitizenServiceScope = (typeof CITIZEN_SERVICES)[number]['scope'];
```

- [ ] **Step 2: Export it** — in `packages/shared/src/index.ts`, after `export * from './awb-phases';` add:

```ts
export * from './citizen-services';
```

- [ ] **Step 3: Check and build**

Run: `node scripts/check-shared-declarations.mjs && npm run build --workspace=@ronl/shared`
Expected: the check exits 0; `packages/shared/dist/citizen-services.js` exists.

---

### Task 2: The availability rule and the Operaton query

**Files:**

- Create: `packages/backend/src/auth/citizen-services.ts`, `packages/backend/src/auth/citizen-services.test.ts`
- Modify: `packages/backend/src/services/operaton.service.ts` (near `getDeployedProcessKeys`, ~line 210), `packages/backend/src/services/operaton.service.test.ts`

**Interfaces:**

- Consumes: `CITIZEN_SERVICES`, `CitizenServiceId` from `@ronl/shared`.
- Produces:
  - `interface ProcessDeployment { key: string; tenantId: string | null }`
  - `citizenServicesAvailable(deployments: ProcessDeployment[], tenantId: string | undefined): CitizenServiceId[]`
  - `isCrossTenantProcess(processKey: string): boolean`
  - `CITIZEN_SERVICE_PROCESS_KEYS: string[]`
  - `operatonService.getLatestProcessDeployments(keys: string[]): Promise<ProcessDeployment[]>` (throws on failure)

- [ ] **Step 1: Write the failing policy tests** (`src/auth/citizen-services.test.ts`)

```ts
import {
  CITIZEN_SERVICE_PROCESS_KEYS,
  citizenServicesAvailable,
  isCrossTenantProcess,
  type ProcessDeployment,
} from './citizen-services';

const d = (key: string, tenantId: string | null): ProcessDeployment => ({ key, tenantId });

describe('citizenServicesAvailable', () => {
  it('offers an own-tenant service deployed under the citizen tenant', () => {
    expect(
      citizenServicesAvailable([d('HeusdenpasAanvraagProcess', 'heusden')], 'heusden')
    ).toEqual(['heusdenpas']);
  });

  it('does not offer an own-tenant service deployed only under another tenant', () => {
    expect(citizenServicesAvailable([d('AwbShellProcess', 'flevoland')], 'amsterdam')).toEqual([]);
  });

  it('offers a cross-tenant service deployed under exactly one tenant to everyone', () => {
    expect(
      citizenServicesAvailable([d('AwbZorgtoeslagProcess', 'toeslagen')], 'amsterdam')
    ).toEqual(['zorgtoeslag']);
  });

  it('never counts an untenanted deployment', () => {
    const deployments = [
      d('ThuisbatterijSubsidieAanvraagProcess', null),
      d('AwbZorgtoeslagProcess', null),
    ];
    expect(citizenServicesAvailable(deployments, 'amsterdam')).toEqual([]);
  });

  it('offers an own-tenant service deployed under several tenants to a citizen of one of them', () => {
    const deployments = [d('AwbShellProcess', 'flevoland'), d('AwbShellProcess', 'utrecht')];
    expect(citizenServicesAvailable(deployments, 'utrecht')).toEqual(['vergunningen']);
  });

  it('does not offer a cross-tenant service deployed under several tenants (the start would be ambiguous)', () => {
    const deployments = [
      d('AwbZorgtoeslagProcess', 'toeslagen'),
      d('AwbZorgtoeslagProcess', 'uwv'),
    ];
    expect(citizenServicesAvailable(deployments, 'amsterdam')).toEqual([]);
  });

  it('gives a citizen without a tenant only cross-tenant services', () => {
    const deployments = [
      d('AwbZorgtoeslagProcess', 'toeslagen'),
      d('AwbShellProcess', 'flevoland'),
    ];
    expect(citizenServicesAvailable(deployments, '')).toEqual(['zorgtoeslag']);
    expect(citizenServicesAvailable(deployments, undefined)).toEqual(['zorgtoeslag']);
  });

  it('answers in registry order, ignoring keys the registry does not know', () => {
    const deployments = [
      d('HeusdenpasAanvraagProcess', 'heusden'),
      d('SomethingElse', 'heusden'),
      d('AwbZorgtoeslagProcess', 'toeslagen'),
    ];
    expect(citizenServicesAvailable(deployments, 'heusden')).toEqual(['zorgtoeslag', 'heusdenpas']);
  });
});

describe('isCrossTenantProcess', () => {
  it('is true only for a registry process marked cross-tenant', () => {
    expect(isCrossTenantProcess('AwbZorgtoeslagProcess')).toBe(true);
    expect(isCrossTenantProcess('AwbShellProcess')).toBe(false);
    expect(isCrossTenantProcess('HrOnboardingProcess')).toBe(false);
  });
});

describe('CITIZEN_SERVICE_PROCESS_KEYS', () => {
  it('lists every registry process once', () => {
    expect(CITIZEN_SERVICE_PROCESS_KEYS).toEqual([
      'AwbZorgtoeslagProcess',
      'AwbShellProcess',
      'ThuisbatterijSubsidieAanvraagProcess',
      'HeusdenpasAanvraagProcess',
    ]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/backend && npx jest src/auth/citizen-services.test.ts`
Expected: FAIL — cannot find module `./citizen-services`.

- [ ] **Step 3: Implement** (`src/auth/citizen-services.ts`)

```ts
import { CITIZEN_SERVICES, type CitizenServiceId } from '@ronl/shared';

/** One latest process definition as Operaton reports it: its key and tenant. */
export interface ProcessDeployment {
  key: string;
  tenantId: string | null;
}

/** Every process a citizen service starts, in registry order. */
export const CITIZEN_SERVICE_PROCESS_KEYS: string[] = CITIZEN_SERVICES.map((s) => s.processKey);

/**
 * The citizen services a citizen of `tenantId` may start (#344), in registry
 * order. own-tenant: deployed under the citizen's own tenant. cross-tenant:
 * deployed under exactly one tenant, which then handles the case; under
 * several the start would be ambiguous (409), so it is not offered. A
 * deployment without a tenant never counts: tenant is mandatory.
 */
export function citizenServicesAvailable(
  deployments: ProcessDeployment[],
  tenantId: string | undefined
): CitizenServiceId[] {
  return CITIZEN_SERVICES.filter((service) => {
    const tenants = new Set(
      deployments
        .filter((d) => d.key === service.processKey && d.tenantId !== null)
        .map((d) => d.tenantId as string)
    );
    return service.scope === 'own-tenant'
      ? Boolean(tenantId) && tenants.has(tenantId as string)
      : tenants.size === 1;
  }).map((service) => service.id);
}

/** Whether a citizen may start this process under another tenant than their own. */
export function isCrossTenantProcess(processKey: string): boolean {
  return CITIZEN_SERVICES.some((s) => s.processKey === processKey && s.scope === 'cross-tenant');
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/backend && npx jest src/auth/citizen-services.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Failing test for the Operaton query** — in `src/services/operaton.service.test.ts`, inside the `describe` that holds `'getProcessVariables GETs the variables sub-resource'`, add:

```ts
it('getLatestProcessDeployments asks for the latest version per tenant of the given keys', async () => {
  mockClient.get.mockResolvedValue({
    data: [
      { id: 'a:1', key: 'AwbShellProcess', tenantId: 'flevoland', version: 11 },
      { id: 'b:1', key: 'AwbZorgtoeslagProcess', tenantId: null, version: 2 },
    ],
  });

  await expect(
    svc.getLatestProcessDeployments(['AwbShellProcess', 'AwbZorgtoeslagProcess'])
  ).resolves.toEqual([
    { key: 'AwbShellProcess', tenantId: 'flevoland' },
    { key: 'AwbZorgtoeslagProcess', tenantId: null },
  ]);
  expect(mockClient.get).toHaveBeenCalledWith('/process-definition', {
    params: { keysIn: 'AwbShellProcess,AwbZorgtoeslagProcess', latestVersion: true },
  });
});

it('getLatestProcessDeployments rethrows, so the caller can answer 503', async () => {
  mockClient.get.mockRejectedValueOnce(new Error('down'));
  await expect(svc.getLatestProcessDeployments(['AwbShellProcess'])).rejects.toThrow('down');
});
```

and in the `describe('failures that are not Error instances')` table add
`['getLatestProcessDeployments', () => svc.getLatestProcessDeployments(['K'])],`.

- [ ] **Step 6: Run to verify it fails**

Run: `cd packages/backend && npx jest src/services/operaton.service.test.ts -t getLatestProcessDeployments`
Expected: FAIL (the suite does not compile: no such method).

- [ ] **Step 7: Implement** — in `operaton.service.ts`, directly after `getDeployedProcessKeys`:

```ts
  /**
   * The latest version of each given process key, per tenant (latestVersion
   * returns one row per tenant), as key and tenant. For the citizen-service
   * check (#344). Throws on failure: the caller answers 503 rather than guess.
   */
  async getLatestProcessDeployments(
    keys: string[]
  ): Promise<Array<{ key: string; tenantId: string | null }>> {
    try {
      const response = await this.client.get('/process-definition', {
        params: { keysIn: keys.join(','), latestVersion: true },
      });
      return (response.data as Array<{ key: string; tenantId?: string | null }>).map((d) => ({
        key: d.key,
        tenantId: d.tenantId ?? null,
      }));
    } catch (error) {
      logger.error('Failed to query latest process deployments', {
        keys,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }
```

- [ ] **Step 8: Run to verify it passes**

Run: `cd packages/backend && npx jest src/services/operaton.service.test.ts src/auth/citizen-services.test.ts`
Expected: PASS.

---

### Task 3: `GET /v1/process/available` and its OpenAPI entry

**Files:**

- Modify: `packages/backend/src/routes/process.routes.ts` (insert the route directly before `router.get('/history'`, ~line 218), `packages/backend/src/routes/process.routes.test.ts`, `packages/backend/openapi/openapi.yaml` (insert before `  /process/history:`, ~line 1301)

**Interfaces:**

- Consumes: `operatonService.getLatestProcessDeployments`, `citizenServicesAvailable`, `CITIZEN_SERVICE_PROCESS_KEYS` (Task 2), `isCitizen` (already imported).
- Produces: `GET /v1/process/available` → `{ success: true, data: { services: CitizenServiceId[] } }`.

- [ ] **Step 1: Failing route tests** — in `process.routes.test.ts`, add `getLatestProcessDeployments: jest.fn(),` to the `operatonService` mock object, and add:

```ts
describe('GET /available', () => {
  const asCitizen = (r: request.Test) => auth(r).set('x-test-roles', 'citizen');

  it('401 without a token', async () => {
    expect((await request(app).get('/v1/process/available')).status).toBe(401);
  });

  it('403 FORBIDDEN for a caller who is not a citizen', async () => {
    const res = await auth(request(app).get('/v1/process/available'));
    expect(res.status).toBe(403);
    expectToMatchOperation(res, 'get', '/process/available');
    expect(res.body.code).toBe('FORBIDDEN');
    expect(svc.getLatestProcessDeployments).not.toHaveBeenCalled();
  });

  it('answers the services the citizen may start, from the deployments', async () => {
    svc.getLatestProcessDeployments.mockResolvedValue([
      { key: 'AwbZorgtoeslagProcess', tenantId: 'toeslagen' },
      { key: 'AwbShellProcess', tenantId: 'flevoland' },
    ]);
    const res = await asCitizen(request(app).get('/v1/process/available'));
    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'get', '/process/available');
    // The test user's tenant is flevoland (see the auth mock at the top).
    expect(res.body.data).toEqual({ services: ['zorgtoeslag', 'vergunningen'] });
    expect(svc.getLatestProcessDeployments).toHaveBeenCalledWith([
      'AwbZorgtoeslagProcess',
      'AwbShellProcess',
      'ThuisbatterijSubsidieAanvraagProcess',
      'HeusdenpasAanvraagProcess',
    ]);
  });

  it('503 SERVICES_UNAVAILABLE when Operaton cannot be asked, never every service', async () => {
    svc.getLatestProcessDeployments.mockRejectedValue(new Error('down'));
    const res = await asCitizen(request(app).get('/v1/process/available'));
    expect(res.status).toBe(503);
    expectToMatchOperation(res, 'get', '/process/available');
    expect(res.body.code).toBe('SERVICES_UNAVAILABLE');
  });
});
```

The auth mock at the top of the test file gives every test user `tenantId: 'flevoland'` and takes roles from `x-test-roles` (default `caseworker`), so the 200 test expects Zorgtoeslag (cross-tenant) and Kapvergunning (own tenant, flevoland).

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/backend && npx jest src/routes/process.routes.test.ts -t "GET /available"`
Expected: FAIL (404 from the router).

- [ ] **Step 3: Implement the route** — imports at the top of `process.routes.ts`:

```ts
import { CITIZEN_SERVICE_PROCESS_KEYS, citizenServicesAvailable } from '@auth/citizen-services';
```

(If the `@auth` alias does not resolve in Jest, use `'../auth/citizen-services'`, as the file already imports `'@auth/jwt.middleware'`.) Then, before `router.get('/history'`:

```ts
/**
 * GET /v1/process/available
 * The citizen services the signed-in citizen may start (#344), derived from
 * where each registry process is deployed (see auth/citizen-services.ts).
 * Citizens only. If Operaton cannot be asked, 503: the dashboard shows an
 * error rather than every service.
 */
router.get('/available', async (req, res) => {
  if (!req.user) {
    return sendProblem(res, req, {
      status: 401,
      code: 'UNAUTHORIZED',
      detail: 'Authentication required',
    });
  }
  if (!isCitizen(req.user)) {
    return sendProblem(res, req, {
      status: 403,
      code: 'FORBIDDEN',
      detail: 'Only citizens have citizen services',
    });
  }

  try {
    const deployments = await operatonService.getLatestProcessDeployments(
      CITIZEN_SERVICE_PROCESS_KEYS
    );
    const services = citizenServicesAvailable(deployments, req.user.tenantId);
    res.json({ success: true, data: { services } });
  } catch (error) {
    logger.error('Failed to determine available citizen services', {
      tenantId: req.user.tenantId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    sendProblem(res, req, {
      status: 503,
      code: 'SERVICES_UNAVAILABLE',
      detail: 'The available services could not be determined',
    });
  }
});
```

- [ ] **Step 4: Document it** — in `openapi/openapi.yaml`, before `  /process/history:`:

```yaml
/process/available:
  get:
    operationId: getAvailableCitizenServices
    tags: [Process]
    summary: The citizen services the caller may start
    description: |
      Derived from where each citizen service's process is deployed (#344):
      an own-tenant service when it is deployed under the caller's tenant,
      a cross-tenant service when it is deployed under exactly one tenant.
      An untenanted deployment never counts. Citizens only.
    responses:
      '200':
        description: The service ids, in registry order.
        content:
          application/json:
            schema:
              type: object
              required: [success, data]
              properties:
                success: { type: boolean, const: true }
                data:
                  type: object
                  required: [services]
                  properties:
                    services:
                      type: array
                      items:
                        type: string
                        enum: [zorgtoeslag, vergunningen, subsidies, heusdenpas]
        headers:
          API-Version:
            $ref: '#/components/headers/ApiVersion'
      '400':
        $ref: '#/components/responses/BadRequest'
      '401':
        $ref: '#/components/responses/Unauthorized'
      '403':
        description: The caller is not a citizen (`FORBIDDEN`).
        $ref: '#/components/responses/Error'
      '503':
        description: Operaton could not be asked (`SERVICES_UNAVAILABLE`).
        $ref: '#/components/responses/Error'
```

- [ ] **Step 5: Build the document and run the route and OpenAPI tests**

Run: `cd packages/backend && npm run build:openapi && npx jest src/routes/process.routes.test.ts src/openapi && npm run lint:openapi`
Expected: PASS; the coverage test sees the new operation as served and documented; spectral reports no errors.

---

### Task 4: Enforce the scope at start

**Files:**

- Modify: `packages/backend/src/auth/tenant-access.ts` (`resolveStartTenant`, ~line 107), `packages/backend/src/auth/tenant-access.test.ts` (`describe('resolveStartTenant')`, ~line 76), `packages/backend/src/routes/process.routes.ts` (~line 115), `packages/backend/src/routes/process.routes.test.ts`

**Interfaces:**

- Consumes: `isCrossTenantProcess` (Task 2).
- Produces: `resolveStartTenant(user, deployedTenant: string | null, processKey: string): StartTenant`.

- [ ] **Step 1: Rewrite the `resolveStartTenant` tests** — replace the whole `describe('resolveStartTenant', …)` block with:

```ts
describe('resolveStartTenant', () => {
  it('same tenant: stamps the caller tenant, for anyone', () => {
    expect(resolveStartTenant(staff('flevoland'), 'flevoland', 'AwbShellProcess')).toEqual({
      allowed: true,
      municipality: 'flevoland',
      originTenantId: 'flevoland',
    });
    expect(resolveStartTenant(citizen('flevoland'), 'flevoland', 'AwbShellProcess')).toEqual({
      allowed: true,
      municipality: 'flevoland',
      originTenantId: 'flevoland',
    });
  });

  it('another tenant, citizen, cross-tenant service: stamps the deployed tenant and records the origin', () => {
    expect(resolveStartTenant(citizen('unive'), 'toeslagen', 'AwbZorgtoeslagProcess')).toEqual({
      allowed: true,
      municipality: 'toeslagen',
      originTenantId: 'unive',
    });
  });

  // #344: an Amsterdam Kapvergunning became a case at Provincie Flevoland.
  it('another tenant, citizen, own-tenant service: refused', () => {
    expect(resolveStartTenant(citizen('amsterdam'), 'flevoland', 'AwbShellProcess')).toEqual({
      allowed: false,
    });
  });

  it('another tenant, citizen, a process the registry does not know: refused', () => {
    expect(resolveStartTenant(citizen('amsterdam'), 'flevoland', 'HrOnboardingProcess')).toEqual({
      allowed: false,
    });
  });

  it('another tenant, staff: refused, even for a cross-tenant service', () => {
    expect(resolveStartTenant(staff('utrecht'), 'flevoland', 'AwbShellProcess')).toEqual({
      allowed: false,
    });
    expect(resolveStartTenant(staff('utrecht'), 'toeslagen', 'AwbZorgtoeslagProcess')).toEqual({
      allowed: false,
    });
  });

  it('no deployed tenant (untenanted, or the lookup failed): refused for a citizen', () => {
    expect(resolveStartTenant(citizen('unive'), null, 'AwbZorgtoeslagProcess')).toEqual({
      allowed: false,
    });
  });

  it('no deployed tenant: unchanged for staff, who stamp their own tenant (HR onboarding is untenanted)', () => {
    expect(resolveStartTenant(staff('utrecht'), null, 'HrOnboardingProcess')).toEqual({
      allowed: true,
      municipality: 'utrecht',
      originTenantId: 'utrecht',
    });
  });

  it('another tenant, no roles claim: treated as staff and refused', () => {
    expect(
      resolveStartTenant({ tenantId: 'utrecht' } as never, 'flevoland', 'AwbShellProcess')
    ).toEqual({
      allowed: false,
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/backend && npx jest src/auth/tenant-access.test.ts`
Expected: FAIL (the own-tenant, unknown-process and untenanted-citizen cases are allowed today).

- [ ] **Step 3: Implement** — in `tenant-access.ts`, add `import { isCrossTenantProcess } from './citizen-services';` and replace `resolveStartTenant` and its comment with:

```ts
/**
 * What a user start stamps (#218, #344). Under the caller's own tenant: the
 * caller's tenant. Under another tenant: refused, except a citizen starting a
 * cross-tenant citizen service (Zorgtoeslag), whose case goes to the deploying
 * tenant, with originTenantId recording the channel. With no deployed tenant
 * (an untenanted deployment, or a lookup that failed) a citizen is refused --
 * tenant is mandatory -- while staff keep stamping their own tenant, because
 * HR onboarding still runs untenanted.
 */
export function resolveStartTenant(
  user: Pick<AuthenticatedUser, 'tenantId' | 'roles'>,
  deployedTenant: string | null,
  processKey: string
): StartTenant {
  if (deployedTenant === user.tenantId) {
    return { allowed: true, municipality: user.tenantId, originTenantId: user.tenantId };
  }
  if (deployedTenant === null) {
    return isCitizen(user)
      ? { allowed: false }
      : { allowed: true, municipality: user.tenantId, originTenantId: user.tenantId };
  }
  if (isCitizen(user) && isCrossTenantProcess(processKey)) {
    return { allowed: true, municipality: deployedTenant, originTenantId: user.tenantId };
  }
  return { allowed: false };
}
```

- [ ] **Step 4: Pass the key from the start route** — in `process.routes.ts`, change

```ts
const startTenant = resolveStartTenant(req.user, deployedTenant);
```

to

```ts
const startTenant = resolveStartTenant(req.user, deployedTenant, key);
```

and update the comment above it to: `// Tenant rule (#218, #344): … a citizen's case goes to the deployment's tenant only for a cross-tenant citizen service.`

- [ ] **Step 5: A start-route test** — in `process.routes.test.ts`, in `describe('POST /:key/start', …)`, add:

```ts
it('403 TENANT_MISMATCH when a citizen starts an own-tenant service of another tenant (#344)', async () => {
  svc.resolveDeployedTenant.mockResolvedValue('heusden');
  const res = await auth(request(app).post('/v1/process/AwbShellProcess/start'))
    .set('x-test-roles', 'citizen')
    .send({ variables: {} });
  expect(res.status).toBe(403);
  expect(res.body.code).toBe('TENANT_MISMATCH');
  expect(svc.startProcess).not.toHaveBeenCalled();
});
```

(`resolveDeployedTenant` defaults to the caller's tenant in `beforeEach`; existing tests that start as a citizen under another tenant with an own-tenant key, if any, now expect 403 — update them to use `AwbZorgtoeslagProcess` where the test's point is the cross-tenant route.)

- [ ] **Step 6: Run the backend tests for this batch**

Run: `cd packages/backend && npx tsc --noEmit && npx jest src/auth src/routes/process.routes.test.ts src/services/operaton.service.test.ts && npx eslint src/auth src/routes/process.routes.ts src/services/operaton.service.ts`
Expected: PASS, clean.

- [ ] **Step 7: Batch 1 handoff and commit (after approval)**

Stage `packages/shared/src/citizen-services.ts packages/shared/src/index.ts packages/backend`. Hand the user `npm test --workspace=@ronl/backend`; on their green and approval, commit:

```
feat(backend): citizen services from a registry and the deployments, enforced at start (#344)
```

---

### Task 5: API client and the UI map

**Files:**

- Modify: `packages/frontend/src/services/api.ts` (inside `process: {`, after `history`), `packages/frontend/src/services/api.test.ts`
- Create: `packages/frontend/src/pages/citizen/citizenServiceUi.ts`, `packages/frontend/src/pages/citizen/citizenServices.test.ts`

**Interfaces:**

- Consumes: `CITIZEN_SERVICES`, `CitizenServiceId` from `@ronl/shared` (built in Task 1).
- Produces: `businessApi.process.available(): Promise<ApiResponse<{ services: CitizenServiceId[] }>>`; `CITIZEN_SERVICE_UI: Record<CitizenServiceId, { label: string; description: string; icon: string }>`.

- [ ] **Step 1: Failing tests** — `src/pages/citizen/citizenServices.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CITIZEN_SERVICES } from '@ronl/shared';
import { CITIZEN_SERVICE_UI } from './citizenServiceUi';

// The registry (@ronl/shared) decides which services exist and where; this
// map only gives them a face. They must name the same services: one without
// the other is a card that cannot render, or UI for nothing.
describe('citizen services', () => {
  it('the UI map and the registry cover the same service ids', () => {
    expect(Object.keys(CITIZEN_SERVICE_UI).sort()).toEqual(
      CITIZEN_SERVICES.map((s) => s.id).sort()
    );
  });

  it('keeps each service in its scope (#344)', () => {
    expect(Object.fromEntries(CITIZEN_SERVICES.map((s) => [s.id, s.scope]))).toEqual({
      zorgtoeslag: 'cross-tenant',
      vergunningen: 'own-tenant',
      subsidies: 'own-tenant',
      heusdenpas: 'own-tenant',
    });
  });
});
```

and in `src/services/api.test.ts`, next to `'history URL-encodes the applicantId query param'` (the file stubs HTTP with MSW's `server.use(http.get(…))`):

```ts
it('process.available fetches the available citizen services', async () => {
  server.use(
    http.get('*/process/available', () =>
      HttpResponse.json({ success: true, data: { services: ['zorgtoeslag'] } })
    )
  );

  await expect(businessApi.process.available()).resolves.toEqual({
    success: true,
    data: { services: ['zorgtoeslag'] },
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd packages/frontend && npx vitest run src/pages/citizen/citizenServices.test.ts src/services/api.test.ts`
Expected: FAIL (missing module, missing method).

- [ ] **Step 3: Implement** — `src/pages/citizen/citizenServiceUi.ts`:

```ts
import type { CitizenServiceId } from '@ronl/shared';

/**
 * How each citizen service looks as a card. Which services a citizen gets,
 * and where they land, is the registry's (CITIZEN_SERVICES in @ronl/shared)
 * and GET /v1/process/available's; this is only the face (#344).
 */
export const CITIZEN_SERVICE_UI: Record<
  CitizenServiceId,
  { label: string; description: string; icon: string }
> = {
  zorgtoeslag: {
    label: 'Zorgtoeslag',
    description: 'Bereken uw recht op zorgtoeslag op basis van inkomen en persoonlijke situatie.',
    icon: '💊',
  },
  vergunningen: {
    label: 'Vergunningen',
    description: 'Vraag vergunningen aan voor bouw, verbouw of evenementen.',
    icon: '📋',
  },
  subsidies: {
    label: 'Subsidies',
    description: 'Overzicht van beschikbare subsidies voor uw situatie.',
    icon: '💶',
  },
  heusdenpas: {
    label: 'Heusdenpas',
    description: 'Vraag de Heusdenpas en het Kindpakket aan bij een laag inkomen.',
    icon: '🎟️',
  },
};
```

and in `api.ts`, after the `history` method:

```ts
    /** The citizen services the signed-in citizen may start (#344). */
    available: async (): Promise<ApiResponse<{ services: CitizenServiceId[] }>> => {
      const response =
        await api.get<ApiResponse<{ services: CitizenServiceId[] }>>('/process/available');
      return response.data;
    },
```

with `import type { CitizenServiceId } from '@ronl/shared';` at the top of `api.ts`.

- [ ] **Step 4: Run to verify they pass**

Run: `cd packages/frontend && npx vitest run src/pages/citizen/citizenServices.test.ts src/services/api.test.ts`
Expected: PASS.

---

### Task 6: The dashboard from the endpoint

**Files:**

- Modify: `packages/frontend/src/pages/Dashboard.tsx`, `packages/frontend/src/pages/Dashboard.test.tsx`

**Interfaces:**

- Consumes: `businessApi.process.available`, `CITIZEN_SERVICE_UI` (Task 5).
- Produces: nothing for later tasks; `Dashboard` no longer reads `tenant.features`.

- [ ] **Step 1: Update the test setup** — in `Dashboard.test.tsx`:
  - add `const mockAvailable = vi.hoisted(() => vi.fn());` and extend the `businessApi` mock to `process: { history: mockProcessHistory, available: mockAvailable }`;
  - in the top-level `beforeEach`, add
    `mockAvailable.mockResolvedValue({ success: true, data: { services: ['zorgtoeslag', 'vergunningen', 'subsidies'] } });`
    so the existing Vergunningen / Subsidies / Zorgtoeslag tests keep their cards;
  - in `describe('Dashboard Heusdenpas')`, replace the `TENANT_HEUSDEN` features setup with
    `mockAvailable.mockResolvedValue({ success: true, data: { services: ['zorgtoeslag', 'heusdenpas'] } });`
    and in "does not offer it to a tenant without it" use
    `mockAvailable.mockResolvedValue({ success: true, data: { services: ['zorgtoeslag'] } });`.

- [ ] **Step 2: Replace the feature-based tests** — replace `it('lists the services enabled for the tenant', …)` and both consent-tab tests (`'does not offer the consent tab…'`, `'adds the consent tab…'`) with:

```ts
  it('shows exactly the services the backend makes available, in its order', async () => {
    mockAvailable.mockResolvedValue({ success: true, data: { services: ['zorgtoeslag', 'heusdenpas'] } });
    render(<Dashboard />);

    expect(await screen.findByText('Zorgtoeslag')).toBeInTheDocument();
    expect(screen.getByText('Heusdenpas')).toBeInTheDocument();
    expect(screen.queryByText('Vergunningen')).not.toBeInTheDocument();
    expect(screen.queryByText('Subsidies')).not.toBeInTheDocument();
    expect(screen.queryByText('Meldingen')).not.toBeInTheDocument();
  });

  it('says so when no service is available', async () => {
    mockAvailable.mockResolvedValue({ success: true, data: { services: [] } });
    render(<Dashboard />);

    expect(await screen.findByText('Geen diensten beschikbaar voor uw gemeente.')).toBeInTheDocument();
  });

  it.each([
    ['refused', () => mockAvailable.mockResolvedValue({ success: false, error: { code: 'SERVICES_UNAVAILABLE' } })],
    ['unreachable', () => mockAvailable.mockRejectedValue(new Error('network'))],
  ])('shows an error with a retry when the services cannot be loaded (%s), never every card', async (_label, fail) => {
    fail();
    const user = userEvent.setup();
    render(<Dashboard />);

    expect(await screen.findByText('De diensten konden niet worden geladen.')).toBeInTheDocument();
    expect(screen.queryByText('Zorgtoeslag')).not.toBeInTheDocument();

    mockAvailable.mockResolvedValue({ success: true, data: { services: ['zorgtoeslag'] } });
    await user.click(screen.getByRole('button', { name: 'Opnieuw proberen' }));
    expect(await screen.findByText('Zorgtoeslag')).toBeInTheDocument();
  });

  it('offers no "Mijn toestemming" tab (DVTP is retired)', async () => {
    render(<Dashboard />);
    await screen.findByText('Zorgtoeslag');
    expect(screen.queryByRole('button', { name: 'Mijn toestemming' })).toBeNull();
  });
```

Also delete the `vi.mock` lines for `DvtpStartSection` and `DvtpTakenSection`, and the assertion `expect(screen.queryByText('Deze dienst is in ontwikkeling.'))…` (around line 602) together with its test if that test exists only for the placeholder.

- [ ] **Step 3: Run to verify they fail**

Run: `cd packages/frontend && npx vitest run src/pages/Dashboard.test.tsx`
Expected: FAIL (cards still come from `features`; no error state).

- [ ] **Step 4: Implement in `Dashboard.tsx`**
  1. Remove the imports of `DvtpStartSection` and `DvtpTakenSection`; remove `type DvtpSubView`; change `type Tab` to `'diensten' | 'aanvragen' | 'tijdlijn'`; remove the `dvtpSubView` state.
  2. Remove `SERVICE_LABELS`; import `CITIZEN_SERVICE_UI` from `./citizen/citizenServiceUi` and `type CitizenServiceId` from `@ronl/shared`.
  3. Add state and loading, next to the applications state:

```tsx
const [services, setServices] = useState<CitizenServiceId[] | null>(null);
const [servicesError, setServicesError] = useState<string | null>(null);
const [servicesAttempt, setServicesAttempt] = useState(0);

// The cards (#344): what the backend says this citizen may start, derived
// from where each service's process is deployed. On failure an error and a
// retry, never every card.
useEffect(() => {
  if (!user) return;
  let live = true;
  setServicesError(null);
  businessApi.process
    .available()
    .then((res) => {
      if (!live) return;
      if (res.success && res.data) setServices(res.data.services);
      else setServicesError('De diensten konden niet worden geladen.');
    })
    .catch(() => {
      if (live) setServicesError('De diensten konden niet worden geladen.');
    });
  return () => {
    live = false;
  };
}, [user, servicesAttempt]);
```

4. Delete `enabledServices` and `showDvtp`; the tabs become the three fixed ones.
5. Replace the services grid block (`{enabledServices.length === 0 ? (…) : (…)}`) with:

```tsx
{
  servicesError ? (
    <div>
      <p className="text-gray-500 mb-3">{servicesError}</p>
      <button
        type="button"
        onClick={() => {
          setServices(null);
          setServicesAttempt((n) => n + 1);
        }}
        className="text-sm font-medium underline"
        style={{ color: 'var(--color-primary)' }}
      >
        Opnieuw proberen
      </button>
    </div>
  ) : services === null ? (
    <p className="text-gray-500">Diensten laden…</p>
  ) : services.length === 0 ? (
    <p className="text-gray-500">Geen diensten beschikbaar voor uw gemeente.</p>
  ) : (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {services.map((key) => {
        const svc = CITIZEN_SERVICE_UI[key];
        return (
          <button
            key={key}
            onClick={() => setActiveService(key)}
            className="text-left bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow border border-transparent hover:border-gray-200"
          >
            <div className="text-3xl mb-3">{svc.icon}</div>
            <h3 className="font-semibold text-gray-800 mb-1">{svc.label}</h3>
            <p className="text-sm text-gray-500">{svc.description}</p>
            <div className="mt-4 text-sm font-medium" style={{ color: 'var(--color-primary)' }}>
              Aanvragen →
            </div>
          </button>
        );
      })}
    </div>
  );
}
```

6. Delete the `{/* ── Other services (stub) ── */}` block (the "Deze dienst is in ontwikkeling." panel) and the `{/* ── Mijn toestemming (DvTP) ── */}` block.

- [ ] **Step 5: Run to verify they pass**

Run: `cd packages/frontend && npx tsc --noEmit && npx vitest run src/pages/Dashboard.test.tsx src/pages/citizen`
Expected: PASS. (`tsc` may still report `features` users elsewhere; those go in Task 8 — at this point only `Dashboard.tsx` must stop using it.)

---

### Task 7: Retire DVTP on the caseworker side

**Files:**

- Delete: `packages/frontend/src/components/CaseworkerDashboard/DvtpStartSection.tsx`, `DvtpStartSection.test.tsx`, `DvtpTakenSection.tsx`, `DvtpTakenSection.test.tsx`
- Modify: `packages/frontend/src/pages/caseworker-v2/modes.config.ts` (the `label: 'DVTP'` group ~lines 96-116 and `'dvtp-start', 'dvtp-taken'` in `SHELL_GLOBAL_SECTION_IDS` ~line 323), `packages/frontend/src/components/CaseworkerDashboardV2/SectionRouter.tsx` (imports ~43-44, the `// ── DVTP` cases ~148-152, the `onNavigate` prop ~54-64), `packages/frontend/src/components/CaseworkerDashboardV2/SectionRouter.test.tsx`, `packages/frontend/src/pages/CaseworkerDashboardV2.tsx` (`onNavigate={setActiveSection}` ~line 354)

**Interfaces:**

- Produces: `SectionRouter` without the `onNavigate` prop (DVTP was its only user). The org-type gate (`requiredOrgTypes`) stays: it is generic and `modes.config.test.ts` covers it with synthetic items.

- [ ] **Step 1: Update `SectionRouter.test.tsx` first**
  - delete the two `vi.mock` blocks for `DvtpStartSection` / `DvtpTakenSection` and `mockDvtpStartSection`;
  - delete `['dvtp-taken', 'dvtp-taken'],` from the section table and the test `'dvtp-start wires onNavigateToTasks…'`;
  - add `it('no longer routes DVTP sections (retired)', …)` asserting that `sectionId="dvtp-start"` renders the fallback (the section id itself, as the table's comment says) and not a DVTP component;
  - the two org-type gate tests used `dvtp-start`, the only org-gated item. Give the test file a synthetic org-gated item by mocking `modes.config` partially, at the top of the file:

```tsx
vi.mock('../../pages/caseworker-v2/modes.config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../pages/caseworker-v2/modes.config')>();
  // DVTP was the only rail item gated by organisation type; this stands in for
  // one so the defence-in-depth gate stays covered.
  return {
    ...actual,
    MODES: [
      ...actual.MODES,
      {
        id: 'test-mode',
        label: 'Test',
        defaultSectionId: 'org-gated-test',
        groups: [
          {
            items: [
              { id: 'org-gated-test', label: 'Org-gated', requiredOrgTypes: ['municipality'] },
            ],
          },
        ],
      },
    ],
  };
});
```

    and change both gate tests from `sectionId="dvtp-start"` to `sectionId="org-gated-test"`; the "allows through" test asserts `screen.getByText('org-gated-test')` (the fallback prints the id) and that `mockNoAccessPanel` was not called. If `ModeId` is a string union that rejects `'test-mode'`, cast the entry `as never`.

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/frontend && npx vitest run src/components/CaseworkerDashboardV2/SectionRouter.test.tsx`
Expected: FAIL ("no longer routes DVTP sections" — DVTP is still routed).

- [ ] **Step 3: Remove DVTP**
  - `modes.config.ts`: delete the whole `{ label: 'DVTP', items: [ … ] }` group with its comment, and `'dvtp-start',` / `'dvtp-taken',` from `SHELL_GLOBAL_SECTION_IDS`;
  - `SectionRouter.tsx`: delete the two imports, the `// ── DVTP` block, the `onNavigate` prop from the props interface and the destructuring;
  - `CaseworkerDashboardV2.tsx`: delete `onNavigate={setActiveSection}`;
  - `git rm packages/frontend/src/components/CaseworkerDashboard/DvtpStartSection.tsx packages/frontend/src/components/CaseworkerDashboard/DvtpStartSection.test.tsx packages/frontend/src/components/CaseworkerDashboard/DvtpTakenSection.tsx packages/frontend/src/components/CaseworkerDashboard/DvtpTakenSection.test.tsx`.

- [ ] **Step 4: Run to verify it passes, and look for leftovers**

Run: `cd packages/frontend && npx tsc --noEmit && npx vitest run src/components/CaseworkerDashboardV2 src/pages/caseworker-v2 src/pages/CaseworkerDashboardV2.test.tsx && grep -rn -i "dvtp" src --include=*.ts --include=*.tsx | grep -v changelog-data | grep -v ProcesBibliotheek.test`
Expected: tests PASS; the grep prints only `features.dvtp` users that Task 8 removes (`services/tenant.ts`, test fixtures), nothing else.

- [ ] **Step 5: Batch 2 handoff and commit (after approval)**

Stage `packages/frontend` (the deletions included). Hand the user `npm test --workspace=@ronl/frontend` and a browser check (citizen dashboard: cards from the endpoint, no "Mijn toestemming"; caseworker V2: no DVTP rail group). Remind them `@ronl/shared` was rebuilt, so the dev server may need its Vite prebundle cleared. On their green and approval, commit:

```
feat(frontend): citizen dashboard cards from the available services; DVTP retired (#344)
```

---

### Task 8: Retire `features`

**Files:**

- Modify: `packages/frontend/public/tenants.json` (every tenant), `packages/frontend/src/services/tenant.ts` (`TenantFeatures`, `TenantConfig.features`), `packages/shared/src/types/tenant.types.ts` (`TenantFeatures`, `features: TenantFeatures`), test fixtures that set `features` (`src/services/tenant.test.ts:28`, `src/components/LoginChoice/SingleBoardLanding.test.tsx:32`, `src/pages/Dashboard.test.tsx:28,564`, `src/pages/LoginChoice.test.tsx:55`)
- Delete: `packages/frontend/src/services/tenant-features.test.ts`

- [ ] **Step 1: Add the guard that features are gone** — in `src/pages/citizen/citizenServices.test.ts`, add:

```ts
import { readFileSync } from 'fs';
import { join } from 'path';

it('tenants.json no longer lists per-tenant services: the deployments decide (#344)', () => {
  const tenants = JSON.parse(readFileSync(join(__dirname, '../../../public/tenants.json'), 'utf8'))
    .tenants as Record<string, Record<string, unknown>>;
  for (const [id, tenant] of Object.entries(tenants)) {
    expect({ id, features: tenant.features }).toEqual({ id, features: undefined });
  }
});
```

(Place the imports at the top of the file with the others.)

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/frontend && npx vitest run src/pages/citizen/citizenServices.test.ts`
Expected: FAIL (every tenant still has `features`).

- [ ] **Step 3: Remove `features`**

```bash
cd packages/frontend && node -e "
const fs=require('fs');const p='public/tenants.json';const j=JSON.parse(fs.readFileSync(p,'utf8'));
for(const t of Object.values(j.tenants)) delete t.features;
fs.writeFileSync(p,JSON.stringify(j,null,2)+'\n');" && npx prettier --write public/tenants.json
```

Then delete `interface TenantFeatures` and `features: TenantFeatures;` from `src/services/tenant.ts` and from `packages/shared/src/types/tenant.types.ts`; delete `features: …` from the test fixtures listed above; `git rm packages/frontend/src/services/tenant-features.test.ts`; rebuild shared: `npm run build --workspace=@ronl/shared && node scripts/check-shared-declarations.mjs`.

- [ ] **Step 4: Run to verify it passes and nothing still reads `features`**

Run: `cd packages/frontend && npx tsc --noEmit && npx vitest run src/pages src/services src/components/LoginChoice && grep -rn "\.features\b\|TenantFeatures" src ../shared/src ../backend/src --include=*.ts --include=*.tsx | grep -v changelog-data`
Expected: PASS; the grep prints nothing.

---

### Task 9: e2e — which cards a citizen sees

**Files:**

- Create: `packages/frontend/e2e/citizen-services.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
import { expect, test } from '@playwright/test';
import { loginAsMedewerker } from './helpers/auth';

// #344: the cards follow where each service's process is deployed. Amsterdam
// deploys none of its own, so its citizens get only the cross-tenant
// Zorgtoeslag (handled by Dienst Toeslagen); Heusden deploys the Heusdenpas.
// Neither is offered Flevoland's Kapvergunning or Thuisbatterij.
for (const [username, expected] of [
  ['test-citizen-amsterdam', ['Zorgtoeslag']],
  ['test-citizen-heusden', ['Zorgtoeslag', 'Heusdenpas']],
] as const) {
  test(`${username} sees exactly ${expected.join(' and ')}`, async ({ page }) => {
    await loginAsMedewerker(page, username, 'test123');
    await expect(page).toHaveURL(/\/dashboard\/citizen$/);

    const cards = page.getByRole('button').filter({ hasText: 'Aanvragen →' });
    await expect(cards).toHaveCount(expected.length, { timeout: 15_000 });
    for (const label of expected) {
      await expect(cards.filter({ hasText: label })).toHaveCount(1);
    }
    await expect(page.getByRole('button', { name: 'Mijn toestemming' })).toHaveCount(0);
  });
}
```

- [ ] **Step 2: Lint and format**

Run: `cd packages/frontend && npx eslint e2e/citizen-services.spec.ts && cd ../.. && npm run check-format`
Expected: clean.

- [ ] **Step 3: Batch 3 handoff and commit (after approval)**

Stage `packages/frontend packages/shared`. Hand the user `npm test --workspace=@ronl/frontend` and the e2e suite against localhost (all journeys, including Kapvergunning and Thuisbatterij as `test-citizen-flevoland`, Zorgtoeslag as `test-citizen-unive`, Heusdenpas, and the new spec). On their green and approval, commit:

```
refactor(frontend): retire tenants.json features; the deployments decide which services a tenant offers (#344)
```

---

### Task 10: PR, follow-up issues, engine cleanup

- [ ] **Step 1: Push and open the PR** (with the user's go-ahead), against `acc`, describing the three commits, the behaviour change (every citizen sees Zorgtoeslag, by design; Meldingen and DVTP gone; a citizen's own-tenant start under another tenant is refused) and a test plan with the post-deploy engine cleanup as an open item. No Claude attribution.

- [ ] **Step 2: File the two follow-up issues** (`gh issue create --label enhancement`):
  - "Citizen services: a fully data-driven catalogue from BPMN metadata", referring to #344 and this spec;
  - "Untenanted processes on the shared ACC/PROD engine: HR onboarding and the rest", listing `HrOnboardingProcess` (RBA, untenanted only, 2 running instances on 2026-10-09; staff starts still accept untenanted for it) and the keys no RBA or LDE code references, to resolve with their owners.

- [ ] **Step 3: After merge and ACC deploy — engine cleanup** (`https://operaton.open-regels.nl/engine-rest`, shared by ACC and PROD). List, read-only:

```bash
O=https://operaton.open-regels.nl/engine-rest
for k in ThuisbatterijSubsidieAanvraagProcess ThuisbatterijSubsidieDecisionSubProcess ManagementCapacityClaimProcess DvtpToestemmingGevenProcess; do
  curl -s "$O/process-definition?key=$k&withoutTenantId=true" \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const d of JSON.parse(s))console.log(d.id, d.key, "v"+d.version, "tenant="+d.tenantId)})'
done
```

Show the user the list (every line must say `tenant=null`). Only after their yes, delete each definition id (process definition, never the deployment — the deployment can hold untenanted decisions the tenanted processes still call):

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X DELETE "$O/process-definition/<id>?cascade=true&skipCustomListeners=true&skipIoMappings=true"
```

Verify: `GET $O/process-definition?keysIn=…&withoutTenantId=true` returns `[]`; the tenanted `flevoland` versions of the first three keys still exist; `GET $O/decision-definition?withoutTenantId=true&latestVersion=true` still lists the Thuisbatterij decisions (`RechtOpSubsidieThuisbatterij`, `BehaalbareHoogteSubsidie`). Then the user runs the e2e suite against ACC.
