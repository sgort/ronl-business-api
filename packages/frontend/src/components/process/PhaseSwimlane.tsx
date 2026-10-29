import './process-view.css';
import { STATUS, type StatusKey } from './status';
import { useEffect, useRef } from 'react';
import { edgeLabelText } from './swimlaneText';
import { gatewayKind, isIdLabel, type NodeMark } from './processMarks';
import type { NodeKind, PhaseSwimlaneModel, SwimNode } from '@ronl/shared';

/**
 * The swimlane drawing behind ProcessView. Internal to components/process:
 * dashboards use ProcessView (process-view-guard.test.ts enforces it), which
 * derives `marks` and `myLanes` from the data and the viewer.
 */

/** The one grid. */
const COL_W = 240;
const ROW_H = 132;
const NODE_W = 184;
const NODE_H = 84;
const GATE = 52;
/** Row height of a lane with no nodes in this process. */
const SLIM_H = 44;
/** Parallel split/join bar and exclusive-merge dot. */
const BAR_W = 8;
const BAR_H = 72;
const MERGE = 14;

/** Foot badge per node kind; the other kinds carry none. */
const KIND_BADGE: Partial<Record<NodeKind, string>> = {
  script: 'script',
  rule: 'DMN',
  call: 'deelproces',
};

const EMPTY_MARKS: ReadonlyMap<string, NodeMark> = new Map();
const EMPTY_LANES: ReadonlySet<string> = new Set();

export default function PhaseSwimlane({
  model,
  statusById,
  marks = EMPTY_MARKS,
  myLanes = EMPTY_LANES,
  focusNodeId,
  scrollToNodeId,
  onOpenCall,
}: {
  model: PhaseSwimlaneModel;
  statusById: Record<string, StatusKey>;
  /** Mark per node with an open task: mine → "jouw taak", claimed → "geclaimd", open → no tab. */
  marks?: ReadonlyMap<string, NodeMark>;
  /** Lanes the viewer works in: tinted and tagged "jouw rol". */
  myLanes?: ReadonlySet<string>;
  /** The task this view is about: outlined unless it is the viewer's own (that one has its tab). */
  focusNodeId?: string | null;
  /** Centred horizontally on mount and change; defaults to focusNodeId. */
  scrollToNodeId?: string | null;
  /** Adds an "open ↘" button to each call node. */
  onOpenCall?: (node: SwimNode) => void;
}) {
  const { lanes, nodes, edges } = model;
  const scrollRef = useRef<HTMLDivElement>(null);
  const nodeById = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const nCols = nodes.length ? Math.max(...nodes.map((n) => n.col)) + 1 : 1;
  const W = nCols * COL_W;

  // Parallel branches can share a (row, col) cell; occupants stack within the
  // lane in document order, and a lane's slot count is its worst cell.
  const slotsPerRow: number[] = new Array(lanes.length).fill(1);
  const cellOccupancy = new Map<string, number>();
  for (const n of nodes) {
    const key = `${n.row}:${n.col}`;
    cellOccupancy.set(key, (cellOccupancy.get(key) ?? 0) + 1);
  }
  for (const [key, count] of cellOccupancy) {
    const row = Number(key.split(':')[0]);
    if (row >= 0 && row < slotsPerRow.length) slotsPerRow[row] = Math.max(slotsPerRow[row], count);
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
  const isEmptyLane = (row: number) => !rowsWithNodes.has(row);
  const laneHeights = slotsPerRow.map((slots, row) => (isEmptyLane(row) ? SLIM_H : slots * ROW_H));
  const laneTop: number[] = [];
  {
    let acc = 0;
    for (const h of laneHeights) {
      laneTop.push(acc);
      acc += h;
    }
  }
  const totalLaneHeight = laneHeights.reduce((sum, h) => sum + h, 0);

  // Rework (back) edges route through a band below every node row.
  const backEdgeCount = edges.filter((e) => e.back).length;
  const bandReserve = backEdgeCount ? backEdgeCount * 14 + 10 : 0;
  const H = totalLaneHeight + bandReserve;
  const cx = (n: { col: number }) => n.col * COL_W + COL_W / 2;
  const cy = (n: { id: string; row: number }) =>
    (laneTop[n.row] ?? n.row * ROW_H) + (slotByNodeId[n.id] ?? 0) * ROW_H + ROW_H / 2;
  const st = (id: string): StatusKey => statusById[id] ?? 'todo';
  const halfW = (n: SwimNode) => {
    if (n.kind !== 'gateway' && n.kind !== 'parallel') return NODE_W / 2;
    const g = gatewayKind(n, edges);
    return g === 'split' || g === 'join' ? BAR_W / 2 : g === 'merge' ? MERGE / 2 : GATE / 2;
  };
  /** Half height per shape, so vertical edges meet its edge: a rotated square reaches side·√2/2. */
  const halfH = (n: SwimNode) => {
    if (n.kind !== 'gateway' && n.kind !== 'parallel') return NODE_H / 2;
    const g = gatewayKind(n, edges);
    return g === 'split' || g === 'join'
      ? BAR_H / 2
      : g === 'merge'
        ? (MERGE * Math.SQRT2) / 2
        : (GATE * Math.SQRT2) / 2;
  };

  const scrollTarget = scrollToNodeId === undefined ? focusNodeId : scrollToNodeId;
  useEffect(() => {
    if (scrollTarget === undefined || !scrollRef.current) return;
    const target = scrollTarget === null ? undefined : nodeById[scrollTarget];
    const el = scrollRef.current;
    el.scrollLeft = target ? Math.max(0, cx(target) - el.clientWidth / 2) : 0;
    // cx and nodeById derive from model, which is in the deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollTarget, model]);
  const edgeColor = (from: string) => (st(from) === 'done' ? '#3fa535' : '#c2c7d0');

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
        const bandY = totalLaneHeight + 10 + backCount * 14;
        backCount++;
        d = `M ${ax} ${ay + halfH(a)} V ${bandY} H ${bx} V ${by + halfH(b)}`;
      } else {
        const sx = ax + halfW(a),
          tx = bx - halfW(b);
        const midX = a.col === b.col ? ax : (sx + tx) / 2;
        d =
          a.col === b.col
            ? `M ${ax} ${ay + halfH(a)} V ${by - halfH(b)}`
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

  const laneMine = (key: string) => myLanes.has(key);
  const emptyAttr = (row: number) => (isEmptyLane(row) ? { 'data-lane-empty': '' } : {});

  return (
    <div className="pb-swim">
      <div className="pb-swim-lanes">
        {lanes.map((l, i) => (
          <div
            className={`pb-swim-lane-label${laneMine(l.key) ? ' cwp-mine' : ''}${isEmptyLane(i) ? ' slim' : ''}`}
            key={l.key}
            style={{ height: laneHeights[i] }}
            {...emptyAttr(i)}
          >
            {l.label}
            {laneMine(l.key) && <span className="cwp-jij">jouw rol</span>}
          </div>
        ))}
      </div>
      <div className="pb-swim-scroll" ref={scrollRef}>
        <div className="pb-swim-canvas" style={{ width: W, height: H }}>
          {lanes.map((l, i) => (
            <div
              key={l.key}
              className={`pb-swim-band ${i % 2 ? 'alt' : ''}${laneMine(l.key) ? ' cwp-mine' : ''}`}
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
                title={p.label}
              >
                {edgeLabelText(p.label!)}
              </span>
            ))}
          {nodes.map((n) => {
            const s = STATUS[st(n.id)];
            if (n.kind === 'start' || n.kind === 'end') {
              return (
                <div
                  key={n.id}
                  className={`pb-swim-event ${st(n.id)}`}
                  data-node-id={n.id}
                  style={{ left: cx(n) - 34, top: cy(n) - 22 }}
                >
                  <span className="ev-dot" style={{ borderColor: s.color }} />
                  <span className="ev-label">{n.label}</span>
                </div>
              );
            }
            if (n.kind === 'gateway' || n.kind === 'parallel') {
              const g = gatewayKind(n, edges);
              if (g === 'split' || g === 'join') {
                return (
                  <div
                    key={n.id}
                    className={`pb-swim-bar ${st(n.id)} ${g}`}
                    data-node-id={n.id}
                    data-gateway={g}
                    style={{
                      left: cx(n) - BAR_W / 2,
                      top: cy(n) - BAR_H / 2,
                      width: BAR_W,
                      height: BAR_H,
                    }}
                  >
                    <span className="bl">{g === 'split' ? 'tegelijk' : 'alles klaar'}</span>
                  </div>
                );
              }
              if (g === 'merge') {
                return (
                  <div
                    key={n.id}
                    className={`pb-swim-merge ${st(n.id)}`}
                    data-node-id={n.id}
                    data-gateway="merge"
                    style={{
                      left: cx(n) - MERGE / 2,
                      top: cy(n) - MERGE / 2,
                      width: MERGE,
                      height: MERGE,
                    }}
                  />
                );
              }
              return (
                <div
                  key={n.id}
                  className={`pb-swim-gate ${st(n.id)} ${n.kind}`}
                  data-node-id={n.id}
                  data-gateway="decision"
                  style={{
                    left: cx(n) - GATE / 2,
                    top: cy(n) - GATE / 2,
                    width: GATE,
                    height: GATE,
                  }}
                >
                  <span className="gd" aria-hidden="true" />
                  <span className="gx">?</span>
                  {!isIdLabel(n) && <span className="gl">{n.label}</span>}
                </div>
              );
            }
            const mark = marks.get(n.id);
            const tab = mark === 'mine' ? 'jouw taak' : mark === 'claimed' ? 'geclaimd' : null;
            // Dashed outline: a task that is not the viewer's own (open, or claimed by
            // a colleague), or the task the view is about when it is not the viewer's.
            // The viewer's own task has the solid outline and "jouw taak" instead.
            const focus =
              mark === 'open' || mark === 'claimed' || (focusNodeId === n.id && mark !== 'mine');
            // Script and rule tasks run without a person: drawn dashed like a service task.
            const kindClass = n.kind === 'script' || n.kind === 'rule' ? 'service' : n.kind;
            const badge = KIND_BADGE[n.kind];
            return (
              <div
                key={n.id}
                title={n.dmn ? `${n.label} (${n.dmn})` : n.label}
                className={`pb-swim-node ${st(n.id)} ${kindClass}${mark === 'mine' ? ' pb-swim-node-claimed' : ''}${focus ? ' pv-focus' : ''}${n.docs?.length ? ' has-docs' : ''}`}
                data-node-id={n.id}
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
                {n.docs?.length ? (
                  <span className="nfoot">
                    {n.docs.map((doc) => (
                      <span key={doc} className="ndoc">
                        {doc}
                      </span>
                    ))}
                  </span>
                ) : null}
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
