/* eslint-disable @typescript-eslint/no-unused-vars */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import keycloak, { getUser } from '../services/keycloak';
import { businessApi } from '../services/api';
import { initializeTenantTheme } from '../services/tenant';
import type { KeycloakUser, Task } from '@ronl/shared';
import TaskFormViewer from '../components/CaseWorkerDashboard/TaskFormViewer';

type Tab = 'taken' | 'beheer';

export default function CaseworkerDashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState<KeycloakUser | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('taken');

  // Task queue state
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState<string | null>(null);

  // Task detail state
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [taskVariables, setTaskVariables] = useState<Record<string, unknown> | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [actionMessage, setActionMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    if (!keycloak.authenticated) {
      navigate('/', { replace: true });
      return;
    }
    const currentUser = getUser();
    setUser(currentUser);
    if (currentUser?.municipality) {
      initializeTenantTheme(currentUser.municipality);
    }
  }, [navigate]);

  // Load tasks when tab is active
  useEffect(() => {
    if (activeTab === 'taken') {
      loadTasks();
    }
  }, [activeTab]);

  const loadTasks = async () => {
    setTasksLoading(true);
    setTasksError(null);
    try {
      const res = await businessApi.task.list();
      if (res.success) setTasks(res.data as Task[]);
      else setTasksError('Taken konden niet worden geladen.');
    } catch {
      setTasksError('Taken konden niet worden geladen.');
    } finally {
      setTasksLoading(false);
    }
  };

  const handleSelectTask = async (task: Task) => {
    setSelectedTask(task);
    setTaskVariables(null);
    setActionMessage(null);
    setDetailLoading(true);
    try {
      const res = await businessApi.task.variables(task.id);
      if (res.success) setTaskVariables(res.data as Record<string, unknown>);
    } catch {
      // Variables not critical — continue showing task
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

  const handleLogout = () => keycloak.logout({ redirectUri: window.location.origin });

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header style={{ backgroundColor: 'var(--color-primary)' }} className="text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">MijnOmgeving — Medewerker</h1>
            <p className="text-sm opacity-90 capitalize">Gemeente {user?.municipality ?? ''}</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium">
              {user?.name ?? user?.preferred_username ?? 'Medewerker'}
            </p>
            <div className="flex items-center gap-2 text-xs opacity-80 mt-0.5 justify-end">
              <span
                className="px-2 py-0.5 rounded"
                style={{ backgroundColor: 'var(--color-primary-dark)' }}
              >
                caseworker
              </span>
            </div>
            <button onClick={handleLogout} className="mt-1 text-sm underline hover:opacity-80">
              Uitloggen
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex gap-1">
            {(
              [
                { id: 'taken', label: 'Taakwachtrij' },
                { id: 'beheer', label: 'Beheer' },
              ] as { id: Tab; label: string }[]
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-5 py-3 text-sm font-medium transition-colors border-b-2 ${
                  activeTab === tab.id
                    ? 'border-white text-white'
                    : 'border-transparent text-white/70 hover:text-white hover:border-white/50'
                }`}
              >
                {tab.label}
                {tab.id === 'taken' && tasks.length > 0 && (
                  <span className="ml-2 bg-white/20 text-white text-xs px-1.5 py-0.5 rounded-full">
                    {tasks.length}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        {/* ── Taakwachtrij ── */}
        {activeTab === 'taken' && (
          <div className="flex gap-6 h-full">
            {/* Task list */}
            <div className="w-full lg:w-96 flex-shrink-0">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-800">Taken</h2>
                <button
                  onClick={loadTasks}
                  className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
                >
                  ↺ Vernieuwen
                </button>
              </div>

              {tasksLoading && (
                <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
                  Taken laden...
                </div>
              )}
              {tasksError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
                  {tasksError}
                </div>
              )}
              {!tasksLoading && !tasksError && tasks.length === 0 && (
                <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
                  Geen openstaande taken.
                </div>
              )}
              {!tasksLoading && tasks.length > 0 && (
                <div className="space-y-2">
                  {tasks.map((task) => (
                    <button
                      key={task.id}
                      onClick={() => handleSelectTask(task)}
                      className={`w-full text-left bg-white rounded-lg shadow p-4 transition-all border-2 ${
                        selectedTask?.id === task.id
                          ? 'border-primary shadow-md'
                          : 'border-transparent hover:border-gray-200'
                      }`}
                      style={
                        selectedTask?.id === task.id ? { borderColor: 'var(--color-primary)' } : {}
                      }
                    >
                      <p className="font-medium text-gray-800 truncate">{task.name}</p>
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
              )}
            </div>

            {/* Task detail */}
            <div className="flex-1">
              {!selectedTask ? (
                <div className="bg-white rounded-lg shadow p-8 text-center text-gray-400">
                  Selecteer een taak om de details te bekijken.
                </div>
              ) : (
                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-start justify-between mb-6">
                    <div>
                      <h3 className="text-xl font-bold text-gray-800">{selectedTask.name}</h3>
                      {selectedTask.description && (
                        <p className="text-gray-500 mt-1 text-sm">{selectedTask.description}</p>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        setSelectedTask(null);
                        setTaskVariables(null);
                        setActionMessage(null);
                      }}
                      className="text-gray-400 hover:text-gray-600 text-xl leading-none"
                    >
                      ×
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
                      <dd className="font-mono text-xs text-gray-600 truncate">
                        {selectedTask.id}
                      </dd>
                    </div>
                  </dl>

                  {/* Process variables */}
                  {detailLoading && (
                    <p className="text-sm text-gray-400 mb-6">Procesgegevens laden...</p>
                  )}
                  {taskVariables && Object.keys(taskVariables).length > 0 && (
                    <div className="mb-6">
                      <h4 className="text-sm font-semibold text-gray-700 mb-3">Procesgegevens</h4>
                      <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                        {Object.entries(taskVariables)
                          .filter(
                            ([key]) =>
                              !['municipality', 'initiator', 'assuranceLevel'].includes(key)
                          )
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
                    </div>
                  )}

                  {/* Actions — task-type specific */}
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
        )}

        {/* ── Beheer ── */}
        {activeTab === 'beheer' && (
          <div className="bg-white rounded-lg shadow p-8 text-center max-w-lg">
            <div className="text-4xl mb-4">⚙️</div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">Beheer</h2>
            <p className="text-gray-500">Dienstenbeheer voor uw gemeente is in ontwikkeling.</p>
          </div>
        )}
      </main>
    </div>
  );
}
