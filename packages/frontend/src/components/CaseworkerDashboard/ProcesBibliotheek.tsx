import { useEffect, useState } from 'react';
import { ldeApi } from '../../services/api';
import type {
  ProcessBundle,
  BundleDeployedForm,
  BundleDeployedDocument,
  BundleSubprocess,
} from '../../services/api';
import { formatDate } from '../../utils/formatDate';

// ── Helpers ────────────────────────────────────────────────────────────────

function displayName(name: string, id: string): string {
  return name && name.trim() ? name.trim() : id;
}

// ── Badges ─────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  wip: 'bg-amber-50 text-amber-700',
  active: 'bg-green-50 text-green-700',
  draft: 'bg-gray-100 text-gray-500',
  example: 'bg-blue-50 text-blue-600',
};

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-500';
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${style}`}>{status}</span>;
}

function RoleBadge({ role }: { role: string }) {
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
      {role}
    </span>
  );
}

const BOARD_STYLES: Record<string, string> = {
  'infra-board': 'bg-indigo-50 text-indigo-700',
  caseworker: 'bg-rose-50 text-rose-700',
  'public-affairs': 'bg-purple-50 text-purple-700',
};

function BoardBadge({ board }: { board: string }) {
  const style = BOARD_STYLES[board] ?? 'bg-slate-100 text-slate-600';
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${style}`} title="Board owner">
      {board}
    </span>
  );
}

// ── Asset sections ─────────────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  return (
    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">{label}</p>
  );
}

function FormList({ items }: { items: BundleDeployedForm[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <SectionLabel label="Forms" />
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-2 text-xs text-gray-600">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-300 flex-shrink-0" />
            {displayName(item.name, item.id)}
          </li>
        ))}
      </ul>
    </div>
  );
}

function DocumentList({ items }: { items: BundleDeployedDocument[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <SectionLabel label="Documents" />
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-2 text-xs text-gray-600">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-300 flex-shrink-0" />
            {displayName(item.name, item.id)}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SubprocessList({ items }: { items: BundleSubprocess[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <SectionLabel label="Subprocesses" />
      <ul className="space-y-1.5">
        {items.map((sp) => (
          <li key={sp.id} className="flex items-start gap-2 text-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-300 flex-shrink-0 mt-1" />
            <div>
              <span className="text-gray-700">{displayName(sp.name, sp.id)}</span>
              <span className="ml-1.5 text-gray-400 font-mono">{sp.bpmnProcessId}</span>
              <StatusBadge status={sp.status} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DmnList({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <SectionLabel label="DMN Templates" />
      <ul className="space-y-1">
        {items.map((key) => (
          <li key={key} className="flex items-center gap-2 text-xs text-gray-600">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-300 flex-shrink-0" />
            <span className="font-mono">{key}</span>
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
    bundle.subprocesses.length > 0 ||
    bundle.linkedDmnTemplates.length > 0;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col">
      {/* Header — always visible */}
      <button
        onClick={onToggle}
        disabled={!hasDetail}
        className="w-full text-left p-5 flex items-start justify-between gap-3 hover:bg-gray-50 transition-colors disabled:cursor-default"
      >
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-800 text-sm leading-snug">
            {displayName(bundle.name, bundle.id)}
          </p>
          <p className="font-mono text-xs text-gray-400 mt-0.5 truncate">{bundle.bpmnProcessId}</p>
          {bundle.description && (
            <p className="text-xs text-gray-500 mt-1.5 leading-relaxed line-clamp-2">
              {bundle.description}
            </p>
          )}
          <p className="text-xs text-gray-400 mt-2">Deployed on {formatDate(bundle.deployedAt)}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <div className="flex items-center gap-1 flex-wrap justify-end">
            {bundle.boardOwner && <BoardBadge board={bundle.boardOwner} />}
            <StatusBadge status={bundle.status} />
            <RoleBadge role={bundle.processRole} />
          </div>
          {hasDetail && <span className="text-gray-400 text-xs">{expanded ? '▲' : '▼'}</span>}
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && hasDetail && (
        <div className="border-t border-gray-100 px-5 pb-5 pt-4 space-y-4 flex-1">
          <FormList items={bundle.deployedForms} />
          <DocumentList items={bundle.deployedDocuments} />
          <SubprocessList items={bundle.subprocesses} />
          <DmnList items={bundle.linkedDmnTemplates} />
          <div className="pt-2 border-t border-gray-50">
            <p className="text-xs text-gray-300 font-mono truncate">
              {bundle.operatonDeploymentId}
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
      else setError('Process library could not be loaded.');
    } catch {
      setError('Process library could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {[1, 2, 3].map((n) => (
          <div key={n} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-2/3 mb-2" />
            <div className="h-3 bg-gray-100 rounded w-1/3 mb-3" />
            <div className="h-3 bg-gray-100 rounded w-full mb-1" />
            <div className="h-3 bg-gray-100 rounded w-4/5" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-red-700 text-sm">
        {error}
        <button onClick={load} className="ml-3 underline">
          Retry
        </button>
      </div>
    );
  }

  if (bundles.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">
        No deployed processes found.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-800">Procesbibliotheek</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Deployed BPMN processes with their forms, documents, subprocesses, and decision tables.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
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
        {bundles.length} process{bundles.length !== 1 ? 'es' : ''}
      </p>
    </div>
  );
}
