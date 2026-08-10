import { describe, expect, it } from 'vitest';
import type { ActivityHistoryItem } from '@ronl/shared';
import {
  countReworkLoops,
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
  it('marks a node with no history entries as todo', () => {
    const statuses = nodeStatusFromHistory([]);
    expect(statuses['t_aanleveren']).toBe('todo');
    expect(statuses['start']).toBe('todo');
  });

  it('marks a node with a running, unclaimed activity as active', () => {
    const statuses = nodeStatusFromHistory([historyItem({ endTime: null, canceled: false })]);
    expect(statuses['t_aanleveren']).toBe('active');
  });

  it('marks a running activity as "action" when it is one of the user\'s open tasks', () => {
    const statuses = nodeStatusFromHistory(
      [historyItem({ endTime: null, canceled: false })],
      new Set(['Task_AanlevrenProjectplan'])
    );
    expect(statuses['t_aanleveren']).toBe('action');
  });

  it('marks a node with a completed (non-canceled) activity as done', () => {
    const statuses = nodeStatusFromHistory([
      historyItem({ endTime: '2026-01-02T00:00:00Z', canceled: false }),
    ]);
    expect(statuses['t_aanleveren']).toBe('done');
  });

  it('treats a fully-canceled activity as if it never happened (todo)', () => {
    const statuses = nodeStatusFromHistory([
      historyItem({ endTime: '2026-01-02T00:00:00Z', canceled: true }),
    ]);
    expect(statuses['t_aanleveren']).toBe('todo');
  });

  it('resolves done when any entry for the activity completed, even if another was canceled', () => {
    const statuses = nodeStatusFromHistory([
      historyItem({ id: 'h1', endTime: '2026-01-02T00:00:00Z', canceled: true }),
      historyItem({ id: 'h2', endTime: '2026-01-03T00:00:00Z', canceled: false }),
    ]);
    expect(statuses['t_aanleveren']).toBe('done');
  });

  it('defaults openTaskBpmnIds to empty when omitted', () => {
    const statuses = nodeStatusFromHistory([historyItem({ endTime: null, canceled: false })]);
    expect(statuses['t_aanleveren']).toBe('active');
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
    // response captured against a live RipPhase1Process instance during
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

  it('surfaces the originating gateway when the running node is a rework target', () => {
    const history: ActivityHistoryItem[] = [
      activity({
        activityId: 'Gateway_Akkoord2',
        activityType: 'exclusiveGateway',
        endTime: '2026-07-31T23:59:00Z', // already fired — only the rework task below is running
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

  it('returns null when every activity has finished (process complete)', () => {
    const history: ActivityHistoryItem[] = [activity({ endTime: '2026-08-10T11:00:00.000+0200' })];
    expect(getWipStepInfo(history)).toBeNull();
  });

  it('returns null for an empty history', () => {
    expect(getWipStepInfo([])).toBeNull();
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
