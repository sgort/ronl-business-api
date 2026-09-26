# Tenant isolation: one source of truth — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `municipality` process variable the only tenant label any access check reads, stamp the deployed tenant into it at start, and give every tenant refusal one response — closing #218 and #219.

**Architecture:** A new `auth/tenant-access.ts` module owns every tenant decision (who counts as a citizen, whether a label admits a caller, what a start stamps, how a refusal answers). The start route applies it before calling Operaton; `startProcess` defaults an absent `municipality` to the deployed tenant so the M2M start agrees too. The five task-detail checks move off Operaton's `task.tenantId` onto the variable, and all other detail checks swap their inline comparison for the helper, failing closed on a missing label.

**Tech Stack:** TypeScript, Express, Jest + supertest (backend workspace `packages/backend`), Operaton REST.

**Spec:** `docs/superpowers/specs/2026-09-26-tenant-single-source-design.md`

## Global Constraints

- Tenant refusal response, everywhere: HTTP `403`, body `{ success: false, error: { code: 'TENANT_MISMATCH', message: 'Access denied: organisation mismatch' } }`.
- Citizen = token roles include `'citizen'`. Everyone else is staff. `roles` may be absent at runtime (a token without `realm_access`); treat absent as `[]`.
- A label admits a caller only if it is a non-empty string exactly equal to `req.user.tenantId` (case-sensitive).
- `originTenantId` is always the caller's own tenant on a user start.
- `FORBIDDEN` stays only for non-tenant refusals (e.g. `/process/history` citizen-requests-other-applicant).
- The applicant exception (`applicantId === req.user.userId`) exists only on `/historic-variables` and `/decision-document`.
- List endpoints are not changed.
- Per-file branch coverage floor: 80%.
- **Git rules for whoever executes:** ask the user before every `git commit`; never `--no-verify`, `HUSKY=0` or edit a hook; never start/stop the dev servers or the local stack. The user runs the full suite (`npm test` from the repo root) per batch and reports green before a commit.
- Run focused tests from `packages/backend`: `npx jest <path> --coverage=false`. This workspace's runner is Jest (not Vitest).

## Review Focus

1. **A token without a `roles` claim starts a cross-tenant process** → treated as staff, refused `TENANT_MISMATCH`, no instance created. (Task 3)
2. **A request body that supplies its own `municipality`** → ignored; the stamped value comes from `resolveStartTenant` only. (Task 3)
3. **A task whose process-instance variables carry no `municipality`** (e.g. a subprocess without `variables="all"`) → `403 TENANT_MISMATCH`, not a 500 and not a 200. (Task 4)
4. **The deployed-tenant lookup fails (`null`)** → start proceeds under the caller's tenant with `municipality` = caller tenant, exactly as today's fallback. (Tasks 2 and 3)
5. **A label with different case or a non-string value** (`'Flevoland'`, a number, `{}`) → refused. (Task 1)

---

## File map

| file                                                                        | change                                                                                                                                |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/superpowers/specs/2026-09-26-tenant-single-source-design.md`          | amend: M2M start path (Task 1)                                                                                                        |
| `packages/backend/src/auth/tenant-access.ts`                                | **create** — `isCitizen`, `tenantAllows`, `denyTenant`, `resolveStartTenant`                                                          |
| `packages/backend/src/auth/tenant-access.test.ts`                           | **create**                                                                                                                            |
| `packages/backend/src/services/operaton.service.ts`                         | `resolveDeployedTenant` public; `startProcess` takes optional pre-resolved tenant; absent `municipality` defaults to the scope tenant |
| `packages/backend/src/services/operaton.service.test.ts`                    | update/add `resolveDeployedTenant` + `startProcess` tests                                                                             |
| `packages/backend/src/routes/process.routes.ts`                             | start rule; AWB override removed; six detail checks via helper                                                                        |
| `packages/backend/src/routes/process.routes.test.ts`                        | start + detail tests                                                                                                                  |
| `packages/backend/src/routes/task.routes.ts`                                | five detail checks read the variable                                                                                                  |
| `packages/backend/src/routes/task.routes.test.ts`                           | detail tests                                                                                                                          |
| `packages/backend/src/routes/capacity.routes.ts`, `rip.routes.ts`           | documents check via helper                                                                                                            |
| `packages/backend/src/routes/capacity.routes.test.ts`, `rip.routes.test.ts` | inverted no-label tests                                                                                                               |
| `packages/frontend/e2e/zorgtoeslag-journey.spec.ts`                         | comment only                                                                                                                          |

---

### Task 1: `tenant-access` module (and spec amendment)

**Files:**

- Modify: `docs/superpowers/specs/2026-09-26-tenant-single-source-design.md`
- Create: `packages/backend/src/auth/tenant-access.ts`
- Test: `packages/backend/src/auth/tenant-access.test.ts`

**Interfaces:**

- Consumes: `AuthenticatedUser` from `@ronl/shared` (`tenantId: string; roles: string[]`), `createLogger` from `@utils/logger`.
- Produces:
  - `TENANT_MISMATCH_MESSAGE: 'Access denied: organisation mismatch'`
  - `isCitizen(user: Pick<AuthenticatedUser, 'roles'>): boolean`
  - `tenantAllows(user: Pick<AuthenticatedUser, 'tenantId'>, municipality: unknown): boolean`
  - `denyTenant(req: Request, res: Response, context?: Record<string, unknown>): Response`
  - `type StartTenant = { allowed: true; municipality: string; originTenantId: string } | { allowed: false }`
  - `resolveStartTenant(user: Pick<AuthenticatedUser, 'tenantId' | 'roles'>, deployedTenant: string | null): StartTenant`

- [ ] **Step 1: Amend the spec for the M2M start path**

In the spec, under `### 2. Start path — POST /process/:key/start`, replace the paragraph beginning "The `municipality` fallback inside `startProcess`" with:

```markdown
The `municipality` fallback inside `startProcess` changes from the caller's
tenant to the **scope tenant** (deployed tenant, or the caller's tenant for an
untenanted deployment). The user route always sets `municipality` first, so this
only decides the M2M start (`POST /v1/m2m/process/:key/start`), which calls
`startProcess` with tenant `'m2m'` and no user: without this, an M2M-started
instance would carry `municipality = 'm2m'` while its tasks carry the deployed
tenant — the #218 split again. An M2M client that supplies `municipality`
explicitly is trusted, as today.
```

- [ ] **Step 2: Write the failing tests**

Create `packages/backend/src/auth/tenant-access.test.ts`:

```ts
/**
 * Unit tests for tenant-access: the one module that decides tenant questions
 * for process and task access (#218, #219).
 */

const mockWarn = jest.fn();
jest.mock('@utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: mockWarn, error: jest.fn(), debug: jest.fn() }),
}));

import express from 'express';
import request from 'supertest';
import {
  TENANT_MISMATCH_MESSAGE,
  denyTenant,
  isCitizen,
  resolveStartTenant,
  tenantAllows,
} from './tenant-access';

const citizen = (tenantId: string) => ({ tenantId, roles: ['citizen'] });
const staff = (tenantId: string, roles = ['caseworker']) => ({ tenantId, roles });

beforeEach(() => jest.clearAllMocks());

describe('isCitizen', () => {
  it('is true for a token carrying the citizen role', () => {
    expect(isCitizen({ roles: ['citizen'] })).toBe(true);
  });

  it('is false for staff roles, including ones that are not caseworker', () => {
    expect(isCitizen({ roles: ['caseworker'] })).toBe(false);
    expect(isCitizen({ roles: ['public-affairs', 'pa-author'] })).toBe(false);
    expect(isCitizen({ roles: ['woo-coordinatie'] })).toBe(false);
  });

  it('is false when the token has no roles claim at all', () => {
    expect(isCitizen({} as { roles: string[] })).toBe(false);
  });
});

describe('tenantAllows', () => {
  const user = { tenantId: 'flevoland' };

  it('admits an exactly equal label', () => {
    expect(tenantAllows(user, 'flevoland')).toBe(true);
  });

  it('refuses a different tenant', () => {
    expect(tenantAllows(user, 'utrecht')).toBe(false);
  });

  it('refuses a missing or empty label', () => {
    expect(tenantAllows(user, undefined)).toBe(false);
    expect(tenantAllows(user, null)).toBe(false);
    expect(tenantAllows(user, '')).toBe(false);
  });

  it('refuses a label that differs only in case', () => {
    expect(tenantAllows(user, 'Flevoland')).toBe(false);
  });

  it('refuses a non-string label', () => {
    expect(tenantAllows(user, 42)).toBe(false);
    expect(tenantAllows(user, { value: 'flevoland' })).toBe(false);
  });

  it('refuses when the caller has no tenant, even against an empty label', () => {
    expect(tenantAllows({ tenantId: '' }, '')).toBe(false);
  });
});

describe('resolveStartTenant', () => {
  it('untenanted deployment: stamps the caller tenant, for anyone', () => {
    expect(resolveStartTenant(staff('utrecht'), null)).toEqual({
      allowed: true,
      municipality: 'utrecht',
      originTenantId: 'utrecht',
    });
    expect(resolveStartTenant(citizen('unive'), null)).toEqual({
      allowed: true,
      municipality: 'unive',
      originTenantId: 'unive',
    });
  });

  it('same tenant: stamps the caller tenant, for anyone', () => {
    expect(resolveStartTenant(staff('flevoland'), 'flevoland')).toEqual({
      allowed: true,
      municipality: 'flevoland',
      originTenantId: 'flevoland',
    });
    expect(resolveStartTenant(citizen('flevoland'), 'flevoland')).toEqual({
      allowed: true,
      municipality: 'flevoland',
      originTenantId: 'flevoland',
    });
  });

  it('different tenant, citizen: stamps the deployed tenant and records the origin', () => {
    expect(resolveStartTenant(citizen('unive'), 'toeslagen')).toEqual({
      allowed: true,
      municipality: 'toeslagen',
      originTenantId: 'unive',
    });
  });

  it('different tenant, staff: refused', () => {
    expect(resolveStartTenant(staff('utrecht'), 'flevoland')).toEqual({ allowed: false });
  });

  it('different tenant, no roles claim: treated as staff and refused', () => {
    expect(resolveStartTenant({ tenantId: 'utrecht' } as never, 'flevoland')).toEqual({
      allowed: false,
    });
  });
});

describe('denyTenant', () => {
  const app = express();
  app.get('/probe', (req, res) => {
    req.user = { userId: 'u-1', tenantId: 'utrecht' } as never;
    denyTenant(req, res, { processInstanceId: 'pi-1' });
  });
  app.get('/probe-no-context', (req, res) => {
    denyTenant(req, res);
  });

  it('answers 403 TENANT_MISMATCH with the one message', async () => {
    const res = await request(app).get('/probe');
    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      success: false,
      error: { code: 'TENANT_MISMATCH', message: TENANT_MISMATCH_MESSAGE },
    });
    expect(TENANT_MISMATCH_MESSAGE).toBe('Access denied: organisation mismatch');
  });

  it('logs the caller and the context it was given', async () => {
    await request(app).get('/probe');
    expect(mockWarn).toHaveBeenCalledWith(
      'Tenant mismatch',
      expect.objectContaining({
        userId: 'u-1',
        userTenant: 'utrecht',
        path: '/probe',
        processInstanceId: 'pi-1',
      })
    );
  });

  it('answers the same way without a context or a user', async () => {
    const res = await request(app).get('/probe-no-context');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('TENANT_MISMATCH');
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run (from `packages/backend`): `npx jest src/auth/tenant-access.test.ts --coverage=false`
Expected: FAIL — `Cannot find module './tenant-access'`.

- [ ] **Step 4: Implement**

Create `packages/backend/src/auth/tenant-access.ts`:

```ts
import type { Request, Response } from 'express';
import type { AuthenticatedUser } from '@ronl/shared';
import { createLogger } from '@utils/logger';

const logger = createLogger('tenant-access');

/**
 * Tenant decisions for process and task access (#218, #219).
 *
 * The `municipality` process variable is the only tenant label any access
 * check reads. Operaton's own tenantId (the deployment's) is kept equal to it
 * by resolveStartTenant at start, and is never compared against directly.
 */

export const TENANT_MISMATCH_MESSAGE = 'Access denied: organisation mismatch';

/**
 * A citizen is a token carrying the `citizen` realm role. Everyone else is
 * staff -- including roles that are not `caseworker` (public-affairs,
 * woo-coordinatie) and a token with no roles claim at all, so an unexpected
 * role never gains a citizen's cross-tenant start.
 */
export function isCitizen(user: Pick<AuthenticatedUser, 'roles'>): boolean {
  return (user.roles ?? []).includes('citizen');
}

/**
 * True only for a non-empty string label exactly equal to the caller's tenant.
 * A missing label refuses: an instance started outside this backend carries
 * none, and must not be readable by every tenant that knows its id.
 */
export function tenantAllows(
  user: Pick<AuthenticatedUser, 'tenantId'>,
  municipality: unknown
): boolean {
  return typeof municipality === 'string' && municipality !== '' && municipality === user.tenantId;
}

/** Log a tenant refusal and answer 403 TENANT_MISMATCH. */
export function denyTenant(
  req: Request,
  res: Response,
  context: Record<string, unknown> = {}
): Response {
  logger.warn('Tenant mismatch', {
    userId: req.user?.userId,
    userTenant: req.user?.tenantId,
    path: req.originalUrl,
    ...context,
  });
  return res.status(403).json({
    success: false,
    error: { code: 'TENANT_MISMATCH', message: TENANT_MISMATCH_MESSAGE },
  });
}

export type StartTenant =
  { allowed: true; municipality: string; originTenantId: string } | { allowed: false };

/**
 * What a user start stamps. An untenanted deployment, or one under the
 * caller's own tenant, takes the caller's tenant. Under another tenant, a
 * citizen's case goes to the processing tenant (the rule AwbZorgtoeslagProcess
 * used to hardcode); staff are refused. originTenantId always records the
 * channel the case came in through.
 */
export function resolveStartTenant(
  user: Pick<AuthenticatedUser, 'tenantId' | 'roles'>,
  deployedTenant: string | null
): StartTenant {
  if (deployedTenant === null || deployedTenant === user.tenantId) {
    return { allowed: true, municipality: user.tenantId, originTenantId: user.tenantId };
  }
  if (isCitizen(user)) {
    return { allowed: true, municipality: deployedTenant, originTenantId: user.tenantId };
  }
  return { allowed: false };
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx jest src/auth/tenant-access.test.ts --coverage=false`
Expected: PASS, all tests.

- [ ] **Step 6: Stage and ask**

```bash
npx prettier --write src/auth/tenant-access.ts src/auth/tenant-access.test.ts ../../docs/superpowers/specs/2026-09-26-tenant-single-source-design.md
git add src/auth/tenant-access.ts src/auth/tenant-access.test.ts ../../docs/superpowers/specs/2026-09-26-tenant-single-source-design.md
```

Report what is staged and **ask the user before committing**. Proposed message: `feat(auth): add tenant-access, the one place tenant decisions are made (#218, #219)`.

---

### Task 2: `startProcess` scopes and labels by the deployed tenant

**Files:**

- Modify: `packages/backend/src/services/operaton.service.ts` (`resolveDeployedTenant` ~line 208, `startProcess` ~lines 228-261)
- Test: `packages/backend/src/services/operaton.service.test.ts` (`describe('resolveDeployedTenant')` ~line 91, `describe('startProcess')` ~line 122)

**Interfaces:**

- Produces:
  - `operatonService.resolveDeployedTenant(processKey: string): Promise<string | null>` — now **public**, behaviour unchanged.
  - `operatonService.startProcess(processKey: string, request: ProcessStartRequest, tenantId: string, deployedTenant?: string | null): Promise<ProcessInstance>` — when `deployedTenant` is passed (including `null`), it is used and no lookup is made; when omitted, it is resolved as today. An absent `request.variables.municipality` defaults to `deployedTenant ?? tenantId`.

- [ ] **Step 1: Write the failing tests**

In `operaton.service.test.ts`, remove the four `// @ts-expect-error -- private method…` comment lines inside `describe('resolveDeployedTenant')` (the method becomes public; a stale `@ts-expect-error` fails type-check).

Append inside `describe('startProcess', …)`:

```ts
it('uses a pre-resolved deployed tenant without looking it up again', async () => {
  mockClient.post.mockResolvedValue({ data: { id: 'pi-4' } });

  await svc.startProcess('AwbShellProcess', req(), 'unive', 'flevoland');

  expect(mockClient.get).not.toHaveBeenCalled();
  expect(mockClient.post).toHaveBeenCalledWith(
    '/process-definition/key/AwbShellProcess/tenant-id/flevoland/start',
    expect.anything()
  );
});

it('treats a pre-resolved null as untenanted and scopes to the caller tenant', async () => {
  mockClient.post.mockResolvedValue({ data: { id: 'pi-5' } });
  const request = req();

  await svc.startProcess('P', request, 'utrecht', null);

  expect(mockClient.get).not.toHaveBeenCalled();
  expect(mockClient.post).toHaveBeenCalledWith(
    '/process-definition/key/P/tenant-id/utrecht/start',
    expect.anything()
  );
  expect(request.variables.municipality).toEqual({ value: 'utrecht', type: 'String' });
});

it('labels an unlabelled start with the deployed tenant, not the caller tenant (M2M)', async () => {
  mockClient.get.mockResolvedValue({ data: [{ tenantId: 'flevoland' }] });
  mockClient.post.mockResolvedValue({ data: { id: 'pi-6' } });
  const request = req();

  await svc.startProcess('AwbShellProcess', request, 'm2m');

  expect(request.variables.municipality).toEqual({ value: 'flevoland', type: 'String' });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest src/services/operaton.service.test.ts -t "startProcess|resolveDeployedTenant" --coverage=false`
Expected: FAIL — the pre-resolved tests see a `get` call; the M2M test sees `municipality = 'm2m'`. (Type-check may also flag the 4-argument call; that is expected until Step 3.)

- [ ] **Step 3: Implement**

In `operaton.service.ts`:

1. Change `private async resolveDeployedTenant(` to `async resolveDeployedTenant(`. In its doc comment, replace the last sentence ("Returns null if … best guess.") with:

```ts
   * tenant-scoped row wins. Returns null if the key isn't deployed, is
   * deployed untenanted, or the lookup itself fails — callers should fall
   * back to their own best guess. Public so the start route can decide the
   * tenant rule (tenant-access.resolveStartTenant) before starting.
```

2. Replace the `startProcess` signature and body up to (not including) `let response;` with:

```ts
  async startProcess(
    processKey: string,
    request: ProcessStartRequest,
    tenantId: string,
    deployedTenant?: string | null
  ): Promise<ProcessInstance> {
    try {
      logger.info('Starting process', {
        processKey,
        tenantId,
        businessKey: request.businessKey,
      });

      // Try the tenant-scoped start first, scoped to the process's own
      // *actual* deployed tenant (not necessarily the caller's own tenant --
      // e.g. AwbZorgtoeslagProcess is always handled under toeslagen).
      // Deployments made via LDE's mandatory-organization deploy flow carry
      // Operaton's own native tenant-id and are invisible to the untenanted
      // /start shorthand below — Operaton only resolves
      // /process-definition/key/{key}/start against definitions deployed
      // with *no* tenant-id. Not every process is tenant-scoped yet, so
      // fall back to the untenanted lookup when the scoped one reports no
      // matching definition. The user start route resolves the deployed
      // tenant itself (to apply the tenant rule) and passes it in.
      const resolvedTenant =
        deployedTenant !== undefined ? deployedTenant : await this.resolveDeployedTenant(processKey);
      const scopeTenant = resolvedTenant ?? tenantId;

      // Label an unlabelled start with the tenant it runs under, so the
      // municipality variable -- the only tenant label access checks read --
      // agrees with the tenantId Operaton gives its tasks. The user route
      // always labels first; this decides the M2M start.
      if (!request.variables.municipality) {
        request.variables.municipality = {
          value: scopeTenant,
          type: 'String',
        };
      }

```

(The old "Add tenant ID to variables if not present" block and the old `const deployedTenant = await this.resolveDeployedTenant(processKey); const scopeTenant = deployedTenant ?? tenantId;` lines are replaced by the above. The rest of the method — `let response;` onwards — is unchanged.)

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest src/services/operaton.service.test.ts --coverage=false`
Expected: PASS, whole file (the existing "injects municipality from tenantId when absent" test still passes: with no `get` mock the lookup yields `null`, so the scope tenant is the caller's).

- [ ] **Step 5: Stage and ask**

```bash
npx prettier --write src/services/operaton.service.ts src/services/operaton.service.test.ts
git add src/services/operaton.service.ts src/services/operaton.service.test.ts
```

Ask the user before committing. Proposed message: `fix(operaton): label an unlabelled start with the deployed tenant (#218)`.

---

### Task 3: Start route applies the tenant rule

**Files:**

- Modify: `packages/backend/src/routes/process.routes.ts` (start handler, lines ~27-160)
- Test: `packages/backend/src/routes/process.routes.test.ts` (`describe('POST /:key/start')` ~line 76)
- Modify (comment only): `packages/frontend/e2e/zorgtoeslag-journey.spec.ts` lines 11-13

**Interfaces:**

- Consumes: `resolveStartTenant`, `denyTenant` (Task 1); `operatonService.resolveDeployedTenant`, 4-argument `startProcess` (Task 2).

- [ ] **Step 1: Write the failing tests**

In `process.routes.test.ts`:

1. Add `resolveDeployedTenant: jest.fn(),` to the `operatonService` mock object.
2. Replace `beforeEach(() => jest.clearAllMocks());` with:

```ts
beforeEach(() => {
  jest.clearAllMocks();
  // Default: the process is deployed under the caller's own tenant.
  svc.resolveDeployedTenant.mockResolvedValue('flevoland');
});
```

3. Replace the test `'applies AwbZorgtoeslag coercions and authority override'` with:

```ts
it('applies AwbZorgtoeslag coercions; a citizen case goes to the toeslagen deployment', async () => {
  svc.resolveDeployedTenant.mockResolvedValue('toeslagen');
  svc.startProcess.mockResolvedValue({ id: 'pi-2' });
  await auth(request(app).post('/v1/process/AwbZorgtoeslagProcess/start'))
    .set('x-test-roles', 'citizen')
    .send({ variables: { toetsingsinkomen: '30000', overlijdensdatum: '' } });
  const vars = svc.startProcess.mock.calls[0][1].variables;
  expect(vars.toetsingsinkomen).toEqual({ value: 30000, type: 'Double' });
  expect(vars.overlijdensdatum).toBeUndefined(); // blank stripped
  expect(vars.municipality).toEqual({ value: 'toeslagen', type: 'String' });
  expect(vars.originTenantId).toEqual({ value: 'flevoland', type: 'String' });
});
```

4. Append inside `describe('POST /:key/start', …)`:

```ts
it('stamps the caller tenant and passes the resolved deployed tenant on', async () => {
  svc.startProcess.mockResolvedValue({ id: 'pi-7' });
  await auth(request(app).post('/v1/process/AwbShellProcess/start')).send({ variables: {} });
  expect(svc.resolveDeployedTenant).toHaveBeenCalledTimes(1);
  expect(svc.resolveDeployedTenant).toHaveBeenCalledWith('AwbShellProcess');
  const [key, body, tenantId, deployedTenant] = svc.startProcess.mock.calls[0];
  expect([key, tenantId, deployedTenant]).toEqual(['AwbShellProcess', 'flevoland', 'flevoland']);
  expect(body.variables.municipality).toEqual({ value: 'flevoland', type: 'String' });
  expect(body.variables.originTenantId).toEqual({ value: 'flevoland', type: 'String' });
});

it('403 TENANT_MISMATCH when staff start a process deployed under another tenant', async () => {
  svc.resolveDeployedTenant.mockResolvedValue('toeslagen');
  const res = await auth(request(app).post('/v1/process/AwbZorgtoeslagProcess/start')).send({
    variables: {},
  });
  expect(res.status).toBe(403);
  expect(res.body.error).toEqual({
    code: 'TENANT_MISMATCH',
    message: 'Access denied: organisation mismatch',
  });
  expect(svc.startProcess).not.toHaveBeenCalled();
});

it('treats a token without a roles claim as staff: refused across tenants', async () => {
  svc.resolveDeployedTenant.mockResolvedValue('toeslagen');
  const res = await auth(request(app).post('/v1/process/P/start'))
    .set('x-test-no-roles', '1')
    .send({ variables: {} });
  expect(res.status).toBe(403);
  expect(res.body.error.code).toBe('TENANT_MISMATCH');
  expect(svc.startProcess).not.toHaveBeenCalled();
});

it('ignores a municipality supplied in the request body', async () => {
  svc.startProcess.mockResolvedValue({ id: 'pi-8' });
  await auth(request(app).post('/v1/process/P/start')).send({
    variables: { municipality: 'utrecht' },
  });
  const vars = svc.startProcess.mock.calls[0][1].variables;
  expect(vars.municipality).toEqual({ value: 'flevoland', type: 'String' });
});

it('falls back to the caller tenant when the deployed tenant cannot be resolved', async () => {
  svc.resolveDeployedTenant.mockResolvedValue(null);
  svc.startProcess.mockResolvedValue({ id: 'pi-9' });
  const res = await auth(request(app).post('/v1/process/P/start')).send({ variables: {} });
  expect(res.status).toBe(201);
  const [, body, , deployedTenant] = svc.startProcess.mock.calls[0];
  expect(deployedTenant).toBeNull();
  expect(body.variables.municipality).toEqual({ value: 'flevoland', type: 'String' });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest src/routes/process.routes.test.ts -t "POST /:key/start" --coverage=false`
Expected: FAIL — `resolveDeployedTenant` never called, the staff start gets `201`, the body `municipality` wins, the AWB citizen test still gets the old override values from a flevoland caller (the originTenantId assertion passes, the `deployedTenant` argument is `undefined`).

- [ ] **Step 3: Implement**

In `process.routes.ts`:

1. Add the import next to the other `@auth`/`@middleware` imports:

```ts
import { denyTenant, resolveStartTenant } from '@auth/tenant-access';
```

2. In the AwbZorgtoeslag block, replace the comment lines

```ts
// AwbZorgtoeslagProcess: coerce variable types that the DRD expects as Double
// and strip overlijdensdatum when left blank (DRD expects absence, not empty string).
// AwbZorgtoeslagProcess: type coercions + processing authority override.
// The AWB process always runs under the toeslagen authority regardless of
// which channel (municipality, commercial org) the citizen came from.
```

with

```ts
// AwbZorgtoeslagProcess: coerce variable types that the DRD expects as Double
// and strip overlijdensdatum when left blank (DRD expects absence, not empty string).
// Which authority handles the case is not decided here: the process is
// deployed under toeslagen, and resolveStartTenant below sends a
// citizen's case to the deployment's tenant.
```

and delete the tail of that block:

```ts
// Record originating channel, then override municipality to the
// processing authority so the toeslagen caseworker queue picks it up.
operatonVariables.originTenantId = {
  value: req.user.tenantId,
  type: 'String',
};
operatonVariables.municipality = {
  value: 'toeslagen',
  type: 'String',
};
```

3. Directly after the AwbZorgtoeslag `if` block closes, and before `// Start process`, insert:

```ts
// Tenant rule (#218): the municipality variable is the only tenant label
// access checks read, so it must equal the tenant Operaton runs the
// instance under. Staff may start only their own tenant's processes; a
// citizen's case goes to the deployment's tenant.
const deployedTenant = await operatonService.resolveDeployedTenant(key);
const startTenant = resolveStartTenant(req.user, deployedTenant);
if (!startTenant.allowed) {
  auditLog(req, `process.start.${key}`, 'failure', {
    reason: 'TENANT_MISMATCH',
    deployedTenant,
  });
  return denyTenant(req, res, { processKey: key, deployedTenant });
}
operatonVariables.municipality = { value: startTenant.municipality, type: 'String' };
operatonVariables.originTenantId = { value: startTenant.originTenantId, type: 'String' };
```

4. Change the `startProcess` call's last argument from `req.user.tenantId` to `req.user.tenantId,\n        deployedTenant`:

```ts
const processInstance = await operatonService.startProcess(
  key,
  {
    businessKey: req.body.businessKey,
    variables: operatonVariables,
  },
  req.user.tenantId,
  deployedTenant
);
```

5. In `packages/frontend/e2e/zorgtoeslag-journey.spec.ts`, replace

```ts
// task. AwbZorgtoeslagProcess always runs under the toeslagen processing
// authority regardless of which channel the citizen came from
// (process.routes.ts overrides the municipality variable explicitly), so
```

with

```ts
// task. AwbZorgtoeslagProcess is deployed under the toeslagen processing
// authority, and a citizen's case goes to the deployment's tenant whichever
// channel they came from (tenant-access.ts resolveStartTenant), so
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest src/routes/process.routes.test.ts --coverage=false`
Expected: PASS, whole file.

- [ ] **Step 5: Stage and ask**

```bash
npx prettier --write src/routes/process.routes.ts src/routes/process.routes.test.ts ../frontend/e2e/zorgtoeslag-journey.spec.ts
git add src/routes/process.routes.ts src/routes/process.routes.test.ts ../frontend/e2e/zorgtoeslag-journey.spec.ts
```

Ask the user before committing. Proposed message: `fix(process): stamp the deployed tenant at start; refuse staff across tenants (#218)`.

---

### Task 4: Task detail checks read the variable

**Files:**

- Modify: `packages/backend/src/routes/task.routes.ts` (`GET /:id` ~95, `/:id/variables` ~139, `/:id/form-schema` ~189, `POST /:id/claim` ~250, `/:id/complete` ~291)
- Test: `packages/backend/src/routes/task.routes.test.ts`

**Interfaces:**

- Consumes: `tenantAllows`, `denyTenant` (Task 1); existing `operatonService.getTask(id): Promise<Task>` and `operatonService.getProcessVariables(processInstanceId): Promise<Record<string, OperatonVariable>>`.

- [ ] **Step 1: Write the failing tests**

In `task.routes.test.ts`:

1. Replace `beforeEach(() => jest.clearAllMocks());` with:

```ts
/** Operaton-format process variables owned by the caller's tenant. */
const ownedVars = { municipality: { value: 'flevoland', type: 'String' } };

beforeEach(() => {
  jest.clearAllMocks();
  // Default: the task's process instance belongs to the caller's tenant.
  svc.getProcessVariables.mockResolvedValue(ownedVars);
});
```

2. Change each of the five existing `'403 on a tenant mismatch'` tests (under `GET /v1/task/:id`, `/variables`, `/form-schema`, `/claim`, `/complete`) so the mismatch comes from the **variable** and Operaton's tenant **agrees** with the caller — proving the variable decides. Each becomes:

```ts
it('403 TENANT_MISMATCH when the instance variable names another tenant', async () => {
  svc.getTask.mockResolvedValue({ id: 't1', tenantId: 'flevoland', processInstanceId: 'pi-1' });
  svc.getProcessVariables.mockResolvedValue({ municipality: { value: 'utrecht', type: 'String' } });
  const res = await auth(request(app).get('/v1/task/t1')); // per block: .get('/v1/task/t1/variables'), .get('/v1/task/t1/form-schema'), .post('/v1/task/t1/claim'), .post('/v1/task/t1/complete').send({ variables: {} })
  expect(res.status).toBe(403);
  expect(res.body.error.code).toBe('TENANT_MISMATCH');
});
```

(Write it out five times, once per block, with that block's request line. Keep the existing request line each block already uses.)

3. Add to `describe('GET /v1/task/:id', …)`:

```ts
it('opens a task whose Operaton tenant disagrees but whose variable is the caller tenant', async () => {
  svc.getTask.mockResolvedValue({ id: 't1', tenantId: 'utrecht', processInstanceId: 'pi-1' });
  const res = await auth(request(app).get('/v1/task/t1'));
  expect(res.status).toBe(200);
  expect(svc.getProcessVariables).toHaveBeenCalledWith('pi-1');
});

it('403 TENANT_MISMATCH when the instance carries no municipality', async () => {
  svc.getTask.mockResolvedValue({ id: 't1', tenantId: 'flevoland', processInstanceId: 'pi-1' });
  svc.getProcessVariables.mockResolvedValue({});
  const res = await auth(request(app).get('/v1/task/t1'));
  expect(res.status).toBe(403);
  expect(res.body.error.code).toBe('TENANT_MISMATCH');
});
```

4. Add to `describe('GET /v1/task/:id/variables', …)`:

```ts
it('reads the variables once, for both the check and the response', async () => {
  svc.getTask.mockResolvedValue({ id: 't1', processInstanceId: 'pi-1' });
  await auth(request(app).get('/v1/task/t1/variables'));
  expect(svc.getProcessVariables).toHaveBeenCalledTimes(1);
});
```

5. In `'flattens process variables to plain values'` (and any other test in the file that sets its own `svc.getProcessVariables` value for a success path), include `municipality: { value: 'flevoland', type: 'String' }` in the mocked variables, and add `municipality: 'flevoland'` to the expected flattened object if the test asserts the whole object.

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest src/routes/task.routes.test.ts --coverage=false`
Expected: FAIL — the mismatch tests get `200` (Operaton tenant matches), the disagreeing-tenant test gets `403`, codes are `FORBIDDEN`.

- [ ] **Step 3: Implement**

In `task.routes.ts`:

1. Add imports:

```ts
import { denyTenant, tenantAllows } from '@auth/tenant-access';
```

and extend the `@ronl/shared` import to `import { OperatonVariable, Task } from '@ronl/shared';` (`Task` is exported from `packages/shared/src/types/operaton.types.ts`).

2. Below the `router.use(...)` lines, add:

```ts
/**
 * The tenant a task belongs to is its process instance's municipality
 * variable -- the only tenant label access checks read (#218, #219) -- not
 * Operaton's task.tenantId, which is the deployment's. For a task in a
 * called subprocess this is the child instance's copy, inherited through
 * <camunda:in variables="all"/>.
 */
async function taskMunicipality(task: Task): Promise<unknown> {
  const variables = await operatonService.getProcessVariables(task.processInstanceId);
  return variables.municipality?.value;
}
```

3. In `GET /:id`, `/:id/form-schema`, `POST /:id/claim` and `POST /:id/complete`, replace the whole `if (task.tenantId && task.tenantId !== req.user.tenantId) { … }` block (including any `logger.warn` inside it) with:

```ts
const taskTenant = await taskMunicipality(task);
if (!tenantAllows(req.user, taskTenant)) {
  return denyTenant(req, res, { taskId: id, taskTenant });
}
```

(Keep the `const task = await operatonService.getTask(id);` line above it. Delete the `// Tenant check via task's tenantId claim from Operaton` comment in `GET /:id`.)

4. In `GET /:id/variables`, replace the tenant block **and** the following `const variables = await operatonService.getProcessVariables(task.processInstanceId);` line with:

```ts
const variables = await operatonService.getProcessVariables(task.processInstanceId);
const taskTenant = variables.municipality?.value;
if (!tenantAllows(req.user, taskTenant)) {
  return denyTenant(req, res, { taskId: id, taskTenant });
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest src/routes/task.routes.test.ts --coverage=false`
Expected: PASS, whole file.

- [ ] **Step 5: Stage and ask**

```bash
npx prettier --write src/routes/task.routes.ts src/routes/task.routes.test.ts
git add src/routes/task.routes.ts src/routes/task.routes.test.ts
```

Ask the user before committing. Proposed message: `fix(task): decide task access by the instance's municipality, not Operaton's tenant (#218, #219)`.

---

### Task 5: Process, capacity and RIP detail checks through the helper

**Files:**

- Modify: `packages/backend/src/routes/process.routes.ts` (`/:id/status` ~249, `/:id/variables` ~320, `/:id/historic-variables` ~382, `/:id/activity-history` ~428, `/:instanceId/decision-document` ~473, `DELETE /:id` ~647)
- Modify: `packages/backend/src/routes/capacity.routes.ts` (~line 89), `packages/backend/src/routes/rip.routes.ts` (~line 303)
- Test: `process.routes.test.ts`, `capacity.routes.test.ts`, `rip.routes.test.ts`

**Interfaces:**

- Consumes: `tenantAllows`, `denyTenant` (Task 1).

- [ ] **Step 1: Write the failing tests**

`process.routes.test.ts`:

1. In each existing tenant-refusal test — `GET /:id/status` "403 on a tenant mismatch", `GET /:id/variables` "403 on a tenant mismatch", `GET /:id/historic-variables` "403 for a foreign tenant/process", `GET /:id/activity-history` "403 on a tenant mismatch", `GET /:instanceId/decision-document` "403 on a tenant/process mismatch", `DELETE /:id` "403 on a tenant mismatch" — assert the code too. Where the test is a one-liner `expect((await auth(...)).status).toBe(403);`, rewrite it as:

```ts
const res = await auth(request(app).get('/v1/process/pi/activity-history')); // that test's own request
expect(res.status).toBe(403);
expect(res.body.error.code).toBe('TENANT_MISMATCH');
```

and where it already asserts `'FORBIDDEN'`, change that to `'TENANT_MISMATCH'`.

2. Append a new block:

```ts
describe('detail checks refuse an instance with no municipality (#218 D3)', () => {
  it('GET /:id/historic-variables refuses a non-applicant', async () => {
    svc.getHistoricVariables.mockResolvedValue({ applicantId: 'other' });
    const res = await auth(request(app).get('/v1/process/pi/historic-variables'));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('TENANT_MISMATCH');
  });

  it('GET /:id/historic-variables still serves the applicant', async () => {
    svc.getHistoricVariables.mockResolvedValue({ applicantId: 'u-1' });
    const res = await auth(request(app).get('/v1/process/pi/historic-variables'));
    expect(res.status).toBe(200);
  });

  it('GET /:id/activity-history refuses', async () => {
    svc.getHistoricVariables.mockResolvedValue({});
    const res = await auth(request(app).get('/v1/process/pi/activity-history'));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('TENANT_MISMATCH');
    expect(svc.getActivityHistory).not.toHaveBeenCalled();
  });

  it('GET /:id/status refuses', async () => {
    svc.getProcessInstance.mockResolvedValue({ id: 'pi', ended: false });
    svc.getProcessVariables.mockResolvedValue({});
    const res = await auth(request(app).get('/v1/process/pi/status'));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('TENANT_MISMATCH');
  });

  it('DELETE /:id refuses and deletes nothing', async () => {
    svc.getProcessVariables.mockResolvedValue({});
    const res = await auth(request(app).delete('/v1/process/pi'));
    expect(res.status).toBe(403);
    expect(svc.deleteProcessInstance).not.toHaveBeenCalled();
  });
});
```

`capacity.routes.test.ts` — replace the whole `describe('tenant isolation when the instance has no municipality', …)` block with:

```ts
describe('tenant isolation when the instance has no municipality', () => {
  it('refuses with TENANT_MISMATCH: an unlabelled instance belongs to no tenant', async () => {
    svc.getCapacityClaimDocuments.mockResolvedValue({
      variables: {},
      boardDecisionNotification: { doc: 'a' },
      capacityClaimHandover: null,
    });
    const res = await auth(request(app).get('/v1/hr-capacity/pi-1/documents'));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('TENANT_MISMATCH');
  });
});
```

and in `'403 when the instance belongs to another tenant'` change `'FORBIDDEN'` to `'TENANT_MISMATCH'`.

`rip.routes.test.ts` — replace its `describe('tenant isolation when the instance has no municipality', …)` block with:

```ts
describe('tenant isolation when the instance has no municipality', () => {
  it('refuses with TENANT_MISMATCH: an unlabelled instance belongs to no tenant', async () => {
    svc.getRipInstanceDocuments.mockResolvedValue({
      variables: {},
      intakeReport: { t: 'intake' },
      psuReport: null,
      pdp: null,
    });
    const res = await auth(request(app).get('/v1/rip/instances/pi-1/documents'));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('TENANT_MISMATCH');
  });
});
```

and in `'403 when the instance belongs to another tenant'` change `'FORBIDDEN'` to `'TENANT_MISMATCH'`.

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest src/routes/process.routes.test.ts src/routes/capacity.routes.test.ts src/routes/rip.routes.test.ts --coverage=false`
Expected: FAIL — codes are `FORBIDDEN`; the no-label tests on historic-variables, activity-history, capacity and RIP get `200`.

- [ ] **Step 3: Implement**

`process.routes.ts` (the `denyTenant`/`resolveStartTenant` import from Task 3 becomes `import { denyTenant, resolveStartTenant, tenantAllows } from '@auth/tenant-access';`):

- `GET /:id/status`, `GET /:id/variables`, `DELETE /:id` — each has `const processTenant = variables.municipality?.value;` followed by an `if (processTenant !== req.user.tenantId) { logger.warn(…); return res.status(403).json(…); }` block. Replace that `if` block (keep the `processTenant` line) with:

```ts
if (!tenantAllows(req.user, processTenant)) {
  return denyTenant(req, res, { processInstanceId: id, processTenant });
}
```

- `GET /:id/historic-variables` — replace from `// Tenant check: allow if municipality matches …` through the closing `}` of the `if (!ownTenant && !ownProcess)` block with:

```ts
// Tenant check: the owning tenant, or the applicant themselves (a citizen
// whose case was sent to another tenant's deployment still reads it).
const processTenant = variables['municipality'];
const ownProcess = variables['applicantId'] === req.user.userId;
if (!tenantAllows(req.user, processTenant) && !ownProcess) {
  return denyTenant(req, res, { processInstanceId: id, processTenant });
}
```

- `GET /:id/activity-history` — replace the `if (vars.municipality && vars.municipality !== req.user.tenantId) { … }` block with:

```ts
if (!tenantAllows(req.user, vars.municipality)) {
  return denyTenant(req, res, { processInstanceId: id, processTenant: vars.municipality });
}
```

- `GET /:instanceId/decision-document` — replace from `const processTenant = vars.municipality;` through the closing `}` of `if (!ownTenant && !ownProcess)` with:

```ts
const processTenant = vars.municipality;
const ownProcess = vars['applicantId'] === req.user.userId;
if (!tenantAllows(req.user, processTenant) && !ownProcess) {
  return denyTenant(req, res, { processInstanceId: instanceId, processTenant });
}
```

`capacity.routes.ts` and `rip.routes.ts` — add `import { denyTenant, tenantAllows } from '@auth/tenant-access';` and replace the `// Tenant isolation` `if (result.variables.municipality && …) { return res.status(403)… }` block with:

```ts
// Tenant isolation
if (!tenantAllows(req.user, result.variables.municipality)) {
  return denyTenant(req, res, {
    processInstanceId: instanceId,
    processTenant: result.variables.municipality,
  });
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest src/routes/process.routes.test.ts src/routes/capacity.routes.test.ts src/routes/rip.routes.test.ts --coverage=false`
Expected: PASS, all three files.

- [ ] **Step 5: Confirm no tenant check is left behind**

Run (from `packages/backend`):

```bash
grep -rn -E "task\.tenantId|municipality mismatch|!== req\.user\.tenantId" src --include=*.ts | grep -v "\.test\.ts"
```

Expected: no output. Any hit is a tenant check this plan missed — convert it with `tenantAllows`/`denyTenant` and add a test before continuing.

- [ ] **Step 6: Stage and ask**

```bash
npx prettier --write src/routes/process.routes.ts src/routes/process.routes.test.ts src/routes/capacity.routes.ts src/routes/capacity.routes.test.ts src/routes/rip.routes.ts src/routes/rip.routes.test.ts
git add src/routes/process.routes.ts src/routes/process.routes.test.ts src/routes/capacity.routes.ts src/routes/capacity.routes.test.ts src/routes/rip.routes.ts src/routes/rip.routes.test.ts
```

Ask the user before committing. Proposed message: `fix(process): one tenant check, failing closed on a missing label (#218)`.

---

### Task 6: Verification

No code. Every step here is a hand-off or a read-only check.

- [ ] **Step 1: Static checks** (from the repo root)

```bash
npm run type-check
npm run lint
```

Expected: both exit 0. Fix anything they name; never bypass.

- [ ] **Step 2: Full suite — the user runs it**

Hand the user: `npm test` (repo root). Expected: all workspaces green, no backend file below 80% branch coverage (in particular `src/auth/tenant-access.ts`, `task.routes.ts`, `process.routes.ts`, `capacity.routes.ts`, `rip.routes.ts`, `operaton.service.ts`). Wait for their result. If a failure appears only in the parallel run, re-run that file in isolation (`npm run test:serial --workspace=packages/backend` or `npx jest <file>`) before treating it as a defect.

- [ ] **Step 3: Live replay on the local stack — the user restarts the backend first**

Ask the user to restart the backend so it serves this branch. Do not restart it yourself. Then, with tokens for the seed users (password `test123`, realm `ronl`), replay against the local backend:

1. `test-caseworker-utrecht`: `POST /v1/process/AwbShellProcess/start` → `403 TENANT_MISMATCH`; Operaton (`GET http://localhost:8081/engine-rest/process-instance?processDefinitionKey=AwbShellProcess`) shows no new instance.
2. `test-citizen-utrecht`: `POST /v1/process/AwbShellProcess/start` → `201`. `GET /v1/process/{id}/historic-variables` as the citizen → `200` with `municipality = flevoland`, `originTenantId = utrecht`.
3. When its task exists: `test-caseworker-flevoland` sees it in `GET /v1/task` and opens `GET /v1/task/{id}` → `200`; `test-caseworker-utrecht` gets neither (absent from the list, `403 TENANT_MISMATCH` on the detail).
4. `test-citizen-unive`: `POST /v1/process/AwbZorgtoeslagProcess/start` → `201`; its task appears for `test-caseworker-toeslagen`.
5. Delete the instances created (`DELETE /v1/process/{id}` as the owning flevoland/toeslagen caseworker).

- [ ] **Step 4: E2E — the user runs it**

Hand the user: `npm run test:e2e --workspace=packages/frontend`. Expected: all tests pass, including `tenant-isolation.spec.ts` and `zorgtoeslag-journey.spec.ts`. Wait for their result.

- [ ] **Step 5: Hand off**

Report results. Offer: push the branch and open a PR against `acc` (body references #218 and #219 and notes that #211 documents the 403s per the spec's "What #211 documents" section), or keep the branch as is. Do not merge.
