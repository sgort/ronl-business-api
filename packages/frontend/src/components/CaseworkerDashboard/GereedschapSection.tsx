import { useEffect, useState } from 'react';
import { businessApi } from '../../services/api';
import type { KeycloakUser } from '@ronl/shared';

interface PlatformTool {
  id: string;
  label: string;
  description: string;
  url: string | null;
  icon: string;
  roles: string[];
  statusWidget?: boolean;
}

const PLATFORM_TOOLS: PlatformTool[] = [
  {
    id: 'cpsv-editor',
    label: 'CPSV Editor',
    description: 'Beheer en publiceer publieke diensten conform de CPSV-AP standaard.',
    url: 'https://acc.cpsv-editor.open-regels.nl/',
    icon: '✏️',
    roles: [],
  },
  {
    id: 'cprmv',
    label: 'CPRMV API',
    description: 'Interactieve API-documentatie voor het CPRMV validatieplatform.',
    url: 'https://acc.cprmv.open-regels.nl/docs',
    icon: '📜',
    roles: [],
    statusWidget: true,
  },
  {
    id: 'triplydb',
    label: 'TriplyDB',
    description: 'SPARQL-endpoint en graafbeheer voor de RONL kennisgraaf.',
    url: 'https://open-regels.triply.cc/stevengort/RONL',
    icon: '🔗',
    roles: [],
    statusWidget: true,
  },
  {
    id: 'lde',
    label: 'Linked Data Explorer',
    description: 'Beheer van BPMN/DMN-processen en document templates.',
    url: 'https://acc.linkeddata.open-regels.nl/',
    icon: '🗂️',
    roles: [],
    statusWidget: true,
  },
  {
    id: 'operaton',
    label: 'Operaton Cockpit',
    description: 'Procesbeheer en monitoring van BPMN-instanties.',
    url: 'https://operaton.open-regels.nl/',
    icon: '⚙️',
    roles: ['admin'],
    statusWidget: true,
  },
  {
    id: 'edocs',
    label: 'eDOCS',
    description: 'OpenText eDOCS documentbeheer — DOCUVITT-koppeling.',
    url: null,
    icon: '📁',
    roles: [],
    statusWidget: true,
  },
  {
    id: 'sap',
    label: 'SAP',
    description: 'ERP-koppeling voor personeels- en financiële administratie.',
    url: null,
    icon: '🏢',
    roles: ['admin'],
  },
  {
    id: 'kms',
    label: 'KMS',
    description: 'Kwaliteitsmanagementsysteem voor procesborging en audits.',
    url: null,
    icon: '🏅',
    roles: [],
  },
];

interface Props {
  user: KeycloakUser | null;
}

export default function GereedschapSection({ user }: Props) {
  const [edocsStatus, setEdocsStatus] = useState<{
    status: 'up' | 'down' | 'stub';
    library?: string;
    stubMode?: boolean;
    latencyMs?: number;
  } | null>(null);
  const [edocsStatusLoading, setEdocsStatusLoading] = useState(false);
  const [operatonStatus, setOperatonStatus] = useState<{
    status: 'up' | 'down';
    latency?: number;
  } | null>(null);
  const [externalStatuses, setExternalStatuses] = useState<Record<
    string,
    { status: 'up' | 'down'; latency: number }
  > | null>(null);

  useEffect(() => {
    setEdocsStatusLoading(true);
    businessApi.edocs
      .status()
      .then((res) => setEdocsStatus(res.success ? (res.data ?? null) : null))
      .catch(() => setEdocsStatus(null))
      .finally(() => setEdocsStatusLoading(false));

    businessApi
      .health()
      .then((data) => setOperatonStatus(data.dependencies?.operaton ?? null))
      .catch(() => setOperatonStatus(null));

    businessApi
      .externalStatus()
      .then((res) => setExternalStatuses(res.success ? (res.data ?? null) : null))
      .catch(() => setExternalStatuses(null));
  }, []);

  const visibleTools = PLATFORM_TOOLS.filter(
    (tool) => tool.roles.length === 0 || tool.roles.some((r) => user?.roles?.includes(r))
  );

  return (
    <div className="max-w-5xl">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {visibleTools.map((tool) => {
          const isPlaceholder = tool.url === null;
          return (
            <div
              key={tool.id}
              className="bg-white rounded-xl border border-gray-200 flex flex-col gap-3 p-5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-2xl leading-none">{tool.icon}</span>
                  <p className="font-semibold text-sm text-gray-800">{tool.label}</p>
                </div>
                {isPlaceholder && (
                  <span className="flex-shrink-0 text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-600 font-medium">
                    Binnenkort
                  </span>
                )}
              </div>

              <p className="text-xs text-gray-500 leading-relaxed flex-1">{tool.description}</p>

              {tool.statusWidget && (
                <div className="border-t border-gray-100 pt-2">
                  {tool.id === 'edocs' &&
                    (edocsStatusLoading ? (
                      <span className="text-xs text-gray-400">Status ophalen…</span>
                    ) : edocsStatus ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            edocsStatus.status === 'stub'
                              ? 'bg-yellow-100 text-yellow-700'
                              : edocsStatus.status === 'up'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {edocsStatus.status === 'stub'
                            ? 'Stub'
                            : edocsStatus.status === 'up'
                              ? 'Online'
                              : 'Offline'}
                        </span>
                        {edocsStatus.library && (
                          <span className="text-xs text-gray-400">
                            Library: {edocsStatus.library}
                          </span>
                        )}
                        {edocsStatus.latencyMs !== undefined && (
                          <span className="text-xs text-gray-400">{edocsStatus.latencyMs} ms</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">Status niet beschikbaar</span>
                    ))}
                  {tool.id === 'operaton' &&
                    (operatonStatus ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            operatonStatus.status === 'up'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {operatonStatus.status === 'up' ? 'Online' : 'Offline'}
                        </span>
                        {operatonStatus.latency !== undefined && (
                          <span className="text-xs text-gray-400">{operatonStatus.latency} ms</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">Status niet beschikbaar</span>
                    ))}
                  {(tool.id === 'cprmv' || tool.id === 'triplydb' || tool.id === 'lde') &&
                    (() => {
                      const ext = externalStatuses?.[tool.id];
                      return ext ? (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              ext.status === 'up'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-red-100 text-red-700'
                            }`}
                          >
                            {ext.status === 'up' ? 'Online' : 'Offline'}
                          </span>
                          <span className="text-xs text-gray-400">{ext.latency} ms</span>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">Status niet beschikbaar</span>
                      );
                    })()}
                </div>
              )}

              {!isPlaceholder && (
                <button
                  onClick={() => window.open(tool.url!, '_blank', 'noopener,noreferrer')}
                  className="mt-auto flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors self-start"
                  style={{
                    color: 'var(--color-primary)',
                    borderColor: 'var(--color-primary-light, #ccc)',
                  }}
                >
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                  Openen
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
