/**
 * TemplateGallery — create step 1. Pick Blank or a library template before
 * editing. Continue stays disabled until a card is selected.
 */

import { useState } from 'react';
import type { DossierTemplate } from '@ronl/shared';

interface Props {
  templates: DossierTemplate[];
  onPick: (tpl: DossierTemplate) => void;
  onCancel: () => void;
}

export default function TemplateGallery({ templates, onPick, onCancel }: Props) {
  const [sel, setSel] = useState<string | null>(null);

  return (
    <div className="pac-db pac-db-wide">
      <div className="pac-db-crumb">
        <button type="button" onClick={onCancel}>
          ← Dossieroverzicht
        </button>{' '}
        · Nieuw dossier
      </div>
      <h1 className="pac-beheer-title">Kies een startpunt</h1>
      <p className="pac-spec-intro">
        Een nieuw dossier begint <b>blanco</b>, vanuit een <b>sjabloon</b> uit de bibliotheek, of
        straks vanuit een bestaand dossier (dupliceren). Sjablonen zetten de vaste opbouw en
        Markdown-scaffolds klaar; variabelen als <code>{'{{today}}'}</code> en{' '}
        <code>{'{{currentUser}}'}</code> worden bij aanmaken ingevuld.
      </p>
      <div className="pac-db-tpls">
        {templates.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`pac-db-tpl ${sel === t.id ? 'sel' : ''}`}
            onClick={() => setSel(t.id)}
          >
            <span className="pac-db-tpl-cat">{t.cat}</span>
            <span className="pac-db-tpl-naam">{t.naam}</span>
            <span className="pac-db-tpl-desc">{t.beschrijving}</span>
            <span className="pac-db-tpl-meta">
              <span>{t.versie}</span>
              <span>{t.eigenaar}</span>
              {t.gebruikt > 0 && <span>{t.gebruikt}× gebruikt</span>}
            </span>
          </button>
        ))}
      </div>
      <div className="pac-db-toolbar" style={{ marginTop: 20 }}>
        <button
          type="button"
          className="pac-btn-primary"
          disabled={!sel}
          onClick={() => {
            const tpl = templates.find((t) => t.id === sel);
            if (tpl) onPick(tpl);
          }}
        >
          Doorgaan met dit sjabloon →
        </button>
        <button type="button" className="pac-btn-ghost" onClick={onCancel}>
          Annuleren
        </button>
      </div>
    </div>
  );
}
