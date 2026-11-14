# Caseworker process start — design

**Date:** 14 November 2026
**Status:** draft, for approval
**Repos:** `ronl-business-api` (RBA, the feature), `ttl-editor` (the DMN-bulk lab example that first uses it)

## Intent

A caseworker in RBA cannot start a process from a generic place. Every process a caseworker may start today has its own hard-coded dashboard section (`BesluitStartSection`, `CapacityClaimSection`, `HrOnboardingSection`), each calling `businessApi.process.start('<FixedKey>', {})`. A new process therefore needs new frontend code before anyone can start it.

This design adds a generic **"Proces starten"** section: it lists the processes the signed-in caseworker may start and starts one through its start form. Whether a caseworker may start a process is declared in the process model itself, with the standard BPMN attribute `camunda:candidateStarterGroups`, which the LDE Modeler already edits (_Candidate starter → Candidate starter groups_).

The first user is the DMN-bulk lab example (`ttl-editor/examples/lab/DMN-bulk/iou/`): `IngezeteneBulkProcess`, which applies the single-case `Ingezetene` decision to a list of cases. It is the capability the lab is meant to make generic: an organisation models a bulk assessment in the LDE, marks it startable by caseworkers, deploys it, and its caseworkers can start it in RBA without any RBA code change.

## Goals

- A caseworker sees, in one section, every process they may start, and starts one by filling in its start form.
- "May start" is decided by the process model (`candidateStarterGroups`) and by RBA's existing tenant rule for staff — no list of keys in RBA code or config.
- The DMN-bulk example is started this way by `test-caseworker-bes`: the cases are entered on the start form, assessed, and the result shown, with the phase stepper (_WAAR STA IK_) and _Bekijk proces_ working.

## Non-goals

- No change to the LDE: _Candidate starter groups_ is already in its properties panel.
- Not for citizens. Citizen services keep their own start path (`/v1/process/available`, `CITIZEN_SERVICE_PROCESS_KEYS`).
- No change to the existing hard-coded start sections; they keep working. Moving them onto the generic section is possible later, not now.
- Not the other DMN-bulk findings (per-case outcomes, parallel evaluation, LDE import of `operaton:` links, TTL `<inputData>`).
- Not enabled for other tenants yet.

## Anti-goals

- A caseworker must never see or start a process of another tenant. The list must apply exactly the rule `POST /v1/process/:key/start` enforces, so nothing listed is then refused at start.
- The section must not depend on process keys known to RBA.
- A role the model does not grant must not be able to start a process that declares its starter groups, whether through the list or the API.

## Constraints

- **Prerequisite: PR #449** (`fix/json-variable-serialisation`). Without it a start form with a dynamic list cannot be submitted (Operaton refuses an array as a `Json` value) and cannot be shown back. Build this on `acc` after #449 merges.
- **Tenant rule for staff** (`auth/tenant-access.ts`, `resolveStartTenant`): a caseworker may start a definition deployed under their own tenant (`user.tenantId`, from the `municipality` claim) or under no tenant. The start route already enforces it; the list mirrors it.
- `acc` and `main` change only through pull requests. Ask before every commit.
- The stack is a demonstration sandbox (no production concerns beyond the engineering rules).

## Approaches considered

|       | Approach                                                                 | Trade-off                                                                                        | Decision   |
| ----- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ---------- |
| **A** | A generic "Proces starten" section; processes opted in through the model | One endpoint and one section; any future process works without RBA code                          | **Chosen** |
| B     | A dedicated section per process, like `BesluitStartSection`              | Quick, but every new bulk process needs new frontend code — the opposite of a generic capability | Rejected   |
| C     | A "start instance" button in the LDE Modeler                             | The LDE is where processes are designed; cases belong to caseworkers in RBA                      | Rejected   |

**Marker:** the standard `camunda:candidateStarterGroups` attribute rather than a custom `ronl:caseworkerStart`. It already exists in BPMN and in the LDE properties panel, and it says _which_ groups may start a process, which a boolean marker could not. Chosen by the user on 14 November 2026.

## Design

### Backend: `GET /v1/process/startable`

Returns the processes the signed-in user may start:

```json
{
  "success": true,
  "data": [{ "key": "IngezeteneBulkProcess", "name": "Ingezetenecriteria voor een lijst gevallen" }]
}
```

A definition is listed when **all** of these hold:

1. It is the **latest version** of its key **for the user's tenant**, or of the untenanted deployment when the tenant has none of that key — the same resolution the start route uses (`resolveDeployedTenant` / `getByKeyWithTenantFallback`).
2. Its deployment tenant passes `resolveStartTenant(user, deployedTenant, key).allowed`.
3. Its process element has `camunda:candidateStarterGroups`, and at least one of the comma-separated, trimmed group names is in `req.user.roles`.
4. Its start event has a start form (`camunda:formRef`). `ProcessStartFormViewer` cannot start a process without one; listing it would show a dead entry.

The attribute and the start form are read from the BPMN XML through the existing per-definition cache (`getCachedBpmnXml`), so the list costs one definition query plus cached XML reads. Citizens get 403, like the other staff-only routes. Sorted by name.

The endpoint is added to `openapi.yaml`, with contract tests in the existing style.

### Backend: the start route enforces declared starter groups

`POST /v1/process/:key/start` keeps its tenant rule and adds one check: **when the resolved definition declares `camunda:candidateStarterGroups`**, a user with none of those groups in `req.user.roles` is refused with 403 (problem code in the route's existing style, audit-logged as a failure like the tenant denial). A definition without the attribute behaves exactly as today, so `BesluitStartSection`, `CapacityClaimSection`, `HrOnboardingSection` and the citizen services are unaffected. List and start therefore apply the same rule: nothing listed is refused, and nothing unlisted for lack of a role can be started. One shared helper reads the attribute and decides, used by both. Decided by the user on 14 November 2026 (option "enforce when declared").

### Frontend: section `proces-starten`

- A new section **"Proces starten"** (id `proces-starten`), routed in `CaseworkerDashboardV2/SectionRouter.tsx`.
- **Rail placement:** in the V2 dashboard the rail comes from `MODES` in `pages/caseworker-v2/modes.config.ts`; a tenant's `leftPanelSections` only gates which items show. The item goes in **Werk, directly under _Taken_**, in the main group: `{ id: 'proces-starten', label: 'Proces starten', authRequired: true }`, with no `requiredRoles` (the list itself filters by role). Decided by the user on 14 November 2026.
- It calls `businessApi.process.startable()` and lists the processes by name. Empty list: "Er zijn geen processen die u kunt starten."
- Choosing one shows `ProcessStartFormViewer` for its key. On `onStarted(dossier)` the section shows a success message naming the dossier (business key) and returns to the list; follow-up tasks appear in _Taken_ as usual. `onError` shows the failure the way the citizen dashboard does (`StartFailureNotice`).
- Enabled for **`bes` only**: added to `bes`'s `leftPanelSections` in `public/tenants.json`, in the `projects` group before `taken`. Other tenants opt in later by adding the same entry.

### DMN-bulk example (ttl-editor lab)

The example changes so that starting the process is entering the cases:

- The start event gets `camunda:formRef="ingezetene-bulk-input"` with `camunda:formRefBinding="deployment"`. `UserTask_Input` is removed.
- The initialisation task sets only `aantalIngezetenen = ${0}`; it no longer seeds `gevallen` (the seed was only a workaround for Operaton Tasklist; RBA sends the start form's list as `Json` once #449 is in).
- The process keeps `camunda:candidateStarterGroups="caseworker"`, `ronl:organization="bes"` and the phases.
- `iou/README.md` records the change and the new walk-through step.

**Source of truth for the BPMN:** the user has since edited the process in the LDE Modeler (phases, candidate starter groups, organisation `bes`), which `iou/ingezetene-bulk-process.bpmn` does not have. Before changing it, the deployed v2 XML is taken from the local engine (`GET /engine-rest/process-definition/key/IngezeteneBulkProcess/tenant-id/bes/xml`) into `iou/` and committed as is, so the lab file matches what runs; the start-form change is made on top of that. The user then imports the file into the LDE Modeler (replacing the process) and redeploys — the one hand-off in this part.

## Acceptance

Locally, as `test-caseworker-bes`:

1. _Proces starten_ lists "Ingezetenecriteria voor een lijst gevallen", and nothing from other tenants.
2. Starting it shows the input form; entering two or three cases and submitting starts the process and reports the dossier.
3. _Bekijk het resultaat_ appears in _Taken_, with the right count and all submitted cases.
4. On that task, the phase stepper (_WAAR STA IK_) and _Bekijk proces_ show the process's own phases. (They were missing in the earlier Utrecht test because the process was deployed under another tenant, so the swimlane lookup — own tenant, then untenanted — returned 404.)
5. `test-caseworker-utrecht` cannot start it (403 on `POST /v1/process/IngezeteneBulkProcess/start`, tenant rule), and `GET /v1/process/startable` does not list it for that user.
6. A user of tenant `bes` without the `caseworker` role is refused at start (403, starter groups) — covered by unit and contract tests, since the realm has no such user.

**Rule for the list (from the builder check):** the list follows `resolveDeployedTenant`, exactly as the start route does; a key it reports as ambiguously deployed is left out of the list.

Plus the usual gates: backend and frontend unit suites green, contract tests green, e2e run by the user.

## Left to the builder

- File layout and names inside the backend service and the section component, following the surrounding code.
- How the list request is cached, if at all, beyond the existing XML cache.
- Test fixtures for the BPMN XML (a minimal process with and without `candidateStarterGroups` and a start form).
