import { simEurK } from './simFormat';

export default function SimOutcomeRow({
  dot,
  name,
  val,
  amount,
  total,
}: {
  dot: string;
  name: string;
  val: number;
  amount?: number;
  total: number;
}) {
  const pct = total > 0 ? (val / total) * 100 : 0;
  return (
    <div className="sim-orow">
      <span className="o-name">
        <i className={'o-dot ' + dot}></i>
        {name}
      </span>
      <span className="o-track">
        <span className={'o-fill ' + dot} style={{ width: pct + '%' }}></span>
      </span>
      <span className="o-val" style={amount != null ? { lineHeight: 1.15 } : undefined}>
        {val.toLocaleString('nl-NL')}
        {amount != null && (
          <div style={{ fontSize: 9.5, fontWeight: 500, color: 'var(--v2-ink-3)' }}>
            {simEurK(amount)}
          </div>
        )}
      </span>
    </div>
  );
}
