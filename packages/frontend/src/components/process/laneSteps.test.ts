import { describe, expect, it } from 'vitest';
import {
  A,
  AAN,
  BEH,
  NOTIFY,
  REVIEW,
  S,
  SHELL,
  SYS,
  T,
  ctx,
  h,
} from '../../test/kapvergunningFixtures';
import {
  buildTrail,
  collapseFrom,
  currentGroupIndex,
  groupByLane,
  laneMeta,
  myLaneKeys,
  transitionLabel,
} from './laneSteps';

describe('laneMeta', () => {
  it('knows the three Awb lanes', () => {
    expect(laneMeta({ key: BEH, label: 'Behandelaar' })).toEqual({
      short: 'BEH',
      colour: '#0046ad',
    });
    expect(laneMeta({ key: AAN, label: 'Aanvrager' }).colour).toBe('#7a5af0');
    expect(laneMeta({ key: SYS, label: 'Systeem' }).colour).toBe('#6b7280');
  });

  it('falls back to a neutral colour and a short name from the label', () => {
    expect(laneMeta({ key: 'Lane_X', label: 'Projectleider' })).toEqual({
      short: 'PROJ',
      colour: '#64707f',
    });
  });
});

describe('myLaneKeys', () => {
  it('is the lanes whose candidate groups meet the user’s roles', () => {
    expect([...myLaneKeys(SHELL, ['caseworker', 'other'])]).toEqual([BEH]);
  });
  it('is empty without a matching role', () => {
    expect(myLaneKeys(SHELL, ['citizen']).size).toBe(0);
    expect(myLaneKeys(SHELL, []).size).toBe(0);
  });
});

describe('buildTrail', () => {
  it('drops start and end events and marks the task’s own running step', () => {
    const trail = buildTrail(REVIEW);
    expect(trail.some((s) => s.kind === 'start' || s.kind === 'end')).toBe(false);
    const mine = trail.filter((s) => s.isMine);
    expect(mine.map((s) => s.nodeId)).toEqual(['Sub_CaseReview']);
    expect(mine[0].state).toBe('running');
  });

  it('continues with "Hierna" up to the first gateway and lists its branches (screenshot 03)', () => {
    const next = buildTrail(REVIEW).filter((s) => s.state === 'next');
    expect(next.map((s) => s.nodeId)).toEqual(['Sub_ResolveDecision', 'Sub_FinalGateway']);
    expect(next[1].branches).toEqual(['verleend', 'geweigerd']);
  });

  it('shows a gateway’s taken branch from the next entry of the same process', () => {
    // Gateway_Complete is followed by the shell's call activity, with the
    // child's entries interleaved after it.
    const gw = buildTrail(REVIEW).find((s) => s.nodeId === 'Gateway_Complete')!;
    expect(gw.outcome).toBe('ja');
    const sub = buildTrail(NOTIFY).find((s) => s.nodeId === 'Sub_FinalGateway')!;
    expect(sub.outcome).toBe('verleend');
  });

  it('leaves a gateway’s outcome empty when nothing follows it yet', () => {
    const c = ctx(
      [h(A, 'Gateway_Complete', T(3), null)],
      { processKey: A, nodeId: 'Task_RequestMissingInfo' },
      false
    );
    expect(buildTrail(c).find((s) => s.nodeId === 'Gateway_Complete')!.outcome).toBeUndefined();
  });

  it('carries the decision key and the first document', () => {
    const trail = buildTrail(NOTIFY);
    expect(trail.find((s) => s.nodeId === 'Task_Phase3_Completeness')!.dmn).toBe(
      'AwbCompletenessCheck'
    );
    expect(trail.find((s) => s.nodeId === 'Task_Phase6_Notify')!.doc).toBe(
      'Beschikking kapvergunning'
    );
  });

  it('walks out of a subprocess into its parent, after the calling node', () => {
    const c = ctx(
      [
        h(A, 'Task_Phase45_Process', T(4), null, { calledProcessInstanceId: 'c' }),
        h(S, 'Sub_SetGranted', T(17), null),
      ],
      { processKey: S, nodeId: 'Sub_SetGranted' },
      true
    );
    const next = buildTrail(c).filter((s) => s.state === 'next');
    expect(next.map((s) => `${s.processKey}:${s.nodeId}`)).toEqual([
      `${A}:Task_Phase6_Notify`,
      `${A}:Gateway_Payment`,
    ]);
  });

  it('stops "Hierna" at the end of the top process, without error', () => {
    const c = ctx(
      [h(A, 'Task_Phase7_Payment', T(30), null)],
      { processKey: A, nodeId: 'Task_Phase7_Payment' },
      false
    );
    expect(buildTrail(c).filter((s) => s.state === 'next')).toEqual([]);
  });

  it('shows at most three "Hierna" steps', () => {
    const c = ctx(
      [h(A, 'StartEvent_AWB', T(0), null)],
      { processKey: A, nodeId: 'StartEvent_AWB' },
      false
    );
    // Start → Identity → Completeness → Gateway: three steps, and the third is the gateway.
    const next = buildTrail(c).filter((s) => s.state === 'next');
    expect(next.length).toBeLessThanOrEqual(3);
  });

  it('skips an entry whose node is not in its process’s model', () => {
    const c = ctx(
      [h(A, 'Removed_In_Redeploy', T(1), T(1)), h(A, 'Task_Phase6_Notify', T(2), null)],
      { processKey: A, nodeId: 'Task_Phase6_Notify' },
      false
    );
    expect(buildTrail(c).some((s) => s.nodeId === 'Removed_In_Redeploy')).toBe(false);
  });

  it('marks a canceled entry as finished and canceled, not running', () => {
    const c = ctx(
      [
        h(A, 'Task_RequestMissingInfo', T(1), null, { canceled: true }),
        h(A, 'Task_Phase6_Notify', T(2), null),
      ],
      { processKey: A, nodeId: 'Task_Phase6_Notify' },
      false
    );
    const step = buildTrail(c).find((s) => s.nodeId === 'Task_RequestMissingInfo')!;
    expect(step.state).toBe('done');
    expect(step.canceled).toBe(true);
  });
});

describe('groupByLane and transitions', () => {
  it('groups consecutive steps per lane, and starts a new group when the process changes', () => {
    const groups = groupByLane(buildTrail(REVIEW), REVIEW);
    expect(groups.map((g) => `${g.processKey === S ? 'sub' : 'main'}:${g.laneKey}`)).toEqual([
      `main:${SYS}`,
      `main:${BEH}`,
      `sub:${SYS}`,
      `sub:${BEH}`,
      `sub:${SYS}`,
    ]);
    expect(groups.map((g) => g.sub)).toEqual([false, false, true, true, true]);
    expect(groups[4].future).toBe(true);
  });

  it('writes the handover lines the design uses', () => {
    const groups = groupByLane(buildTrail(REVIEW), REVIEW);
    expect(transitionLabel(groups[0], groups[1], REVIEW)).toBe('↓ Behandelaar');
    expect(transitionLabel(groups[1], groups[2], REVIEW)).toBe(
      '↘ deelproces Kapvergunning - Behandeling en besluit'
    );
    expect(transitionLabel(groups[3], groups[4], REVIEW)).toBe('↓ daarna: Systeem');
    const back = groupByLane(buildTrail(NOTIFY), NOTIFY);
    const i = back.findIndex((g) => g.processKey === A && g.steps.some((s) => s.isMine));
    expect(transitionLabel(back[i - 1], back[i], NOTIFY)).toBe(
      '↗ terug in hoofdproces · Behandelaar'
    );
  });

  it('finds the current group, and never collapses it away', () => {
    const groups = groupByLane(buildTrail(REVIEW), REVIEW);
    const cur = currentGroupIndex(groups);
    expect(groups[cur].steps.some((s) => s.isMine)).toBe(true);
    expect(collapseFrom(groups, false)).toBe(Math.max(0, cur - 2));
    expect(collapseFrom(groups, false)).toBeLessThanOrEqual(cur);
    expect(collapseFrom(groups, true)).toBe(0);
  });

  it('collapses nothing when the current group is among the first two', () => {
    const groups = groupByLane(buildTrail(REVIEW), REVIEW).slice(0, 2);
    expect(collapseFrom(groups, false)).toBe(0);
  });

  it('falls back to the last running group, then the last group, when the task’s step is absent', () => {
    const c = ctx(
      [h(A, 'Task_Phase1_Identity', T(1), T(1)), h(A, 'Task_Phase3_Completeness', T(2), null)],
      { processKey: A, nodeId: 'Elsewhere' },
      false
    );
    const groups = groupByLane(buildTrail(c), c);
    expect(groups[currentGroupIndex(groups)].steps.some((s) => s.state === 'running')).toBe(true);
    const done = ctx(
      [h(A, 'Task_Phase1_Identity', T(1), T(1))],
      { processKey: A, nodeId: 'X' },
      false
    );
    const g2 = groupByLane(buildTrail(done), done);
    expect(currentGroupIndex(g2)).toBe(g2.length - 1);
  });
});
