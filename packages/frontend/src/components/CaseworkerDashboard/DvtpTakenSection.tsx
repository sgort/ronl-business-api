import { useEffect, useState } from 'react';
import { businessApi } from '../../services/api';
import type { KeycloakUser, Task } from '@ronl/shared';
import TaskFormViewer from './TaskFormViewer';

const DVTP_PROCESS_KEY = 'DvtpToestemmingGevenProcess';

interface Props {
  user: KeycloakUser | null;
}

export default function DvtpTakenSection({ user }: Props) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [taskVariables, setTaskVariables] = useState<Record<string, unknown> | null>(null);
  const [claiming, setClaiming] = useState(false);
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
        const all = res.data as Task[];
        setTasks(all.filter((t) => t.processDefinitionKey === DVTP_PROCESS_KEY));
      } else {
        setError('Taken konden niet worden geladen.');
      }
    } catch {
      setError('Taken konden niet worden geladen.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectTask = async (task: Task) => {
    setSelectedTask(task);
    setTaskVariables(null);
    setActionMessage(null);

    try {
      const res = await businessApi.task.variables(task.id);
      if (res.success) setTaskVariables(res.data as Record<string, unknown>);
    } catch {
      // not critical
    }

    if (!task.assignee) {
      setClaiming(true);
      try {
        const res = await businessApi.task.claim(task.id);
        if (res.success) {
          setSelectedTask({ ...task, assignee: user?.sub ?? 'claimed' });
          loadTasks();
        } else {
          setActionMessage({ type: 'error', text: 'Taak kon niet worden geclaimd.' });
        }
      } catch {
        setActionMessage({ type: 'error', text: 'Taak kon niet worden geclaimd.' });
      } finally {
        setClaiming(false);
      }
    }
  };

  useEffect(() => {
    loadTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex gap-6 h-full">
      {/* ── Task list ── */}
      <div className="w-72 flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-800">Mijn taken</h2>
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
            <p className="text-2xl mb-2">📭</p>
            <p>Geen openstaande taken.</p>
            <p className="text-xs mt-2 text-gray-400">Start eerst een toestemmingsprocedure.</p>
          </div>
        )}
        {!loading && tasks.length > 0 && (
          <div className="space-y-2">
            {tasks
              .slice()
              .sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime())
              .map((task) => (
                <button
                  key={task.id}
                  onClick={() => handleSelectTask(task)}
                  className="w-full text-left bg-white rounded-lg shadow-sm p-4 transition-all border-2"
                  style={
                    selectedTask?.id === task.id
                      ? { borderColor: 'var(--color-primary)' }
                      : { borderColor: 'transparent' }
                  }
                >
                  <p className="text-sm font-medium text-gray-800 truncate">{task.name}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(task.created).toLocaleString('nl-NL')}
                  </p>
                  <span
                    className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full ${
                      task.assignee ? 'bg-blue-50 text-blue-700' : 'bg-yellow-50 text-yellow-700'
                    }`}
                  >
                    {task.assignee ? 'Geclaimd' : 'Openstaand'}
                  </span>
                </button>
              ))}
          </div>
        )}
      </div>

      {/* ── Task detail ── */}
      <div className="flex-1">
        {!selectedTask ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center text-gray-400">
            <p className="text-3xl mb-2">☑️</p>
            <p className="text-sm">Selecteer een taak om verder te gaan.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-base font-semibold text-gray-800 mb-4">{selectedTask.name}</h3>

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

            {claiming ? (
              <div className="flex items-center gap-2 text-sm text-gray-500 py-4">
                <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                Taak claimen...
              </div>
            ) : selectedTask.assignee ? (
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
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
