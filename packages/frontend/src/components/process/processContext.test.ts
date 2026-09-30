import { describe, expect, it } from 'vitest';
import type { ActivityHistoryItem, PhaseSwimlaneModel, ProcessLineage } from '@ronl/shared';
import { buildProcessContext } from './processContext';

// The kapvergunning shape: shell S calls sub T from Task_Phase45_Process.
const S = 'AwbShellProcess';
const T = 'TreeFellingPermitSubProcess';

let seq = 0;
function h(
  activityId: string,
  processDefinitionKey: string,
  startTime: string,
  endTime: string | null,
  extra: Partial<ActivityHistoryItem> = {}
): ActivityHistoryItem {
  seq += 1;
  return {
    id: `h${seq}`,
    activityId,
    activityName: activityId,
    activityType: 'userTask',
    assignee: null,
    startTime,
    endTime,
    durationInMillis: null,
    canceled: false,
    processDefinitionKey,
    processDefinitionId: `${processDefinitionKey}:1:x`,
    calledProcessInstanceId: null,
    ...extra,
  };
}

const lineage = (id: string, key: string, sup: string | null): ProcessLineage => ({
  processInstanceId: id,
  processDefinitionKey: key,
  processDefinitionId: `${key}:1:x`,
  superProcessInstanceId: sup,
});

const model = (
  key: string,
  nodes: Array<[string, string | undefined]>,
  withLanes = true
): PhaseSwimlaneModel => ({
  phaseCode: key,
  processKey: key,
  lanes: withLanes ? [{ key: 'Lane_Behandelaar', label: 'Behandelaar' }] : [],
  nodes: nodes.map(([id, awbPhase], i) => ({
    id,
    bpmnId: id,
    kind: 'task',
    col: i,
    row: 0,
    label: id,
    ...(awbPhase ? { awbPhase: awbPhase as '4+5' } : {}),
  })),
  edges: [],
});

const MODELS = {
  [S]: model(S, [
    ['StartEvent_AWB', '1'],
    ['Task_Phase45_Process', '4+5'],
    ['Task_Phase6_Notify', '6'],
  ]),
  [T]: model(T, [
    ['SubStart', '4+5'],
    ['Sub_CaseReview', '4+5'],
  ]),
};

describe('buildProcessContext', () => {
  it('a task in the child: chain from the top, histories merged in engine order', () => {
    const parent = [
      h('StartEvent_AWB', S, '2026-07-16T10:00:00Z', '2026-07-16T10:00:00Z'),
      h('Task_Phase45_Process', S, '2026-07-16T10:01:00Z', null, {
        activityType: 'callActivity',
        calledProcessInstanceId: 'child',
      }),
    ];
    const child = [
      h('SubStart', T, '2026-07-16T10:01:01Z', '2026-07-16T10:01:01Z'),
      h('Sub_CaseReview', T, '2026-07-16T10:02:00Z', null),
    ];
    const ctx = buildProcessContext({
      task: { processInstanceId: 'child', taskDefinitionKey: 'Sub_CaseReview' },
      lineages: [lineage('child', T, 'parent'), lineage('parent', S, null)],
      histories: { child, parent },
      models: MODELS,
    });

    expect(ctx.chain).toEqual([
      { instanceId: 'parent', processKey: S },
      { instanceId: 'child', processKey: T, calledFrom: 'Task_Phase45_Process' },
    ]);
    expect(ctx.history.map((e) => e.activityId)).toEqual([
      'StartEvent_AWB',
      'Task_Phase45_Process',
      'SubStart',
      'Sub_CaseReview',
    ]);
    expect(ctx.statusByProcess[S]).toEqual({
      StartEvent_AWB: 'done',
      Task_Phase45_Process: 'active',
    });
    expect(ctx.statusByProcess[T]).toEqual({ SubStart: 'done', Sub_CaseReview: 'active' });
    expect(ctx.current).toEqual({ processKey: T, nodeId: 'Sub_CaseReview' });
    expect(ctx.awbPhase).toBe('4+5');
    expect(ctx.hasLanes).toBe(true);
  });

  it('a task in the parent after the child ended: the finished child is shown done', () => {
    const parent = [
      h('Task_Phase45_Process', S, '2026-07-16T10:01:00Z', '2026-07-16T11:00:00Z', {
        activityType: 'callActivity',
        calledProcessInstanceId: 'child',
      }),
      h('Task_Phase6_Notify', S, '2026-07-16T11:00:01Z', null),
    ];
    const child = [
      h('SubStart', T, '2026-07-16T10:01:01Z', '2026-07-16T10:01:01Z'),
      h('Sub_CaseReview', T, '2026-07-16T10:02:00Z', '2026-07-16T10:59:00Z'),
    ];
    const ctx = buildProcessContext({
      task: { processInstanceId: 'parent', taskDefinitionKey: 'Task_Phase6_Notify' },
      lineages: [lineage('parent', S, null)],
      histories: { parent, child },
      models: MODELS,
    });

    expect(ctx.chain).toEqual([{ instanceId: 'parent', processKey: S }]);
    expect(ctx.statusByProcess[T]).toEqual({ SubStart: 'done', Sub_CaseReview: 'done' });
    expect(ctx.statusByProcess[S].Task_Phase6_Notify).toBe('active');
    expect(ctx.awbPhase).toBe('6');
    // Engine order across both instances.
    expect(ctx.history.map((e) => e.activityId)).toEqual([
      'Task_Phase45_Process',
      'SubStart',
      'Sub_CaseReview',
      'Task_Phase6_Notify',
    ]);
  });

  it('the same subprocess called twice: both runs merge and the later, running one wins', () => {
    const first = [h('Sub_CaseReview', T, '2026-07-16T10:00:00Z', '2026-07-16T10:30:00Z')];
    const second = [h('Sub_CaseReview', T, '2026-07-16T12:00:00Z', null)];
    const ctx = buildProcessContext({
      task: { processInstanceId: 'second', taskDefinitionKey: 'Sub_CaseReview' },
      lineages: [lineage('second', T, null)],
      // The earlier run listed LAST: order must come from startTime, not insertion.
      histories: { second, first },
      models: MODELS,
    });
    expect(ctx.statusByProcess[T].Sub_CaseReview).toBe('active');
  });

  it('without the super lineage, shows the child alone', () => {
    const ctx = buildProcessContext({
      task: { processInstanceId: 'child', taskDefinitionKey: 'Sub_CaseReview' },
      lineages: [lineage('child', T, 'parent')],
      histories: { child: [h('Sub_CaseReview', T, '2026-07-16T10:02:00Z', null)] },
      models: MODELS,
    });
    expect(ctx.chain).toEqual([{ instanceId: 'child', processKey: T }]);
    expect(ctx.current.processKey).toBe(T);
  });

  it('without its own model: no lanes and no phase', () => {
    const ctx = buildProcessContext({
      task: { processInstanceId: 'child', taskDefinitionKey: 'Sub_CaseReview' },
      lineages: [lineage('child', T, null)],
      histories: { child: [] },
      models: { [S]: MODELS[S] },
    });
    expect(ctx.hasLanes).toBe(false);
    expect(ctx.awbPhase).toBeNull();
  });

  it('a model without lanes or markers: hasLanes false, awbPhase null', () => {
    const plain = model('Plain', [['Task_A', undefined]], false);
    const ctx = buildProcessContext({
      task: { processInstanceId: 'p', taskDefinitionKey: 'Task_A' },
      lineages: [lineage('p', 'Plain', null)],
      histories: { p: [] },
      models: { Plain: plain },
    });
    expect(ctx.hasLanes).toBe(false);
    expect(ctx.awbPhase).toBeNull();
  });

  it('leaves entries without a process key out of every status map', () => {
    const ctx = buildProcessContext({
      task: { processInstanceId: 'p', taskDefinitionKey: 'X' },
      lineages: [lineage('p', S, null)],
      histories: {
        p: [h('Legacy', S, '2026-07-16T10:00:00Z', null, { processDefinitionKey: null })],
      },
      models: MODELS,
    });
    expect(ctx.statusByProcess).toEqual({});
    expect(ctx.history).toHaveLength(1);
  });

  it('orders equal timestamps by structure: call activity, then its child, then the parent resumes', () => {
    // One engine transaction: the call, the child's start and the child's end
    // share a millisecond with the parent's next step.
    const t0 = '2026-07-16T10:12:00Z';
    const t1 = '2026-07-16T11:32:31Z';
    const parent = [
      h('Task_Phase45_Process', S, t0, t1, {
        activityType: 'callActivity',
        calledProcessInstanceId: 'child',
      }),
      h('Task_Phase6_Notify', S, t1, null),
    ];
    const child = [
      h('SubStart', T, t0, t0),
      h('Sub_CaseReview', T, '2026-07-16T10:20:00Z', '2026-07-16T11:32:31Z'),
      h('SubEnd', T, t1, t1),
    ];
    for (const task of [
      { processInstanceId: 'child', taskDefinitionKey: 'Sub_CaseReview' },
      { processInstanceId: 'parent', taskDefinitionKey: 'Task_Phase6_Notify' },
    ]) {
      const ctx = buildProcessContext({
        task,
        lineages:
          task.processInstanceId === 'child'
            ? [lineage('child', T, 'parent'), lineage('parent', S, null)]
            : [lineage('parent', S, null)],
        // The task's own instance first, as the hook inserts it.
        histories: task.processInstanceId === 'child' ? { child, parent } : { parent, child },
        models: MODELS,
      });
      expect(ctx.history.map((e) => e.activityId)).toEqual([
        'Task_Phase45_Process',
        'SubStart',
        'Sub_CaseReview',
        'SubEnd',
        'Task_Phase6_Notify',
      ]);
    }
  });

  it('takes the Awb phase from the calling node when the subprocess carries no markers', () => {
    const unmarked = model(T, [
      ['SubStart', undefined],
      ['Sub_CaseReview', undefined],
    ]);
    const ctx = buildProcessContext({
      task: { processInstanceId: 'child', taskDefinitionKey: 'Sub_CaseReview' },
      lineages: [lineage('child', T, 'parent'), lineage('parent', S, null)],
      histories: {
        child: [h('Sub_CaseReview', T, '2026-07-16T10:02:00Z', null)],
        parent: [
          h('Task_Phase45_Process', S, '2026-07-16T10:01:00Z', null, {
            activityType: 'callActivity',
            calledProcessInstanceId: 'child',
          }),
        ],
      },
      models: { [S]: MODELS[S], [T]: unmarked },
    });
    expect(ctx.awbPhase).toBe('4+5');
  });
});
