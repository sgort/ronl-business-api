import { describe, expect, it } from 'vitest';
import type { ActivityHistoryItem } from '@ronl/shared';
import { nodeStatusFromHistory, roleByKey, ROLES } from './rip-model';

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
