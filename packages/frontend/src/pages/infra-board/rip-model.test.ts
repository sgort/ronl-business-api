import { describe, expect, it } from 'vitest';
import type { ActivityHistoryItem } from '@ronl/shared';
import {
  countReworkLoops,
  getDocProgress,
  getWipStepInfo,
  nodeStatusFromHistory,
  roleByKey,
  ROLES,
} from './rip-model';

function historyItem(overrides: Partial<ActivityHistoryItem> = {}): ActivityHistoryItem {
  return {
    id: 'h1',
    activityId: 'Task_AanlevrenProjectplan',
    activityName: 'Aanleveren Projectplan',
    activityType: 'userTask',
    assignee: null,
    startTime: '2026-01-01T00:00:00Z',
    endTime: null,
    durationInMillis: null,
    canceled: false,
    ...overrides,
  };
}

describe('roleByKey', () => {
  it('finds a role by its key', () => {
    expect(roleByKey('projectleider')?.short).toBe('PL');
  });

  it('falls back to the first role for an unknown key', () => {
    expect(roleByKey('does-not-exist')).toBe(ROLES[0]);
  });
});

describe('nodeStatusFromHistory', () => {
  it('returns an empty map for no history entries — absent ids default to todo at the call site', () => {
    const statuses = nodeStatusFromHistory([]);
    expect(statuses).toEqual({});
  });

  it("keys the result by the history entry's own activityId (a BPMN id)", () => {
    const statuses = nodeStatusFromHistory([historyItem({ endTime: null, canceled: false })]);
    expect(statuses['Task_AanlevrenProjectplan']).toBe('active');
  });

  it('marks a running activity as "action" when it is one of the user\'s open tasks', () => {
    const statuses = nodeStatusFromHistory(
      [historyItem({ endTime: null, canceled: false })],
      new Set(['Task_AanlevrenProjectplan'])
    );
    expect(statuses['Task_AanlevrenProjectplan']).toBe('action');
  });

  it('marks a completed (non-canceled) activity as done', () => {
    const statuses = nodeStatusFromHistory([
      historyItem({ endTime: '2026-01-02T00:00:00Z', canceled: false }),
    ]);
    expect(statuses['Task_AanlevrenProjectplan']).toBe('done');
  });

  it('leaves a fully-canceled activity out of the map (as if it never happened)', () => {
    const statuses = nodeStatusFromHistory([
      historyItem({ endTime: '2026-01-02T00:00:00Z', canceled: true }),
    ]);
    expect(statuses['Task_AanlevrenProjectplan']).toBeUndefined();
  });

  it('resolves done when any entry for the activity completed, even if another was canceled', () => {
    const statuses = nodeStatusFromHistory([
      historyItem({ id: 'h1', endTime: '2026-01-02T00:00:00Z', canceled: true }),
      historyItem({ id: 'h2', endTime: '2026-01-03T00:00:00Z', canceled: false }),
    ]);
    expect(statuses['Task_AanlevrenProjectplan']).toBe('done');
  });

  it('does not downgrade an already-active activity to done when a later entry for the same id finishes', () => {
    const statuses = nodeStatusFromHistory([
      historyItem({ id: 'h1', endTime: null, canceled: false }),
      historyItem({ id: 'h2', endTime: '2026-01-03T00:00:00Z', canceled: false }),
    ]);
    expect(statuses['Task_AanlevrenProjectplan']).toBe('active');
  });

  it('does not downgrade an already-"action" activity to done when a later entry for the same id finishes', () => {
    // Out-of-order defensive test: the function assumes ascending startTime
    // (guaranteed by operaton.service.ts today), so this history — the
    // running/claimable entry BEFORE an earlier execution's finished entry —
    // is not what a real caller passes. It exercises the guard directly
    // rather than relying on ordering to keep it untested.
    const statuses = nodeStatusFromHistory(
      [
        historyItem({ id: 'h1', endTime: null, canceled: false }),
        historyItem({ id: 'h2', endTime: '2026-01-03T00:00:00Z', canceled: false }),
      ],
      new Set(['Task_AanlevrenProjectplan'])
    );
    expect(statuses['Task_AanlevrenProjectplan']).toBe('action');
  });

  it('defaults openTaskBpmnIds to empty when omitted', () => {
    const statuses = nodeStatusFromHistory([historyItem({ endTime: null, canceled: false })]);
    expect(statuses['Task_AanlevrenProjectplan']).toBe('active');
  });
});

function activity(overrides: Partial<ActivityHistoryItem> = {}): ActivityHistoryItem {
  return {
    id: 'a1',
    activityId: 'Task_OrganiserenIntakeoverleg',
    activityName: 'Organiseren intake-overleg',
    activityType: 'userTask',
    assignee: null,
    startTime: '2026-08-10T10:55:38.009+0200',
    endTime: null,
    durationInMillis: null,
    canceled: false,
    ...overrides,
  };
}

describe('getWipStepInfo', () => {
  it('identifies the running node as the current step, matching real Operaton shape', () => {
    // Fixture shape matches an actual GET /history/activity-instance
    // response captured against a live RipR21Process instance during
    // sub-project D's brainstorming.
    const history: ActivityHistoryItem[] = [
      activity({
        activityId: 'StartEvent_RipPhase1',
        activityType: 'startEvent',
        startTime: '2026-08-10T10:54:47.656+0200',
        endTime: '2026-08-10T10:54:47.658+0200',
        durationInMillis: 2,
      }),
      activity({
        activityId: 'Task_AanlevrenProjectplan',
        startTime: '2026-08-10T10:54:47.658+0200',
        endTime: '2026-08-10T10:55:38.009+0200',
        durationInMillis: 50351,
        assignee: '4345f4ea-533d-411d-8a05-1b1f5bc2a309',
      }),
      activity({
        activityId: 'Task_OrganiserenIntakeoverleg',
        startTime: '2026-08-10T10:55:38.009+0200',
        endTime: null,
      }),
    ];

    const result = getWipStepInfo(history);

    expect(result).not.toBeNull();
    expect(result!.step).toBe('Organiseren intake-overleg');
    expect(result!.stepRole).toBe('Manager Projectbeheersing');
    expect(result!.blocked).toBeNull();
  });

  it('surfaces the originating gateway when the running node is a genuine rework re-execution', () => {
    // Task_AanvullenProjectplan2 ran once already (the normal forward
    // pass), the gateway then fired 'niet akkoord', and it's now running
    // a SECOND time — that repeat execution is the actual rework signal.
    const history: ActivityHistoryItem[] = [
      activity({
        activityId: 'Task_AanvullenProjectplan2',
        startTime: '2026-07-30T00:00:00Z',
        endTime: '2026-07-30T01:00:00Z',
      }),
      activity({
        activityId: 'Gateway_Akkoord2',
        activityType: 'exclusiveGateway',
        endTime: '2026-07-31T23:59:00Z',
      }),
      activity({
        activityId: 'Task_AanvullenProjectplan2',
        startTime: '2026-08-01T00:00:00Z',
        endTime: null,
      }),
    ];

    const result = getWipStepInfo(history);

    expect(result!.blocked).toBe('Akkoord?');
  });

  it('does NOT flag a first-time pass through a rework-target node as blocked', () => {
    // t_aanvullen2 is ALSO the normal forward-path target of g_intake's
    // 'Ja' edge — a brand-new instance's first, entirely normal visit
    // must not be reported as blocked just because SOME edge into this
    // node happens to be a back edge.
    const history: ActivityHistoryItem[] = [
      activity({
        activityId: 'Task_AanvullenProjectplan2',
        startTime: '2026-08-01T00:00:00Z',
        endTime: null,
      }),
    ];

    const result = getWipStepInfo(history);

    expect(result!.blocked).toBeNull();
  });

  it('returns null when every activity has finished (process complete)', () => {
    const history: ActivityHistoryItem[] = [activity({ endTime: '2026-08-10T11:00:00.000+0200' })];
    expect(getWipStepInfo(history)).toBeNull();
  });

  it('returns null for an empty history', () => {
    expect(getWipStepInfo([])).toBeNull();
  });

  it('returns null for a running activity outside R2.1 (no local role for it)', () => {
    // FASE1_NODES is gone; getWipStepInfo now gates on FASE1_NODE_ROLE
    // instead. An activity id from a DIFFERENT phase's BPMN — e.g. R2.2's
    // Task_OpstellenVO — must still yield null, exactly as an unmatched
    // FASE1_NODES lookup used to.
    const history: ActivityHistoryItem[] = [
      activity({ activityId: 'Task_OpstellenVO', activityName: 'Opstellen VO', endTime: null }),
    ];
    expect(getWipStepInfo(history)).toBeNull();
  });

  it('returns null when the running R2.1 activity carries no activityName', () => {
    const history: ActivityHistoryItem[] = [
      activity({
        activityId: 'Task_OrganiserenIntakeoverleg',
        activityName: null,
        endTime: null,
      }),
    ];
    expect(getWipStepInfo(history)).toBeNull();
  });
});

describe('countReworkLoops', () => {
  it('counts each back-edge target activity beyond its first occurrence', () => {
    // Task_AanvullenProjectplan2 is the target of the g_akkoord2 → back edge
    // (`niet akkoord`); it runs once normally, then again after rework — one loop.
    const history: ActivityHistoryItem[] = [
      activity({ activityId: 'Task_AanvullenProjectplan2', endTime: '2026-08-01T00:00:00Z' }),
      activity({
        activityId: 'Gateway_Akkoord2',
        activityType: 'exclusiveGateway',
        endTime: '2026-08-02T00:00:00Z',
      }),
      activity({
        activityId: 'Task_AanvullenProjectplan2',
        startTime: '2026-08-02T00:00:00Z',
        endTime: '2026-08-03T00:00:00Z',
      }),
      activity({
        activityId: 'Gateway_Akkoord2',
        activityType: 'exclusiveGateway',
        endTime: '2026-08-04T00:00:00Z',
      }),
      activity({ activityId: 'Task_AanvullenProjectplan4', endTime: '2026-08-05T00:00:00Z' }),
    ];
    expect(countReworkLoops(history)).toBe(1);
  });

  it('returns 0 when no back-edge target activity repeats', () => {
    const history: ActivityHistoryItem[] = [
      activity({ activityId: 'Task_AanvullenProjectplan2', endTime: '2026-08-01T00:00:00Z' }),
      activity({ activityId: 'Task_AanvullenProjectplan4', endTime: '2026-08-02T00:00:00Z' }),
    ];
    expect(countReworkLoops(history)).toBe(0);
  });

  it('returns 0 for an empty history', () => {
    expect(countReworkLoops([])).toBe(0);
  });
});

describe('getDocProgress', () => {
  it('counts FASE1_DOCS whose produceNode has finished', () => {
    // t_aanleveren (doc 1, bpmnId Task_AanlevrenProjectplan) and
    // t_aanvullen2 (doc 2, bpmnId Task_AanvullenProjectplan2) finished;
    // t_psu (doc 3) and t_aanvullen4 (doc 4) have not been reached.
    const history: ActivityHistoryItem[] = [
      activity({ activityId: 'Task_AanlevrenProjectplan', endTime: '2026-08-01T00:00:00Z' }),
      activity({ activityId: 'Task_AanvullenProjectplan2', endTime: '2026-08-02T00:00:00Z' }),
    ];
    const result = getDocProgress(history);
    expect(result.docsDone).toBe(2);
    expect(result.docsTotal).toBe(4);
  });

  it('returns 0/4 for an empty history', () => {
    expect(getDocProgress([])).toEqual({ docsDone: 0, docsTotal: 4 });
  });

  it('returns 4/4 when every produceNode has finished', () => {
    const history: ActivityHistoryItem[] = [
      activity({ activityId: 'Task_AanlevrenProjectplan', endTime: '2026-08-01T00:00:00Z' }),
      activity({ activityId: 'Task_AanvullenProjectplan2', endTime: '2026-08-02T00:00:00Z' }),
      activity({ activityId: 'Task_UitvoerenPSU', endTime: '2026-08-03T00:00:00Z' }),
      activity({ activityId: 'Task_AanvullenProjectplan4', endTime: '2026-08-04T00:00:00Z' }),
    ];
    expect(getDocProgress(history).docsDone).toBe(4);
  });
});
