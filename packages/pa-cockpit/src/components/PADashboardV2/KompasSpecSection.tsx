import { KOMPAS_CRITERIA, KOMPAS_BANDS, kompasMax } from '../../pages/public-affairs-v2/pa.data';

export default function KompasSpecSection() {
  const max = kompasMax();

  return (
    <div>
      <div className="pac-spec-eyebrow">Strategisch kompas</div>
      <h1 className="pac-page-title" style={{ marginBottom: 8 }}>
        Flevolands afwegingskader
      </h1>
      <p className="pac-spec-intro">
        Het afwegingskader bepaalt welke dossiers Flevoland actief oppakt en met welke intensiteit.
        Elk dossier wordt langs acht criteria gescoord op een schaal van 0 tot 2. De optelsom
        bepaalt de drempelwaarde en de aanbevolen PA-inzet.
      </p>
      <p className="pac-spec-intro" style={{ marginBottom: 24 }}>
        Elke score (0 · 1 · 2) reflecteert de mate waarin het dossier scoort op het criterium op dit
        moment. De maximale totaalscore is {max}. De scores voeden het Kompas-radar, de
        Vandaag-prioritering en de Issuekaart.
      </p>

      <h2 className="pac-section-title" style={{ marginBottom: 12 }}>
        Criteria
      </h2>
      <table className="pac-spec-table" style={{ marginBottom: 28 }}>
        <thead>
          <tr>
            <th>Criterium</th>
            <th>Toelichting</th>
            <th>Score</th>
          </tr>
        </thead>
        <tbody>
          {KOMPAS_CRITERIA.map((c, i) => (
            <tr key={c.key}>
              <td>
                <span className="pac-spec-num">{i + 1}</span>
                <span className="pac-spec-crit">{c.name}</span>
              </td>
              <td>{c.hint}</td>
              <td className="pac-spec-score">0 · 1 · 2</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="pac-section-title" style={{ marginBottom: 12 }}>
        Drempelwaarden
      </h2>
      <table className="pac-spec-table" style={{ marginBottom: 20 }}>
        <thead>
          <tr>
            <th>Totaalscore</th>
            <th>Drempelwaarde</th>
            <th>Aanbevolen PA-inzet</th>
          </tr>
        </thead>
        <tbody>
          {KOMPAS_BANDS.map((band, i) => {
            const prev = KOMPAS_BANDS[i - 1];
            const rangeLabel = i === 0 ? `${band.min}–${max}` : `${band.min}–${prev.min - 1}`;
            return (
              <tr key={band.key}>
                <td className="pac-spec-range">{rangeLabel}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <span className={`pac-spec-dot tone-${band.key}`} />
                    <span className="pac-spec-band">{band.label}</span>
                  </span>
                </td>
                <td>{band.inzet}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p className="pac-spec-source">
        <b>Bron:</b> Flevolands Afwegingskader PA 2.0. Noot: de originele banden (&gt;14 / 10–13 /
        &lt;10 / 0–4) overlappen en laten 14 ongedekt. Implementatie gebruikt aaneengesloten banden
        met de topband ≥ 14.
      </p>
    </div>
  );
}
