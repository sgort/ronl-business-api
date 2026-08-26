/**
 * DossierRow — one dossier in the overview grouped lists. Shows title, status,
 * publish state, onderwerp, meta (eigenaar · versie · momentum · Archiefwet),
 * the Kompas total + band, and the role-gated row actions.
 */

import type { AdminDossier } from '@ronl/shared';
import { kompasTotal, kompasBand } from '../../../pages/public-affairs-v2/pa.data';
import {
  classificatieLabel,
  bewaartermijnLabel,
  type DossierCaps,
} from '../../../pages/public-affairs-v2/dossierbeheer.data';

const MOMENTUM_ARROW: Record<string, string> = { up: '↑', flat: '→', down: '↓' };

interface Props {
  d: AdminDossier;
  can: DossierCaps;
  onEdit: (d: AdminDossier) => void;
  onArchive: (d: AdminDossier) => void;
  onUnarchive: (d: AdminDossier) => void;
  onDelete: (d: AdminDossier) => void;
}

export default function DossierRow({ d, can, onEdit, onArchive, onUnarchive, onDelete }: Props) {
  const hasKompas = Object.keys(d.kompas ?? {}).length > 0;
  const total = kompasTotal(d.kompas as never);
  const band = kompasBand(total);
  const isArchived = d.status === 'gearchiveerd';

  return (
    <div className={`pac-db-row ${d.status}`}>
      <div className="pac-db-row-main">
        <div className="pac-db-row-title">
          <span className="pac-db-row-naam">{d.naam}</span>
          <span className={`pac-db-status ${d.status}`}>{d.status}</span>
          {d.status !== 'gearchiveerd' && (
            <span className={`pac-db-pub ${d.gepubliceerd ? '' : 'concept'}`}>
              {d.gepubliceerd ? '● gepubliceerd' : '○ concept'}
            </span>
          )}
        </div>
        <div className="pac-db-row-onderwerp">{d.onderwerp}</div>
        <div className="pac-db-row-meta">
          <span>
            <b>Eigenaar</b> {d.eigenaar}
          </span>
          <span>
            <b>v{d.versie}</b> · bewerkt {d.bewerkt} geleden
          </span>
          <span>
            momentum <b>{MOMENTUM_ARROW[d.momentum] ?? '→'}</b>
          </span>
          {d.archief && (
            <span>
              <b>Archiefwet</b> {classificatieLabel(d.archief.classificatie)} ·{' '}
              {bewaartermijnLabel(d.archief.bewaartermijn)}
            </span>
          )}
        </div>
      </div>
      <div className="pac-db-row-side">
        {hasKompas ? (
          <span className="pac-db-kompas">
            <span className="pac-db-kompas-n">{total}</span>
            <span className={`pac-db-kompas-band ${band.key}`}>{band.kort}</span>
          </span>
        ) : (
          <span className="pac-db-kompas-band niet">geen score</span>
        )}
        <div className="pac-db-row-actions">
          <button type="button" className="pac-db-abtn" onClick={() => onEdit(d)}>
            {can.edit && !isArchived ? 'Bewerken' : 'Bekijken'}
          </button>
          {isArchived ? (
            <button
              type="button"
              className="pac-db-abtn"
              disabled={!can.archive}
              onClick={() => onUnarchive(d)}
            >
              Herstellen
            </button>
          ) : (
            <button
              type="button"
              className="pac-db-abtn"
              disabled={!can.archive}
              onClick={() => onArchive(d)}
            >
              Archiveren
            </button>
          )}
          <button
            type="button"
            className="pac-db-abtn danger"
            disabled={!can.del}
            onClick={() => onDelete(d)}
          >
            Verwijderen
          </button>
        </div>
      </div>
    </div>
  );
}
