/**
 * Vandaag — Scherm 1, the 30-second start screen.
 *
 * Top-issues ranked by Kompas total + momentum, AI-suggested interventies
 * (each marked "AI adviseert · de professional beslist"), an agenda window
 * and a progress glance. The `prioritering` prop flips the ranking.
 */

import { getAgenda, kompasTotal, kompasMax, type Momentum } from './pa.data';
import { usePaData } from './PaDataProvider';
import { Trend } from './Kompas';

export type Prioritering = 'kompas' | 'momentum';

interface Props {
  onOpenDossier: (id: string) => void;
  prioritering?: Prioritering;
}

const MOM_WEIGHT: Record<Momentum, number> = { up: 1.5, flat: 0, down: -1 };

export default function Vandaag({ onOpenDossier, prioritering = 'kompas' }: Props) {
  const { dossiers, signals, inbox, inboxCounts } = usePaData();
  const topSignals = signals.data.slice(0, 3);
  // Use accurate per-tab counts once seeded; fall back to the all-tabs snapshot while loading.
  const inboxCount =
    Object.keys(inboxCounts).length > 0
      ? Object.values(inboxCounts).reduce((sum, c) => sum + c, 0)
      : inbox.data.length;

  const topIssues = [...dossiers.data]
    .map((d) => ({ d, total: kompasTotal(d.kompas) }))
    .sort((a, b) => {
      if (prioritering === 'momentum') {
        return MOM_WEIGHT[b.d.momentum] - MOM_WEIGHT[a.d.momentum] || b.total - a.total;
      }
      return b.total - a.total || MOM_WEIGHT[b.d.momentum] - MOM_WEIGHT[a.d.momentum];
    })
    .slice(0, 5);

  const interventies = topIssues
    .filter((x) => x.d.interventies.length > 0)
    .slice(0, 3)
    .map((x) => ({ ...x.d.interventies[0], dossier: x.d }));

  const actief = dossiers.data.filter((d) => d.status === 'actief');

  return (
    <div>
      <div className="pac-page-head">
        <div>
          <div className="pac-crumb">Vandaag · Provincie Flevoland</div>
          <h1 className="pac-page-title">Goedemorgen</h1>
          <p className="pac-page-sub">
            Vijf dossiers vragen vandaag aandacht, gesorteerd op Kompas-score en momentum. De
            assistent stelt interventies voor — u beslist.
          </p>
        </div>
        <div className="pac-greeting">
          {new Date().toLocaleDateString('nl-NL', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}
        </div>
      </div>

      {/* 1 — Top issues */}
      <section className="pac-section" style={{ marginTop: 8 }}>
        <div className="pac-section-head">
          <h2 className="pac-section-title">
            Top-issues <span className="pac-q">— wat speelt en wat betekent dit?</span>
          </h2>
          <span className="pac-total">
            gesorteerd op {prioritering === 'momentum' ? 'momentum' : 'Kompas-score'}
          </span>
        </div>
        <div className="pac-cards">
          {topIssues.map(({ d, total }, i) => (
            <button
              key={d.id}
              type="button"
              className="pac-issue"
              onClick={() => onOpenDossier(d.id)}
            >
              <span className="pac-issue-rank">{i + 1}</span>
              <span className="pac-issue-body">
                <span className="pac-issue-title">{d.naam}</span>
                <span className="pac-issue-meta">
                  <span>{d.onderwerp}</span>
                </span>
              </span>
              <span className="pac-issue-right">
                <span className="pac-total">
                  Kompas <b>{total}</b>/{kompasMax()}
                </span>
                <span
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 11,
                    color: 'var(--pac-ink-3)',
                    fontFamily: 'var(--pac-mono)',
                  }}
                >
                  momentum <Trend dir={d.momentum} />
                </span>
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* 1b — Signalen vandaag */}
      {(topSignals.length > 0 || inboxCount > 0) && (
        <section className="pac-section">
          <div className="pac-section-head">
            <h2 className="pac-section-title">
              Signalen vandaag{' '}
              <span className="pac-q">— vers uit Tweede Kamer &amp; Officiële Bekendmakingen</span>
            </h2>
            <span className="pac-total">{signals.data.length} gecureerd</span>
          </div>
          {inboxCount > 0 && (
            <div className="pac-inbox-banner">
              <span>
                <b>{inboxCount} nieuwe signalen</b> wachten op duiding en bevestiging in Monitoring.
              </span>
              <span className="pac-inbox-banner-pipe">regels → AI-concept → bevestigen</span>
            </div>
          )}
          <div className="pac-cards">
            {topSignals.map((s) => (
              <button
                key={s.id}
                type="button"
                className="pac-issue"
                onClick={() => s.dossierId && onOpenDossier(s.dossierId)}
              >
                <span
                  className="pac-issue-rank"
                  style={{ fontFamily: 'var(--pac-serif)', fontWeight: 700 }}
                >
                  {s.rel}
                </span>
                <span className="pac-issue-body">
                  <span className="pac-issue-title">{s.title}</span>
                  <span className="pac-issue-meta">
                    <span>{s.src}</span>
                  </span>
                </span>
                <span className="pac-issue-right">
                  {s.impact && <span className={`pac-impact ${s.impact}`}>{s.impactLabel}</span>}
                  {s.dossierId && (
                    <span
                      style={{
                        fontSize: 11,
                        color: 'var(--pac-ink-3)',
                        fontFamily: 'var(--pac-mono)',
                      }}
                    >
                      {s.dossierId}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* 2 — Recommended interventions */}
      <section className="pac-section">
        <div className="pac-section-head">
          <h2 className="pac-section-title">
            Aanbevolen interventies <span className="pac-q">— welke interventie doen we nu?</span>
          </h2>
        </div>
        <div className="pac-interventies">
          {interventies.map((iv, i) => (
            <div className="pac-interv" key={i}>
              <div className="pac-interv-head">
                <span className="pac-ai-chip">IOU-suggestie</span>
                <span className="pac-tag">{iv.dossier.naam.split(' ')[0]}</span>
              </div>
              <div className="pac-interv-title">{iv.titel}</div>
              <p className="pac-interv-motiv">{iv.motiv}</p>
              <div className="pac-interv-foot">
                <span className="pac-interv-kompas">{iv.kompas}</span>
                <span className="pac-interv-actions">
                  <button
                    type="button"
                    className="pac-btn pac-btn-sm"
                    onClick={() => onOpenDossier(iv.dossier.id)}
                  >
                    Bekijk dossier
                  </button>
                </span>
              </div>
              <div className="pac-decide-note">✓ AI adviseert · de professional beslist</div>
            </div>
          ))}
        </div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 36, marginTop: 30 }}>
        {/* 3 — Agenda window */}
        <section>
          <div className="pac-section-head">
            <h2 className="pac-section-title">Agenda-venster</h2>
            <span className="pac-section-link">Volledige agenda</span>
          </div>
          <div className="pac-agenda">
            {getAgenda().map((a, i) => (
              <div className="pac-agenda-item" key={i}>
                <div className="pac-agenda-date">
                  <div className="pac-agenda-day">{a.day}</div>
                  <div className="pac-agenda-mon">{a.mon}</div>
                </div>
                <div>
                  <div className="pac-agenda-title">{a.title}</div>
                  <div className="pac-agenda-sub">{a.sub}</div>
                </div>
                <button
                  type="button"
                  className="pac-section-link"
                  onClick={() => onOpenDossier(a.dossier)}
                >
                  Open
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* 4 — Progress glance */}
        <section>
          <div className="pac-section-head">
            <h2 className="pac-section-title">Voortgang in één oogopslag</h2>
          </div>
          <div className="pac-progress-grid" style={{ gridTemplateColumns: '1fr' }}>
            {actief.map((d) => (
              <button
                key={d.id}
                type="button"
                className="pac-prog"
                style={{ textAlign: 'left', cursor: 'pointer', font: 'inherit' }}
                onClick={() => onOpenDossier(d.id)}
              >
                <div className="pac-prog-name">{d.naam}</div>
                <div className="pac-prog-bar">
                  <div className="pac-prog-fill" style={{ width: d.progressPct + '%' }} />
                </div>
                <div className="pac-prog-meta">
                  <span>{d.progressPct}% op koers</span>
                  <span>{d.mijlpalen.filter((m) => !m.done).length} open mijlpalen</span>
                </div>
                <div className="pac-prog-next">
                  <b>Volgende:</b> {d.next}
                </div>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
