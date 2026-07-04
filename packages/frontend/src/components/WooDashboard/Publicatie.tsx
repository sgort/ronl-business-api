import { WOO_PUBLICATIE, WOO_CATEGORIEEN } from '../../pages/woo/woo.data';

export default function Publicatie() {
  const pu = WOO_PUBLICATIE;
  const segs = Array.from({ length: pu.totaalCategorieen });
  return (
    <div className="w-view">
      <div className="w-head">
        <div>
          <p className="w-eyebrow">Publicatie · Actieve openbaarmaking</p>
          <h1 className="w-h1">Uit eigen beweging openbaar</h1>
          <p className="w-lead">
            De Woo vraagt ook om proactieve publicatie in 17 verplichte informatiecategorieën,
            gefaseerd ingevoerd. Actieve openbaarmaking verlaagt de instroom van verzoeken — elke
            gepubliceerde categorie is een vraag die niet meer gesteld hoeft te worden.
          </p>
        </div>
        <div className="w-peil">
          Categorieën actief
          <br />
          <b>
            {pu.geimplementeerd} / {pu.totaalCategorieen}
          </b>
          <br />
          {Math.round((pu.geimplementeerd / pu.totaalCategorieen) * 100)}% ingevoerd
        </div>
      </div>

      <div className="w-metrics" style={{ marginTop: 22 }}>
        <div className="w-metric">
          <dt>Verplichte categorieën</dt>
          <dd>
            {pu.geimplementeerd}
            <small> / {pu.totaalCategorieen}</small>
          </dd>
        </div>
        <div className="w-metric">
          <dt>Documenten gepubliceerd</dt>
          <dd>{pu.gepubliceerd.toLocaleString('nl-NL')}</dd>
        </div>
        <div className="w-metric">
          <dt>Tijdig gepubliceerd</dt>
          <dd>
            {pu.tijdigPct}
            <small>%</small>
          </dd>
        </div>
        <div className="w-metric">
          <dt>Weergaven YTD</dt>
          <dd>
            {(pu.weergaven / 1000).toFixed(1)}
            <small>k</small>
          </dd>
        </div>
      </div>
      <div className="w-catprogress">
        {segs.map((_, i) => (
          <span key={i} className={`w-catseg ${i < pu.geimplementeerd ? 'on' : ''}`} />
        ))}
      </div>

      <div className="w-sec">
        <div className="w-sec-head">
          <h2>Publicaties per categorie</h2>
          <span className="meta">actief &amp; nog te implementeren</span>
        </div>
        <div className="w-catgrid">
          {WOO_CATEGORIEEN.map((c, i) => (
            <div className={`w-catrow ${c.actief ? '' : 'off'}`} key={i}>
              <span className={`w-chk ${c.actief ? '' : 'off'}`}>{c.actief ? '✓' : ''}</span>
              <span className="nm">{c.naam}</span>
              <span className="cnt">{c.actief ? c.n : 'nog niet'}</span>
            </div>
          ))}
        </div>
        <p className="w-lead" style={{ marginTop: 14, fontSize: 13 }}>
          Nog te implementeren: <b style={{ color: 'var(--v2-ink)' }}>Onderzoeksrapporten</b>,{' '}
          <b style={{ color: 'var(--v2-ink)' }}>Beschikkingen</b> en{' '}
          <b style={{ color: 'var(--v2-ink)' }}>Klachtoordelen</b>. Deze drie raken relatief veel
          herhaalverzoeken.
        </p>
      </div>
    </div>
  );
}
