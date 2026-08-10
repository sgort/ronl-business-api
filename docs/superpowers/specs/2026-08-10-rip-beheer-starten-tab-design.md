# Design: Beheer — phase detail, Starten tab (sub-project C)

## Problem

The Faseladder overview (sub-project B) lists all nine RIP phases but its
rows aren't clickable — there's no detail page yet. This spec builds that
detail page's header, side panel, and Starten tab (the third of the six
sub-projects the handoff was decomposed into; see sub-project A's spec's
"Decomposition" table). WIP/Gereed tab content is sub-project D.

## Handoff package is authoritative — validated against actual reference mockups

Per standing project guidance, the handoff's own reference material outranks
guesses from the prose spec alone. The user supplied three real design-system
mockups (R2.1, R2.2, R2.3 Starten tabs) during brainstorming, which resolved
several open questions directly:

- R2.1 uses the **same generic ready-list UI** as every other phase, not a
  bespoke flow — it's simply always empty, since nothing precedes it on the
  ladder ("Geen enkel project heeft R2.1 als eerstvolgende fase").
- The generic ready-list/sequence-guard UI **is** rendered against mock data
  for undeployed phases (R2.3's mockup shows 2 mock "KLAAR" rows with
  disabled checkboxes under the "In ontwerp" banner).
- The side panel is entirely catalogue-driven — every figure shown
  (betrokken rollen, producten, review-loops, doorlooptijd, kredietbesluit,
  bron) matches a field already in sub-project A's `RIP_PHASES` catalogue,
  cross-checked line by line against the mockups.
- One field is genuinely missing: when `krediet` is true, the mockup names
  the deciding body ("Ja — Infra-overleg"), not just yes/no.

Two things the mockups suggested but this spec explicitly does **not**
adopt now (see "Out of scope" and the linked memory note
`rip-beheer-validate-after-full-deploy`): a `TEST`-vs-`LIVE` deploy
distinction (R2.2 tagged `TEST`, independently startable), and rail-item
WIP badges. Both are deferred until real phases beyond R2.1 are deployed,
per the user's explicit plan to validate design choices against real
behavior once R2.2–R5.2 exist.

## Scope

`packages/frontend` only. No new backend routes — the one real mutating
action (R2.1's process start) already exists (`POST /v1/process/:key/start`,
used today by `RipFase1Section`); every other phase is undeployed, so its
start button stays disabled regardless of what's selected.

## Design

### 1. Catalogue addition — `kredietBeslisser`

One new optional field on `RipPhase` (`rip-phases.catalog.ts`, additive to
sub-project A):

```ts
export interface RipPhase {
  // ...existing fields...
  /** Named body that decides the kredietbesluit, shown when krediet is
   *  true (e.g. "Ja — Infra-overleg"). Undefined when krediet is false. */
  kredietBeslisser?: string;
}
```

Populated per RIP-PHASES.md's actual per-phase detail: `'Infra-overleg'`
for R2.3, R2.4, R3.2 (each lists Infra-overleg in its roles and/or explicitly
names it as the deciding body); `'Concerndirecteur'` for R4.1 (its gate
text is "Over- of onderschrijding dekkingsbron?" → AO-sjabloon vs
**Concerndirecteur**-sjabloon — Concerndirecteur is the named escalation
body, and Infra-overleg does not appear in R4.1's roles list at all).

### 2. Ready-list + sequence-guard selectors

New functions in `infra-board.data.ts` (alongside `getMockPhaseCounts` from
sub-project B), operating on the same `ripPhaseCode`/`ripPhaseState`
ladder-position model:

```ts
/** Projects whose current ladder position is exactly this phase's
 *  predecessor, sitting in 'wachtend' (previous phase accorded, this one
 *  not yet started). Always empty for the first phase in ladder order —
 *  there is no predecessor to be ready from. */
export function getReadyProjects(phaseCode: string): PortfolioProject[] {
  const idx = RIP_PHASES.findIndex((p) => p.code === phaseCode);
  if (idx <= 0) return [];
  const prevCode = RIP_PHASES[idx - 1].code;
  return getMockPortfolio().filter(
    (p) => p.ripPhaseCode === prevCode && p.ripPhaseState === 'wachtend'
  );
}

/** Projects not yet in sequence for this phase — still working an earlier
 *  phase, or still 'wip' on the immediate predecessor (not yet accorded).
 *  These are the "Toon N projecten die nog niet aan beurt zijn" set. */
export function getOutOfSequenceProjects(phaseCode: string): PortfolioProject[] {
  const idx = RIP_PHASES.findIndex((p) => p.code === phaseCode);
  if (idx <= 0) return [];
  const ready = new Set(getReadyProjects(phaseCode).map((p) => p.id));
  return getMockPortfolio().filter((p) => {
    if (ready.has(p.id)) return false;
    const curIdx = RIP_PHASES.findIndex((rp) => rp.code === p.ripPhaseCode);
    return curIdx < idx; // hasn't reached this phase or its predecessor's gereed state yet
  });
}
```

Both are mock-only for now (live has nothing in `'wachtend'` state today —
`makePhase1Row` always sets `ripPhaseState: 'wip'`). No combined/annotated
rendering needed here unlike B's aggregate counts — the mockups show a
plain list, not mock-vs-live split, since a _specific project_ is either
real or it isn't; there's nothing to "combine."

### 3. Header + side panel

Both fully derived from the phase's `RipPhase` record + `getPhaseDeployStatus`
(sub-project A) — no new data beyond §1's `kredietBeslisser`:

- Header: stage eyebrow (`RIP_STAGES`), code chip + name, deploy pill
  (`RIP_DEPLOY_META`), meta strip (`entry` as "start bij", `exit` as "sluit
  met", `lead` as "trekker", `roles.length` as "betrokken rollen").
- Side panel: "Wat er gebeurt bij starten" numbered list (process instance
  per project → first task to `lead`'s queue → `docs.length` products op te
  leveren → closes on `exit`), then `weeks` (doorlooptijd norm),
  `gates.length` (review-loops), `krediet` ? `kredietBeslisser` : `'Nee'`,
  and `bron`.

### 4. Starten tab UI

- Ready-list: one row per `getReadyProjects(phaseCode)` project — nr, naam,
  a "KLAAR" badge, subtext "Vorige fase afgerond · {role label}" (the
  project's own `role` field, already in `PortfolioProject`). Checkbox
  per row.
- Checkboxes disabled whenever `getPhaseDeployStatus(phase, deployedKeys)
!== 'gedeployed'` (sub-project A) — matching R2.3's mockup exactly
  (rows visible, `KLAAR` badges shown, checkboxes greyed).
- Not-deployed banner (reusing B's deploy-status + Klaar count):
  `"In ontwerp — Overzichtsplaat bekend, procesmodel nog niet gemodelleerd.
Starten is nog niet mogelijk. Er staan wel {N} projecten klaar voor deze
fase."` where N is `getReadyProjects(phaseCode).length`.
- "Toon {N} projecten die nog niet aan beurt zijn" toggle reveals
  `getOutOfSequenceProjects(phaseCode)` rows, each requiring an
  **afwijkingsreden** textarea (min. 4 characters) before that row's
  checkbox can be selected. No role/approver gate beyond standard Beheer
  auth (per brainstorming decision — matches `ARCHITECTURE.md`'s current
  documented default).
- R2.1 special case: `getReadyProjects('R2.1')` is always `[]` (no
  predecessor) — when the ready-list is empty **and** the phase has no
  predecessor (`RIP_PHASES[0].code === phaseCode`), render today's existing
  single-button "R2.1 starten" flow (`businessApi.process.start('RipPhase1Process',
{})`, no project selection) as a visible fallback in place of the empty
  ready-list message, folding `RipFase1Section`'s current behavior into this
  page rather than leaving it stranded on its own rail item.

### 5. Start action + idempotency

- For deployed phases with a non-empty selection: call
  `businessApi.process.start(phase.processDefinitionKey, {})` once per
  selected project (today, only ever exercised for R2.1's fallback path,
  since every other phase's checkboxes are disabled while undeployed).
- Idempotency: a `submitting` boolean guards the button — set on click,
  cleared on response (success or failure) — so a double-click can't fire
  two requests. This is a **frontend-only** safeguard; there is no
  backend idempotency key today (`businessKey` isn't even passed by the
  existing call), so a genuine double-submit from two different tabs/devices
  isn't caught. Documented as a known limitation, not solved here — solving
  it properly means adding a real idempotency key to the start endpoint,
  which is out of scope for this sub-project.

### 6. Tab shell + routing

- Three tabs (Starten / WIP / Gereed) with real badge counts: Starten's
  badge is `getReadyProjects(phaseCode).length`; WIP/Gereed badges reuse
  sub-project B's combined counts. Only Starten's tab content is built here
  — WIP/Gereed render a plain placeholder noting sub-project D builds them.
- Faseladder overview rows (sub-project B, currently non-interactive)
  become clickable, navigating to this detail page for that phase.
- The `fase-r2-1`-style rail ids (sub-project B's Task 7, currently
  normalized to fall back onto the overview) now route to this detail page
  for their specific phase instead.

## Testing

- `rip-phases.catalog.test.ts` — `kredietBeslisser` present for R2.3/R2.4/
  R3.2/R4.1, absent elsewhere; unaffected phases' existing assertions still
  pass.
- `infra-board.data.test.ts` — `getReadyProjects`/`getOutOfSequenceProjects`:
  empty for the first phase in ladder order; correct partitioning for a
  mid-ladder phase (ready = predecessor+wachtend, out-of-sequence = the
  rest not yet through the predecessor); every project accounted for
  exactly once across ready/out-of-sequence/neither (already-past or
  already-at-this-phase) for a given phase.
- New `PhaseDetail.test.tsx` (or similarly named) — header/side-panel
  figures render from the catalogue; not-deployed banner shows the correct
  count and disables checkboxes; sequence-guard reveal shows/hides the
  out-of-sequence list; afwijkingsreden gates the start button (empty/too
  short = disabled, ≥4 chars = enabled) for an out-of-sequence selection;
  R2.1's fallback single-button renders when the ready-list is empty and
  the phase has no predecessor; double-click submits at most once (mocked
  API call count).
- `FaseladderOverview.test.tsx` (sub-project B, extend) — rows are now
  clickable and navigate correctly (this flips the "does not render table
  rows as clickable" assertion from B — update it here since B explicitly
  deferred this to C).

## Out of scope

- WIP/Gereed tab content — sub-project D.
- `TEST`-vs-`LIVE` deploy-state distinction — deferred per
  `rip-beheer-validate-after-full-deploy` memory note, revisit once a real
  phase is actually in a pilot/test state.
- Rail-item WIP badges — same deferral as sub-project B's Task 7.
- Real backend idempotency key for process starts — documented limitation,
  not solved here.
- A genuine "create brand-new R2.1 project" flow beyond today's existing
  no-picker single button — the underlying project-registry gap (how a
  project ever enters the ladder before R2.1) stays open.
