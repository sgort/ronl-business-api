import { WOO_STAPPEN, WOO_PROCES } from '../../pages/woo/woo.data';

const mxDays = Math.max(...WOO_STAPPEN.map((s) => s.dagen));

export default function Proces() {
  const p = WOO_PROCES;
  return (
    <div className="w-view">
      <div className="w-head">
        <div>
          <p className="w-eyebrow">Proces · Workflow</p>
          <h1 className="w-h1">Processtappen &amp; knelpunten</h1>
          <p className="w-lead">
            Elk verzoek doorloopt negen stappen, van ontvangst tot sluiting. De breedte van de balk
            toont de gemiddelde verblijftijd; de trechter rechts laat zien hoeveel verzoeken nu in
            elke stap staan.
          </p>
        </div>
        <div className="w-peil">
          Bottleneck
          <br />
          <b>{p.bottleneck}</b>
          <br />
          11,8 dgn gemiddeld
        </div>
      </div>

      <div className="w-metrics" style={{ marginTop: 22 }}>
        <div className="w-metric">
          <dt>Bottleneck-stap</dt>
          <dd style={{ fontSize: 18, color: 'var(--w-red)' }}>{p.bottleneck}</dd>
        </div>
        <div className="w-metric">
          <dt>Gem. overdrachten</dt>
          <dd>{p.overdrachten}</dd>
        </div>
        <div className="w-metric warn">
          <dt>Rework</dt>
          <dd>
            {p.reworkPct}
            <small>%</small>
          </dd>
        </div>
        <div className="w-metric">
          <dt>Actieve verzoeken</dt>
          <dd>34</dd>
        </div>
      </div>

      <div className="w-sec">
        <div className="w-sec-head">
          <h2>Gemiddelde verblijftijd per stap</h2>
          <span className="meta">dagen · # nu in stap</span>
        </div>
        <div className="w-funnel">
          {WOO_STAPPEN.map((s) => (
            <div className={`w-fstep ${s.bottleneck ? 'bottleneck' : ''}`} key={s.k}>
              <span className="kn">{s.k}</span>
              <div className="fbar">
                <span className="fill" style={{ width: `${(s.dagen / mxDays) * 100}%` }} />
                <span className="nm">
                  {s.naam}
                  {s.bottleneck ? <span className="w-bottleflag">knelpunt</span> : null}
                </span>
                <span className="rt">
                  <span className="days">
                    <b>{s.dagen.toString().replace('.', ',')}</b> dgn
                  </span>
                  <span className="act">{s.actief} in stap</span>
                </span>
              </div>
            </div>
          ))}
        </div>
        <p className="w-lead" style={{ marginTop: 16, fontSize: 13 }}>
          Ruim de helft van de doorlooptijd zit in{' '}
          <b style={{ color: 'var(--v2-ink)' }}>Informatie zoeken</b> — vaak omdat documenten bij
          meerdere afdelingen opgevraagd moeten worden. Een rework-percentage van {p.reworkPct}%
          wijst op verzoeken die terug moeten na de juridische toets.
        </p>
      </div>
    </div>
  );
}
