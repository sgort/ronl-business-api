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

// Back-edge `d` shape is `M ax ay V <bandY> H bx V by` — the y-value of the
// horizontal segment is the number between the first "V" and "H".
function bandYOf(path: Element): number {
  const d = path.getAttribute('d') ?? '';
  const m = d.match(/V\s+(-?[\d.]+)\s+H/);
  expect(m).not.toBeNull();
  return Number(m![1]);
}

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

  it('offsets each back-edge band so overlapping-column back edges get distinct y-values', () => {
    // R2.1's two back edges sit in disjoint column ranges ([5,7] and [13,16]),
    // so a single shared band never collided there. A phase with two rework
    // loops whose column ranges OVERLAP (e.g. R3.1's three, R5.2's four) needs
    // each back edge's horizontal segment drawn at its own y, or the lines
    // become visually coincident — not just crowded, indistinguishable.
    const model: PhaseSwimlaneModel = {
      phaseCode: 'R3.1',
      lanes: [
        { key: 'l1', label: 'Lane A' },
        { key: 'l2', label: 'Lane B' },
      ],
      nodes: [
        { id: 'a0', bpmnId: 'a0', kind: 'task', col: 0, row: 0, label: 'A0' },
        { id: 'a1', bpmnId: 'a1', kind: 'task', col: 1, row: 0, label: 'A1' },
        { id: 'a3', bpmnId: 'a3', kind: 'gateway', col: 3, row: 0, label: 'G3' },
        { id: 'a4', bpmnId: 'a4', kind: 'gateway', col: 4, row: 1, label: 'G4' },
      ],
      edges: [
        { from: 'a4', to: 'a1', back: true }, // column range [1,4]
        { from: 'a3', to: 'a0', back: true }, // column range [0,3] — overlaps [1,4]
      ],
    };
    const { container } = render(<PhaseSwimlane model={model} statusById={{}} />);
    const paths = Array.from(container.querySelectorAll('svg.pb-swim-svg > path'));
    expect(paths).toHaveLength(2);
    const bandYs = paths.map(bandYOf);
    expect(bandYs[0]).not.toEqual(bandYs[1]);
  });

  it('gives four overlapping-column back edges (R5.2 count) distinct bands, all clear of the last node row', () => {
    // Chain of overlapping column ranges: [1,5], [2,6], [3,7], [4,8].
    const model: PhaseSwimlaneModel = {
      phaseCode: 'R5.2',
      lanes: [
        { key: 'l1', label: 'Lane A' },
        { key: 'l2', label: 'Lane B' },
        { key: 'l3', label: 'Lane C' },
      ],
      nodes: [
        { id: 't1', bpmnId: 't1', kind: 'task', col: 1, row: 0, label: 'T1' },
        { id: 'g1', bpmnId: 'g1', kind: 'gateway', col: 5, row: 0, label: 'G1' },
        { id: 't2', bpmnId: 't2', kind: 'task', col: 2, row: 1, label: 'T2' },
        { id: 'g2', bpmnId: 'g2', kind: 'gateway', col: 6, row: 1, label: 'G2' },
        // Last lane (row 2) carries nodes too — this is the row a squeezed
        // band would have crossed through before the reserve existed.
        { id: 't3', bpmnId: 't3', kind: 'task', col: 3, row: 2, label: 'T3' },
        { id: 'g3', bpmnId: 'g3', kind: 'gateway', col: 7, row: 2, label: 'G3' },
        { id: 't4', bpmnId: 't4', kind: 'task', col: 4, row: 2, label: 'T4' },
        { id: 'g4', bpmnId: 'g4', kind: 'gateway', col: 8, row: 2, label: 'G4' },
      ],
      edges: [
        { from: 'g1', to: 't1', back: true },
        { from: 'g2', to: 't2', back: true },
        { from: 'g3', to: 't3', back: true },
        { from: 'g4', to: 't4', back: true },
      ],
    };
    const { container, getByText } = render(<PhaseSwimlane model={model} statusById={{}} />);
    const paths = Array.from(container.querySelectorAll('svg.pb-swim-svg > path'));
    expect(paths).toHaveLength(4);
    const bandYs = paths.map(bandYOf);

    // 1. All four bands are at distinct y-values.
    expect(new Set(bandYs).size).toBe(4);

    // 2. Every band sits below the last row's node — read the actual
    //    rendered bottom edge off a last-row task (`T3`) rather than
    //    recomputing it from the component's own constants, so this is a
    //    rendered-output assertion, not an implementation-detail one.
    const lastRowNode = getByText('T3').closest('.pb-swim-node') as HTMLElement;
    const lastRowNodeBottom =
      parseFloat(lastRowNode.style.top) + parseFloat(lastRowNode.style.height);
    for (const y of bandYs) {
      expect(y).toBeGreaterThan(lastRowNodeBottom);
    }
  });

  it('reserves no extra canvas height when a model has no back edges', () => {
    // MODEL has zero `back: true` edges — H must equal the pre-reserve
    // lane-only formula exactly: no rework loops, no visual change.
    const { container } = render(<PhaseSwimlane model={MODEL} statusById={{}} />);
    const svg = container.querySelector('svg.pb-swim-svg')!;
    expect(svg.getAttribute('height')).toBe(String(MODEL.lanes.length * 88));
  });

  it('leaves each lane band and label at exactly ROW_H under the reserve — reserve is empty canvas, nothing stretches', () => {
    const model: PhaseSwimlaneModel = {
      phaseCode: 'R3.1',
      lanes: [
        { key: 'l1', label: 'Lane A' },
        { key: 'l2', label: 'Lane B' },
      ],
      nodes: [
        { id: 'g1', bpmnId: 'g1', kind: 'gateway', col: 3, row: 0, label: 'G1' },
        { id: 't1', bpmnId: 't1', kind: 'task', col: 0, row: 0, label: 'T1' },
      ],
      edges: [{ from: 'g1', to: 't1', back: true }],
    };
    const { container } = render(<PhaseSwimlane model={model} statusById={{}} />);
    const svg = container.querySelector('svg.pb-swim-svg')!;
    const bands = Array.from(container.querySelectorAll('.pb-swim-band')) as HTMLElement[];
    const labels = Array.from(container.querySelectorAll('.pb-swim-lane-label')) as HTMLElement[];

    // 2 lanes + 1 back edge → reserve = 1*14+10 = 24; H = 2*88 + 24 = 200.
    expect(svg.getAttribute('height')).toBe('200');
    // Every band and every label stays exactly ROW_H tall — the reserve
    // below them is not band/label coverage, so it must be blank canvas.
    for (const b of bands) expect(b.style.height).toBe('88px');
    for (const l of labels) expect(l.style.height).toBe('88px');
    const bandCoverage = bands.reduce((sum, b) => sum + parseFloat(b.style.height), 0);
    expect(bandCoverage).toBe(176); // lanes.length * ROW_H — strictly less than H (200)
  });
});
