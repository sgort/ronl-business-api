import './process-view.css';
import { STATUS, type StatusKey } from './status';
import { useEffect, useRef } from 'react';
import { edgeLabelText } from './swimlaneText';
import type { NodeKind, PhaseSwimlaneModel, SwimNode } from '@ronl/shared';
import { isIdLabel, type NodeMark } from './processMarks';

/** Row height of a lane with no nodes in this process. */
const SLIM_H = 44;

/**
 * Grid and node sizes. compact is the Infra-board's, unchanged; roomy is the
 * caseworker overlay's, which has the height to spare and needs it for
 * longer labels plus the JOUW TAAK tab and the SCRIPT / DMN badges.
 */
const DENSITY = {
  compact: { COL_W: 190, ROW_H: 88, NODE_W: 152, NODE_H: 54, GATE: 46 },
  roomy: { COL_W: 240, ROW_H: 132, NODE_W: 184, NODE_H: 84, GATE: 52 },
} as const;

/** Foot badge per node kind; the other kinds carry none. */
const KIND_BADGE: Partial<Record<NodeKind, string>> = {
  script: 'script',
  rule: 'DMN',
  call: 'deelproces',
};

/** SVG swimlane for a BPMN process: a RIP phase on the Infra-board, or a
 *  caseworker process. `model` supplies the lanes, nodes and edges to draw.
 *  `statusById` maps node id → status (live or derived).
 *  `claimedNodeIds` highlights nodes whose task is currently claimed/in progress.
 *
 *  The remaining props are the caseworker procesweergave's and all default off.
 *  Any one of them adds `cwp-swim` to the root, which scopes the caseworker
 *  restyling (claimed-node tab, label clamp) so the Infra-board, which passes
 *  none, renders exactly as before. */
export default function PhaseSwimlane({
  model,
  statusById,
  claimedNodeIds = new Set(),
  myLaneKeys,
  claimedLabel,
  onOpenCall,
  scrollToNodeId,
  density = 'compact',
  marks,
  myLanes,
  focusNodeId,
}: {
  model: PhaseSwimlaneModel;
  statusById: Record<string, StatusKey>;
  claimedNodeIds?: Set<string>;
  /** Lanes the user works in: tinted, and marked "jouw rol". */
  myLaneKeys?: ReadonlySet<string>;
  /** Tab text on a claimed node (e.g. "jouw taak"), replacing the ✏ glyph. */
  claimedLabel?: string;
  /** Adds an "open ↘" button to each call node. */
  onOpenCall?: (node: SwimNode) => void;
  /** Centre this node horizontally on mount and whenever it changes. */
  scrollToNodeId?: string | null;
  /** Grid size; the Infra-board's compact by default. */
  density?: keyof typeof DENSITY;
  /** ProcessView's marks per node. Its presence selects the shared look: roomy grid, slim empty lanes, tabs by mark. */
  marks?: ReadonlyMap<string, NodeMark>;
  /** ProcessView's lanes to tint, replacing myLaneKeys on the marks path. */
  myLanes?: ReadonlySet<string>;
  /** Outlined (unless it is the viewer's own task); scrolled to when no scrollToNodeId is given. */
  focusNodeId?: string | null;
}) {
  const shared = marks !== undefined;
  const { COL_W, ROW_H, NODE_W, NODE_H, GATE } = DENSITY[shared ? 'roomy' : density];
  const { lanes, nodes, edges } = model;
  const caseworker =
    shared ||
    myLaneKeys !== undefined ||
    claimedLabel !== undefined ||
    onOpenCall !== undefined ||
    scrollToNodeId !== undefined;
  const lanesMine = shared ? myLanes : myLaneKeys;
  const mine = (key: string) => lanesMine?.has(key) ?? false;
  // On the shared path scrollToNodeId (when given) scrolls and focusNodeId only outlines.
  const scrollTarget = shared && scrollToNodeId === undefined ? focusNodeId : scrollToNodeId;
  const scrollRef = useRef<HTMLDivElement>(null);
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
  const rowsWithNodes = new Set(nodes.map((n) => n.row));
  const isEmptyLane = (row: number) => shared && !rowsWithNodes.has(row);
  const laneHeights = slotsPerRow.map((slots, row) => (isEmptyLane(row) ? SLIM_H : slots * ROW_H));
  const emptyAttr = (row: number) => (isEmptyLane(row) ? { 'data-lane-empty': '' } : {});
  const idAttr = (id: string) => (shared ? { 'data-node-id': id } : {});
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

  useEffect(() => {
    if (scrollTarget === undefined || !scrollRef.current) return;
    const target = scrollTarget === null ? undefined : nodeById[scrollTarget];
    const el = scrollRef.current;
    el.scrollLeft = target ? Math.max(0, cx(target) - el.clientWidth / 2) : 0;
    // cx and nodeById derive from model, which is in the deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollTarget, model]);
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
    <div className={caseworker ? 'pb-swim cwp-swim' : 'pb-swim'}>
      <div className="pb-swim-lanes">
        {lanes.map((l, i) => (
          <div
            className={`pb-swim-lane-label${mine(l.key) ? ' cwp-mine' : ''}${isEmptyLane(i) ? ' slim' : ''}`}
            key={l.key}
            style={{ height: laneHeights[i] }}
            {...emptyAttr(i)}
          >
            {l.label}
            {mine(l.key) && <span className="cwp-jij">jouw rol</span>}
          </div>
        ))}
      </div>
      <div className="pb-swim-scroll" ref={scrollRef}>
        <div className="pb-swim-canvas" style={{ width: W, height: H }}>
          {lanes.map((l, i) => (
            <div
              key={l.key}
              className={`pb-swim-band ${i % 2 ? 'alt' : ''}${mine(l.key) ? ' cwp-mine' : ''}`}
              style={{ top: laneTop[i], height: laneHeights[i], width: W }}
              {...emptyAttr(i)}
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
                {...(caseworker ? { title: p.label } : {})}
              >
                {caseworker && p.label ? edgeLabelText(p.label) : p.label}
              </span>
            ))}
          {nodes.map((n) => {
            const s = STATUS[st(n.id)];
            if (n.kind === 'start' || n.kind === 'end') {
              return (
                <div
                  key={n.id}
                  className={`pb-swim-event ${st(n.id)}`}
                  {...idAttr(n.id)}
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
                  {...idAttr(n.id)}
                  style={{
                    left: cx(n) - GATE / 2,
                    top: cy(n) - GATE / 2,
                    width: GATE,
                    height: GATE,
                  }}
                >
                  <span className="gx">{n.kind === 'parallel' ? '+' : '×'}</span>
                  {!(shared && isIdLabel(n)) && <span className="gl">{n.label}</span>}
                </div>
              );
            }
            const mark = shared ? marks.get(n.id) : undefined;
            const claimed = shared ? mark === 'mine' : claimedNodeIds.has(n.id);
            const tab = shared
              ? mark === 'mine'
                ? 'jouw taak'
                : mark === 'claimed'
                  ? 'geclaimd'
                  : null
              : claimed
                ? (claimedLabel ?? '✏')
                : null;
            const focus = shared && focusNodeId === n.id && mark !== 'mine';
            // Script and rule tasks run without a person: drawn dashed like a
            // service task, and told apart by their foot badge.
            const kindClass = n.kind === 'script' || n.kind === 'rule' ? 'service' : n.kind;
            const badge = KIND_BADGE[n.kind];
            return (
              <div
                key={n.id}
                {...(caseworker ? { title: n.dmn ? `${n.label} (${n.dmn})` : n.label } : {})}
                className={`pb-swim-node ${st(n.id)} ${kindClass}${claimed ? ' pb-swim-node-claimed' : ''}${focus ? ' pv-focus' : ''}${shared && n.docs?.length ? ' has-docs' : ''}`}
                {...idAttr(n.id)}
                {...(mark ? { 'data-mark': mark } : {})}
                style={{
                  left: cx(n) - NODE_W / 2,
                  top: cy(n) - NODE_H / 2,
                  width: NODE_W,
                  height: NODE_H,
                  borderTopColor: s.color,
                }}
              >
                <span className="nlabel">{n.label}</span>
                {shared ? (
                  n.docs?.length ? (
                    <span className="nfoot">
                      {n.docs.map((doc) => (
                        <span key={doc} className="ndoc">
                          {doc}
                        </span>
                      ))}
                    </span>
                  ) : null
                ) : (
                  n.docs?.map((doc) => (
                    <span key={doc} className="ndoc">
                      {doc}
                    </span>
                  ))
                )}
                {n.kind === 'service' && <span className="nauto">automatisch</span>}
                {badge && <span className="cwp-kind">{badge}</span>}
                {n.kind === 'call' && onOpenCall && (
                  <button
                    type="button"
                    className="cwp-callbtn"
                    aria-label={`open deelproces ${n.label}`}
                    onClick={() => onOpenCall(n)}
                  >
                    open ↘
                  </button>
                )}
                {tab && (
                  <span
                    className={`pb-swim-inprogress${mark === 'claimed' ? ' other' : ''}`}
                    title={mark === 'claimed' ? 'Geclaimd door een collega' : 'In behandeling'}
                  >
                    {tab}
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
