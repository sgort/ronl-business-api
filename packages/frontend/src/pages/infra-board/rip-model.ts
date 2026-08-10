/**
 * RIP domain model for the Infra-board dashboard.
 *
 * The Fase-1 swimlane (lanes, tasks, gateways, sequence flows) mirrors the
 * deployed BPMN `RipPhase1Process` ("RIP Fase 1 — R2.1 Projectplan
 * Planvoorbereiding"). `bpmnId` on each node is the BPMN flowNode id, so the
 * engine's activity-history can drive node status live.
 *
 * NOTE: only Fase 1 (R2.1) is modelled. Fases 2–6 are lifecycle placeholders.
 */

export type StatusKey = 'done' | 'active' | 'risk' | 'overdue' | 'action' | 'todo';

export const STATUS: Record<
  StatusKey,
  { label: string; short: string; color: string; glyph: string }
> = {
  done: { label: 'Afgerond', short: 'Afgerond', color: '#3fa535', glyph: '✓' },
  active: { label: 'Loopt', short: 'Loopt', color: '#0046ad', glyph: '●' },
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

export interface Phase {
  n: number;
  code: string;
  name: string;
  defaultName: string;
}

/** Lifecycle phases. Fase 1 is authoritative; 2–6 are placeholders. */
export const PHASES: Phase[] = [
  {
    n: 1,
    code: 'R2.1',
    name: 'Projectplan Planvoorbereiding',
    defaultName: 'Projectplan Planvoorbereiding',
  },
  { n: 2, code: 'R2.2', name: 'Planuitwerking (VO)', defaultName: 'Planuitwerking (VO)' },
  { n: 3, code: 'R2.3', name: 'Definitief ontwerp', defaultName: 'Definitief ontwerp' },
  { n: 4, code: 'R2.4', name: 'Aanbesteding', defaultName: 'Aanbesteding' },
  { n: 5, code: 'R3', name: 'Uitvoering', defaultName: 'Uitvoering' },
  { n: 6, code: 'R4', name: 'Decharge', defaultName: 'Decharge' },
];

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

/** The four Projectplan-onderdelen, in order. `produceNode` = swimlane node that finalises it. */
export const FASE1_DOCS = [
  { key: 'intakeform', nr: '1', label: 'Intake-formulier', produceNode: 't_aanleveren' },
  { key: 'intake', nr: '2', label: 'Intake-verslag', produceNode: 't_aanvullen2' },
  { key: 'psu', nr: '3', label: 'PSU-verslag', produceNode: 't_psu' },
  { key: 'vou', nr: '4', label: 'Uitgangspunten VO-fase', produceNode: 't_aanvullen4' },
] as const;

// ── Swimlane layout ─────────────────────────────────────────────────────────
export interface SwimLane {
  key: string;
  label: string;
}
export const FASE1_LANES: SwimLane[] = [
  { key: 'aandrager', label: 'Aandrager' },
  { key: 'manager-pb', label: 'Manager Projectbeheersing' },
  { key: 'gezamenlijk', label: 'Intake-overleg / Accordering' },
  { key: 'projectleider', label: 'Projectleider' },
  { key: 'projectondersteuner', label: 'Projectondersteuner' },
  { key: 'deelnemers-psu', label: 'Deelnemers PSU' },
  { key: 'rip-team', label: 'RIP-team' },
];
const ROW = Object.fromEntries(FASE1_LANES.map((l, i) => [l.key, i]));
const ROW_TO_LANE_KEY: string[] = FASE1_LANES.map((l) => l.key);

export type NodeKind = 'start' | 'end' | 'task' | 'service' | 'gateway';
export interface SwimNode {
  id: string;
  kind: NodeKind;
  col: number;
  row: number;
  label: string;
  doc?: string;
  /** BPMN flowNode id — used to map live activity-history onto the node. */
  bpmnId: string;
}

export const FASE1_NODES: SwimNode[] = [
  {
    id: 'start',
    kind: 'start',
    col: 0,
    row: ROW['aandrager'],
    label: 'Start RIP fase 1',
    bpmnId: 'StartEvent_RipPhase1',
  },
  {
    id: 't_aanleveren',
    kind: 'task',
    col: 1,
    row: ROW['aandrager'],
    label: 'Aanleveren Projectplan',
    doc: '1. Intake-formulier',
    bpmnId: 'Task_AanlevrenProjectplan',
  },
  {
    id: 't_organiseren',
    kind: 'task',
    col: 2,
    row: ROW['manager-pb'],
    label: 'Organiseren intake-overleg',
    bpmnId: 'Task_OrganiserenIntakeoverleg',
  },
  {
    id: 't_uitvoeren',
    kind: 'task',
    col: 3,
    row: ROW['gezamenlijk'],
    label: 'Uitvoeren intake-overleg',
    bpmnId: 'Task_UitvoerenIntakeoverleg',
  },
  {
    id: 'g_intake',
    kind: 'gateway',
    col: 4,
    row: ROW['gezamenlijk'],
    label: 'Intake akkoord?',
    bpmnId: 'Gateway_IntakeAkkoord',
  },
  {
    id: 't_verbeteren',
    kind: 'task',
    col: 5,
    row: ROW['aandrager'],
    label: 'Verbeteren kwaliteit',
    doc: '1. Intake-formulier',
    bpmnId: 'Task_VerberenKwaliteit',
  },
  {
    id: 't_aanvullen2',
    kind: 'task',
    col: 5,
    row: ROW['projectleider'],
    label: 'Aanvullen Projectplan',
    doc: '2. Intake-verslag',
    bpmnId: 'Task_AanvullenProjectplan2',
  },
  {
    id: 't_accorderen2',
    kind: 'task',
    col: 6,
    row: ROW['gezamenlijk'],
    label: 'Accorderen Projectplan',
    doc: '2. Intake-verslag',
    bpmnId: 'Task_AccorderenProjectplan2',
  },
  {
    id: 'g_akkoord2',
    kind: 'gateway',
    col: 7,
    row: ROW['gezamenlijk'],
    label: 'Akkoord?',
    bpmnId: 'Gateway_Akkoord2',
  },
  {
    id: 't_psu_init',
    kind: 'task',
    col: 8,
    row: ROW['projectleider'],
    label: 'Initiëren / organiseren PSU',
    bpmnId: 'Task_InitierenPSU',
  },
  {
    id: 't_relatics',
    kind: 'service',
    col: 9,
    row: ROW['projectondersteuner'],
    label: 'Aanmaken workspace Relatics',
    bpmnId: 'Task_AanmakenWorkspaceRelatics',
  },
  {
    id: 't_risico',
    kind: 'task',
    col: 10,
    row: ROW['manager-pb'],
    label: 'Opstellen risicodossier',
    bpmnId: 'Task_OpstellenRisicodossier',
  },
  {
    id: 't_psu',
    kind: 'task',
    col: 11,
    row: ROW['deelnemers-psu'],
    label: 'Uitvoeren PSU',
    doc: '3. PSU-verslag',
    bpmnId: 'Task_UitvoerenPSU',
  },
  {
    id: 't_planning',
    kind: 'task',
    col: 12,
    row: ROW['manager-pb'],
    label: 'Opstellen planning',
    bpmnId: 'Task_OpstellenPlanning',
  },
  {
    id: 't_aanvullen4',
    kind: 'task',
    col: 13,
    row: ROW['projectleider'],
    label: 'Aanvullen Projectplan',
    doc: '4. Uitgangspunten VO-fase',
    bpmnId: 'Task_AanvullenProjectplan4',
  },
  {
    id: 't_overlegvo',
    kind: 'task',
    col: 14,
    row: ROW['rip-team'],
    label: 'Overleg uitgangspunten VO-fase',
    bpmnId: 'Task_HoudenOverlegVO',
  },
  {
    id: 't_accorderen4',
    kind: 'task',
    col: 15,
    row: ROW['gezamenlijk'],
    label: 'Accorderen Projectplan',
    doc: '4. Uitgangspunten VO-fase',
    bpmnId: 'Task_AccorderenProjectplan4',
  },
  {
    id: 'g_akkoord4',
    kind: 'gateway',
    col: 16,
    row: ROW['gezamenlijk'],
    label: 'Akkoord?',
    bpmnId: 'Gateway_Akkoord4',
  },
  {
    id: 'end',
    kind: 'end',
    col: 17,
    row: ROW['aandrager'],
    label: 'Fase 1 voltooid → R2.2',
    bpmnId: 'EndEvent_Phase1Complete',
  },
];

export interface SwimEdge {
  from: string;
  to: string;
  label?: string;
  back?: boolean;
}
export const FASE1_EDGES: SwimEdge[] = [
  { from: 'start', to: 't_aanleveren' },
  { from: 't_aanleveren', to: 't_organiseren' },
  { from: 't_organiseren', to: 't_uitvoeren' },
  { from: 't_uitvoeren', to: 'g_intake' },
  { from: 'g_intake', to: 't_aanvullen2', label: 'Ja' },
  { from: 'g_intake', to: 't_verbeteren', label: 'Nee' },
  { from: 't_verbeteren', to: 't_accorderen2' },
  { from: 't_aanvullen2', to: 't_accorderen2' },
  { from: 't_accorderen2', to: 'g_akkoord2' },
  { from: 'g_akkoord2', to: 't_psu_init', label: 'akkoord' },
  { from: 'g_akkoord2', to: 't_aanvullen2', label: 'niet akkoord', back: true },
  { from: 't_psu_init', to: 't_relatics' },
  { from: 't_relatics', to: 't_risico' },
  { from: 't_risico', to: 't_psu' },
  { from: 't_psu', to: 't_planning' },
  { from: 't_planning', to: 't_aanvullen4' },
  { from: 't_aanvullen4', to: 't_overlegvo' },
  { from: 't_overlegvo', to: 't_accorderen4' },
  { from: 't_accorderen4', to: 'g_akkoord4' },
  { from: 'g_akkoord4', to: 'end', label: 'akkoord' },
  { from: 'g_akkoord4', to: 't_aanvullen4', label: 'niet akkoord', back: true },
];

import type { ActivityHistoryItem } from '@ronl/shared';

/**
 * Map live engine activity-history onto a status per swimlane node.
 *
 * - activity finished (endTime set, not canceled)  → 'done'
 * - activity running (no endTime)                  → 'active' (or 'action' if it
 *   is the user task currently assigned to / claimable by the current user)
 * - never reached                                  → 'todo'
 *
 * Pass `openTaskDefKeys` (the taskDefinitionKeys of the user's open tasks, from
 * businessApi.task.list()) to surface "actie nodig" on the node awaiting them.
 */
export function nodeStatusFromHistory(
  history: ActivityHistoryItem[],
  openTaskBpmnIds: ReadonlySet<string> = new Set()
): Record<string, StatusKey> {
  const byActivity = new Map<string, ActivityHistoryItem[]>();
  for (const h of history) {
    const arr = byActivity.get(h.activityId) ?? [];
    arr.push(h);
    byActivity.set(h.activityId, arr);
  }
  const out: Record<string, StatusKey> = {};
  for (const node of FASE1_NODES) {
    const items = byActivity.get(node.bpmnId) ?? [];
    if (items.length === 0) {
      out[node.id] = 'todo';
      continue;
    }
    const running = items.some((i) => !i.endTime && !i.canceled);
    if (running) {
      out[node.id] = openTaskBpmnIds.has(node.bpmnId) ? 'action' : 'active';
    } else if (items.some((i) => i.endTime && !i.canceled)) {
      out[node.id] = 'done';
    } else {
      out[node.id] = 'todo';
    }
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
 * Derives the current-step summary for one process instance from its
 * activity history. The running node (no endTime, not canceled) is the
 * current step; if it's the target of a `back: true` edge, the gateway
 * that sent it back is surfaced as `blocked`. R2.1-specific —
 * FASE1_NODES/FASE1_EDGES model only R2.1's BPMN.
 */
export function getWipStepInfo(history: ActivityHistoryItem[]): WipStepInfo | null {
  const running = history.find((h) => !h.endTime && !h.canceled);
  if (!running) return null;
  const node = FASE1_NODES.find((n) => n.bpmnId === running.activityId);
  if (!node) return null;
  const backEdge = FASE1_EDGES.find((e) => e.back && e.to === node.id);
  const blocked = backEdge
    ? (FASE1_NODES.find((n) => n.id === backEdge.from)?.label ?? null)
    : null;
  const daysInStep = Math.floor(
    (Date.now() - new Date(running.startTime).getTime()) / (1000 * 60 * 60 * 24)
  );
  return {
    step: node.label,
    stepRole: roleByKey(ROW_TO_LANE_KEY[node.row]).label,
    daysInStep,
    blocked,
  };
}

/**
 * Counts rework-loop re-executions in a (typically completed) instance's
 * activity history: for each `back: true` edge in FASE1_EDGES, its target
 * node's bpmnId is counted once per execution beyond the first — the
 * first execution is the normal forward pass, not a loop.
 */
export function countReworkLoops(history: ActivityHistoryItem[]): number {
  const backTargetBpmnIds = new Set(
    FASE1_EDGES.filter((e) => e.back)
      .map((e) => FASE1_NODES.find((n) => n.id === e.to)?.bpmnId)
      .filter((id): id is string => !!id)
  );
  let loops = 0;
  for (const bpmnId of backTargetBpmnIds) {
    const count = history.filter((h) => h.activityId === bpmnId).length;
    loops += Math.max(0, count - 1);
  }
  return loops;
}
