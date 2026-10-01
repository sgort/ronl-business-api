/**
 * Kapvergunning test fixtures for the caseworker procesweergave: models
 * shaped like the parser's output for AwbShellProcess and
 * TreeFellingPermitSubProcess, and the two timelines of screenshots 03
 * (review task in the subprocess) and 06 (Fase-6 task after it).
 */
import type { ActivityHistoryItem, PhaseSet, PhaseSwimlaneModel, SwimNode } from '@ronl/shared';
import type { ProcessContext } from '../components/process/processContext';

export const A = 'AwbShellProcess';
export const S = 'TreeFellingPermitSubProcess';
export const AAN = 'Lane_Aanvrager';
export const BEH = 'Lane_Behandelaar';
export const SYS = 'Lane_Systeem';

const n = (
  id: string,
  kind: SwimNode['kind'],
  row: number,
  col: number,
  label: string,
  extra: Partial<SwimNode> = {}
): SwimNode => ({ id, bpmnId: id, kind, row, col, label, ...extra });

/** The phase set the parser attaches to an Awb-marked model. */
export const AWB_SET: PhaseSet = {
  scheme: 'awb',
  label: 'Awb-fase',
  phases: [
    { code: '1', name: 'Rechtsbetrekking', codeLabel: 'Fase 1' },
    { code: '2', name: 'Ontvangst', codeLabel: 'Fase 2' },
    { code: '3', name: 'Ontvankelijkheid', codeLabel: 'Fase 3' },
    { code: '4+5', name: 'Behandeling en besluit', codeLabel: 'Fase 4+5' },
    { code: '6', name: 'Bekendmaking', codeLabel: 'Fase 6' },
    { code: '7', name: 'Betaling', codeLabel: 'Fase 7' },
    { code: '8', name: 'Ketenproces', codeLabel: 'Fase 8' },
    { code: 'archivering', name: 'Archivering', codeLabel: 'Archiefwet' },
  ],
};

// Shaped like the parser's output for the two kapvergunning BPMNs.
export const SHELL: PhaseSwimlaneModel = {
  phaseCode: A,
  processKey: A,
  processName: 'Awb Generiek proces',
  phaseSet: AWB_SET,
  lanes: [
    { key: AAN, label: 'Aanvrager' },
    { key: BEH, label: 'Behandelaar', candidateGroups: ['caseworker'] },
    { key: SYS, label: 'Systeem' },
  ],
  nodes: [
    n('StartEvent_AWB', 'start', 0, 0, 'Aanvraag ingediend', { phase: '1' }),
    n('Task_Phase1_Identity', 'script', 2, 1, 'Fase 1: Rechtsbetrekking', { phase: '1' }),
    n('Task_Phase3_Completeness', 'rule', 2, 2, 'Fase 3: Ontvankelijkheidstoets', {
      phase: '3',
      dmn: 'AwbCompletenessCheck',
    }),
    n('Gateway_Complete', 'gateway', 2, 3, 'Aanvraag volledig?', { phase: '3' }),
    n('Task_RequestMissingInfo', 'task', 1, 4, 'Aanvullende gegevens opvragen (Awb 4:5)', {
      phase: '3',
    }),
    n('Task_Phase45_Process', 'call', 1, 5, 'Fase 4+5: Behandeling en besluit', {
      phase: '4+5',
      calls: S,
    }),
    n('Task_Phase6_Notify', 'task', 1, 6, 'Fase 6: Aanvrager informeren', {
      phase: '6',
      docs: ['Beschikking kapvergunning'],
    }),
    n('Gateway_Payment', 'gateway', 2, 7, 'Betaling vereist?', { phase: '7' }),
    n('Task_Phase7_Payment', 'script', 2, 8, 'Fase 7: Betaling verwerken', { phase: '7' }),
    n('EndEvent_AWB', 'end', 2, 9, 'Dossier gesloten', { phase: 'archivering' }),
  ],
  edges: [
    { from: 'StartEvent_AWB', to: 'Task_Phase1_Identity' },
    { from: 'Task_Phase1_Identity', to: 'Task_Phase3_Completeness' },
    { from: 'Task_Phase3_Completeness', to: 'Gateway_Complete' },
    { from: 'Gateway_Complete', to: 'Task_Phase45_Process', label: 'ja' },
    { from: 'Gateway_Complete', to: 'Task_RequestMissingInfo', label: 'nee' },
    { from: 'Task_RequestMissingInfo', to: 'Task_Phase45_Process' },
    { from: 'Task_Phase45_Process', to: 'Task_Phase6_Notify' },
    { from: 'Task_Phase6_Notify', to: 'Gateway_Payment' },
    { from: 'Gateway_Payment', to: 'Task_Phase7_Payment', label: 'ja' },
    { from: 'Gateway_Payment', to: 'EndEvent_AWB', label: 'nee' },
    { from: 'Task_Phase7_Payment', to: 'EndEvent_AWB' },
  ],
};

export const SUB: PhaseSwimlaneModel = {
  phaseCode: S,
  processKey: S,
  processName: 'Kapvergunning - Behandeling en besluit',
  phaseSet: AWB_SET,
  lanes: [
    { key: BEH, label: 'Behandelaar', candidateGroups: ['caseworker'] },
    { key: SYS, label: 'Systeem' },
  ],
  nodes: [
    n('SubStart', 'start', 1, 0, 'Start behandeling', { phase: '4+5' }),
    n('Sub_AssessPermit', 'rule', 1, 1, 'Kapvergunning beoordelen (APV)', {
      phase: '4+5',
      dmn: 'TreeFellingDecision',
    }),
    n('Sub_CaseReview', 'task', 0, 2, 'Beoordeling behandelaar', { phase: '4+5' }),
    n('Sub_ResolveDecision', 'script', 1, 3, 'Definitief besluit vaststellen', { phase: '4+5' }),
    n('Sub_FinalGateway', 'gateway', 1, 4, 'Vergunning verleend?', { phase: '4+5' }),
    n('Sub_SetGranted', 'script', 1, 5, 'Besluit: Verleend', { phase: '4+5' }),
    n('Sub_SetRejected', 'script', 1, 5, 'Besluit: Geweigerd', { phase: '4+5' }),
    n('SubEnd', 'end', 1, 6, 'Besluit gereed', { phase: '4+5' }),
  ],
  edges: [
    { from: 'SubStart', to: 'Sub_AssessPermit' },
    { from: 'Sub_AssessPermit', to: 'Sub_CaseReview' },
    { from: 'Sub_CaseReview', to: 'Sub_ResolveDecision' },
    { from: 'Sub_ResolveDecision', to: 'Sub_FinalGateway' },
    { from: 'Sub_FinalGateway', to: 'Sub_SetGranted', label: 'verleend' },
    { from: 'Sub_FinalGateway', to: 'Sub_SetRejected', label: 'geweigerd' },
    { from: 'Sub_SetGranted', to: 'SubEnd' },
    { from: 'Sub_SetRejected', to: 'SubEnd' },
  ],
};

let seq = 0;
export const h = (
  key: string,
  activityId: string,
  start: string,
  end: string | null,
  extra: Partial<ActivityHistoryItem> = {}
): ActivityHistoryItem => ({
  id: `e${++seq}`,
  activityId,
  activityName: activityId,
  activityType: 'task',
  assignee: null,
  startTime: start,
  endTime: end,
  durationInMillis: null,
  canceled: false,
  processDefinitionKey: key,
  processDefinitionId: `${key}:1:x`,
  calledProcessInstanceId: null,
  ...extra,
});

export const ctx = (
  history: ActivityHistoryItem[],
  current: { processKey: string; nodeId: string },
  inSub: boolean
): ProcessContext => ({
  models: { [A]: SHELL, [S]: SUB },
  history,
  statusByProcess: {},
  current,
  phase: inSub ? '4+5' : '6',
  phaseSet: AWB_SET,
  chain: inSub
    ? [
        { instanceId: 'p', processKey: A },
        { instanceId: 'c', processKey: S, calledFrom: 'Task_Phase45_Process' },
      ]
    : [{ instanceId: 'p', processKey: A }],
  hasLanes: true,
});

export const T = (m: number) => `2026-07-16T10:${String(m).padStart(2, '0')}:00Z`;

// Screenshot 03: the review task in the subprocess, still running.
export const REVIEW = ctx(
  [
    h(A, 'StartEvent_AWB', T(0), T(0)),
    h(A, 'Task_Phase1_Identity', T(1), T(1)),
    h(A, 'Task_Phase3_Completeness', T(2), T(2)),
    h(A, 'Gateway_Complete', T(3), T(3)),
    h(A, 'Task_Phase45_Process', T(4), null, { calledProcessInstanceId: 'c' }),
    h(S, 'SubStart', T(4), T(4)),
    h(S, 'Sub_AssessPermit', T(5), T(5)),
    h(S, 'Sub_CaseReview', T(6), null),
  ],
  { processKey: S, nodeId: 'Sub_CaseReview' },
  true
);

// Screenshot 06: the Fase-6 task, the subprocess closed on "verleend".
export const NOTIFY = ctx(
  [
    h(A, 'StartEvent_AWB', T(0), T(0)),
    h(A, 'Task_Phase3_Completeness', T(2), T(2)),
    h(A, 'Gateway_Complete', T(3), T(3)),
    h(A, 'Task_Phase45_Process', T(4), T(20), { calledProcessInstanceId: 'c' }),
    h(S, 'SubStart', T(4), T(4)),
    h(S, 'Sub_CaseReview', T(6), T(15)),
    h(S, 'Sub_FinalGateway', T(16), T(16)),
    h(S, 'Sub_SetGranted', T(17), T(17)),
    h(S, 'SubEnd', T(18), T(18)),
    h(A, 'Task_Phase6_Notify', T(20), null),
  ],
  { processKey: A, nodeId: 'Task_Phase6_Notify' },
  false
);
