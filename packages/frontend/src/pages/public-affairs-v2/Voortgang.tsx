/**
 * Voortgang — Scherm 6, progress + bestuurlijke uitlegbaarheid.
 *
 * Three views (selected from the rail):
 *   voortgang        — milestones per active dossier
 *   kompas-log       — score changes with duiding (uitlegbaar)
 *   interventie-log  — chosen action + who decided (AI adviseerde / mens besloot)
 */

import { kompasTotal } from './pa.data';
import { usePaData } from './PaDataProvider';

export type VoortgangView = 'voortgang' | 'kompas-log' | 'interventie-log';

interface Props {
  view?: VoortgangView;
  onOpenDossier: (id: string) => void;
}

export default function Voortgang({ view = 'voortgang', onOpenDossier }: Props) {
  if (view === 'kompas-log') return <KompasLogView />;
  if (view === 'interventie-log') return <IntervLogView onOpenDossier={onOpenDossier} />;
  return <LobbydoelenView onOpenDossier={onOpenDossier} />;
}

function LobbydoelenView({ onOpenDossier }: { onOpenDossier: (id: string) => void }) {
  const dossiers = usePaData().dossiers.data.filter((d) => d.status === 'actief');
  return (
    <div>
      <div className="pac-crumb">Voortgang · lobbydoelen</div>
      <div className="pac-page-head" style={{ marginBottom: 18 }}>
        <div>
          <h1 className="pac-page-title">Voortgang op lobbydoelen</h1>
          <p className="pac-page-sub">
            Mijlpalen en contactmomenten per hoofddossier. Bestuurlijk uitlegbaar via het
            Kompas-log.
          </p>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {dossiers.map((d) => (
          <div key={d.id} style={{ border: '1px solid var(--pac-rule-2)' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 14,
                padding: '14px 18px',
                borderBottom: '1px solid var(--pac-rule-2)',
                background: 'var(--pac-bg)',
              }}
            >
              <div>
                <div
                  style={{
                    fontFamily: 'var(--pac-serif)',
                    fontWeight: 700,
                    fontSize: 16,
                    color: 'var(--pac-ink)',
                  }}
                >
                  {d.naam}
                </div>
                <div
                  style={{
                    fontSize: 12.5,
                    color: 'var(--pac-ink-2)',
                    marginTop: 3,
                    maxWidth: '70ch',
                  }}
                >
                  {d.doel}
                </div>
              </div>
              <button
                type="button"
                className="pac-btn pac-btn-sm pac-btn-ghost"
                onClick={() => onOpenDossier(d.id)}
              >
                Open dossier
              </button>
            </div>
            <div style={{ padding: '16px 18px' }}>
              <div className="pac-prog-bar" style={{ marginBottom: 14 }}>
                <div className="pac-prog-fill" style={{ width: d.progressPct + '%' }} />
              </div>
              <div className="pac-timeline">
                {d.mijlpalen.map((m, i) => (
                  <div
                    className={`pac-tl-item ${m.done ? '' : 'future'}`}
                    key={i}
                    style={m.done ? {} : { opacity: 1 }}
                  >
                    <div className="pac-tl-date">
                      {m.date}
                      {m.soon ? ' · binnenkort' : ''}
                    </div>
                    <div className="pac-tl-title">{m.label}</div>
                    <div className="pac-tl-desc">{m.done ? 'Afgerond' : 'Open mijlpaal'}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function KompasLogView() {
  const dossiers = usePaData().dossiers.data.filter((d) => d.kompasLog.length > 0);
  return (
    <div>
      <div className="pac-crumb">Voortgang · Kompas-log</div>
      <div className="pac-page-head" style={{ marginBottom: 18 }}>
        <div>
          <h1 className="pac-page-title">Kompas-log</h1>
          <p className="pac-page-sub">
            Scores en duidingen per periode — zo blijft elke afweging bestuurlijk uitlegbaar en
            herleidbaar.
          </p>
        </div>
      </div>
      {dossiers.map((d) => (
        <section className="pac-section" key={d.id} style={{ marginTop: 0, marginBottom: 26 }}>
          <div className="pac-section-head">
            <h2 className="pac-section-title" style={{ fontSize: 16 }}>
              {d.naam}
            </h2>
            <span className="pac-total">
              nu Kompas <b>{kompasTotal(d.kompas)}</b>/12
            </span>
          </div>
          <div className="pac-log">
            {d.kompasLog.map((l, i) => (
              <div className="pac-log-row" key={i}>
                <div className="pac-log-date">{l.date}</div>
                <div className="pac-log-body">
                  <div className="what">{l.text}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function IntervLogView({ onOpenDossier }: { onOpenDossier: (id: string) => void }) {
  const dossiers = usePaData().dossiers.data.filter((d) => d.intervLog.length > 0);
  return (
    <div>
      <div className="pac-crumb">Voortgang · Interventie-log</div>
      <div className="pac-page-head" style={{ marginBottom: 18 }}>
        <div>
          <h1 className="pac-page-title">Interventie-log</h1>
          <p className="pac-page-sub">
            Welke actie is gekozen — en wie besliste. De AI adviseert, de professional beslist;
            beide zijn vastgelegd.
          </p>
        </div>
      </div>
      {dossiers.map((d) => (
        <section className="pac-section" key={d.id} style={{ marginTop: 0, marginBottom: 26 }}>
          <div className="pac-section-head">
            <h2 className="pac-section-title" style={{ fontSize: 16 }}>
              {d.naam}
            </h2>
            <button type="button" className="pac-section-link" onClick={() => onOpenDossier(d.id)}>
              Open dossier
            </button>
          </div>
          <div className="pac-log">
            {d.intervLog.map((l, i) => (
              <div className="pac-log-row" key={i}>
                <div className="pac-log-date">{l.date}</div>
                <div className="pac-log-body">
                  <div className="who">{l.who}</div>
                  <div className="what">{l.what}</div>
                  <div className="pac-log-decider">
                    <span className="ai">✦ {l.ai}</span>
                    <span className="mens">● {l.mens}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
