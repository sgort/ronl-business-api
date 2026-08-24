# RIP Fase 1 — tenant scoping in Operaton (two independent mechanisms)

This app uses **two separate, independent** mechanisms to associate a
`RipPhase1Process` instance with a tenant (municipality). They serve
different purposes, are read by different code paths, and — critically —
are **not automatically kept in sync with each other**. Understanding both
explains two real symptoms observed while testing this branch.

## The two mechanisms

### 1. Operaton's native tenant-id (deployment-level)

Set once, at **deploy time**, on the process _definition_ itself — not on
individual instances. As of 2026-08-12, `linked-data-explorer`'s BPMN
Modeler makes `organization` mandatory before deploying, and passes it to
Operaton's `POST /deployment/create` as the native `tenant-id` multipart
field. `RipPhase1Process` is now deployed with `tenant-id: flevoland`.

This is what makes `operaton.service.ts`'s `startProcess` need to try the
tenant-scoped start endpoint:

```
POST /process-definition/key/{key}/tenant-id/{tenantId}/start
```

instead of the untenanted shorthand

```
POST /process-definition/key/{key}/start
```

Operaton only resolves the untenanted shorthand against definitions
deployed with **no** tenant-id — a tenant-scoped definition is invisible
to it. `startProcess` (fixed on this branch) tries the scoped endpoint
first and falls back to the untenanted one, since most other processes in
this environment (AWB, Zorgtoeslag, etc.) are still deployed untenanted.

### 2. The `municipality` process variable (instance-level)

Set per **instance**, when a process is started — a plain Camunda/Operaton
process variable, unrelated to Operaton's native tenant-id concept. This
convention predates the native tenant-id work above by a long way and is
used throughout `operaton.service.ts` for every tenant-scoped query (task
lists, archives, RIP Fase 1 active/completed lists, capacity claims, etc.).

`startProcess` injects it automatically when the caller doesn't supply one:

```ts
if (!request.variables.municipality) {
  request.variables.municipality = { value: tenantId, type: 'String' };
}
```

This only happens when a process is started **through the app** (its
normal "Starten" UI flow, or any other code path that calls
`startProcess`). Starting a process instance directly in **Operaton
Cockpit** bypasses this entirely — Cockpit's own start dialog doesn't set
custom variables unless a human fills them in by hand, so a
Cockpit-started instance has no `municipality` variable at all.

## Why this produces two independently-explainable symptoms

**Symptom A (fixed on this branch):** starting `RipPhase1Process` from the
app's Beheer → R2.1 → Starten tab failed with _"Proces 'RipPhase1Process'
is niet gevonden op deze Operaton-omgeving"_, even though the Faseladder
showed it as `Gedeployed`. Cause: mechanism 1 — the deploy-status check
(`getDeployedProcessKeys`, a plain `GET /process-definition` listing query)
isn't tenant-restricted and found it regardless of tenant-id; `startProcess`
was calling the untenanted `/start` shorthand, which a tenant-scoped
definition doesn't match.

**Symptom B (expected behavior, not a bug):** an instance started manually
in Operaton Cockpit is counted by the Faseladder's WIP number but never
appears as a row in Portfolio. Cause: mechanism 2 —
`getPhaseInstanceCounts` (backs the Faseladder's WIP count) queries
`GET /process-instance/count?processDefinitionKey=...` with no variable
filter at all, so it counts every running instance unconditionally.
`getRipPhase1ActiveList` (backs Portfolio's live-instance rows) queries
Operaton's history API filtered on
`variables: [{ name: 'municipality', operator: 'eq', value: tenantId }]`
— an instance with no `municipality` variable simply doesn't match, and
Portfolio has no other data to build a named row from anyway (it needs
that variable to know _which_ project the instance belongs to). An
instance started through the app's own Starten flow always gets the
variable injected automatically and appears correctly.

## Practical takeaway

- Operaton's native `tenant-id` (mechanism 1) governs whether the engine
  can find and start a process definition at all.
- The `municipality` variable (mechanism 2) governs whether _this app_
  can attribute a running instance to a specific project/tenant for
  display and querying.
- They are set at different times, by different code, and neither implies
  the other. A process can be tenant-scoped at the engine level and still
  produce instances invisible to Portfolio (if started outside the app's
  normal flow), and vice versa.
- For testing: always start `RipPhase1Process` instances through the
  app's own Starten flow, not directly in Cockpit, unless specifically
  testing engine-level behavior — only the former produces an instance
  fully visible across every view in this app.
