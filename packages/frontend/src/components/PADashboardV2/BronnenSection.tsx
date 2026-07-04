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

interface BronGroep {
  tab: string;
  route: string;
  sources: BronDef[];
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
  {
    tab: 'Media & omgeving',
    route: 'media',
    sources: [
      {
        name: 'Nieuws & media · landelijk',
        provider: 'in-house aggregator · /v1/media-aggregator',
        protocol: 'REST · /search',
        bron: 'media · nieuws-nationaal',
        file: 'media.client.ts',
        flagKey: 'media',
        cadence: 'cron · 6u',
        note: 'Rijksoverheid, NOS Nieuws en NU.nl — Flevoland-scoped via de gazetteer, near-duplicates samengevoegd.',
      },
      {
        name: 'Nieuws & media · regionaal',
        provider: 'in-house aggregator · /v1/media-aggregator',
        protocol: 'REST · /search',
        bron: 'media · nieuws-regionaal',
        file: 'media.client.ts',
        flagKey: 'media',
        cadence: 'cron · 6u',
        note: 'Provincie Flevoland + Omroep Flevoland (altijd Flevoland-getagd); regio-verrijking + geo-bump. Sentiment-verrijking is fase-2 (uit in v1).',
      },
      {
        name: 'Sociale media & omgeving',
        provider: 'Tbd (gepland)',
        protocol: '—',
        bron: 'media · (gepland)',
        file: '—',
        flagKey: null,
        staticStatus: 'verwacht',
        cadence: '—',
        note: 'Aangekondigde tweede media-subbron. Nog geen connector geïmplementeerd.',
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

  const all = BRON_GROEPEN.flatMap((g) => g.sources);
  const nActief = all.filter((s) => resolveStatus(s, flags) === 'actief').length;
  const nUit = all.filter((s) => resolveStatus(s, flags) === 'uit').length;
  const nVerwacht = all.filter((s) => resolveStatus(s, flags) === 'verwacht').length;

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

      {BRON_GROEPEN.map((g) => (
        <div key={g.route} className="pac-src-group">
          <div className="pac-src-grouphead">
            <span className="pac-src-grouptab">{g.tab}</span>
            <span className="pac-src-groupcount">
              {g.sources.length} {g.sources.length === 1 ? 'bron' : 'bronnen'}
            </span>
          </div>
          <div className="pac-src-rows">
            {g.sources.map((s) => (
              <BronRow key={s.name} def={s} flags={flags} />
            ))}
          </div>
        </div>
      ))}

      <p className="pac-spec-source">
        Bron: <b>packages/backend/src/pa-monitoring/sources/</b>. Vlaggen &amp; standaardwaarden uit{' '}
        <b>config.ts</b>. Statussen zijn live — afkomstig van <code>GET /v1/pa/sources/status</code>
        .
      </p>
    </div>
  );
}
