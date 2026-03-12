import { useEffect, useState } from 'react';
import { businessApi } from '../../services/api';
import type {
  RegelcatalogusData,
  CatalogService,
  CatalogOrganization,
  CatalogConcept,
} from '../../services/api';

type CatalogTab = 'diensten' | 'organisaties' | 'concepten';

const TABS: { id: CatalogTab; label: string }[] = [
  { id: 'diensten', label: 'Diensten' },
  { id: 'organisaties', label: 'Organisaties' },
  { id: 'concepten', label: 'Concepten' },
];

export default function RegelCatalogus() {
  const [data, setData] = useState<RegelcatalogusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<CatalogTab>('diensten');
  const [expandedService, setExpandedService] = useState<string | null>(null);

  // Concepten filter state — can be driven externally via cross-tab click
  const [conceptFilter, setConceptFilter] = useState('');
  const [conceptServiceFilter, setConceptServiceFilter] = useState<string>('');

  useEffect(() => {
    setLoading(true);
    businessApi.portal
      .regelcatalogus()
      .then((res) => {
        if (res.success && res.data) setData(res.data);
        else setError('Katalogus kon niet worden geladen.');
      })
      .catch(() => setError('Katalogus kon niet worden geladen.'))
      .finally(() => setLoading(false));
  }, []);

  function handleServiceLinkToConcepten(serviceUri: string) {
    setConceptServiceFilter(serviceUri);
    setConceptFilter('');
    setActiveTab('concepten');
  }

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

  if (error || !data) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
        {error ?? 'Onbekende fout.'}
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-gray-800">Regelcatalogus</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Overzicht van publieke diensten, uitvoeringsorganisaties en semantische concepten uit de
          RONL kennisgraaf.
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-0 border-b border-gray-200">
        {TABS.map((tab) => {
          const count =
            tab.id === 'diensten'
              ? data.services.length
              : tab.id === 'organisaties'
                ? data.organizations.length
                : data.concepts.length;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
              <span
                className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${
                  activeTab === tab.id ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'diensten' && (
          <DienstenTab
            services={data.services}
            expanded={expandedService}
            onExpand={setExpandedService}
            onLinkConcepten={handleServiceLinkToConcepten}
          />
        )}
        {activeTab === 'organisaties' && <OrganisatiesTab organizations={data.organizations} />}
        {activeTab === 'concepten' && (
          <ConceptenTab
            concepts={data.concepts}
            services={data.services}
            filter={conceptFilter}
            serviceFilter={conceptServiceFilter}
            onFilterChange={setConceptFilter}
            onServiceFilterChange={setConceptServiceFilter}
          />
        )}
      </div>
    </div>
  );
}

// ── Diensten tab ───────────────────────────────────────────────────────────

function DienstenTab({
  services,
  expanded,
  onExpand,
  onLinkConcepten,
}: {
  services: CatalogService[];
  expanded: string | null;
  onExpand: (uri: string | null) => void;
  onLinkConcepten: (serviceUri: string) => void;
}) {
  if (services.length === 0) {
    return <EmptyState label="Geen diensten gevonden." />;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {services.map((svc) => {
        const isExpanded = expanded === svc.uri;
        return (
          <div key={svc.uri} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <button
              onClick={() => onExpand(isExpanded ? null : svc.uri)}
              className="w-full text-left p-4 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-gray-800 text-sm leading-snug">{svc.title}</p>
                <span className="text-gray-400 text-xs flex-shrink-0 mt-0.5">
                  {isExpanded ? '▲' : '▼'}
                </span>
              </div>
              {!isExpanded && svc.description && (
                <p className="text-xs text-gray-500 mt-1 line-clamp-2">{svc.description}</p>
              )}
            </button>

            {isExpanded && (
              <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-3">
                {svc.description && (
                  <p className="text-sm text-gray-600 leading-relaxed">{svc.description}</p>
                )}
                <div className="flex flex-wrap gap-2">
                  <a
                    href={svc.uri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                  >
                    <ExternalLinkIcon />
                    Linked Data URI
                  </a>
                  <button
                    onClick={() => onLinkConcepten(svc.uri)}
                    className="inline-flex items-center gap-1 text-xs text-purple-600 hover:underline"
                  >
                    <ConceptIcon />
                    Toon concepten
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Organisaties tab ───────────────────────────────────────────────────────

function OrganisatiesTab({ organizations }: { organizations: CatalogOrganization[] }) {
  if (organizations.length === 0) {
    return <EmptyState label="Geen organisaties gevonden." />;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {organizations.map((org) => (
        <OrgCard key={org.uri} org={org} />
      ))}
    </div>
  );
}

function OrgCard({ org }: { org: CatalogOrganization }) {
  const [imgError, setImgError] = useState(false);
  const initials = org.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
          {org.logo && !imgError ? (
            <img
              src={org.logo}
              alt={org.name}
              className="w-full h-full object-contain p-1"
              onError={() => setImgError(true)}
            />
          ) : (
            <span className="text-sm font-bold text-gray-500">{initials}</span>
          )}
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-gray-800 text-sm leading-snug truncate">{org.name}</p>
          {org.homepage && (
            <a
              href={org.homepage}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:underline truncate block"
            >
              {org.homepage.replace(/^https?:\/\//, '')}
            </a>
          )}
        </div>
      </div>

      {org.services.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">
            Diensten
          </p>
          <div className="flex flex-wrap gap-1.5">
            {org.services.map((s) => (
              <span
                key={s.uri}
                className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full"
              >
                {s.title}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Concepten tab ──────────────────────────────────────────────────────────

function ConceptenTab({
  concepts,
  filter,
  serviceFilter,
  onFilterChange,
  onServiceFilterChange,
}: {
  concepts: CatalogConcept[];
  services: CatalogService[];
  filter: string;
  serviceFilter: string;
  onFilterChange: (v: string) => void;
  onServiceFilterChange: (v: string) => void;
}) {
  const serviceOptions = Array.from(
    new Map(
      concepts.filter((c) => c.serviceUri).map((c) => [c.serviceUri, c.serviceTitle])
    ).entries()
  );

  const filtered = concepts.filter((c) => {
    const matchesSearch = !filter || c.prefLabel.toLowerCase().includes(filter.toLowerCase());
    const matchesService = !serviceFilter || c.serviceUri === serviceFilter;
    return matchesSearch && matchesService;
  });

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          placeholder="Zoek op label…"
          value={filter}
          onChange={(e) => onFilterChange(e.target.value)}
          className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
        <select
          value={serviceFilter}
          onChange={(e) => onServiceFilterChange(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
        >
          <option value="">Alle diensten</option>
          {serviceOptions.map(([uri, title]) => (
            <option key={uri} value={uri}>
              {title || uri.split('/').pop()}
            </option>
          ))}
        </select>
        {(filter || serviceFilter) && (
          <button
            onClick={() => {
              onFilterChange('');
              onServiceFilterChange('');
            }}
            className="px-3 py-2 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg"
          >
            Wissen
          </button>
        )}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <EmptyState label="Geen concepten gevonden voor deze filter." />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Concept
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Dienst
                  </th>
                  <th className="px-4 py-3 w-8" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((concept, i) => (
                  <tr
                    key={`${concept.uri}-${i}`}
                    className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-gray-800">{concept.prefLabel}</td>
                    <td className="px-4 py-3">
                      {concept.serviceTitle ? (
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full">
                          {concept.serviceTitle}
                        </span>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {concept.exactMatch && (
                        <a
                          href={concept.exactMatch}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-gray-400 hover:text-blue-600 transition-colors"
                          title="exactMatch URI"
                        >
                          <ExternalLinkIcon />
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 text-xs text-gray-400">
            {filtered.length} van {concepts.length} concepten
          </div>
        </div>
      )}
    </div>
  );
}

// ── Shared micro-components ────────────────────────────────────────────────

function EmptyState({ label }: { label: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
      <p className="text-3xl mb-3 text-gray-200">◻</p>
      <p className="text-sm text-gray-400">{label}</p>
    </div>
  );
}

function ExternalLinkIcon() {
  return (
    <svg className="w-3.5 h-3.5 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
      />
    </svg>
  );
}

function ConceptIcon() {
  return (
    <svg className="w-3.5 h-3.5 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14"
      />
    </svg>
  );
}
