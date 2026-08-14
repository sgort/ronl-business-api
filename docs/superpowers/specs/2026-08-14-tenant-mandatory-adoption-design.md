# Design: Adopt LDE's tenant-mandatory deploy across ronl-business-api

## Problem

LDE's `feat/tenant-mandatory-deploy` branch made `organization` (Operaton's native
`tenant-id`) mandatory at BPMN deploy time. `RipPhase1Process` has already been
redeployed under `tenantId=flevoland`, and a narrow fix
(`fix/tenant-scoped-process-start`) made `OperatonService.startProcess` try the
tenant-scoped Operaton endpoint before falling back to the untenanted one — that
fix was implemented and tested, but the branch carrying it was deliberately left
unmerged ("leave this for now"), never actually shipped. This work's branch,
`feat/tenant-mandatory-adoption`, merges `fix/tenant-scoped-process-start` in as
its starting point, so `startProcess`'s fix is genuinely in place before anything
else here builds on it.

That fix covered `startProcess` only. `operaton.service.ts` (1225 lines, 53
Operaton REST calls) has several other call sites that assume every process
definition is reachable via Operaton's untenanted `/process-definition/key/{key}/...`
shorthand — an assumption that stops holding the moment a key is deployed with a
tenant-id. This design closes those gaps, puts a stable, reproducible, tenant-
correct test bundle in place (deployed manually via LDE, verified automatically by
ronl-business-api's E2E suite) so the fix can actually be proven rather than assumed,
and — folded in on request — renames `RipPhase1Process` to `RipR21Process` so the
Operaton key matches the Faseladder's own R2.1 stage code, the original motivation
for starting this work.

Per [[handoff-specs-are-source-of-truth]] this doesn't apply here (no handoff
package involved) — the source of truth for this design is the two codebases
themselves, read directly rather than assumed; every claim below was verified
against actual file content, not inferred.

## Design

### A. Fixing the two real gaps in `operaton.service.ts`

Every one of the 53 Operaton calls was read and categorized. Two groups need
code changes; everything else is either already correct or deliberately
unscoped:

**Already correct, no change:** the 9 methods that filter by the app-level
`municipality` process variable (`getProcessHistory`, `getHrOnboardingProfile`,
`getHrOnboardingCompletedList`, `getUserTasks`, `getCompletedTasks`,
`getRipPhase1ActiveList`/`CompletedList`, `getCapacityClaimActiveList`/
`CompletedList`) — an independent mechanism from Operaton's native tenant-id,
unaffected by this work. Also fine: every call that operates on an opaque
process-instance-ID or process-definition-ID rather than a human key (Operaton
resolves those regardless of tenant).

**Already fixed:** `startProcess` (merged into this branch from
`fix/tenant-scoped-process-start`, not yet shipped to `acc`).

**Deliberately out of scope, confirmed not a gap:**

- `evaluateDecision` (`/decision-definition/key/{key}/evaluate`, untenanted).
  Confirmed by reading LDE's `deployDrd` directly: DMN/DRD deployment is a wholly
  separate code path from `deployProcess`, has no tenant-id parameter, and is a
  deliberate architectural choice — decision tables are shared regulatory logic,
  deployed via the CPSV Editor, referenced from BPMN by key only. No DMN table can
  carry a tenant-id today, so this call is correct as-is. Not revisited by this
  design.
- `listProcessInstances` / `queryProcessHistory` in `m2m.routes.ts` — explicitly
  cross-tenant by design (`jwtMiddleware` only, no `tenantMiddleware`, "M2M
  clients are system actors"). Left untouched.

**Gap 1 — untenanted key-lookups that will fail once their key carries a
tenant-id** (same bug class `startProcess` had before its fix):

- `getBoardOwner(processDefinitionKey)` → `/process-definition/key/{key}/xml`.
  Wrapped in a try/catch that treats any failure as "untagged" — so this doesn't
  throw, it **silently degrades** the Beheer archive's board-split the moment
  `RipPhase1Process` (already tenant-scoped) is looked up through it. This is a
  live bug today, not a future one.
- `getDeployedStartForm(processKey)` → `/process-definition/key/{key}/deployed-
start-form`, called from `process.routes.ts` (the citizen-facing "start a new
  case" flow) and `m2m.routes.ts`. This one throws — once `AwbShellProcess`/
  `AwbZorgtoeslagProcess` are redeployed with tenant-ids, starting a new citizen
  request breaks outright.

Fix: extract the try-tenant-scoped-then-fallback pattern `startProcess` already
established into one private helper on `OperatonService`, parameterized by the
URL path segment that follows `/process-definition/key/{key}` (`/xml` or
`/deployed-start-form`). Both methods gain a `tenantId?: string` parameter,
threaded from callers that already have it in scope (`getCompletedTasks` already
receives `tenantId`; `process.routes.ts`'s start-form route has `req.user.tenantId`
available).

**Gap 2 — a real cross-tenant leak, not a crash:**
`rip.routes.ts`'s `/phases/deployment-status` and `/phases/counts` call
`getDeployedProcessKeys`/`getPhaseInstanceCounts` with **zero tenant filter**,
even though both routes sit behind `tenantMiddleware` with `req.user.tenantId`
sitting unused. `getPhaseInstanceCounts` in particular feeds the Faseladder/
Portfolio WIP/Gereed dashboard numbers by counting instances of a process-
definition key **globally, across every tenant** — almost certainly the exact
mechanism behind the Portfolio/Faseladder discrepancy found earlier this week
(a Cockpit-started instance, carrying no `municipality` variable, was counted in
Faseladder's WIP total but invisible to Portfolio's variable-filtered list). Once
a second tenant exists, its counts leak into the first tenant's board.

Fix: Operaton's `/process-definition`, `/process-instance/count`, and
`/history/process-instance/count` all accept a native `tenantIdIn` query
parameter. Add `tenantId?: string` to both methods, pass `tenantIdIn` when
present, thread `req.user.tenantId` through from `rip.routes.ts`'s two handlers.

Confirmed with the project owner: this environment is a clean slate (no
currently-running instances from before this round's redeploy need to survive
the cutover), so the `tenantIdIn` filter can be strict — no "this tenant OR
untenanted-legacy" union logic is needed.

### B. Redeploy scope (operational, not code — performed manually via LDE)

| Process                            | Tenant    |
| ---------------------------------- | --------- |
| `AwbShellProcess`                  | flevoland |
| `TreeFellingPermitSubProcess`      | flevoland |
| `RipR21Process` (renamed, see D)   | flevoland |
| `AwbZorgtoeslagProcess`            | toeslagen |
| `ZorgtoeslagProvisionalSubProcess` | toeslagen |

`RipPhase1Process`'s existing tenant-scoped deployment (flevoland) is superseded
by this round's work rather than reused — see D for why the key itself changes,
not just its tenant.

`ZorgtoeslagFinalSubProcess` is deliberately excluded: confirmed via
`zorgtoeslag-journey.spec.ts`'s own comments that the E2E suite only exercises
the **provisional** review step, never a "final" decision — nothing depends on
it today.

### C. A stable, reproducible LDE-side test bundle

**What exists today, and why it's not sufficient as-is.** LDE has two pre-
existing "examples" locations — the repo-root `examples/organizations/<org>/`
(broad reference material: PDFs, MCDC test-case generators, DMN/TTL side
artifacts, multiple historical variants of the same process) and
`packages/frontend/public/examples/<tenant>/` (the literal, hardcoded backing
store for specific "load example" buttons in `BpmnModeler.tsx`, each wired to
its own `fetch()` call, versioned via `exampleVersions.ts`'s re-seed-on-bump
mechanism). These have already diverged: `TreeFellingPermitSubProcess.bpmn`
differs by a real attribute (`ronl:dsoActiviteitUrn`) between the two copies —
`public/examples/`'s copy is the newer, correct one. Neither directory is a
safe foundation for E2E fixtures: the repo-root one is stale reference material
with proven drift; `public/examples/` is general-purpose demo content that
LDE's own users are expected to keep editing for other purposes, with no
protection against an unrelated demo edit silently breaking ronl-business-api's
E2E assertions.

**New, dedicated directory:** `linked-data-explorer/e2e-fixtures/<tenant>/`,
seeded once from the current `public/examples/` copies (proven freshest) plus
`RipPhase1Process.bpmn` from `examples/organizations/flevoland/rip-phase1-
swimlanes/` (the variant this session's tenantId-mandatory work was built and
verified against) and its linked forms/documents — renamed to `RipR21Process`
(both the filename and the BPMN's own `id`/`name` attributes) as part of
assembling the bundle, per D, so the fixture set never carries the superseded
key at all. Contains, per tenant:

- `flevoland/`: `AwbShellProcess.bpmn`, `TreeFellingPermitSubProcess.bpmn`,
  `RipR21Process.bpmn` (renamed per D), and every form/document each one's
  `camunda:formRef`/`ronl:documentRef` attributes actually reference (read from
  the BPMN source directly when building the bundle — don't guess the linkage).
- `toeslagen/`: `AwbZorgtoeslagProcess.bpmn`, `ZorgtoeslagProvisionalSubProcess.bpmn`,
  and their referenced forms.

Manual import only — confirmed LDE's BPMN Modeler can import from any local file
path, not only the pre-loaded `public/examples/` set, so this new directory
needs no HTTP-serving concern and no new "load example" buttons in
`BpmnModeler.tsx`/`exampleVersions.ts`. A developer opens the Modeler, imports
from `e2e-fixtures/<tenant>/*.bpmn`, sets the Organization field to the tenant
above, clicks Deploy. Fully manual, matching the explicit requirement.

**Two small manifests, not one shared cross-repo file** (avoids a fragile
"sibling repo must be checked out at exactly this relative path" dependency at
test time):

- `linked-data-explorer/e2e-fixtures/manifest.json` — documents the fixture set
  for whoever deploys it: process key, tenant, source file, one-line purpose.
  This is the human-facing "what is this bundle and why" record.
- A small manifest in `ronl-business-api` (e.g.
  `packages/frontend/e2e/helpers/required-processes.ts`) declaring the 5
  `(processDefinitionKey, tenantId)` pairs the E2E suite actually requires — the
  thing `global-setup.ts` checks against.

LDE's `manifest.json` gets a matching integrity test in LDE's own suite: asserts
every file it declares actually exists under `e2e-fixtures/`, and that each
BPMN's own `id` and `organization` extension property match what the manifest
claims for it — so an edit to a fixture that forgets to update the manifest (or
vice versa) fails LDE's own test suite immediately, rather than surfacing as a
confusing mismatch only when ronl-business-api's `global-setup.ts` runs against
a stale deploy.

**Verification, not auto-deploy, in `global-setup.ts`.** The existing
`global-setup.ts` only checks that frontend/backend/LDE-backend are reachable —
it has no idea whether the right processes are deployed with the right tenant-
ids, so a mismatch currently surfaces as a confusing failure deep inside a spec.
Extend it to query Operaton's own REST API directly
(`http://localhost:8081/engine-rest/process-definition?keysIn=...&latestVersion=true`
— the same base URL the backend itself uses, confirmed in
`packages/backend/.env.development`) and verify each required key from the new
manifest is present with a matching `tenantId`. On mismatch, fail fast with a
clear message pointing at LDE and the fixture directory, mirroring the existing
"start it yourself first" style — never deploy anything automatically.

**`tenant-isolation.spec.ts`.** Once the bundle carries two real tenant-ids
(flevoland, toeslagen) instead of zero, this spec starts exercising genuine
Operaton-level tenant isolation instead of only the `municipality`-variable
approximation it was limited to before. Review its existing assertions once the
bundle is live — it may already cover the intended behavior and simply gain a
stronger guarantee for free, or may want a new assertion; decide during
implementation once the real tenant-scoped data is in front of it, not
speculatively here.

### D. Renaming `RipPhase1Process` → `RipR21Process`

Previously deferred as a separate piece of work; folded back into this spec on
request. The original motivation still holds: `RipPhase1Process` is a generic
name that doesn't self-describe which Faseladder stage it belongs to; `RipR21Process`
matches the Faseladder's own R2.1 stage code directly, the same way every other
RIP phase's key is expected to.

Full blast radius, confirmed by reading every non-test source reference to the
literal string `'RipPhase1Process'` in both repos — narrow, three call sites plus
the BPMN source itself:

- `ronl-business-api`, backend: `operaton.service.ts`'s two hardcoded
  `processDefinitionKey: 'RipPhase1Process'` filters (inside
  `getRipPhase1ActiveList`/`getRipPhase1CompletedList`); `packages/shared/src/
rip-phases.ts`'s `RIP_PHASE_KEYS` R2.1 entry (`{ code: 'R2.1', stage: 'R2',
processDefinitionKey: 'RipPhase1Process' }`).
- `ronl-business-api`, frontend: `PhaseDetail.tsx`'s hardcoded
  `businessApi.process.start('RipPhase1Process', {})` call (the actual "start
  new project" action); `infra.api.ts`'s key→display-name lookup map entry
  (`RipPhase1Process: 'RIP Fase 1 — R2.1 Projectplan Planvoorbereiding'`);
  `rip-phases.catalog.ts`'s displayed "source" attribution string
  (`'RipPhase1Process.bpmn · 11 taken · 8 formulieren · 3 documenten'`); two
  doc comments (`rip-model.ts`, `infra.api.ts`) mentioning the name for
  context, updated for accuracy.
- **Not renamed:** ronl-business-api's own internal method/route names
  (`getRipPhase1ActiveList`, `/v1/rip/phase1/active`, etc.) — these are
  ronl-business-api's own identifiers, unrelated to Operaton's process-
  definition key, and renaming them would ripple far beyond this spec's actual
  goal (matching the _Operaton key_ to the Faseladder code) for no benefit.
- `changelog-data.ts`'s historical release-note mentions of the old name are
  **not** touched — that's a record of what actually shipped at the time, not
  something to retroactively rewrite.

Operationally: the new key means a genuinely new process-definition, not an
in-place rename of the existing tenant-scoped deployment — deploy
`RipR21Process` fresh (same clean-slate treatment as B's other four processes);
the old `RipPhase1Process` deployment goes unused, no migration needed.

## Out of scope

- Making DMN/DRD deployment tenant-scoped (explicitly confirmed as a permanent
  architectural choice, not a gap).
- Any change to `m2m.routes.ts`'s deliberately cross-tenant behavior.
- **`OPERATON_M2M_BASE_URL`** pointing at a remote Operaton instance
  (`operaton-doc.open-regels.nl`) even in local dev, unlike the main
  `OPERATON_BASE_URL` (which was deliberately switched to the local Docker
  instance for exactly this kind of testing, per its own `.env.development`
  comment). Confirmed real and very likely an oversight from that same
  migration — several Gap-1-affected methods are called through
  `m2mOperatonService` too, so this path can't currently be locally verified
  against the new fixture bundle. Explicitly parked as a separate, later task
  once this spec ships — fixing it involves Docker-networking configuration
  (the M2M client's own reachability to `localhost:8081` from wherever it
  actually runs) beyond this spec's scope.
- Migrating any currently-running process instance across the tenant-id cutover
  (confirmed clean slate, nothing to migrate).
- Wiring the new `e2e-fixtures/` set into LDE's pre-loaded "load example"
  buttons (confirmed manual-import-only).

## Testing

- **`operaton.service.test.ts`** (existing file, already has coverage for
  `startProcess`'s tenant-scoped-then-fallback behavior): add matching coverage
  for the new shared helper via `getBoardOwner` and `getDeployedStartForm` — a
  tenant-scoped call that succeeds, and a fallback case exercising the same
  "No matching process definition with key" detection `startProcess` already
  uses. Add coverage for `getDeployedProcessKeys`/`getPhaseInstanceCounts`
  passing `tenantIdIn` when a `tenantId` is provided, and omitting it when not
  (preserves the existing unscoped M2M-facing behavior for any caller that
  still wants it).
- **`rip.routes.test.ts`**: assert `req.user.tenantId` is passed through to both
  `getDeployedProcessKeys` and `getPhaseInstanceCounts`.
- **E2E (`global-setup.ts`)**: a focused test or manual verification that a
  missing/mismatched required process produces the clear fail-fast message,
  not a downstream test failure.
- **LDE — manifest-integrity test**: asserts `e2e-fixtures/manifest.json`'s
  declared files exist and each BPMN's `id`/`organization` match what the
  manifest claims for it (see C).
- **Full E2E suite** (`caseworker-journey.spec.ts`, `zorgtoeslag-journey.spec.ts`,
  `tenant-isolation.spec.ts`) re-run against the real redeployed, tenant-scoped
  bundle once it's live — this is the actual proof this design set out to get:
  the whole start → task → complete path exercised through Operaton's real
  tenant-scoped endpoints, not just unit-level mocks.

**Expected implementation sequence** (carries directly into the plan's task
order): (1) red/green TDD for every code-level change in both repos — Section
A/D's `ronl-business-api` fixes and their unit tests, LDE's manifest-integrity
test — all provable without any live Operaton redeploy. (2) At this point
`ronl-business-api`'s E2E suite is expected to **fail** at `global-setup.ts`'s
new verification step, correctly, because the real bundle isn't deployed yet.
(3) Manually redeploy the five processes via LDE (per B), using the
`e2e-fixtures/` set. (4) Re-run the E2E suite — `global-setup.ts` passes, and
`caseworker-journey.spec.ts`/`zorgtoeslag-journey.spec.ts`/
`tenant-isolation.spec.ts` exercise the real tenant-scoped path end to end.

- **Rename (D)**: `rip-phases.ts`'s existing test (or a new one) asserts
  `RIP_PHASE_KEYS`'s R2.1 entry carries `processDefinitionKey: 'RipR21Process'`;
  `operaton.service.test.ts`'s existing `getRipPhase1ActiveList`/
  `CompletedList` tests updated to assert the new key in their query filters;
  a frontend test (existing or new) confirms `PhaseDetail.tsx`'s start action
  calls `businessApi.process.start('RipR21Process', {})`. No behavior to test
  beyond the literal string change — this is a rename, not new logic.
