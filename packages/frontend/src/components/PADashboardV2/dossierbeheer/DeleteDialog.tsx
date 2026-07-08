/**
 * DeleteDialog — hard delete (admin-only). Type-to-confirm: the danger button
 * only enables once the exact dossier name is typed.
 */

import { useState } from 'react';
import type { AdminDossier } from '@ronl/shared';

interface Props {
  dossier: AdminDossier;
  onConfirm: () => void;
  onClose: () => void;
  busy?: boolean;
}

export default function DeleteDialog({ dossier, onConfirm, onClose, busy }: Props) {
  const [txt, setTxt] = useState('');
  const ok = txt.trim() === dossier.naam;

  return (
    <div
      className="pac-db-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="pac-db-dialog" role="dialog" aria-modal="true">
        <div className="pac-db-dialog-head">
          <div className="pac-db-dialog-eyebrow danger">Definitief · onomkeerbaar</div>
          <h2 className="pac-db-dialog-title">Dossier verwijderen</h2>
        </div>
        <div className="pac-db-dialog-body">
          <div className="pac-db-warn">
            <b>Let op:</b> verwijderen wist de rij uit <code>pa_dossiers</code> inclusief alle
            versies. Dit kan niet ongedaan worden gemaakt. Voor afgeronde dossiers is{' '}
            <b>archiveren</b> (Archiefwet) vrijwel altijd de juiste keuze.
          </div>
          <p style={{ marginTop: 12 }}>
            Typ de dossiernaam <b>{dossier.naam}</b> om te bevestigen:
          </p>
          <input
            className="pac-db-confirm-input"
            value={txt}
            placeholder={dossier.naam}
            onChange={(e) => setTxt(e.target.value)}
          />
        </div>
        <div className="pac-db-dialog-foot">
          <button type="button" className="pac-btn-ghost" onClick={onClose}>
            Annuleren
          </button>
          <button
            type="button"
            className="pac-btn-danger"
            disabled={!ok || busy}
            onClick={onConfirm}
          >
            {busy ? 'Bezig…' : 'Definitief verwijderen'}
          </button>
        </div>
      </div>
    </div>
  );
}
