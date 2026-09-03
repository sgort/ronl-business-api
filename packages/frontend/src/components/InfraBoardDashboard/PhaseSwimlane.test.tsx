// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import PhaseSwimlane from './PhaseSwimlane';
import type { PhaseSwimlaneModel } from '@ronl/shared';

const MODEL: PhaseSwimlaneModel = {
  phaseCode: 'R2.2',
  lanes: [
    { key: 'l1', label: 'Projectleider' },
    { key: 'l2', label: 'Ontwerper' },
  ],
  nodes: [
    { id: 's', bpmnId: 's', kind: 'start', col: 0, row: 0, label: 'Start' },
    { id: 't', bpmnId: 't', kind: 'task', col: 1, row: 1, label: 'Opstellen VO' },
    { id: 'p', bpmnId: 'p', kind: 'parallel', col: 2, row: 1, label: 'Split' },
    { id: 'e1', bpmnId: 'e1', kind: 'end', col: 3, row: 0, label: 'Klaar A' },
    { id: 'e2', bpmnId: 'e2', kind: 'end', col: 3, row: 1, label: 'Klaar B' },
  ],
  edges: [
    { from: 's', to: 't' },
    { from: 't', to: 'p', label: 'Ja' },
    { from: 'p', to: 'e1' },
    { from: 'p', to: 'e2' },
  ],
};

const EMPTY_MODEL: PhaseSwimlaneModel = {
  phaseCode: 'R0.0',
  lanes: [],
  nodes: [],
  edges: [],
};

// Exercises shapes and edge routings the two models above never touch: an
// exclusive (non-parallel) gateway, a service task, a doc-carrying task, a
// same-column edge, a rework (back) edge, and a dangling edge (no matching node).
const RICH_MODEL: PhaseSwimlaneModel = {
  phaseCode: 'R6.1',
  lanes: [{ key: 'l1', label: 'Lane A' }],
  nodes: [
    { id: 'g1', bpmnId: 'g1', kind: 'gateway', col: 0, row: 0, label: 'Gateway_Raw' },
    { id: 'g2', bpmnId: 'g2', kind: 'gateway', col: 1, row: 0, label: 'Gateway_Two' },
    { id: 'colA', bpmnId: 'colA', kind: 'task', col: 2, row: 0, label: 'Col A' },
    { id: 'colB', bpmnId: 'colB', kind: 'task', col: 2, row: 1, label: 'Col B' },
    { id: 'svc', bpmnId: 'svc', kind: 'service', col: 3, row: 0, label: 'Service Task' },
    {
      id: 'docTask',
      bpmnId: 'docTask',
      kind: 'task',
      col: 3,
      row: 1,
      label: 'Doc Task',
      doc: 'Doc X',
    },
    { id: 'claimed', bpmnId: 'claimed', kind: 'task', col: 4, row: 0, label: 'Claimed Task' },
  ],
  edges: [
    { from: 'g1', to: 'g2' },
    { from: 'colA', to: 'colB' },
    { from: 'docTask', to: 'g1', back: true },
    { from: 'ghost', to: 'g1' },
  ],
};

describe('PhaseSwimlane', () => {
  it('renders a lane label row per lane', () => {
    const { container } = render(<PhaseSwimlane model={MODEL} statusById={{}} />);
    expect(container.querySelectorAll('.pb-swim-lane-label')).toHaveLength(2);
  });

  it('renders every node', () => {
    const { container } = render(<PhaseSwimlane model={MODEL} statusById={{}} />);
    const drawn = container.querySelectorAll('.pb-swim-node, .pb-swim-event, .pb-swim-gate');
    expect(drawn).toHaveLength(5);
  });

  it('renders both end events', () => {
    // R2.1 has one end event, so the old renderer never met a second.
    // R5.3 has four.
    const { getByText } = render(<PhaseSwimlane model={MODEL} statusById={{}} />);
    expect(getByText('Klaar A')).toBeInTheDocument();
    expect(getByText('Klaar B')).toBeInTheDocument();
  });

  it('marks a parallel gateway differently from an exclusive one', () => {
    const { container } = render(<PhaseSwimlane model={MODEL} statusById={{}} />);
    const gate = container.querySelector('.pb-swim-gate.parallel');
    expect(gate).not.toBeNull();
    expect(gate?.querySelector('.gx')?.textContent).toBe('+');
  });

  it('applies status by node id', () => {
    const { container } = render(<PhaseSwimlane model={MODEL} statusById={{ t: 'done' }} />);
    expect(container.querySelector('.pb-swim-node.done')).not.toBeNull();
  });

  it('renders an empty model without crashing or producing NaN/-Infinity SVG attributes', () => {
    const { container } = render(<PhaseSwimlane model={EMPTY_MODEL} statusById={{}} />);
    expect(container.querySelectorAll('.pb-swim-lane-label')).toHaveLength(0);
    expect(container.querySelectorAll('.pb-swim-node, .pb-swim-event, .pb-swim-gate')).toHaveLength(
      0
    );
    const svg = container.querySelector('svg.pb-swim-svg');
    expect(svg).not.toBeNull();
    const width = svg?.getAttribute('width') ?? '';
    const height = svg?.getAttribute('height') ?? '';
    expect(width).not.toBe('NaN');
    expect(width).not.toContain('Infinity');
    expect(height).not.toBe('NaN');
    expect(height).not.toContain('Infinity');
    expect(Number.isFinite(Number(width))).toBe(true);
    expect(Number.isFinite(Number(height))).toBe(true);
  });

  it('produces no NaN/-Infinity numeric SVG attributes for a populated model', () => {
    const { container } = render(<PhaseSwimlane model={MODEL} statusById={{}} />);
    const svg = container.querySelector('svg.pb-swim-svg')!;
    for (const el of Array.from(svg.querySelectorAll('*'))) {
      for (const attr of Array.from(el.attributes)) {
        if (attr.name === 'd' || attr.name === 'id') continue;
        expect(attr.value).not.toContain('NaN');
        expect(attr.value).not.toContain('Infinity');
      }
    }
    expect(svg.getAttribute('width')).not.toContain('NaN');
    expect(svg.getAttribute('height')).not.toContain('NaN');
  });

  it('renders an exclusive gateway with the × marker, distinct from a parallel one', () => {
    const { container } = render(<PhaseSwimlane model={RICH_MODEL} statusById={{}} />);
    const gate = container.querySelector('.pb-swim-gate.gateway');
    expect(gate).not.toBeNull();
    expect(gate?.querySelector('.gx')?.textContent).toBe('×');
  });

  it('drops a dangling edge (no matching node) instead of drawing a broken path', () => {
    const { container } = render(<PhaseSwimlane model={RICH_MODEL} statusById={{}} />);
    // 4 edges declared, 1 dangling (from: 'ghost') → 3 edge paths drawn
    // (the arrowhead marker's own <path> in <defs> is excluded via `>`).
    expect(container.querySelectorAll('svg.pb-swim-svg > path')).toHaveLength(3);
  });

  it('routes a same-column edge and a rework (back) edge without NaN coordinates', () => {
    const { container } = render(<PhaseSwimlane model={RICH_MODEL} statusById={{}} />);
    const paths = container.querySelectorAll('svg.pb-swim-svg > path');
    for (const p of Array.from(paths)) {
      const d = p.getAttribute('d') ?? '';
      expect(d).not.toContain('NaN');
      expect(d).not.toContain('Infinity');
    }
  });

  it('shows the resolved document label on a task that carries one', () => {
    const { getByText } = render(<PhaseSwimlane model={RICH_MODEL} statusById={{}} />);
    expect(getByText('Doc X')).toBeInTheDocument();
  });

  it('marks a service task as automatic', () => {
    const { getByText } = render(<PhaseSwimlane model={RICH_MODEL} statusById={{}} />);
    expect(getByText('automatisch')).toBeInTheDocument();
  });

  it('marks a claimed node with the claimed class and an in-progress indicator', () => {
    const { container, getByTitle } = render(
      <PhaseSwimlane model={RICH_MODEL} statusById={{}} claimedNodeIds={new Set(['claimed'])} />
    );
    expect(container.querySelector('.pb-swim-node-claimed')).not.toBeNull();
    expect(getByTitle('In behandeling')).toBeInTheDocument();
  });
});
