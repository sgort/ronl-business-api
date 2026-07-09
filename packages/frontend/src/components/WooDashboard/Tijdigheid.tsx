import { WGauge } from './charts';
import { WOO_TIJDIGHEID, WOO_DISTRIBUTIE } from '../../pages/woo/woo.data';

const mxDist = Math.max(...WOO_DISTRIBUTIE.map((d) => d.n));

function distColor(i: number): string {
  if (i >= 3) return 'var(--w-red)';
  if (i >= 2) return 'var(--w-amber)';
  return 'var(--w-blue)';
}

export default function Tijdigheid() {
  const t = WOO_TIJDIGHEID;
  return (
    <div className="w-view">
      <div className="w-head">
        <div>
          <p className="w-eyebrow">Tijdigheid · Wettelijke termijn</p>
          <h1 className="w-h1">Doorlooptijd &amp; compliance</h1>
          <p className="w-lead">
            De wettelijke beslistermijn is vier weken, eenmalig te verdagen met twee weken. We halen
            87% — onder het interne doel van 90% — en de gemiddelde doorlooptijd loopt op tot 31
            dagen.
          </p>
        </div>
        <div className="w-peil">
          Norm
          <br />
          <b>28 dagen</b>
          <br />+ verdaging 14 dgn
        </div>
      </div>

      <div className="w-grid-2" style={{ marginTop: 22 }}>
        <div className="w-panel">
          <header>
            <h3>SLA — binnen wettelijke termijn</h3>
            <span className="meta">YTD</span>
          </header>
          <div className="w-panel-body">
            <div className="w-gauge-wrap">
              <WGauge value={t.slaPct} target={90} />
              <p className="w-gauge-note">
                Van de afgehandelde verzoeken is <b>{t.slaPct}%</b> binnen de wettelijke termijn
                afgedaan. Het interne doel (<b>90%</b>) wordt net niet gehaald; de zwarte streep
                markeert het doel op de meter.
              </p>
            </div>
          </div>
        </div>
        <div className="w-panel">
          <header>
            <h3>Kerncijfers doorlooptijd</h3>
          </header>
          <div className="w-panel-body" style={{ padding: 0 }}>
            <dl className="w-metrics" style={{ border: 'none' }}>
              <div className="w-metric warn" style={{ borderLeft: '1px solid var(--v2-rule-2)' }}>
                <dt>Gemiddeld</dt>
                <dd>
                  {t.gem}
                  <small> dgn</small>
                </dd>
              </div>
              <div className="w-metric">
                <dt>Mediaan</dt>
                <dd>
                  {t.mediaan}
                  <small> dgn</small>
                </dd>
              </div>
              <div className="w-metric warn">
                <dt>Te laat</dt>
                <dd>{t.teLaat}</dd>
              </div>
              <div className="w-metric warn">
                <dt>Gem. dgn te laat</dt>
                <dd>{t.gemDagenTeLaat}</dd>
              </div>
            </dl>
            <dl className="w-metrics" style={{ borderTop: 'none' }}>
              <div className="w-metric">
                <dt>Wacht op jur. toets</dt>
                <dd>{t.jur}</dd>
              </div>
              <div className="w-metric">
                <dt>Wacht op proceseigenaar</dt>
                <dd>{t.bo}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      <div className="w-sec">
        <div className="w-sec-head">
          <h2>Verdeling doorlooptijd</h2>
          <span className="meta">afgehandelde verzoeken · dagen</span>
        </div>
        <div className="w-buckets">
          {WOO_DISTRIBUTIE.map((d, i) => (
            <div className="w-bucket" key={i}>
              <span className="lab">{d.b} dgn</span>
              <span className="track">
                <span
                  className="fill bar"
                  style={{ width: `${(d.n / mxDist) * 100}%`, background: distColor(i) }}
                />
              </span>
              <span className="n">{d.n}</span>
            </div>
          ))}
        </div>
        <p className="w-lead" style={{ marginTop: 14, fontSize: 13 }}>
          De piek ligt in de bucket <b style={{ color: 'var(--v2-ink)' }}>15–28 dagen</b> (binnen
          termijn), maar een lange staart boven 42 dagen trekt het gemiddelde omhoog. Aanpak van de
          staart is de snelste route naar het 90%-doel.
        </p>
      </div>
    </div>
  );
}
