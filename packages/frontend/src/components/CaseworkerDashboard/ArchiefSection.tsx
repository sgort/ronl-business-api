import { useEffect, useState } from 'react';
import { businessApi } from '../../services/api';
import type { HistoricTask } from '@ronl/shared';

const EXCLUDED_VARS = [
  'municipality',
  'organisationType',
  'initiator',
  'applicantId',
  'assuranceLevel',
  'roleResult',
  'routingResult',
];

interface Props {
  /**
   * When set, only completed tasks whose processDefinitionKey is in this set are
   * shown (allowlist). Used by the Infra-board to show RIP processes only.
   */
  allowProcessKeys?: ReadonlySet<string>;
  /**
   * When set, completed tasks whose processDefinitionKey is in this set are
   * hidden (denylist). Used by the caseworker board to exclude infra processes.
   */
  denyProcessKeys?: ReadonlySet<string>;
}

export default function ArchiefSection({ allowProcessKeys, denyProcessKeys }: Props = {}) {
  const [tasks, setTasks] = useState<HistoricTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [variables, setVariables] = useState<Record<string, Record<string, unknown>>>({});

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await businessApi.task.history();
      if (res.success && res.data) setTasks(res.data);
      else setError('Archieftaken konden niet worden geladen.');
    } catch {
      setError('Archieftaken konden niet worden geladen.');
    } finally {
      setLoading(false);
    }
  };

  const loadVariables = async (processInstanceId: string) => {
    if (variables[processInstanceId]) return;
    try {
      const res = await businessApi.process.historicVariables(processInstanceId);
      if (res.success && res.data) {
        setVariables((prev) => ({
          ...prev,
          [processInstanceId]: res.data as Record<string, unknown>,
        }));
      }
    } catch {
      // not critical
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <div className="max-w-3xl space-y-3">
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
      <div className="max-w-3xl bg-red-50 border border-red-200 rounded-xl p-5 text-red-700 text-sm">
        {error}
        <button onClick={load} className="ml-3 underline">
          Opnieuw proberen
        </button>
      </div>
    );
  }

  // Split the shared archive by process ownership (board), keyed on
  // processDefinitionKey — the same notion the live task list uses.
  const visibleTasks = tasks.filter((t) => {
    const key = t.processDefinitionKey ?? t.taskDefinitionKey;
    if (allowProcessKeys && !allowProcessKeys.has(key)) return false;
    if (denyProcessKeys && denyProcessKeys.has(key)) return false;
    return true;
  });

  if (visibleTasks.length === 0) {
    return (
      <div className="max-w-3xl bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">
        Geen afgeronde taken gevonden.
      </div>
    );
  }

  const grouped = visibleTasks
    .slice()
    .sort((a, b) => new Date(b.endTime).getTime() - new Date(a.endTime).getTime())
    .reduce<Record<string, typeof tasks>>((acc, task) => {
      const key = task.processDefinitionKey ?? task.taskDefinitionKey;
      if (!acc[key]) acc[key] = [];
      acc[key].push(task);
      return acc;
    }, {});

  const sortedGroups = Object.entries(grouped).sort(
    ([, a], [, b]) => new Date(b[0].endTime).getTime() - new Date(a[0].endTime).getTime()
  );

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-gray-800">Archief</h2>
        <button
          onClick={load}
          className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
        >
          ↺ Vernieuwen
        </button>
      </div>

      <div className="space-y-4">
        {sortedGroups.map(([defKey, groupTasks]) => (
          <div key={defKey}>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide font-mono mb-1 px-1 truncate">
              {defKey}
            </p>
            <div className="space-y-2">
              {groupTasks.map((task) => (
                <div
                  key={task.id}
                  className="bg-white rounded-lg shadow-sm border-2 border-transparent overflow-hidden"
                  style={selectedId === task.id ? { borderColor: 'var(--color-primary)' } : {}}
                >
                  <button
                    onClick={() => {
                      const next = selectedId === task.id ? null : task.id;
                      setSelectedId(next);
                      if (next) loadVariables(task.processInstanceId);
                    }}
                    className="w-full text-left p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                  >
                    <div>
                      <p className="font-medium text-gray-800 truncate text-sm">
                        {task.name || task.taskDefinitionKey}
                      </p>
                      <div className="flex items-center gap-3 mt-1 text-xs">
                        {task.businessKey && (
                          <span className="font-mono text-gray-600">{task.businessKey}</span>
                        )}
                        <span className="text-gray-500">
                          {new Date(task.endTime).toLocaleString('nl-NL', {
                            day: 'numeric',
                            month: 'numeric',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        {task.assignee &&
                          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                            task.assignee
                          ) &&
                          !task.assignee.startsWith('ronl-worker-') && (
                            <span className="font-mono text-gray-300">{task.assignee}</span>
                          )}
                      </div>
                    </div>
                    <span className="text-gray-400 text-lg ml-4 flex-shrink-0">
                      {selectedId === task.id ? '▲' : '▼'}
                    </span>
                  </button>

                  {selectedId === task.id && (
                    <div className="border-t border-gray-100 p-4 bg-white">
                      {variables[task.processInstanceId] ? (
                        <div className="space-y-1">
                          {Object.entries(variables[task.processInstanceId])
                            .filter(([key]) => !EXCLUDED_VARS.includes(key))
                            .map(([key, value]) => (
                              <div key={key} className="flex justify-between text-sm">
                                <span className="text-gray-600 font-medium">{key}</span>
                                <span className="text-gray-800 font-mono text-xs">
                                  {value === null || value === undefined
                                    ? '—'
                                    : typeof value === 'object'
                                      ? JSON.stringify(value)
                                      : String(value)}
                                </span>
                              </div>
                            ))}
                          {Object.keys(variables[task.processInstanceId]).filter(
                            (key) => !EXCLUDED_VARS.includes(key)
                          ).length === 0 && (
                            <p className="text-xs text-gray-400">
                              Geen procesgegevens beschikbaar.
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400">Laden…</p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
