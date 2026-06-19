import {
  FASE1_LANES,
  FASE1_NODES,
  FASE1_EDGES,
  STATUS,
  type StatusKey,
} from '../../pages/infra-board/rip-model';

const COL_W = 190,
  ROW_H = 88,
  NODE_W = 152,
  NODE_H = 54,
  GATE = 46;

/** SVG swimlane for RIP Fase 1. `statusById` maps node id → status (live or derived). */
export default function Fase1Swimlane({ statusById }: { statusById: Record<string, StatusKey> }) {
  const nodeById = Object.fromEntries(FASE1_NODES.map((n) => [n.id, n]));
  const nCols = Math.max(...FASE1_NODES.map((n) => n.col)) + 1;
  const W = nCols * COL_W;
  const H = FASE1_LANES.length * ROW_H;
  const cx = (n: { col: number }) => n.col * COL_W + COL_W / 2;
  const cy = (n: { row: number }) => n.row * ROW_H + ROW_H / 2;
  const st = (id: string): StatusKey => statusById[id] ?? 'todo';
  const edgeColor = (from: string) => (st(from) === 'done' ? '#3fa535' : '#c2c7d0');

  const paths = FASE1_EDGES.map((e, i) => {
    const a = nodeById[e.from],
      b = nodeById[e.to];
    if (!a || !b) return null;
    const ax = cx(a),
      ay = cy(a),
      bx = cx(b),
      by = cy(b);
    let d: string;
    if (e.back) {
      const bandY = H - 10;
      d = `M ${ax} ${ay + NODE_H / 2} V ${bandY} H ${bx} V ${by + NODE_H / 2}`;
    } else {
      const aw = a.kind === 'gateway' ? GATE / 2 : NODE_W / 2;
      const bw = b.kind === 'gateway' ? GATE / 2 : NODE_W / 2;
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
  }).filter(Boolean) as {
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
        {FASE1_LANES.map((l) => (
          <div className="pb-swim-lane-label" key={l.key} style={{ height: ROW_H }}>
            {l.label}
          </div>
        ))}
      </div>
      <div className="pb-swim-scroll">
        <div className="pb-swim-canvas" style={{ width: W, height: H }}>
          {FASE1_LANES.map((l, i) => (
            <div
              key={l.key}
              className={`pb-swim-band ${i % 2 ? 'alt' : ''}`}
              style={{ top: i * ROW_H, height: ROW_H, width: W }}
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
          {FASE1_NODES.map((n) => {
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
            if (n.kind === 'gateway') {
              return (
                <div
                  key={n.id}
                  className={`pb-swim-gate ${st(n.id)}`}
                  style={{
                    left: cx(n) - GATE / 2,
                    top: cy(n) - GATE / 2,
                    width: GATE,
                    height: GATE,
                  }}
                >
                  <span className="gx">×</span>
                  <span className="gl">{n.label}</span>
                </div>
              );
            }
            return (
              <div
                key={n.id}
                className={`pb-swim-node ${st(n.id)} ${n.kind}`}
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
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
