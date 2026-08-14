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

Update the existing test at `describe('startProcess', ...)`'s `'translates a missing-deployment 404 into a friendly Dutch message'` (currently lines 148-161) — this test uses `'RipPhase1Process'` purely as an example key name for a generic error-translation path, unrelated to the real R2.1 process; leave it as-is (it is not testing the rename, it's testing `startProcess`'s generic error handling with an arbitrary key string — renaming it here would just be churn with no signal). **Do not change this test.**

Update the existing test at `describe('getUserTasks', ...)`'s `'builds tenant + candidateGroup params and derives the key from a versioned defId'` (currently lines 496-509) — same reasoning: `'RipPhase1Process:3:abc'` here is an arbitrary example `processDefinitionId`, not asserting anything about the real R2.1 process. **Do not change this test.**

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

With the dev stack running but the new bundle not yet deployed (its current state — Task 7 hasn't run yet), run: `cd packages/frontend && npx playwright test tenant-isolation.spec.ts`
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
}

type Manifest = Record<string, FixtureEntry[]>;

function readManifest(): Manifest {
  const raw = fs.readFileSync(MANIFEST_PATH, 'utf8');
  return JSON.parse(raw) as Manifest;
}

describe('e2e-fixtures/manifest.json', () => {
  it('exists and parses as JSON', () => {
    expect(() => readManifest()).not.toThrow();
  });

  it('every declared file exists under its tenant directory', () => {
    const manifest = readManifest();
    for (const [tenant, entries] of Object.entries(manifest)) {
      for (const entry of entries) {
        for (const file of [entry.bpmn, ...entry.forms, ...entry.documents]) {
          const filePath = path.join(FIXTURES_ROOT, tenant, file);
          expect(fs.existsSync(filePath)).toBe(true);
        }
      }
    }
  });

  it("every entry's BPMN id matches its declared processDefinitionKey", () => {
    const manifest = readManifest();
    for (const [tenant, entries] of Object.entries(manifest)) {
      for (const entry of entries) {
        const bpmnPath = path.join(FIXTURES_ROOT, tenant, entry.bpmn);
        const xml = fs.readFileSync(bpmnPath, 'utf8');
        expect(xml).toMatch(new RegExp(`<bpmn:process\\s+id="${entry.processDefinitionKey}"`));
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
      "documents": [],
      "source": "packages/frontend/public/examples/flevoland/AwbShellProcess.bpmn (seeded, unchanged)"
    },
    {
      "processDefinitionKey": "TreeFellingPermitSubProcess",
      "bpmn": "TreeFellingPermitSubProcess.bpmn",
      "forms": ["tree-felling-review.form"],
      "documents": [],
      "source": "packages/frontend/public/examples/flevoland/TreeFellingPermitSubProcess.bpmn (seeded, unchanged)"
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
      "documents": [],
      "source": "packages/frontend/public/examples/toeslagen/AwbZorgtoeslagProcess.bpmn (seeded, unchanged)"
    },
    {
      "processDefinitionKey": "ZorgtoeslagProvisionalSubProcess",
      "bpmn": "ZorgtoeslagProvisionalSubProcess.bpmn",
      "forms": ["zorgtoeslag-provisional-review.form"],
      "documents": [],
      "source": "packages/frontend/public/examples/toeslagen/ZorgtoeslagProvisionalSubProcess.bpmn (seeded, unchanged)"
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

- [ ] **Step 2 (user, manual, outside this plan): Deploy the five processes via LDE's BPMN Modeler**

For each row, open LDE's BPMN Modeler (`npm run dev:backend` + `npm run dev` in the LDE repo), import the file from `linked-data-explorer/e2e-fixtures/<tenant>/`, set the Organization field, click Deploy:

| Process                            | Tenant    | Source file                                                    |
| ---------------------------------- | --------- | -------------------------------------------------------------- |
| `AwbShellProcess`                  | flevoland | `e2e-fixtures/flevoland/AwbShellProcess.bpmn`                  |
| `TreeFellingPermitSubProcess`      | flevoland | `e2e-fixtures/flevoland/TreeFellingPermitSubProcess.bpmn`      |
| `RipR21Process`                    | flevoland | `e2e-fixtures/flevoland/RipR21Process.bpmn`                    |
| `AwbZorgtoeslagProcess`            | toeslagen | `e2e-fixtures/toeslagen/AwbZorgtoeslagProcess.bpmn`            |
| `ZorgtoeslagProvisionalSubProcess` | toeslagen | `e2e-fixtures/toeslagen/ZorgtoeslagProvisionalSubProcess.bpmn` |

(LDE's `deployProcess` bundles each main BPMN with its own referenced sub-process BPMNs, forms, and document templates in one `/deployment/create` call — confirm each deploy picks up its fixture's forms/documents from the same `e2e-fixtures/<tenant>/` folder alongside the BPMN.)

- [ ] **Step 3 (user, manual): Confirm back to proceed**

Once all five are deployed, tell the implementer/agent to proceed to Task 8.

---

## Task 8: Final E2E verification against the real tenant-scoped bundle

**Files:** none modified — verification only.

**Interfaces:**

- Consumes: the five processes deployed in Task 7, matching Task 5's `REQUIRED_PROCESSES` and Task 6's `manifest.json` exactly.

- [ ] **Step 1: Confirm `global-setup.ts` now passes**

Run: `cd packages/frontend && npx playwright test tenant-isolation.spec.ts`
Expected: `globalSetup` no longer throws — the suite proceeds past setup into the actual spec.

- [ ] **Step 2: Run the full E2E suite**

Run: `cd packages/frontend && npx playwright test`
Expected: `caseworker-journey.spec.ts`, `zorgtoeslag-journey.spec.ts`, and `tenant-isolation.spec.ts` all pass against the real tenant-scoped bundle — the whole start → task → complete path exercised through Operaton's real tenant-scoped endpoints, not unit-level mocks.

- [ ] **Step 3: Review `tenant-isolation.spec.ts`'s existing assertions**

Per the spec's explicit deferral: read `tenant-isolation.spec.ts` now that real tenant-scoped data (`flevoland` and `toeslagen`, both genuinely tenant-id-carrying) is live. Decide whether its existing assertions already cover genuine Operaton-level tenant isolation (likely, since it was written to test what it could with the `municipality`-variable approximation and may now simply gain a stronger guarantee for free) or whether a new assertion is warranted (e.g., explicitly asserting a `flevoland`-scoped board query never surfaces a `toeslagen` instance now that `tenantIdIn` filtering — Task 2 — is live). Make the change if warranted; if the existing assertions already suffice, note that explicitly rather than silently skipping this step.

- [ ] **Step 4: If Step 3 produced a change, run the affected spec again**

Run: `cd packages/frontend && npx playwright test tenant-isolation.spec.ts`
Expected: PASS.

- [ ] **Step 5: If Step 3 produced a change, commit**

```bash
git add packages/frontend/e2e/tenant-isolation.spec.ts
git commit -m "test: strengthen tenant-isolation assertions against the real tenant-scoped bundle"
```

(Skip this step if Step 3 concluded no change was warranted.)

- [ ] **Step 6: Report completion**

Report to the user: all 5 processes deployed and verified via `global-setup.ts`; full E2E suite green; Gap 1/Gap 2 fixes proven against a real tenant-scoped Operaton instance, not just unit mocks; rename complete end-to-end. Proceed to `superpowers:finishing-a-development-branch` for both repos' branches (`feat/tenant-mandatory-adoption` in `ronl-business-api`, `feat/tenant-mandatory-deploy` in `linked-data-explorer`).

---

## Self-Review Notes

- **Spec coverage:** Section A (Gap 1 → Task 1, Gap 2 → Task 2) ✓. Section B (redeploy table → Task 7) ✓. Section C (fixture bundle → Task 6, manifests → Tasks 5+6, verification-not-auto-deploy → Task 5, manifest-integrity test → Task 6, `tenant-isolation.spec.ts` review → Task 8 Step 3) ✓. Section D (rename → Tasks 3+4) ✓. Testing section's explicit 4-step sequence → Tasks 1-4 (step 1), Task 5 Step 3 (step 2, confirmed fails), Task 7 (step 3), Task 8 (step 4) ✓.
- **Placeholder scan:** every step carries real file paths, real line numbers (verified by direct reading, not reconstructed from memory), and complete code — no "TBD"/"similar to Task N"/"add appropriate handling" anywhere in this plan.
- **Type consistency:** `getByKeyWithTenantFallback<T>` (Task 1) is used identically by both its callers; `getBoardOwner`/`getDeployedStartForm`'s new `tenantId?: string` parameter and `getDeployedProcessKeys`/`getPhaseInstanceCounts`'s match across their Task 1/2 definitions and Task 1/2 call-site updates; `RipR21Process` is spelled identically across Tasks 3, 4, 5, 6, 7 (cross-checked against Task 3's `rip-phases.ts` source of truth).
- **Corrected during plan-writing (documented in the spec itself, commit `91a8fd3`):** the spec originally claimed the LDE manifest-integrity test would check an "organization extension property" in each BPMN. Direct inspection of the actual fixture source files (`grep organization` across all five BPMNs, plus `git log -S"organization"`) found no such property anywhere and no commit ever added one — `organization`/tenant-id is a value typed into LDE's Deploy dialog at deploy time, not static file content. Task 6's test asserts BPMN `id` only; `global-setup.ts` (Task 5/8) is what actually verifies the deployed tenant-id, against the real Operaton API.
