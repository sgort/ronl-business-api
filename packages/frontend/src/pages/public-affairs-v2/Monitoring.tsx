/**
 * Monitoring — Scherm 3, curated signals per source.
 *
 * Signals are filtered to the active tab and sorted by PA-relevance. Each
 * carries a duiding and a kans/risico impact, and links to its dossier.
 */

import { getSignals, getDossier, MONITORING_TABS, type MonitoringTabId } from './pa.data';

interface Props {
  activeTab?: MonitoringTabId;
  onOpenDossier: (id: string) => void;
}

export default function Monitoring({ activeTab = 'politiek', onOpenDossier }: Props) {
  const tab = MONITORING_TABS.find((t) => t.id === activeTab) ?? MONITORING_TABS[0];
  const signals = getSignals()
    .filter((s) => s.tab === tab.id)
    .sort((a, b) => b.rel - a.rel);
  const dossierNaam = (id: string) => getDossier(id)?.naam ?? id;

  return (
    <div>
      <div className="pac-crumb">Monitoring · {tab.label}</div>
      <div className="pac-page-head" style={{ marginBottom: 18 }}>
        <div>
          <h1 className="pac-page-title">{tab.label}</h1>
          <p className="pac-page-sub">
            Gecureerde signalen — geselecteerd op PA-relevantie, met duiding en mogelijke impact op
            kans of risico. Geen ruis, alleen wat ertoe doet.
          </p>
        </div>
        <span className="pac-total">{signals.length} signalen</span>
      </div>

      {signals.length ? (
        <div className="pac-cards">
          {signals.map((s) => (
            <div className="pac-signal" key={s.id}>
              <div className="pac-signal-rel">
                <div className="pac-signal-rel-num">{s.rel}</div>
                <div className="pac-signal-rel-lbl">relevantie</div>
              </div>
              <div className="pac-signal-body">
                <div
                  style={{
                    display: 'flex',
                    gap: 8,
                    alignItems: 'center',
                    marginBottom: 6,
                    flexWrap: 'wrap',
                  }}
                >
                  <span className={`pac-tag ${s.tag}`}>{s.tagLabel}</span>
                  <button
                    type="button"
                    className="pac-tag"
                    style={{ cursor: 'pointer' }}
                    onClick={() => onOpenDossier(s.dossier)}
                  >
                    {dossierNaam(s.dossier)}
                  </button>
                </div>
                <div className="pac-signal-title">{s.title}</div>
                <div className="pac-signal-src">{s.src}</div>
                <div className="pac-signal-duiding">
                  <span className="lbl">Duiding</span>
                  {s.duiding}
                </div>
              </div>
              <div className="pac-signal-impact">
                <span className={`pac-impact ${s.impact}`}>{s.impactLabel}</span>
                <button
                  type="button"
                  className="pac-section-link"
                  onClick={() => onOpenDossier(s.dossier)}
                >
                  Naar dossier
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="pac-page-sub">Geen gecureerde signalen in deze categorie vandaag.</p>
      )}
    </div>
  );
}
