/**
 * Monitoring — Scherm 3, curated signals per source.
 * Live mode: fetches from /v1/pa/signals (confirmed) and inbox (candidates).
 * Mock mode: uses static fixtures from pa.api.ts.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import CuratiePijplijnFlow from '../../components/PADashboardV2/CuratiePijplijnFlow';
import {
  fetchSignals,
  fetchInbox,
  type InboxMeta,
  fetchFeed,
  fetchFeedSources,
  fetchSearches,
  createSavedSearch,
  deleteSavedSearch,
  promoteSearchToTenant,
  promoteToInbox,
  paTabBronnen,
  signalTag,
  signalTagLabel,
  BRON_LABEL,
  type FeedSource,
  type SavedSearch,
} from '../../services/pa.api';
import { usePaData } from './PaDataProvider';
import { MONITORING_TABS, type MonitoringTabId } from './pa.data';
import type { Dossier, FeedItem, Signal } from '@ronl/shared';

import type { PaModeId } from './modes.config';

interface Props {
  activeTab?: MonitoringTabId;
  onOpenDossier: (id: string) => void;
  onNavigate?: (mode: PaModeId, sectionId: string) => void;
}

const BRON_DISPLAY: Record<string, string> = {
  tk: 'Tweede Kamer',
  ob: 'Off. Bekendmakingen',
  eu: 'Europees Parlement',
};

function BronBadge({ bron }: { bron: string | null }) {
  if (!bron) return null;
  return <span className={`pac-bron pac-bron-${bron}`}>{BRON_DISPLAY[bron] ?? bron}</span>;
}

const EP_SUBBRON_LABEL: Record<string, string> = {
  'ep-teksten': 'Ingediende teksten',
  'ep-rss': 'Plenaire RSS',
};

function EpMeta({ s }: { s: Signal }) {
  if (s.bron !== 'eu') return null;
  return (
    <>
      {s.subbron && (
        <span className={`pac-subbron${s.subbron === 'ep-teksten' ? ' teksten' : ''}`}>
          {EP_SUBBRON_LABEL[s.subbron] ?? s.subbron}
        </span>
      )}
      {s.commissie && (
        <span className="pac-commissie" title={`Bevoegde commissie · ${s.commissie}`}>
          {s.commissie}
        </span>
      )}
    </>
  );
}

const MEDIA_SUBBRON_LABEL: Record<string, string> = {
  'nieuws-nationaal': 'Landelijk',
  'nieuws-regionaal': 'Regionaal',
  social: 'Sociaal',
};
const SENTIMENT_LABEL: Record<string, string> = {
  positief: 'Positief',
  neutraal: 'Neutraal',
  negatief: 'Negatief',
};

/** Media-provenance: subbron chip, region badge, subtle sentiment chip.
 *  All three are display-only — not used for scoring, exactly like the EP commissie. */
function MediaMeta({ s }: { s: Signal }) {
  if (s.bron !== 'media') return null;
  return (
    <>
      {s.subbron && (
        <span className="pac-subbron media">{MEDIA_SUBBRON_LABEL[s.subbron] ?? s.subbron}</span>
      )}
      {s.regio && (
        <span className="pac-regio" title={`Regio · ${s.regio}`}>
          ◎ {s.regio}
        </span>
      )}
      {s.sentiment && (
        <span
          className={`pac-sentiment ${s.sentiment}`}
          title="Sentiment · informatief, niet gescoord"
        >
          {SENTIMENT_LABEL[s.sentiment] ?? s.sentiment}
        </span>
      )}
    </>
  );
}

function OrphanActions({
  id,
  dossiers,
  onLink,
}: {
  id: string;
  dossiers: Dossier[];
  onLink: (id: string, dossierId: string) => Promise<void>;
}) {
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);

  const handleKoppel = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await onLink(id, selected);
      setSelected('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pac-orphan-actions">
      <span className="pac-orphan-pick">⚑ Koppel aan dossier</span>
      <select
        className="pac-orphan-select"
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        disabled={busy}
      >
        <option value="">— kies dossier —</option>
        {dossiers.map((d) => (
          <option key={d.id} value={d.id}>
            {d.naam}
          </option>
        ))}
      </select>
      {selected && (
        <button
          type="button"
          className="pac-btn pac-btn-sm"
          disabled={busy}
          onClick={() => void handleKoppel()}
        >
          {busy ? '…' : 'Koppelen'}
        </button>
      )}
    </div>
  );
}

function SignalCard({
  s,
  onOpenDossier,
  dossierNaam,
  justConfirmed,
  dossiers,
  onLink,
}: {
  s: Signal;
  onOpenDossier: (id: string) => void;
  dossierNaam: (id: string | null) => string;
  justConfirmed: boolean;
  dossiers: Dossier[];
  onLink: (id: string, dossierId: string) => Promise<void>;
}) {
  const isWatchlist = s.routing === 'watchlist';
  return (
    <div
      className={`pac-signal ${justConfirmed ? 'pac-signal-fresh' : ''} ${isWatchlist ? 'pac-signal-orphan' : ''}`}
    >
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
          <span className={`pac-tag ${signalTag(s.tab)}`}>{signalTagLabel(s.tab)}</span>
          {s.dossierId && (
            <button
              type="button"
              className="pac-tag"
              style={{ cursor: 'pointer' }}
              onClick={() => onOpenDossier(s.dossierId!)}
            >
              {dossierNaam(s.dossierId)}
            </button>
          )}
          {isWatchlist && <span className="pac-orphan-chip">⚑ Watchlist</span>}
          <BronBadge bron={s.bron} />
          <EpMeta s={s} />
          <MediaMeta s={s} />
        </div>
        <div className="pac-signal-title">{s.title}</div>
        <div className="pac-signal-src">
          {s.src}
          {s.ref && (
            <a className="pac-prov" href={s.ref.url} target="_blank" rel="noopener noreferrer">
              {s.ref.nr} ↗
            </a>
          )}
        </div>
        {s.duiding && (
          <div className="pac-signal-duiding">
            <span className="lbl">Duiding</span>
            {s.duiding}
          </div>
        )}
        {isWatchlist && (
          <div className="pac-orphan-note">
            Bevestigd zonder dossier — staat op de watchlist. Koppel aan een dossier om het te
            activeren.
          </div>
        )}
        {s.confirmedBy && !justConfirmed && (
          <div className="pac-confirmed-by">
            ✓ Bevestigd door {s.confirmedBy} · {s.confirmedAt}
          </div>
        )}
        {justConfirmed && (
          <div className="pac-confirmed-by">
            ✓ Zojuist bevestigd · vastgelegd in interventie-log (AI adviseerde · mens besloot)
          </div>
        )}
        {isWatchlist && <OrphanActions id={s.id} dossiers={dossiers} onLink={onLink} />}
      </div>
      <div className="pac-signal-impact">
        {s.impact && <span className={`pac-impact ${s.impact}`}>{s.impactLabel}</span>}
        {s.dossierId && (
          <button
            type="button"
            className="pac-section-link"
            onClick={() => onOpenDossier(s.dossierId!)}
          >
            Naar dossier
          </button>
        )}
      </div>
    </div>
  );
}

function InboxCard({
  s,
  dossierNaam,
  onConfirm,
  onDismiss,
}: {
  s: Signal;
  dossierNaam: (id: string | null) => string;
  onConfirm: (s: Signal) => void;
  onDismiss: (id: string) => void;
}) {
  const isAi = s.status === 'ai_drafted';
  return (
    <div className="pac-signal pac-signal-inbox">
      <div className="pac-signal-rel">
        <div className="pac-signal-rel-num">{s.rel}</div>
        <div className="pac-signal-rel-lbl">{isAi ? 'AI-rel.' : 'regel-rel.'}</div>
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
          <span className={`pac-sigstatus ${isAi ? 'ai' : 'cand'}`}>
            {isAi ? '✦ AI-concept' : 'Regel-kandidaat'}
          </span>
          {s.dossierId ? (
            <span className="pac-tag">{dossierNaam(s.dossierId)}</span>
          ) : (
            <span className="pac-nodossier-chip">⚑ Geen dossier-match</span>
          )}
          <BronBadge bron={s.bron} />
          <EpMeta s={s} />
          <MediaMeta s={s} />
        </div>
        <div className="pac-signal-title">{s.title}</div>
        <div className="pac-signal-src">
          {s.src}
          {s.ref && (
            <a className="pac-prov" href={s.ref.url} target="_blank" rel="noopener noreferrer">
              {s.ref.nr} ↗
            </a>
          )}
        </div>
        {isAi && s.duiding ? (
          <div className="pac-signal-duiding ai">
            <span className="lbl">AI-duiding · concept</span>
            {s.duiding}
          </div>
        ) : (
          <div className="pac-duiding-empty">
            Door regels geselecteerd op relevantie. <b>Handmatige duiding nodig</b> — of zet
            AI-duiding aan in Tweaks.
          </div>
        )}
      </div>
      <div className="pac-signal-impact">
        {isAi && s.impact && <span className={`pac-impact ${s.impact}`}>{s.impactLabel}</span>}
        <div className="pac-inbox-actions">
          <button type="button" className="pac-btn pac-btn-sm" onClick={() => onConfirm(s)}>
            Bevestigen
          </button>
          <button
            type="button"
            className="pac-btn pac-btn-sm pac-btn-ghost"
            onClick={() => onDismiss(s.id)}
          >
            Negeren
          </button>
        </div>
      </div>
    </div>
  );
}

const ROW_STYLE: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'center',
  marginBottom: 6,
  flexWrap: 'wrap',
};

// Header scope phrasing (whole-sentence) — includes 'both' + every bron.
const SCOPE_LABEL: Record<string, string> = {
  both: 'alle bronnen',
  tk: 'Tweede Kamer',
  ob: 'Off. Bekendmakingen',
  eu: 'Europa',
  media: 'Nieuws & media',
};

// Short chip labels per source key ('both' = the Alle chip).
const SOURCE_CHIP_LABEL: Record<string, string> = {
  both: 'Alle',
  tk: 'Tweede Kamer',
  ob: 'Off. Bekendmakingen',
  eu: 'Europa',
  media: 'Nieuws & media',
};

function feedAge(date: string | null): string | null {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return date;
  const diffH = Math.floor((Date.now() - d.getTime()) / 3_600_000);
  if (diffH < 1) return 'nu';
  if (diffH < 24) return `${diffH} u`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return '1 dg';
  return `${diffD} dgn`;
}

/** Blanco zoekfunctie — one search band over all signaalbronnen (raw feed). */
function SignalSearch({
  inputValue,
  onInput,
  source,
  sources,
  onSource,
  onSubmit,
  onHelp,
}: {
  inputValue: string;
  onInput: (v: string) => void;
  source: FeedSource;
  sources: string[]; // searchable bronnen, data-derived (no dead options)
  onSource: (s: FeedSource) => void;
  onSubmit: () => void;
  onHelp: () => void;
}) {
  // 'Alle' first, then one chip per searchable bron.
  const chips: FeedSource[] = ['both', ...(sources as FeedSource[])];
  return (
    <div className="pac-sigsearch">
      <div className="pac-sigsearch-row">
        <span className="pac-sigsearch-ico">⌕</span>
        <input
          className={`pac-sigsearch-input ${inputValue ? 'filled' : ''}`}
          placeholder="Zoek in álle signaalbronnen — moties, Kamervragen, brieven, publicaties…"
          value={inputValue}
          onChange={(e) => onInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSubmit();
          }}
        />
        <button type="button" className="pac-btn" onClick={onSubmit}>
          Zoek
        </button>
        <button
          type="button"
          className="pac-help"
          title="Hoe werkt de curatiepijplijn?"
          aria-label="Hoe werkt de curatiepijplijn?"
          onClick={onHelp}
        >
          ?
        </button>
      </div>
      <div className="pac-sigsearch-meta">
        <span className="pac-sigsearch-scope">
          <span className="lbl">Bronnen</span>
          {chips.map((s) => (
            <button
              key={s}
              type="button"
              className={`pac-chip ${source === s ? 'active' : ''}`}
              onClick={() => onSource(s)}
            >
              {SOURCE_CHIP_LABEL[s] ?? s}
            </button>
          ))}
        </span>
        <span className="pac-sigsearch-hint">
          blanco · doorzoekt de rauwe bronfeeds, los van de curatie
        </span>
      </div>
    </div>
  );
}

/**
 * Mijn zoekopdrachten — the home for personal (user-scope) saved searches.
 * Click a chip to re-run it, ↗ team to promote it to a tenant bron (feeds the
 * curation cron), ✕ to delete. Hidden when the user has no saved searches.
 */
function SavedSearchStrip({
  searches,
  onRun,
  onPromote,
  onDelete,
}: {
  searches: SavedSearch[];
  onRun: (ss: SavedSearch) => void;
  onPromote: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (!searches.length) return null;
  return (
    <div className="pac-savedrow">
      <span className="lbl">Mijn zoekopdrachten</span>
      {searches.map((ss) => (
        <span className="pac-savedchip" key={ss.id}>
          <button
            type="button"
            className="pac-savedchip-run"
            title="Opnieuw zoeken"
            onClick={() => onRun(ss)}
          >
            ⌥ {ss.query.q}
          </button>
          <button
            type="button"
            className="promo"
            title="Stel voor als teambron"
            onClick={() => onPromote(ss.id)}
          >
            ↗ team
          </button>
          <button type="button" className="x" title="Verwijderen" onClick={() => onDelete(ss.id)}>
            ✕
          </button>
        </span>
      ))}
    </div>
  );
}

/** A single raw feed hit — visibly uncurated: source key, no rel, no duiding. */
function RawHitCard({
  item,
  done,
  onPromote,
  onHelp,
}: {
  item: FeedItem;
  done: boolean;
  onPromote: (item: FeedItem) => void;
  onHelp: () => void;
}) {
  const age = feedAge(item.date);
  return (
    <div className="pac-signal pac-signal-raw">
      <div className="pac-signal-rel">
        <div className={`pac-raw-src ${item.source}`}>{item.source.toUpperCase()}</div>
        <div className="pac-signal-rel-lbl">bron</div>
      </div>
      <div className="pac-signal-body">
        <div style={ROW_STYLE}>
          <BronBadge bron={item.source} />
          {item.type && (
            <span className={`pac-tag ${item.source === 'ob' ? 'regio' : ''}`}>{item.type}</span>
          )}
        </div>
        <div className="pac-signal-title">{item.title}</div>
        <div className="pac-signal-src">
          {BRON_LABEL[item.source] ?? item.source}
          {item.type ? ` · ${item.type}` : ''}
          {age ? ` · ${age}` : ''}
          {item.url && (
            <a className="pac-prov" href={item.url} target="_blank" rel="noopener noreferrer">
              {item.number ?? item.id} ↗
            </a>
          )}
        </div>
      </div>
      <div className="pac-signal-impact">
        {done ? (
          <button type="button" className="pac-btn pac-btn-sm done" disabled>
            In inbox ✓
          </button>
        ) : (
          <div className="pac-inbox-actions">
            <button type="button" className="pac-btn pac-btn-sm" onClick={() => onPromote(item)}>
              Naar inbox
            </button>
            <button
              type="button"
              className="pac-help sm"
              title="Wat gebeurt er bij Naar inbox?"
              aria-label="Wat gebeurt er bij Naar inbox?"
              onClick={onHelp}
            >
              ?
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Monitoring({ activeTab = 'politiek', onOpenDossier, onNavigate }: Props) {
  const { confirmSignal, linkSignalDossier, dossiers, updateInboxCount } = usePaData();
  const tab = MONITORING_TABS.find((t) => t.id === activeTab) ?? MONITORING_TABS[0];

  const [view, setView] = useState<'gecureerd' | 'inbox'>('gecureerd');
  const [signals, setSignals] = useState<Signal[]>([]);
  const [inbox, setInbox] = useState<Signal[]>([]);
  const [inboxMeta, setInboxMeta] = useState<InboxMeta | null>(null);
  const inboxCountRef = useRef(0);
  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(new Set());
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [orphanOnly, setOrphanOnly] = useState(false);
  const [loading, setLoading] = useState(true);

  // ── Blanco zoekfunctie (cross-source raw search) ──────────────────
  const [searchInput, setSearchInput] = useState('');
  const [feedQuery, setFeedQuery] = useState(''); // committed query ('' = inactive)
  const [feedSource, setFeedSource] = useState<FeedSource>('both');
  const [feedSources, setFeedSources] = useState<string[]>(['tk', 'ob', 'media']); // searchable bronnen
  const [feedResults, setFeedResults] = useState<FeedItem[] | null>(null);
  const [feedTotal, setFeedTotal] = useState<number | null>(null);
  const [feedLoading, setFeedLoading] = useState(false);
  const [promotedKeys, setPromotedKeys] = useState<Set<string>>(new Set());
  const [savedSearch, setSavedSearch] = useState(false);
  const [mySearches, setMySearches] = useState<SavedSearch[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [pipelineOpen, setPipelineOpen] = useState(false);
  const openPipeline = () => setPipelineOpen(true);

  const load = useCallback(async () => {
    setLoading(true);
    setOrphanOnly(false);
    const [sigs, inb] = await Promise.all([
      fetchSignals({ tab: tab.id }),
      fetchInbox({ tab: tab.id }),
    ]);
    setSignals(sigs);
    setInbox(inb.data);
    setInboxMeta(inb.meta);
    inboxCountRef.current = inb.meta.total;
    setLoading(false);
    updateInboxCount(tab.id, inb.meta.total);
  }, [tab.id, updateInboxCount]);

  useEffect(() => {
    void load();
  }, [load]);

  // Refreshable list of the current user's personal saved searches.
  const loadMySearches = useCallback(async () => {
    try {
      const all = await fetchSearches();
      setMySearches(all.filter((s) => s.scope === 'user'));
    } catch {
      setMySearches([]);
    }
  }, []);

  // Load searchable feed sources + the saved-search strip once.
  useEffect(() => {
    void fetchFeedSources().then(setFeedSources);
    void loadMySearches();
  }, [loadMySearches]);

  // Reset view + any active search when tab changes
  useEffect(() => {
    setView('gecureerd');
    setSearchInput('');
    setFeedQuery('');
    setFeedResults(null);
    setFeedTotal(null);
    setFeedSource('both');
    setSavedSearch(false);
  }, [tab.id]);

  const runSearch = async (q: string, source: FeedSource = feedSource) => {
    const query = q.trim();
    setFeedQuery(query);
    setSavedSearch(false);
    if (!query) {
      setFeedResults(null);
      setFeedTotal(null);
      return;
    }
    setFeedLoading(true);
    try {
      const { items, total } = await fetchFeed({ q: query, source, top: 30 });
      setFeedResults(items);
      setFeedTotal(total);
    } catch {
      setFeedResults([]);
      setFeedTotal(0);
    }
    setFeedLoading(false);
  };

  const handleScope = (source: FeedSource) => {
    setFeedSource(source);
    if (feedQuery) void runSearch(feedQuery, source);
  };

  const clearSearch = () => {
    setSearchInput('');
    setFeedQuery('');
    setFeedResults(null);
    setFeedTotal(null);
    setSavedSearch(false);
  };

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3200);
  };

  const handleSaveSearch = async () => {
    const source = feedSource === 'both' ? feedSources : [feedSource];
    try {
      await createSavedSearch({ q: feedQuery, source });
      setSavedSearch(true);
      await loadMySearches(); // the save has a home: refresh the strip
    } catch {
      // ignore — leave button in default state
    }
  };

  // Re-run a saved search: honour its stored source scope where it maps cleanly.
  const runSavedSearch = (ss: SavedSearch) => {
    const src: FeedSource =
      ss.query.source?.length === 1 ? (ss.query.source[0] as FeedSource) : 'both';
    setSearchInput(ss.query.q);
    setFeedSource(src);
    void runSearch(ss.query.q, src);
  };

  const handleDeleteSaved = async (id: string) => {
    try {
      await deleteSavedSearch(id);
      await loadMySearches();
    } catch {
      // ignore
    }
  };

  const handlePromoteSaved = async (id: string) => {
    try {
      await promoteSearchToTenant(id);
      await loadMySearches(); // now tenant-scoped → leaves the personal strip
      showToast('Voorgesteld als teambron');
    } catch {
      // ignore
    }
  };

  const handlePromote = async (item: FeedItem) => {
    const key = `${item.source}:${item.id}`;
    try {
      const sig = await promoteToInbox(item);
      if (sig.status === 'confirmed') {
        showToast('Staat al in Gecureerd');
        // Do not mark as "In Inbox" — it's in Gecureerd, not inbox.
      } else {
        setPromotedKeys((prev) => new Set([...prev, key]));
        showToast(`Toegevoegd aan inbox · ${signalTagLabel(sig.tab)}`);
        if (sig.tab === tab.id) {
          // Check isNew synchronously against the current closure — functional-update
          // callbacks run asynchronously and cannot set outer variables reliably.
          const isNew = !inbox.some((s) => s.id === sig.id);
          setInbox((prev) => (prev.some((s) => s.id === sig.id) ? prev : [sig, ...prev]));
          if (isNew) {
            inboxCountRef.current += 1;
            updateInboxCount(tab.id, inboxCountRef.current);
          }
        } else {
          // Promoted to a different tab — fetch that tab's updated count.
          const inb = await fetchInbox({ tab: sig.tab });
          updateInboxCount(sig.tab, inb.meta.total);
        }
      }
    } catch {
      // leave the button actionable so the user can retry
    }
  };

  const dossierNaam = (id: string | null) => {
    if (!id) return '';
    return dossiers.data.find((d) => d.id === id)?.naam ?? id;
  };

  const handleConfirm = async (s: Signal) => {
    try {
      const patch = s.aiDraft
        ? {
            duiding: s.aiDraft.duiding ?? undefined,
            impact: (s.aiDraft.impact as Signal['impact']) ?? undefined,
            impactLabel: s.aiDraft.impactLabel ?? undefined,
            rel: s.aiDraft.rel ?? undefined,
          }
        : undefined;
      const confirmed = await confirmSignal(s.id, patch);
      setConfirmedIds((prev) => new Set([...prev, s.id]));
      setSignals((prev) => [...prev, confirmed].sort((a, b) => b.rel - a.rel));
      inboxCountRef.current = Math.max(0, inboxCountRef.current - 1);
      updateInboxCount(tab.id, inboxCountRef.current);
    } catch {
      // keep item in inbox on error
    }
  };

  const handleDismiss = (id: string) => {
    setDismissedIds((prev) => new Set([...prev, id]));
    inboxCountRef.current = Math.max(0, inboxCountRef.current - 1);
    updateInboxCount(tab.id, inboxCountRef.current);
  };

  const handleLinkDossier = async (id: string, dossierId: string) => {
    try {
      const updated = await linkSignalDossier(id, dossierId);
      setSignals((prev) => {
        const next = prev.map((s) => (s.id === id ? updated : s));
        if (!next.some((s) => s.routing === 'watchlist')) setOrphanOnly(false);
        return next;
      });
      showToast(`Gekoppeld aan ${dossierNaam(dossierId)}`);
    } catch {
      showToast('Koppelen mislukt — herstart de server en probeer opnieuw');
    }
  };

  const visibleInbox = inbox.filter((s) => !confirmedIds.has(s.id) && !dismissedIds.has(s.id));

  return (
    <div>
      <div className="pac-crumb">Monitoring · {tab.label}</div>
      <div className="pac-page-head" style={{ marginBottom: 14 }}>
        <div>
          <h1 className="pac-page-title">{tab.label}</h1>
          <p className="pac-page-sub">
            Gecureerde signalen — geselecteerd op PA-relevantie, met duiding en mogelijke impact op
            kans of risico. Geen ruis, alleen wat ertoe doet.
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
          <span className="pac-coverage">bron: {paTabBronnen(tab.id).join(' · ')}</span>
        </div>
      </div>

      {/* Media & omgeving — honest sub-source coverage note */}
      {tab.id === 'media' && (
        <div className="pac-media-note">
          <b>Nieuws</b> (landelijk + regionaal) is live via de nieuws-aggregator, regio-gescoopt op
          Flevoland (<span className="mono">GET /search · regio=Flevoland</span>).{' '}
          <b>Sociale media &amp; omgeving</b> volgt als tweede subbron.
        </div>
      )}

      <div className="pac-seg" role="tablist">
        <button
          type="button"
          className={`pac-seg-btn ${view === 'gecureerd' ? 'active' : ''}`}
          onClick={() => {
            setView('gecureerd');
            clearSearch();
          }}
        >
          Gecureerd <span className="pac-seg-count">{signals.length}</span>
        </button>
        <button
          type="button"
          className={`pac-seg-btn ${view === 'inbox' ? 'active' : ''}`}
          onClick={() => {
            setView('inbox');
            clearSearch();
          }}
        >
          Inbox{' '}
          <span className="pac-seg-count">{inboxMeta?.capped ? '100+' : visibleInbox.length}</span>
        </button>
      </div>

      {/* Blanco zoekfunctie — cross-source raw search, independent of the tab */}
      <>
        <SignalSearch
          inputValue={searchInput}
          onInput={setSearchInput}
          source={feedSource}
          sources={feedSources}
          onSource={handleScope}
          onSubmit={() => void runSearch(searchInput)}
          onHelp={openPipeline}
        />
        <SavedSearchStrip
          searches={mySearches}
          onRun={runSavedSearch}
          onPromote={(id) => void handlePromoteSaved(id)}
          onDelete={(id) => void handleDeleteSaved(id)}
        />
        <div className="pac-pipe-explainer">
          <button
            type="button"
            className="pac-pipe-toggle"
            aria-expanded={pipelineOpen}
            onClick={() => setPipelineOpen((o) => !o)}
          >
            <span className="chev">{pipelineOpen ? '▾' : '▸'}</span>
            <b>Hoe werkt de curatiepijplijn?</b>
            <span className="pac-pipe-sum">
              opgehaald → geregeld &amp; gescoord → AI stelt duiding voor → u bevestigt ·{' '}
              <span className="mono">AI adviseerde · mens besloot</span>
            </span>
          </button>
          {pipelineOpen && (
            <div className="pac-pipe-body">
              <CuratiePijplijnFlow />
              {onNavigate && (
                <button
                  type="button"
                  className="pac-link"
                  style={{ marginTop: 10 }}
                  onClick={() => onNavigate('beheer', 'curatie-spec')}
                >
                  Bekijk als pagina in Beheer →
                </button>
              )}
            </div>
          )}
        </div>
      </>

      {feedQuery ? (
        <>
          <div className="pac-searchres-head">
            <div className="pac-searchres-title">
              <span>Zoekresultaten</span> <q>{feedQuery}</q>
              <span className="scope">
                {' '}
                · {SCOPE_LABEL[feedSource]} ·{' '}
                {feedLoading ? '…' : (feedTotal ?? feedResults?.length ?? 0)} treffers
              </span>
            </div>
            <div className="pac-searchres-actions">
              <button
                type="button"
                className="pac-btn pac-btn-ghost pac-btn-sm"
                onClick={() => void handleSaveSearch()}
                disabled={savedSearch}
              >
                {savedSearch ? '✓ Bewaard' : '＋ Bewaar als zoekopdracht'}
              </button>
              <button type="button" className="pac-link" onClick={clearSearch}>
                Wis ✕
              </button>
            </div>
          </div>

          <div className="pac-rawnote">
            <b>Rauwe treffers</b> — direct uit de bronnen, nog niet gescoord of geduid. Zet een
            relevante treffer met <b>Naar inbox</b> in de curatiepijplijn, of bewaar de zoekopdracht
            zodat nieuwe treffers automatisch binnenkomen.
          </div>

          {feedLoading ? (
            <p className="pac-page-sub">Zoeken…</p>
          ) : feedResults && feedResults.length ? (
            <div>
              {feedResults.map((item) => (
                <RawHitCard
                  key={`${item.source}:${item.id}`}
                  item={item}
                  done={promotedKeys.has(`${item.source}:${item.id}`)}
                  onPromote={(x) => void handlePromote(x)}
                  onHelp={openPipeline}
                />
              ))}
            </div>
          ) : (
            <p className="pac-page-sub">Geen treffers voor «{feedQuery}» in de rauwe bronfeeds.</p>
          )}
        </>
      ) : loading ? (
        <p className="pac-page-sub">Signalen ophalen…</p>
      ) : view === 'inbox' ? (
        <>
          {inboxMeta?.capped && (
            <div className="pac-inbox-cap">
              <span className="pac-inbox-cap-badge">Top {inboxMeta.cap}</span>
              <span>
                {inboxMeta.total} kandidaten in deze inbox, gesorteerd op relevantie (rel,
                aflopend). De weergave toont de bovenste {inboxMeta.cap};{' '}
                {inboxMeta.total - inboxMeta.cap} met lagere relevantie vallen nu buiten beeld.
              </span>
            </div>
          )}
          {visibleInbox.length ? (
            <div className="pac-cards">
              {visibleInbox.map((s) => (
                <InboxCard
                  key={s.id}
                  s={s}
                  dossierNaam={dossierNaam}
                  onConfirm={(x) => void handleConfirm(x)}
                  onDismiss={handleDismiss}
                />
              ))}
            </div>
          ) : (
            <p className="pac-page-sub">
              Inbox leeg — alle kandidaten in deze categorie zijn afgehandeld.
            </p>
          )}
        </>
      ) : signals.length ? (
        <>
          {(() => {
            const watchlistCount = signals.filter((s) => s.routing === 'watchlist').length;
            const shown = orphanOnly ? signals.filter((s) => s.routing === 'watchlist') : signals;
            return (
              <>
                {watchlistCount > 0 && (
                  <div className="pac-orphan-filter">
                    <button
                      type="button"
                      className={`pac-orphan-fbtn ${!orphanOnly ? 'active' : ''}`}
                      onClick={() => setOrphanOnly(false)}
                    >
                      Alle
                    </button>
                    <button
                      type="button"
                      className={`pac-orphan-fbtn ${orphanOnly ? 'active' : ''}`}
                      onClick={() => setOrphanOnly(true)}
                    >
                      ⚑ Watchlist <span className="pac-orphan-fcount">{watchlistCount}</span>
                    </button>
                  </div>
                )}
                <div className="pac-cards">
                  {shown.map((s) => (
                    <SignalCard
                      key={s.id}
                      s={s}
                      onOpenDossier={onOpenDossier}
                      dossierNaam={dossierNaam}
                      justConfirmed={confirmedIds.has(s.id)}
                      dossiers={dossiers.data}
                      onLink={handleLinkDossier}
                    />
                  ))}
                </div>
              </>
            );
          })()}
        </>
      ) : (
        <p className="pac-page-sub">Geen gecureerde signalen in deze categorie vandaag.</p>
      )}

      {toast && (
        <div className="pac-toast" role="status">
          <span className="ok">✓</span>
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}
