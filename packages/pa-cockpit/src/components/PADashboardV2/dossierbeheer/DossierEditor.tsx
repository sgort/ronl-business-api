/**
 * DossierEditor — create + edit. Two columns: main (Kerngegevens, Kompas
 * start-scores, three Markdown narrative fields) and a sticky aside
 * (save/publish, snippet library, version history, lifecycle). Every action is
 * role-gated via `can`.
 */

import { useRef, useState } from 'react';
import type { AdminDossier, DossierSnippet, Momentum } from '@ronl/shared';
import MdEditor from './MdEditor';
import KompasScorer from './KompasScorer';
import {
  expandVars,
  todayLabel,
  type DossierCaps,
} from '../../../pages/public-affairs-v2/dossierbeheer.data';

type NarrativeKey = 'waaromNu' | 'waarover' | 'onsVerhaal';

const FIELDS: { key: NarrativeKey; label: string; hint: string }[] = [
  { key: 'waaromNu', label: 'Waarom nu', hint: 'het momentum — waarom is dit dossier nú urgent?' },
  { key: 'waarover', label: 'Waarover', hint: 'afbakening en kernboodschap' },
  {
    key: 'onsVerhaal',
    label: 'Ons verhaal',
    hint: 'het Flevolandse perspectief, frames & tegenframes',
  },
];

interface Props {
  record: AdminDossier;
  isNew: boolean;
  can: DossierCaps;
  snippets: DossierSnippet[];
  currentUser: string;
  busy?: boolean;
  onSave: (draft: AdminDossier, publish: boolean) => void;
  onCancel: () => void;
  onArchive: (d: AdminDossier) => void;
  onUnarchive: (d: AdminDossier) => void;
  onDelete: (d: AdminDossier) => void;
}

export default function DossierEditor({
  record,
  isNew,
  can,
  snippets,
  currentUser,
  busy,
  onSave,
  onCancel,
  onArchive,
  onUnarchive,
  onDelete,
}: Props) {
  // Archived dossiers are view-only: fields are locked and the only lifecycle
  // action is the explicit (Beheerder) Dearchiveren, or hard delete.
  const isArchived = record.status === 'gearchiveerd';
  const readOnly = isArchived;
  const [d, setD] = useState<AdminDossier>(record);
  const [focusField, setFocusField] = useState<NarrativeKey>('waaromNu');
  const taRefs: Record<NarrativeKey, React.RefObject<HTMLTextAreaElement>> = {
    waaromNu: useRef<HTMLTextAreaElement>(null),
    waarover: useRef<HTMLTextAreaElement>(null),
    onsVerhaal: useRef<HTMLTextAreaElement>(null),
  };

  const set = (patch: Partial<AdminDossier>) => setD((prev) => ({ ...prev, ...patch }));
  const setMd = (key: NarrativeKey, val: string) =>
    setD((prev) => ({ ...prev, md: { ...prev.md, [key]: val } }));

  const insertSnippet = (snip: DossierSnippet) => {
    const block = expandVars(snip.md, {
      today: todayLabel(),
      currentUser,
      projectName: d.naam,
    });
    const key = focusField;
    const ta = taRefs[key].current;
    const cur = d.md[key] || '';
    if (ta) {
      const s = ta.selectionStart;
      setMd(key, cur.slice(0, s) + block + cur.slice(s));
    } else {
      setMd(key, cur + block);
    }
  };

  const slug =
    d.id ||
    (d.naam || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  const valid = (d.naam || '').trim().length > 2 && (d.onderwerp || '').trim().length > 0;

  return (
    <div className="pac-db pac-db-wide">
      <div className="pac-db-crumb">
        <button type="button" onClick={onCancel}>
          ← Dossieroverzicht
        </button>{' '}
        · {isNew ? 'Nieuw dossier' : d.naam}
      </div>
      <div className="pac-db-editor-head">
        <h1 className="pac-beheer-title">{isNew ? 'Nieuw dossier' : 'Dossier bewerken'}</h1>
        {!isNew && <span className={`pac-db-status ${d.status}`}>{d.status}</span>}
      </div>

      <div className="pac-db-grid">
        <div className="pac-db-main">
          {/* Kerngegevens */}
          <div className="pac-db-card">
            <div className="pac-db-card-label">Kerngegevens</div>
            <div className="pac-db-field">
              <label className="pac-db-field-label">Naam</label>
              <input
                className="pac-db-input"
                value={d.naam}
                placeholder="bv. Stikstof & landbouwtransitie"
                readOnly={readOnly}
                onChange={(e) => set({ naam: e.target.value })}
              />
              <span className="pac-db-slug">/pa/dossiers/{slug || '…'}</span>
            </div>
            <div className="pac-db-field">
              <label className="pac-db-field-label">
                Onderwerp{' '}
                <span className="pac-db-field-hint">
                  één regel — verschijnt onder de titel op de Issuekaart
                </span>
              </label>
              <input
                className="pac-db-input"
                value={d.onderwerp}
                readOnly={readOnly}
                onChange={(e) => set({ onderwerp: e.target.value })}
              />
            </div>
            <div className="pac-db-2col">
              <div className="pac-db-field">
                <label className="pac-db-field-label">Status</label>
                <div className="pac-db-seg">
                  {(
                    [
                      ['actief', 'Actief'],
                      ['sluimerend', 'Sluimerend'],
                    ] as const
                  ).map(([id, lbl]) => (
                    <button
                      key={id}
                      type="button"
                      className={`pac-db-seg-btn ${d.status === id ? 'active' : ''}`}
                      disabled={readOnly}
                      onClick={() => set({ status: id })}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>
              <div className="pac-db-field">
                <label className="pac-db-field-label">Momentum</label>
                <div className="pac-db-seg">
                  {(
                    [
                      ['up', '↑ Op'],
                      ['flat', '→ Vlak'],
                      ['down', '↓ Af'],
                    ] as const
                  ).map(([id, lbl]) => (
                    <button
                      key={id}
                      type="button"
                      className={`pac-db-seg-btn ${d.momentum === id ? 'active' : ''}`}
                      disabled={readOnly}
                      onClick={() => set({ momentum: id as Momentum })}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="pac-db-field">
              <label className="pac-db-field-label">Eigenaar</label>
              <input
                className="pac-db-input"
                value={d.eigenaar}
                readOnly={readOnly}
                onChange={(e) => set({ eigenaar: e.target.value })}
              />
            </div>
          </div>

          {/* Kompas start-scores */}
          <div className="pac-db-card">
            <div className="pac-db-card-label">
              Kompas — startscore
              <span className="pac-db-card-hint">
                8 criteria · 0–2 · {isNew ? 'bij aanmaken' : 'initiële scores'}
              </span>
            </div>
            <KompasScorer
              kompas={d.kompas ?? {}}
              onChange={(k) => set({ kompas: k })}
              readOnly={readOnly}
            />
          </div>

          {/* Narrative — Markdown */}
          <div className="pac-db-card">
            <div className="pac-db-card-label">
              Verhaal — Markdown
              <span className="pac-db-card-hint">
                opgeslagen als raw Markdown · veilig gerenderd
              </span>
            </div>
            {FIELDS.map((f) => (
              <div key={f.key} className="pac-db-field">
                <label className="pac-db-field-label">
                  {f.label} <span className="pac-db-field-hint">{f.hint}</span>
                </label>
                <MdEditor
                  value={d.md[f.key] || ''}
                  onChange={(v) => setMd(f.key, v)}
                  fieldKey={f.key}
                  taRef={taRefs[f.key]}
                  onFocusField={(k) => setFocusField(k as NarrativeKey)}
                  placeholder={`# ${f.label}\n\nSchrijf hier in Markdown…`}
                  readOnly={readOnly}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Aside */}
        <div className="pac-db-aside">
          {/* Save / publish (or read-only notice when archived) */}
          <div className="pac-db-card">
            <div className="pac-db-card-label">
              {readOnly ? 'Gearchiveerd' : isNew ? 'Aanmaken' : 'Opslaan'}
            </div>
            {readOnly ? (
              <div className="pac-db-save-row">
                <span className="pac-db-save-note">
                  Dit dossier is <b>gearchiveerd</b> (Archiefwet) en daarom alleen-lezen. Herstel
                  het hieronder via <b>Dearchiveren</b> om het weer te kunnen bewerken.
                </span>
                <button type="button" className="pac-btn-ghost" onClick={onCancel}>
                  Terug naar overzicht
                </button>
              </div>
            ) : (
              <div className="pac-db-save-row">
                <button
                  type="button"
                  className="pac-btn-primary"
                  disabled={!valid || busy || !(isNew ? can.create : can.edit)}
                  onClick={() => onSave(d, false)}
                >
                  {isNew ? 'Dossier aanmaken' : 'Wijzigingen opslaan'}
                </button>
                <button
                  type="button"
                  className="pac-btn-ghost"
                  disabled={!valid || busy || !can.publish}
                  onClick={() => onSave(d, true)}
                >
                  {d.gepubliceerd ? 'Opslaan & opnieuw publiceren' : 'Opslaan & publiceren'}
                </button>
                <button type="button" className="pac-btn-ghost" onClick={onCancel}>
                  Annuleren
                </button>
                {!valid && (
                  <span className="pac-db-save-note">
                    Naam (min. 3 tekens) en onderwerp zijn verplicht.
                  </span>
                )}
                {!can.publish && (
                  <span className="pac-db-locked">
                    🔒 Publiceren vereist rol <b>Redacteur</b> of hoger.
                  </span>
                )}
                <span className="pac-db-save-note">
                  Schrijft naar <code>pa_dossiers</code> (JSONB) via{' '}
                  <code>{isNew ? 'POST' : 'PATCH'} /pa/dossiers</code> — elke opslag maakt een
                  nieuwe versie.
                </span>
              </div>
            )}
          </div>

          {/* Snippet library (hidden while read-only) */}
          {!readOnly && (
            <div className="pac-db-card">
              <div className="pac-db-card-label">
                Snippets{' '}
                <span className="pac-db-card-hint">
                  invoegen in “{FIELDS.find((f) => f.key === focusField)?.label}”
                </span>
              </div>
              <div className="pac-db-snips">
                {snippets.map((s) => (
                  <div key={s.id} className="pac-db-snip">
                    <span>
                      <span className="pac-db-snip-naam">{s.naam}</span>
                      <br />
                      <span className="pac-db-snip-cat">{s.cat}</span>
                    </span>
                    <button
                      type="button"
                      className="pac-db-snip-ins"
                      onClick={() => insertSnippet(s)}
                    >
                      Invoegen
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Version history */}
          {!isNew && d.versies && d.versies.length > 0 && (
            <div className="pac-db-card">
              <div className="pac-db-card-label">Versiegeschiedenis</div>
              <div className="pac-db-vlist">
                {[...d.versies].reverse().map((v, i) => (
                  <div key={v.v} className="pac-db-vitem">
                    <span className={`pac-db-vtag ${i === 0 ? 'cur' : ''}`}>v{v.v}</span>
                    <span className="pac-db-vmeta">
                      {v.at} · {v.by}
                      {i === 0 ? ' · huidig' : ''}
                    </span>
                    <span className="pac-db-vnote">{v.note}</span>
                    {i !== 0 && (
                      <button type="button" className="pac-db-vrestore">
                        Herstellen naar v{v.v}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Lifecycle */}
          {!isNew && (
            <div className="pac-db-card">
              <div className="pac-db-card-label">Levenscyclus</div>
              <div className="pac-db-save-row">
                {isArchived ? (
                  <button
                    type="button"
                    className="pac-btn-ghost"
                    disabled={!can.archive}
                    onClick={() => onUnarchive(d)}
                  >
                    Dearchiveren (herstellen)…
                  </button>
                ) : (
                  <button
                    type="button"
                    className="pac-btn-ghost"
                    disabled={!can.archive}
                    onClick={() => onArchive(d)}
                  >
                    Archiveren (Archiefwet)…
                  </button>
                )}
                <button
                  type="button"
                  className="pac-btn-danger"
                  disabled={!can.del}
                  onClick={() => onDelete(d)}
                >
                  Definitief verwijderen…
                </button>
                {!can.archive && (
                  <span className="pac-db-locked">
                    🔒 {isArchived ? 'Dearchiveren' : 'Archiveren'}/verwijderen vereist rol{' '}
                    <b>Beheerder</b>.
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
