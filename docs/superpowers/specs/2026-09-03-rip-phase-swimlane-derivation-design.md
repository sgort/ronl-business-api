# Swimlane models for every RIP phase, derived from deployed BPMN — design

**Goal:** show a process diagram for all eleven modelled RIP phases, not just
R2.1, and source it from what Operaton actually has deployed rather than from
hand-maintained TypeScript.

Prompted by the bug fixed in `3674f66`: `ProjectDetail` hard-coded
`currentPhaseCode = 'R2.1'` because R2.1 was once the only deployed process. The
constant was correct when written and became a lie when R2.2–R6.1 were deployed.
`FASE1_LANES/NODES/EDGES` are the same kind of fact — a hand-kept copy of
something the engine already knows — so this design removes the category rather
than adding eleven more instances of it.

---

## 1. What is already true

Every RIP BPMN carries a complete swimlane. Verified across all eleven files in
`linked-data-explorer/examples/organizations/flevoland/rip-phase-*/`:

|             | R2.1 | R2.2 | R4.1 | R6.1 |
| ----------- | ---- | ---- | ---- | ---- |
| lanes       | 9    | 4    | 7    | 6    |
| `BPMNShape` | 60   | 54   | 70   | 74   |
| `BPMNEdge`  | 44   | 52   | 58   | 68   |

Totals across the eleven: 201 `userTask`, 51 `exclusiveGateway`, 32
`parallelGateway`, 16 `endEvent`, 11 `startEvent`, 1 `serviceTask`, 361
`sequenceFlow`, 73 `conditionExpression`, 312 `flowNodeRef`.

Two findings that shaped the design:

- **Lane membership is explicit.** 312 `bpmn:flowNodeRef` entries assign every
  flow node to a lane by id. No geometric inference from DI bounds is needed,
  so no ambiguity when shapes straddle a lane boundary.
- **The `e2e-fixtures` and `examples` copies of `RipR21Process.bpmn` are
  byte-identical.** The annotation inside the file naming `e2e-fixtures/` the
  source of truth is not currently a live divergence.

The backend already reaches BPMN XML: `operaton.service.ts:589`
`getCachedBpmnXml(processDefinitionId)`, backed by `bpmnXmlCache` (line 38), and
`operaton.service.ts:1054` provides a tenant-aware
`/process-definition/key/{key}{suffix}` helper with fallback. Fetching by _key_
matters — it works for a phase with no running instance, so mock portfolio rows
get a diagram too.

`RIP_PHASE_KEYS` in `packages/shared/src/rip-phases.ts` already maps phase code
to `processDefinitionKey` for the eleven modelled phases. R5.3 has no key and is
marked `beyond` — it stays undiagrammed by design.

**Update, post-implementation:** R5.3 has since been modelled and deployed.
`RIP_PHASE_KEYS` now carries a `processDefinitionKey` for all twelve phases,
and R5.3's `beyond` special-case is gone from `rip-phases.catalog.ts`. See §8.

## 2. Why derive at runtime rather than generate files

Three options were weighed.

**Build-time codegen was rejected.** The `.bpmn` files live in a _different
repository_ (`linked-data-explorer`), so generation needs a cross-repo step
someone must remember to run. The first time nobody does, the diagram lies —
which is the bug this work exists to stop, re-created at eleven times the scale.
`rip-r21-bpmn-source-in-lde` already records that this repo's own `.bpmn` copy
went stale against the deployed one.

**Browser-side XML parsing was rejected.** It ships ~60 KB of XML per phase to
every client, re-parses on each view, and puts the subtlest logic — lane
membership, layering, back-edge detection — where it is hardest to test.

**Server-side parsing, model JSON over the wire, was chosen.** The model comes
from the engine, so a redeploy cannot silently make the UI wrong; parsing runs
in Node against real fixture files; the payload is small.

## 3. Architecture

```
Operaton ──/process-definition/key/{key}/xml──▶ operaton.service (bpmnXmlCache)
                                                       │
                                            bpmn-swimlane.ts   ← pure, no I/O
                                                       │ PhaseSwimlaneModel
                                          GET /v1/rip/phases/:code/model
                                                       │
                                  usePhaseSwimlane(code) ──▶ PhaseSwimlane.tsx
```

`bpmn-swimlane.ts` is a pure function from XML string to `PhaseSwimlaneModel`.
It performs no I/O and knows nothing about Operaton, so it is testable directly
against the eleven real `.bpmn` files as fixtures.

The model reuses the existing shapes in
`packages/frontend/src/pages/infra-board/rip-model.ts` — `SwimLane`, `SwimNode`,
`SwimEdge` — so the renderer's contract does not change:

```ts
interface PhaseSwimlaneModel {
  phaseCode: string;
  lanes: SwimLane[];
  nodes: SwimNode[];
  edges: SwimEdge[];
}
```

Both the parser's output and the renderer's input are the same types, moved to
`@ronl/shared` so backend and frontend agree by construction.

## 4. Derivation rules

| Model field      | Source                                       |
| ---------------- | -------------------------------------------- |
| `lanes[].label`  | `bpmn:lane` `name`                           |
| lane order       | DI `y` of each lane's `BPMNShape`, ascending |
| `nodes[].bpmnId` | flow node `id`                               |
| `nodes[].label`  | flow node `name`                             |
| `nodes[].kind`   | element type (see below)                     |
| node → lane      | `bpmn:flowNodeRef`                           |
| `edges[]`        | `bpmn:sequenceFlow` `sourceRef`/`targetRef`  |
| `edges[].label`  | `name`, else the `conditionExpression`       |

**`NodeKind` gains `parallel`.** Today it is
`'start' | 'end' | 'task' | 'service' | 'gateway'`, and `Fase1Swimlane` renders
every gateway as an exclusive `×` diamond. R2.1 happens to contain no parallel
gateway, but the other phases hold 32 of them, which would render as a wrong
symbol asserting wrong semantics. `parallel` renders `+`.

**Multiple end events must render.** There are 16 across 11 processes; R2.1 has
one, so the current renderer has never met a second.

## 5. Layout

The BPMN's own coordinates are read for lane ordering only and otherwise
discarded. Positions are recomputed on the grid `Fase1Swimlane` already uses, so
all twelve phases share one visual language rather than inheriting the varied
spacing of twelve hand-drawn diagrams.

- `col` — longest-path layering from the start event over forward edges.
- `row` — index of the node's lane.
- `SwimEdge.back` — an edge whose target resolves to an earlier column. Today
  this is hand-flagged in `FASE1_EDGES`; it becomes computed.

Longest-path layering is chosen over shortest-path so a node never sits left of
its own predecessor. Cycles (rework loops, of which R2.1 has several) are broken
by ignoring edges into already-layered nodes during the walk — which is the same
traversal that identifies back edges, so the two fall out together.

## 6. Document badges

The `doc` badges in today's R2.1 diagram (`1. Intake-formulier` under
**Aanleveren Projectplan**) are **not derivable**. The RIP BPMNs contain no
`formKey` and no `bpmn:documentation` elements; the labels exist only as
hand-typed strings in `FASE1_NODES`.

What the BPMN does carry is `ronl:documentRef` on 77 document-producing tasks,
as slugs (`rip-intake-report`, `rip-pdp`, `rip-projectraming`, …).

**Decision:** a badge is shown only where `ronl:documentRef` is present,
resolved through a slug→label map in `@ronl/shared`. Untagged nodes get no
badge rather than an invented one.

Consequence, stated plainly: **R2.1 will show fewer badges than it does today** —
three tagged tasks rather than the many currently hand-labelled. This is
accepted. The badge then means exactly what `ronl:documentRef` asserts.

### 6.1 The deliverables strip must be re-pointed

`FASE1_DOCS` drives the `Projectplan — onderdelen` strip below the swimlane via
`docOk(d.produceNode)` (`ProjectDetail.tsx:253`), and its `produceNode` values
are the _synthetic_ node ids that exist only inside `FASE1_NODES`. Deleting
`FASE1_NODES` therefore breaks the strip — it is not independent of the model.

Derived nodes key `statusById` by `bpmnId`, so `FASE1_DOCS` must be re-pointed:

| `produceNode` today | BPMN id                      |
| ------------------- | ---------------------------- |
| `t_aanleveren`      | `Task_AanlevrenProjectplan`  |
| `t_aanvullen2`      | `Task_AanvullenProjectplan2` |
| `t_psu`             | `Task_UitvoerenPSU`          |
| `t_aanvullen4`      | `Task_AanvullenProjectplan4` |

`FASE1_DOCS` itself stays hand-authored and R2.1-specific — it describes the
Projectplan's four parts, which is catalogue content, not process structure.
A test must assert every `produceNode` resolves to a node in the derived R2.1
model, so this coupling cannot rot silently.

The map is seeded with the 77 slugs. `externalTaskWorker.service.ts:435` already
holds three of them and should be folded into the shared map rather than left as
a second copy.

## 7. R2.1 is derived too

`FASE1_LANES`, `FASE1_NODES` and `FASE1_EDGES` are deleted. One code path, one
source of truth, and R2.1 stops drifting from its own deployment.

This changes a diagram that currently renders correctly. R2.1's curated model
has 7 lanes including a merged `Intake-overleg / Accordering`; its BPMN has 9,
including `Projectleider, Aandrager, AO` and `AO, Aandrager, Projectleider` as
distinct lanes. **The R2.1 swimlane will visibly change.** This is accepted in
exchange for removing the hand-maintained copy.

`nodeStatusFromHistory` keys on `bpmnId`, which derivation preserves, so live
done/active/action colouring extends to all eleven phases with no new work.

**`3674f66`'s `pastFase1` branch is deleted.** It marks R2.1's nodes done for an
instance in a later phase — a workaround that existed only because R2.1 was the
sole available model. With every phase modelled, the instance's own history
drives its own diagram and the special case is not merely unnecessary but wrong.

## 8. Failure behaviour

A phase whose model cannot be produced — engine unreachable, process not
deployed, XML unparseable — renders today's `nog niet gemodelleerd` panel rather
than an error state. The feature degrades to exactly the current behaviour.

R5.3 has no `processDefinitionKey`; the endpoint answers 409 for it, consistent
with the existing phase endpoints, which deliberately distinguish "not deployed"
from "deployed, no instances".

**Update, post-implementation:** R5.3 was subsequently modelled and deployed
like the other eleven phases. All twelve phases now carry a
`processDefinitionKey`, so the 409 path described above is unreached for any
of them today — it remains correct behaviour for a genuinely undeployed phase,
should one ever exist again, but there is currently no phase it applies to.

## 9. Testing

- **Parser, against all eleven real `.bpmn` files as fixtures.** Per phase:
  lane count and order, every `flowNodeRef` assigned, node kinds, edge count,
  `col` monotonic along forward edges, back edges detected. These are the tests
  that would have caught the parallel-gateway and multiple-end-event gaps.
- **R2.1 characterisation.** Assert the derived model against R2.1's known
  shape, so the one diagram with a human-verified reference stays honest.
- **Endpoint** — 200 with a model, 409 for an undeployed phase (no phase is
  currently in that state — R5.3, the one phase this applied to at design
  time, has since been modelled and deployed like the rest; see §8),
  degradation when the engine fails.
- **`FASE1_DOCS` coupling** — every `produceNode` resolves to a node in the
  derived R2.1 model (§6.1).
- **`PhaseSwimlane` component** — renders lanes and nodes from a model,
  overlays status, falls back to the not-modelled panel.

## 10. Out of scope

- Re-drawing using the BPMN's own coordinates. Grid re-flow was chosen.
- Per-phase lane merging or renaming overrides. Lanes render as the BPMN names
  them.
- ~~R5.3, which is `beyond` — no process model is planned.~~ Superseded: R5.3
  was subsequently modelled and deployed like the other eleven phases (see §8).
- Any change to how phases are started, completed, or counted.
