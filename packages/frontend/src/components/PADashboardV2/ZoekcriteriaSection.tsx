import { useState, useEffect, useCallback, Fragment } from 'react';
import { usePaData } from '../../pages/public-affairs-v2/PaDataProvider';
import type { Dossier } from '@ronl/shared';
import type { SavedSearch } from '../../services/pa.api';
import {
  fetchSearches,
  createSearch,
  updateSearch,
  deleteSavedSearch,
} from '../../services/pa.api';

// Mirror of rules.ts HIGH_VALUE_TK_TYPES / HIGH_VALUE_EU_TYPES — kept in sync.
const ZC_HEAVY = {
  tk: ['Motie', 'Kamervraag', 'Brief', 'Amendement'],
  eu: ['Verslag', 'Motie', 'Aangenomen tekst', 'Resolutie'],
};

const ZC_SOURCES = [
  { id: 'tk', label: 'TK', full: 'Tweede Kamer' },
  { id: 'ob', label: 'OB', full: 'Officiële Bekendmakingen' },
  { id: 'eu', label: 'EU', full: 'Europees Parlement' },
  { id: 'media', label: 'Media', full: 'Nieuws & media' },
];

interface ZcDraft {
  id: string;
  dossierId: string | null;
  scope: 'team' | 'persoonlijk';
  sources: string[];
  terms: string[];
  tags: string[];
}

function toZcDraft(s: SavedSearch): ZcDraft {
  return {
    id: s.id,
    dossierId: s.dossierId,
    scope: s.scope === 'tenant' ? 'team' : 'persoonlijk',
    sources: s.query.source,
    terms: s.query.q
      .split(/ OR /i)
      .map((t) => t.trim())
      .filter(Boolean),
    tags: s.tags,
  };
}

function zcHeavyForSources(sources: string[]): string[] {
  const t: string[] = [];
  if (sources.includes('tk')) t.push(...ZC_HEAVY.tk);
  if (sources.includes('eu')) t.push(...ZC_HEAVY.eu);
  return [...new Set(t)];
}

function zcBestCase(sources: string[]): number {
  let rel = 3;
  if (sources.includes('tk') || sources.includes('eu')) rel += 2;
  if (sources.includes('media')) rel = Math.max(rel, 5);
  rel += 1;
  return Math.min(10, rel);
}

function ZcSourceBadges({ sources }: { sources: string[] }) {
  return (
    <div className="pac-zc-srcs">
      {ZC_SOURCES.filter((s) => sources.includes(s.id)).map((s) => (
        <span key={s.id} className={`pac-zc-src ${s.id}`} title={s.full}>
          {s.label}
        </span>
      ))}
    </div>
  );
}

function ZcTerms({ terms }: { terms: string[] }) {
  return (
    <div className="pac-zc-terms">
      {terms.map((t, i) => (
        <Fragment key={t + i}>
          {i > 0 && <span className="pac-zc-op">OF</span>}
          <span className="pac-zc-term">{t}</span>
        </Fragment>
      ))}
    </div>
  );
}

interface ZcEditorProps {
  draft: ZcDraft;
  dossiers: Dossier[];
  onChange: (d: ZcDraft) => void;
  onSave: () => void;
  onCancel: () => void;
  isNew: boolean;
}

function ZcEditor({ draft, dossiers, onChange, onSave, onCancel, isNew }: ZcEditorProps) {
  const [termInput, setTermInput] = useState('');
  const [tagInput, setTagInput] = useState('');

  const addTerm = () => {
    const v = termInput.trim();
    if (!v) return;
    onChange({ ...draft, terms: [...draft.terms, v] });
    setTermInput('');
  };

  const removeTerm = (i: number) =>
    onChange({ ...draft, terms: draft.terms.filter((_, j) => j !== i) });

  const toggleSource = (id: string) => {
    const has = draft.sources.includes(id);
    onChange({
      ...draft,
      sources: has ? draft.sources.filter((s) => s !== id) : [...draft.sources, id],
    });
  };

  const addTag = () => {
    const v = tagInput.trim().toLowerCase();
    if (!v) return;
    onChange({ ...draft, tags: [...new Set([...draft.tags, v])] });
    setTagInput('');
  };

  const heavy = zcHeavyForSources(draft.sources);
  const best = zcBestCase(draft.sources);
  const valid = draft.terms.length > 0 && draft.sources.length > 0;

  return (
    <div className="pac-zc-editor">
      <div className="pac-zc-ed-row">
        <div className="pac-zc-ed-label">
          Zoektermen
          <span className="pac-zc-ed-hint">
            termen met <b>OF</b> gecombineerd · frase tussen &ldquo;aanhalingstekens&rdquo;
          </span>
        </div>
        <div className="pac-zc-chipfield">
          {draft.terms.map((t, i) => (
            <span key={t + i} className="pac-zc-term editable">
              {t}
              <button
                type="button"
                className="pac-zc-x"
                onClick={() => removeTerm(i)}
                aria-label="verwijder"
              >
                ×
              </button>
            </span>
          ))}
          <input
            className="pac-zc-chipinput"
            value={termInput}
            placeholder="term toevoegen…"
            onChange={(e) => setTermInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addTerm();
              }
            }}
          />
        </div>
      </div>

      <div className="pac-zc-ed-row">
        <div className="pac-zc-ed-label">
          Bronnen
          <span className="pac-zc-ed-hint">welke signaalbron(nen) deze criteria ophalen</span>
        </div>
        <div className="pac-zc-toggles">
          {ZC_SOURCES.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`pac-zc-toggle ${s.id} ${draft.sources.includes(s.id) ? 'active' : ''}`}
              onClick={() => toggleSource(s.id)}
            >
              {s.label}
              <span className="pac-zc-toggle-full">{s.full}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="pac-zc-ed-grid">
        <div className="pac-zc-ed-row">
          <div className="pac-zc-ed-label">Koppel aan dossier</div>
          <select
            className="pac-zc-select"
            value={draft.dossierId ?? ''}
            onChange={(e) => onChange({ ...draft, dossierId: e.target.value || null })}
          >
            <option value="">Geen — topic / watchlist</option>
            {dossiers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.naam}
              </option>
            ))}
          </select>
          <div className="pac-zc-ed-note">
            Zonder dossier belandt een bevestigd signaal op de <b>watchlist</b> tot koppeling.
          </div>
        </div>
        <div className="pac-zc-ed-row">
          <div className="pac-zc-ed-label">Bereik</div>
          <div className="pac-zc-scopeseg">
            {(['team', 'persoonlijk'] as const).map((id) => (
              <button
                key={id}
                type="button"
                className={`pac-zc-scopeseg-btn ${draft.scope === id ? 'active' : ''}`}
                onClick={() => onChange({ ...draft, scope: id })}
              >
                {id === 'team' ? 'Team' : 'Persoonlijk'}
              </button>
            ))}
          </div>
          <div className="pac-zc-ed-note">
            Alleen <b>Team</b>-criteria (scope <code>tenant</code>) voedt de cron.
          </div>
        </div>
      </div>

      <div className="pac-zc-ed-row">
        <div className="pac-zc-ed-label">
          Tags
          <span className="pac-zc-ed-hint">tellen mee als +1 bij een titel-/omschrijvingmatch</span>
        </div>
        <div className="pac-zc-chipfield">
          {draft.tags.map((t, i) => (
            <span key={t + i} className="pac-zc-tag editable">
              {t}
              <button
                type="button"
                className="pac-zc-x"
                onClick={() => onChange({ ...draft, tags: draft.tags.filter((_, j) => j !== i) })}
              >
                ×
              </button>
            </span>
          ))}
          <input
            className="pac-zc-chipinput"
            value={tagInput}
            placeholder="tag toevoegen…"
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addTag();
              }
            }}
          />
        </div>
      </div>

      <div className="pac-zc-score">
        <div className="pac-zc-score-head">
          Zo scoort de cron <span className="pac-zc-score-src">rules.ts · scoreItem</span>
        </div>
        <div className="pac-zc-score-body">
          <div className="pac-zc-score-line">
            <span className="pac-zc-score-n">3</span> basisrelevantie
          </div>
          {(draft.sources.includes('tk') || draft.sources.includes('eu')) && (
            <div className="pac-zc-score-line">
              <span className="pac-zc-score-n plus">+2</span> zwaartype{' '}
              {heavy.length > 0 && (
                <em>
                  ({heavy.slice(0, 4).join(' · ')}
                  {heavy.length > 4 ? '…' : ''})
                </em>
              )}
            </div>
          )}
          {draft.sources.includes('media') && (
            <div className="pac-zc-score-line">
              <span className="pac-zc-score-n plus">+2</span> provincie Flevoland{' '}
              <span className="pac-zc-score-n plus">+1</span> gemeente <em>(gazetteer)</em>
            </div>
          )}
          <div className="pac-zc-score-line">
            <span className="pac-zc-score-n plus">+1</span> per term-/tagmatch op titel
          </div>
          <div className={`pac-zc-score-verdict ${best >= 4 ? 'pass' : 'fail'}`}>
            Sterke treffer ≈ <b>rel {best}</b> → {best >= 4 ? 'wordt kandidaat ✓' : 'onder drempel'}{' '}
            <span className="pac-zc-score-drempel">drempel rel ≥ 4</span>
          </div>
          <div className="pac-zc-score-foot">
            Zonder enige term-match blijft rel op 3 — onder de drempel. Zo blijft &ldquo;geen
            ruis&rdquo; de belofte.
          </div>
        </div>
      </div>

      <div className="pac-zc-ed-actions">
        <button type="button" className="pac-btn-primary" disabled={!valid} onClick={onSave}>
          {isNew ? 'Criterium toevoegen' : 'Wijzigingen opslaan'}
        </button>
        <button type="button" className="pac-zc-ghost" onClick={onCancel}>
          Annuleren
        </button>
        {!valid && <span className="pac-zc-ed-invalid">Minstens één term én één bron nodig.</span>}
      </div>
    </div>
  );
}

interface ZcCardProps {
  crit: ZcDraft;
  dossiers: Dossier[];
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (d: ZcDraft) => void;
  onToggleScope: () => void;
  onDelete: () => void;
}

function ZcCard({
  crit,
  dossiers,
  editing,
  onEdit,
  onCancel,
  onSave,
  onToggleScope,
  onDelete,
}: ZcCardProps) {
  const [draft, setDraft] = useState<ZcDraft>(crit);
  useEffect(() => {
    setDraft(crit);
  }, [crit, editing]);
  const best = zcBestCase(crit.sources);
  return (
    <div className={`pac-zc-card ${editing ? 'editing' : ''}`}>
      <div className="pac-zc-card-main">
        <div className="pac-zc-card-body">
          <ZcTerms terms={crit.terms} />
          <div className="pac-zc-card-meta">
            <ZcSourceBadges sources={crit.sources} />
            {crit.tags.length > 0 && (
              <div className="pac-zc-tags">
                {crit.tags.map((t) => (
                  <span key={t} className="pac-zc-tag">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="pac-zc-card-side">
          <span className={`pac-zc-scope ${crit.scope}`}>
            {crit.scope === 'team' ? 'Team' : 'Persoonlijk'}
          </span>
          <span className="pac-zc-rel" title="Representatieve sterke-treffer-score">
            ≈ rel {best}
          </span>
        </div>
      </div>
      <div className="pac-zc-card-actions">
        {!editing && (
          <button type="button" className="pac-zc-abtn" onClick={onEdit}>
            Bewerken
          </button>
        )}
        {crit.scope === 'persoonlijk' ? (
          <button
            type="button"
            className="pac-zc-abtn promote"
            onClick={onToggleScope}
            title="Promoveer naar teambron — dan leest de cron dit mee"
          >
            ↗ team
          </button>
        ) : (
          <button
            type="button"
            className="pac-zc-abtn"
            onClick={onToggleScope}
            title="Terug naar persoonlijk"
          >
            ↩ persoonlijk
          </button>
        )}
        <button type="button" className="pac-zc-abtn danger" onClick={onDelete}>
          Verwijderen
        </button>
      </div>
      {editing && (
        <ZcEditor
          draft={draft}
          dossiers={dossiers}
          onChange={setDraft}
          onSave={() => onSave(draft)}
          onCancel={onCancel}
          isNew={false}
        />
      )}
    </div>
  );
}

export default function ZoekcriteriaSection() {
  const { dossiers } = usePaData();
  const dossiersData = dossiers.data;

  const [items, setItems] = useState<ZcDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newDraft, setNewDraft] = useState<ZcDraft | null>(null);

  const load = useCallback(async () => {
    const searches = await fetchSearches();
    setItems(searches.map(toZcDraft));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const teamItems = items.filter((i) => i.scope === 'team');
  const bronnenInUse = new Set(teamItems.flatMap((i) => i.sources));
  const dossiersCovered = new Set(teamItems.filter((i) => i.dossierId).map((i) => i.dossierId));
  const topicItems = items.filter((i) => !i.dossierId && i.scope === 'team');
  const personalItems = items.filter((i) => i.scope === 'persoonlijk');

  type Group = { key: string; label: string; sub: string; rows: ZcDraft[] };
  const groups: Group[] = [];
  dossiersData.forEach((d) => {
    const rows = items.filter((i) => i.dossierId === d.id && i.scope === 'team');
    if (rows.length) groups.push({ key: d.id, label: d.naam, sub: 'dossier', rows });
  });
  if (topicItems.length)
    groups.push({
      key: '_topic',
      label: 'Zonder dossier · topic & watchlist',
      sub: 'watchlist',
      rows: topicItems,
    });
  if (personalItems.length)
    groups.push({
      key: '_pers',
      label: 'Persoonlijk · nog niet in de cron',
      sub: 'persoonlijk',
      rows: personalItems,
    });

  const startCreate = () => {
    setCreating(true);
    setEditingId(null);
    setNewDraft({
      id: `new-${Date.now()}`,
      dossierId: null,
      scope: 'team',
      sources: ['tk', 'ob'],
      terms: [],
      tags: [],
    });
  };

  const saveNew = async (draft: ZcDraft) => {
    await createSearch({
      q: draft.terms.join(' OR '),
      source: draft.sources,
      tags: draft.tags,
      dossierId: draft.dossierId,
      scope: draft.scope === 'team' ? 'tenant' : 'user',
    });
    setCreating(false);
    setNewDraft(null);
    await load();
  };

  const saveEdit = async (draft: ZcDraft) => {
    await updateSearch(draft.id, {
      q: draft.terms.join(' OR '),
      source: draft.sources,
      tags: draft.tags,
      dossierId: draft.dossierId,
      scope: draft.scope === 'team' ? 'tenant' : 'user',
    });
    setEditingId(null);
    await load();
  };

  const toggleScope = async (item: ZcDraft) => {
    const newScope: 'tenant' | 'user' = item.scope === 'team' ? 'user' : 'tenant';
    await updateSearch(item.id, { scope: newScope });
    await load();
  };

  const del = async (id: string) => {
    await deleteSavedSearch(id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  if (loading) {
    return (
      <div className="pac-beheer pac-zc">
        <div className="pac-spec-eyebrow">Monitoring · configuratie</div>
        <h1 className="pac-beheer-title">Zoekcriteria</h1>
        <p style={{ color: 'var(--pac-ink-3)', fontSize: 14 }}>Laden…</p>
      </div>
    );
  }

  return (
    <div className="pac-beheer pac-zc">
      <div className="pac-spec-eyebrow">Monitoring · configuratie</div>
      <h1 className="pac-beheer-title">Zoekcriteria</h1>
      <p className="pac-spec-intro">
        Deze criteria bepalen <b>wát de curatiepijplijn ophaalt</b>. Elk criterium is een opgeslagen
        zoekvraag met termen, bronnen en (optioneel) een dossier. De cron leest uitsluitend{' '}
        <b>team-criteria</b>; een persoonlijk criterium telt pas mee ná{' '}
        <span className="pac-zc-inline">↗ team</span>. Zie <b>Beheer → Curatiepijplijn</b> voor wat
        er daarna gebeurt.
      </p>

      <div className="pac-zc-stats">
        <div className="pac-zc-stat">
          <span className="pac-zc-stat-n">{teamItems.length}</span>
          <span className="pac-zc-stat-l">team-criteria in de cron</span>
        </div>
        <div className="pac-zc-stat">
          <span className="pac-zc-stat-n">
            {dossiersCovered.size}
            <span className="pac-zc-stat-slash">/{dossiersData.length}</span>
          </span>
          <span className="pac-zc-stat-l">dossiers gedekt</span>
        </div>
        <div className="pac-zc-stat">
          <span className="pac-zc-stat-n">
            {ZC_SOURCES.filter((s) => bronnenInUse.has(s.id)).length}
          </span>
          <span className="pac-zc-stat-l">
            bronnen actief
            <span className="pac-zc-stat-srcs">
              {ZC_SOURCES.filter((s) => bronnenInUse.has(s.id))
                .map((s) => s.label)
                .join(' · ')}
            </span>
          </span>
        </div>
        <div className="pac-zc-stat">
          <span className="pac-zc-stat-n">{topicItems.length}</span>
          <span className="pac-zc-stat-l">zonder dossier · watchlist</span>
        </div>
      </div>

      <div className="pac-zc-toolbar">
        <button type="button" className="pac-btn-primary" onClick={startCreate} disabled={creating}>
          + Nieuw zoekcriterium
        </button>
        <span className="pac-zc-toolbar-note">
          Wijzigingen schrijven naar <code>pa_saved_searches</code> via{' '}
          <code>POST/PATCH /pa/searches</code>.
        </span>
      </div>

      {creating && newDraft && (
        <div className="pac-zc-card editing pac-zc-new">
          <div className="pac-zc-new-head">Nieuw zoekcriterium</div>
          <ZcEditor
            draft={newDraft}
            dossiers={dossiersData}
            onChange={setNewDraft}
            onSave={() => void saveNew(newDraft)}
            onCancel={() => {
              setCreating(false);
              setNewDraft(null);
            }}
            isNew={true}
          />
        </div>
      )}

      {groups.map((g) => (
        <div key={g.key} className="pac-zc-group">
          <div className="pac-zc-group-head">
            <span className={`pac-zc-group-label ${g.sub}`}>{g.label}</span>
            <span className="pac-zc-group-count">{g.rows.length}</span>
          </div>
          <div className="pac-zc-list">
            {g.rows.map((crit) => (
              <ZcCard
                key={crit.id}
                crit={crit}
                dossiers={dossiersData}
                editing={editingId === crit.id}
                onEdit={() => {
                  setEditingId(crit.id);
                  setCreating(false);
                }}
                onCancel={() => setEditingId(null)}
                onSave={(d) => void saveEdit(d)}
                onToggleScope={() => void toggleScope(crit)}
                onDelete={() => void del(crit.id)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
