import { useEffect, useState } from 'react';
import { businessApi } from '../../services/api';
import type { ProductDienstItem } from '../../services/api';

type AudienceFilter = 'alle' | 'ondernemer' | 'particulier';

const AUDIENCE_LABELS: Record<string, string> = {
  ondernemer: 'Ondernemer',
  particulier: 'Particulier',
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

export default function ProductenDienstenCatalogus() {
  const [items, setItems] = useState<ProductDienstItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [audienceFilter, setAudienceFilter] = useState<AudienceFilter>('alle');
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
    const matchesSearch =
      !query ||
      item.title.toLowerCase().includes(query) ||
      item.description.toLowerCase().includes(query);
    return matchesAudience && matchesSearch;
  });

  const onlineCount = filtered.filter((i) => i.onlineAanvragen).length;

  return (
    <div className="max-w-4xl space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-gray-800">Producten & Diensten</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Overzicht van producten en diensten van Provincie Flevoland.
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          placeholder="Zoek op naam of beschrijving…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
        <div className="flex gap-1">
          {(['alle', 'ondernemer', 'particulier'] as AudienceFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setAudienceFilter(f)}
              className={`px-3 py-2 text-xs font-medium rounded-lg transition-colors capitalize ${
                audienceFilter === f ? 'text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
              style={audienceFilter === f ? { backgroundColor: 'var(--color-primary)' } : undefined}
            >
              {f === 'alle' ? 'Alle' : AUDIENCE_LABELS[f]}
            </button>
          ))}
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

      {/* Cards */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">
          Geen producten gevonden voor deze zoekopdracht.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtered.map((item) => {
            const isExpanded = expanded === item.id;
            return (
              <div
                key={item.id}
                className="bg-white rounded-xl border border-gray-200 overflow-hidden"
              >
                <button
                  onClick={() => setExpanded(isExpanded ? null : item.id)}
                  className="w-full text-left p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-gray-800 text-sm leading-snug">{item.title}</p>
                    <span className="text-gray-400 text-xs flex-shrink-0 mt-0.5">
                      {isExpanded ? '▲' : '▼'}
                    </span>
                  </div>
                  {!isExpanded && (
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">{item.description}</p>
                  )}
                  <div className="flex flex-wrap gap-1 mt-2">
                    {item.audience.map((a) => (
                      <span
                        key={a}
                        className="px-1.5 py-0.5 bg-gray-100 text-gray-500 text-xs rounded"
                      >
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

                {isExpanded && (
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
          })}
        </div>
      )}
    </div>
  );
}
