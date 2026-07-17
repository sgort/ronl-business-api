import { WColumns, WTrend } from './charts';
import {
  WOO_KPIS,
  WOO_MAAND,
  WOO_AGEING,
  WOO_TENANT,
  WOO_PEILDATUM,
  WOO_JAAR,
} from '../../pages/woo/woo.data';

const openTrend = [
  { label: 'Jan', y: 29 },
  { label: 'Feb', y: 30 },
  { label: 'Mrt', y: 36 },
  { label: 'Apr', y: 38 },
  { label: 'Mei', y: 41 },
  { label: 'Jun', y: 34 },
].map((p, i) => ({ ...p, x: i }));

const mxAge = Math.max(...WOO_AGEING.map((a) => a.n));

export default function Overzicht() {
  return (
    <div className="w-view">
      <div className="w-head">
        <div>
          <p className="w-eyebrow">Overzicht · {WOO_TENANT.displayName}</p>
          <h1 className="w-h1">Woo in één oogopslag</h1>
          <p className="w-lead">
            Zijn we compliant, hoe efficiënt verwerken we, worden we transparanter en waar zitten de
            knelpunten? Stoplichten tonen de stand ten opzichte van de wettelijke norm en interne
            doelen.
          </p>
        </div>
        <div className="w-peil">
          Peildatum
          <br />
          <b>{WOO_PEILDATUM}</b>
          <br />
          Boekjaar {WOO_JAAR}
        </div>
      </div>

      <div className="w-sec">
        <div className="w-kpis">
          {WOO_KPIS.map((k) => (
            <div className="w-kpi" key={k.id}>
              <div className="w-kpi-top">
                <span className={`w-led ${k.status}`} />
                <span className="w-kpi-label">{k.label}</span>
              </div>
              <div className="w-kpi-val">{k.value}</div>
              <div className="w-kpi-hint">{k.hint}</div>
              <div className="w-kpi-foot">
                <span className="w-kpi-target">
                  Doel <b>{k.target}</b>
                </span>
                {k.delta ? <span className="w-kpi-delta">{k.delta}</span> : null}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="w-grid-2" style={{ marginTop: 26 }}>
        <div className="w-panel">
          <header>
            <h3>Instroom &amp; afhandeling</h3>
            <span className="meta">per maand · 2026</span>
          </header>
          <div className="w-panel-body">
            <WColumns data={WOO_MAAND} />
          </div>
        </div>
        <div className="w-panel">
          <header>
            <h3>Open werkvoorraad</h3>
            <span className="meta">einde maand</span>
          </header>
          <div className="w-panel-body">
            <WTrend points={openTrend} label="Open verzoeken per maand" />
          </div>
        </div>
      </div>

      <div className="w-sec">
        <div className="w-sec-head">
          <h2>Huidige werkvoorraad</h2>
          <span className="meta">34 open · verouderingsprofiel</span>
        </div>
        <div className="w-buckets">
          {WOO_AGEING.map((a, i) => (
            <div className="w-bucket" key={i}>
              <span className="lab">
                <span className={`w-led ${a.kleur}`} />
                {a.b}
              </span>
              <span className="track">
                <span className={`fill ${a.kleur}`} style={{ width: `${(a.n / mxAge) * 100}%` }} />
              </span>
              <span className="n">{a.n}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="w-bench">
        <span className="mk">Woo in cijfers</span>
        <span>
          Deze KPI&apos;s sluiten aan op het landelijke dashboard{' '}
          <b>&ldquo;Woo in cijfers&rdquo;</b>: ontvangen en afgehandelde verzoeken (met en zonder
          formeel besluit), percentage op tijd, gemiddelde doorlooptijd, bezwaren en beroepen en
          opgelegde <b>dwangsommen</b>. Zo is de eigen prestatie vergelijkbaar met de bredere
          publieke rapportage.
        </span>
      </div>
    </div>
  );
}
