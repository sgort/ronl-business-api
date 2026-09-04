import { STATUS, type StatusKey } from '../../pages/infra-board/rip-model';
import type { PhaseSwimlaneModel } from '@ronl/shared';

const COL_W = 190,
  ROW_H = 88,
  NODE_W = 152,
  NODE_H = 54,
  GATE = 46;

/** SVG swimlane for a RIP process phase. `model` supplies the lanes, nodes and
 *  edges to draw. `statusById` maps node id → status (live or derived).
 *  `claimedNodeIds` highlights nodes whose task is currently claimed/in progress. */
export default function PhaseSwimlane({
  model,
  statusById,
  claimedNodeIds = new Set(),
}: {
  model: PhaseSwimlaneModel;
  statusById: Record<string, StatusKey>;
  claimedNodeIds?: Set<string>;
}) {
  const { lanes, nodes, edges } = model;
  const nodeById = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const nCols = nodes.length ? Math.max(...nodes.map((n) => n.col)) + 1 : 1;
  const W = nCols * COL_W;

  // The BPMN legitimately puts parallel branches in the same lane at the same
  // depth, so more than one node can share a (row, col) cell. Colliding nodes
  // stack within their lane instead of drawing on top of each other: each
  // cell's occupants get sequential slots in `nodes` document order (the
  // parser's stable order), and a lane's slot count is the worst cell
  // occupancy anywhere in that row. A lane with no collisions keeps slots=1,
  // so its height stays exactly ROW_H — the arithmetic below collapses to the
  // original constant-ROW_H formula whenever no cell holds more than one node.
  const slotsPerRow: number[] = new Array(lanes.length).fill(1);
  const cellOccupancy = new Map<string, number>();
  for (const n of nodes) {
    const key = `${n.row}:${n.col}`;
    cellOccupancy.set(key, (cellOccupancy.get(key) ?? 0) + 1);
  }
  for (const [key, count] of cellOccupancy) {
    const row = Number(key.split(':')[0]);
    if (row >= 0 && row < slotsPerRow.length) {
      slotsPerRow[row] = Math.max(slotsPerRow[row], count);
    }
  }
  const slotByNodeId: Record<string, number> = {};
  const seenInCell = new Map<string, number>();
  for (const n of nodes) {
    const key = `${n.row}:${n.col}`;
    const slot = seenInCell.get(key) ?? 0;
    slotByNodeId[n.id] = slot;
    seenInCell.set(key, slot + 1);
  }
  const laneHeights = slotsPerRow.map((slots) => slots * ROW_H);
  const laneTop: number[] = [];
  {
    let acc = 0;
    for (const h of laneHeights) {
      laneTop.push(acc);
      acc += h;
    }
  }
  const totalLaneHeight = laneHeights.reduce((sum, h) => sum + h, 0);

  // Rework (back) edges route through a dedicated band below every node row
  // rather than borrowing space from the bottom lane. With no back edges the
  // reserve is 0 and H is exactly the lane-only height — unchanged from before.
  const backEdgeCount = edges.filter((e) => e.back).length;
  const bandReserve = backEdgeCount ? backEdgeCount * 14 + 10 : 0;
  const H = totalLaneHeight + bandReserve;
  const cx = (n: { col: number }) => n.col * COL_W + COL_W / 2;
  const cy = (n: { id: string; row: number }) =>
    (laneTop[n.row] ?? n.row * ROW_H) + (slotByNodeId[n.id] ?? 0) * ROW_H + ROW_H / 2;
  const st = (id: string): StatusKey => statusById[id] ?? 'todo';
  const edgeColor = (from: string) => (st(from) === 'done' ? '#3fa535' : '#c2c7d0');

  // Incremented only for back (rework-loop) edges, in edge order — never by
  // the map's array index, which would also space out non-back edges.
  let backCount = 0;
  const paths = edges
    .map((e, i) => {
      const a = nodeById[e.from],
        b = nodeById[e.to];
      if (!a || !b) return null;
      const ax = cx(a),
        ay = cy(a),
        bx = cx(b),
        by = cy(b);
      let d: string;
      if (e.back) {
        // Each back edge gets its own band, in the reserve below every node
        // row, so overlapping-column rework loops draw distinct horizontal
        // segments instead of coinciding — or crossing through node rows.
        const bandY = totalLaneHeight + 10 + backCount * 14;
        backCount++;
        d = `M ${ax} ${ay + NODE_H / 2} V ${bandY} H ${bx} V ${by + NODE_H / 2}`;
      } else {
        const aw = a.kind === 'gateway' || a.kind === 'parallel' ? GATE / 2 : NODE_W / 2;
        const bw = b.kind === 'gateway' || b.kind === 'parallel' ? GATE / 2 : NODE_W / 2;
        const sx = ax + aw,
          tx = bx - bw;
        const midX = a.col === b.col ? ax : (sx + tx) / 2;
        d =
          a.col === b.col
            ? `M ${ax} ${ay + NODE_H / 2} V ${by - NODE_H / 2}`
            : `M ${sx} ${ay} H ${midX} V ${by} H ${tx}`;
      }
      return {
        d,
        color: edgeColor(e.from),
        label: e.label,
        key: i,
        lx: (ax + bx) / 2,
        ly: (ay + by) / 2 - 8,
      };
    })
    .filter(Boolean) as {
    d: string;
    color: string;
    label?: string;
    key: number;
    lx: number;
    ly: number;
  }[];

  return (
    <div className="pb-swim">
      <div className="pb-swim-lanes">
        {lanes.map((l, i) => (
          <div className="pb-swim-lane-label" key={l.key} style={{ height: laneHeights[i] }}>
            {l.label}
          </div>
        ))}
      </div>
      <div className="pb-swim-scroll">
        <div className="pb-swim-canvas" style={{ width: W, height: H }}>
          {lanes.map((l, i) => (
            <div
              key={l.key}
              className={`pb-swim-band ${i % 2 ? 'alt' : ''}`}
              style={{ top: laneTop[i], height: laneHeights[i], width: W }}
            />
          ))}
          <svg className="pb-swim-svg" width={W} height={H}>
            <defs>
              <marker
                id="pb-arrow"
                markerWidth="8"
                markerHeight="8"
                refX="6"
                refY="3"
                orient="auto"
              >
                <path d="M0,0 L6,3 L0,6 Z" fill="#9aa1ad" />
              </marker>
            </defs>
            {paths.map((p) => (
              <path
                key={p.key}
                d={p.d}
                fill="none"
                stroke={p.color}
                strokeWidth="2"
                markerEnd="url(#pb-arrow)"
              />
            ))}
          </svg>
          {paths
            .filter((p) => p.label)
            .map((p) => (
              <span
                key={'l' + p.key}
                className="pb-swim-edgelabel"
                style={{ left: p.lx, top: p.ly }}
              >
                {p.label}
              </span>
            ))}
          {nodes.map((n) => {
            const s = STATUS[st(n.id)];
            if (n.kind === 'start' || n.kind === 'end') {
              return (
                <div
                  key={n.id}
                  className={`pb-swim-event ${st(n.id)}`}
                  style={{ left: cx(n) - 34, top: cy(n) - 22 }}
                >
                  <span className="ev-dot" style={{ borderColor: s.color }} />
                  <span className="ev-label">{n.label}</span>
                </div>
              );
            }
            if (n.kind === 'gateway' || n.kind === 'parallel') {
              return (
                <div
                  key={n.id}
                  className={`pb-swim-gate ${st(n.id)} ${n.kind}`}
                  style={{
                    left: cx(n) - GATE / 2,
                    top: cy(n) - GATE / 2,
                    width: GATE,
                    height: GATE,
                  }}
                >
                  <span className="gx">{n.kind === 'parallel' ? '+' : '×'}</span>
                  <span className="gl">{n.label}</span>
                </div>
              );
            }
            const claimed = claimedNodeIds.has(n.id);
            return (
              <div
                key={n.id}
                className={`pb-swim-node ${st(n.id)} ${n.kind}${claimed ? ' pb-swim-node-claimed' : ''}`}
                style={{
                  left: cx(n) - NODE_W / 2,
                  top: cy(n) - NODE_H / 2,
                  width: NODE_W,
                  height: NODE_H,
                  borderTopColor: s.color,
                }}
              >
                <span className="nlabel">{n.label}</span>
                {n.doc && <span className="ndoc">{n.doc}</span>}
                {n.kind === 'service' && <span className="nauto">automatisch</span>}
                {claimed && (
                  <span className="pb-swim-inprogress" title="In behandeling">
                    ✏
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
