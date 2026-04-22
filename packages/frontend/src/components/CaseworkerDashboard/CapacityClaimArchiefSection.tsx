import { useEffect, useState } from 'react';
import { businessApi } from '../../services/api';
import type { KeycloakUser } from '@ronl/shared';
import { formatDate } from '../../utils/formatDate';
import CapacityClaimDocumentsViewer from './CapacityClaimDocumentsViewer';

interface CapacityClaimRecord {
  id: string;
  startTime: string;
  endTime: string;
  jobTitle: string;
  requestType: string;
  boardDecision: string;
  advisoryGroup: string;
}

// Any role that participates in the process may inspect the archive.
const AUTHORISED_ROLES = [
  'manager',
  'board-secretary',
  'board-director',
  'hrm-unit',
  'procurement-unit',
  'planning-control-officer',
  'financial-controller',
  'hr-business-partner',
  'personnel-controller',
];

interface Props {
  user: KeycloakUser | null;
}

export default function CapacityClaimArchiefSection({ user }: Props) {
  const [records, setRecords] = useState<CapacityClaimRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const isAuthorised = user?.roles?.some((r) => AUTHORISED_ROLES.includes(r)) ?? false;

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await businessApi.capacityClaim.completed();
      if (res.success && res.data) setRecords(res.data);
      else setError('Completed capacity claims could not be loaded.');
    } catch {
      setError('Completed capacity claims could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthorised) load();
  }, [isAuthorised]);

  if (!isAuthorised) {
    return (
      <div className="max-w-lg">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
          <p className="text-3xl mb-4 text-gray-300">🔒</p>
          <h2 className="text-lg font-bold text-gray-800 mb-2">Access restricted</h2>
          <p className="text-gray-400 text-sm">
            Only participants in the capacity claim process can view the archive.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-2xl space-y-3">
        {[1, 2, 3].map((n) => (
          <div key={n} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-1/2 mb-2" />
            <div className="h-3 bg-gray-100 rounded w-1/3" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl bg-red-50 border border-red-200 rounded-xl p-5 text-red-700 text-sm">
        {error}
        <button onClick={load} className="ml-3 underline">
          Try again
        </button>
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="max-w-2xl bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">
        No completed capacity claims found.
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-3">
      {records.map((record) => {
        const isOpen = selectedId === record.id;
        const decisionTone =
          record.boardDecision === 'approved'
            ? 'bg-green-50 text-green-700 border-green-200'
            : record.boardDecision === 'rejected'
              ? 'bg-red-50 text-red-700 border-red-200'
              : 'bg-gray-50 text-gray-500 border-gray-200';
        return (
          <div
            key={record.id}
            className="bg-white rounded-xl border border-gray-200 overflow-hidden"
          >
            <button
              onClick={() => setSelectedId(isOpen ? null : record.id)}
              className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
            >
              <div>
                <p className="text-sm font-semibold text-gray-800">
                  {record.jobTitle !== '—' ? record.jobTitle : 'Capacity claim'}
                </p>
                <p className="text-xs text-gray-500 mt-0.5 capitalize">
                  {record.requestType} · {record.advisoryGroup}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Completed {formatDate(record.endTime)}
                </p>
              </div>
              <span
                className={`px-2 py-0.5 text-xs font-medium rounded border capitalize ${decisionTone}`}
              >
                {record.boardDecision}
              </span>
            </button>
            {isOpen && (
              <div className="border-t border-gray-100">
                <CapacityClaimDocumentsViewer instanceId={record.id} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
