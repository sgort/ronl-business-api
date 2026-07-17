import { useState, useEffect } from 'react';
import { fetchSourcesStatus, type SourcesStatus } from '../../services/pa.api';

type StatusValue = 'actief' | 'uit' | 'verwacht';
type FlagKey = keyof SourcesStatus;

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

// C2 — Media & omgeving replaced with per-feed registry (mirrors feeds.ts)
const MEDIA_GROUP: BronGroep = {
  tab: 'Media & omgeving',
  route: 'media',
  intro:
    'Eén connector — de in-house aggregator (media.client.ts → /v1/media-aggregator) — bundelt onderstaande RSS-feeds tot de bron media. Feeds staan in feeds.ts; coverage uitbreiden = één regel toevoegen. Near-duplicates worden samengevoegd; sentiment-verrijking is fase-2 (uit in v1).',
  subgroups: [
    {
      label: 'Regionaal',
      sub: 'altijd Flevoland-getagd',
      bron: 'media · nieuws-regionaal',
      feeds: [
        {
          name: 'Provincie Flevoland',
          homepage: 'flevoland.nl',
          url: 'https://www.flevoland.nl/Content/Pages/Loket?rss=news',
          alwaysFlevoland: true,
          note: 'Provinciale berichten. Bewezen feed elders in deze backend.',
        },
        {
          name: 'Omroep Flevoland',
          homepage: 'omroepflevoland.nl',
          url: 'https://www.omroepflevoland.nl/RSS/',
          alwaysFlevoland: true,
          categoryFilter: 'Nieuws',
          note: 'Regionale omroep — alleen de categorie "Nieuws".',
        },
      ],
    },
    {
      label: 'Landelijk',
      sub: 'Flevoland-scoped via de gazetteer',
      bron: 'media · nieuws-nationaal',
      feeds: [
        {
          name: 'Rijksoverheid',
          homepage: 'rijksoverheid.nl',
          url: 'https://www.rijksoverheid.nl/api/rss',
          note: 'Rijksnieuws, gefilterd op newsDocument. Bewezen feed elders in deze backend.',
        },
        {
          name: 'NOS Nieuws',
          homepage: 'nos.nl',
          url: 'https://feeds.nos.nl/nosnieuwsalgemeen',
          note: 'Landelijk algemeen nieuws.',
        },
        {
          name: 'NU.nl',
          homepage: 'nu.nl',
          url: 'https://www.nu.nl/rss/Algemeen',
          note: 'Landelijk algemeen nieuws.',
        },
        {
          name: 'RTL Nieuws',
          homepage: 'rtl.nl',
          url: 'https://www.rtl.nl/rss.xml',
          note: 'Landelijk algemeen nieuws.',
        },
      ],
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
        provider: 'europarl.europa.eu/rss',
        protocol: 'RSS · CC BY 4.0',
        bron: 'eu · ep-rss',
        file: 'eu.client.ts',
        flagKey: 'eu',
        cadence: 'cron · 6u',
        note: 'Titeldragende plenaire feed + persberichten, met NL-termexpansie.',
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
  MEDIA_GROUP,
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

  // C4a — summary counts include feed rows
  const statuses = BRON_GROEPEN.flatMap((g) => groupStatuses(g, flags));
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
      {BRON_GROEPEN.map((g) => {
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
