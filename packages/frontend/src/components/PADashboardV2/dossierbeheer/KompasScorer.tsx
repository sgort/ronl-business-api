/**
 * KompasScorer — the 8-criterion 0–2 start-scorer used in the editor.
 * Re-scoring lives in Voortgang → Kompas-log; this only sets initial scores.
 */

import { KOMPAS_CRITERIA, kompasBand, kompasMax } from '../../../pages/public-affairs-v2/pa.data';
import type { KompasCriterionKey, PartialKompasScores } from '@ronl/shared';

interface Props {
  kompas: PartialKompasScores;
  onChange: (next: PartialKompasScores) => void;
}

export default function KompasScorer({ kompas, onChange }: Props) {
  const total = KOMPAS_CRITERIA.reduce((s, c) => s + (kompas[c.key]?.score ?? 0), 0);
  const band = kompasBand(total);

  const setScore = (key: KompasCriterionKey, score: 0 | 1 | 2) =>
    onChange({ ...kompas, [key]: { duiding: '', ...(kompas[key] ?? {}), score } });
  const setDuiding = (key: KompasCriterionKey, duiding: string) =>
    onChange({ ...kompas, [key]: { score: 0, ...(kompas[key] ?? {}), duiding } });

  return (
    <div>
      <div className="pac-db-kompas-total">
        <span className="n">{total}</span>
        <span className="max">/ {kompasMax()}</span>
        <span className={`pac-db-kompas-band ${band.key}`}>{band.kort}</span>
        <span className="pac-db-card-hint" style={{ marginLeft: 'auto' }}>
          Herscoren gebeurt later in <b>Voortgang → Kompas-log</b>
        </span>
      </div>
      {KOMPAS_CRITERIA.map((c) => {
        const cur = kompas[c.key]?.score ?? 0;
        return (
          <div key={c.key} className="pac-db-krit">
            <div>
              <div className="pac-db-krit-name">{c.short}</div>
              <div className="pac-db-krit-hint">{c.name}</div>
            </div>
            <div className="pac-db-scoreseg">
              {([0, 1, 2] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  data-s={s}
                  className={cur === s ? 'active' : ''}
                  onClick={() => setScore(c.key, s)}
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="pac-db-krit-duiding">
              <input
                value={kompas[c.key]?.duiding ?? ''}
                placeholder="Korte duiding bij deze score (optioneel)…"
                onChange={(e) => setDuiding(c.key, e.target.value)}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
