import { useEffect, useState } from 'react';
import { businessApi } from '../../services/api';
import type { ProductDienstItem, ProductSoort } from '../../services/api';

type AudienceFilter = 'alle' | 'ondernemer' | 'particulier';
type AanvraagFilter = 'alle' | 'online' | 'informatie';
type SortKey = 'naam-asc' | 'naam-desc' | 'bijgewerkt';

const AUDIENCE_LABELS: Record<string, string> = {
  ondernemer: 'Ondernemer',
  particulier: 'Particulier',
};

// Soort grouping — order in which groups are rendered, plus their labels.
const SOORT_ORDER: ProductSoort[] = ['subsidie', 'vergunning', 'bezwaar'];
const SOORT_LABELS: Record<ProductSoort, string> = {
  subsidie: 'Subsidies',
  vergunning: 'Vergunningen, meldingen & activiteiten',
  bezwaar: 'Bezwaar & klacht',
};

const SORT_LABELS: Record<SortKey, string> = {
  'naam-asc': 'Naam (A–Z)',
  'naam-desc': 'Naam (Z–A)',
  bijgewerkt: 'Laatst bijgewerkt',
};

function ExternalLinkIcon() {
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
      />
    </svg>
  );
}

function sortItems(list: ProductDienstItem[], by: SortKey): ProductDienstItem[] {
  const copy = list.slice();
  switch (by) {
    case 'naam-asc':
      return copy.sort((a, b) => a.title.localeCompare(b.title, 'nl'));
    case 'naam-desc':
      return copy.sort((a, b) => b.title.localeCompare(a.title, 'nl'));
    case 'bijgewerkt':
      // modified is an ISO-style date string (e.g. "2025-12-31"); newest first.
      return copy.sort((a, b) => (b.modified ?? '').localeCompare(a.modified ?? ''));
  }
}

function ProductCard({
  item,
  expanded,
  onToggle,
}: {
  item: ProductDienstItem;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full text-left p-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold text-gray-800 text-sm leading-snug">{item.title}</p>
          <span className="text-gray-400 text-xs flex-shrink-0 mt-0.5">{expanded ? '▲' : '▼'}</span>
        </div>
        {!expanded && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{item.description}</p>}
        <div className="flex flex-wrap gap-1 mt-2">
          {item.audience.map((a) => (
            <span key={a} className="px-1.5 py-0.5 bg-gray-100 text-gray-500 text-xs rounded">
              {AUDIENCE_LABELS[a]}
            </span>
          ))}
          {item.onlineAanvragen && (
            <span className="px-1.5 py-0.5 bg-green-50 text-green-700 text-xs rounded">
              Online aanvragen
            </span>
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-3">
          <p className="text-sm text-gray-600 leading-relaxed">{item.description}</p>
          <div className="flex flex-wrap items-center gap-3">
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs hover:underline"
              style={{ color: 'var(--color-primary)' }}
            >
              <ExternalLinkIcon />
              Bekijk op flevoland.nl
            </a>
            {item.modified && (
              <span className="text-xs text-gray-400">Bijgewerkt: {item.modified}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProductenDienstenCatalogus() {
  const [items, setItems] = useState<ProductDienstItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [audienceFilter, setAudienceFilter] = useState<AudienceFilter>('alle');
  const [aanvraagFilter, setAanvraagFilter] = useState<AanvraagFilter>('alle');
  const [sortBy, setSortBy] = useState<SortKey>('naam-asc');
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    businessApi.portal
      .productenDiensten(200)
      .then((res) => {
        if (res.success && res.data) setItems(res.data.items);
        else setError('Catalogus kon niet worden geladen.');
      })
      .catch(() => setError('Catalogus kon niet worden geladen.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-gray-400 text-sm py-8">
        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        Catalogus laden…
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  const query = search.toLowerCase();
  const filtered = items.filter((item) => {
    const matchesAudience =
      audienceFilter === 'alle' ||
      item.audience.includes(audienceFilter as 'ondernemer' | 'particulier');
    const matchesAanvraag =
      aanvraagFilter === 'alle' ||
      (aanvraagFilter === 'online' ? item.onlineAanvragen : !item.onlineAanvragen);
    const matchesSearch =
      !query ||
      item.title.toLowerCase().includes(query) ||
      item.description.toLowerCase().includes(query);
    return matchesAudience && matchesAanvraag && matchesSearch;
  });

  const onlineCount = filtered.filter((i) => i.onlineAanvragen).length;

  // Group the filtered set by soort, sort within each group, drop empty groups.
  const groups = SOORT_ORDER.map((soort) => ({
    soort,
    items: sortItems(
      filtered.filter((i) => i.soort === soort),
      sortBy
    ),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-gray-800">Producten & Diensten</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Overzicht van producten en diensten van Provincie Flevoland.
        </p>
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Zoek op naam of beschrijving…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300"
      />

      {/* Filters + sort */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
            Doelgroep
          </span>
          <div className="flex gap-1">
            {(['alle', 'ondernemer', 'particulier'] as AudienceFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setAudienceFilter(f)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  audienceFilter === f
                    ? 'text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
                style={
                  audienceFilter === f ? { backgroundColor: 'var(--color-primary)' } : undefined
                }
              >
                {f === 'alle' ? 'Alle' : AUDIENCE_LABELS[f]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
            Aanvraagwijze
          </span>
          <div className="flex gap-1">
            {(
              [
                ['alle', 'Alle'],
                ['online', 'Online aanvragen'],
                ['informatie', 'Informatie & op afspraak'],
              ] as [AanvraagFilter, string][]
            ).map(([f, label]) => (
              <button
                key={f}
                onClick={() => setAanvraagFilter(f)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  aanvraagFilter === f
                    ? 'text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
                style={
                  aanvraagFilter === f ? { backgroundColor: 'var(--color-primary)' } : undefined
                }
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
            Sorteren
          </span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
          >
            {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
              <option key={k} value={k}>
                {SORT_LABELS[k]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-4 text-xs text-gray-400">
        <span>
          {filtered.length} product{filtered.length !== 1 ? 'en' : ''}
        </span>
        {onlineCount > 0 && (
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
            {onlineCount} online aanvraagbaar
          </span>
        )}
      </div>

      {/* Grouped cards */}
      {groups.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">
          Geen producten gevonden voor deze zoekopdracht.
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <div key={group.soort} className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <h3 className="text-sm font-semibold text-gray-700">{SOORT_LABELS[group.soort]}</h3>
                <span className="text-xs text-gray-400">({group.items.length})</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {group.items.map((item) => (
                  <ProductCard
                    key={item.id}
                    item={item}
                    expanded={expanded === item.id}
                    onToggle={() => setExpanded(expanded === item.id ? null : item.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
