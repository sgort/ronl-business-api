# Design: Friendlier "process not deployed" error for `startProcess`

## Problem

Starting a process for a key that has no matching deployment on the target
Operaton instance (e.g. `RipPhase1Process` on the localhost Docker Operaton,
before its BPMN bundle is deployed) surfaces Operaton's raw engine message
verbatim to the frontend:

```
No matching process definition with key: RipPhase1Process and no tenant-id
```

This is confusing for anyone reading it in the ronl.infra-board UI's error
panel — it's technically accurate but doesn't say _why_ (no deployment) or
_what to do about it_ (deploy the bundle).

This reproduces today against the local Docker Operaton for any process
whose BPMN bundle hasn't been deployed yet — first observed with
`RipPhase1Process` while building the RIP Fase 1 swimlanes example.

## Scope

Backend only (`ronl-business-api`). The frontend (ronl.infra-board /
linked-data-explorer example) already renders whatever `details`/`instance`
fields the backend's `PROCESS_START_FAILED` error response contains — no
frontend change is needed or in scope here.

## Design

### Where

`OperatonService.startProcess()` in
`packages/backend/src/services/operaton.service.ts`. Its catch block is
restructured to extract `operatonBody` / `operatonMessage` from the axios
error, the same way `evaluateDecision()` already does for DMN errors
(existing pattern, ~line 762 onward): detect known Operaton engine error
strings and throw a descriptive `Error` instead of leaking the raw axios
message, falling back to surfacing Operaton's own message for anything
unrecognized.

### Detection

```ts
operatonMessage.includes('No matching process definition with key');
```

Matches Operaton's actual `RestException` message text. Not scoped to a
specific process key, so it also helps for any other not-yet-deployed
process, not just `RipPhase1Process`.

### New message

```
Proces '${processKey}' is niet gevonden op deze Operaton-omgeving. Controleer of de BPMN-bundel voor dit proces is gedeployed en probeer het opnieuw.
```

Dutch, consistent with the existing DMN error strings in this file. Does
not repeat the Operaton base URL — the frontend already renders that
separately (the "Operaton" field in the error panel) via the route
handler's existing `instance: config.operaton.baseUrl` response field.

### Fallback behavior

Any other Operaton error message (auth failure, validation error, etc.)
continues to pass through unchanged — surfaced via `operatonMessage` if
present, otherwise the original error is rethrown. No diagnostic
information is lost for cases not covered by this specific check.

### Propagation

`process.routes.ts`'s catch handler already prefers the thrown `Error`'s
`.message` over the raw axios message for the `details` field it sends to
the frontend (see its existing `cause` resolution logic). No route-layer
change is required — the new message flows through automatically once
`operaton.service.ts` throws it.

## Testing (red → green TDD)

Add a case to `packages/backend/src/services/operaton.service.test.ts`:

- Mock an axios error response shaped like Operaton's actual 404: status
  404, body `{ type: 'RestException', message: "No matching process
definition with key: RipPhase1Process and no tenant-id" }`.
- Assert `startProcess(...)` rejects with the new friendly message
  (containing the process key and "niet gevonden" / deploy guidance).
- Confirm all existing `operaton.service.test.ts` and
  `process.routes.test.ts` cases still pass unchanged (no regression to
  other error paths or the success path).

## Out of scope

- Frontend rendering changes.
- Broader 404-based detection (matching any 404 from the start endpoint
  regardless of message wording) — deferred; substring match on Operaton's
  message is precise enough and consistent with the existing DMN pattern.
- Changes to other `OperatonService` methods.
