import { WDonut } from './charts';
import { WOO_BEZWAAR, WOO_BESLUIT } from '../../pages/woo/woo.data';

export default function Bezwaar() {
  const b = WOO_BEZWAAR;
  const totBes = WOO_BESLUIT.reduce((s, x) => s + x.n, 0);
  const funnel = [
    { naam: 'Bezwaren ontvangen', n: b.ontvangen },
    { naam: 'Gegrond verklaard', n: b.gegrond },
    { naam: 'Beroepen', n: b.beroepen },
    { naam: 'Rechterlijke uitspraken', n: b.uitspraken },
    { naam: 'Dwangsommen opgelegd', n: b.dwangsommen },
  ];
  const mxF = funnel[0].n;
  return (
    <div className="w-view">
      <div className="w-head">
        <div>
          <p className="w-eyebrow">Kwaliteit · Bezwaar &amp; beroep</p>
          <h1 className="w-h1">Juridische uitkomsten</h1>
          <p className="w-lead">
            Hoe houden besluiten stand? Van de 22 bezwaren is een klein deel gegrond; drie zaken
            staan bij de rechter en er is één dwangsom opgelegd wegens termijnoverschrijding. Elke
            gegronde uitkomst is input voor betere besluitvorming.
          </p>
        </div>
        <div className="w-peil">
          Dwangsommen
          <br />
          <b>1</b>
          <br />
          opgelegd · YTD
        </div>
      </div>

      <div className="w-grid-2" style={{ marginTop: 22 }}>
        <div className="w-panel">
          <header>
            <h3>Besluittypen</h3>
            <span className="meta">{totBes} besluiten · YTD</span>
          </header>
          <div className="w-panel-body">
            <div className="w-donut-wrap">
              <WDonut segments={WOO_BESLUIT} />
              <div className="w-donut-legend">
                {WOO_BESLUIT.map((s, i) => (
                  <div className="row" key={i}>
                    <span className="sw" style={{ background: s.color }} />
                    <span>{s.naam}</span>
                    <b>{s.n}</b>
                  </div>
                ))}
              </div>
            </div>
            <p className="w-lead" style={{ marginTop: 14, fontSize: 12.5 }}>
              Gemiddeld{' '}
              <b style={{ color: 'var(--v2-ink)' }}>
                {b.gemUitzonderingen.toString().replace('.', ',')}
              </b>{' '}
              uitzonderingsgronden per gedeeltelijk besluit.
            </p>
          </div>
        </div>
        <div className="w-panel">
          <header>
            <h3>Van bezwaar tot dwangsom</h3>
            <span className="meta">trechter · YTD</span>
          </header>
          <div className="w-panel-body">
            <div className="w-funnel">
              {funnel.map((f, i) => (
                <div className="w-fstep" key={i}>
                  <span className="kn">{String(i + 1).padStart(2, '0')}</span>
                  <div
                    className="fbar"
                    style={
                      i === funnel.length - 1 ? { borderLeftColor: 'var(--w-red)' } : undefined
                    }
                  >
                    <span
                      className="fill"
                      style={{
                        width: `${(f.n / mxF) * 100}%`,
                        background:
                          i === funnel.length - 1
                            ? 'color-mix(in srgb, var(--w-red) 12%, white)'
                            : undefined,
                      }}
                    />
                    <span className="nm">{f.naam}</span>
                    <span className="rt">
                      <span className="days">
                        <b>{f.n}</b>
                      </span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="w-metrics" style={{ marginTop: 22 }}>
        <div className="w-metric">
          <dt>Bezwaren ontvangen</dt>
          <dd>{b.ontvangen}</dd>
        </div>
        <div className="w-metric">
          <dt>Gegrond</dt>
          <dd>{b.gegrond}</dd>
        </div>
        <div className="w-metric">
          <dt>Ongegrond</dt>
          <dd>{b.ongegrond}</dd>
        </div>
        <div className="w-metric">
          <dt>Lopend</dt>
          <dd>{b.lopend}</dd>
        </div>
        <div className="w-metric warn">
          <dt>Beroepen</dt>
          <dd>{b.beroepen}</dd>
        </div>
      </div>
    </div>
  );
}
