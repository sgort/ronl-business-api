import { WBars, WDonut } from './charts';
import { WOO_AFDELING, WOO_ONDERWERP, WOO_BRON, WOO_HERHAAL } from '../../pages/woo/woo.data';

export default function Verzoeken() {
  const afdMax = WOO_AFDELING[0].n;
  return (
    <div className="w-view">
      <div className="w-head">
        <div>
          <p className="w-eyebrow">Verzoeken · Vraag &amp; herkomst</p>
          <h1 className="w-h1">Werklast &amp; instroom</h1>
          <p className="w-lead">
            Wie dient in, waarover en bij welke afdeling landt het werk. Instroom groeit met 12% ten
            opzichte van vorig jaar; journalistieke verzoeken vormen het grootste aandeel.
          </p>
        </div>
        <div className="w-peil">
          Instroom YTD
          <br />
          <b>218 verzoeken</b>
          <br />
          +12% j-o-j
        </div>
      </div>

      <div className="w-grid-2" style={{ marginTop: 22 }}>
        <div className="w-panel">
          <header>
            <h3>Per afdeling</h3>
            <span className="meta">n · % op tijd</span>
          </header>
          <div className="w-panel-body">
            <div className="w-bars">
              {WOO_AFDELING.map((a, i) => (
                <div className="w-bar-row" key={i}>
                  <span className="w-bar-lab">{a.naam}</span>
                  <span className="w-bar-track">
                    <span className="w-bar-fill" style={{ width: `${(a.n / afdMax) * 100}%` }} />
                  </span>
                  <span className="w-bar-val">
                    {a.n}
                    <span className="sub"> · {a.optijd}%</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="w-panel">
          <header>
            <h3>Per onderwerp</h3>
            <span className="meta">top-8</span>
          </header>
          <div className="w-panel-body">
            <WBars rows={WOO_ONDERWERP} tone="teal" />
          </div>
        </div>
      </div>

      <div className="w-grid-2" style={{ marginTop: 22 }}>
        <div className="w-panel">
          <header>
            <h3>Naar bron van het verzoek</h3>
            <span className="meta">aandeel instroom</span>
          </header>
          <div className="w-panel-body">
            <div className="w-donut-wrap">
              <WDonut segments={WOO_BRON} />
              <div className="w-donut-legend">
                {WOO_BRON.map((b, i) => (
                  <div className="row" key={i}>
                    <span className="sw" style={{ background: b.color }} />
                    <span>{b.naam}</span>
                    <b>{b.pct}%</b>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="w-panel">
          <header>
            <h3>Herhaalverzoekers</h3>
            <span className="meta">druk op capaciteit</span>
          </header>
          <div className="w-panel-body">
            <dl className="w-metrics" style={{ border: 'none' }}>
              <div className="w-metric" style={{ borderLeft: '1px solid var(--v2-rule-2)' }}>
                <dt>Herhaalverzoekers</dt>
                <dd>{WOO_HERHAAL.herhaalverzoekers}</dd>
              </div>
              <div className="w-metric">
                <dt>Aandeel herhaal</dt>
                <dd>
                  {WOO_HERHAAL.aandeelHerhaal}
                  <small>%</small>
                </dd>
              </div>
              <div className="w-metric">
                <dt>Meeste verzoeken</dt>
                <dd>{WOO_HERHAAL.topAantal}</dd>
              </div>
            </dl>
            <p className="w-lead" style={{ marginTop: 14, fontSize: 13 }}>
              Grootste herhaalverzoeker:{' '}
              <b style={{ color: 'var(--v2-ink)' }}>{WOO_HERHAAL.topNaam}</b>. Een deel van deze
              vragen is te ondervangen met actieve openbaarmaking — zie{' '}
              <b style={{ color: 'var(--v2-ink)' }}>Publicatie</b>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
