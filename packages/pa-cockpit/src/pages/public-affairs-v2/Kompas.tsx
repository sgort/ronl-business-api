/**
 * Kompas — Flevolands Kompas visualisation (hexagon radar + 0–2 scorecard).
 *
 * Pure presentational component. Score atoms (Dots, Trend) are exported for
 * reuse across the other PA screens.
 */

import type { ReactNode } from 'react';
import {
  KOMPAS_CRITERIA,
  kompasTotal,
  kompasMax,
  kompasBand,
  type KompasScores,
  type Momentum,
} from './pa.data';

export function Dots({ score }: { score: 0 | 1 | 2 }) {
  return (
    <span className="pac-dots" aria-label={`Score ${score} van 2`}>
      {[1, 2].map((n) => (
        <span key={n} className={`pac-dot ${score >= n ? 'fill-' + score : ''}`} />
      ))}
    </span>
  );
}

export function Trend({ dir }: { dir: Momentum }) {
  const sym = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '—';
  const label = dir === 'up' ? 'stijgend' : dir === 'down' ? 'dalend' : 'stabiel';
  return (
    <span className={`pac-trend ${dir}`} title={`Momentum ${label}`}>
      {sym}
    </span>
  );
}

export function KompasRadar({ kompas, size = 240 }: { kompas: KompasScores; size?: number }) {
  const crit = KOMPAS_CRITERIA;
  const cx = size / 2;
  const cy = size / 2 - 4;
  const R = size * 0.32;
  const n = crit.length;
  const ang = (i: number) => (-90 + i * (360 / n)) * (Math.PI / 180);
  const pt = (i: number, r: number): [number, number] => [
    cx + r * Math.cos(ang(i)),
    cy + r * Math.sin(ang(i)),
  ];

  const ringPoly = (frac: number) =>
    crit
      .map((_, i) =>
        pt(i, R * frac)
          .map((v) => v.toFixed(1))
          .join(',')
      )
      .join(' ');

  const dataPoly = crit
    .map((c, i) =>
      pt(i, R * ((kompas[c.key]?.score ?? 0) / 2))
        .map((v) => v.toFixed(1))
        .join(',')
    )
    .join(' ');

  return (
    <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Flevolands Kompas radar">
      {[0.5, 1].map((f) => (
        <polygon key={f} points={ringPoly(f)} fill="none" stroke="#d1d5db" strokeWidth="1" />
      ))}
      {crit.map((c, i) => {
        const [x, y] = pt(i, R);
        return <line key={c.key} x1={cx} y1={cy} x2={x} y2={y} stroke="#e5e7eb" strokeWidth="1" />;
      })}
      <polygon
        points={dataPoly}
        fill="var(--pac-accent)"
        fillOpacity="0.18"
        stroke="var(--pac-accent)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {crit.map((c, i) => {
        const [x, y] = pt(i, R * ((kompas[c.key]?.score ?? 0) / 2));
        return <circle key={c.key} cx={x} cy={y} r="3.2" fill="var(--pac-accent)" />;
      })}
      {crit.map((c, i) => {
        const [x, y] = pt(i, R + 16);
        const anchor = Math.abs(x - cx) < 6 ? 'middle' : x > cx ? 'start' : 'end';
        return (
          <text
            key={c.key}
            x={x}
            y={y + 3}
            textAnchor={anchor}
            fontFamily="'JetBrains Mono', monospace"
            fontSize="9.5"
            fill="#6b7280"
            letterSpacing="0.02em"
          >
            {c.short}
          </text>
        );
      })}
    </svg>
  );
}

function KompasBars({ kompas }: { kompas: KompasScores }) {
  const crit = KOMPAS_CRITERIA;
  return (
    <svg viewBox="0 0 240 262" role="img" aria-label="Flevolands Kompas staafdiagram">
      {crit.map((c, i) => {
        const s = kompas[c.key]?.score ?? 0;
        const y = 14 + i * 31;
        const full = 150;
        const w = (s / 2) * full;
        const color = s === 2 ? 'var(--pac-s2)' : s === 1 ? 'var(--pac-s1)' : 'var(--pac-s0)';
        return (
          <g key={c.key}>
            <text
              x="0"
              y={y + 11}
              fontFamily="'JetBrains Mono', monospace"
              fontSize="9.5"
              fill="#6b7280"
            >
              {c.short}
            </text>
            <rect x="78" y={y} width={full} height="15" fill="#e5e7eb" />
            <rect x="78" y={y} width={w} height="15" fill={color} />
          </g>
        );
      })}
    </svg>
  );
}

export type KompasViz = 'radar' | 'bars';

export default function Kompas({
  kompas,
  showDuiding = true,
  viz = 'radar',
  extra,
}: {
  kompas: KompasScores;
  showDuiding?: boolean;
  viz?: KompasViz;
  extra?: ReactNode;
}) {
  const crit = KOMPAS_CRITERIA;
  const total = kompasTotal(kompas);
  const band = kompasBand(total);

  return (
    <div className="pac-kompas">
      <div className="pac-kompas-left">
        <div className="pac-kompas-radar">
          {viz === 'radar' ? <KompasRadar kompas={kompas} /> : <KompasBars kompas={kompas} />}
          <div className="pac-kompas-total">
            {total}
            <span> / {kompasMax()}</span>
          </div>
          <div className={`pac-kompas-band tone-${band.key}`}>{band.label}</div>
          <div className="pac-kompas-caption">Kompas-totaalscore</div>
        </div>
        {extra}
      </div>

      <div className="pac-scorecard">
        {crit.map((c, i) => {
          // Authored dossiers can carry a partial Kompas (only scored criteria);
          // default the rest so a missing criterion never crashes the cockpit.
          const s = kompas[c.key] ?? { score: 0, duiding: '' };
          return (
            <div className="pac-score-row" key={c.key}>
              <div className="pac-score-crit">
                <span className="pac-score-num">{i + 1}</span>
                <span className="pac-score-name">{c.name}</span>
              </div>
              <div className="pac-score-dots-cell">
                <Dots score={s.score} />
              </div>
              {showDuiding && s.duiding && <div className="pac-score-duiding">{s.duiding}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
