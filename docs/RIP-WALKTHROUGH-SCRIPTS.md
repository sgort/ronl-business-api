# Walking a project through the RIP ladder

Three scripts set up and tear down RIP process instances against a running
stack, so a full walkthrough of the Faseladder takes seconds instead of filling
in dozens of forms by hand.

| Script                             | What it is for                                                                                |
| ---------------------------------- | --------------------------------------------------------------------------------------------- |
| `scripts/rip-phase-walkthrough.sh` | The general driver. Runs any deployed phase, or the whole ladder for one project.             |
| `scripts/rip-r21-to-approval.sh`   | R2.1 only, stopping at the ValidSign signature task. Use this for signing work.               |
| `scripts/rip-purge-instances.sh`   | Resets the engine to "no RIP has ever run" without touching the deployed process definitions. |

---

## Before you start

All three talk to a **running local stack**. None of them will start it for you.

| Needs           | Default                             | Override                       |
| --------------- | ----------------------------------- | ------------------------------ |
| Operaton engine | `http://localhost:8081/engine-rest` | `OPERATON_URL`                 |
| RBA backend     | `http://localhost:3002`             | `BACKEND_URL`                  |
| Keycloak        | `http://localhost:8080`             | `KEYCLOAK_URL`                 |
| Realm           | `ronl`                              | `KEYCLOAK_REALM`               |
| User            | `test-infra-flevoland` / `test123`  | `START_USER`, `START_PASSWORD` |
| Tenant          | `flevoland`                         | `TENANT`                       |

Also needs `curl`, `jq` and `python` on `PATH`.

A phase must be **deployed on the engine** and **present in the phase
catalogue** (`packages/shared/src/rip-phases.ts`) before the board will show it.
The scripts only need the first; the board needs both.

### Why instances are started through the backend, never against Operaton

Every start goes through `POST /v1/process/:key/start` — the same route the
board's _Starten_ button uses. That is not incidental. The backend's
`addTenantToProcessVariables` middleware stamps `municipality`,
`organisationType`, `initiator`, `assuranceLevel` and `applicantId` onto the
instance, and **every board query filters on `municipality`**.

An instance started directly against Operaton runs perfectly well and is
invisible on the board. That bug has been hit before; the scripts verify
`municipality` landed and fail loudly if it did not.

---

## `rip-phase-walkthrough.sh`

### The idea

Drive a phase through its user tasks and stop before the task(s) that would end
it — leaving the last decision for you to make in the UI.

```bash
bash scripts/rip-phase-walkthrough.sh R2.3
```

```
── Precondition for R2.3 ─────────────────────────
  OK    one eligible project: flevoland-1788331949210 (R2.2 completed, R2.3 not started)

── R2.3 — RipR23Process ─────────────────────────
  note: four parallel branches after the raming; four end events
  OK    started 50efc032-… (businessKey=flevoland-1788331949210)
  OK    municipality=flevoland
  [1] Bepalen ramingsroute VO-raming
  [2] Opstellen VO-raming
  [3] Controleren Projectraming VO
  [4] Evalueren planvoorbereiding (intern)
  OK    4 task(s) completed; stopping with 4 terminal task(s) open
```

### It enforces the same start rule as the board

This is the part worth understanding. A phase **will not start** unless its
predecessor has completed for that project and this phase has not already been
started for it — the same rule the board's _Starten_ tab applies through
`useRipPhaseReadiness`.

Without that check the script could set up states the UI can never produce — a
project in R3.1 that never did R2.4 — and a walkthrough would then "pass"
against a board that would have refused the start.

With no `--business-key`, the script resolves candidates itself, exactly as the
board does: completed instances of the predecessor, minus any whose business key
already has an instance of this phase (running **or** finished).

- **one candidate** → used automatically
- **several** → listed, pick one with `--business-key`
- **none** → refused, with the three ways forward

```
  FAIL  no project is eligible to start R3.1
  R3.1 needs a project whose R2.4 instance has COMPLETED and
  which has not already started R3.1 — the same rule the board's
  Starten tab applies.

  Run the ladder up to that point first:
    bash scripts/rip-phase-walkthrough.sh --chain
  or drive just the predecessor to completion:
    bash scripts/rip-phase-walkthrough.sh R2.4 --complete
  or start an unattached instance for isolated testing:
    bash scripts/rip-phase-walkthrough.sh R3.1 --force
```

The predecessor **skips phases with no process model**, matching
`previousModelledPhase` in the frontend catalogue. R5.3 is the case that
matters: a real step with no BPMN and no observable exit, so R5.4 will follow
R5.2.

### Walking the whole ladder

```bash
bash scripts/rip-phase-walkthrough.sh --chain
```

Starts R2.1, completes it, then starts each following phase **carrying the same
business key**, through to the last deployed phase — which stops before its
terminal task so there is something left to click through on the board.

That inheritance is the point. A business key identifies a project's whole
journey across phases, not one instance; without it the board sees seven
unrelated projects rather than one walking the ladder.

### Commands

```bash
bash scripts/rip-phase-walkthrough.sh --list              # the phase table
bash scripts/rip-phase-walkthrough.sh R2.3                # drive to the last task
bash scripts/rip-phase-walkthrough.sh R2.3 --complete     # finish the phase too
bash scripts/rip-phase-walkthrough.sh R2.3 --business-key flevoland-1788…
bash scripts/rip-phase-walkthrough.sh R2.3 --force        # skip the precondition
bash scripts/rip-phase-walkthrough.sh --chain             # whole ladder, one project
bash scripts/rip-phase-walkthrough.sh --clean <instanceId>
```

| Flag                  | Effect                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `--complete`          | Also complete the terminal task(s), so the phase finishes and the next becomes startable.                           |
| `--business-key KEY`  | Start this phase for a specific project. Still checked against the precondition unless `--force`.                   |
| `--force`             | Start an unattached instance. Warns that the board would not offer this project. For isolated testing of one phase. |
| `--project-number NR` | Sets `projectNumber` / `projectName`. Defaults to `WALK-<timestamp>`.                                               |
| `--chain`             | Walk the whole deployed ladder for one project.                                                                     |
| `--clean ID`          | Delete one instance, runtime and history.                                                                           |

### Why one script rather than one per phase

What actually varies between R2.1 and R4.1 is three lines of configuration: the
process key, which task ends the phase, and a rework-loop cap. The Keycloak
token, the start-through-the-backend behaviour, the completion loop, the
precondition check and the cleanup are identical. Seven copies would have
drifted apart by the third phase. `--list` prints the table.

### Where the phase table comes from

It is read off the **deployed BPMN**, not guessed from task names:

- _ends at_ — every user task with a path to an end event. Several phases run
  parallel branches and so end in more than one place, which is why "the last
  task" is a set rather than a single task, and why the stopping rule is
  "complete everything that is not terminal".
- _gateway variables_ — every `conditionExpression`, with the value that takes
  the happy path.

```
PHASE  PROCESS          ENDS AT
R2.1   RipR21Process    Task_AccorderenProjectplan4
R2.2   RipR22Process    Task_OpstellenDefinitiefVO Task_TerugkoppelenKlanteisen
R2.3   RipR23Process    Task_AccorderenProjectplan Task_BepalenInkoopstrategie …
R2.4   RipR24Process    Task_AccorderenProjectplanDO
R3.1   RipR31Process    Task_ToetsenBestek Task_ToetsenAanpassingenBestek …
R3.2   RipR32Process    Task_AccorderenProjectplanContractvorming
R4.1   RipR41Process    Task_AfrondenInkoopprocedure
```

### The variable bundle

One generous set of variables is sent on **every** task completion, for every
phase. Operaton does not enforce form validation on REST completion, so a single
bundle covers every form in the ladder. A missing variable is the failure that
matters — a wrong gateway branch, an em-dash in a generated document — whereas
an extra one is inert.

The `*Akkoord` values are the happy path. Two are **route choices rather than
approvals**, where both branches are legitimate and the script simply picks one:

| Variable                | Value used       | The other branch                                     |
| ----------------------- | ---------------- | ---------------------------------------------------- |
| `mbviMoment`            | `voorafgaandAan` | `tijdens` — VO-raming outsourced instead of in-house |
| `projectkredietDekking` | `binnen`         | `buiten` — adds the memo projectkrediet path         |

### When it stops early

**Completion cap.** Each phase has a cap that is a _rework-loop guard_, not a
task count. Hitting it means an `Akkoord` variable did not reach the engine and
a review branch is being driven round and round. The instance is left running so
you can inspect it, and the cleanup command is printed.

**No open task.** The script distinguishes "the phase finished" from "an
external task is in flight and nobody is consuming it" by asking the engine
whether the instance still exists, rather than guessing from an empty task list.
Only R2.1 has an external task today (`rip-relatics-workspace`), consumed by the
backend's `externalTaskWorker`.

---

## `rip-r21-to-approval.sh`

Predates the general driver and is still the right tool for **ValidSign signing
work**: it drives R2.1 specifically to `Task_AccorderenProjectplan4`, the
phase-exit signature task, and stops there.

```bash
bash scripts/rip-r21-to-approval.sh
bash scripts/rip-r21-to-approval.sh --project-number 24999
bash scripts/rip-r21-to-approval.sh --clean <instanceId>
```

> **Check the stub flags before approving.** `VALIDSIGN_STUB_MODE=false` sends a
> real signing package. `EDOCS_STUB_MODE=false` attempts a real eDOCS upload on
> completion. Both live in `packages/backend/.env.development`, and changing
> them needs a backend restart.

It sends no business key and lets the backend mint one, which is right for a
standalone R2.1 run — there is no earlier phase to attach to. Use
`rip-phase-walkthrough.sh` if you need an R2.1 instance attached to an existing
project, or want to walk further than R2.1.

---

## `rip-purge-instances.sh`

Removes every runtime and history record of the RIP phase processes, leaving the
deployed definitions in place — the "start from nothing" reset.

```bash
bash scripts/rip-purge-instances.sh              # confirms first
bash scripts/rip-purge-instances.sh --yes        # no prompt
bash scripts/rip-purge-instances.sh --dry-run    # list only
```

Scoped by process-definition key; every other process on the engine is left
alone, and it prints what remains deployed afterwards so that is visible rather
than asserted. `RIP_KEYS` overrides the key list — extend it as later phases
deploy.

Two deliberate details: history is listed **after** the runtime deletions
(cancelling a running instance _creates_ a history entry, so listing first would
leave behind exactly what the script just cancelled), and any status other than
200/204/404 is reported with a non-zero exit — a delete loop that swallows a 500
leaves you believing the engine is clean when it is not.

---

## A complete walkthrough, start to finish

```bash
# 1. Clean slate
bash scripts/rip-purge-instances.sh --yes

# 2. Walk the whole ladder for one project
bash scripts/rip-phase-walkthrough.sh --chain

# 3. Look at the board
#    Beheer → Faseladder            → deployed phases, live counts
#    Beheer → <last phase> → WIP    → the project, mid-phase
#    Portfolio                      → one row, walking the ladder
```

The chain prints the business key it used. Every phase instance shares it, which
is what makes the board show **one project** rather than seven.

To continue a specific project by hand afterwards:

```bash
bash scripts/rip-phase-walkthrough.sh <phase> --business-key <key>
```

---

## Adding a phase

When a new phase is deployed via LDE:

1. Read the key off the engine rather than assuming it:
   `curl -s "$OPERATON_URL/process-definition?latestVersion=true"`
2. Add one line to `packages/shared/src/rip-phases.ts`.
3. Update the catalogue test: remove the code from `UNMODELLED_CODES`, add an
   assertion, and if it was the `withoutKey` fixture move that to the next phase
   without a key.
4. Add a row to `phase_config()` in `rip-phase-walkthrough.sh` and append the
   phase to `LADDER`. Its _ends at_ set is every user task with a path to an end
   event; any new gateway variables go in the bundle.
5. Rebuild and clear the frontend's dependency cache:

   ```bash
   npm run build --workspace=@ronl/shared
   rm -rf packages/frontend/node_modules/.vite
   ```

   Then restart the dev servers.

> Step 5 is not optional and not obvious. Vite validates its pre-bundle cache
> against the dependency's **version**, not its content, so a rebuilt
> `@ronl/shared` is invisible to it. Restarting the dev server and hard-refreshing
> the browser both appear to do nothing.

---

## Troubleshooting

| Symptom                                                                   | Cause                                                                                                                                     |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `backend not live at http://localhost:3002`                               | The stack is down. The scripts will not start it.                                                                                         |
| `no Keycloak token for 'test-infra-flevoland'`                            | Keycloak down, wrong realm, or the client lacks direct access grants.                                                                     |
| `no project is eligible to start <phase>`                                 | Working as designed — the predecessor has not completed, or this phase already started. Use `--chain`, `<prev> --complete`, or `--force`. |
| `businessKey was not honoured`                                            | `addTenantToProcessVariables` is minting a key despite one being supplied. It should only mint when the caller sends none.                |
| `no municipality variable — the instance would be INVISIBLE on the board` | The instance was not started through the backend.                                                                                         |
| `hit the N-completion cap`                                                | A rework loop: an `Akkoord` variable did not reach the engine.                                                                            |
| `no open task appeared within 60s and the instance is still running`      | An external task nobody is consuming — check the backend's `externalTaskWorker`.                                                          |
| A phase shows _In ontwerp_ although it is deployed                        | Its key is missing from `rip-phases.ts`, or the Vite cache was not cleared.                                                               |
