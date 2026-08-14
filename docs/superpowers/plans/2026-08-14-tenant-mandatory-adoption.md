# Tenant-Mandatory Adoption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the two remaining tenant-scoping gaps in `ronl-business-api`'s `OperatonService`, rename `RipPhase1Process` → `RipR21Process`, and stand up a stable, tenant-scoped E2E fixture bundle (assembled in `linked-data-explorer`, deployed manually) so the whole tenant-mandatory cutover can be proven end-to-end rather than assumed.

**Architecture:** Two independent code fixes in `operaton.service.ts` (a shared tenant-scoped-then-fallback helper for key lookups; `tenantIdIn` threading for count/listing queries), a project-wide literal rename of one process-definition key across both repos, a new `linked-data-explorer/e2e-fixtures/<tenant>/` directory as the single point of truth for the deployable test bundle (superseding two divergent "examples" locations for E2E purposes), and an extension to `ronl-business-api`'s `global-setup.ts` that verifies — never auto-deploys — the required bundle against Operaton directly before E2E tests run. Code and unit tests land first (TDD, red/green, provable without a live redeploy); the manual LDE redeploy is a deliberate checkpoint task in the middle of this plan; full E2E verification is the last task.

**Tech Stack:** TypeScript, Express, Jest + Supertest (`ronl-business-api` backend), Vitest/RTL-equivalent Jest (`ronl-business-api` frontend — confirmed Jest via existing `*.test.tsx` files), Playwright (`ronl-business-api` E2E), Jest (`linked-data-explorer` backend), Operaton REST API (Camunda 7-compatible engine), axios.

**Spec:** `docs/superpowers/specs/2026-08-14-tenant-mandatory-adoption-design.md`

## Global Constraints

- Clean slate: no currently-running process instances need to survive the cutover. `tenantIdIn` filters can be strict (no "this tenant OR untenanted-legacy" union logic).
- `municipality` (the app-level process variable) and Operaton's native `tenant-id` are independent mechanisms. Do not conflate them — methods already filtering by `municipality` (`getProcessHistory`, `getHrOnboardingProfile`, `getHrOnboardingCompletedList`, `getUserTasks`, `getCompletedTasks`, `getRipPhase1ActiveList`/`CompletedList`, `getCapacityClaimActiveList`/`CompletedList`) are already correct and are **not** touched by this plan except where a task below explicitly says so.
- DMN/DRD evaluation (`evaluateDecision`, `/decision-definition/key/{key}/evaluate`) stays untenanted — permanent architectural choice, not a gap. Do not touch it.
- `m2m.routes.ts`'s cross-tenant list/query calls (`listProcessInstances`, `queryProcessHistory`) stay untouched — deliberately cross-tenant by design.
- `OPERATON_M2M_BASE_URL` pointing at a remote host is a known, separate, explicitly parked issue. Do not fix it as part of this plan.
- Redeploying the five processes via LDE (Task 7) is **manual** — no task in this plan automates an Operaton deployment call. LDE's BPMN Modeler can import a BPMN file from any local path, not only its pre-loaded `public/examples/` set — no new "load example" buttons are needed for the new fixture directory.
- Rename scope (Task 3/4) is **only** the literal Operaton process-definition key string `'RipPhase1Process'` → `'RipR21Process'` in non-historical source and test files. `changelog-data.ts`'s historical release-note mentions and every doc under `docs/infra-beheer-handoff/`, `docs/infra-beheer-handoff-v2/`, `docs/RIP-FASE1-TENANT-SCOPING.md`, and any `docs/superpowers/{specs,plans}/2026-08-10-*` file are historical records and must **not** be edited.
- ronl-business-api's own internal identifiers (`getRipPhase1ActiveList`, `/v1/rip/phase1/active`, etc.) are **not** renamed — only the literal Operaton key changes.

---

## Task 1: Gap 1 — tenant-scoped-then-fallback key lookups (`getBoardOwner`, `getDeployedStartForm`)

**Files:**

- Modify: `packages/backend/src/services/operaton.service.ts:716-742` (`getBoardOwner`), `packages/backend/src/services/operaton.service.ts:896-911` (`getDeployedStartForm`), `packages/backend/src/services/operaton.service.ts:687-691` (`getCompletedTasks`'s call site), `packages/backend/src/services/operaton.service.ts:29` (`boardOwnerCache` — no type change, cache key format changes only)
- Modify: `packages/backend/src/routes/process.routes.ts:545`
- Test: `packages/backend/src/services/operaton.service.test.ts`

**Interfaces:**

- Produces: `private getByKeyWithTenantFallback<T>(processKey: string, tenantId: string | undefined, suffix: string, options?: { responseType?: 'text' }): Promise<{ data: T; headers: Record<string, string> }>` on `OperatonService` — a new private helper other Gap-1-class methods can reuse.
- Produces: `getBoardOwner(processDefinitionKey: string, tenantId?: string): Promise<string | null>` — signature gains an optional second parameter; existing callers with no tenantId keep working (falls straight to the untenanted URL, same as today).
- Produces: `getDeployedStartForm(processKey: string, tenantId?: string): Promise<{ data: string; contentType: string }>` — same optional-second-parameter shape.
- Consumes (Task 2 depends on nothing from this task; independent).

- [ ] **Step 1: Write the failing tests in `operaton.service.test.ts`**

Add two new tests inside the existing `describe('getBoardOwner', ...)` block (after the existing 5 tests, before its closing `});` at line 557):

```typescript
it('tries the tenant-scoped XML lookup first when a tenantId is given', async () => {
  mockClient.get.mockResolvedValue({
    data: { bpmn20Xml: '<camunda:property name="boardOwner" value="rvo" />' },
  });
  await expect(svc.getBoardOwner('K10', 'flevoland')).resolves.toBe('rvo');
  expect(mockClient.get).toHaveBeenCalledWith(
    '/process-definition/key/K10/tenant-id/flevoland/xml'
  );
});

it('falls back to the untenanted XML lookup when the tenant-scoped one reports no matching definition', async () => {
  mockClient.get
    .mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        data: { message: 'No matching process definition with key: K11 and tenant-id: flevoland' },
      },
    })
    .mockResolvedValueOnce({
      data: { bpmn20Xml: '<camunda:property name="boardOwner" value="waterschap" />' },
    });
  await expect(svc.getBoardOwner('K11', 'flevoland')).resolves.toBe('waterschap');
  expect(mockClient.get).toHaveBeenNthCalledWith(
    1,
    '/process-definition/key/K11/tenant-id/flevoland/xml'
  );
  expect(mockClient.get).toHaveBeenNthCalledWith(2, '/process-definition/key/K11/xml');
});

it('caches tenant-scoped and untenanted lookups of the same key separately', async () => {
  mockClient.get.mockResolvedValue({
    data: { bpmn20Xml: '<camunda:property name="boardOwner" value="rvo" />' },
  });
  await svc.getBoardOwner('K12'); // untenanted, caches under '::K12'
  await svc.getBoardOwner('K12', 'flevoland'); // tenant-scoped, caches under 'flevoland::K12'
  expect(mockClient.get).toHaveBeenCalledTimes(2);
});
```

Add two new tests inside the existing `describe('deployed forms', ...)` block, immediately after the existing `'defaults the content type when the header is absent'` test:

```typescript
it('getDeployedStartForm tries the tenant-scoped lookup first when a tenantId is given', async () => {
  mockClient.get.mockResolvedValue({ data: '<form/>', headers: { 'content-type': 'text/html' } });
  await svc.getDeployedStartForm('K', 'flevoland');
  expect(mockClient.get).toHaveBeenCalledWith(
    '/process-definition/key/K/tenant-id/flevoland/deployed-start-form',
    { responseType: 'text' }
  );
});

it('getDeployedStartForm falls back to the untenanted lookup on a no-matching-definition error', async () => {
  mockClient.get
    .mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        data: { message: 'No matching process definition with key: K and tenant-id: flevoland' },
      },
    })
    .mockResolvedValueOnce({ data: '{}', headers: { 'content-type': 'application/json' } });
  await svc.getDeployedStartForm('K', 'flevoland');
  expect(mockClient.get).toHaveBeenNthCalledWith(
    1,
    '/process-definition/key/K/tenant-id/flevoland/deployed-start-form',
    { responseType: 'text' }
  );
  expect(mockClient.get).toHaveBeenNthCalledWith(
    2,
    '/process-definition/key/K/deployed-start-form',
    {
      responseType: 'text',
    }
  );
});
```

Update the existing `getCompletedTasks` test (the one at what is currently line 560-589, `'joins businessKey and boardOwner into each historic task'`) — it calls `svc.getCompletedTasks('flevoland')`, which will now pass `tenantId='flevoland'` into `getBoardOwner`, so its `routeGet` mock must register the tenant-scoped URL too:

```typescript
it('joins businessKey and boardOwner into each historic task', async () => {
  routeGet([
    [
      '/history/task',
      {
        data: [
          {
            id: 'ht1',
            name: 'Review',
            assignee: 'u',
            taskDefinitionKey: 'tdk',
            processDefinitionKey: 'K1',
            processInstanceId: 'pi1',
            startTime: 's',
            endTime: 'e',
            duration: 10,
          },
        ],
      },
    ],
    [
      '/process-definition/key/K1/tenant-id/flevoland/xml',
      { data: { bpmn20Xml: '<camunda:property name="boardOwner" value="rvo"/>' } },
    ],
  ]);
  mockClient.post.mockResolvedValue({ data: [{ id: 'pi1', businessKey: 'BK-1' }] });

  const res = await svc.getCompletedTasks('flevoland');
  expect(res[0]).toMatchObject({ id: 'ht1', businessKey: 'BK-1', boardOwner: 'rvo' });
});
```

(Only the second `routeGet` route pair changes — `/process-definition/key/K1/xml` becomes `/process-definition/key/K1/tenant-id/flevoland/xml` — everything else in that test is unchanged.)

- [ ] **Step 2: Run the tests to verify the new/changed ones fail**

Run: `cd packages/backend && npx jest src/services/operaton.service.test.ts -t "getBoardOwner|deployed forms|getCompletedTasks"`
Expected: the 4 new tests fail (method doesn't accept a second argument / doesn't hit the tenant-scoped URL yet), and `'joins businessKey and boardOwner into each historic task'` fails (its updated mock registers a URL the current code never requests).

- [ ] **Step 3: Add the shared helper**

In `packages/backend/src/services/operaton.service.ts`, add this private method to the `OperatonService` class, placed directly above `getBoardOwner` (before line 716):

```typescript
  /**
   * Try a tenant-scoped Operaton lookup by process-definition key, falling
   * back to the untenanted shorthand when Operaton reports no matching
   * definition — the same pattern startProcess already uses. `suffix` is the
   * URL path segment following `/process-definition/key/{key}` (and, when
   * tenant-scoped, `/tenant-id/{tenantId}`), e.g. '/xml' or
   * '/deployed-start-form'.
   */
  private async getByKeyWithTenantFallback<T>(
    processKey: string,
    tenantId: string | undefined,
    suffix: string,
    options?: { responseType?: 'text' }
  ): Promise<{ data: T; headers: Record<string, string> }> {
    if (tenantId) {
      try {
        return await this.client.get<T>(
          `/process-definition/key/${encodeURIComponent(processKey)}/tenant-id/${encodeURIComponent(tenantId)}${suffix}`,
          options
        );
      } catch (scopedError) {
        const scopedBody = axios.isAxiosError(scopedError) ? scopedError.response?.data : null;
        const scopedMessage: string = scopedBody?.message ?? '';
        if (!scopedMessage.includes('No matching process definition with key')) {
          throw scopedError;
        }
      }
    }
    return this.client.get<T>(
      `/process-definition/key/${encodeURIComponent(processKey)}${suffix}`,
      options
    );
  }
```

- [ ] **Step 4: Rewrite `getBoardOwner` to use the helper and a tenant-aware cache key**

Replace the existing `getBoardOwner` method (lines 716-742) with:

```typescript
  async getBoardOwner(processDefinitionKey: string, tenantId?: string): Promise<string | null> {
    if (!processDefinitionKey) return null;
    const cacheKey = `${tenantId ?? ''}::${processDefinitionKey}`;
    const cached = this.boardOwnerCache.get(cacheKey);
    if (cached !== undefined) return cached;

    let owner: string | null = null;
    try {
      const res = await this.getByKeyWithTenantFallback<{ bpmn20Xml?: string }>(
        processDefinitionKey,
        tenantId,
        '/xml'
      );
      const xml: string = res.data?.bpmn20Xml ?? '';
      // Match the property regardless of name/value attribute order.
      const m =
        xml.match(/<camunda:property\b[^>]*\bname="boardOwner"[^>]*\bvalue="([^"]*)"/) ??
        xml.match(/<camunda:property\b[^>]*\bvalue="([^"]*)"[^>]*\bname="boardOwner"/);
      owner = m ? m[1] : null;
    } catch (error) {
      logger.warn('Failed to resolve boardOwner; treating as untagged', {
        processDefinitionKey,
        tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      owner = null;
    }

    this.boardOwnerCache.set(cacheKey, owner);
    return owner;
  }
```

- [ ] **Step 5: Rewrite `getDeployedStartForm` to use the helper**

Replace the existing `getDeployedStartForm` method (lines 896-911) with:

```typescript
  async getDeployedStartForm(
    processKey: string,
    tenantId?: string
  ): Promise<{ data: string; contentType: string }> {
    try {
      const response = await this.getByKeyWithTenantFallback<string>(
        processKey,
        tenantId,
        '/deployed-start-form',
        { responseType: 'text' }
      );
      const contentType: string = response.headers['content-type'] ?? 'application/octet-stream';
      return { data: response.data, contentType };
    } catch (error) {
      logger.error('Failed to fetch deployed start form', {
        processKey,
        tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }
```

- [ ] **Step 6: Thread `tenantId` through the two call sites**

In `getCompletedTasks` (`operaton.service.ts`), change line 689 from:

```typescript
boardOwnerByKey.set(key, await this.getBoardOwner(key));
```

to:

```typescript
boardOwnerByKey.set(key, await this.getBoardOwner(key, tenantId));
```

(`tenantId` is already the outer `getCompletedTasks(tenantId: string)` parameter, already in scope at that line and already used at the method's `logger.error` call.)

In `packages/backend/src/routes/process.routes.ts`, change line 545 from:

```typescript
const { data, contentType } = await operatonService.getDeployedStartForm(key);
```

to:

```typescript
const { data, contentType } = await operatonService.getDeployedStartForm(key, req.user.tenantId);
```

(`req.user` is already null-checked at line 535, above this line, so `req.user.tenantId` is safe here.)

Do **not** change `packages/backend/src/routes/m2m.routes.ts:285` — that route has no `req.user` reference at all (M2M callers are system actors, not tenant-scoped users); its call to `m2mOperatonService.getDeployedStartForm(key)` simply omits the optional second argument, preserving today's untenanted-only behavior there.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd packages/backend && npx jest src/services/operaton.service.test.ts`
Expected: all tests pass (full file, not just the filtered subset — confirms nothing else in this 1225-line file regressed).

- [ ] **Step 8: Add a call-site assertion in `process.routes.test.ts`**

In `packages/backend/src/routes/process.routes.test.ts`, inside `describe('GET /:key/start-form', ...)`, update the first test (`'returns a JSON form'`, currently lines 272-280) to also assert the tenantId is threaded through:

```typescript
it('returns a JSON form', async () => {
  svc.getDeployedStartForm.mockResolvedValue({
    data: '{"x":1}',
    contentType: 'application/json',
  });
  const res = await auth(request(app).get('/v1/process/P/start-form'));
  expect(res.status).toBe(200);
  expect(res.body.data).toEqual({ x: 1 });
  expect(svc.getDeployedStartForm).toHaveBeenCalledWith('P', 'flevoland');
});
```

(This test file's mocked `jwtMiddleware`, lines 15-21, already sets `req.user.tenantId = 'flevoland'` — confirmed by reading the file's header.)

- [ ] **Step 9: Run the full backend test suite**

Run: `cd packages/backend && npx jest`
Expected: PASS, no regressions elsewhere.

- [ ] **Step 10: Commit**

```bash
git add packages/backend/src/services/operaton.service.ts packages/backend/src/services/operaton.service.test.ts packages/backend/src/routes/process.routes.ts packages/backend/src/routes/process.routes.test.ts
git commit -m "fix: tenant-scoped-then-fallback lookups for getBoardOwner and getDeployedStartForm"
```

---

## Task 2: Gap 2 — tenant-scoped deployment-status and instance counts

**Files:**

- Modify: `packages/backend/src/services/operaton.service.ts:115-129` (`getDeployedProcessKeys`), `packages/backend/src/services/operaton.service.ts:136-153` (`getPhaseInstanceCounts`)
- Modify: `packages/backend/src/routes/rip.routes.ts:56-57` (`/phases/deployment-status`), `packages/backend/src/routes/rip.routes.ts:86-88` (`/phases/counts`)
- Test: `packages/backend/src/services/operaton.service.test.ts`, `packages/backend/src/routes/rip.routes.test.ts`

**Interfaces:**

- Produces: `getDeployedProcessKeys(keys: string[], tenantId?: string): Promise<string[]>` — signature gains an optional second parameter.
- Produces: `getPhaseInstanceCounts(keys: string[], tenantId?: string): Promise<Record<string, { wip: number; gereed: number }>>` — same.
- Consumes: nothing from Task 1 (independent; both tasks touch the same file but different methods).

- [ ] **Step 1: Write the failing tests in `operaton.service.test.ts`**

Add a new test inside `describe('getDeployedProcessKeys', ...)`, after the existing `'rethrows on failure'` test (before its closing `});`):

```typescript
it('adds tenantIdIn to the query when a tenantId is given', async () => {
  mockClient.get.mockResolvedValue({ data: [{ key: 'RipPhase1Process' }] });

  await svc.getDeployedProcessKeys(['RipPhase1Process'], 'flevoland');

  expect(mockClient.get).toHaveBeenCalledWith('/process-definition', {
    params: { keysIn: 'RipPhase1Process', latestVersion: true, tenantIdIn: 'flevoland' },
  });
});
```

Add a new test inside `describe('getPhaseInstanceCounts', ...)`, after the existing `'rethrows on failure'` test:

```typescript
it('adds tenantIdIn to both count queries when a tenantId is given', async () => {
  mockClient.get.mockResolvedValue({ data: { count: 1 } });

  await svc.getPhaseInstanceCounts(['RipPhase1Process'], 'flevoland');

  expect(mockClient.get).toHaveBeenCalledWith('/process-instance/count', {
    params: { processDefinitionKey: 'RipPhase1Process', tenantIdIn: 'flevoland' },
  });
  expect(mockClient.get).toHaveBeenCalledWith('/history/process-instance/count', {
    params: { processDefinitionKey: 'RipPhase1Process', finished: true, tenantIdIn: 'flevoland' },
  });
});
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `cd packages/backend && npx jest src/services/operaton.service.test.ts -t "tenantIdIn"`
Expected: FAIL — neither method currently accepts a second argument or adds `tenantIdIn`.

- [ ] **Step 3: Update `getDeployedProcessKeys`**

Replace lines 115-129 of `operaton.service.ts`:

```typescript
  async getDeployedProcessKeys(keys: string[], tenantId?: string): Promise<string[]> {
    try {
      const response = await this.client.get('/process-definition', {
        params: {
          keysIn: keys.join(','),
          latestVersion: true,
          ...(tenantId ? { tenantIdIn: tenantId } : {}),
        },
      });
      const found = new Set((response.data as Array<{ key: string }>).map((d) => d.key));
      return keys.filter((k) => found.has(k));
    } catch (error) {
      logger.error('Failed to query deployed process keys', {
        keys,
        tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }
```

(The conditional spread — not an unconditional `tenantIdIn: tenantId` — keeps the exact `params: { keysIn: ..., latestVersion: true }` shape asserted by the three existing tests when no tenantId is passed.)

- [ ] **Step 4: Update `getPhaseInstanceCounts`**

Replace lines 136-153 of `operaton.service.ts`:

```typescript
  async getPhaseInstanceCounts(
    keys: string[],
    tenantId?: string
  ): Promise<Record<string, { wip: number; gereed: number }>> {
    const entries = await Promise.all(
      keys.map(async (key) => {
        const [wipRes, gereedRes] = await Promise.all([
          this.client.get('/process-instance/count', {
            params: { processDefinitionKey: key, ...(tenantId ? { tenantIdIn: tenantId } : {}) },
          }),
          this.client.get('/history/process-instance/count', {
            params: {
              processDefinitionKey: key,
              finished: true,
              ...(tenantId ? { tenantIdIn: tenantId } : {}),
            },
          }),
        ]);
        return [key, { wip: wipRes.data.count, gereed: gereedRes.data.count }] as const;
      })
    );
    return Object.fromEntries(entries);
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd packages/backend && npx jest src/services/operaton.service.test.ts`
Expected: PASS (full file).

- [ ] **Step 6: Thread `req.user.tenantId` through the two `rip.routes.ts` handlers**

In `packages/backend/src/routes/rip.routes.ts`, change line 57 (inside the `/phases/deployment-status` handler) from:

```typescript
const deployedKeys = await operatonService.getDeployedProcessKeys(keys);
```

to:

```typescript
const deployedKeys = await operatonService.getDeployedProcessKeys(keys, req.user.tenantId);
```

Change lines 87-88 (inside the `/phases/counts` handler) from:

```typescript
const deployedKeys = await operatonService.getDeployedProcessKeys(keys);
const counts = await operatonService.getPhaseInstanceCounts(deployedKeys);
```

to:

```typescript
const deployedKeys = await operatonService.getDeployedProcessKeys(keys, req.user.tenantId);
const counts = await operatonService.getPhaseInstanceCounts(deployedKeys, req.user.tenantId);
```

(Both handlers already null-check `req.user` above these lines — see the existing `if (!req.user) { ... }` blocks at the top of each route.)

- [ ] **Step 7: Update `rip.routes.test.ts`'s existing assertions**

In `packages/backend/src/routes/rip.routes.test.ts`, inside `describe('GET /phases/deployment-status', ...)`, the test `'returns the deployed keys from the service'` (currently lines 93-99): change

```typescript
expect(svc.getDeployedProcessKeys).toHaveBeenCalledWith(['RipPhase1Process']);
```

to:

```typescript
expect(svc.getDeployedProcessKeys).toHaveBeenCalledWith(['RipPhase1Process'], 'flevoland');
```

Inside `describe('GET /phases/counts', ...)`, the test `'returns counts for the deployed keys only'` (currently lines 115-124): change

```typescript
expect(svc.getPhaseInstanceCounts).toHaveBeenCalledWith(['RipPhase1Process']);
```

to:

```typescript
expect(svc.getPhaseInstanceCounts).toHaveBeenCalledWith(['RipPhase1Process'], 'flevoland');
```

(The route mock's `jwtMiddleware`, lines 8-15 of this file, already sets `req.user.tenantId = 'flevoland'`.)

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cd packages/backend && npx jest src/routes/rip.routes.test.ts`
Expected: PASS.

- [ ] **Step 9: Run the full backend test suite**

Run: `cd packages/backend && npx jest`
Expected: PASS, no regressions.

- [ ] **Step 10: Commit**

```bash
git add packages/backend/src/services/operaton.service.ts packages/backend/src/services/operaton.service.test.ts packages/backend/src/routes/rip.routes.ts packages/backend/src/routes/rip.routes.test.ts
git commit -m "fix: tenant-scope deployment-status and phase instance counts (cross-tenant leak)"
```

---

## Task 3: Rename `RipPhase1Process` → `RipR21Process` — backend

**Files:**

- Modify: `packages/shared/src/rip-phases.ts:16`
- Modify: `packages/backend/src/services/operaton.service.ts:935` (doc comment), `:949`, `:1047`
- Modify: `packages/backend/src/routes/rip.routes.ts:16`, `:146` (doc comments only)
- Test: `packages/backend/src/services/operaton.service.test.ts` (existing tests, literal-string updates only)

**Interfaces:**

- Consumes: nothing from Tasks 1/2 beyond "run after them" (Task 2 edited `rip.routes.test.ts` and `operaton.service.test.ts`'s literal `'RipPhase1Process'` occurrences remain in those files — this task's sweep picks those up too).
- Produces: the string `'RipR21Process'` as `RIP_PHASE_KEYS`'s R2.1 entry's `processDefinitionKey` — Task 4 (frontend) and Task 5 (E2E manifest) both depend on this exact string.

`packages/shared` has no test runner configured (no `test` script, no test framework in `devDependencies`) — `RIP_PHASE_KEYS`'s correctness is verified transitively through `rip.routes.test.ts` (Task 2, already covers the derived `deployedKeys` behavior) and `rip-phases.catalog.test.ts` (Task 4). This task does not add test tooling to `packages/shared` — out of scope.

- [ ] **Step 1: Rename in `rip-phases.ts`**

In `packages/shared/src/rip-phases.ts`, change line 16 from:

```typescript
  { code: 'R2.1', stage: 'R2', processDefinitionKey: 'RipPhase1Process' },
```

to:

```typescript
  { code: 'R2.1', stage: 'R2', processDefinitionKey: 'RipR21Process' },
```

- [ ] **Step 2: Write the failing tests in `operaton.service.test.ts`**

Update the existing test at `describe('startProcess', ...)`'s `'translates a missing-deployment 404 into a friendly Dutch message'` (currently lines 148-161) — this test uses `'RipPhase1Process'` purely as an example key name for a generic error-translation path, not asserting anything about the real R2.1 process. The key is arbitrary (any string exercises the same logic identically), but once this task lands, `'RipPhase1Process'` no longer names anything real anywhere else in either repo — leaving it alive here as a stale, no-longer-real name serves no purpose and reads as confusing leftover to a future reader. Rename it too, verbatim: `svc.startProcess('RipPhase1Process', req(), 'flevoland')` → `svc.startProcess('RipR21Process', req(), 'flevoland')`, `message: 'No matching process definition with key: RipPhase1Process and no tenant-id'` → `message: 'No matching process definition with key: RipR21Process and no tenant-id'`, and the assertion `/RipPhase1Process' is niet gevonden op deze Operaton-omgeving/` → `/RipR21Process' is niet gevonden op deze Operaton-omgeving/`.

Update the existing test at `describe('getUserTasks', ...)`'s `'builds tenant + candidateGroup params and derives the key from a versioned defId'` (currently lines 496-509) — same reasoning and same fix: `'RipPhase1Process:3:abc'` here is an arbitrary example `processDefinitionId`, not asserting anything about the real R2.1 process, but should still not keep the retired name alive. Rename verbatim: `routeGet([['/task', { data: [{ id: 't1', processDefinitionId: 'RipPhase1Process:3:abc' }] }]]);` → `routeGet([['/task', { data: [{ id: 't1', processDefinitionId: 'RipR21Process:3:abc' }] }]]);`, and `expect(res[0]).toMatchObject({ id: 't1', processDefinitionKey: 'RipPhase1Process' });` → `expect(res[0]).toMatchObject({ id: 't1', processDefinitionKey: 'RipR21Process' });`.

Add a new test inside `describe('getBoardOwner', ...)` region is not relevant here — skip. Instead, update the two tests that assert the _real_ R2.1 query filter. In `packages/backend/src/services/operaton.service.test.ts`, find the (not-yet-written, added by this step) coverage for `getRipPhase1ActiveList`/`getRipPhase1CompletedList`'s query filter. These methods currently have **no dedicated test** in this file (confirmed: no `describe('getRipPhase1ActiveList'` or `describe('getRipPhase1CompletedList'` block exists). Add one:

```typescript
describe('getRipPhase1ActiveList / getRipPhase1CompletedList', () => {
  it('getRipPhase1ActiveList filters by the RipR21Process key', async () => {
    mockClient.post.mockResolvedValue({ data: [] });
    await svc.getRipPhase1ActiveList('flevoland');
    expect(mockClient.post).toHaveBeenCalledWith(
      '/history/process-instance',
      expect.objectContaining({ processDefinitionKey: 'RipR21Process' })
    );
  });

  it('getRipPhase1CompletedList filters by the RipR21Process key', async () => {
    mockClient.post.mockResolvedValue({ data: [] });
    await svc.getRipPhase1CompletedList('flevoland');
    expect(mockClient.post).toHaveBeenCalledWith(
      '/history/process-instance',
      expect.objectContaining({ processDefinitionKey: 'RipR21Process' })
    );
  });
});
```

Place this new `describe` block directly after the existing `describe('startProcess', ...)` block (after line 162).

- [ ] **Step 3: Run the tests to verify the new ones fail**

Run: `cd packages/backend && npx jest src/services/operaton.service.test.ts -t "RipR21Process"`
Expected: FAIL — the service still queries `processDefinitionKey: 'RipPhase1Process'`.

- [ ] **Step 4: Rename in `operaton.service.ts`**

Change line 935 (doc comment) from:

```typescript
   * List active (unfinished) RipPhase1Process instances for a municipality,
```

to:

```typescript
   * List active (unfinished) RipR21Process instances for a municipality,
```

Change line 949 from:

```typescript
      processDefinitionKey: 'RipPhase1Process',
```

to:

```typescript
      processDefinitionKey: 'RipR21Process',
```

(inside `getRipPhase1ActiveList`).

Change line 1047 from:

```typescript
      processDefinitionKey: 'RipPhase1Process',
```

to:

```typescript
      processDefinitionKey: 'RipR21Process',
```

(inside `getRipPhase1CompletedList`).

- [ ] **Step 5: Update doc comments in `rip.routes.ts`**

Change line 16 from:

```typescript
 * List active RipPhase1Process instances for the caseworker's municipality.
```

to:

```typescript
 * List active RipR21Process instances for the caseworker's municipality.
```

Change line 146 from:

```typescript
 * List completed RipPhase1Process instances for the caseworker's municipality.
```

to:

```typescript
 * List completed RipR21Process instances for the caseworker's municipality.
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd packages/backend && npx jest src/services/operaton.service.test.ts`
Expected: PASS (full file).

- [ ] **Step 7: Run the full backend test suite**

Run: `cd packages/backend && npx jest`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src/rip-phases.ts packages/backend/src/services/operaton.service.ts packages/backend/src/services/operaton.service.test.ts packages/backend/src/routes/rip.routes.ts
git commit -m "refactor: rename RipPhase1Process to RipR21Process (backend)"
```

---

## Task 4: Rename `RipPhase1Process` → `RipR21Process` — frontend

**Files:**

- Modify: `packages/frontend/src/components/InfraBoardDashboard/PhaseDetail.tsx:233`
- Modify: `packages/frontend/src/services/infra.api.ts:7` (doc comment), `:136`
- Modify: `packages/frontend/src/pages/infra-board/rip-phases.catalog.ts:72`
- Modify: `packages/frontend/src/pages/infra-board/rip-model.ts:5` (doc comment)
- Test: `packages/frontend/src/components/InfraBoardDashboard/FaseladderOverview.test.tsx`, `PhaseDetail.test.tsx`, `ProjectDetail.test.tsx`, `packages/frontend/src/pages/infra-board/rail-stats.test.ts`, `rip-model.test.ts`, `rip-phase-counts.test.ts`, `rip-phases.catalog.test.ts`, `packages/frontend/src/pages/InfraBoardDashboard.test.tsx`, `packages/frontend/src/services/api.test.ts`, `packages/frontend/src/services/infra.api.test.ts`

**Interfaces:**

- Consumes: `RIP_PHASE_KEYS`'s R2.1 entry now carrying `processDefinitionKey: 'RipR21Process'` (Task 3).
- Produces: nothing further downstream in `ronl-business-api` — this is the last rename task in this repo. Task 5's E2E manifest depends on the string `'RipR21Process'` matching what Task 6/7 actually deploy.

This is a literal string rename with no behavior change — every occurrence below is `'RipPhase1Process'` → `'RipR21Process'`, verbatim, already located by an exhaustive grep of `packages/frontend/src` for the literal string.

- [ ] **Step 1: Write the failing test updates**

In `packages/frontend/src/components/InfraBoardDashboard/FaseladderOverview.test.tsx`, change line 34 from `data: { deployedKeys: ['RipPhase1Process'] },` to `data: { deployedKeys: ['RipR21Process'] },`, and line 40 from `data: { counts: { RipPhase1Process: { wip: 1, gereed: 2 } } },` to `data: { counts: { RipR21Process: { wip: 1, gereed: 2 } } },`.

In `packages/frontend/src/components/InfraBoardDashboard/PhaseDetail.test.tsx`, change line 55 from `data: { deployedKeys: ['RipPhase1Process'] },` to `data: { deployedKeys: ['RipR21Process'] },`; change line 153's test title from `it('starts RipPhase1Process on click and shows success', async () => {` to `it('starts RipR21Process on click and shows success', async () => {`; change line 159 from `expect(mockStart).toHaveBeenCalledWith('RipPhase1Process', {});` to `expect(mockStart).toHaveBeenCalledWith('RipR21Process', {});`.

In `packages/frontend/src/components/InfraBoardDashboard/ProjectDetail.test.tsx`, change line 119 from `processDefinitionId: 'RipPhase1Process:1:def',` to `processDefinitionId: 'RipR21Process:1:def',`, and line 120 from `processDefinitionKey: 'RipPhase1Process',` to `processDefinitionKey: 'RipR21Process',`.

In `packages/frontend/src/pages/infra-board/rail-stats.test.ts`, change line 46 from `processDefinitionKey: 'RipPhase1Process',` to `processDefinitionKey: 'RipR21Process',`, and line 208 from `const groups = beheerRailPhaseGroups({}, new Set(['RipPhase1Process']));` to `const groups = beheerRailPhaseGroups({}, new Set(['RipR21Process']));`.

In `packages/frontend/src/pages/infra-board/rip-model.test.ts`, change line 103's comment from `// response captured against a live RipPhase1Process instance during` to `// response captured against a live RipR21Process instance during`.

In `packages/frontend/src/pages/infra-board/rip-phase-counts.test.ts`, change line 73 from `const raw = { RipPhase1Process: { wip: 3, gereed: 7 } };` to `const raw = { RipR21Process: { wip: 3, gereed: 7 } };`.

In `packages/frontend/src/pages/infra-board/rip-phases.catalog.test.ts`, change line 47 from `expect(ripPhaseByCode('R2.1')?.processDefinitionKey).toBe('RipPhase1Process');` to `expect(ripPhaseByCode('R2.1')?.processDefinitionKey).toBe('RipR21Process');`; change line 87 from `expect(getPhaseDeployStatus(withKey, new Set(['RipPhase1Process']))).toBe('gedeployed');` to `expect(getPhaseDeployStatus(withKey, new Set(['RipR21Process']))).toBe('gedeployed');`; change line 99 from `expect(getPhaseDeployStatus(beyond, new Set(['RipPhase1Process']))).toBe('onbekend');` to `expect(getPhaseDeployStatus(beyond, new Set(['RipR21Process']))).toBe('onbekend');`.

In `packages/frontend/src/pages/InfraBoardDashboard.test.tsx`, change line 73 from `data: { deployedKeys: ['RipPhase1Process'] },` to `data: { deployedKeys: ['RipR21Process'] },`.

In `packages/frontend/src/services/api.test.ts`, change line 459 from `HttpResponse.json({ success: true, data: { deployedKeys: ['RipPhase1Process'] } })` to `HttpResponse.json({ success: true, data: { deployedKeys: ['RipR21Process'] } })`; line 464 from `data: { deployedKeys: ['RipPhase1Process'] },` to `data: { deployedKeys: ['RipR21Process'] },`; line 473 from `data: { counts: { RipPhase1Process: { wip: 3, gereed: 7 } } },` to `data: { counts: { RipR21Process: { wip: 3, gereed: 7 } } },`; line 479 from `data: { counts: { RipPhase1Process: { wip: 3, gereed: 7 } } },` to `data: { counts: { RipR21Process: { wip: 3, gereed: 7 } } },`.

In `packages/frontend/src/services/infra.api.test.ts`, change line 34 from `processDefinitionId: 'RipPhase1Process:1:def',` to `processDefinitionId: 'RipR21Process:1:def',`; line 35 from `processDefinitionKey: 'RipPhase1Process',` to `processDefinitionKey: 'RipR21Process',`; line 170 from `data: { deployedKeys: ['RipPhase1Process'] },` to `data: { deployedKeys: ['RipR21Process'] },`; line 178 from `expect(result.current.data).toEqual({ deployedKeys: ['RipPhase1Process'] });` to `expect(result.current.data).toEqual({ deployedKeys: ['RipR21Process'] });`; line 201 from `data: { counts: { RipPhase1Process: { wip: 3, gereed: 7 } } },` to `data: { counts: { RipR21Process: { wip: 3, gereed: 7 } } },`; line 210 from `counts: { RipPhase1Process: { wip: 3, gereed: 7 } },` to `counts: { RipR21Process: { wip: 3, gereed: 7 } },`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/frontend && npx jest --testPathPattern "FaseladderOverview|PhaseDetail|ProjectDetail|rail-stats|rip-model|rip-phase-counts|rip-phases.catalog|InfraBoardDashboard.test|services/api.test|services/infra.api.test"`
Expected: FAIL across all of the above — source still emits/expects `'RipPhase1Process'`.

- [ ] **Step 3: Rename in source**

In `packages/frontend/src/components/InfraBoardDashboard/PhaseDetail.tsx`, change line 233 from:

```typescript
const res = await businessApi.process.start('RipPhase1Process', {});
```

to:

```typescript
const res = await businessApi.process.start('RipR21Process', {});
```

In `packages/frontend/src/services/infra.api.ts`, change line 7's doc comment from `* RipPhase1Process tasks/instances flow straight in.` to `* RipR21Process tasks/instances flow straight in.`; change line 136 from:

```typescript
  RipPhase1Process: 'RIP Fase 1 — R2.1 Projectplan Planvoorbereiding',
```

to:

```typescript
  RipR21Process: 'RIP Fase 1 — R2.1 Projectplan Planvoorbereiding',
```

(inside the `PROCESS_DISPLAY_NAMES` object — `INFRA_PROCESS_KEYS` at line 145 is `new Set(Object.keys(PROCESS_DISPLAY_NAMES))`, auto-derived, no separate edit needed there.)

In `packages/frontend/src/pages/infra-board/rip-phases.catalog.ts`, change line 72 from:

```typescript
    bron: 'RipPhase1Process.bpmn · 11 taken · 8 formulieren · 3 documenten',
```

to:

```typescript
    bron: 'RipR21Process.bpmn · 11 taken · 8 formulieren · 3 documenten',
```

In `packages/frontend/src/pages/infra-board/rip-model.ts`, change line 5's doc comment from `* deployed BPMN \`RipPhase1Process\` ("RIP Fase 1 — R2.1 Projectplan`to`\* deployed BPMN \`RipR21Process\` ("RIP Fase 1 — R2.1 Projectplan`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd packages/frontend && npx jest --testPathPattern "FaseladderOverview|PhaseDetail|ProjectDetail|rail-stats|rip-model|rip-phase-counts|rip-phases.catalog|InfraBoardDashboard.test|services/api.test|services/infra.api.test"`
Expected: PASS.

- [ ] **Step 5: Confirm no non-historical reference remains**

Run: `grep -rln "RipPhase1Process" packages/ | grep -v changelog-data.ts`
Expected: empty output (only `packages/frontend/src/pages/changelog-data.ts` still references the old name, which is correct — historical release notes, left untouched per Global Constraints).

- [ ] **Step 6: Run the full frontend test suite**

Run: `cd packages/frontend && npx jest`
Expected: PASS, no regressions.

- [ ] **Step 7: Commit**

```bash
git add packages/frontend/src/components/InfraBoardDashboard/PhaseDetail.tsx packages/frontend/src/components/InfraBoardDashboard/PhaseDetail.test.tsx packages/frontend/src/components/InfraBoardDashboard/FaseladderOverview.test.tsx packages/frontend/src/components/InfraBoardDashboard/ProjectDetail.test.tsx packages/frontend/src/services/infra.api.ts packages/frontend/src/services/infra.api.test.ts packages/frontend/src/services/api.test.ts packages/frontend/src/pages/infra-board/rip-phases.catalog.ts packages/frontend/src/pages/infra-board/rip-phases.catalog.test.ts packages/frontend/src/pages/infra-board/rip-model.ts packages/frontend/src/pages/infra-board/rip-model.test.ts packages/frontend/src/pages/infra-board/rail-stats.test.ts packages/frontend/src/pages/infra-board/rip-phase-counts.test.ts packages/frontend/src/pages/InfraBoardDashboard.test.tsx
git commit -m "refactor: rename RipPhase1Process to RipR21Process (frontend)"
```

---

## Task 5: RBA E2E — required-processes manifest and `global-setup.ts` verification

**Files:**

- Create: `packages/frontend/e2e/helpers/required-processes.ts`
- Modify: `packages/frontend/e2e/global-setup.ts`

**Interfaces:**

- Consumes: the five `(processDefinitionKey, tenantId)` pairs from Section B of the spec, using `RipR21Process` (Task 3/4's renamed key).
- Produces: `REQUIRED_PROCESSES: RequiredProcess[]` (exported from `required-processes.ts`) and `verifyRequiredProcesses(): Promise<string[]>` (exported from `required-processes.ts`, returns an array of human-readable problem strings, empty when everything matches) — consumed by `global-setup.ts`.

No existing automated test exercises `global-setup.ts` (it isn't a Jest-testable unit — it's a Playwright global-setup hook that runs against a real, running stack). Verification for this task is manual, per Step 3/4 below, matching this project's own established pattern for `global-setup.ts` (no unit test file exists for it today either).

- [ ] **Step 1: Create the required-processes manifest**

Create `packages/frontend/e2e/helpers/required-processes.ts`:

```typescript
export interface RequiredProcess {
  processDefinitionKey: string;
  tenantId: string;
}

/**
 * The five process-definition-key + tenant-id pairs ronl-business-api's E2E
 * suite requires to be deployed on Operaton before tests run. Kept in sync
 * with linked-data-explorer's own e2e-fixtures/manifest.json by hand — see
 * docs/superpowers/specs/2026-08-14-tenant-mandatory-adoption-design.md
 * Section C for why this is two small manifests rather than one shared file.
 */
export const REQUIRED_PROCESSES: RequiredProcess[] = [
  { processDefinitionKey: 'AwbShellProcess', tenantId: 'flevoland' },
  { processDefinitionKey: 'TreeFellingPermitSubProcess', tenantId: 'flevoland' },
  { processDefinitionKey: 'RipR21Process', tenantId: 'flevoland' },
  { processDefinitionKey: 'AwbZorgtoeslagProcess', tenantId: 'toeslagen' },
  { processDefinitionKey: 'ZorgtoeslagProvisionalSubProcess', tenantId: 'toeslagen' },
];

const OPERATON_BASE_URL = 'http://localhost:8081/engine-rest';

/**
 * Queries Operaton directly (same base URL the backend itself uses in dev —
 * see packages/backend/.env.development) for the latest version of each
 * required process-definition key, and checks its deployed tenantId matches
 * what this suite expects. Returns one human-readable problem string per
 * mismatch/missing key; an empty array means the bundle is ready.
 */
export async function verifyRequiredProcesses(): Promise<string[]> {
  const keys = REQUIRED_PROCESSES.map((p) => p.processDefinitionKey).join(',');
  let deployed: Array<{ key: string; tenantId: string | null }>;
  try {
    const res = await fetch(
      `${OPERATON_BASE_URL}/process-definition?keysIn=${encodeURIComponent(keys)}&latestVersion=true`
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    deployed = (await res.json()) as Array<{ key: string; tenantId: string | null }>;
  } catch (err) {
    return [
      `- Could not query Operaton at ${OPERATON_BASE_URL} to verify required processes: ${
        err instanceof Error ? err.message : 'Unknown error'
      }`,
    ];
  }

  const byKey = new Map(deployed.map((d) => [d.key, d.tenantId]));
  const problems: string[] = [];
  for (const { processDefinitionKey, tenantId } of REQUIRED_PROCESSES) {
    if (!byKey.has(processDefinitionKey)) {
      problems.push(`- '${processDefinitionKey}' is not deployed on Operaton`);
      continue;
    }
    const actualTenantId = byKey.get(processDefinitionKey);
    if (actualTenantId !== tenantId) {
      problems.push(
        `- '${processDefinitionKey}' is deployed but with tenant-id '${actualTenantId ?? '(none)'}', expected '${tenantId}'`
      );
    }
  }
  return problems;
}
```

(Matches the existing `packages/frontend/e2e/helpers/operaton-cleanup.ts`'s convention of a hardcoded per-file `OPERATON_BASE_URL` constant and direct `fetch` calls, rather than an axios client.)

- [ ] **Step 2: Extend `global-setup.ts`**

In `packages/frontend/e2e/global-setup.ts`, add the import at the top of the file (after the existing constants, before `checkReachable`):

```typescript
import { verifyRequiredProcesses } from './helpers/required-processes';
```

Then change the `globalSetup` function from:

```typescript
export default async function globalSetup() {
  const [frontendUp, backendUp, ldeUp] = await Promise.all([
    checkReachable(FRONTEND_URL),
    checkReachable(BACKEND_HEALTH_URL),
    checkReachable(LDE_HEALTH_URL),
  ]);

  const missing: string[] = [];
  if (!frontendUp) missing.push(`- Frontend not reachable at ${FRONTEND_URL}`);
  if (!backendUp) missing.push(`- Backend not reachable at ${BACKEND_HEALTH_URL}`);
  if (!ldeUp) missing.push(`- LDE backend not reachable at ${LDE_HEALTH_URL}`);

  if (missing.length > 0) {
    throw new Error(
      [
        '',
        'E2E preconditions not met — the dev stack must already be running.',
        ...missing,
        '',
        'Start it yourself first:',
        '  docker compose up -d          (repo root — Keycloak/Postgres/Redis)',
        '  npm run dev                   (repo root — frontend :5173 + backend :3002)',
        '  npm run dev:backend           (linked-data-explorer repo root — LDE backend :3001)',
        '',
        'See docs/TESTING-FRONTEND-UI.md for the full environment setup.',
        '',
      ].join('\n')
    );
  }
}
```

to:

```typescript
export default async function globalSetup() {
  const [frontendUp, backendUp, ldeUp] = await Promise.all([
    checkReachable(FRONTEND_URL),
    checkReachable(BACKEND_HEALTH_URL),
    checkReachable(LDE_HEALTH_URL),
  ]);

  const missing: string[] = [];
  if (!frontendUp) missing.push(`- Frontend not reachable at ${FRONTEND_URL}`);
  if (!backendUp) missing.push(`- Backend not reachable at ${BACKEND_HEALTH_URL}`);
  if (!ldeUp) missing.push(`- LDE backend not reachable at ${LDE_HEALTH_URL}`);

  if (missing.length > 0) {
    throw new Error(
      [
        '',
        'E2E preconditions not met — the dev stack must already be running.',
        ...missing,
        '',
        'Start it yourself first:',
        '  docker compose up -d          (repo root — Keycloak/Postgres/Redis)',
        '  npm run dev                   (repo root — frontend :5173 + backend :3002)',
        '  npm run dev:backend           (linked-data-explorer repo root — LDE backend :3001)',
        '',
        'See docs/TESTING-FRONTEND-UI.md for the full environment setup.',
        '',
      ].join('\n')
    );
  }

  const processProblems = await verifyRequiredProcesses();
  if (processProblems.length > 0) {
    throw new Error(
      [
        '',
        'E2E preconditions not met — the required tenant-scoped process bundle is not deployed correctly.',
        ...processProblems,
        '',
        "Deploy the bundle yourself first, manually, via linked-data-explorer's BPMN Modeler:",
        "  1. Open linked-data-explorer's BPMN Modeler (npm run dev:backend + npm run dev, LDE repo)",
        '  2. Import each file from linked-data-explorer/e2e-fixtures/<tenant>/',
        '  3. Set the Organization field to the tenant shown above, click Deploy',
        '',
        'See linked-data-explorer/e2e-fixtures/manifest.json for the full fixture list.',
        '',
      ].join('\n')
    );
  }
}
```

- [ ] **Step 3: Manually verify the fail-fast path**

With the dev stack running but the new bundle not yet deployed (its current state — Task 7 hasn't run yet), run: `cd packages/frontend && npx playwright test --config=e2e/playwright.config.ts tenant-isolation.spec.ts` (the `--config` flag is required — `playwright.config.ts` lives under `e2e/`, not the package root, and without it Playwright silently skips `globalSetup` entirely and fails later for an unrelated reason instead of exercising the new verification step; matches this repo's own `npm run test:e2e` script, confirmed in `packages/frontend/package.json`)
Expected: fails immediately in `globalSetup` with the new "required tenant-scoped process bundle is not deployed correctly" message, listing `RipR21Process` (not yet deployed under that new key) and any other mismatches — not a confusing failure deep inside the spec.

- [ ] **Step 4: Commit**

```bash
git add packages/frontend/e2e/helpers/required-processes.ts packages/frontend/e2e/global-setup.ts
git commit -m "feat: verify the required tenant-scoped process bundle in E2E global-setup"
```

---

## Task 6: LDE — assemble the `e2e-fixtures/` bundle and manifest-integrity test

> **Working directory for this task:** `linked-data-explorer` (sibling repo), not `ronl-business-api`. Branch `feat/tenant-mandatory-deploy` (already contains the mandatory-organization deploy work this plan adopts).

**Files:**

- Create: `linked-data-explorer/e2e-fixtures/flevoland/` (21 files — see Step 2)
- Create: `linked-data-explorer/e2e-fixtures/toeslagen/` (5 files — see Step 2)
- Create: `linked-data-explorer/e2e-fixtures/manifest.json`
- Test: `linked-data-explorer/packages/backend/src/e2e-fixtures.test.ts`

**Interfaces:**

- Consumes: the string `'RipR21Process'` (must match Task 3/4's renamed key exactly — this task assembles the actual BPMN carrying that id) and the five `(processDefinitionKey, tenantId)` pairs from Task 5's `REQUIRED_PROCESSES` (must match exactly, or `global-setup.ts`'s verification in Task 5/8 will report a mismatch even after a correct deploy).
- Produces: nothing consumed by later code — this is the deploy source for Task 7's manual step.

`e2e-fixtures/` supersedes two pre-existing, already-diverged locations for E2E purposes: `AwbShellProcess`, `TreeFellingPermitSubProcess`, `AwbZorgtoeslagProcess`, and `ZorgtoeslagProvisionalSubProcess` are seeded unchanged from `packages/frontend/public/examples/<tenant>/` (confirmed freshest copy). `RipR21Process` has no existing canonical location — it's assembled from two divergent draft folders: `examples/organizations/flevoland/rip-phase1-swimlanes/RipPhase1Process.bpmn` (the current BPMN — correct name, correct swimlanes, no DMN reference) plus its own 5 forms + 3 documents, merged with the 7 forms `rip-phase1-swimlanes/` is missing but that exist unchanged in the sibling `examples/organizations/flevoland/rip-phase1/` folder (confirmed by diffing `camunda:formRef`s against both folders' actual file listings).

- [ ] **Step 1: Write the failing manifest-integrity test**

Create `packages/backend/src/e2e-fixtures.test.ts`:

```typescript
import fs from 'fs';
import path from 'path';

const FIXTURES_ROOT = path.join(__dirname, '..', '..', '..', 'e2e-fixtures');
const MANIFEST_PATH = path.join(FIXTURES_ROOT, 'manifest.json');

interface FixtureEntry {
  processDefinitionKey: string;
  bpmn: string;
  forms: string[];
  documents: string[];
  source: string;
  /** Sub-processes this shell calls via a BPMN callActivity — deployed together
   * with the shell in one LDE Modeler action, not as separate deploys. */
  subProcesses?: FixtureEntry[];
}

type Manifest = Record<string, FixtureEntry[]>;

function readManifest(): Manifest {
  const raw = fs.readFileSync(MANIFEST_PATH, 'utf8');
  return JSON.parse(raw) as Manifest;
}

/** Flattens each tenant's shell entries and their nested subProcesses into one list. */
function allEntries(entries: FixtureEntry[]): FixtureEntry[] {
  return entries.flatMap((entry) => [entry, ...(entry.subProcesses ?? [])]);
}

describe('e2e-fixtures/manifest.json', () => {
  it('exists and parses as JSON', () => {
    expect(() => readManifest()).not.toThrow();
  });

  it('every declared file exists under its tenant directory, including nested subProcesses', () => {
    const manifest = readManifest();
    for (const [tenant, entries] of Object.entries(manifest)) {
      for (const entry of allEntries(entries)) {
        for (const file of [entry.bpmn, ...entry.forms, ...entry.documents]) {
          const filePath = path.join(FIXTURES_ROOT, tenant, file);
          expect(fs.existsSync(filePath)).toBe(true);
        }
      }
    }
  });

  it("every entry's BPMN id matches its declared processDefinitionKey, including nested subProcesses", () => {
    const manifest = readManifest();
    for (const [tenant, entries] of Object.entries(manifest)) {
      for (const entry of allEntries(entries)) {
        const bpmnPath = path.join(FIXTURES_ROOT, tenant, entry.bpmn);
        const xml = fs.readFileSync(bpmnPath, 'utf8');
        expect(xml).toMatch(new RegExp(`<bpmn:process\\s+id="${entry.processDefinitionKey}"`));
      }
    }
  });

  it("a shell's calledElement references match its nested subProcess keys", () => {
    const manifest = readManifest();
    for (const [tenant, entries] of Object.entries(manifest)) {
      for (const shell of entries) {
        if (!shell.subProcesses?.length) continue;
        const bpmnPath = path.join(FIXTURES_ROOT, tenant, shell.bpmn);
        const xml = fs.readFileSync(bpmnPath, 'utf8');
        for (const sub of shell.subProcesses) {
          expect(xml).toMatch(new RegExp(`calledElement="${sub.processDefinitionKey}"`));
        }
      }
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/backend && npx jest src/e2e-fixtures.test.ts`
Expected: FAIL — `e2e-fixtures/manifest.json` doesn't exist yet (`ENOENT`).

- [ ] **Step 3: Assemble `e2e-fixtures/flevoland/`**

From the repo root, run (Bash/POSIX; adjust for PowerShell if working there):

```bash
mkdir -p e2e-fixtures/flevoland e2e-fixtures/toeslagen

# Seeded unchanged from public/examples/ (proven-freshest, already E2E-proven):
cp packages/frontend/public/examples/flevoland/AwbShellProcess.bpmn e2e-fixtures/flevoland/
cp packages/frontend/public/examples/flevoland/kapvergunning-start.form e2e-fixtures/flevoland/
cp packages/frontend/public/examples/flevoland/awb-notify-applicant.form e2e-fixtures/flevoland/
cp packages/frontend/public/examples/flevoland/TreeFellingPermitSubProcess.bpmn e2e-fixtures/flevoland/
cp packages/frontend/public/examples/flevoland/tree-felling-review.form e2e-fixtures/flevoland/

# RipR21Process: BPMN + its own forms/documents from the swimlanes draft:
cp examples/organizations/flevoland/rip-phase1-swimlanes/RipPhase1Process.bpmn e2e-fixtures/flevoland/RipR21Process.bpmn
cp examples/organizations/flevoland/rip-phase1-swimlanes/rip-kwaliteit-verbetering.form e2e-fixtures/flevoland/
cp examples/organizations/flevoland/rip-phase1-swimlanes/rip-planning.form e2e-fixtures/flevoland/
cp examples/organizations/flevoland/rip-phase1-swimlanes/rip-pdp-aanvullen.form e2e-fixtures/flevoland/
cp examples/organizations/flevoland/rip-phase1-swimlanes/rip-uitvoer-intake.form e2e-fixtures/flevoland/
cp examples/organizations/flevoland/rip-phase1-swimlanes/rip-overleg-vo.form e2e-fixtures/flevoland/
cp examples/organizations/flevoland/rip-phase1-swimlanes/rip-intake-report.document e2e-fixtures/flevoland/
cp examples/organizations/flevoland/rip-phase1-swimlanes/rip-pdp.document e2e-fixtures/flevoland/
cp examples/organizations/flevoland/rip-phase1-swimlanes/rip-psu-report.document e2e-fixtures/flevoland/

# RipR21Process: the 7 forms unchanged between the two drafts, missing from swimlanes/:
cp examples/organizations/flevoland/rip-phase1/rip-intake.form e2e-fixtures/flevoland/
cp examples/organizations/flevoland/rip-phase1/rip-intake-meeting.form e2e-fixtures/flevoland/
cp examples/organizations/flevoland/rip-phase1/rip-risk-file.form e2e-fixtures/flevoland/
cp examples/organizations/flevoland/rip-phase1/rip-intake-report.form e2e-fixtures/flevoland/
cp examples/organizations/flevoland/rip-phase1/rip-psu-organize.form e2e-fixtures/flevoland/
cp examples/organizations/flevoland/rip-phase1/rip-approval.form e2e-fixtures/flevoland/
cp examples/organizations/flevoland/rip-phase1/rip-psu-execution.form e2e-fixtures/flevoland/

# Rename the process id/processRef inside the copied BPMN (2 occurrences only):
sed -i 's/RipPhase1Process/RipR21Process/g' e2e-fixtures/flevoland/RipR21Process.bpmn
```

Verify the rename left exactly the two expected occurrences and no leftover old name:

```bash
grep -c 'RipR21Process' e2e-fixtures/flevoland/RipR21Process.bpmn   # expect 2
grep -c 'RipPhase1Process' e2e-fixtures/flevoland/RipR21Process.bpmn  # expect 0
```

- [ ] **Step 4: Assemble `e2e-fixtures/toeslagen/`**

```bash
cp packages/frontend/public/examples/toeslagen/AwbZorgtoeslagProcess.bpmn e2e-fixtures/toeslagen/
cp packages/frontend/public/examples/toeslagen/zorgtoeslag-provisional-start.form e2e-fixtures/toeslagen/
cp packages/frontend/public/examples/toeslagen/zorgtoeslag-notify-applicant.form e2e-fixtures/toeslagen/
cp packages/frontend/public/examples/toeslagen/ZorgtoeslagProvisionalSubProcess.bpmn e2e-fixtures/toeslagen/
cp packages/frontend/public/examples/toeslagen/zorgtoeslag-provisional-review.form e2e-fixtures/toeslagen/
```

(`ZorgtoeslagFinalSubProcess.bpmn` and `zorgtoeslag-final-review.form` are deliberately excluded — see Global Constraints / spec Section B: the E2E suite never exercises the final decision step.)

- [ ] **Step 5: Write `e2e-fixtures/manifest.json`**

Create `e2e-fixtures/manifest.json`:

```json
{
  "flevoland": [
    {
      "processDefinitionKey": "AwbShellProcess",
      "bpmn": "AwbShellProcess.bpmn",
      "forms": ["kapvergunning-start.form", "awb-notify-applicant.form"],
      "documents": ["example_treefelling_beschikking.document"],
      "source": "packages/frontend/public/examples/flevoland/AwbShellProcess.bpmn (seeded, unchanged); example_treefelling_beschikking.document serialized from TREE_FELLING_BESCHIKKING in packages/frontend/src/components/DocumentComposer/defaultTemplates.ts — the BPMN's ronl:documentRef had no matching .document file anywhere in the repo until this fix",
      "subProcesses": [
        {
          "processDefinitionKey": "TreeFellingPermitSubProcess",
          "bpmn": "TreeFellingPermitSubProcess.bpmn",
          "forms": ["tree-felling-review.form"],
          "documents": [],
          "source": "packages/frontend/public/examples/flevoland/TreeFellingPermitSubProcess.bpmn (seeded, unchanged); called via AwbShellProcess's callActivity calledElement=\"TreeFellingPermitSubProcess\" — deployed together with the shell in one LDE Modeler action, not separately"
        }
      ]
    },
    {
      "processDefinitionKey": "RipR21Process",
      "bpmn": "RipR21Process.bpmn",
      "forms": [
        "rip-intake.form",
        "rip-kwaliteit-verbetering.form",
        "rip-intake-meeting.form",
        "rip-risk-file.form",
        "rip-planning.form",
        "rip-intake-report.form",
        "rip-psu-organize.form",
        "rip-pdp-aanvullen.form",
        "rip-uitvoer-intake.form",
        "rip-approval.form",
        "rip-psu-execution.form",
        "rip-overleg-vo.form"
      ],
      "documents": ["rip-intake-report.document", "rip-pdp.document", "rip-psu-report.document"],
      "source": "merged from examples/organizations/flevoland/rip-phase1-swimlanes/ (BPMN + 5 forms + 3 documents) and examples/organizations/flevoland/rip-phase1/ (7 forms unchanged between drafts); renamed RipPhase1Process -> RipR21Process"
    }
  ],
  "toeslagen": [
    {
      "processDefinitionKey": "AwbZorgtoeslagProcess",
      "bpmn": "AwbZorgtoeslagProcess.bpmn",
      "forms": ["zorgtoeslag-provisional-start.form", "zorgtoeslag-notify-applicant.form"],
      "documents": ["example_zorgtoeslag_provisional_beschikking.document"],
      "source": "packages/frontend/public/examples/toeslagen/AwbZorgtoeslagProcess.bpmn (seeded, unchanged); example_zorgtoeslag_provisional_beschikking.document serialized from ZORGTOESLAG_PROVISIONAL_BESCHIKKING in packages/frontend/src/components/DocumentComposer/defaultTemplates.ts — the BPMN's ronl:documentRef had no matching .document file anywhere in the repo until this fix",
      "subProcesses": [
        {
          "processDefinitionKey": "ZorgtoeslagProvisionalSubProcess",
          "bpmn": "ZorgtoeslagProvisionalSubProcess.bpmn",
          "forms": ["zorgtoeslag-provisional-review.form"],
          "documents": [],
          "source": "packages/frontend/public/examples/toeslagen/ZorgtoeslagProvisionalSubProcess.bpmn (seeded, unchanged); called via AwbZorgtoeslagProcess's callActivity calledElement=\"ZorgtoeslagProvisionalSubProcess\" — deployed together with the shell in one LDE Modeler action, not separately"
        }
      ]
    }
  ]
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd packages/backend && npx jest src/e2e-fixtures.test.ts`
Expected: PASS — all 3 tests green (manifest parses, every declared file exists, every BPMN `id` matches its manifest key — including `RipR21Process.bpmn`'s post-`sed`-rename `id`).

- [ ] **Step 7: Run the full LDE backend test suite**

Run: `cd packages/backend && npx jest`
Expected: PASS, no regressions.

- [ ] **Step 8: Commit**

```bash
git add e2e-fixtures/ packages/backend/src/e2e-fixtures.test.ts
git commit -m "feat: assemble e2e-fixtures test bundle with manifest and integrity test"
```

---

## Task 7: Manual redeploy checkpoint (STOP — human action required)

This task has no code changes and cannot be executed by an implementer subagent. It is a deliberate gate matching the spec's expected implementation sequence: steps 1-6 above are provably green without a live Operaton redeploy; `ronl-business-api`'s E2E suite is expected to **fail** at this point (Task 5's `global-setup.ts` verification correctly reports `RipR21Process` and the other four keys as not-yet-deployed-under-the-right-tenant — confirmed manually in Task 5 Step 3). Task 8 cannot proceed until this task is done.

- [ ] **Step 1: Stop and hand off to the user**

Report to the user: "Tasks 1-6 are complete, committed, and green. `ronl-business-api`'s E2E suite will fail at `global-setup.ts` until the bundle below is deployed. Please deploy manually via LDE's BPMN Modeler, then confirm, so Task 8 (final E2E verification) can proceed."

- [ ] **Step 2 (user, manual, outside this plan): Deploy the processes via LDE's BPMN Modeler, in three grouped actions**

`AwbShellProcess` calls `TreeFellingPermitSubProcess` via a BPMN callActivity (`calledElement="TreeFellingPermitSubProcess"`), and `AwbZorgtoeslagProcess` calls `ZorgtoeslagProvisionalSubProcess` the same way (`calledElement="ZorgtoeslagProvisionalSubProcess"`) — confirmed by reading both shells' BPMN directly. LDE's BPMN Modeler auto-detects this shell/sub-process relationship from `calledElement` when both files are imported into the same Modeler session (`BpmnModeler.tsx`'s `calledElement` scan), and `deployProcess` bundles the shell with its detected sub-process(es) into **one** `/deployment/create` call — so each pair below is **one** deploy action, not two, and both members of a pair always land under the same tenant-id:

Open LDE's BPMN Modeler (`npm run dev:backend` + `npm run dev` in the LDE repo). For each action: import every listed file into the same Modeler session (so the shell/sub-process relationship is detected), set the Organization field once, click Deploy once.

| #   | Action                                                              | Tenant    | Files to import together                                                                                            |
| --- | ------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------- |
| 1   | Deploy `AwbShellProcess` + `TreeFellingPermitSubProcess`            | flevoland | `e2e-fixtures/flevoland/AwbShellProcess.bpmn`, `e2e-fixtures/flevoland/TreeFellingPermitSubProcess.bpmn`            |
| 2   | Deploy `RipR21Process`                                              | flevoland | `e2e-fixtures/flevoland/RipR21Process.bpmn` (no callActivity — standalone, confirmed by grep)                       |
| 3   | Deploy `AwbZorgtoeslagProcess` + `ZorgtoeslagProvisionalSubProcess` | toeslagen | `e2e-fixtures/toeslagen/AwbZorgtoeslagProcess.bpmn`, `e2e-fixtures/toeslagen/ZorgtoeslagProvisionalSubProcess.bpmn` |

Each action's forms and documents (see `e2e-fixtures/manifest.json`'s per-entry `forms`/`documents` arrays, including each shell's nested `subProcesses` entry) live alongside their BPMN in the same `e2e-fixtures/<tenant>/` folder — confirm the Modeler picks them up automatically as part of the same deploy.

- [ ] **Step 3 (user, manual): Confirm back to proceed**

Once all five are deployed, tell the implementer/agent to proceed to Task 8.

---

## Task 8: Final E2E verification against the real tenant-scoped bundle

**Files:** none modified — verification only.

**Interfaces:**

- Consumes: the five processes deployed in Task 7, matching Task 5's `REQUIRED_PROCESSES` and Task 6's `manifest.json` exactly.

- [ ] **Step 1: Confirm `global-setup.ts` now passes**

Run: `cd packages/frontend && npx playwright test --config=e2e/playwright.config.ts tenant-isolation.spec.ts` (the `--config` flag is required — without it Playwright skips `globalSetup` entirely; see Task 5's note)
Expected: `globalSetup` no longer throws — the suite proceeds past setup into the actual spec.

- [ ] **Step 2: Run the full E2E suite**

Run: `cd packages/frontend && npm run test:e2e`
Expected: `caseworker-journey.spec.ts`, `zorgtoeslag-journey.spec.ts`, and `tenant-isolation.spec.ts` all pass against the real tenant-scoped bundle — the whole start → task → complete path exercised through Operaton's real tenant-scoped endpoints, not unit-level mocks.

- [ ] **Step 3: Review `tenant-isolation.spec.ts`'s existing assertions**

Per the spec's explicit deferral: read `tenant-isolation.spec.ts` now that real tenant-scoped data (`flevoland` and `toeslagen`, both genuinely tenant-id-carrying) is live. Decide whether its existing assertions already cover genuine Operaton-level tenant isolation (likely, since it was written to test what it could with the `municipality`-variable approximation and may now simply gain a stronger guarantee for free) or whether a new assertion is warranted (e.g., explicitly asserting a `flevoland`-scoped board query never surfaces a `toeslagen` instance now that `tenantIdIn` filtering — Task 2 — is live). Make the change if warranted; if the existing assertions already suffice, note that explicitly rather than silently skipping this step.

- [ ] **Step 4: If Step 3 produced a change, run the affected spec again**

Run: `cd packages/frontend && npx playwright test --config=e2e/playwright.config.ts tenant-isolation.spec.ts`
Expected: PASS.

- [ ] **Step 5: If Step 3 produced a change, commit**

```bash
git add packages/frontend/e2e/tenant-isolation.spec.ts
git commit -m "test: strengthen tenant-isolation assertions against the real tenant-scoped bundle"
```

(Skip this step if Step 3 concluded no change was warranted.)

- [ ] **Step 6: Report completion**

Report to the user: all 5 processes deployed and verified via `global-setup.ts`; full E2E suite green; Gap 1/Gap 2 fixes proven against a real tenant-scoped Operaton instance, not just unit mocks; rename complete end-to-end. Proceed to `superpowers:finishing-a-development-branch` for both repos' branches (`feat/tenant-mandatory-adoption` in `ronl-business-api`, `feat/tenant-mandatory-deploy` in `linked-data-explorer`).

**Actual outcome (2026-08-14):** Task 8 ran exactly as written and correctly stopped at BLOCKED rather than reporting false success — the E2E suite failed 3/12 (`caseworker-journey.spec.ts`, `tenant-isolation.spec.ts`, `zorgtoeslag-journey.spec.ts`), revealing two genuine regressions this plan's earlier tasks didn't anticipate because they only become visible against a real, live, two-tenant Operaton bundle:

- **Bug A:** `startProcess`/`getDeployedStartForm` (Task 1's Gap 1 fix) scope the Operaton lookup to `req.user.tenantId` — the _citizen's own_ tenant — not the process's actual deployed tenant. Breaks `AwbZorgtoeslagProcess`, which is by-design cross-tenant (deployed only under `toeslagen`, callable by citizens of any tenant).
- **Bug B:** the DMN tables `AwbShellProcess`/`TreeFellingPermitSubProcess`/`AwbZorgtoeslagProcess`/`ZorgtoeslagProvisionalSubProcess` depend on are deployed untenanted, but Operaton requires an _exact_ tenant match by default to resolve a business-rule-task's decision reference — confirmed empirically (see Task 10) via a live spike against this repo's own Operaton instance. This doesn't invalidate the "DMN stays tenant-agnostic" architecture decision from brainstorming; it means the BPMN side needs one explicit attribute per business-rule-task to make Operaton honor it once the _calling process_ is tenant-scoped.

Tasks 9-13 below fix both and re-run this task's own verification to completion. Step 6 above is superseded by Task 13's completion report.

---

## Task 9: Fix Bug A — discover the process's real deployed tenant instead of assuming the citizen's

**Files:**

- Modify: `packages/backend/src/services/operaton.service.ts` (`startProcess`, `getDeployedStartForm`; add a new private `resolveDeployedTenant` helper)
- Test: `packages/backend/src/services/operaton.service.test.ts`

**Interfaces:**

- Produces: `private resolveDeployedTenant(processKey: string): Promise<string | null>` on `OperatonService`.
- Consumes: nothing from Tasks 1-8 beyond their already-landed state; this task revises `startProcess`/`getDeployedStartForm`'s internals, not their public signatures (both keep the exact same parameter list as Task 1 left them).

- [ ] **Step 1: Write the failing tests**

Add to `operaton.service.test.ts`, a new `describe('resolveDeployedTenant', ...)` block (place it directly before `describe('startProcess', ...)`):

```typescript
describe('resolveDeployedTenant', () => {
  it('returns the tenantId of the deployed definition', async () => {
    mockClient.get.mockResolvedValue({ data: [{ tenantId: 'toeslagen' }] });
    // @ts-expect-error -- private method, exercised directly for this unit test
    await expect(svc.resolveDeployedTenant('AwbZorgtoeslagProcess')).resolves.toBe('toeslagen');
    expect(mockClient.get).toHaveBeenCalledWith('/process-definition', {
      params: { key: 'AwbZorgtoeslagProcess', latestVersion: true },
    });
  });

  it('prefers a tenant-scoped row over a coexisting untenanted legacy row for the same key', async () => {
    mockClient.get.mockResolvedValue({
      data: [{ tenantId: null }, { tenantId: 'flevoland' }],
    });
    // @ts-expect-error -- private method
    await expect(svc.resolveDeployedTenant('AwbShellProcess')).resolves.toBe('flevoland');
  });

  it('returns null when the key is not deployed at all', async () => {
    mockClient.get.mockResolvedValue({ data: [] });
    // @ts-expect-error -- private method
    await expect(svc.resolveDeployedTenant('NotDeployed')).resolves.toBeNull();
  });

  it('returns null on lookup failure rather than throwing', async () => {
    mockClient.get.mockRejectedValue(new Error('network down'));
    // @ts-expect-error -- private method
    await expect(svc.resolveDeployedTenant('AwbShellProcess')).resolves.toBeNull();
  });
});
```

Add a new test inside `describe('startProcess', ...)`, after the existing `'translates a missing-deployment 404 into a friendly Dutch message'` test:

```typescript
it("scopes the start call to the process's actual deployed tenant, not the citizen's own", async () => {
  mockClient.get.mockResolvedValue({ data: [{ tenantId: 'toeslagen' }] });
  mockClient.post.mockResolvedValue({ data: { id: 'pi1' } });

  await svc.startProcess('AwbZorgtoeslagProcess', req(), 'unive');

  expect(mockClient.post).toHaveBeenCalledWith(
    '/process-definition/key/AwbZorgtoeslagProcess/tenant-id/toeslagen/start',
    expect.anything()
  );
});

it("falls back to the citizen's own tenant when the deployed tenant cannot be resolved", async () => {
  mockClient.get.mockRejectedValue(new Error('lookup failed'));
  mockClient.post.mockResolvedValue({ data: { id: 'pi1' } });

  await svc.startProcess('SomeProcess', req(), 'flevoland');

  expect(mockClient.post).toHaveBeenCalledWith(
    '/process-definition/key/SomeProcess/tenant-id/flevoland/start',
    expect.anything()
  );
});
```

Add a new test inside `describe('deployed forms', ...)`, after the existing `'getDeployedStartForm tries the tenant-scoped lookup first when a tenantId is given'` test:

```typescript
it('getDeployedStartForm scopes to the resolved deployed tenant, not the passed-in citizen tenant', async () => {
  mockClient.get
    .mockResolvedValueOnce({ data: [{ tenantId: 'toeslagen' }] }) // resolveDeployedTenant
    .mockResolvedValueOnce({ data: '{}', headers: { 'content-type': 'application/json' } }); // the form itself

  await svc.getDeployedStartForm('AwbZorgtoeslagProcess', 'unive');

  expect(mockClient.get).toHaveBeenNthCalledWith(
    2,
    '/process-definition/key/AwbZorgtoeslagProcess/tenant-id/toeslagen/deployed-start-form',
    { responseType: 'text' }
  );
});
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `cd packages/backend && npx jest src/services/operaton.service.test.ts -t "resolveDeployedTenant|actual deployed tenant|resolved deployed tenant"`
Expected: FAIL — `resolveDeployedTenant` doesn't exist yet, and `startProcess`/`getDeployedStartForm` still scope to the passed-in tenant directly.

- [ ] **Step 3: Add the `resolveDeployedTenant` helper**

In `operaton.service.ts`, add this private method directly above `startProcess` (before its current doc comment):

```typescript
  /**
   * Discover the Operaton-native tenant-id a process-definition key is
   * actually deployed under, via the untenanted list endpoint — unlike the
   * /process-definition/key/{key}/... shorthand, this resolves regardless of
   * tenant-id and returns each matching definition's own tenantId. Used to
   * correctly scope processes that are deployed under a fixed tenant
   * different from the calling citizen's own (e.g. AwbZorgtoeslagProcess,
   * always handled under toeslagen regardless of which tenant's citizen is
   * calling) instead of assuming the citizen's tenant is the process's
   * tenant. If the same key has coexisting rows under multiple tenants (a
   * legacy untenanted deployment alongside a newer tenant-scoped one), the
   * tenant-scoped row wins. Returns null if the key isn't deployed, is
   * deployed untenanted, or the lookup itself fails — callers should fall
   * back to their own best guess.
   */
  private async resolveDeployedTenant(processKey: string): Promise<string | null> {
    try {
      const response = await this.client.get('/process-definition', {
        params: { key: processKey, latestVersion: true },
      });
      const defs = response.data as Array<{ tenantId: string | null }>;
      const tenantScoped = defs.find((d) => d.tenantId !== null);
      return tenantScoped?.tenantId ?? defs[0]?.tenantId ?? null;
    } catch {
      return null;
    }
  }
```

- [ ] **Step 4: Use it in `startProcess`**

In `startProcess`, replace:

```typescript
      // Try the tenant-scoped start first. Deployments made via LDE's
      // mandatory-organization deploy flow carry Operaton's own native
      // tenant-id and are invisible to the untenanted /start shorthand
      // below — Operaton only resolves /process-definition/key/{key}/start
      // against definitions deployed with *no* tenant-id. Most processes
      // still aren't tenant-scoped (only new LDE deployments are, as of
      // 2026-08-12), so fall back to the untenanted lookup when the
      // scoped one reports no matching definition.
      let response;
      try {
        response = await this.client.post(
          `/process-definition/key/${processKey}/tenant-id/${tenantId}/start`,
          request
        );
```

with:

```typescript
      // Try the tenant-scoped start first, scoped to the process's own
      // *actual* deployed tenant (not necessarily the calling citizen's own
      // tenant — e.g. AwbZorgtoeslagProcess is always handled under
      // toeslagen regardless of which tenant's citizen is calling).
      // Deployments made via LDE's mandatory-organization deploy flow carry
      // Operaton's own native tenant-id and are invisible to the untenanted
      // /start shorthand below — Operaton only resolves
      // /process-definition/key/{key}/start against definitions deployed
      // with *no* tenant-id. Not every process is tenant-scoped yet, so
      // fall back to the untenanted lookup when the scoped one reports no
      // matching definition.
      const deployedTenant = await this.resolveDeployedTenant(processKey);
      const scopeTenant = deployedTenant ?? tenantId;
      let response;
      try {
        response = await this.client.post(
          `/process-definition/key/${processKey}/tenant-id/${scopeTenant}/start`,
          request
        );
```

- [ ] **Step 5: Use it in `getDeployedStartForm`**

In `getDeployedStartForm` (the version Task 1 left, which delegates to `getByKeyWithTenantFallback`), change:

```typescript
  async getDeployedStartForm(
    processKey: string,
    tenantId?: string
  ): Promise<{ data: string; contentType: string }> {
    try {
      const response = await this.getByKeyWithTenantFallback<string>(
        processKey,
        tenantId,
        '/deployed-start-form',
        { responseType: 'text' }
      );
```

to:

```typescript
  async getDeployedStartForm(
    processKey: string,
    tenantId?: string
  ): Promise<{ data: string; contentType: string }> {
    try {
      const deployedTenant = await this.resolveDeployedTenant(processKey);
      const response = await this.getByKeyWithTenantFallback<string>(
        processKey,
        deployedTenant ?? tenantId,
        '/deployed-start-form',
        { responseType: 'text' }
      );
```

(The rest of both methods — error handling, logging, the untenanted fallback inside `getByKeyWithTenantFallback` — is unchanged. `process.routes.ts:545-548` needs no change: it already just passes `req.user.tenantId` through as the fallback value, which is exactly what this task's `deployedTenant ?? tenantId` expects.)

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd packages/backend && npx jest src/services/operaton.service.test.ts`
Expected: PASS (full file — confirms Task 1/2/3's existing tests still pass unchanged, since a failed/empty `resolveDeployedTenant` lookup transparently falls back to the old citizen-tenant behavior those tests already exercise).

- [ ] **Step 7: Run the full backend test suite**

Run: `cd packages/backend && npx jest`
Expected: PASS, no regressions.

- [ ] **Step 8: Commit**

```bash
git add packages/backend/src/services/operaton.service.ts packages/backend/src/services/operaton.service.test.ts
git commit -m "fix: scope process start/start-form lookups to the process's real deployed tenant"
```

---

## Task 10: Fix Bug B — make DMN business-rule-tasks resolve their shared/untenanted decision explicitly

**Files:**

- Modify (LDE repo, `linked-data-explorer`): `e2e-fixtures/flevoland/AwbShellProcess.bpmn`, `e2e-fixtures/flevoland/TreeFellingPermitSubProcess.bpmn`, `e2e-fixtures/toeslagen/AwbZorgtoeslagProcess.bpmn`, `e2e-fixtures/toeslagen/ZorgtoeslagProvisionalSubProcess.bpmn`

**Interfaces:**

- Consumes: nothing code-level from earlier tasks — this is a BPMN-content-only fix.
- Produces: 4 modified BPMN files that Task 12 redeploys.

Confirmed by a live spike against this repo's own Operaton instance (2026-08-14): by default, a business-rule-task's `camunda:decisionRef` resolves against a decision definition under the _same_ tenant-id as the calling process instance — with no fallback to an untenanted/shared decision, even when one exists. Camunda's `camunda:decisionRefTenantId` attribute can override this, but only when set to an **EL expression that evaluates to null** (`${null}`) — a literal empty string (`""`) does **not** work; it's silently ignored and Operaton still inherits the calling process's tenant. This was proven empirically: a spike DMN deployed untenanted, called from a spike BPMN deployed under a test tenant, failed with `camunda:decisionRefTenantId` absent or `=""`, and succeeded (confirmed via a real evaluated output value) with `camunda:decisionRefTenantId="${null}"`.

Every fixture BPMN's business-rule-task currently has NO `camunda:decisionRefTenantId` attribute at all (confirmed by reading each file directly), meaning every one of them inherits its calling process's tenant and would fail exactly like Bug B once the shell processes are tenant-scoped — which, after Task 7, they are. `RipR21Process` has no business-rule-task at all (confirmed, no DMN reference) — not touched by this task.

- [ ] **Step 1: Add `camunda:decisionRefTenantId="${null}"` to all 7 business-rule-tasks**

In `e2e-fixtures/flevoland/AwbShellProcess.bpmn`, change:

```xml
    <bpmn:businessRuleTask id="Task_Phase3_Completeness" name="Phase 3: Admissibility check (Awb 2:3)" camunda:resultVariable="completenessResult" camunda:decisionRef="AwbCompletenessCheck" camunda:mapDecisionResult="singleResult">
```

to:

```xml
    <bpmn:businessRuleTask id="Task_Phase3_Completeness" name="Phase 3: Admissibility check (Awb 2:3)" camunda:resultVariable="completenessResult" camunda:decisionRef="AwbCompletenessCheck" camunda:decisionRefTenantId="${null}" camunda:mapDecisionResult="singleResult">
```

and change:

```xml
    <bpmn:businessRuleTask id="Task_ArchivesDMN" name="Archiving: retention and destruction period (Archives Act)" camunda:resultVariable="archivingResult" camunda:decisionRef="ArchivesActRetention" camunda:mapDecisionResult="singleResult">
```

to:

```xml
    <bpmn:businessRuleTask id="Task_ArchivesDMN" name="Archiving: retention and destruction period (Archives Act)" camunda:resultVariable="archivingResult" camunda:decisionRef="ArchivesActRetention" camunda:decisionRefTenantId="${null}" camunda:mapDecisionResult="singleResult">
```

In `e2e-fixtures/flevoland/TreeFellingPermitSubProcess.bpmn`, change:

```xml
    <bpmn:businessRuleTask id="Sub_AssessPermit" name="Assess tree felling permit (APV)" camunda:resultVariable="permitDecision" camunda:decisionRef="TreeFellingDecision" camunda:mapDecisionResult="singleEntry">
```

to:

```xml
    <bpmn:businessRuleTask id="Sub_AssessPermit" name="Assess tree felling permit (APV)" camunda:resultVariable="permitDecision" camunda:decisionRef="TreeFellingDecision" camunda:decisionRefTenantId="${null}" camunda:mapDecisionResult="singleEntry">
```

and change:

```xml
    <bpmn:businessRuleTask id="Sub_AssessReplacement" name="Assess replacement tree requirement" camunda:resultVariable="replacementDecision" camunda:decisionRef="ReplacementTreeDecision" camunda:mapDecisionResult="singleEntry">
```

to:

```xml
    <bpmn:businessRuleTask id="Sub_AssessReplacement" name="Assess replacement tree requirement" camunda:resultVariable="replacementDecision" camunda:decisionRef="ReplacementTreeDecision" camunda:decisionRefTenantId="${null}" camunda:mapDecisionResult="singleEntry">
```

In `e2e-fixtures/toeslagen/AwbZorgtoeslagProcess.bpmn`, change:

```xml
    <bpmn:businessRuleTask id="Task_Phase3_Completeness" name="Phase 3: Admissibility check (Awb 2:3)" camunda:resultVariable="completenessResult" camunda:decisionRef="AwbCompletenessCheck" camunda:mapDecisionResult="singleResult">
```

to:

```xml
    <bpmn:businessRuleTask id="Task_Phase3_Completeness" name="Phase 3: Admissibility check (Awb 2:3)" camunda:resultVariable="completenessResult" camunda:decisionRef="AwbCompletenessCheck" camunda:decisionRefTenantId="${null}" camunda:mapDecisionResult="singleResult">
```

and change:

```xml
    <bpmn:businessRuleTask id="Task_ArchivesDMN" name="Determine retention period (Archives Act)" camunda:resultVariable="archivesResult" camunda:decisionRef="ArchivesActRetention" camunda:mapDecisionResult="singleResult">
```

to:

```xml
    <bpmn:businessRuleTask id="Task_ArchivesDMN" name="Determine retention period (Archives Act)" camunda:resultVariable="archivesResult" camunda:decisionRef="ArchivesActRetention" camunda:decisionRefTenantId="${null}" camunda:mapDecisionResult="singleResult">
```

In `e2e-fixtures/toeslagen/ZorgtoeslagProvisionalSubProcess.bpmn`, change:

```xml
    <bpmn:businessRuleTask id="Sub_CalcProvisional" name="Calculate provisional entitlement (Wzt)" camunda:resultVariable="provisionalResult" camunda:decisionRef="zorgtoeslag_resultaat" camunda:mapDecisionResult="singleResult">
```

to:

```xml
    <bpmn:businessRuleTask id="Sub_CalcProvisional" name="Calculate provisional entitlement (Wzt)" camunda:resultVariable="provisionalResult" camunda:decisionRef="zorgtoeslag_resultaat" camunda:decisionRefTenantId="${null}" camunda:mapDecisionResult="singleResult">
```

- [ ] **Step 2: Verify each edit landed exactly once per task, with no other change**

```bash
grep -c 'decisionRefTenantId="\${null}"' e2e-fixtures/flevoland/AwbShellProcess.bpmn                  # expect 2
grep -c 'decisionRefTenantId="\${null}"' e2e-fixtures/flevoland/TreeFellingPermitSubProcess.bpmn        # expect 2
grep -c 'decisionRefTenantId="\${null}"' e2e-fixtures/toeslagen/AwbZorgtoeslagProcess.bpmn               # expect 2
grep -c 'decisionRefTenantId="\${null}"' e2e-fixtures/toeslagen/ZorgtoeslagProvisionalSubProcess.bpmn    # expect 1
git diff --stat  # expect only these 4 files, small diffs
```

- [ ] **Step 3: Run the LDE manifest-integrity test to confirm nothing else broke**

Run: `cd packages/backend && npx jest src/e2e-fixtures.test.ts`
Expected: PASS (4/4) — this edit doesn't touch any `bpmn:process id=` attribute or file name/location the manifest test checks, only an unrelated attribute on an inner task element.

- [ ] **Step 4: Commit**

```bash
git add e2e-fixtures/flevoland/AwbShellProcess.bpmn e2e-fixtures/flevoland/TreeFellingPermitSubProcess.bpmn e2e-fixtures/toeslagen/AwbZorgtoeslagProcess.bpmn e2e-fixtures/toeslagen/ZorgtoeslagProvisionalSubProcess.bpmn
git commit -m "fix: explicitly resolve shared DMN decisions as untenanted from tenant-scoped business-rule-tasks"
```

---

## Task 11: Mark every e2e-fixture BPMN as a fixture, visibly, on its own canvas

**Files (LDE repo, `linked-data-explorer`):**

- Modify: `e2e-fixtures/flevoland/AwbShellProcess.bpmn`, `e2e-fixtures/flevoland/TreeFellingPermitSubProcess.bpmn`, `e2e-fixtures/flevoland/RipR21Process.bpmn`, `e2e-fixtures/toeslagen/AwbZorgtoeslagProcess.bpmn`, `e2e-fixtures/toeslagen/ZorgtoeslagProvisionalSubProcess.bpmn`

**Interfaces:** none — pure BPMN content addition, no code, no manifest change (file list/names/`bpmn:process id=` are untouched).

The repo owner flagged that `e2e-fixtures/` files, once opened in LDE's BPMN Modeler, look identical to the general-purpose, user-editable examples in `public/examples/` — nothing on the canvas signals "this one is the frozen E2E test bundle, editing it here diverges from `ronl-business-api`'s test suite." Fix: add a visible `bpmn:textAnnotation`, connected via a `bpmn:association`, to every one of the 5 fixture files — it renders immediately on the canvas the moment the file is opened, before any deploy action. This is a pure content addition (a new flow element + its diagram-interchange shape/edge) — it does not touch any existing element, `bpmn:process id=`, or the manifest, so Task 6's `e2e-fixtures.test.ts` needs no change.

`RipR21Process.bpmn` is included even though Task 10 didn't touch it (no DMN) — this concern is orthogonal to Bug B, and the annotation should mark every fixture uniformly. Its live Operaton deployment won't show the annotation until it's naturally redeployed again in the future (the annotation's purpose — distinguishing the file while browsing/importing in the Modeler, before any deploy decision is made — is already achieved by the fixture file itself carrying it); Task 12's redeploy table below stays at 2 actions, unchanged, since nothing about `RipR21Process`'s actual deployed behavior changes here.

- [ ] **Step 1: Add the annotation to `e2e-fixtures/flevoland/AwbShellProcess.bpmn`**

Add this as a new child of `<bpmn:process>`, placed directly after the existing `<bpmn:startEvent id="StartEvent_AWB" ...>` element's closing tag (or after its self-closing tag, whichever the file has):

```xml
    <bpmn:textAnnotation id="Annotation_E2EFixture">
      <bpmn:text>⚠️ E2E FIXTURE — source of truth: linked-data-explorer/e2e-fixtures/. Edits here diverge from ronl-business-api's E2E test suite. See e2e-fixtures/manifest.json.</bpmn:text>
    </bpmn:textAnnotation>
    <bpmn:association id="Association_E2EFixture" sourceRef="Annotation_E2EFixture" targetRef="StartEvent_AWB" />
```

Add the matching diagram-interchange entries as new children of the file's `<bpmndi:BPMNPlane>`, placed directly after the existing `<bpmndi:BPMNShape id="StartEvent_AWB_di" ...>` block (which has `<dc:Bounds x="160" y="299" width="36" height="36" />`):

```xml
      <bpmndi:BPMNShape id="Annotation_E2EFixture_di" bpmnElement="Annotation_E2EFixture">
        <dc:Bounds x="100" y="120" width="320" height="100" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Association_E2EFixture_di" bpmnElement="Association_E2EFixture">
        <di:waypoint x="260" y="220" />
        <di:waypoint x="178" y="299" />
      </bpmndi:BPMNEdge>
```

- [ ] **Step 2: Add the annotation to `e2e-fixtures/flevoland/TreeFellingPermitSubProcess.bpmn`**

Same pattern, anchored to `SubStart` (DI bounds `x="152" y="182" width="36" height="36"`):

```xml
    <bpmn:textAnnotation id="Annotation_E2EFixture">
      <bpmn:text>⚠️ E2E FIXTURE — source of truth: linked-data-explorer/e2e-fixtures/. Edits here diverge from ronl-business-api's E2E test suite. See e2e-fixtures/manifest.json.</bpmn:text>
    </bpmn:textAnnotation>
    <bpmn:association id="Association_E2EFixture" sourceRef="Annotation_E2EFixture" targetRef="SubStart" />
```

```xml
      <bpmndi:BPMNShape id="Annotation_E2EFixture_di" bpmnElement="Annotation_E2EFixture">
        <dc:Bounds x="90" y="10" width="320" height="100" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Association_E2EFixture_di" bpmnElement="Association_E2EFixture">
        <di:waypoint x="250" y="110" />
        <di:waypoint x="170" y="182" />
      </bpmndi:BPMNEdge>
```

- [ ] **Step 3: Add the annotation to `e2e-fixtures/flevoland/RipR21Process.bpmn`**

Same pattern, anchored to `StartEvent_RipPhase1` (DI bounds `x="287" y="1102" width="36" height="36"`):

```xml
    <bpmn:textAnnotation id="Annotation_E2EFixture">
      <bpmn:text>⚠️ E2E FIXTURE — source of truth: linked-data-explorer/e2e-fixtures/. Edits here diverge from ronl-business-api's E2E test suite. See e2e-fixtures/manifest.json.</bpmn:text>
    </bpmn:textAnnotation>
    <bpmn:association id="Association_E2EFixture" sourceRef="Annotation_E2EFixture" targetRef="StartEvent_RipPhase1" />
```

```xml
      <bpmndi:BPMNShape id="Annotation_E2EFixture_di" bpmnElement="Annotation_E2EFixture">
        <dc:Bounds x="230" y="920" width="320" height="100" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Association_E2EFixture_di" bpmnElement="Association_E2EFixture">
        <di:waypoint x="390" y="1020" />
        <di:waypoint x="305" y="1102" />
      </bpmndi:BPMNEdge>
```

- [ ] **Step 4: Add the annotation to `e2e-fixtures/toeslagen/AwbZorgtoeslagProcess.bpmn`**

Same pattern as Step 1 (this file's `StartEvent_AWB` has the identical DI bounds `x="160" y="299" width="36" height="36"`):

```xml
    <bpmn:textAnnotation id="Annotation_E2EFixture">
      <bpmn:text>⚠️ E2E FIXTURE — source of truth: linked-data-explorer/e2e-fixtures/. Edits here diverge from ronl-business-api's E2E test suite. See e2e-fixtures/manifest.json.</bpmn:text>
    </bpmn:textAnnotation>
    <bpmn:association id="Association_E2EFixture" sourceRef="Annotation_E2EFixture" targetRef="StartEvent_AWB" />
```

```xml
      <bpmndi:BPMNShape id="Annotation_E2EFixture_di" bpmnElement="Annotation_E2EFixture">
        <dc:Bounds x="100" y="120" width="320" height="100" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Association_E2EFixture_di" bpmnElement="Association_E2EFixture">
        <di:waypoint x="260" y="220" />
        <di:waypoint x="178" y="299" />
      </bpmndi:BPMNEdge>
```

- [ ] **Step 5: Add the annotation to `e2e-fixtures/toeslagen/ZorgtoeslagProvisionalSubProcess.bpmn`**

Same pattern as Step 2 (this file's `SubStart` has the identical DI bounds `x="152" y="182" width="36" height="36"`):

```xml
    <bpmn:textAnnotation id="Annotation_E2EFixture">
      <bpmn:text>⚠️ E2E FIXTURE — source of truth: linked-data-explorer/e2e-fixtures/. Edits here diverge from ronl-business-api's E2E test suite. See e2e-fixtures/manifest.json.</bpmn:text>
    </bpmn:textAnnotation>
    <bpmn:association id="Association_E2EFixture" sourceRef="Annotation_E2EFixture" targetRef="SubStart" />
```

```xml
      <bpmndi:BPMNShape id="Annotation_E2EFixture_di" bpmnElement="Annotation_E2EFixture">
        <dc:Bounds x="90" y="10" width="320" height="100" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Association_E2EFixture_di" bpmnElement="Association_E2EFixture">
        <di:waypoint x="250" y="110" />
        <di:waypoint x="170" y="182" />
      </bpmndi:BPMNEdge>
```

- [ ] **Step 6: Verify each file is still well-formed XML and unchanged everywhere else**

```bash
for f in e2e-fixtures/flevoland/AwbShellProcess.bpmn e2e-fixtures/flevoland/TreeFellingPermitSubProcess.bpmn e2e-fixtures/flevoland/RipR21Process.bpmn e2e-fixtures/toeslagen/AwbZorgtoeslagProcess.bpmn e2e-fixtures/toeslagen/ZorgtoeslagProvisionalSubProcess.bpmn; do
  python -c "import xml.etree.ElementTree as ET; ET.parse('$f')" && echo "$f: well-formed" || echo "$f: BROKEN"
done
git diff --stat   # expect exactly these 5 files, small diffs each (roughly +10 lines per file)
```

- [ ] **Step 7: Run the LDE manifest-integrity test to confirm nothing else broke**

Run: `cd packages/backend && npx jest src/e2e-fixtures.test.ts`
Expected: PASS (4/4) — the annotation doesn't touch any `bpmn:process id=` attribute or file name/location, and doesn't add/remove any `camunda:formRef`/`ronl:documentRef` the manifest declares.

- [ ] **Step 8: Manually open at least one file in LDE's BPMN Modeler to visually confirm the annotation renders**

Import `e2e-fixtures/flevoland/AwbShellProcess.bpmn` into LDE's Modeler and confirm the warning note appears on the canvas, connected to the start event, without any XML-parse error banner. If it renders but overlaps other content or looks positioned oddly, that's a cosmetic nicety to nudge in the Modeler — not a blocker for this task, since the annotation still functions and is visible either way.

- [ ] **Step 9: Commit**

```bash
git add e2e-fixtures/flevoland/AwbShellProcess.bpmn e2e-fixtures/flevoland/TreeFellingPermitSubProcess.bpmn e2e-fixtures/flevoland/RipR21Process.bpmn e2e-fixtures/toeslagen/AwbZorgtoeslagProcess.bpmn e2e-fixtures/toeslagen/ZorgtoeslagProvisionalSubProcess.bpmn
git commit -m "docs: mark every e2e-fixtures BPMN with a visible on-canvas fixture warning"
```

---

## Task 12: Manual redeploy checkpoint #2 (STOP — human action required)

Like Task 7, this has no code changes and cannot be executed by an implementer subagent. `RipR21Process` needs no redeploy (no DMN reference, untouched by Task 10) — only the two grouped actions whose BPMN content actually changed.

- [ ] **Step 1: Stop and hand off to the user**

Report: "Tasks 9-11 are complete, committed, and green. Two of the three process bundles need a fresh redeploy to pick up Task 10's `decisionRefTenantId` fix (and Task 11's fixture-warning annotation, for the two that changed) — `RipR21Process` is unaffected functionally, though its fixture file also now carries the annotation for whenever it's next redeployed. Please redeploy the two below via LDE's BPMN Modeler, then confirm."

- [ ] **Step 2 (user, manual): Redeploy the two affected bundles**

| #   | Action                                                                | Tenant    | Files to import together                                                                                            |
| --- | --------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------- |
| 1   | Redeploy `AwbShellProcess` + `TreeFellingPermitSubProcess`            | flevoland | `e2e-fixtures/flevoland/AwbShellProcess.bpmn`, `e2e-fixtures/flevoland/TreeFellingPermitSubProcess.bpmn`            |
| 2   | Redeploy `AwbZorgtoeslagProcess` + `ZorgtoeslagProvisionalSubProcess` | toeslagen | `e2e-fixtures/toeslagen/AwbZorgtoeslagProcess.bpmn`, `e2e-fixtures/toeslagen/ZorgtoeslagProvisionalSubProcess.bpmn` |

Same procedure as Task 7: import both files of each action into the same Modeler session, set Organization to the tenant shown, click Deploy once. This creates a new version of each process definition (Operaton keeps the old version too — `latestVersion=true` queries, used throughout this plan's code, always resolve to the newest one, so no cleanup of the old version is required).

- [ ] **Step 3 (user, manual): Confirm back to proceed**

Once both are redeployed, tell the implementer/agent to proceed to Task 13.

---

## Task 13: Final E2E re-verification

Re-run exactly what Task 8 ran, now that Tasks 9-11 have landed.

**Files:** none modified — verification only, unless Step 3 below (inherited from Task 8's original Step 3, already answered "no change warranted" once — re-confirm it still holds now that the suite can actually reach that assertion) concludes otherwise.

- [ ] **Step 1: Run the full E2E suite**

Run: `cd packages/frontend && npm run test:e2e`
Expected: all 12 tests pass, including `caseworker-journey.spec.ts`, `tenant-isolation.spec.ts`, and `zorgtoeslag-journey.spec.ts` — the three that failed in Task 8.

- [ ] **Step 2: If any test still fails, stop and report — do not attempt a third fix blind**

If a failure remains, capture the full error output and Operaton engine log context (same method Task 8 used to diagnose Bug A/B) and report BLOCKED rather than guessing at a third fix. Two rounds of real, confirmed regressions is expected given how much this plan changes; a third would warrant re-examining the approach with the user rather than another unilateral patch.

- [ ] **Step 3: Re-confirm Task 8's Step 3 conclusion now that the suite reaches the assertion**

Task 8 already read `tenant-isolation.spec.ts` and concluded its existing assertions are sufficient, but couldn't demonstrate the spec passing (Bug A blocked it upstream). Now that Step 1 above should let the suite actually reach and pass that assertion, confirm the PASS is for the reason expected (the `flevoland` caseworker's task list genuinely never shows the `toeslagen` review task) rather than some other coincidental reason (e.g., the task not existing yet due to an unrelated failure earlier in the same spec).

- [ ] **Step 4: Report completion**

Report to the user: all 5 processes deployed and verified via `global-setup.ts`; full E2E suite green (12/12); Gap 1/Gap 2 fixes AND the two regressions found by Task 8 (Bug A's cross-tenant lookup, Bug B's DMN tenant resolution) all proven fixed against a real tenant-scoped Operaton instance. Proceed to `superpowers:finishing-a-development-branch` for both repos' branches (`feat/tenant-mandatory-adoption` in `ronl-business-api`, `feat/tenant-mandatory-deploy` in `linked-data-explorer`).

**Actual outcome (2026-08-14, continued):** Task 13's live re-run surfaced two further findings, both diagnosed live (not guessed) and both resolved without any application-code fix:

- **Bug A residual** (`resolveDeployedTenant('AwbZorgtoeslagProcess')` returning `null` live despite an identical manual query succeeding) was a stale long-running backend process — `tsx watch` hadn't picked up Task 9's changes across several hours of continuous runtime. Resolved by a genuine `npm run dev` restart; confirmed fixed by `test-citizen-unive` (cross-tenant) successfully reaching the Zorgtoeslag start form.
- **R2.1 showing "In ontwerp" instead of "Gedeployed"** on the Beheer Faseladder, even after the backend restart and clearing `localStorage`/`sessionStorage`, traced through the full stack (direct authenticated API call → confirmed correct; Network tab → confirmed a genuine uncached 200 with the correct body; component/hook code → confirmed correct in source) to Vite's on-disk dependency pre-bundling cache (`node_modules/.vite/`) serving a stale pre-Task-3 copy of the `@ronl/shared` workspace package. `npm run dev` alone doesn't clear this cache since it's disk-persisted, not in-memory. Resolved by deleting `node_modules/.vite` before restarting; confirmed fixed (`Gedeployed`, `1 LIVE`). Neither finding required an application-code change — both are recorded in [[ronl-business-api-local-dev-restart]] as a memory for future sessions.

**Task 14 (added, executed inline — no SDD dispatch): distinct Operaton keys for the e2e-fixtures sub-processes.** A third, real finding from Task 13's diagnosis: `TreeFellingPermitSubProcess`/`ZorgtoeslagProvisionalSubProcess` (the two shells' sub-processes) still lacked Task 10's `decisionRefTenantId` fix after the Task 12 redeploy, even though they shared a `deploymentId` with their now-fixed shells. Root cause (confirmed via the user's own LDE Modeler screenshots): the e2e-fixtures copy and the seeded-examples copy of each sub-process share the same `bpmn:process id=`, and LDE's own process catalog conflates them by that id — importing/redeploying the fixture silently reused/redeployed the example's stale content instead. Fixed by renaming, in `linked-data-explorer` only: `TreeFellingPermitSubProcess` → `TreeFellingPermitSubProcessE2E`, `ZorgtoeslagProvisionalSubProcess` → `ZorgtoeslagProvisionalSubProcessE2E` (filename + `bpmn:process id=` + the calling shell's `calledElement`, in both BPMN files; `e2e-fixtures/manifest.json` updated to match). Shells (`AwbShellProcess`, `AwbZorgtoeslagProcess`) and `RipR21Process` are untouched — confirmed scope with the user (a full shell rename was explicitly deferred earlier this session as out of scope, reaching into `Dashboard.tsx`/`seed-ropa.ts`/`BindingPanel.tsx`). `ronl-business-api`'s `required-processes.ts` and two E2E spec comments updated to match (LDE commit `faca7f0`, ronl-business-api commit `34c8ab4`). Requires a third manual redeploy of the same two grouped actions (Task 12's table, unchanged) before Task 13 can be re-run to a genuine green. A related, smaller finding from the same LDE screenshots — visually distinguishing e2e-fixtures from seeded examples via LDE's own status/badge system (`'WIP'`/`'EXAMPLE'` are hardcoded literals in `ProcessList.tsx`, not an extensible enum) — was confirmed out of scope and parked as a follow-up, same pattern as the M2M base-URL finding.

The third redeploy (Task 12's table, unchanged) hit one more real, self-contained finding: `TreeFellingPermitSubProcessE2E.bpmn` failed Operaton's BPMN schema validation (`ENGINE-09005`, a `businessRuleTask` found where an artifact-group element was expected) because Task 11's textAnnotation/association pair was placed immediately before the file's first `businessRuleTask` — every other fixture with the same annotation pattern has a `scriptTask` in that position instead, which validates fine, so this specific adjacency had never actually been tested against Operaton until Finding 1's stale-content bug was fixed (the file's real Task 10/11 content was never submitted for real parsing before this attempt). Fixed by moving the annotation to the end of the process body (LDE commit `36cba79`) — a pure diagram-content reposition, no semantic change, confirmed by `e2e-fixtures.test.ts` (4/4) and the full LDE backend suite (118/118).

**Final result, fully green, all layers (2026-08-14):**

- `ronl-business-api` backend unit: 71/71 suites, 1137/1137 tests.
- `ronl-business-api` frontend unit (Vitest): 130/130 files, 1065/1065 tests.
- `ronl-business-api` E2E (`npm run test:e2e`, real Operaton, real tenant-scoped bundle): **12/12 passing** — `caseworker-journey.spec.ts`, `tenant-isolation.spec.ts`, `zorgtoeslag-journey.spec.ts` all genuinely reach and pass their assertions, not just avoid the earlier blocking errors.
- `linked-data-explorer` backend unit: 118/118 tests.

This is the actual end-to-end proof the whole design set out to get: the full tenant-mandatory-adoption path — deploy-time tenant-id, cross-tenant process lookup, tenant-scoped DMN resolution, tenant-scoped counting/listing, and the R2.1 rename — proven against a real, live, two-tenant Operaton instance, not unit mocks alone.

---

## Self-Review Notes

- **Spec coverage:** Section A (Gap 1 → Task 1, Gap 2 → Task 2) ✓. Section B (redeploy table → Task 7) ✓. Section C (fixture bundle → Task 6, manifests → Tasks 5+6, verification-not-auto-deploy → Task 5, manifest-integrity test → Task 6, `tenant-isolation.spec.ts` review → Task 8 Step 3) ✓. Section D (rename → Tasks 3+4) ✓. Testing section's explicit 4-step sequence → Tasks 1-4 (step 1), Task 5 Step 3 (step 2, confirmed fails), Task 7 (step 3), Task 8 (step 4) ✓.
- **Placeholder scan:** every step carries real file paths, real line numbers (verified by direct reading, not reconstructed from memory), and complete code — no "TBD"/"similar to Task N"/"add appropriate handling" anywhere in this plan.
- **Type consistency:** `getByKeyWithTenantFallback<T>` (Task 1) is used identically by both its callers; `getBoardOwner`/`getDeployedStartForm`'s new `tenantId?: string` parameter and `getDeployedProcessKeys`/`getPhaseInstanceCounts`'s match across their Task 1/2 definitions and Task 1/2 call-site updates; `RipR21Process` is spelled identically across Tasks 3, 4, 5, 6, 7 (cross-checked against Task 3's `rip-phases.ts` source of truth).
- **Corrected during plan-writing (documented in the spec itself, commit `91a8fd3`):** the spec originally claimed the LDE manifest-integrity test would check an "organization extension property" in each BPMN. Direct inspection of the actual fixture source files (`grep organization` across all five BPMNs, plus `git log -S"organization"`) found no such property anywhere and no commit ever added one — `organization`/tenant-id is a value typed into LDE's Deploy dialog at deploy time, not static file content. Task 6's test asserts BPMN `id` only; `global-setup.ts` (Task 5/8) is what actually verifies the deployed tenant-id, against the real Operaton API.
- **Added after Task 8 ran against the real redeployed bundle (2026-08-14):** Task 8, run for real, found two genuine regressions no earlier task's review could have caught — neither is testable without live, two-tenant Operaton data, which didn't exist until Task 7's redeploy. Tasks 9-12 fix both (Bug A: cross-tenant start/start-form lookups scoped to the wrong tenant; Bug B: shared DMNs unresolvable from tenant-scoped calling processes, confirmed and fixed via a live empirical spike against Operaton, not guesswork) and re-run Task 8's own verification to completion. This is the plan working as intended under the "spec is the binding authority, plan is its argument, judgment settles what neither answers" principle — a genuinely new fact (Operaton's real multi-tenancy DMN-resolution behavior) surfaced only once the real system was exercised, and the plan was extended rather than the finding being forced into an existing task's scope.
