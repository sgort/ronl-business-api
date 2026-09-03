import { useState, useEffect } from 'react';
import {
  fetchSourcesStatus,
  fetchFeedToken,
  type SourcesStatus,
  type SourcesStatusFeed,
} from '../../services/pa.api';

type StatusValue = 'actief' | 'uit' | 'verwacht';
type FlagKey = Exclude<keyof SourcesStatus, 'feeds'>;

interface BronDef {
  name: string;
  provider: string;
  protocol: string;
  bron: string;
  file: string;
  flagKey: FlagKey | null;
  staticStatus?: 'verwacht';
  cadence: string;
  note: string;
}

// C1 — extended group model
interface FeedDef {
  name: string;
  homepage: string;
  url: string | null;
  alwaysFlevoland?: boolean;
  categoryFilter?: string;
  note: string;
}

interface FeedSubgroup {
  label: string;
  sub: string;
  bron: string;
  planned?: boolean;
  feeds: FeedDef[];
}

interface BronGroep {
  tab: string;
  route: string;
  intro?: string;
  sources?: BronDef[];
  subgroups?: FeedSubgroup[];
}

// C2 — Media & omgeving: Regionaal/Landelijk subgroups are built from the live
// feed list in GET /v1/pa/sources/status (which itself reads media-aggregator's
// feeds.ts) instead of a hand-maintained copy — adding a feed there now needs no
// change here. Only the curatorial one-liners below and the Sociaal placeholder
// (no backing FeedSource yet) stay local.
const FEED_NOTES: Record<string, string> = {
  'provincie-flevoland': 'Provinciale berichten. Bewezen feed elders in deze backend.',
  'omroep-flevoland': 'Regionale omroep — alleen de categorie "Nieuws".',
  rijksoverheid: 'Rijksnieuws, gefilterd op newsDocument. Bewezen feed elders in deze backend.',
  'nos-algemeen': 'Landelijk algemeen nieuws.',
  'nu-algemeen': 'Landelijk algemeen nieuws.',
  'rtl-nieuws': 'Landelijk algemeen nieuws.',
};

function toFeedDef(f: SourcesStatusFeed): FeedDef {
  return {
    name: f.name,
    homepage: f.homepage,
    url: f.url,
    alwaysFlevoland: f.alwaysFlevoland || undefined,
    categoryFilter: f.categoryFilter ?? undefined,
    note: FEED_NOTES[f.id] ?? '',
  };
}

function buildMediaGroup(feeds: SourcesStatusFeed[]): BronGroep {
  return {
    tab: 'Media & omgeving',
    route: 'media',
    intro:
      'Eén connector — de in-house aggregator (media.client.ts → /v1/media-aggregator) — bundelt onderstaande RSS-feeds tot de bron media. Feeds staan in feeds.ts; coverage uitbreiden = één regel toevoegen. Near-duplicates worden samengevoegd; sentiment-verrijking is fase-2 (uit in v1).',
    subgroups: [
      {
        label: 'Regionaal',
        sub: 'altijd Flevoland-getagd',
        bron: 'media · nieuws-regionaal',
        feeds: feeds.filter((f) => f.type === 'regional').map(toFeedDef),
      },
      {
        label: 'Landelijk',
        sub: 'Flevoland-scoped via de gazetteer',
        bron: 'media · nieuws-nationaal',
        feeds: feeds.filter((f) => f.type === 'national').map(toFeedDef),
      },
      {
        label: 'Sociaal',
        sub: 'gepland — nog geen connector',
        bron: 'media · (gepland)',
        planned: true,
        feeds: [
          {
            name: 'Sociale media & omgeving',
            homepage: 'Tbd (gepland)',
            url: null,
            note: 'Aangekondigde tweede media-subbron. Nog geen connector geïmplementeerd.',
          },
        ],
      },
    ],
  };
}

const BRON_GROEPEN: BronGroep[] = [
  {
    tab: 'Politiek · NL',
    route: 'politiek',
    sources: [
      {
        name: 'Tweede Kamer',
        provider: 'tweedekamer.nl',
        protocol: 'OData v5',
        bron: 'tk',
        file: 'tk.client.ts',
        flagKey: null,
        cadence: 'cron · 6u',
        note: 'Kamerstukken, moties, kamervragen, brieven en verslagen.',
      },
      {
        name: 'Tweede Kamer · agenda',
        provider: '/Activiteit',
        protocol: 'OData v5',
        bron: 'agenda',
        file: 'agenda.client.ts',
        flagKey: null,
        cadence: 'bij openen',
        note: 'Plenair, vragenuur en commissies — voedt de Agenda-tab, niet de curatie.',
      },
    ],
  },
  {
    tab: 'Regionaal',
    route: 'regionaal',
    sources: [
      {
        name: 'Officiële Bekendmakingen',
        provider: 'zoek.officielebekendmakingen.nl',
        protocol: 'SRU · CQL',
        bron: 'ob',
        file: 'ob.client.ts',
        flagKey: null,
        cadence: 'cron · 6u',
        note: 'Provinciale en gemeentelijke publicaties, gefilterd op jaargang.',
      },
    ],
  },
  {
    tab: 'Europa · EU',
    route: 'europa',
    sources: [
      {
        name: 'Europees Parlement · plenaire documenten',
        provider: 'data.europarl.europa.eu/api/v2',
        protocol: 'Atom · CC BY 4.0',
        bron: 'eu · ep-rss',
        file: 'eu.client.ts',
        flagKey: 'eu',
        cadence: 'cron · 6u',
        note: 'Plenaire documenten (Engelstalig) met NL-termexpansie.',
      },
      {
        name: 'Europees Parlement · Ingediende teksten',
        provider: 'europarl.europa.eu/plenary',
        protocol: 'HTML-scrape · Cheerio',
        bron: 'eu · ep-teksten',
        file: 'ep-texts-submitted.client.ts',
        flagKey: 'epTeksten',
        cadence: 'poll · 6u',
        note: 'Verslagen + moties (beide tabs), met commissiecode. Wint van RSS in de dedup.',
      },
    ],
  },
];

const BRON_STATUS_LABEL: Record<StatusValue, string> = {
  actief: 'Actief',
  uit: 'Uitgeschakeld',
  verwacht: 'Verwacht',
};

const BRON_STATUS_DOT: Record<StatusValue, string> = {
  actief: 'ok',
  uit: 'off',
  verwacht: 'plan',
};

function resolveStatus(def: BronDef, flags: SourcesStatus): StatusValue {
  if (def.staticStatus === 'verwacht') return 'verwacht';
  if (def.flagKey === null) return 'actief';
  return flags[def.flagKey] ? 'actief' : 'uit';
}

function resolveFlag(def: BronDef, flags: SourcesStatus): { label: string; on: boolean } | null {
  if (!def.flagKey) return null;
  const on = flags[def.flagKey];
  const envName: Record<FlagKey, string> = {
    tk: '',
    ob: '',
    eu: 'EU_SOURCE_ENABLED',
    epTeksten: 'EP_TEXTS_SUBMITTED_ENABLED',
    media: 'MEDIA_SOURCE_ENABLED',
  };
  return { label: envName[def.flagKey], on };
}

// C4a — counts feed rows in subgroup-based groups
function groupStatuses(g: BronGroep, flags: SourcesStatus): StatusValue[] {
  if (g.sources) return g.sources.map((s) => resolveStatus(s, flags));
  return (g.subgroups ?? []).flatMap((sg) =>
    sg.feeds.map<StatusValue>(() => (sg.planned ? 'verwacht' : flags.media ? 'actief' : 'uit'))
  );
}

interface BronRowProps {
  def: BronDef;
  flags: SourcesStatus;
}

function BronRow({ def, flags }: BronRowProps) {
  const status = resolveStatus(def, flags);
  const dot = BRON_STATUS_DOT[status];
  const label = BRON_STATUS_LABEL[status];
  const flag = resolveFlag(def, flags);

  return (
    <div className={`pac-src-row status-${status}`}>
      <div className="pac-src-status">
        <span className={`pac-src-dot ${dot}`} />
        {label}
      </div>
      <div className="pac-src-main">
        <div className="pac-src-name">{def.name}</div>
        <div className="pac-src-note">{def.note}</div>
        <div className="pac-src-meta">
          <span className="pac-src-key">{def.bron}</span>
          <span className="pac-src-sep">·</span>
          <span>{def.provider}</span>
          {def.file !== '—' && (
            <>
              <span className="pac-src-sep">·</span>
              <span className="pac-src-file">{def.file}</span>
            </>
          )}
        </div>
      </div>
      <div className="pac-src-tag">{def.protocol}</div>
      <div className="pac-src-flag">
        {flag ? (
          <span className={`pac-src-env ${flag.on ? 'on' : 'off'}`}>
            {flag.label} = {flag.on ? 'true' : 'false'}
          </span>
        ) : def.staticStatus === 'verwacht' ? (
          <span className="pac-src-env plan">geen connector</span>
        ) : (
          <span className="pac-src-env core">kernbron</span>
        )}
      </div>
      <div className="pac-src-cadence">{def.cadence}</div>
    </div>
  );
}

// C3 — feed row for per-RSS-feed display in Media & omgeving
function FeedRow({ f, sg, flags }: { f: FeedDef; sg: FeedSubgroup; flags: SourcesStatus }) {
  const status: StatusValue = sg.planned ? 'verwacht' : flags.media ? 'actief' : 'uit';
  const dot = BRON_STATUS_DOT[status];
  const label = BRON_STATUS_LABEL[status];

  return (
    <div className={`pac-src-row pac-src-row--feed status-${status}`}>
      <div className="pac-src-status">
        <span className={`pac-src-dot ${dot}`} />
        {label}
      </div>
      <div className="pac-src-main">
        <div className="pac-src-name">{f.name}</div>
        <div className="pac-src-note">{f.note}</div>
        <div className="pac-src-meta">
          <span className="pac-src-key">{sg.bron}</span>
          <span className="pac-src-sep">·</span>
          <span>{f.homepage}</span>
          {f.url && (
            <>
              <span className="pac-src-sep">·</span>
              <span className="pac-src-file">{f.url}</span>
            </>
          )}
        </div>
      </div>
      <div className="pac-src-aux">
        {f.alwaysFlevoland && <span className="pac-src-flag-fl">altijd Flevoland</span>}
        {f.categoryFilter && <span className="pac-src-tag">categorie: {f.categoryFilter}</span>}
        <span className="pac-src-tag">{sg.planned ? '—' : 'RSS'}</span>
        {sg.planned ? (
          <span className="pac-src-env plan">geen connector</span>
        ) : (
          <span className={`pac-src-env ${flags.media ? 'on' : 'off'}`}>
            MEDIA_SOURCE_ENABLED = {flags.media ? 'true' : 'false'}
          </span>
        )}
        <span className="pac-src-cadence">{sg.planned ? '—' : 'cron · 6u'}</span>
      </div>
    </div>
  );
}

// Personal RSS export of confirmed signals — "one query, two renderers" alongside
// the JSON GET /pa/signals. Token minted lazily on first click, not on mount.
function PersonalFeedLink() {
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    const res = await fetchFeedToken();
    setUrl(res.url);
  };

  const copy = async () => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="pac-feed-link">
      {url ? (
        <>
          <code className="pac-feed-url">{url}</code>
          <button type="button" className="pac-link" onClick={() => void copy()}>
            {copied ? '✓ Gekopieerd' : 'Kopieer'}
          </button>
        </>
      ) : (
        <button type="button" className="pac-link" onClick={() => void load()}>
          Persoonlijke RSS-feed ophalen →
        </button>
      )}
    </div>
  );
}

export default function BronnenSection() {
  const [flags, setFlags] = useState<SourcesStatus | null>(null);

  useEffect(() => {
    void fetchSourcesStatus().then(setFlags);
  }, []);

  if (!flags) {
    return (
      <div className="pac-beheer pac-src">
        <div className="pac-spec-eyebrow">Monitoring · bronnen</div>
        <h1 className="pac-beheer-title">Signaalbronnen</h1>
        <p style={{ color: 'var(--pac-ink-3)', fontSize: 14 }}>Laden…</p>
      </div>
    );
  }

  const bronGroepen = [...BRON_GROEPEN, buildMediaGroup(flags.feeds)];

  // C4a — summary counts include feed rows
  const statuses = bronGroepen.flatMap((g) => groupStatuses(g, flags));
  const nActief = statuses.filter((s) => s === 'actief').length;
  const nUit = statuses.filter((s) => s === 'uit').length;
  const nVerwacht = statuses.filter((s) => s === 'verwacht').length;

  return (
    <div className="pac-beheer pac-src">
      <div className="pac-spec-eyebrow">Monitoring · bronnen</div>
      <h1 className="pac-beheer-title">Signaalbronnen</h1>
      <p className="pac-spec-intro">
        De aangesloten connectors die de curatiepijplijn voeden — één per rij, gegroepeerd naar de
        Monitoring-tab waarin de signalen landen. In één oogopslag ziet u of een bron <b>actief</b>{' '}
        is, of hij <b>aanwezig maar uitgeschakeld</b> is, en of een{' '}
        <b>verwachte bron nog ontbreekt</b>.
      </p>
      <p className="pac-spec-intro">
        Wát elke bron ophaalt regelt u op <b>Zoekcriteria</b>; wat er daarna mee gebeurt staat op{' '}
        <b>Curatiepijplijn</b>.
      </p>
      <div className="pac-spec-intro">
        Signalen op een gevolgd dossier of gevolgde zoekcriteria (bel-icoon) landen ook in een
        persoonlijke RSS-feed — bruikbaar in een feedreader naast het meldingen-icoon in de
        werkbalk. <PersonalFeedLink />
      </div>

      <div className="pac-src-summary">
        <div className="pac-src-stat">
          <span className="pac-src-statnum ok">{nActief}</span> actief
        </div>
        <div className="pac-src-stat">
          <span className="pac-src-statnum off">{nUit}</span> uitgeschakeld
        </div>
        <div className="pac-src-stat">
          <span className="pac-src-statnum plan">{nVerwacht}</span> verwacht
        </div>
        <div className="pac-src-legend">
          <span className="pac-src-lg">
            <span className="pac-src-dot ok" /> connector aanwezig &amp; ingeschakeld
          </span>
          <span className="pac-src-lg">
            <span className="pac-src-dot off" /> aanwezig, vlag uit
          </span>
          <span className="pac-src-lg">
            <span className="pac-src-dot plan" /> nog geen connector
          </span>
        </div>
      </div>

      {/* C4b — shape-aware group renderer */}
      {bronGroepen.map((g) => {
        const count = g.sources
          ? g.sources.length
          : (g.subgroups ?? []).reduce((n, sg) => n + sg.feeds.length, 0);
        const unit = g.subgroups
          ? count === 1
            ? 'feed'
            : 'feeds'
          : count === 1
            ? 'bron'
            : 'bronnen';
        return (
          <div key={g.route} className="pac-src-group">
            <div className="pac-src-grouphead">
              <span className="pac-src-grouptab">{g.tab}</span>
              <span className="pac-src-groupcount">
                {count} {unit}
              </span>
            </div>
            {g.intro && <div className="pac-src-groupintro">{g.intro}</div>}
            {g.sources ? (
              <div className="pac-src-rows">
                {g.sources.map((s) => (
                  <BronRow key={s.name} def={s} flags={flags} />
                ))}
              </div>
            ) : (
              (g.subgroups ?? []).map((sg) => (
                <div key={sg.label} className="pac-src-sub">
                  <div className="pac-src-subhead">
                    <span className="pac-src-sublabel">{sg.label}</span>
                    <span className="pac-src-subcap">{sg.sub}</span>
                    <span className="pac-src-subcount">{sg.feeds.length}</span>
                  </div>
                  <div className="pac-src-rows">
                    {sg.feeds.map((f) => (
                      <FeedRow key={f.name} f={f} sg={sg} flags={flags} />
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        );
      })}

      <p className="pac-spec-source">
        Bron: <b>packages/backend/src/pa-monitoring/sources/</b>. Vlaggen &amp; standaardwaarden uit{' '}
        <b>config.ts</b>. Statussen zijn live — afkomstig van <code>GET /v1/pa/sources/status</code>
        .
      </p>
    </div>
  );
}
