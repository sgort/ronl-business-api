/**
 * ArchiveDialog — Archiefwet capture. Confirming persists classificatie +
 * bewaartermijn + grondslag, sets status=gearchiveerd and unpublishes.
 */

import { useState } from 'react';
import type { AdminDossier, DossierArchief } from '@ronl/shared';
import {
  DB_CLASSIFICATIES,
  DB_BEWAARTERMIJNEN,
} from '../../../pages/public-affairs-v2/dossierbeheer.data';

interface Props {
  dossier: AdminDossier;
  onConfirm: (meta: Pick<DossierArchief, 'classificatie' | 'bewaartermijn' | 'reden'>) => void;
  onClose: () => void;
  busy?: boolean;
}

export default function ArchiveDialog({ dossier, onConfirm, onClose, busy }: Props) {
  const [classificatie, setClassificatie] = useState<DossierArchief['classificatie']>('intern');
  const [bewaartermijn, setBewaartermijn] = useState<DossierArchief['bewaartermijn']>('V10');
  const [reden, setReden] = useState('');
  const term = DB_BEWAARTERMIJNEN.find((b) => b.id === bewaartermijn);

  return (
    <div
      className="pac-db-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="pac-db-dialog" role="dialog" aria-modal="true">
        <div className="pac-db-dialog-head">
          <div className="pac-db-dialog-eyebrow">Archiefwet · selectielijst Flevoland</div>
          <h2 className="pac-db-dialog-title">Dossier archiveren</h2>
        </div>
        <div className="pac-db-dialog-body">
          <p>
            <b>{dossier.naam}</b> verdwijnt uit de actieve cockpit maar blijft bewaard conform de
            Archiefwet. Leg de classificatie en bewaartermijn vast — deze metadata reist mee naar
            het e-depot.
          </p>
          <div className="pac-db-field">
            <label className="pac-db-field-label">Classificatie</label>
            <div className="pac-db-radio">
              {DB_CLASSIFICATIES.map((c) => (
                <label key={c.id} className={classificatie === c.id ? 'sel' : ''}>
                  <input
                    type="radio"
                    name="cls"
                    checked={classificatie === c.id}
                    onChange={() => setClassificatie(c.id)}
                  />
                  <span>
                    <span className="r-label">{c.label}</span>
                    <br />
                    <span className="r-hint">{c.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div className="pac-db-field">
            <label className="pac-db-field-label">Bewaartermijn</label>
            <select
              className="pac-db-select"
              value={bewaartermijn}
              onChange={(e) => setBewaartermijn(e.target.value as DossierArchief['bewaartermijn'])}
            >
              {DB_BEWAARTERMIJNEN.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
            <span className="pac-db-field-hint" style={{ marginLeft: 0 }}>
              {term?.cat}
            </span>
          </div>
          <div className="pac-db-field">
            <label className="pac-db-field-label">
              Reden / grondslag{' '}
              <span className="pac-db-field-hint">wordt in het audit-log vastgelegd</span>
            </label>
            <input
              className="pac-db-input"
              value={reden}
              placeholder="bv. Traject afgerond na besluitvorming"
              onChange={(e) => setReden(e.target.value)}
            />
          </div>
        </div>
        <div className="pac-db-dialog-foot">
          <button type="button" className="pac-btn-ghost" onClick={onClose}>
            Annuleren
          </button>
          <button
            type="button"
            className="pac-btn-primary"
            disabled={!reden.trim() || busy}
            onClick={() => onConfirm({ classificatie, bewaartermijn, reden: reden.trim() })}
          >
            {busy ? 'Bezig…' : 'Archiveren'}
          </button>
        </div>
      </div>
    </div>
  );
}
