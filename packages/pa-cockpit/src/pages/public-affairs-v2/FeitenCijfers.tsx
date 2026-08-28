import { useState } from 'react';
import { usePaData } from './PaDataProvider';
import {
  FEITEN_THEMAS,
  FEITEN_MONITOREN,
  FEITEN_HUB,
  type FeitMonitor,
  type FeitThemaKey,
} from './feiten.data';
import type { PaModeId } from './modes.config';

const ICON_BASE = '/pa/feiten-icons/';

interface MonitorIconProps {
  m: FeitMonitor;
  size?: number;
}

export function MonitorIcon({ m, size = 22 }: MonitorIconProps) {
  return (
    <img
      className="pac-feit-img"
      src={ICON_BASE + m.icon}
      alt=""
      aria-hidden="true"
      loading="lazy"
      style={{ width: size, height: size }}
    />
  );
}

function FeitThemaBadge({ thema }: { thema: FeitThemaKey }) {
  const t = FEITEN_THEMAS.find((x) => x.key === thema) ?? FEITEN_THEMAS[0];
  return <span className="pac-feit-thema">{t.label}</span>;
}

interface FeitCardProps {
  m: FeitMonitor;
  onOpenDossier: (id: string) => void;
  dossierNaam: (id: string) => string;
}

function FeitCard({ m, onOpenDossier, dossierNaam }: FeitCardProps) {
  const href = m.url || FEITEN_HUB;
  let host = 'feitelijkflevoland.nl';
  try {
    host = new URL(href).hostname.replace(/^www\./, '');
  } catch (_) {
    /* invalid URL — keep default host */
  }

  return (
    <div className="pac-feit">
      <div className="pac-feit-top">
        <span className="pac-feit-ico">
          <MonitorIcon m={m} size={26} />
        </span>
        <FeitThemaBadge thema={m.thema} />
        <span className="pac-feit-jaar">{m.bijgewerkt}</span>
      </div>
      <h3 className="pac-feit-name">{m.naam}</h3>
      <p className="pac-feit-desc">{m.desc}</p>
      <div className="pac-feit-foot">
        {m.dossiers.length > 0 ? (
          <div className="pac-feit-dossiers">
            <span className="pac-feit-dlbl">Onderbouwt</span>
            {m.dossiers.map((id) => (
              <button
                type="button"
                key={id}
                className="pac-feit-dchip"
                onClick={() => onOpenDossier(id)}
                title={`Naar dossier · ${dossierNaam(id)}`}
              >
                {dossierNaam(id)}
              </button>
            ))}
          </div>
        ) : (
          <span className="pac-feit-dlbl pac-feit-dlbl-none">Algemene context</span>
        )}
        <a
          className="pac-feit-open"
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open ${m.naam} op ${host} (opent in een nieuw tabblad)`}
        >
          Open monitor <span aria-hidden="true">↗</span>
        </a>
      </div>
    </div>
  );
}

interface FeitenViewProps {
  onOpenDossier: (id: string) => void;
}

export function FeitenView({ onOpenDossier }: FeitenViewProps) {
  const [q, setQ] = useState('');
  const [thema, setThema] = useState<FeitThemaKey | 'alle'>('alle');
  const { dossiers } = usePaData();

  const dossierNaam = (id: string) => dossiers.data.find((d) => d.id === id)?.naam ?? id;

  const term = q.trim().toLowerCase();
  const shown = FEITEN_MONITOREN.filter((m) => {
    if (thema !== 'alle' && m.thema !== thema) return false;
    if (!term) return true;
    const hay = (m.naam + ' ' + m.desc + ' ' + m.dossiers.map(dossierNaam).join(' ')).toLowerCase();
    return hay.includes(term);
  });

  const THEMA_CHIPS = [
    { key: 'alle' as const, label: "Alle thema's", n: FEITEN_MONITOREN.length },
    ...FEITEN_THEMAS.map((t) => ({
      key: t.key,
      label: t.label,
      n: FEITEN_MONITOREN.filter((m) => m.thema === t.key).length,
    })),
  ];

  return (
    <div>
      <div className="pac-crumb">Monitoring · Feiten &amp; cijfers</div>
      <div className="pac-page-head" style={{ marginBottom: 14 }}>
        <div>
          <h1 className="pac-page-title">Feiten &amp; cijfers</h1>
          <p className="pac-page-sub">
            De provinciale monitoren van <b>Feitelijk Flevoland</b> — de feitelijke onderlegger bij
            uw dossiers. Gebruik ze om een standpunt te onderbouwen: koppel de cijfers achter een
            opgave aan het dossier waar ze spelen.
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
          <span className="pac-coverage">bron: Feitelijk Flevoland</span>
        </div>
      </div>

      <div className="pac-media-note pac-feit-note">
        <b>Achtergrond, geen signaal</b> · deze cijfers worden niet gecureerd of gescoord — het is
        de feitenbasis van de provincie (
        <span className="mono">provincie Flevoland · feitelijkflevoland.nl</span>). De monitoren
        openen op de bronsite; de dossierkoppelingen brengen u terug naar het bijbehorende
        PA-dossier.
      </div>

      <div className="pac-sigsearch pac-feit-search">
        <div className="pac-sigsearch-row">
          <span className="pac-sigsearch-ico" aria-hidden="true">
            ⌕
          </span>
          <input
            className={`pac-sigsearch-input ${q ? 'filled' : ''}`}
            placeholder="Zoek een monitor — thema, onderwerp of dossier…"
            aria-label="Zoek in de provinciale monitoren"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {q && (
            <button
              type="button"
              className="pac-link"
              onClick={() => setQ('')}
              style={{ whiteSpace: 'nowrap' }}
            >
              Wis ✕
            </button>
          )}
        </div>
      </div>

      <div className="pac-feit-filters" role="group" aria-label="Filter op thema">
        {THEMA_CHIPS.map((c) => (
          <button
            key={c.key}
            type="button"
            className={`pac-feit-chip ${thema === c.key ? 'active' : ''}`}
            aria-pressed={thema === c.key}
            onClick={() => setThema(c.key)}
          >
            {c.key !== 'alle' && (
              <span
                className="pac-feit-cdot"
                style={{ background: FEITEN_THEMAS.find((t) => t.key === c.key)?.kleur }}
                aria-hidden="true"
              />
            )}
            {c.label}
            <span className="pac-feit-chip-n">{c.n}</span>
          </button>
        ))}
      </div>

      <div className="pac-feit-count">
        {shown.length} van {FEITEN_MONITOREN.length} monitoren
      </div>

      {shown.length ? (
        <div className="pac-feiten-grid">
          {shown.map((m) => (
            <FeitCard key={m.naam} m={m} onOpenDossier={onOpenDossier} dossierNaam={dossierNaam} />
          ))}
        </div>
      ) : (
        <p className="pac-page-sub">
          Geen monitor gevonden voor &ldquo;{q}&rdquo;. Probeer een andere term of thema.
        </p>
      )}

      <div className="pac-feit-cta">
        <a
          href={FEITEN_HUB}
          target="_blank"
          rel="noopener noreferrer"
          className="pac-feit-cta-link"
          aria-label="Bekijk alle monitoren op feitelijkflevoland.nl (opent in een nieuw tabblad)"
        >
          Alle monitoren op feitelijkflevoland.nl <span aria-hidden="true">↗</span>
        </a>
        <span className="pac-feit-cta-note">
          Feitelijk Flevoland onderhoudt momenteel 14 monitoren.
        </span>
      </div>
    </div>
  );
}

interface DossierFeitenStripProps {
  dossierId: string;
  onNavigate?: (mode: PaModeId, sectionId: string) => void;
}

export function DossierFeitenStrip({ dossierId, onNavigate }: DossierFeitenStripProps) {
  const rel = FEITEN_MONITOREN.filter((m) => m.dossiers.includes(dossierId));
  if (!rel.length) return null;

  return (
    <div className="pac-feit-strip">
      <div className="pac-feit-strip-eyebrow">Onderbouw met feiten</div>
      <ul className="pac-feit-strip-list">
        {rel.map((m) => (
          <li key={m.naam}>
            <a
              className="pac-feit-strip-item"
              href={m.url || FEITEN_HUB}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open ${m.naam} in een nieuw tabblad`}
            >
              <span className="pac-feit-strip-ico">
                <MonitorIcon m={m} size={18} />
              </span>
              <span className="pac-feit-strip-name">{m.naam}</span>
              <span className="pac-feit-strip-arrow" aria-hidden="true">
                ↗
              </span>
            </a>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="pac-feit-strip-all"
        onClick={() => onNavigate?.('monitoring', 'feiten')}
      >
        Alle feiten &amp; cijfers →
      </button>
    </div>
  );
}
