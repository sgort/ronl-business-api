import { useMemo, useState } from 'react';
import { usePaData } from './PaDataProvider';
import type { PlenaryItem } from '@ronl/shared';

const ISMOCK = import.meta.env.VITE_PA_AGENDA_MOCK === 'true';

function formatDag(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('nl-NL', { weekday: 'short' });
}

function formatDatum(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'short',
  });
}

function AgendaItem({
  item,
  onOpenDossier,
  dossierNaam,
}: {
  item: PlenaryItem;
  onOpenDossier: (id: string) => void;
  dossierNaam: (id: string | null) => string;
}) {
  const isPast = item.status === 'uitgevoerd';
  const isCancelled = item.status === 'geannuleerd';
  const statusLabel =
    item.status === 'gepland'
      ? 'Gepland'
      : item.status === 'uitgevoerd'
        ? 'Geweest'
        : 'Geannuleerd';

  const cls = [
    'pac-ag-item',
    isPast && 'past',
    isCancelled && 'cancelled',
    item.live === 'live' && 'live',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={cls}>
      <div className="pac-ag-time">
        <span className="pac-ag-clock">{item.tijd ?? '–'}</span>
      </div>
      <div className="pac-ag-body">
        <div className="pac-ag-title">{item.titel}</div>
        <div className="pac-ag-meta">
          <span className={`pac-ag-soort ${item.soort}`}>{item.soortLabel}</span>
          {item.commissie && <span>{item.commissie}</span>}
          {item.commissie && <span className="pac-ag-dot">·</span>}
          <span className="pac-ag-nr">Activiteit {item.nummer}</span>
          {!ISMOCK && (
            <a className="pac-prov" href={item.url} target="_blank" rel="noopener noreferrer">
              tweedekamer.nl ↗
            </a>
          )}
        </div>
        {item.dossier && (
          <button
            type="button"
            className="pac-ag-match"
            onClick={() => onOpenDossier(item.dossier!)}
          >
            <span className="pac-ag-match-dot" />
            Raakt dossier · {dossierNaam(item.dossier)}
            <span className="pac-ag-match-term">match: {item.matchTerm}</span>
          </button>
        )}
      </div>
      <div className="pac-ag-side">
        {item.live === 'live' ? (
          <a
            className="pac-ag-live"
            href={item.stream ?? '#'}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="pac-ag-live-dot" />
            Nu in de zaal
          </a>
        ) : item.live === 'binnenkort' ? (
          <span className="pac-ag-live soon">
            <span className="pac-ag-live-dot" />
            Straks live
          </span>
        ) : (
          <span className={`pac-ag-status ${item.status}`}>{statusLabel}</span>
        )}
      </div>
    </div>
  );
}

interface DateGroup {
  iso: string;
  dag: string;
  datum: string;
  items: PlenaryItem[];
}

export default function AgendaView({ onOpenDossier }: { onOpenDossier: (id: string) => void }) {
  const { agenda, dossiers } = usePaData();
  const [timeScope, setTimeScope] = useState<'aankomend' | 'alle'>('aankomend');
  const [soortFilter, setSoortFilter] = useState<string>('alle');

  const today = new Date().toISOString().substring(0, 10);

  const aankomendCount = useMemo(
    () => agenda.data.filter((a) => a.iso >= today && a.status !== 'geannuleerd').length,
    [agenda.data, today]
  );

  // Base dataset for the current time scope.
  const baseItems = useMemo(
    () =>
      timeScope === 'aankomend'
        ? agenda.data.filter((a) => a.iso >= today && a.status !== 'geannuleerd')
        : agenda.data,
    [agenda.data, timeScope, today]
  );

  // Derive type chips from the current base (counts shift with scope).
  const soortChips = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of baseItems) {
      counts[item.soortLabel] = (counts[item.soortLabel] ?? 0) + 1;
    }
    return Object.keys(counts)
      .sort((a, b) => a.localeCompare(b, 'nl'))
      .map((label) => ({ id: label, label, n: counts[label] }));
  }, [baseItems]);

  const switchScope = (scope: 'aankomend' | 'alle') => {
    setTimeScope(scope);
    setSoortFilter('alle');
  };

  const dossierNaam = (id: string | null): string => {
    if (!id) return '';
    return dossiers.data.find((d) => d.id === id)?.naam ?? id;
  };

  const rows = baseItems.filter(
    (item) => soortFilter === 'alle' || item.soortLabel === soortFilter
  );
  const matched = rows.filter((r) => r.dossier !== null).length;

  const groups: DateGroup[] = [];
  for (const item of rows) {
    const last = groups.at(-1);
    if (last && last.iso === item.iso) {
      last.items.push(item);
    } else {
      groups.push({
        iso: item.iso,
        dag: formatDag(item.iso),
        datum: formatDatum(item.iso),
        items: [item],
      });
    }
  }

  return (
    <div>
      <div className="pac-crumb">Monitoring · Agenda</div>
      <div className="pac-page-head" style={{ marginBottom: 14 }}>
        <div>
          <h1 className="pac-page-title">Plenaire agenda</h1>
          <p className="pac-page-sub">
            De agenda van de Tweede Kamer — plenaire debatten, vragenuur en commissiedebatten. Items
            die een lopend dossier raken zijn gemarkeerd; de rest staat er gewoon bij, zodat het
            beeld compleet blijft.
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
          {ISMOCK ? (
            <span className="pac-coverage mock">mock-modus · gesimuleerd</span>
          ) : (
            <span className="pac-coverage">bron: Tweede Kamer</span>
          )}
        </div>
      </div>

      <div className="pac-agenda-note">
        <b>Schema, geen signaal</b> · opgehaald uit{' '}
        <span className="mono">Gegevensmagazijn OData /Activiteit</span> (Soort = Plenair /
        Commissie), verrijkt met <span className="mono">Debat Direct</span> voor live-status. Geen
        curatie of AI-duiding — feitelijke planning. Koppeling aan dossiers via dezelfde opgeslagen
        zoekvraag die de signalen voedt.
      </div>

      <div className="pac-agenda-filters">
        <div className="pac-ag-chips">
          {/* Time scope */}
          <button
            type="button"
            className={`pac-ag-chip${timeScope === 'aankomend' ? ' active' : ''}`}
            onClick={() => switchScope('aankomend')}
          >
            Aankomend
            <span className="pac-ag-chip-n">{aankomendCount}</span>
          </button>
          <button
            type="button"
            className={`pac-ag-chip${timeScope === 'alle' ? ' active' : ''}`}
            onClick={() => switchScope('alle')}
          >
            Alle periodes
            <span className="pac-ag-chip-n">{agenda.data.length}</span>
          </button>
          <span className="pac-ag-chip-sep" aria-hidden="true" />
          {/* Type filter within current scope */}
          {[{ id: 'alle', label: 'Alle typen', n: baseItems.length }, ...soortChips].map((s) => (
            <button
              key={s.id}
              type="button"
              className={`pac-ag-chip${soortFilter === s.id ? ' active' : ''}`}
              onClick={() => setSoortFilter(s.id)}
            >
              {s.label}
              <span className="pac-ag-chip-n">{s.n}</span>
            </button>
          ))}
        </div>
        <span className="pac-ag-count">
          {rows.length} activiteiten · <b>{matched}</b> raken een dossier
        </span>
      </div>

      {agenda.status === 'loading' ? (
        <p className="pac-page-sub">Agenda ophalen…</p>
      ) : agenda.status === 'error' ? (
        <p className="pac-page-sub">Agenda kon niet worden opgehaald. Probeer het later opnieuw.</p>
      ) : (
        <div className="pac-ag-schedule">
          {groups.length === 0 ? (
            <p className="pac-page-sub">Geen activiteiten in deze selectie.</p>
          ) : (
            groups.map((g) => {
              const cls = g.iso === today ? 'today' : g.iso < today ? 'past' : 'future';
              return (
                <div key={g.iso} className={`pac-ag-day ${cls}`}>
                  <div className="pac-ag-dayhead">
                    <span className="pac-ag-daydow">{g.dag}</span>
                    <span className="pac-ag-daydate">{g.datum}</span>
                    {g.iso === today && <span className="pac-ag-todaymark">Vandaag</span>}
                  </div>
                  <div className="pac-ag-items">
                    {g.items.map((item) => (
                      <AgendaItem
                        key={item.id}
                        item={item}
                        onOpenDossier={onOpenDossier}
                        dossierNaam={dossierNaam}
                      />
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
