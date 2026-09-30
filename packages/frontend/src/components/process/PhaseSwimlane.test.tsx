// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import PhaseSwimlane from './PhaseSwimlane';
import { edgeLabelText } from './swimlaneText';
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
      docs: ['Doc X', 'Doc Y'],
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

  it('shows every resolved document label a task carries', () => {
    // A task can produce more than one deliverable, so each gets its own
    // badge rather than the first one standing in for the rest.
    const { getByText } = render(<PhaseSwimlane model={RICH_MODEL} statusById={{}} />);
    expect(getByText('Doc X')).toBeInTheDocument();
    expect(getByText('Doc Y')).toBeInTheDocument();
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

  describe('collision stacking (nodes sharing a row/col cell)', () => {
    // Two multi-node cells — 3 nodes share (row 0, col 1) and 2 nodes share
    // (row 1, col 0) — plus single-occupant cells elsewhere, so lane occupancy
    // is uneven (3, 2, 1) across the three lanes.
    const COLLISION_MODEL: PhaseSwimlaneModel = {
      phaseCode: 'R5.1',
      lanes: [
        { key: 'l0', label: 'Lane 0' },
        { key: 'l1', label: 'Lane 1' },
        { key: 'l2', label: 'Lane 2' },
      ],
      nodes: [
        { id: 'a', bpmnId: 'a', kind: 'task', col: 0, row: 0, label: 'A' },
        { id: 'b1', bpmnId: 'b1', kind: 'task', col: 1, row: 0, label: 'B1' },
        { id: 'b2', bpmnId: 'b2', kind: 'task', col: 1, row: 0, label: 'B2' },
        { id: 'b3', bpmnId: 'b3', kind: 'task', col: 1, row: 0, label: 'B3' },
        { id: 'c1', bpmnId: 'c1', kind: 'task', col: 0, row: 1, label: 'C1' },
        { id: 'c2', bpmnId: 'c2', kind: 'task', col: 0, row: 1, label: 'C2' },
        { id: 'd', bpmnId: 'd', kind: 'task', col: 1, row: 1, label: 'D' },
        { id: 'e', bpmnId: 'e', kind: 'task', col: 0, row: 2, label: 'E' },
      ],
      edges: [{ from: 'e', to: 'a', back: true }],
    };

    it('renders every node at a unique position (no two nodes share left+top)', () => {
      const { container } = render(<PhaseSwimlane model={COLLISION_MODEL} statusById={{}} />);
      const drawn = Array.from(
        container.querySelectorAll<HTMLElement>('.pb-swim-node, .pb-swim-event, .pb-swim-gate')
      );
      expect(drawn).toHaveLength(COLLISION_MODEL.nodes.length);
      const positions = drawn.map((el) => `${el.style.left}|${el.style.top}`);
      expect(new Set(positions).size).toBe(positions.length);
    });

    it('stacks a three-node cell into three distinct positions within their own lane span', () => {
      const { getByText } = render(<PhaseSwimlane model={COLLISION_MODEL} statusById={{}} />);
      const tops = ['B1', 'B2', 'B3'].map((label) => {
        const el = getByText(label).closest('.pb-swim-node') as HTMLElement;
        return parseFloat(el.style.top);
      });
      expect(new Set(tops).size).toBe(3);
      // Lane 0 holds the worst cell in the model (3 nodes) so it spans [0, 3*ROW_H).
      for (const top of tops) {
        expect(top).toBeGreaterThanOrEqual(0);
        expect(top).toBeLessThan(3 * 88);
      }
      // None of the three may spill into lane 1, which starts at 3*ROW_H.
      const laneOneNode = getByText('D').closest('.pb-swim-node') as HTMLElement;
      expect(parseFloat(laneOneNode.style.top)).toBeGreaterThanOrEqual(3 * 88);
    });

    it('keeps lane label heights equal to their band heights when lane occupancy is uneven', () => {
      const { container } = render(<PhaseSwimlane model={COLLISION_MODEL} statusById={{}} />);
      const labels = Array.from(container.querySelectorAll('.pb-swim-lane-label')) as HTMLElement[];
      const bands = Array.from(container.querySelectorAll('.pb-swim-band')) as HTMLElement[];
      expect(labels).toHaveLength(3);
      expect(bands).toHaveLength(3);
      for (let i = 0; i < labels.length; i++) {
        expect(labels[i].style.height).toBe(bands[i].style.height);
      }
      // Occupancy differs across lanes (3, 2, 1), so heights must not all be identical.
      const heights = new Set(bands.map((b) => b.style.height));
      expect(heights.size).toBeGreaterThan(1);
    });

    it('keeps back-edge bands below every lane even when lane heights vary', () => {
      const { container } = render(<PhaseSwimlane model={COLLISION_MODEL} statusById={{}} />);
      const paths = Array.from(container.querySelectorAll('svg.pb-swim-svg > path'));
      expect(paths).toHaveLength(1);
      const bandY = bandYOf(paths[0]);
      // Total lane height = 3*88 + 2*88 + 1*88 = 528; the band must sit below that.
      expect(bandY).toBeGreaterThanOrEqual(528);
    });
  });

  it('renders a no-collision model at exactly the pre-fix height (regression property)', () => {
    // MODEL has no cell holding more than one node, so every slots[row] === 1:
    // the collision-stacking arithmetic must collapse to the original
    // constant-ROW_H formula, bit-identical to before this change.
    const { container } = render(<PhaseSwimlane model={MODEL} statusById={{}} />);
    const svg = container.querySelector('svg.pb-swim-svg')!;
    const bands = Array.from(container.querySelectorAll('.pb-swim-band')) as HTMLElement[];
    const labels = Array.from(container.querySelectorAll('.pb-swim-lane-label')) as HTMLElement[];
    expect(svg.getAttribute('height')).toBe(String(MODEL.lanes.length * 88));
    for (const b of bands) expect(b.style.height).toBe('88px');
    for (const l of labels) expect(l.style.height).toBe('88px');
  });
});

describe('PhaseSwimlane — caseworker additions', () => {
  // Col 0..4 so the call node's centre (col 3 → 3*190+95 = 665) can be
  // scrolled to; the lane keys mirror the Awb BPMNs.
  const AWB: PhaseSwimlaneModel = {
    phaseCode: 'AwbShellProcess',
    lanes: [
      { key: 'Lane_Behandelaar', label: 'Behandelaar', candidateGroups: ['caseworker'] },
      { key: 'Lane_Systeem', label: 'Systeem' },
    ],
    nodes: [
      { id: 's', bpmnId: 's', kind: 'start', col: 0, row: 1, label: 'Start' },
      { id: 'sc', bpmnId: 'sc', kind: 'script', col: 1, row: 1, label: 'Identificatie' },
      { id: 'r', bpmnId: 'r', kind: 'rule', col: 2, row: 1, label: 'Toets', dmn: 'AwbCheck' },
      { id: 'c', bpmnId: 'c', kind: 'call', col: 3, row: 0, label: 'Fase 4+5', calls: 'Sub' },
      { id: 't', bpmnId: 't', kind: 'task', col: 4, row: 0, label: 'Informeren' },
    ],
    edges: [],
  };

  it('adds nothing caseworker-specific when no caseworker prop is given (the Infra-board)', () => {
    const { container } = render(
      <PhaseSwimlane model={AWB} statusById={{}} claimedNodeIds={new Set(['t'])} />
    );
    expect(container.querySelector('.pb-swim')!.classList.contains('cwp-swim')).toBe(false);
    expect(container.querySelector('.cwp-mine, .cwp-jij, .cwp-callbtn')).toBeNull();
    expect(container.querySelector('button')).toBeNull();
    // The claimed node keeps the Infra-board's pencil, and no node gains a tooltip.
    expect(container.querySelector('.pb-swim-inprogress')!.textContent).toBe('✏');
    expect(container.querySelector('.pb-swim-node[title]')).toBeNull();
  });

  it('badges script, rule and call nodes, and draws script and rule dashed', () => {
    const { container } = render(<PhaseSwimlane model={AWB} statusById={{}} />);
    const badge = (label: string) =>
      [...container.querySelectorAll('.pb-swim-node')]
        .find((n) => n.querySelector('.nlabel')?.textContent === label)!
        .querySelector('.cwp-kind')?.textContent;
    expect(badge('Identificatie')).toBe('script');
    expect(badge('Toets')).toBe('DMN');
    expect(badge('Fase 4+5')).toBe('deelproces');
    expect(badge('Informeren')).toBeUndefined();
    const nodes = [...container.querySelectorAll('.pb-swim-node')];
    expect(nodes[0].classList.contains('service')).toBe(true);
    expect(nodes[1].classList.contains('service')).toBe(true);
    expect(nodes[2].classList.contains('call')).toBe(true);
  });

  it('tints the user’s lanes and marks them "jouw rol"', () => {
    const { container } = render(
      <PhaseSwimlane model={AWB} statusById={{}} myLaneKeys={new Set(['Lane_Behandelaar'])} />
    );
    const labels = [...container.querySelectorAll('.pb-swim-lane-label')];
    const bands = [...container.querySelectorAll('.pb-swim-band')];
    expect(labels.map((l) => l.classList.contains('cwp-mine'))).toEqual([true, false]);
    expect(bands.map((b) => b.classList.contains('cwp-mine'))).toEqual([true, false]);
    expect(labels[0].querySelector('.cwp-jij')?.textContent).toBe('jouw rol');
    expect(labels[1].querySelector('.cwp-jij')).toBeNull();
    expect(container.querySelector('.pb-swim')!.classList.contains('cwp-swim')).toBe(true);
  });

  it('labels the claimed node with claimedLabel instead of the pencil, and titles every task', () => {
    const { container } = render(
      <PhaseSwimlane
        model={AWB}
        statusById={{}}
        claimedNodeIds={new Set(['t'])}
        claimedLabel="jouw taak"
      />
    );
    expect(container.querySelector('.pb-swim-inprogress')!.textContent).toBe('jouw taak');
    const task = container.querySelector('.pb-swim-node-claimed') as HTMLElement;
    expect(task.getAttribute('title')).toBe('Informeren');
  });

  it('offers "open ↘" on a call node and reports the node', () => {
    const onOpenCall = vi.fn();
    const { getByRole } = render(
      <PhaseSwimlane model={AWB} statusById={{}} onOpenCall={onOpenCall} />
    );
    const btn = getByRole('button', { name: 'open deelproces Fase 4+5' });
    expect(btn.textContent).toBe('open ↘');
    fireEvent.click(btn);
    expect(onOpenCall).toHaveBeenCalledWith(expect.objectContaining({ id: 'c', calls: 'Sub' }));
  });

  it('scrolls horizontally to centre scrollToNodeId, clamped at 0', () => {
    const width = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400);
    const { container, rerender } = render(
      <PhaseSwimlane model={AWB} statusById={{}} scrollToNodeId="c" />
    );
    const scroll = container.querySelector('.pb-swim-scroll') as HTMLElement;
    expect(scroll.scrollLeft).toBe(665 - 200);
    rerender(<PhaseSwimlane model={AWB} statusById={{}} scrollToNodeId="s" />);
    expect(scroll.scrollLeft).toBe(0);
    width.mockRestore();
  });
});

describe('edgeLabelText', () => {
  it.each([
    ['${completenessResult.isComplete == false}', 'isComplete = false'],
    ['${eligible != true}', 'eligible ≠ true'],
    ['${subsidyGranted == true && paymentRequired}', 'subsidyGranted = true en paymentRequired'],
    ['#{a.b || c}', 'b of c'],
    ['ja', 'ja'],
    ['Aanvraag volledig', 'Aanvraag volledig'],
  ])('%s → %s', (raw, shown) => {
    expect(edgeLabelText(raw)).toBe(shown);
  });
});

describe('PhaseSwimlane — roomy density and readable edge labels', () => {
  const EXPR: PhaseSwimlaneModel = {
    ...MODEL,
    edges: [
      { from: 's', to: 't', label: '${completenessResult.isComplete == false}' },
      { from: 't', to: 'p', label: 'Ja' },
    ],
  };

  it('keeps the Infra-board’s sizes by default', () => {
    const { container } = render(<PhaseSwimlane model={MODEL} statusById={{}} />);
    const node = container.querySelector('.pb-swim-node') as HTMLElement;
    expect(node.style.width).toBe('152px');
    expect(node.style.height).toBe('54px');
  });

  it('gives nodes, rows and columns more room when roomy', () => {
    const { container } = render(<PhaseSwimlane model={MODEL} statusById={{}} density="roomy" />);
    const node = container.querySelector('.pb-swim-node') as HTMLElement;
    expect(node.style.width).toBe('184px');
    expect(node.style.height).toBe('84px');
    const svg = container.querySelector('svg.pb-swim-svg')!;
    expect(svg.getAttribute('height')).toBe(String(MODEL.lanes.length * 132));
  });

  it('shows the Infra-board’s edge labels verbatim, without a tooltip', () => {
    const { container } = render(<PhaseSwimlane model={EXPR} statusById={{}} />);
    const labels = [...container.querySelectorAll('.pb-swim-edgelabel')];
    expect(labels[0].textContent).toBe('${completenessResult.isComplete == false}');
    expect(labels[0].hasAttribute('title')).toBe(false);
  });

  it('shortens expression labels in caseworker mode, with the full expression as tooltip', () => {
    const { container } = render(
      <PhaseSwimlane model={EXPR} statusById={{}} claimedLabel="jouw taak" />
    );
    const labels = [...container.querySelectorAll('.pb-swim-edgelabel')];
    expect(labels[0].textContent).toBe('isComplete = false');
    expect(labels[0].getAttribute('title')).toBe('${completenessResult.isComplete == false}');
    expect(labels[1].textContent).toBe('Ja');
  });
});
