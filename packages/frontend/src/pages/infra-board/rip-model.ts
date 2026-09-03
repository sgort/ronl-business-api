import type { ActivityHistoryItem } from '@ronl/shared';

/**
 * RIP domain model for the Infra-board dashboard.
 *
 * Every phase's swimlane (lanes, tasks, gateways, sequence flows) is derived
 * from its deployed BPMN by `parseSwimlane` (backend) and served through
 * `usePhaseSwimlane` — see `PhaseSwimlaneModel` in `@ronl/shared`. `bpmnId` on
 * each node is the BPMN flowNode id, and equals the node's own `id` in the
 * derived model, so the engine's activity-history can drive node status
 * directly without a separate translation table.
 *
 * This module keeps only what a derived model cannot supply on its own: the
 * status/health vocabulary, R2.1's four Projectplan-onderdelen and the
 * history-derivation helpers that read them.
 */

export type StatusKey = 'done' | 'active' | 'wachtend' | 'risk' | 'overdue' | 'action' | 'todo';

export const STATUS: Record<
  StatusKey,
  { label: string; short: string; color: string; glyph: string }
> = {
  done: { label: 'Afgerond', short: 'Afgerond', color: '#3fa535', glyph: '✓' },
  active: { label: 'Loopt', short: 'Loopt', color: '#0046ad', glyph: '●' },
  wachtend: { label: 'Wachtend', short: 'Wacht', color: '#7a5af0', glyph: '○' },
  risk: { label: 'Risico', short: 'Risico', color: '#e5b700', glyph: '▲' },
  overdue: { label: 'Te laat', short: 'Te laat', color: '#b0103c', glyph: '■' },
  action: { label: 'Actie nodig', short: 'Actie', color: '#e70077', glyph: '!' },
  todo: { label: 'Niet gestart', short: 'Gepland', color: '#c2c7d0', glyph: '' },
};

export type HealthKey = 'groen' | 'geel' | 'rood';
export const HEALTH: Record<HealthKey, { label: string; color: string }> = {
  groen: { label: 'Op schema', color: '#3fa535' },
  geel: { label: 'Aandacht', color: '#e5b700' },
  rood: { label: 'Risico', color: '#b0103c' },
};

export interface RoleDef {
  key: string;
  label: string;
  short: string;
}
/** BPMN candidate groups / swimlane actors. */
export const ROLES: RoleDef[] = [
  { key: 'aandrager', label: 'Aandrager', short: 'AND' },
  { key: 'manager-pb', label: 'Manager Projectbeheersing', short: 'MPB' },
  { key: 'projectleider', label: 'Projectleider', short: 'PL' },
  { key: 'projectondersteuner', label: 'Projectondersteuner', short: 'PO' },
  { key: 'deelnemers-psu', label: 'Deelnemers PSU', short: 'PSU' },
  { key: 'rip-team', label: 'RIP-team', short: 'RIP' },
  { key: 'gezamenlijk', label: 'AO · Aandrager · PL', short: 'AO' },
];
export const roleByKey = (k: string): RoleDef => ROLES.find((r) => r.key === k) ?? ROLES[0];

/** The four Projectplan-onderdelen, in order. `produceNode` = the BPMN task
 *  id (see `RipR21Process`) whose completion finalises it — a real BPMN id
 *  now, not a synthetic local one, since `statusById` is keyed by `bpmnId`.
 *  Covered by the coupling test in `bpmn-swimlane.test.ts`, which asserts
 *  every one of these ids resolves to a node in the derived R2.1 model. */
export const FASE1_DOCS = [
  {
    key: 'intakeform',
    nr: '1',
    label: 'Intake-formulier',
    produceNode: 'Task_AanlevrenProjectplan',
  },
  { key: 'intake', nr: '2', label: 'Intake-verslag', produceNode: 'Task_AanvullenProjectplan2' },
  { key: 'psu', nr: '3', label: 'PSU-verslag', produceNode: 'Task_UitvoerenPSU' },
  {
    key: 'vou',
    nr: '4',
    label: 'Uitgangspunten VO-fase',
    produceNode: 'Task_AanvullenProjectplan4',
  },
] as const;

// The hand-maintained FASE1_LANES/FASE1_NODES/FASE1_EDGES layout (and its
// local NodeKind/SwimLane/SwimNode/SwimEdge types) is gone — every phase's
// layout, including R2.1's, now comes from `usePhaseSwimlane` /
// `parseSwimlane`. Re-export the shared vocabulary so existing importers of
// these type names keep working.
export type { NodeKind, SwimLane, SwimNode, SwimEdge } from '@ronl/shared';

/**
 * Map live engine activity-history onto a status per swimlane node.
 *
 * - activity finished (endTime set, not canceled)  → 'done'
 * - activity running (no endTime)                  → 'active' (or 'action' if it
 *   is the user task currently assigned to / claimable by the current user)
 * - never reached                                  → 'todo' (the caller need
 *   not set this explicitly — `PhaseSwimlane`'s renderer already defaults an
 *   absent id to 'todo')
 *
 * Keys the result by the history's own `activityId` — which is a BPMN flowNode
 * id, the same id a derived model's nodes use for their own `id`/`bpmnId` — so
 * this works for any phase's model, not only R2.1's.
 *
 * Pass `openTaskBpmnIds` (the taskDefinitionKeys of the user's open tasks,
 * from businessApi.task.list()) to surface "actie nodig" on the node awaiting
 * them.
 */
export function nodeStatusFromHistory(
  history: ActivityHistoryItem[],
  openTaskBpmnIds: ReadonlySet<string> = new Set()
): Record<string, StatusKey> {
  const out: Record<string, StatusKey> = {};
  for (const h of history) {
    const running = !h.endTime && !h.canceled;
    if (running) out[h.activityId] = openTaskBpmnIds.has(h.activityId) ? 'action' : 'active';
    else if (h.endTime && !h.canceled && out[h.activityId] !== 'active') out[h.activityId] = 'done';
  }
  return out;
}

export interface WipStepInfo {
  step: string;
  stepRole: string;
  daysInStep: number;
  blocked: string | null;
}

/**
 * R2.1 node → swimlane-role mapping, by BPMN id. `getWipStepInfo` is out of
 * scope for the swimlane-derivation plan (see task-7-brief.md / SDD ledger
 * Ruling 2) and must not change what it returns for R2.1, but its `stepRole`
 * and `blocked` fields need exactly the per-node lane and back-edge data that
 * `FASE1_NODES`/`FASE1_EDGES` used to supply. This is that data's surviving
 * remnant — kept ONLY for this one WIP-tab field, deliberately not reused
 * for the swimlane itself (which is fully derived). Unlike the swimlane, this
 * table is not covered by the `bpmn-swimlane.test.ts` coupling test: if a
 * task is ever moved to a different lane in the BPMN, this goes stale and the
 * WIP tab's role column is wrong until someone notices and updates it here.
 */
const FASE1_NODE_ROLE: Record<string, string> = {
  StartEvent_RipPhase1: 'aandrager',
  Task_AanlevrenProjectplan: 'aandrager',
  Task_OrganiserenIntakeoverleg: 'manager-pb',
  Task_UitvoerenIntakeoverleg: 'gezamenlijk',
  Gateway_IntakeAkkoord: 'gezamenlijk',
  Task_VerberenKwaliteit: 'aandrager',
  Task_AanvullenProjectplan2: 'projectleider',
  Task_AccorderenProjectplan2: 'gezamenlijk',
  Gateway_Akkoord2: 'gezamenlijk',
  Task_InitierenPSU: 'projectleider',
  Task_AanmakenWorkspaceRelatics: 'projectondersteuner',
  Task_OpstellenRisicodossier: 'manager-pb',
  Task_UitvoerenPSU: 'deelnemers-psu',
  Task_OpstellenPlanning: 'manager-pb',
  Task_AanvullenProjectplan4: 'projectleider',
  Task_HoudenOverlegVO: 'rip-team',
  Task_AccorderenProjectplan4: 'gezamenlijk',
  Gateway_Akkoord4: 'gezamenlijk',
  EndEvent_Phase1Complete: 'aandrager',
};

/** R2.1's rework-loop targets, by BPMN id — the surviving remnant of the
 *  deleted FASE1_EDGES. A task reached more than once means a loop ran. */
export const FASE1_REWORK_TARGETS = [
  'Task_AanvullenProjectplan2',
  'Task_AanvullenProjectplan4',
] as const;

/** The gateway that sends each FASE1_REWORK_TARGETS entry back for rework —
 *  both of R2.1's rework gateways (Gateway_Akkoord2, Gateway_Akkoord4) are
 *  named "Akkoord?" in the BPMN, so this collapses to one literal. Used by
 *  `getWipStepInfo`'s `blocked` field alongside FASE1_NODE_ROLE above. */
const FASE1_REWORK_ORIGIN_LABEL = 'Akkoord?';

/**
 * Derives the current-step summary for one process instance from its
 * activity history. The running node (no endTime, not canceled) is the
 * current step; if it's one of FASE1_REWORK_TARGETS and this is a repeat
 * execution, the originating gateway is surfaced as `blocked`. R2.1-specific
 * — an activity id outside FASE1_NODE_ROLE (i.e. not one of R2.1's own BPMN
 * nodes) yields null, exactly as it did when this looked nodes up in
 * FASE1_NODES.
 */
export function getWipStepInfo(history: ActivityHistoryItem[]): WipStepInfo | null {
  const running = history.find((h) => !h.endTime && !h.canceled);
  if (!running) return null;
  const roleKey = FASE1_NODE_ROLE[running.activityId];
  if (!roleKey) return null;
  const step = running.activityName;
  if (!step) return null;
  // A rework-target node is only "blocked" if this is a genuine rework
  // re-execution — i.e. this activityId has run before. Two FASE1 nodes
  // (Task_AanvullenProjectplan2, Task_AanvullenProjectplan4) are ALSO the
  // normal forward-path target of an earlier task/gateway, so a first-ever
  // visit must not be reported as blocked just because the node is one of
  // FASE1_REWORK_TARGETS.
  const executionCount = history.filter((h) => h.activityId === running.activityId).length;
  const isReworkTarget = (FASE1_REWORK_TARGETS as readonly string[]).includes(running.activityId);
  const blocked = isReworkTarget && executionCount > 1 ? FASE1_REWORK_ORIGIN_LABEL : null;
  const daysInStep = Math.floor(
    (Date.now() - new Date(running.startTime).getTime()) / (1000 * 60 * 60 * 24)
  );
  return {
    step,
    stepRole: roleByKey(roleKey).label,
    daysInStep,
    blocked,
  };
}

/**
 * Counts rework-loop re-executions in a (typically completed) instance's
 * activity history: for each id in FASE1_REWORK_TARGETS, it is counted once
 * per execution beyond the first — the first execution is the normal
 * forward pass, not a loop.
 */
export function countReworkLoops(history: ActivityHistoryItem[]): number {
  let loops = 0;
  for (const bpmnId of FASE1_REWORK_TARGETS) {
    const count = history.filter((h) => h.activityId === bpmnId).length;
    loops += Math.max(0, count - 1);
  }
  return loops;
}

export interface DocProgress {
  docsDone: number;
  docsTotal: number;
}

/**
 * Product-progress for a live R2.1 instance: how many of FASE1_DOCS are
 * finished, per nodeStatusFromHistory's node-status derivation.
 */
export function getDocProgress(history: ActivityHistoryItem[]): DocProgress {
  const status = nodeStatusFromHistory(history);
  const docsDone = FASE1_DOCS.filter((d) => status[d.produceNode] === 'done').length;
  return { docsDone, docsTotal: FASE1_DOCS.length };
}
