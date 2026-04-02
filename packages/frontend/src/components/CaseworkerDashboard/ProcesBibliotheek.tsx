import { useEffect, useState } from 'react';
import { ldeApi } from '../../services/api';
import type { ProcessBundle, BundleDeployedForm, BundleDeployedDocument } from '../../services/api';
import { formatDate } from '../../utils/formatDate';

// ── Status badge ───────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  wip: 'bg-amber-50 text-amber-700',
  active: 'bg-green-50 text-green-700',
  draft: 'bg-gray-100 text-gray-500',
};

const STATUS_LABELS: Record<string, string> = {
  wip: 'WIP',
  active: 'Actief',
  draft: 'Concept',
};

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? 'bg-blue-50 text-blue-700';
  const label = STATUS_LABELS[status] ?? status;
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${style}`}>{label}</span>;
}

// ── Role badge ─────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  standalone: 'Standalone',
  subprocess: 'Subprocess',
};

function RoleBadge({ role }: { role: string }) {
  const label = ROLE_LABELS[role] ?? role;
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
      {label}
    </span>
  );
}

// ── Asset list (forms / documents) ─────────────────────────────────────────

function AssetList({
  label,
  items,
}: {
  label: string;
  items: BundleDeployedForm[] | BundleDeployedDocument[];
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">{label}</p>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-2 text-xs text-gray-600">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-300 flex-shrink-0" />
            <span className="font-mono text-gray-500">{item.id}</span>
            {item.name !== item.id && (
              <>
                <span className="text-gray-300">·</span>
                <span>{item.name}</span>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Bundle card ────────────────────────────────────────────────────────────

function BundleCard({
  bundle,
  expanded,
  onToggle,
}: {
  bundle: ProcessBundle;
  expanded: boolean;
  onToggle: () => void;
}) {
  const hasDetail =
    bundle.deployedForms.length > 0 ||
    bundle.deployedDocuments.length > 0 ||
    bundle.linkedDmnTemplates.length > 0 ||
    bundle.subprocesses.length > 0;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full text-left p-4 hover:bg-gray-50 transition-colors"
        disabled={!hasDetail}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-800 text-sm leading-snug">{bundle.name}</p>
            <p className="font-mono text-xs text-gray-400 mt-0.5 truncate">
              {bundle.bpmnProcessId}
            </p>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
            <StatusBadge status={bundle.status} />
            <RoleBadge role={bundle.processRole} />
            {hasDetail && (
              <span className="text-gray-400 text-xs ml-1">{expanded ? '▲' : '▼'}</span>
            )}
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-2">Ingezet op {formatDate(bundle.deployedAt)}</p>
      </button>

      {expanded && hasDetail && (
        <div className="px-4 pb-4 pt-3 border-t border-gray-100 space-y-3">
          <AssetList label="Formulieren" items={bundle.deployedForms} />
          <AssetList label="Documenten" items={bundle.deployedDocuments} />
          {bundle.subprocesses.length > 0 && (
            <p className="text-xs text-gray-400">
              {bundle.subprocesses.length} subprocess{bundle.subprocesses.length !== 1 ? 'en' : ''}
            </p>
          )}
          {bundle.linkedDmnTemplates.length > 0 && (
            <p className="text-xs text-gray-400">
              {bundle.linkedDmnTemplates.length} DMN-template
              {bundle.linkedDmnTemplates.length !== 1 ? 's' : ''}
            </p>
          )}
          <div className="pt-1 border-t border-gray-50">
            <p className="text-xs text-gray-300 font-mono truncate">
              Deployment: {bundle.operatonDeploymentId}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function ProcesBibliotheek() {
  const [bundles, setBundles] = useState<ProcessBundle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await ldeApi.bundles.public();
      if (res.success && res.data) setBundles(res.data);
      else setError('Procesbibliotheek kon niet worden geladen.');
    } catch {
      setError('Procesbibliotheek kon niet worden geladen.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <div className="max-w-3xl space-y-3">
        {[1, 2, 3].map((n) => (
          <div key={n} className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-1/2 mb-2" />
            <div className="h-3 bg-gray-100 rounded w-1/3" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-3xl bg-red-50 border border-red-200 rounded-xl p-5 text-red-700 text-sm">
        {error}
        <button onClick={load} className="ml-3 underline">
          Opnieuw proberen
        </button>
      </div>
    );
  }

  if (bundles.length === 0) {
    return (
      <div className="max-w-3xl bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">
        Geen geïmplementeerde processen gevonden.
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-800">Procesbibliotheek</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Overzicht van geïmplementeerde BPMN-processen met bijbehorende formulieren en documenten.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {bundles.map((bundle) => (
          <BundleCard
            key={bundle.id}
            bundle={bundle}
            expanded={expandedId === bundle.id}
            onToggle={() => setExpandedId(expandedId === bundle.id ? null : bundle.id)}
          />
        ))}
      </div>

      <p className="text-xs text-gray-400 text-right">
        {bundles.length} proces{bundles.length !== 1 ? 'sen' : ''}
      </p>
    </div>
  );
}
