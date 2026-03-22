import { useEffect, useState } from 'react';
import { businessApi } from '../../services/api';
import type { KeycloakUser, Task } from '@ronl/shared';
import TaskFormViewer from './TaskFormViewer';

const EXCLUDED_VARS = ['municipality', 'initiator', 'assuranceLevel', 'roleResult'];

interface Props {
  user: KeycloakUser | null;
  onCountChange?: (count: number) => void;
}

export default function TakenSection({ user, onCountChange }: Props) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [taskVariables, setTaskVariables] = useState<Record<string, unknown> | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [processDataOpen, setProcessDataOpen] = useState(false);
  const [actionMessage, setActionMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const loadTasks = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await businessApi.task.list();
      if (res.success) {
        const data = res.data as Task[];
        setTasks(data);
        onCountChange?.(data.length);
      } else {
        setError('Taken konden niet worden geladen.');
        onCountChange?.(0);
      }
    } catch {
      setError('Taken konden niet worden geladen.');
      onCountChange?.(0);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectTask = async (task: Task) => {
    setSelectedTask(task);
    setProcessDataOpen(!task.assignee);
    setTaskVariables(null);
    setActionMessage(null);
    setDetailLoading(true);
    try {
      const res = await businessApi.task.variables(task.id);
      if (res.success) setTaskVariables(res.data as Record<string, unknown>);
    } catch {
      // not critical
    } finally {
      setDetailLoading(false);
    }
  };

  const handleClaim = async () => {
    if (!selectedTask) return;
    setClaiming(true);
    setActionMessage(null);
    try {
      const res = await businessApi.task.claim(selectedTask.id);
      if (res.success) {
        setActionMessage({ type: 'success', text: 'Taak succesvol geclaimd.' });
        setSelectedTask({ ...selectedTask, assignee: user?.sub });
        loadTasks();
      } else {
        setActionMessage({ type: 'error', text: 'Claimen mislukt.' });
      }
    } catch {
      setActionMessage({ type: 'error', text: 'Claimen mislukt.' });
    } finally {
      setClaiming(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, []);

  // Group tasks by processDefinitionKey, sort by created descending
  const grouped = tasks
    .slice()
    .sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime())
    .reduce<Record<string, typeof tasks>>((acc, task) => {
      const key = task.processDefinitionKey ?? task.processDefinitionId;
      if (!acc[key]) acc[key] = [];
      acc[key].push(task);
      return acc;
    }, {});

  const sortedGroups = Object.entries(grouped).sort(
    ([, a], [, b]) => new Date(b[0].created).getTime() - new Date(a[0].created).getTime()
  );

  return (
    <div className="flex gap-6 h-full">
      {/* ── Task list ── */}
      <div className="w-80 flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-800">Taken</h2>
          <button
            onClick={loadTasks}
            className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
          >
            ↺ Vernieuwen
          </button>
        </div>

        {loading && (
          <div className="bg-white rounded-lg shadow-sm p-6 text-center text-gray-500 text-sm">
            Taken laden...
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
            {error}
          </div>
        )}
        {!loading && !error && tasks.length === 0 && (
          <div className="bg-white rounded-lg shadow-sm p-6 text-center text-gray-500 text-sm">
            Geen openstaande taken.
          </div>
        )}
        {!loading && tasks.length > 0 && (
          <div className="space-y-4">
            {sortedGroups.map(([defKey, groupTasks]) => (
              <div key={defKey}>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide font-mono mb-1 px-1 truncate">
                  {defKey}
                </p>
                <div className="space-y-2">
                  {groupTasks.map((task) => (
                    <button
                      key={task.id}
                      onClick={() => handleSelectTask(task)}
                      className="w-full text-left bg-white rounded-lg shadow-sm p-4 transition-all border-2 border-transparent hover:border-gray-200"
                      style={
                        selectedTask?.id === task.id ? { borderColor: 'var(--color-primary)' } : {}
                      }
                    >
                      <p className="font-medium text-gray-800 truncate text-sm">{task.name}</p>
                      <div className="flex items-center justify-between mt-1">
                        <p className="text-xs text-gray-500">
                          {new Date(task.created).toLocaleDateString('nl-NL')}
                        </p>
                        {task.assignee ? (
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                            Geclaimd
                          </span>
                        ) : (
                          <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded">
                            Openstaand
                          </span>
                        )}
                      </div>
                      {task.due && (
                        <p className="text-xs text-red-500 mt-1">
                          Deadline: {new Date(task.due).toLocaleDateString('nl-NL')}
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Detail panel ── */}
      <div className="flex-1">
        {!selectedTask ? (
          <div className="bg-white rounded-lg shadow-sm p-8 text-center text-gray-400 text-sm">
            Selecteer een taak om de details te bekijken.
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h3 className="text-lg font-bold text-gray-800">{selectedTask.name}</h3>
                {selectedTask.description && (
                  <p className="text-gray-500 mt-1 text-sm">{selectedTask.description}</p>
                )}
              </div>
              <button
                onClick={() => {
                  setSelectedTask(null);
                  setProcessDataOpen(false);
                  setTaskVariables(null);
                  setActionMessage(null);
                }}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                ✕
              </button>
            </div>

            {actionMessage && (
              <div
                className={`mb-4 p-3 rounded-lg text-sm ${
                  actionMessage.type === 'success'
                    ? 'bg-green-50 text-green-700 border border-green-200'
                    : 'bg-red-50 text-red-700 border border-red-200'
                }`}
              >
                {actionMessage.text}
              </div>
            )}

            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm mb-6">
              <div>
                <dt className="text-gray-500">Aangemaakt</dt>
                <dd className="font-medium text-gray-800">
                  {new Date(selectedTask.created).toLocaleString('nl-NL')}
                </dd>
              </div>
              {selectedTask.due && (
                <div>
                  <dt className="text-gray-500">Deadline</dt>
                  <dd className="font-medium text-red-600">
                    {new Date(selectedTask.due).toLocaleString('nl-NL')}
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-gray-500">Status</dt>
                <dd>
                  {selectedTask.assignee ? (
                    <span className="text-blue-700 font-medium">Geclaimd</span>
                  ) : (
                    <span className="text-yellow-700 font-medium">Openstaand</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Taak ID</dt>
                <dd className="font-mono text-xs text-gray-600 truncate">{selectedTask.id}</dd>
              </div>
            </dl>

            {detailLoading && <p className="text-sm text-gray-400 mb-6">Procesgegevens laden...</p>}

            {taskVariables && Object.keys(taskVariables).length > 0 && (
              <div className="mb-6 border border-gray-200 rounded-lg overflow-hidden">
                <button
                  onClick={() => setProcessDataOpen((o) => !o)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                >
                  <span className="text-sm font-medium text-gray-700">Procesgegevens</span>
                  <span className="text-xs text-gray-400">
                    {processDataOpen ? '▲ Verbergen' : '▼ Tonen'}
                  </span>
                </button>
                {processDataOpen && (
                  <div className="bg-white p-4 space-y-2">
                    {Object.entries(taskVariables)
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
                  </div>
                )}
              </div>
            )}

            {!selectedTask.assignee ? (
              <button
                onClick={handleClaim}
                disabled={claiming}
                className="px-5 py-2 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                style={{ backgroundColor: 'var(--color-primary)' }}
              >
                {claiming ? 'Claimen...' : 'Taak claimen'}
              </button>
            ) : (
              <TaskFormViewer
                taskId={selectedTask.id}
                variables={taskVariables}
                onCompleted={() => {
                  setActionMessage({ type: 'success', text: 'Taak voltooid.' });
                  setSelectedTask(null);
                  setTaskVariables(null);
                  loadTasks();
                }}
                onError={() => setActionMessage({ type: 'error', text: 'Opslaan mislukt.' })}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
