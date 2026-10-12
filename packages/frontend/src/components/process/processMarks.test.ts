import { describe, expect, it } from 'vitest';
import type { PhaseSwimlaneModel, SwimEdge, SwimNode } from '@ronl/shared';
import { gatewayKind, isIdLabel, legendEntries, nodeMarks } from './processMarks';

const node = (id: string, kind: SwimNode['kind'], label = id, row = 0, col = 0): SwimNode => ({
  id,
  bpmnId: id,
  kind,
  label,
  row,
  col,
});

const MODEL: PhaseSwimlaneModel = {
  phaseCode: 'X',
  lanes: [
    { key: 'pl', label: 'Projectleider', candidateGroups: ['rip-projectleider'] },
    { key: 'sys', label: 'Systeem' },
  ],
  nodes: [
    node('a', 'task', 'Taak A', 0, 1),
    node('b', 'task', 'Taak B', 0, 2),
    node('c', 'script', 'Script C', 1, 3),
  ],
  edges: [],
};

const ME = { userId: 'sub-me', roles: ['rip-projectleider'] };

describe('nodeMarks', () => {
  it('marks a task assigned to the viewer mine, to someone else claimed, unassigned open', () => {
    const marks = nodeMarks(
      MODEL,
      [
        { taskDefinitionKey: 'a', assignee: 'sub-me' },
        { taskDefinitionKey: 'b', assignee: 'sub-colleague' },
        { taskDefinitionKey: 'c', assignee: undefined },
      ],
      ME
    );
    expect(Object.fromEntries(marks)).toEqual({ a: 'mine', b: 'claimed', c: 'open' });
  });

  it('takes the strongest mark when a node has several tasks: mine > claimed > open', () => {
    const marks = nodeMarks(
      MODEL,
      [
        { taskDefinitionKey: 'a', assignee: undefined },
        { taskDefinitionKey: 'a', assignee: 'sub-colleague' },
        { taskDefinitionKey: 'a', assignee: 'sub-me' },
        { taskDefinitionKey: 'b', assignee: 'sub-colleague' },
        { taskDefinitionKey: 'b', assignee: undefined },
      ],
      ME
    );
    expect(marks.get('a')).toBe('mine');
    expect(marks.get('b')).toBe('claimed');
  });

  it('ignores a task whose node is not in the model', () => {
    const marks = nodeMarks(MODEL, [{ taskDefinitionKey: 'elsewhere', assignee: 'sub-me' }], ME);
    expect(marks.size).toBe(0);
  });

  it('never marks anything mine for a viewer without a user id', () => {
    const marks = nodeMarks(MODEL, [{ taskDefinitionKey: 'a', assignee: 'sub-me' }], {
      userId: null,
      roles: [],
    });
    expect(marks.get('a')).toBe('claimed');
  });
});

describe('isIdLabel', () => {
  it('is true when the label is the element id (an unnamed BPMN element)', () => {
    expect(isIdLabel(node('Gateway_OnderzoekenSplit', 'parallel'))).toBe(true);
    expect(isIdLabel({ ...node('n1', 'gateway'), bpmnId: 'Gateway_1', label: 'Gateway_1' })).toBe(
      true
    );
  });
  it('is false for a real name', () => {
    expect(isIdLabel(node('g', 'gateway', 'Akkoord?'))).toBe(false);
  });
});

describe('gatewayKind', () => {
  const edges = (from: string[], to: string[], g = 'g'): SwimEdge[] => [
    ...from.map((f) => ({ from: f, to: g })),
    ...to.map((t) => ({ from: g, to: t })),
  ];
  it('exclusive with 2+ outgoing is a decision', () => {
    expect(gatewayKind(node('g', 'gateway'), edges(['x'], ['y', 'z']))).toBe('decision');
  });
  it('exclusive with 1 outgoing and 2+ incoming is a merge', () => {
    expect(gatewayKind(node('g', 'gateway'), edges(['x', 'y'], ['z']))).toBe('merge');
  });
  it('parallel with 2+ outgoing is a split', () => {
    expect(gatewayKind(node('g', 'parallel'), edges(['x'], ['y', 'z']))).toBe('split');
  });
  it('parallel with 2+ incoming and 1 outgoing is a join', () => {
    expect(gatewayKind(node('g', 'parallel'), edges(['x', 'y'], ['z']))).toBe('join');
  });
  it('parallel with 2+ in and 2+ out is a split', () => {
    expect(gatewayKind(node('g', 'parallel'), edges(['w', 'x'], ['y', 'z']))).toBe('split');
  });
  it('exclusive with at most one in and one out is a merge', () => {
    expect(gatewayKind(node('g', 'gateway'), edges(['x'], ['y']))).toBe('merge');
  });
  it('exclusive with 2+ in and 2+ out is a decision', () => {
    expect(gatewayKind(node('g', 'gateway'), edges(['w', 'x'], ['y', 'z']))).toBe('decision');
  });
  it('is null for a non-gateway', () => {
    expect(gatewayKind(node('t', 'task'), [])).toBeNull();
  });
});

describe('legendEntries', () => {
  const keys = (e: { key: string }[]) => e.map((x) => x.key);

  it('lists only the states present, in the fixed order', () => {
    const entries = legendEntries({
      model: MODEL,
      statusById: { a: 'done', b: 'active' },
      marks: new Map([['b', 'claimed' as const]]),
      myLanes: new Set(['pl']),
      roles: ['rip-projectleider', 'other'],
    });
    expect(keys(entries)).toEqual(['done', 'active', 'claimed', 'role', 'auto', 'todo']);
  });

  it('names only the matching groups under "Jouw rol"', () => {
    const entries = legendEntries({
      model: MODEL,
      statusById: {},
      marks: new Map(),
      myLanes: new Set(['pl']),
      roles: ['rip-projectleider', 'unrelated'],
    });
    expect(entries.find((e) => e.key === 'role')?.label).toBe('Jouw rol (rip-projectleider)');
  });

  it('shows "Jouw taak" only when a node is mine, and no role entry without my lanes', () => {
    const entries = legendEntries({
      model: MODEL,
      statusById: { a: 'active' },
      marks: new Map([['a', 'mine' as const]]),
      myLanes: new Set(),
      roles: [],
    });
    expect(keys(entries)).toContain('mine');
    expect(keys(entries)).not.toContain('role');
    expect(keys(entries)).not.toContain('claimed');
  });

  it('has no todo entry when every node has a non-todo status', () => {
    const entries = legendEntries({
      model: MODEL,
      statusById: { a: 'done', b: 'done', c: 'done' },
      marks: new Map(),
      myLanes: new Set(),
      roles: [],
    });
    expect(keys(entries)).toEqual(['done', 'auto']);
  });
});
