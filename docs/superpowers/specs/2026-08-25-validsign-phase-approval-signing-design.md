# Design: ValidSign digital signing for RIP phase approval documents

## Problem

The RIP phase processes end each stage with an _akkoord_ decision. In
`RipR21Process` (R2.1, the only phase deployed) there are three of them:

| Decision point                                          | Gate                                       | Variable         |
| ------------------------------------------------------- | ------------------------------------------ | ---------------- |
| `Task_UitvoerenIntakeoverleg` → `Gateway_IntakeAkkoord` | "Projectplan 1. Intake-formulier akkoord?" | `intakeAkkoord`  |
| `Task_AccorderenProjectplan2` → `Gateway_Akkoord2`      | "Akkoord?"                                 | `approvalStatus` |
| `Task_AccorderenProjectplan4` → `Gateway_Akkoord4`      | "Akkoord?"                                 | `approvalStatus` |

Today each is a form submission: someone picks _akkoord_ or _niet akkoord_ in
the `rip-approval` form and the gateway routes on the result. There is no
signature, and the documents the phase produces (`rip-intake-report`,
`rip-psu-report`, `rip-pdp`) are archived in eDOCS as plain `.txt` renderings
with no signatory attached.

The province holds a ValidSign licence. This design adds a real digital
signature to phase-exit approvals, starting with one task, on a mechanism any
future phase can adopt by adding a single BPMN attribute.

### Facts established before designing (not assumed)

Everything below was read from the codebases and the running engine:

- `RipR21Process.bpmn` is sourced from
  `linked-data-explorer/e2e-fixtures/flevoland/`, not from this repo. The
  `.bpmn` files under `examples/organizations/flevoland/` are stale.
- `xmlns:ronl="http://ronl.nl/schema/1.0"` **is** declared on the deployed
  BPMN, and all three `ronl:documentRef` attributes round-trip through the
  engine intact. Adding a second `ronl:` attribute is namespace-safe.
- `operatonService.getDecisionDocument()` (`operaton.service.ts:540`) already
  resolves a `ronl:` attribute at runtime by fetching the deployed BPMN XML and
  looking up a `<ref>.document` deployment resource. Verified against the live
  engine: resources deploy as `rip-pdp.document` and siblings.
- `Task_AccorderenProjectplan4` carries
  `camunda:candidateGroups="rip-projectleider,rip-aandrager,rip-ao"` — three
  groups, not two.
- RBA has Postgres (`db/pool.ts`), used only by `assets` and `ropa`.
- `validateConfig()` (`config.ts:413`) runs unconditionally on import, with no
  test-environment skip.
- `app.use(limiter)` (`index.ts:103`) applies the rate limiter **globally**,
  before all routes, keyed on IP.
- ValidSign ships **Java and .NET SDKs only** (v11.47). There is no Node SDK.
  Base URLs: `https://my.validsign.eu/api` (production),
  `https://try.validsign.eu/api` (sandbox). Auth is
  `Authorization: Basic <api_key>`, the key used verbatim — it is already the
  encoded credential, not a user:pass pair to encode again.
- The licence is **production-only**; there is no sandbox tenant. The account
  shows the `Provincie Flevoland` subaccount, and at design time its baseline
  was 1 transaction / 1 completed.
- **The API key is the account key**, not a subaccount key.
- Signers do **not** need a ValidSign account of their own.

### Verified by live probe

ValidSign is the EU-branded OneSpan Sign platform — same 11.47 SDK versions,
same documented auth scheme. Section D's endpoint shape was originally inferred
from OneSpan Sign's REST API; a read-only
`GET /api/packages?from=1&to=1` against production returned **HTTP 200** and
confirmed it:

- Envelope is `{ count, results }`, with working `from`/`to` pagination.
- Packages carry `roles[].signers[]` — the role/signer split this design relies
  on — plus `documents[].approvals[].fields[]`, the structure signature fields
  are placed into, and a string `status` enum.

Two findings from that probe change the design rather than merely confirm it:

- **`createPackage` must set an explicit sender.** The account holds 12
  packages and the sampled one belongs to a different colleague entirely.
  Without an explicit sender, packages would be attributed to whichever default
  owner the key resolves to, which is not necessarily the intended one.
- **The API key is account-wide, not scoped.** It can enumerate — and act on —
  every package in the Provincie Flevoland account, including colleagues'
  signed contracts. See section F.

**Still unverified:** the exact field-placement payload. `approvals` and
`fields` were empty on the sampled `DRAFT` package, and reading a completed one
would have meant reading a colleague's signed contract, which the probe
deliberately did not do. Confirm it against the first package this integration
creates itself.

## Decisions

Taken by the user during design, recorded so they are not silently revisited:

1. **Mechanism generic, wiring minimal.** Build a BPMN-driven, per-phase
   configurable mechanism, but wire only `Task_AccorderenProjectplan4` (R2.1's
   phase-exit approval) for now.
2. **Both delivery modes** — embedded ceremony first, email as fallback.
3. **Generate the PDF in RBA** from process variables, rather than using a
   ValidSign template or round-tripping through eDOCS.
4. **Render from the LDE document template's zones**, not a hardcoded renderer.
5. **Source documents become Markdown** (`.md`), not `.txt`.
6. **The signed PDF is archived back into the project's eDOCS workspace.**
7. **One signer: whoever claims the task.** Identity from the Keycloak token.
8. **Callback webhook plus a polling safety net.**
9. **Task completion happens server-side from the callback**, not from the UI.
10. **Approach A** — tag-driven, BPMN flow untouched. Approaches B (explicit
    BPMN signing steps) and C (a reusable signing call-activity) were
    considered and rejected for now. C is the documented upgrade path if
    signature reminders and escalation timers ever become a requirement.

## Design

### A. The tag

`Task_AccorderenProjectplan4` gains one additive attribute in
`linked-data-explorer/e2e-fixtures/flevoland/RipR21Process.bpmn`:

```xml
ronl:signatureRef="rip-pdp"
```

It names the `DocumentTemplate` whose rendition is signed, mirroring the
existing `ronl:documentRef="rip-pdp"` on `Task_AanvullenProjectplan4` — the
task that _produces_ the document. Operaton ignores unknown `ronl:` attributes,
so gateways, flows and variables are unchanged. This is a redeploy, not a
restructure.

### B. Resolving the tag

New `operatonService.getTaskSignatureSpec(processInstanceId, taskDefinitionKey)`,
reusing `getDecisionDocument()`'s deployment-resource lookup.

**One correction to existing code.** `getDecisionDocument()` matches
`/ronl:documentRef="([^"]+)"/` against the whole BPMN XML — first match wins,
regardless of which task carries it. That is survivable for `documentRef`,
whose three RIP uses are read in aggregate, but wrong for `signatureRef`, where
_which_ task is tagged is the entire point. Both resolvers therefore scope to
the `<bpmn:userTask id="…">` element first. This is a latent bug on the exact
line being extended, not unrelated refactoring.

The parsed result is cached per `processDefinitionId` — the XML for a given
definition is immutable, so the cache never needs invalidating.

### C. Document rendering: one IR, two emitters

```
DocumentTemplate (.document, from the deployment) + process variables
        │
        ▼  renderTemplate()
   RenderedDocument (IR)
        │                        │
        ▼  toMarkdown()          ▼  toPdf()
  rip-pdp-<nr>.md          PDF + signatureFields[]
  (eDOCS, react-markdown)  (signable)
```

Not `zones → Markdown → PDF`: that would need a Markdown parser _and_ a layout
engine, and would discard the position information signature placement depends
on. Both emitters consume the same resolved IR, so the `.md` shown in the board
and the PDF being signed cannot drift apart.

**Signature placement uses absolute coordinates, not text anchors.** Anchor
extraction exists for documents you did not author. We author this PDF, so
`toPdf()` returns exactly where it drew the signature line:

```ts
interface RenderedPdf {
  bytes: Buffer;
  signatureFields: Array<{
    name: string;
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
}
```

That is exact by construction and survives variable-length content — `pdpNotes`
can run to a page without moving the field off target.

`rip-pdp.document`'s `signOff` zone renders three signature lines (_Project
manager_, _Contributor_, _Official client_). The field attaches to the first;
the other two remain printed rules, matching the one-signer decision.

**Placeholder resolution.** The template carries 12 bindings
(`{{projectNumber}} → projectNumber`, source `process`; `{{assignedRoles}}` is
source `dmn_output`). Unresolved placeholders render as `—`, matching the
existing `v()` helper in `externalTaskWorker.service.ts`.

**Block coverage.** `text` (all the RIP templates use), plus `separator` and
`spacer`. `image` and `variable` blocks appear in no RIP template; they render
as a logged no-op rather than an unimplemented crash path.

**New dependency: pdfkit**, chosen over pdf-lib. pdfkit generates from scratch
with real text-wrapping helpers (`heightOfString`, wrapped `text()`); pdf-lib is
built for editing existing PDFs and leaves wrapping to the caller. Built-in
Helvetica covers Latin-1, so Dutch diacritics need no embedded font.

**Simplification this unlocks.** `renderDocumentContent()` in
`externalTaskWorker.service.ts` is a hardcoded `switch` restating, as TypeScript
string literals, content the `.document` templates already define — two sources
of truth for one document. Once `renderTemplate()` + `toMarkdown()` exist the
worker calls them and the switch is deleted. **Blast radius: all three
documents change from hand-written `.txt` to template-rendered `.md`.** Note
that `linked-data-explorer` carries its own copy of
`externalTaskWorker.service.ts` with the same switch; this change covers RBA's
copy only.

**Prerequisite, already done.** The three RIP `.document` fixtures had zone keys
`signoff`/`contactInfo` instead of `signOff`/`contactInformation`, so LDE's own
renderer silently dropped the Signatures block — the zone this feature anchors
into. Fixed in `linked-data-explorer` commit `39a49bb`, deployed and verified
(`RipR21Process:2`), and confirmed behaviour-neutral by a green E2E run.

### D. Backend

**`validsign.service.ts`**, mirroring `edocs.service.ts`:

```ts
createPackage(input): Promise<{ packageId: string; roleId: string }>
getSigningUrl(packageId, roleId): Promise<string>
sendPackage(packageId): Promise<void>
getPackageStatus(packageId): Promise<PackageStatus>
downloadSignedDocument(packageId, docId): Promise<Buffer>
downloadEvidenceSummary(packageId): Promise<Buffer>
```

`createPackage`'s input carries an **explicit sender**, never relying on the
key's default owner — see "Verified by live probe". It also sets one role of
signer type for the task claimant, and one signature field positioned from
`RenderedPdf.signatureFields`.

**The stub is a state machine**, `DRAFT → SENT → COMPLETED | DECLINED`, not
canned responses — the E2E journey must be able to drive a signature to
completion with no network. In stub mode `getSigningUrl()` returns a URL
pointing at **RBA itself** (`/v1/validsign/stub/ceremony/{packageId}`), serving
a minimal page with an "Onderteken" button that advances the machine. The
iframe, the polling and the completion path are then identical in stub and
live, and `SigningPanel` contains no stub branch at all. Because that URL is
same-origin, Playwright can drive it with `frameLocator()`.

**Three locks on live signing**, all required:

1. `VALIDSIGN_STUB_MODE=false`
2. `config.deploymentEnv ∈ VALIDSIGN_LIVE_TIERS`
3. a non-empty API key

`VALIDSIGN_LIVE_TIERS` is empty by default, so no tier may sign for real out of
the box. Keyed on `DEPLOYMENT_ENV`, never `NODE_ENV` — ACC runs
`NODE_ENV=production` deliberately. An allowlist env var rather than a
hardcoded tier, because live-fire runs on a laptop (`development`); hardcoding
"production only" would block the very test it needs and create pressure to
weaken the guard permanently.

**Routes** (`validsign.routes.ts`):

| Route                                     | Auth          | Purpose                                                                |
| ----------------------------------------- | ------------- | ---------------------------------------------------------------------- |
| `GET /v1/validsign/task/:taskId/spec`     | JWT           | `{ required, templateId, status, packageId, signingUrl? }`             |
| `POST /v1/validsign/task/:taskId/package` | JWT           | Render PDF, create package. Body `{ delivery: 'embedded' or 'email' }` |
| `GET /v1/validsign/task/:taskId/status`   | JWT           | UI polling                                                             |
| `POST /v1/validsign/callback`             | shared secret | ValidSign completion events                                            |
| `/v1/validsign/stub/ceremony/:packageId`  | stub only     | Local stand-in ceremony; 404 when stub mode is off                     |

**One completion path, shared and idempotent.** Callback and poller both call:

```
completeSignature(packageId):
  1. resolve instance  GET /process-instance?variables=validsignPackageId_eq_<id>
  2. if validsignStatus === 'completed' → return          (idempotency gate)
  3. download signed PDF + evidence summary
  4. edocsService.uploadDocument(...) x2 into the project workspace
  5. write validsignStatus / SignedDocNumber / SignedAt / SignerName
  6. complete the Operaton task with approvalStatus = approved | rejected
```

Guarded by a per-`packageId` in-process mutex on top of the status check: the
variable read/write is not atomic, and a simultaneous callback and poll can
otherwise both pass step 2 and complete the task twice.

**Poller.** Started at boot alongside `externalTaskWorker`, same SIGTERM
handling. Finds instances with `validsignStatus=sent`, checks each package, and
drives the same `completeSignature`. Pure safety net: when every callback
arrives it only ever observes already-completed work.

**State lives in Operaton process variables** — `validsignPackageId`,
`validsignStatus`, `validsignSignedDocNumber`, `validsignSignedDocId`,
`validsignSignedAt`, `validsignSignerName`, `validsignArchiveStatus`. No new
table: the state is inherently per-instance, visible in Cockpit, survives
restarts, and needs no migration. The callback carries a `packageId`, not an
instance, but Operaton's variable query provides the reverse lookup, so no
correlation table is needed either.

**Archival failure does not block the process.** If the signature succeeds but
the eDOCS upload fails, the Operaton task is still completed:
`validsignArchiveStatus=failed` is set, the failure is logged at error level,
and the poller retries archival separately. The signature is legally complete
and permanently retrievable from ValidSign the moment the signer finishes;
blocking the process would strand a valid approval behind an unrelated outage
in a different system, with no clean recovery, since the task cannot be
re-signed. The accepted cost is a window in which the phase has advanced but
the province's archive does not yet hold the document.

### E. Frontend

`TaskWorkPanel`'s **Acties** section (`ProjectDetail.tsx:124-146`) becomes
three-way:

```tsx
{
  !isClaimed ? (
    <button>Taak claimen</button> // unchanged
  ) : sig?.required ? (
    <SigningPanel taskId={task.id} spec={sig} onCompleted={() => onDone(task)} />
  ) : (
    <TaskFormViewer /> // unchanged
  );
}
```

Claim stays a hard precondition: the claimant _is_ the signer.

The spec fetch joins the existing `task.variables` fetch on panel mount — one
extra request per **opened** task, deliberately never per **listed** task,
since resolving the tag means fetching and parsing BPMN XML.

**States:** `idle → preparing → (ceremony | sent) → (completed | declined)`,
plus `error` with retry. `declined` is presented as a normal outcome — the task
completes with `approvalStatus=rejected` and the process loops back to
`Task_AanvullenProjectplan4` — not as a failure.

**Completion is detected by polling `.../status`, not by the iframe.** The live
ceremony is cross-origin, so there is no `postMessage` contract we control, and
the email path has no iframe at all. The poll is **only** for the UI: task
completion is server-side, so closing the board mid-ceremony strands nothing.

`SigningPanel` sets **no** completion message of its own. `onDone` unmounts the
panel, so anything set alongside it is destroyed in the same tick — the lesson
already written at `ProjectDetail.tsx:136` and fixed in commit `158fba7`. The
parent owns the confirmation.

**Polling and the rate limiter.** The limiter is global and IP-keyed, and with
`TRUST_PROXY=false` every client behind one proxy shares a single bucket. A 3s
poll across a multi-minute ceremony, times concurrent signers, is the shape of
load that produced the PA cockpit's 429s. Therefore: 3s interval,
`clearInterval` on unmount, and polling suspended while
`document.visibilityState === 'hidden'`.

**Scope limit, stated because the UI will imply otherwise.** "Stuur per e-mail"
sends to **the claimant** — it means _"I would rather sign in my mailbox than in
this iframe"_, not _"send this to someone else"_. External signers need the
`ronl:signers` extension and a way to resolve a person to an email address,
which is out of scope. The UI must name the recipient.

### F. Security and configuration

```ts
validsign: {
  baseUrl:        process.env.VALIDSIGN_BASE_URL ?? 'https://my.validsign.eu/api',
  apiKey:         process.env.VALIDSIGN_API_KEY ?? '',
  stubMode:       parseEnvBool(process.env.VALIDSIGN_STUB_MODE, true),
  callbackSecret: process.env.VALIDSIGN_CALLBACK_SECRET ?? '',
  liveTiers:      (process.env.VALIDSIGN_LIVE_TIERS ?? '').split(',').filter(Boolean),
  pollIntervalMs: parseEnvInt(process.env.VALIDSIGN_POLL_INTERVAL_MS, 15_000),
}
```

**Nothing may be required unconditionally.** `validateConfig()` runs on import
with no test skip, so a new mandatory setting would break every backend test.
The additions are conditional on `stubMode === false`.

**The callback route:**

- Skipped from the **global** limiter and given its own, keyed on the shared
  secret. Otherwise a busy board could exhaust the shared IP bucket and hand
  ValidSign's callback a 429, dropping a signature — precisely the failure the
  poller exists to catch.
- Mounted **before** `jwtMiddleware`; ValidSign carries no token.
- Secret compared with `crypto.timingSafeEqual`, length-checked first so the
  compare cannot throw on a mismatched length.
- Unknown `packageId` → **200 no-op**, never 404: a stale retry should generate
  no noise, and the response should not reveal which package ids exist.
- Tight body-size limit; every callback logged at info with `packageId` and
  status, since this is the audit-relevant path.
- The API key is never logged, following `edocs.service.ts`.

|                             | Local dev                             | ACC                | Production        |
| --------------------------- | ------------------------------------- | ------------------ | ----------------- |
| `VALIDSIGN_STUB_MODE`       | `true` (flip only for live-fire)      | `true` initially   | `false` when live |
| `VALIDSIGN_LIVE_TIERS`      | empty; `development` during live-fire | empty until agreed | `production`      |
| `VALIDSIGN_API_KEY`         | `.env.development` (gitignored)       | Azure App Setting  | Azure App Setting |
| `VALIDSIGN_CALLBACK_SECRET` | any random string                     | Azure App Setting  | Azure App Setting |

The key goes in App Settings, never into this repo's deploy scripts.

**The API key is an account-wide credential, and must be handled as one.** The
live probe established that it enumerates all 12 packages in the Provincie
Flevoland account, including ones belonging to other senders. It is therefore
not "a secret to keep out of logs" but a credential that grants read and write
access across colleagues' signed contracts. Consequences:

- Every package this integration creates sets an **explicit sender**, so RIP
  approvals are never silently attributed to whoever the key defaults to.
- The `VALIDSIGN_LIVE_TIERS` allowlist matters more than it did when it was
  proposed only as quota protection: an accidental live call is an action taken
  against the whole account, not a sandbox.
- Long term, this integration should use a **dedicated integration sender**
  rather than a personal account key. Reusing a person's key couples the
  province's process approvals to one employee's account and gives the
  application far more reach than it needs. Out of scope to build, but it
  should not become permanent by default.

## Testing

- Mocked-axios unit tests per service method; stub state-machine tests
  including the `DECLINED` branch.
- An idempotency test asserting `completeSignature` is safe under a
  simultaneous callback and poll.
- Guard tests asserting live mode throws for every tier outside the allowlist.
  This is the test that protects the signing quota; it gets the paranoid
  treatment.
- Component tests whose most important assertion is that `required: false`
  leaves `TaskFormViewer` untouched — every non-signing task in the app flows
  through that branch.
- E2E: work the journey as today, and at `Accorderen Projectplan 4` click
  "Onderteken nu", sign in the same-origin stub frame, then assert the task
  completed with `approvalStatus=approved`. This extends
  `rip-r21-journey.spec.ts`, owned by another session — a coordination point,
  not a unilateral edit.

### Live-fire

1. Confirm the stubbed journey is green first; live-fire diagnoses integration,
   not logic.
2. Locally set `VALIDSIGN_STUB_MODE=false` and
   `VALIDSIGN_LIVE_TIERS=development`.
3. Start one R2.1 instance, drive it to `Accorderen Projectplan 4`, sign once.
4. Revert both env vars immediately.
5. The signer's own ValidSign dashboard should move from 1/1 to 2/2
   transactions. Note this is the **per-sender dashboard view**, not the
   account total: the API reports 12 packages across the whole account, so the
   account-wide count is not a usable before/after check.

**Expect the callback never to arrive.** ValidSign's cloud cannot reach
`localhost`, so completion will come from the **poller**, roughly one interval
later. That is success, not a fault — and it exercises the backstop under real
conditions. The callback path can only be verified once RBA is reachable from
the internet, which is an ACC deployment question (public URL plus callback
registration), not a code one.

## Out of scope

- Signature reminders, escalation timers, or "chase the signer" workflows.
  These need approach C (a signing call-activity) and are not built.
- External signers — anyone without an RBA account. Needs `ronl:signers` plus a
  directory lookup.
- The other eleven RIP phases. The mechanism supports them; none are wired.
- The other two R2.1 approval gates (`Gateway_IntakeAkkoord`,
  `Task_AccorderenProjectplan2`).
- A `ronl:signatureRef` control in LDE's BpmnCanvas properties panel, which
  writes `ronl:documentRef` today. Cross-repo follow-up; the attribute is
  hand-edited for now.
- The six `.document` copies under
  `examples/organizations/flevoland/rip-phase1{,-swimlanes}/`, which carry the
  same zone-key defect but a correct `processKey`.
- LDE's duplicate `externalTaskWorker.service.ts`.

## Rollback

Delete `ronl:signatureRef` from `Task_AccorderenProjectplan4` and redeploy. The
tag is the only thing that activates any of this; without it the task falls
back to the `rip-approval` form and the process behaves exactly as it does
today. No data migration, no code revert.

## Open questions

1. **Blast radius of the Markdown conversion** — convert all three documents at
   once (deleting the `switch`), or `rip-pdp` only, keeping the switch for the
   other two and deleting it in a follow-up? Not yet decided.
2. ~~**Sender context.**~~ **Resolved by the live probe:** packages must carry
   an explicit sender. The key is account-wide and the account holds packages
   from multiple senders, so nothing may rely on a default. See "Verified by
   live probe" and section F.
3. **Branch coupling.** `feature/validsign-signing` currently carries E2E commit
   `3968122`, so ValidSign and the E2E improvement cannot land separately
   without a cherry-pick.
