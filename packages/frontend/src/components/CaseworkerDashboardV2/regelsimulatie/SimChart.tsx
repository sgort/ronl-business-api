import { simEurK } from './simFormat';
import type { SimDaySnapshot, SimResult } from './types';

interface CumBand {
  b0: number;
  b1: number;
  b2: number;
  b3: number;
  b4: number;
  b5: number;
  b6: number;
}

interface Boundary {
  ts: number;
  lbl: string;
  cls: string;
  i: number;
}

interface Tick {
  i: number;
  lbl: string;
}

interface Exhaust {
  i: number;
  label: string;
}

/* ---- depletion chart (SVG) -------------------------------- */
export default function SimChart({ result, day }: { result: SimResult; day: number }) {
  const W = 720,
    H = 220,
    padL = 52,
    padR = 6,
    padT = 10,
    padB = 22;
  const days = result.days;
  const N = days.length;
  const yMax = Math.max(1, ...days.map((d) => d.poolTotal));
  const x = (i: number) => padL + (i / (N - 1)) * (W - padL - padR);
  const y = (v: number) => padT + (1 - v / yMax) * (H - padT - padB);

  // Per-day stacked decomposition of the unspent budget, bottom → top:
  //   eig free · huur free · (merged free, after 1 Oct) · eig reserved · huur reserved · appeal-hold
  // In the split phase each type has its own pot; the real free (beschikbaar) is
  // split across eig/huur in proportion to each pot's headroom (removing the small
  // slice held for appeals). After the pots merge the free part is a single shared
  // block. Reservations stay attributed per type throughout.
  const cum: CumBand[] = days.map((d: SimDaySnapshot) => {
    const split = d.availE != null;
    const eigH = split ? Math.max(0, d.availE ?? 0) : 0; // headroom incl. hold-space
    const huurH = split ? Math.max(0, d.availH ?? 0) : 0;
    const totH = eigH + huurH;
    const besch = Math.max(0, d.beschikbaar);
    let eigFree = 0,
      huurFree = 0,
      mergedFree = 0;
    if (split) {
      const sc = totH > 0 ? besch / totH : 0;
      eigFree = eigH * sc;
      huurFree = huurH * sc;
    } else {
      mergedFree = besch;
    }
    const eigRes = Math.max(0, d.reservedE || 0);
    const huurRes = Math.max(0, d.reservedH || 0);
    const hold = Math.max(0, d.holdTotal || 0);
    const b1 = eigFree;
    const b2 = b1 + huurFree;
    const b3 = b2 + mergedFree; // top of free = beschikbaar
    const b4 = b3 + eigRes;
    const b5 = b4 + huurRes;
    const b6 = b5 + hold;
    return { b0: 0, b1, b2, b3, b4, b5, b6 };
  });
  const band = (loKey: keyof CumBand, upKey: keyof CumBand) => {
    let p = `M ${x(0)} ${y(cum[0][upKey])}`;
    for (let i = 1; i < N; i++) p += ` L ${x(i)} ${y(cum[i][upKey])}`;
    for (let i = N - 1; i >= 0; i--) p += ` L ${x(i)} ${y(cum[i][loKey])}`;
    return p + ' Z';
  };
  const line = (key: keyof CumBand) => {
    let p = `M ${x(0)} ${y(cum[0][key])}`;
    for (let i = 1; i < N; i++) p += ` L ${x(i)} ${y(cum[i][key])}`;
    return p;
  };

  const EIG_FREE = '#0046ad',
    HUUR_FREE = '#5b93d6',
    MERGED_FREE = '#0046ad';
  const EIG_RES = '#e5b700',
    HUUR_RES = '#f2d472';

  // y-axis money grid
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const v = f * yMax;
    return { v, yc: y(v), lbl: v === 0 ? '€0' : simEurK(v) };
  });

  const meta = result.meta;
  const boundaries: Boundary[] = [
    { ts: Date.UTC(2026, 9, 1), lbl: '1 okt ’26', cls: 'period-div' },
    { ts: Date.UTC(2027, 0, 1), lbl: '2027', cls: 'yr-div' },
    { ts: Date.UTC(2027, 9, 1), lbl: '1 okt ’27', cls: 'period-div' },
  ]
    .map((b) => ({ ...b, i: Math.round((b.ts - meta.START) / 86400000) }))
    .filter((b) => b.i > 0 && b.i < N);

  const ticks: Tick[] = [];
  for (let yr = 2026; yr <= 2027; yr++)
    for (let m = 0; m < 12; m += 3) {
      const i = Math.round((Date.UTC(yr, m, 1) - meta.START) / 86400000);
      if (i >= 0 && i < N)
        ticks.push({ i, lbl: `${['jan', 'apr', 'jul', 'okt'][m / 3]} '${String(yr).slice(2)}` });
    }

  const exhausts: Exhaust[] = Object.values(result.exhaustion).map((e) => ({
    i: e.day,
    label: e.label,
  }));
  const cur = Math.min(day, N - 1);
  const anyHold = cum.some((c) => c.b6 - c.b5 > 1);

  return (
    <div>
      <svg
        className="sim-chart"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={{ height: 220 }}
      >
        {/* horizontal money grid + y-axis labels */}
        {yTicks.map((t, k) => (
          <line
            key={'g' + k}
            x1={padL}
            y1={t.yc}
            x2={W - padR}
            y2={t.yc}
            stroke="var(--v2-rule-2, #e5e9f0)"
            strokeWidth={t.v === 0 ? 1.4 : 0.8}
          />
        ))}
        {yTicks.map((t, k) => (
          <text
            key={'gl' + k}
            className="axis-lbl"
            x={padL - 6}
            y={t.yc + 3}
            textAnchor="end"
            style={t.v === 0 ? { fontWeight: 700 } : undefined}
          >
            {t.lbl}
          </text>
        ))}
        {boundaries.map((b, k) => (
          <line key={'b' + k} className={b.cls} x1={x(b.i)} y1={padT} x2={x(b.i)} y2={y(0)} />
        ))}
        {/* stacked free (blue) then reserved (yellow), each split eigenaren / huurders */}
        <path d={band('b0', 'b1')} fill={EIG_FREE} fillOpacity="0.32" />
        <path d={band('b1', 'b2')} fill={HUUR_FREE} fillOpacity="0.45" />
        <path d={band('b2', 'b3')} fill={MERGED_FREE} fillOpacity="0.16" />
        <path d={band('b3', 'b4')} fill={EIG_RES} fillOpacity="0.60" />
        <path d={band('b4', 'b5')} fill={HUUR_RES} fillOpacity="0.75" />
        {anyHold && (
          <path d={band('b5', 'b6')} fill="var(--sim-hold, #7c3aed)" fillOpacity="0.30" />
        )}
        {/* separators: eig|huur within free, eig|huur within reserved, and the free/reserved edge */}
        <path d={line('b1')} fill="none" stroke={HUUR_FREE} strokeWidth="0.7" strokeOpacity="0.7" />
        <path d={line('b4')} fill="none" stroke={EIG_RES} strokeWidth="0.7" strokeOpacity="0.8" />
        <path d={line('b3')} fill="none" stroke="var(--color-primary, #0046ad)" strokeWidth="1.6" />
        {exhausts.map((e, k) => (
          <line
            key={'x' + k}
            className="exhaust-mark"
            x1={x(e.i)}
            y1={padT}
            x2={x(e.i)}
            y2={y(0)}
          />
        ))}
        <line className="today" x1={x(cur)} y1={padT} x2={x(cur)} y2={y(0)} />
        <circle cx={x(cur)} cy={y(cum[cur].b3)} r="3.2" fill="var(--color-secondary, #e70077)" />
        {ticks.map((t, k) => (
          <text key={'t' + k} className="axis-lbl" x={x(t.i)} y={H - 6} textAnchor="middle">
            {t.lbl}
          </text>
        ))}
      </svg>
      <div className="sim-chartlegend">
        <span>
          <i style={{ background: EIG_FREE, opacity: 0.6 }}></i>Vrij — eigenaren
        </span>
        <span>
          <i style={{ background: HUUR_FREE, opacity: 0.75 }}></i>Vrij — huurders
        </span>
        <span>
          <i style={{ background: MERGED_FREE, opacity: 0.32 }}></i>Vrij — gebundeld (na 1 okt)
        </span>
        <span>
          <i
            style={{ background: EIG_RES, opacity: 0.7, height: 10, width: 14, borderRadius: 2 }}
          ></i>
          Gereserveerd — eigenaren
        </span>
        <span>
          <i
            style={{ background: HUUR_RES, opacity: 0.85, height: 10, width: 14, borderRadius: 2 }}
          ></i>
          Gereserveerd — huurders
        </span>
        <span>
          <i style={{ background: 'var(--color-secondary, #e70077)', height: 12, width: 2 }}></i>
          Vandaag
        </span>
        <span>
          <i style={{ background: 'var(--v2-overdue, #b0103c)', height: 12, width: 2 }}></i>
          Uitputting
        </span>
      </div>
    </div>
  );
}
