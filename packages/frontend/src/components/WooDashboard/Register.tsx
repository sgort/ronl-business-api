import { WOO_FILTERS, type WooFilters, type WooRegisterRow } from '../../pages/woo/woo.data';

function statusClass(s: string): string {
  if (s === 'Gesloten') return 'klaar';
  if (s === 'Over termijn') return 'laat';
  return 'open';
}

interface Props {
  rows: WooRegisterRow[];
  filters: WooFilters;
  onReset: () => void;
}

export default function Register({ rows, filters, onReset }: Props) {
  const defaults = new Set(WOO_FILTERS.map((f) => f.opts[0]));
  const chips = Object.values(filters).filter((v) => v && !defaults.has(v) && v !== '2026');

  return (
    <div className="w-view">
      <div className="w-head">
        <div>
          <p className="w-eyebrow">Register · Verzoeken</p>
          <h1 className="w-h1">Verzoekenregister</h1>
          <p className="w-lead">
            Het onderliggende datamodel — één regel per Woo-verzoek. Filterbaar op jaar, kwartaal,
            afdeling, onderwerp, bron en status via de linkerkolom.
          </p>
          {chips.length > 0 && (
            <div className="w-chips">
              {chips.map((c, i) => (
                <span className="w-chip" key={i}>
                  {c}
                </span>
              ))}
              <button type="button" className="w-chip-clear" onClick={onReset}>
                Wis filters
              </button>
            </div>
          )}
        </div>
        <div className="w-peil">
          Getoond
          <br />
          <b>{rows.length} van 218</b>
          <br />
          {chips.length ? 'gefilterd' : 'alle regels'}
        </div>
      </div>

      <div className="w-tablewrap" style={{ marginTop: 20 }}>
        <table className="w-table">
          <thead>
            <tr>
              <th>Verzoek-ID</th>
              <th>Ontvangen</th>
              <th>Termijn</th>
              <th>Afdeling</th>
              <th>Onderwerp</th>
              <th>Bron</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Dagen</th>
              <th>Besluit</th>
              <th>Bezw.</th>
              <th>Verd.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="id">{r.id}</td>
                <td className="mono">{r.ontvangen}</td>
                <td className="mono">{r.termijn}</td>
                <td>{r.afdeling}</td>
                <td>{r.onderwerp}</td>
                <td>{r.bron}</td>
                <td>
                  <span className={`w-statuspill ${statusClass(r.status)}`}>{r.status}</span>
                </td>
                <td
                  className="num"
                  style={r.dagen > 42 ? { color: 'var(--w-red)', fontWeight: 700 } : undefined}
                >
                  {r.dagen}
                </td>
                <td>{r.besluit}</td>
                <td>
                  <span className={`w-flagdot ${r.bezwaar ? 'on' : ''}`}>
                    {r.bezwaar ? 'ja' : '—'}
                  </span>
                </td>
                <td>
                  <span className={`w-flagdot ${r.verdaagd ? 'on' : ''}`}>
                    {r.verdaagd ? 'ja' : '—'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="w-empty">
            Geen verzoeken voldoen aan de huidige filters.{' '}
            <button type="button" onClick={onReset}>
              Wis filters
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
