// hatched amber for provisional (reserved) money — distinct from solid = paid
const RESERVED_FILL =
  'repeating-linear-gradient(135deg, var(--rba-warn-fill) 0 6px, color-mix(in srgb, var(--rba-warn-fill) 67%, white) 6px 12px)';

import { simEur, simEurK } from './simFormat';

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
            style={{
              width: pReserved + '%',
              background: RESERVED_FILL,
              color: 'var(--rba-on-warn-fill)',
            }}
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
