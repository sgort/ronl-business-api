import { useEffect, useState } from 'react';
import { businessApi } from '../../services/api';
import type { KeycloakUser } from '@ronl/shared';
import { formatDate } from '../../utils/formatDate';
import DecisionViewer from '../DecisionViewer';

interface OnboardingRecord {
  id: string;
  startTime: string;
  endTime: string;
  employeeId: string;
  firstName: string;
  lastName: string;
}

interface Props {
  user: KeycloakUser | null;
}

export default function OnboardingArchiefSection({ user }: Props) {
  const [records, setRecords] = useState<OnboardingRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const isHrMedewerker = user?.roles?.includes('hr-medewerker');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await businessApi.hr.completed();
      if (res.success) setRecords(res.data as OnboardingRecord[]);
      else setError('Afgeronde onboardingen konden niet worden geladen.');
    } catch {
      setError('Afgeronde onboardingen konden niet worden geladen.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isHrMedewerker) load();
  }, [isHrMedewerker]);

  if (!isHrMedewerker) {
    return (
      <div className="max-w-lg">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
          <p className="text-3xl mb-4 text-gray-300">🔒</p>
          <h2 className="text-lg font-bold text-gray-800 mb-2">Toegang beperkt</h2>
          <p className="text-gray-400 text-sm">
            Alleen HR-medewerkers kunnen afgeronde onboardingen inzien.
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
          Opnieuw proberen
        </button>
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="max-w-2xl bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">
        Geen afgeronde onboardingen gevonden.
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-3">
      {records.map((record) => (
        <div key={record.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <button
            onClick={() => setSelectedId(selectedId === record.id ? null : record.id)}
            className="w-full text-left p-5 flex items-center justify-between hover:bg-gray-50 transition-colors"
          >
            <div>
              <p className="font-medium text-gray-800 text-sm">
                {record.firstName} {record.lastName}
                <span className="ml-2 text-gray-400 font-normal">{record.employeeId}</span>
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                Afgerond op {formatDate(record.endTime)}
              </p>
            </div>
            <span className="text-gray-400 text-lg">{selectedId === record.id ? '▲' : '▼'}</span>
          </button>

          {selectedId === record.id && (
            <div className="border-t border-gray-100 p-5">
              <DecisionViewer processInstanceId={record.id} showFallback={false} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
