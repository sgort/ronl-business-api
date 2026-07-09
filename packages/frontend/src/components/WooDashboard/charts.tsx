import type { CSSProperties } from 'react';

interface BarRow {
  naam: string;
  n: number;
}
interface ColData {
  m: string;
  in: number;
  uit: number;
}
interface TrendPoint {
  x: number;
  label: string;
  y: number;
}
interface DonutSegment {
  naam: string;
  n?: number;
  pct?: number;
  color: string;
}

export function WBars({
  rows,
  max,
  tone,
  unit,
}: {
  rows: BarRow[];
  max?: number;
  tone?: string;
  unit?: string;
}) {
  const mx = max ?? Math.max(...rows.map((r) => r.n));
  return (
    <div className="w-bars">
      {rows.map((r, i) => (
        <div className="w-bar-row" key={i}>
          <span className="w-bar-lab">{r.naam}</span>
          <span className="w-bar-track">
            <span
              className={`w-bar-fill ${tone ?? ''}`}
              style={{ width: `${(r.n / mx) * 100}%` }}
            />
          </span>
          <span className="w-bar-val">
            {r.n}
            {unit ? <span className="sub">{unit}</span> : null}
          </span>
        </div>
      ))}
    </div>
  );
}

export function WColumns({ data }: { data: ColData[] }) {
  const mx = Math.max(...data.flatMap((d) => [d.in, d.uit]));
  return (
    <div>
      <div className="w-cols">
        {data.map((d, i) => (
          <div className="w-col-grp" key={i}>
            <div className="w-col-pair">
              <div className="w-col in" style={{ height: `${(d.in / mx) * 100}%` }}>
                <span className="cv">{d.in}</span>
              </div>
              <div className="w-col uit" style={{ height: `${(d.uit / mx) * 100}%` }}>
                <span className="cv">{d.uit}</span>
              </div>
            </div>
            <span className="w-col-lab">{d.m}</span>
          </div>
        ))}
      </div>
      <div className="w-legend">
        <span className="lg">
          <span className="sw" style={{ background: 'var(--w-blue)' }} />
          Ontvangen
        </span>
        <span className="lg">
          <span
            className="sw"
            style={{ background: 'color-mix(in srgb, var(--w-blue) 34%, white)' }}
          />
          Afgehandeld
        </span>
      </div>
    </div>
  );
}

export function WTrend({
  points,
  w = 620,
  h = 150,
  pad = 26,
  label,
}: {
  points: TrendPoint[];
  w?: number;
  h?: number;
  pad?: number;
  label?: string;
}) {
  const ys = points.map((p) => p.y);
  const maxY = Math.max(...ys) * 1.15;
  const minY = 0;
  const px = (i: number) => pad + (i / (points.length - 1)) * (w - pad * 2);
  const py = (v: number) => h - pad - ((v - minY) / (maxY - minY)) * (h - pad * 2);
  const d = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${px(i).toFixed(1)} ${py(p.y).toFixed(1)}`)
    .join(' ');
  const area = `${d} L ${px(points.length - 1).toFixed(1)} ${h - pad} L ${px(0).toFixed(1)} ${h - pad} Z`;
  return (
    <svg className="w-trend" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label ?? 'trend'}>
      {[0.25, 0.5, 0.75, 1].map((f, i) => (
        <line
          key={i}
          x1={pad}
          x2={w - pad}
          y1={py(maxY * f)}
          y2={py(maxY * f)}
          stroke="#e5e7eb"
          strokeWidth="1"
        />
      ))}
      <path d={area} fill="color-mix(in srgb, var(--w-blue) 8%, white)" />
      <path
        d={d}
        fill="none"
        stroke="var(--w-blue)"
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {points.map((p, i) => (
        <g key={i}>
          <circle
            cx={px(i)}
            cy={py(p.y)}
            r="3.5"
            fill="#fff"
            stroke="var(--w-blue)"
            strokeWidth="2"
          />
          <text
            x={px(i)}
            y={h - 8}
            textAnchor="middle"
            fontFamily="var(--v2-mono)"
            fontSize="10"
            fill="#6b7280"
          >
            {p.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function WGauge({ value, target }: { value: number; target?: number }) {
  const R = 72,
    cx = 84,
    cy = 84,
    sw = 16;
  const t = target ?? 90;
  const frac = Math.min(value, 100) / 100;
  const color = value >= t ? 'var(--w-green)' : value >= t - 8 ? 'var(--w-amber)' : 'var(--w-red)';
  const arc = (from: number, to: number) => {
    const a0 = Math.PI + Math.PI * from,
      a1 = Math.PI + Math.PI * to;
    return `M ${cx + R * Math.cos(a0)} ${cy + R * Math.sin(a0)} A ${R} ${R} 0 0 1 ${cx + R * Math.cos(a1)} ${cy + R * Math.sin(a1)}`;
  };
  const tgtFrac = t / 100;
  return (
    <div className="w-gauge" style={{ height: 100 }}>
      <svg viewBox="0 0 168 100" width="168" height="100">
        <path d={arc(0, 1)} fill="none" stroke="var(--v2-bg)" strokeWidth={sw} />
        <path d={arc(0, frac)} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="butt" />
        <line
          x1={cx + (R - sw / 2 - 3) * Math.cos(Math.PI + Math.PI * tgtFrac)}
          y1={cy + (R - sw / 2 - 3) * Math.sin(Math.PI + Math.PI * tgtFrac)}
          x2={cx + (R + sw / 2 + 3) * Math.cos(Math.PI + Math.PI * tgtFrac)}
          y2={cy + (R + sw / 2 + 3) * Math.sin(Math.PI + Math.PI * tgtFrac)}
          stroke="var(--v2-ink)"
          strokeWidth="2"
        />
      </svg>
      <div className="w-gauge-val">
        <div className="num">{value}%</div>
        <div className="lbl">doel {t}%</div>
      </div>
    </div>
  );
}

export function WDonut({ segments, size = 140 }: { segments: DonutSegment[]; size?: number }) {
  const total = segments.reduce((s, x) => s + (x.n ?? x.pct ?? 0), 0);
  const R = size / 2 - 10,
    cx = size / 2,
    cy = size / 2,
    sw = 22;
  const circ = 2 * Math.PI * R;
  let acc = 0;
  const hasPct = segments[0]?.pct != null;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="w-donut">
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--v2-bg)" strokeWidth={sw} />
      {segments.map((s, i) => {
        const v = (s.n ?? s.pct ?? 0) / total;
        const dash = `${(v * circ).toFixed(2)} ${circ.toFixed(2)}`;
        const off = -acc * circ;
        acc += v;
        const style: CSSProperties = { strokeDashoffset: off };
        return (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={R}
            fill="none"
            stroke={s.color}
            strokeWidth={sw}
            strokeDasharray={dash}
            style={style}
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        );
      })}
      <text
        x={cx}
        y={cy - 2}
        textAnchor="middle"
        fontFamily="var(--v2-serif)"
        fontSize="26"
        fontWeight="700"
        fill="var(--v2-ink)"
      >
        {total}
        {hasPct ? '%' : ''}
      </text>
      <text
        x={cx}
        y={cy + 16}
        textAnchor="middle"
        fontFamily="var(--v2-mono)"
        fontSize="9"
        fill="#6b7280"
        letterSpacing="0.06em"
      >
        TOTAAL
      </text>
    </svg>
  );
}
