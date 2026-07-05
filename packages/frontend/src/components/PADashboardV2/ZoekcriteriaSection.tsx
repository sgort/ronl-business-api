import { useState, useEffect, useCallback, Fragment } from 'react';
import { usePaData } from '../../pages/public-affairs-v2/PaDataProvider';
import type { Dossier } from '@ronl/shared';

// Kept in sync with @ronl/shared/types/pa-scoring.ts and rules.ts.
// The drift test in rules.test.ts guards against divergence.
const REL_BASE = 3;
const ZWAARTYPE_BUMP = 2;
const MEDIA_MUNI_BUMP = 1;
const TITLE_HIT = 3;
const MATCH_CAP = 5;
const REL_MAX = 10;
const NOISE_FLOOR = 3;
const REL_THRESHOLD = 4;
import type { SavedSearch } from '../../services/pa.api';
import {
  fetchSearches,
  createSearch,
  updateSearch,
  deleteSavedSearch,
} from '../../services/pa.api';

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

// ── Corrected best-case preview — mirrors rules.ts › scoreItem ────────────────

type RelTier = 'strong' | 'conditional' | 'floor';

interface ZcBestCase {
  base: number;
  typeBump: number;
  matchBump: number;
  total: number;
  tier: RelTier;
  passes: boolean;
}

function zcBestCase(criterion: {
  sources: string[];
  terms: string[];
  tags?: string[];
}): ZcBestCase {
  const { sources, terms } = criterion;
  const hasTerms = terms.length > 0;

  let typeBump = 0;
  if (sources.includes('tk') || sources.includes('eu')) {
    typeBump = ZWAARTYPE_BUMP; // heavy document type +2
  } else if (sources.includes('media')) {
    typeBump = ZWAARTYPE_BUMP + MEDIA_MUNI_BUMP; // best geo case: province(+2) + municipality(+1)
  }
  // 'ob' has no zwaartype bump in the engine

  const matchBump = hasTerms ? Math.min(TITLE_HIT, MATCH_CAP) : 0;

  let total = REL_BASE + typeBump + matchBump;
  if (matchBump === 0) total = Math.min(total, NOISE_FLOOR);
  total = Math.min(REL_MAX, total);

  const tier: RelTier = !hasTerms
    ? 'floor'
    : sources.includes('tk') || sources.includes('eu')
      ? 'strong'
      : sources.includes('media')
        ? 'conditional' // media needs a Flevoland mention; not guaranteed on every item
        : 'strong'; // ob + terms reaches 6 — above threshold

  return { base: REL_BASE, typeBump, matchBump, total, tier, passes: total >= REL_THRESHOLD };
}

function zcVerdict(bc: ZcBestCase): {
  label: string;
  tone: 'strong' | 'weak';
  bars: 1 | 2 | 3;
  sub: string;
} {
  switch (bc.tier) {
    case 'strong':
      return {
        label: 'Wordt opgepikt',
        tone: 'strong',
        bars: bc.total >= 8 ? 3 : 2,
        sub: `sterke treffer · rel ${bc.total} (drempel ${REL_THRESHOLD})`,
      };
    case 'conditional':
      return {
        label: 'Alleen bij regio-match',
        tone: 'weak',
        bars: 2,
        sub: 'media zonder Flevoland-context blijft onder de drempel',
      };
    case 'floor':
    default:
      return {
        label: 'Wordt niet opgepikt',
        tone: 'weak',
        bars: 1,
        sub: `geen rake term · blijft op ${NOISE_FLOOR}`,
      };
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

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

function StrengthBars({ bars }: { bars: 1 | 2 | 3 }) {
  return (
    <span className="pac-zc-bars" aria-hidden="true">
      <span className={`pac-zc-bar b1${bars >= 1 ? ' on' : ''}`} />
      <span className={`pac-zc-bar b2${bars >= 2 ? ' on' : ''}`} />
      <span className={`pac-zc-bar b3${bars >= 3 ? ' on' : ''}`} />
    </span>
  );
}

// ── Explainer modal ───────────────────────────────────────────────────────────

type ModalTab = 'strong' | 'media' | 'noise';

interface ReceiptRow {
  amt: string;
  amtTone: 'base' | 'plus' | 'neutral';
  label: string;
  sub?: string;
  running: number;
}

const MODAL_EXAMPLES: Record<
  ModalTab,
  {
    title: string;
    badge: string;
    badgeClass: string;
    meta: string;
    rows: ReceiptRow[];
    total: number;
    note: string;
  }
> = {
  strong: {
    title: 'Motie stikstofreductie landbouw',
    badge: 'TK',
    badgeClass: 'tk',
    meta: 'Motie',
    rows: [
      {
        amt: '3',
        amtTone: 'base',
        label: 'basisrelevantie',
        sub: 'elke opgehaalde tekst start hier',
        running: 3,
      },
      {
        amt: '+2',
        amtTone: 'plus',
        label: 'zwaar documenttype',
        sub: 'Motie valt onder Motie · Kamervraag · Brief · Amendement',
        running: 5,
      },
      {
        amt: '+3',
        amtTone: 'plus',
        label: 'zoekwoord in de titel',
        sub: '"stikstof" gevonden in de kop — zwaarste hefboom',
        running: 8,
      },
    ],
    total: 8,
    note: `Ruim boven de drempel (${REL_THRESHOLD}). De titeltreffer is de zwaarste hefboom — één rake term in de kop is voldoende.`,
  },
  media: {
    title: 'Netcongestie legt bedrijven in Lelystad stil',
    badge: 'Media',
    badgeClass: 'media',
    meta: 'regio Flevoland',
    rows: [
      {
        amt: '3',
        amtTone: 'base',
        label: 'basisrelevantie',
        sub: 'elke opgehaalde tekst start hier',
        running: 3,
      },
      {
        amt: '+2',
        amtTone: 'plus',
        label: 'provincie Flevoland',
        sub: '"Flevoland" gevonden in regio of tekst',
        running: 5,
      },
      {
        amt: '+1',
        amtTone: 'plus',
        label: 'gemeente (Lelystad)',
        sub: 'gemeente uit de gazetteer gevonden in de tekst',
        running: 6,
      },
    ],
    total: 6,
    note: `Media-items kennen geen documenttype. Geografische context (provincie + gemeente) telt — maar is niet gegarandeerd op elk item.`,
  },
  noise: {
    title: 'Kamerbrief over onderwijshuisvesting',
    badge: 'TK',
    badgeClass: 'tk',
    meta: 'Brief · geen zoekwoord',
    rows: [
      {
        amt: '3',
        amtTone: 'base',
        label: 'basisrelevantie',
        sub: 'elke opgehaalde tekst start hier',
        running: 3,
      },
      {
        amt: '+2',
        amtTone: 'neutral',
        label: 'zwaar documenttype',
        sub: 'Brief is een zwaar type — maar zie de volgende stap',
        running: 5,
      },
      {
        amt: '→ 3',
        amtTone: 'neutral',
        label: 'type-bonus vervalt',
        sub: 'geen zoekwoord raak → noise floor: rel = min(rel, 3)',
        running: 3,
      },
    ],
    total: 3,
    note: `Onder de drempel (${REL_THRESHOLD}) → weggefilterd. Zonder een rake term telt het zware type niet mee. Zo blijft "geen ruis" de belofte.`,
  },
};

function ScoringModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<ModalTab>('strong');
  const ex = MODAL_EXAMPLES[tab];

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="pac-zcm-overlay" onMouseDown={onClose}>
      <div
        className="pac-zcm-box"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="pac-zcm-top">
          <span className="pac-zcm-kicker">ZO SCOORT DE CRON</span>
          <button className="pac-zcm-close" onClick={onClose} aria-label="Sluiten">
            ×
          </button>
        </div>
        <h2 className="pac-zcm-title">Hoe scoort de cron een document?</h2>

        <div className="pac-zcm-tabs" role="tablist">
          {(['strong', 'media', 'noise'] as ModalTab[]).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              className={`pac-zcm-tab${tab === t ? ' active' : ''}`}
              onClick={() => setTab(t)}
            >
              {t === 'strong' ? 'Sterke treffer' : t === 'media' ? 'Media-treffer' : 'Geen treffer'}
            </button>
          ))}
        </div>

        <div className="pac-zcm-exdoc">
          <span className={`pac-zc-src ${ex.badgeClass}`}>{ex.badge}</span>
          <span className="pac-zcm-exdoc-meta">{ex.meta}</span>
          <span className="pac-zcm-exdoc-title">{ex.title}</span>
        </div>

        <div className="pac-zcm-receipt">
          {ex.rows.map((row, i) => (
            <div key={i} className={`pac-zcm-row${i === ex.rows.length - 1 ? ' last' : ''}`}>
              <span className={`pac-zcm-amt ${row.amtTone}`}>{row.amt}</span>
              <span className="pac-zcm-rowbody">
                <span className="pac-zcm-rowlabel">{row.label}</span>
                {row.sub && <small className="pac-zcm-rowsub">{row.sub}</small>}
              </span>
              <span className="pac-zcm-running">= {row.running}</span>
            </div>
          ))}
          <div className="pac-zcm-total">
            <span className="pac-zcm-total-label">Totaal</span>
            <span className="pac-zcm-total-rel">rel {ex.total}</span>
          </div>
        </div>

        <div className="pac-zcm-note">{ex.note}</div>

        <div className="pac-zcm-footer">
          <button className="pac-btn-primary pac-zcm-ok" onClick={onClose}>
            Begrepen
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Score simulator (replaces static ZO SCOORT DE CRON panel) ────────────────

function ScoreSimulator() {
  const [heavy, setHeavy] = useState(true);
  const [titleMatch, setTitleMatch] = useState(true);
  const [tagMatch, setTagMatch] = useState(false);

  let rel = REL_BASE;
  let matched = 0;
  if (heavy) rel += ZWAARTYPE_BUMP;
  if (titleMatch) matched += TITLE_HIT;
  if (tagMatch) matched += 1;
  rel += Math.min(matched, MATCH_CAP);
  if (matched === 0) rel = Math.min(rel, NOISE_FLOOR);
  rel = Math.min(REL_MAX, rel);
  const pass = rel >= REL_THRESHOLD;

  const fillPct = (rel / REL_MAX) * 100;
  const thresholdPct = (REL_THRESHOLD / REL_MAX) * 100;

  return (
    <div className="pac-zc-sim">
      <div className="pac-zc-sim-head">
        <span>Probeer het uit</span>
        <span className="pac-zc-sim-src">voorbeelddocument · TK</span>
      </div>
      <p className="pac-zc-sim-example">
        Een{' '}
        <span className={`pac-zc-sim-mark${heavy ? '' : ' off'}`}>
          {heavy ? 'Motie' : 'document'}
        </span>{' '}
        over{' '}
        <span className={`pac-zc-sim-mark${titleMatch ? '' : ' off'}`}>
          {titleMatch ? 'stikstof' : '…'}
        </span>{' '}
        wordt ingediend bij de Tweede Kamer.
      </p>

      <div className="pac-zc-sim-toggles">
        <SimToggle
          on={heavy}
          onChange={setHeavy}
          label="Zwaar documenttype"
          sub="motie, kamervraag, brief, amendement"
          pts={ZWAARTYPE_BUMP}
        />
        <SimToggle
          on={titleMatch}
          onChange={setTitleMatch}
          label="Zoekwoord in de titel"
          sub={`'stikstof' staat in de kop`}
          pts={TITLE_HIT}
        />
        <SimToggle
          on={tagMatch}
          onChange={setTagMatch}
          label="Tag komt ook voor"
          sub={`+1 extra, gemaximeerd op +${MATCH_CAP} uit matches`}
          pts={1}
        />
      </div>

      <div className="pac-zc-sim-out">
        <div className="pac-zc-sim-track">
          <div
            className={`pac-zc-sim-fill${pass ? ' pass' : ''}`}
            style={{ width: `${fillPct}%` }}
          />
          <div className="pac-zc-sim-threshold" style={{ left: `${thresholdPct}%` }} />
        </div>
        <div className="pac-zc-sim-verdict">
          <span className="pac-zc-sim-n">
            {rel} <span className="pac-zc-sim-max">/ {REL_MAX}</span>
          </span>
          <span className={`pac-zc-sim-status${pass ? ' pass' : ' fail'}`}>
            {pass
              ? `✓ wordt kandidaat — boven drempel ${REL_THRESHOLD}`
              : matched === 0
                ? `✕ wordt weggefilterd — geen term raak (noise floor ${NOISE_FLOOR})`
                : `✕ wordt weggefilterd — onder drempel ${REL_THRESHOLD}`}
          </span>
        </div>
      </div>
    </div>
  );
}

function SimToggle({
  on,
  onChange,
  label,
  sub,
  pts,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
  sub: string;
  pts: number;
}) {
  return (
    <div className="pac-zc-sim-tg">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        className={`pac-zc-sim-switch${on ? ' on' : ''}`}
        onClick={() => onChange(!on)}
        aria-label={label}
      >
        <span className="pac-zc-sim-knob" />
      </button>
      <span className="pac-zc-sim-tg-body">
        <span className="pac-zc-sim-tg-label">{label}</span>
        <small className="pac-zc-sim-tg-sub">{sub}</small>
      </span>
      <span className={`pac-zc-sim-pts${on ? ' on' : ''}`}>+{pts}</span>
    </div>
  );
}

// ── Editor ────────────────────────────────────────────────────────────────────

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

      <ScoreSimulator />

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

// ── Card ──────────────────────────────────────────────────────────────────────

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
  const [modalOpen, setModalOpen] = useState(false);
  useEffect(() => {
    setDraft(crit);
  }, [crit, editing]);

  const bc = zcBestCase(crit);
  const verdict = zcVerdict(bc);

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
          <div className="pac-zc-verdict">
            <div className={`pac-zc-vchip ${verdict.tone}`}>
              <StrengthBars bars={verdict.bars} />
              {verdict.label}
            </div>
            <div className="pac-zc-vsub">
              {verdict.sub}
              <button
                type="button"
                className="pac-zc-help"
                onClick={() => setModalOpen(true)}
                aria-label="Toelichting scoringsmodel"
              >
                ?
              </button>
            </div>
          </div>
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
      {modalOpen && <ScoringModal onClose={() => setModalOpen(false)} />}
    </div>
  );
}

// ── Main section ──────────────────────────────────────────────────────────────

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
