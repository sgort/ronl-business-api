# Caseworker process start Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A generic "Proces starten" section in RBA's caseworker dashboard that lists the processes a caseworker may start — decided by `camunda:candidateStarterGroups` in the model plus the existing tenant rule — and starts one through its start form; first used by the DMN-bulk `IngezeteneBulkProcess` for tenant `bes`.

**Architecture:** Pure helpers read the starter groups and start form from BPMN XML; `OperatonService` exposes them per process and lists start candidates; the start route enforces declared starter groups and a new `GET /v1/process/startable` lists what passes both rules; a new V2 dashboard section uses it with the existing `ProcessStartFormViewer`. The lab BPMN in `ttl-editor` moves its input form to the start event.

**Tech Stack:** Express + TypeScript + Jest (backend), React + Vitest (frontend), OpenAPI contract tests, Operaton REST, BPMN XML.

**Spec:** `docs/superpowers/specs/2026-11-14-caseworker-process-start-design.md`

## Global Constraints

- Branch `feature/caseworker-process-start` in `ronl-business-api`; the lab task runs on `feature/lab-dmn-bulk` in `ttl-editor`. No worktrees.
- Ask before every commit (user rule) — stage each task, then ask. Never `--no-verify`.
- Starter groups: the process element's `camunda:candidateStarterGroups`, comma-separated, trimmed, empty entries dropped. Absent or empty attribute = **not declared**.
- Start route: declared groups and none in `req.user.roles` → **403**, problem code `NOT_CANDIDATE_STARTER`, audit failure reason `STARTER_GROUP`. Not declared → behaviour unchanged.
- List: only definitions that (1) are the latest for the user's tenant or untenanted, (2) resolve via `resolveDeployedTenant(key, user.tenantId)` to that same deployment and pass `resolveStartTenant(...).allowed`, (3) **declare** starter groups matching the user's roles, (4) have a start form (`camunda:formRef` on a top-level start event). A key raising `AmbiguousDeploymentError` is skipped. Citizens → 403. Response `{ success: true, data: [{ key, name }] }`, sorted by name (`localeCompare('nl')`).
- Section id `proces-starten`, label `Proces starten`, in `MODES` mode `werk`, main group, directly after `taken`, `authRequired: true`, no `requiredRoles`. Tenant-gated (not in the shell-global list). Enabled only in `tenants.bes.leftPanelSections`.
- Empty-list text: `Er zijn geen processen die u kunt starten.`
- Never start, stop or restart dev servers. The user runs e2e and the manual acceptance.

## Review Focus

1. A process that declares starter groups but whose start event has no form must neither be listed nor break the list — test in Task 4.
2. Starter-group parsing with spaces, empty entries and case (`" caseworker , ,HR "`) — group names compare case-sensitively, as Keycloak roles are — test in Task 1.
3. A definition lookup failure while checking starter groups at start must fail closed (error, no start), not open — test in Task 3.
4. The same key deployed untenanted and under the user's tenant lists once, the tenant one — test in Task 4.
5. A start form on a start event **inside a subprocess** (event subprocess or embedded) does not count as the process's start form — test in Task 1.

---

### Task 1: Starter-group and start-form helpers

**Files:**

- Create: `packages/backend/src/utils/starter-groups.ts`
- Test: `packages/backend/src/utils/starter-groups.test.ts`

**Interfaces:**

- Produces:
  - `parseStarterGroups(bpmnXml: string): string[] | null` — `null` when the attribute is absent or yields no names.
  - `hasStartForm(bpmnXml: string): boolean` — a `camunda:formRef` on a start event that is a direct child of the `process` element.
  - `mayStart(roles: readonly string[], starterGroups: string[] | null): boolean` — `true` when `starterGroups` is `null`; otherwise some group is in `roles`.

- [ ] **Step 1: Write the failing tests**
  - `parseStarterGroups`: `candidateStarterGroups="caseworker"` → `['caseworker']`; `" caseworker , ,HR "` → `['caseworker', 'HR']`; attribute absent → `null`; `""` → `null`; works with the `camunda` prefix bound to `http://camunda.org/schema/1.0/bpmn` (fixture uses that prefix, as the LDE writes it).
  - `hasStartForm`: top-level `<bpmn:startEvent camunda:formRef="x">` → `true`; no formRef → `false`; formRef only on a start event inside `<bpmn:subProcess>` → `false`.
  - `mayStart`: `(['caseworker'], null)` → `true`; `(['caseworker'], ['caseworker'])` → `true`; `(['citizen'], ['caseworker'])` → `false`; `(['Caseworker'], ['caseworker'])` → `false`.
- [ ] **Step 2: Run, see them fail** — `npx jest src/utils/starter-groups.test.ts --coverage=false` (in `packages/backend`). Expected: FAIL, module not found.
- [ ] **Step 3: Implement** — parse with the XML parser the backend already uses for BPMN (look at how `rip-swimlane/bpmn-swimlane.ts` or `getPhaseSwimlaneModel` reads XML; reuse it rather than adding a dependency).
- [ ] **Step 4: Run, see them pass** — same command. Expected: PASS.
- [ ] **Step 5: Stage and ask** — proposed `feat(backend): read a process's candidate starter groups and start form from its BPMN`.

### Task 2: OperatonService: starter groups and start candidates

**Files:**

- Modify: `packages/backend/src/services/operaton.service.ts` (near `getBoardOwner`, ~line 1480)
- Test: `packages/backend/src/services/operaton.service.test.ts`

**Interfaces:**

- Consumes: `parseStarterGroups`, `hasStartForm` (Task 1); private `getCurrentDefinitionId(processKey, tenantId?)`, `getCachedBpmnXml(definitionId)`.
- Produces:
  - `getStarterGroups(processKey: string, tenantId?: string): Promise<string[] | null>` — groups of the definition `getCurrentDefinitionId` resolves; errors propagate.
  - `export interface StartCandidate { key: string; name: string; tenantId: string | null; starterGroups: string[] | null; hasStartForm: boolean }`
  - `listStartCandidates(tenantId: string): Promise<StartCandidate[]>` — `GET /process-definition` with `latestVersion: true`, `tenantIdIn: tenantId`, `includeProcessDefinitionsWithoutTenantId: true`; one entry per definition (name falls back to key), XML via `getCachedBpmnXml(id)`.

- [ ] **Step 1: Write the failing tests** (mocked `mockClient.get`, existing style)
  - `getStarterGroups` returns `['caseworker']` for a definition whose XML declares it, and `null` when not.
  - `getStarterGroups` rejects when the definition lookup rejects.
  - `listStartCandidates('bes')` sends exactly those query params and maps two definitions (one `bes`, one untenanted) to `StartCandidate`s with their groups and start-form flags.
- [ ] **Step 2: Run, see them fail** — `npx jest src/services/operaton.service.test.ts --coverage=false -t "starter|StartCandidates"`. Expected: FAIL, not a function.
- [ ] **Step 3: Implement both methods.**
- [ ] **Step 4: Run the whole service test file** → PASS.
- [ ] **Step 5: Stage and ask** — proposed `feat(backend): list a tenant's start candidates and a process's starter groups`.

### Task 3: The start route enforces declared starter groups

**Files:**

- Modify: `packages/backend/src/routes/process.routes.ts:113-121` (after the tenant check)
- Modify: `packages/backend/openapi/openapi.yaml` (`POST /process/{key}/start`: 403 also for `NOT_CANDIDATE_STARTER`)
- Test: `packages/backend/src/routes/process.routes.test.ts` (add `getStarterGroups: jest.fn()` to the service mock; default `mockResolvedValue(null)` in `beforeEach`)

**Interfaces:**

- Consumes: `operatonService.getStarterGroups` (Task 2), `mayStart` (Task 1).

- [ ] **Step 1: Write the failing tests**
  - `'403 NOT_CANDIDATE_STARTER when the process declares starter groups the user lacks'` — `getStarterGroups` → `['hr-medewerker']`; status 403, problem `code` `NOT_CANDIDATE_STARTER`, `startProcess` not called, `auditLog` called with `'failure'` and `reason: 'STARTER_GROUP'`; `expectToMatchOperation(res, 'post', '/process/{key}/start')`.
  - `'starts when a declared starter group matches a role'` — `['caseworker']`; 201.
  - `'starts as before when the process declares none'` — `null`; 201 (existing tests keep passing with the default).
  - `'fails closed when the starter groups cannot be read'` — `getStarterGroups` rejects; not 201, `startProcess` not called.
  - `getStarterGroups` is called with the key and the resolved deployed tenant.
- [ ] **Step 2: Run, see them fail** — `npx jest src/routes/process.routes.test.ts --coverage=false -t "starter|declares|fails closed"`. Expected: FAIL.
- [ ] **Step 3: Implement** — after the tenant check: `const starterGroups = await operatonService.getStarterGroups(key, deployedTenant ?? undefined)`; if `!mayStart(req.user.roles, starterGroups)`, audit and `sendProblem(res, req, { status: 403, code: 'NOT_CANDIDATE_STARTER', detail: 'U mag dit proces niet starten.' })`. A rejection falls into the route's existing catch.
- [ ] **Step 4: Run the route file and the contract tests** — `npx jest src/routes/process.routes.test.ts --coverage=false` and `npm run test:contract` (in `packages/backend`) → PASS; `npm run lint:openapi` → no errors.
- [ ] **Step 5: Stage and ask** — proposed `feat(backend): refuse a process start to a user outside its declared candidate starter groups`.

### Task 4: `GET /v1/process/startable`

**Files:**

- Modify: `packages/backend/src/routes/process.routes.ts` (new route next to `/available`, before any `/:id` route)
- Modify: `packages/backend/openapi/openapi.yaml` (new path `/process/startable`, response schema `StartableProcess { key, name }`)
- Test: `packages/backend/src/routes/process.routes.test.ts` (add `listStartCandidates: jest.fn()` to the mock)

**Interfaces:**

- Consumes: `listStartCandidates` (Task 2), `mayStart` (Task 1), `resolveDeployedTenant`, `resolveStartTenant`, `isCitizen`, `AmbiguousDeploymentError`.

- [ ] **Step 1: Write the failing tests**
  - 401 without auth; 403 for a citizen (`x-test-roles` or however the file sets roles).
  - Lists a `bes` candidate with groups `['caseworker']` and a start form, for a caseworker of `bes`: `data` equals `[{ key, name }]`; `expectToMatchOperation(res, 'get', '/process/startable')`.
  - Leaves out: groups not declared; groups not matching; no start form (Review Focus 1); a key whose `resolveDeployedTenant` rejects with `AmbiguousDeploymentError`; a candidate whose tenant differs from what `resolveDeployedTenant` returns.
  - Same key untenanted and under the user's tenant → listed once (Review Focus 4).
  - Sorted by name.
- [ ] **Step 2: Run, see them fail** — `npx jest src/routes/process.routes.test.ts --coverage=false -t "startable"`. Expected: FAIL, 404.
- [ ] **Step 3: Implement** — filter candidates on `starterGroups !== null && hasStartForm && mayStart(...)`, then per remaining key `resolveDeployedTenant(key, user.tenantId)` (skip on `AmbiguousDeploymentError`), keep the candidate whose `tenantId` equals it and passes `resolveStartTenant(...).allowed`; de-duplicate by key; sort.
- [ ] **Step 4: Run** — the route file, `npm run test:contract`, `npm run lint:openapi`, `npx tsc --noEmit` → PASS / no errors.
- [ ] **Step 5: Stage and ask** — proposed `feat(backend): list the processes a caseworker may start`.

### Task 5: "Proces starten" section

**Files:**

- Modify: `packages/frontend/src/services/api.ts` (`process.startable()`)
- Create: `packages/frontend/src/components/CaseworkerDashboardV2/ProcesStartenSection.tsx`
- Test: `packages/frontend/src/components/CaseworkerDashboardV2/ProcesStartenSection.test.tsx`
- Modify: `packages/frontend/src/components/CaseworkerDashboardV2/SectionRouter.tsx` (+ its test)
- Modify: `packages/frontend/src/pages/caseworker-v2/modes.config.ts` (+ `modes.config.test.ts`)
- Modify: `packages/frontend/public/tenants.json` (`bes.leftPanelSections`)

**Interfaces:**

- Consumes: `GET /v1/process/startable` (Task 4); `ProcessStartFormViewer` (`processKey`, `onStarted(dossier)`, `onError(failure)`); `StartFailureNotice`.
- Produces: `businessApi.process.startable(): Promise<ApiResponse<{ key: string; name: string }[]>>`; `export default function ProcesStartenSection()`.

- [ ] **Step 1: Write the failing tests**
  - Section: lists the names `startable()` returns; empty → `Er zijn geen processen die u kunt starten.`; clicking a name renders `ProcessStartFormViewer` (mocked) with that `processKey`; its `onStarted('bes-123')` shows a success message containing `bes-123` and returns to the list; its `onError` shows `StartFailureNotice`.
  - `SectionRouter`: `sectionId 'proces-starten'` renders the section.
  - `modes.config`: `findModeForSection('proces-starten') === 'werk'`; the werk main group's item ids are `['taken', 'proces-starten']`; the item is hidden when the tenant's section list lacks it and shown when it has it (it is not shell-global).
  - `tenants-landing.test.ts` or a new assertion: only `bes` lists `proces-starten` in `leftPanelSections`.
- [ ] **Step 2: Run, see them fail** — `npx vitest run src/components/CaseworkerDashboardV2 src/pages/caseworker-v2` (in `packages/frontend`). Expected: FAIL.
- [ ] **Step 3: Implement** — the API method, the section (follow the visual style of `BesluitStartSection` / `HrOnboardingSection`), the router branch, the `MODES` item, and `{ "id": "proces-starten", "label": "Proces starten", "isPublic": false }` at the start of `bes.leftPanelSections.projects`.
- [ ] **Step 4: Run** — the whole frontend suite `npx vitest run`, `npx tsc --noEmit`, `npx eslint` on changed files → PASS.
- [ ] **Step 5: Stage and ask** — proposed `feat(frontend): a Proces starten section that starts any process a caseworker may start, for Caribisch Nederland first`.

### Task 6: DMN-bulk example: the input form becomes the start form (ttl-editor)

**Files (in `C:\Users\gorts01\Development\ttl-editor`, branch `feature/lab-dmn-bulk`):**

- Replace: `examples/lab/DMN-bulk/iou/ingezetene-bulk-process.bpmn`
- Modify: `examples/lab/DMN-bulk/iou/README.md`

- [ ] **Step 1: Take the deployed XML as is** — `GET http://localhost:8081/engine-rest/process-definition/key/IngezeteneBulkProcess/tenant-id/bes/xml` (basic auth `demo:demo`), `bpmn20Xml` into the file; stage; ask; commit as `docs(lab): the bulk process as deployed from the LDE (phases, candidate starter groups, organisation bes)`.
- [ ] **Step 2: Edit** — `StartEvent_Start` gets `camunda:formRef="ingezetene-bulk-input" camunda:formRefBinding="deployment"` (keep its phase); remove `UserTask_Input` and its DI shape, reconnect the init task straight to the subprocess; the init task keeps only `aantalIngezetenen = ${0}`. Keep `candidateStarterGroups`, `ronl:organization`, phases (drop the `bulk-input` phase if no element carries it any more).
- [ ] **Step 3: Verify** — the XML parses (`node -e` with the backend's XML parser or `xmllint --noout`); `hasStartForm` and `parseStarterGroups` from Task 1 return `true` and `['caseworker']` for it. Do not deploy it to the engine (an untenanted deploy would change tenant resolution).
- [ ] **Step 4: README** — the change and the new walk-through step (start in RBA's _Proces starten_); a results line for #448/#449 and the RBA findings still missing there (submit buttons; the Json round trip).
- [ ] **Step 5: Stage and ask** — proposed `docs(lab): start the bulk process with its input form, from RBA's Proces starten`.
- [ ] **Step 6: Hand off** — the user imports the file into the LDE Modeler (replace) and redeploys under `bes`.

### After the tasks

- Final whole-branch review (fresh reviewer), fix pass, then the user's checks: full backend and frontend suites, e2e, and the manual acceptance in the spec (§Acceptance 1–5, as `test-caseworker-bes` and `test-caseworker-utrecht`), including the phase stepper and _Bekijk proces_.
- Push and pull request into `acc` only on the user's go-ahead.
