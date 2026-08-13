// hatched amber for provisional (reserved) money — distinct from solid = paid
const RESERVED_FILL = 'repeating-linear-gradient(135deg, var(--v2-amber) 0 6px, #f0d34d 6px 12px)';

function simEur(n: number): string {
  return '€' + Math.round(n).toLocaleString('nl-NL');
}
function simEurK(n: number): string {
  const a = Math.abs(n);
  if (a >= 1000000) {
    return '€' + (n / 1000000).toFixed(1).replace('.0', '').replace('.', ',') + 'M';
  }
  if (a >= 1000) {
    const v = n / 1000;
    return (
      '€' + (Number.isInteger(v) ? v : Number(v.toFixed(1))).toString().replace('.', ',') + 'k'
    );
  }
  return '€' + Math.round(n);
}

export default function SimPot({
  name,
  tag,
  total,
  used,
  reserved = 0,
  hold = 0,
}: {
  name: string;
  tag?: string;
  total: number;
  used: number;
  reserved?: number;
  hold?: number;
}) {
  const within = Math.min(used, total);
  const over = Math.max(used - total, 0);
  const free = Math.max(total - used - reserved - hold, 0);
  const denom = Math.max(total, used + reserved + hold) || 1;
  const pWithin = (within / denom) * 100;
  const pOver = (over / denom) * 100;
  const pReserved = (reserved / denom) * 100;
  const pHold = (hold / denom) * 100;
  const pFree = Math.max((free / denom) * 100, 0);
  const pCeil = (total / denom) * 100;
  const exhausted = free <= 0;
  return (
    <div className="sim-pot">
      <div className="sim-pot-head">
        <span className="sim-pot-name">
          {name}
          {tag && <span className="tag">{tag}</span>}
        </span>
        <span className="sim-pot-fig">
          <b>{simEur(used)}</b> van {simEur(total)}
          {over > 0 && (
            <>
              {' '}
              · <span className="c-over">{simEur(over)} over budget</span>
            </>
          )}
          {reserved > 0 && (
            <>
              {' '}
              · <span style={{ color: 'var(--v2-amber)' }}>{simEur(reserved)} gereserveerd</span>
            </>
          )}
          {hold > 0 && (
            <>
              {' '}
              · <span className="c-hold">{simEur(hold)} bezwaar</span>
            </>
          )}
        </span>
      </div>
      <div className={'sim-bar' + (exhausted ? ' exhausted' : '')} style={{ position: 'relative' }}>
        <div className="sim-seg used" style={{ width: pWithin + '%' }}>
          {pWithin > 12 ? simEurK(within) : ''}
        </div>
        {over > 0 && (
          <div className="sim-seg over" style={{ width: pOver + '%' }}>
            {pOver > 8 ? '+' + simEurK(over) : ''}
          </div>
        )}
        {reserved > 0 && (
          <div
            className="sim-seg"
            style={{ width: pReserved + '%', background: RESERVED_FILL, color: '#5a4a00' }}
          >
            {pReserved > 12 ? simEurK(reserved) : ''}
          </div>
        )}
        {hold > 0 && (
          <div className="sim-seg hold" style={{ width: pHold + '%' }}>
            {pHold > 10 ? simEurK(hold) : ''}
          </div>
        )}
        <div className="sim-seg free" style={{ width: pFree + '%' }}>
          {pFree > 14 ? simEur(free) + ' vrij' : ''}
        </div>
        {over > 0 && <span className="sim-ceilmark" style={{ left: pCeil + '%' }}></span>}
      </div>
    </div>
  );
}

export { simEur, simEurK };
