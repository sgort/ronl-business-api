/* eslint-disable @typescript-eslint/no-unused-vars */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import keycloak, { getUser } from '../services/keycloak';
import { businessApi } from '../services/api';
import type { NieuwsItem, BerichtItem } from '../services/api';
import {
  initializeTenantTheme,
  loadTenantConfigs,
  getTenantConfig,
  getDefaultTenantConfig,
} from '../services/tenant';
import type { TenantConfig, LeftPanelSection } from '../services/tenant';
import type { KeycloakUser, Task } from '@ronl/shared';
import TaskFormViewer from '../components/CaseWorkerDashboard/TaskFormViewer';
import DecisionViewer from '../components/DecisionViewer';
import RegelCatalogus from '../components/CaseWorkerDashboard/RegelCatalogus';
import ChangelogPanel from './ChangelogPanel';

type TopNavPage = 'home' | 'personal-info' | 'projects';

const TOP_NAV_ITEMS: { id: TopNavPage; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'personal-info', label: 'Persoonlijke info' },
  { id: 'projects', label: 'Projecten' },
];

const PRIORITY_STYLES: Record<string, string> = {
  high: 'bg-red-100 text-red-700',
  normal: 'bg-blue-100 text-blue-700',
  low: 'bg-gray-100 text-gray-600',
};

const TYPE_LABELS: Record<string, string> = {
  announcement: 'Mededeling',
  maintenance: 'Onderhoud',
  update: 'Update',
};

export default function CaseworkerDashboard() {
  const navigate = useNavigate();

  const [isAuthenticated] = useState(() => !!keycloak.authenticated);
  const [user, setUser] = useState<KeycloakUser | null>(null);
  const [tenantConfig, setTenantConfig] = useState<TenantConfig | null>(null);

  const [activeTopNavPage, setActiveTopNavPage] = useState<TopNavPage>('home');
  const [activeSection, setActiveSection] = useState<string | null>(null);

  const [changelogOpen, setChangelogOpen] = useState(false);

  // Tasks
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [taskVariables, setTaskVariables] = useState<Record<string, unknown> | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [actionMessage, setActionMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Nieuws
  const [nieuwsItems, setNieuwsItems] = useState<NieuwsItem[]>([]);
  const [nieuwsLoading, setNieuwsLoading] = useState(false);
  const [nieuwsError, setNieuwsError] = useState<string | null>(null);

  // Berichten
  const [berichtenItems, setBerichtenItems] = useState<BerichtItem[]>([]);
  const [berichtenLoading, setBerichtenLoading] = useState(false);
  const [berichtenError, setBerichtenError] = useState<string | null>(null);

  // Profiel onboarding enrichment
  const [onboardingStarted, setOnboardingStarted] = useState(false);
  const [profielData, setProfielData] = useState<Record<string, unknown> | null | undefined>(
    undefined
  );
  const [profielLoading, setProfielLoading] = useState(false);
  const [profielError, setProfielError] = useState<string | null>(null);
  const [employeeIdInput, setEmployeeIdInput] = useState('');
  const [onboardingArchief, setOnboardingArchief] = useState<
    Array<{
      id: string;
      startTime: string;
      endTime: string;
      employeeId: string;
      firstName: string;
      lastName: string;
    }>
  >([]);
  const [onboardingArchiefLoading, setOnboardingArchiefLoading] = useState(false);
  const [onboardingArchiefError, setOnboardingArchiefError] = useState<string | null>(null);
  const [selectedOnboarding, setSelectedOnboarding] = useState<string | null>(null);

  // ── Init ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (isAuthenticated) {
      const currentUser = getUser();
      setUser(currentUser);
      if (currentUser?.municipality) {
        initializeTenantTheme(currentUser.municipality).then(() => {
          loadTenantConfigs().then(() => {
            setTenantConfig(getTenantConfig(currentUser.municipality!));
          });
        });
      }
    } else {
      loadTenantConfigs().then(() => {
        setTenantConfig(getDefaultTenantConfig());
      });
    }
  }, [isAuthenticated]);

  // Reset active section when page or tenant config changes
  useEffect(() => {
    if (!tenantConfig) return;
    const sections = tenantConfig.leftPanelSections?.[activeTopNavPage] ?? [];
    if (isAuthenticated) {
      setActiveSection(sections.length > 0 ? sections[0].id : null);
    } else {
      const firstPublic = sections.find((s) => s.isPublic !== false);
      setActiveSection(firstPublic?.id ?? sections[0]?.id ?? null);
    }
  }, [activeTopNavPage, tenantConfig, isAuthenticated]);

  // Load section data when activeSection changes
  useEffect(() => {
    if (activeSection === 'taken' && isAuthenticated) loadTasks();
    if (activeSection === 'nieuws' && nieuwsItems.length === 0) loadNieuws();
    if (activeSection === 'berichten' && berichtenItems.length === 0) loadBerichten();
    // existing lines stay as-is, add:
    if (activeSection === 'regelcatalogus') {
      /* data fetched inside component */
    }
    if (activeSection === 'onboarding-archief' && isAuthenticated) loadOnboardingArchief();
    if (
      (activeSection === 'profiel' || activeSection === 'rollen') &&
      isAuthenticated &&
      profielData === undefined &&
      !profielLoading &&
      user?.employeeId
    )
      loadProfiel(user.employeeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeSection,
    berichtenItems.length,
    isAuthenticated,
    nieuwsItems.length,
    profielData,
    profielLoading,
    user?.employeeId,
  ]);

  // ── Data fetchers ─────────────────────────────────────────────────────────

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

  const loadNieuws = async () => {
    setNieuwsLoading(true);
    setNieuwsError(null);
    try {
      const res = await businessApi.portal.nieuws(10);
      if (res.success && res.data) setNieuwsItems(res.data.items);
      else setNieuwsError('Nieuws kon niet worden geladen.');
    } catch {
      setNieuwsError('Nieuws kon niet worden geladen.');
    } finally {
      setNieuwsLoading(false);
    }
  };

  const loadBerichten = async () => {
    setBerichtenLoading(true);
    setBerichtenError(null);
    try {
      const res = await businessApi.portal.berichten(10);
      if (res.success && res.data) setBerichtenItems(res.data.items);
      else setBerichtenError('Berichten konden niet worden geladen.');
    } catch {
      setBerichtenError('Berichten konden niet worden geladen.');
    } finally {
      setBerichtenLoading(false);
    }
  };

  const loadProfiel = async (employeeId: string) => {
    setProfielLoading(true);
    setProfielError(null);
    try {
      const res = await businessApi.hr.profile(employeeId);
      if (res.success) setProfielData(res.data ?? null);
      else setProfielData(null);
    } catch {
      setProfielError('Onboardingprofiel kon niet worden geladen.');
      setProfielData(null);
    } finally {
      setProfielLoading(false);
    }
  };

  const loadOnboardingArchief = async () => {
    setOnboardingArchiefLoading(true);
    setOnboardingArchiefError(null);
    try {
      const res = await businessApi.hr.completed();
      if (res.success) setOnboardingArchief(res.data as typeof onboardingArchief);
      else setOnboardingArchiefError('Afgeronde onboardingen konden niet worden geladen.');
    } catch {
      setOnboardingArchiefError('Afgeronde onboardingen konden niet worden geladen.');
    } finally {
      setOnboardingArchiefLoading(false);
    }
  };

  // ── Task actions ──────────────────────────────────────────────────────────

  const handleSelectTask = async (task: Task) => {
    setSelectedTask(task);
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

  // ── Navigation ────────────────────────────────────────────────────────────

  const handleLogin = () => {
    sessionStorage.setItem('selected_idp', 'medewerker');
    navigate('/auth');
  };

  const handleLogout = () =>
    keycloak.logout({
      redirectUri: `${window.location.origin}/dashboard/caseworker`,
    });

  // ── Helpers ───────────────────────────────────────────────────────────────

  const leftPanelSections: LeftPanelSection[] =
    tenantConfig?.leftPanelSections?.[activeTopNavPage] ?? [];

  function isSectionPublic(sectionId: string | null): boolean {
    if (!sectionId) return true;
    const section = leftPanelSections.find((s) => s.id === sectionId);
    return section?.isPublic !== false;
  }

  function formatDate(iso: string): string {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('nl-NL', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  // ── Content renderers ─────────────────────────────────────────────────────

  function renderLoginPrompt() {
    return (
      <div className="max-w-lg">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <div className="text-4xl mb-4">🏛️</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Welkom bij MijnOmgeving</h2>
          <p className="text-gray-500 mb-6 text-sm leading-relaxed">
            Dit is het medewerkersportaal. Log in om uw taken te bekijken en te werken aan zaken die
            aan u zijn toegewezen of geclaimd kunnen worden.
          </p>
          <button
            onClick={handleLogin}
            className="flex items-center gap-2 px-5 py-2.5 text-white rounded-lg text-sm font-semibold transition-colors"
            style={{ backgroundColor: 'var(--color-primary, #154273)' }}
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M6 6V5a3 3 0 013-3h2a3 3 0 013 3v1h2a2 2 0 012 2v3.57A22.952 22.952 0 0110 13a22.95 22.95 0 01-8-1.43V8a2 2 0 012-2h2zm2-1a1 1 0 011-1h2a1 1 0 011 1v1H8V5zm1 5a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1z"
                clipRule="evenodd"
              />
              <path d="M2 13.692V16a2 2 0 002 2h12a2 2 0 002-2v-2.308A24.974 24.974 0 0110 15c-2.796 0-5.487-.46-8-1.308z" />
            </svg>
            Inloggen als medewerker
          </button>
        </div>
      </div>
    );
  }

  function renderTaskQueue() {
    return (
      <div className="flex gap-6 h-full">
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

          {tasksLoading && (
            <div className="bg-white rounded-lg shadow-sm p-6 text-center text-gray-500 text-sm">
              Taken laden...
            </div>
          )}
          {tasksError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
              {tasksError}
            </div>
          )}
          {!tasksLoading && !tasksError && tasks.length === 0 && (
            <div className="bg-white rounded-lg shadow-sm p-6 text-center text-gray-500 text-sm">
              Geen openstaande taken.
            </div>
          )}
          {!tasksLoading && tasks.length > 0 && (
            <div className="space-y-2">
              {tasks.map((task) => (
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
          )}
        </div>

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
                  <dd className="font-mono text-xs text-gray-600 truncate">{selectedTask.id}</dd>
                </div>
              </dl>

              {detailLoading && (
                <p className="text-sm text-gray-400 mb-6">Procesgegevens laden...</p>
              )}
              {taskVariables && Object.keys(taskVariables).length > 0 && (
                <div className="mb-6">
                  <h4 className="text-sm font-semibold text-gray-700 mb-3">Procesgegevens</h4>
                  <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                    {Object.entries(taskVariables)
                      .filter(
                        ([key]) => !['municipality', 'initiator', 'assuranceLevel'].includes(key)
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

  function renderNieuws() {
    if (nieuwsLoading) {
      return (
        <div className="max-w-2xl space-y-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
              <div className="h-3 bg-gray-100 rounded w-full mb-1" />
              <div className="h-3 bg-gray-100 rounded w-2/3" />
            </div>
          ))}
        </div>
      );
    }

    if (nieuwsError) {
      return (
        <div className="max-w-2xl bg-red-50 border border-red-200 rounded-xl p-5 text-red-700 text-sm">
          {nieuwsError}
          <button onClick={loadNieuws} className="ml-3 underline">
            Opnieuw proberen
          </button>
        </div>
      );
    }

    if (nieuwsItems.length === 0) {
      return (
        <div className="max-w-2xl bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">
          Geen nieuwsberichten beschikbaar.
        </div>
      );
    }

    return (
      <div className="max-w-2xl space-y-3">
        {nieuwsItems.map((item) => (
          <article key={item.id} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                {item.url ? (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-gray-900 text-sm hover:underline"
                    style={{ color: 'var(--color-primary)' }}
                  >
                    {item.title}
                  </a>
                ) : (
                  <p className="font-semibold text-gray-900 text-sm">{item.title}</p>
                )}
                <p className="text-gray-500 text-sm mt-1 leading-relaxed line-clamp-2">
                  {item.summary}
                </p>
              </div>
              {item.category && (
                <span className="flex-shrink-0 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                  {item.category}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-3 text-xs text-gray-400">
              <span>{item.source.name}</span>
              {item.publishedAt && (
                <>
                  <span>·</span>
                  <span>{formatDate(item.publishedAt)}</span>
                </>
              )}
              {item.url && (
                <>
                  <span>·</span>

                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline"
                    style={{ color: 'var(--color-primary)' }}
                  >
                    Lees meer →
                  </a>
                </>
              )}
            </div>
          </article>
        ))}
      </div>
    );
  }

  function renderBerichten() {
    if (berichtenLoading) {
      return (
        <div className="max-w-2xl space-y-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-2/3 mb-2" />
              <div className="h-3 bg-gray-100 rounded w-full" />
            </div>
          ))}
        </div>
      );
    }

    if (berichtenError) {
      return (
        <div className="max-w-2xl bg-red-50 border border-red-200 rounded-xl p-5 text-red-700 text-sm">
          {berichtenError}
          <button onClick={loadBerichten} className="ml-3 underline">
            Opnieuw proberen
          </button>
        </div>
      );
    }

    if (berichtenItems.length === 0) {
      return (
        <div className="max-w-2xl bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">
          Er zijn momenteel geen berichten.
        </div>
      );
    }

    return (
      <div className="max-w-2xl space-y-2">
        {berichtenItems.map((item) => (
          <article
            key={item.id}
            className={`bg-white rounded-xl border p-5 ${
              item.isRead ? 'border-gray-200' : 'border-l-4'
            }`}
            style={!item.isRead ? { borderLeftColor: 'var(--color-primary)' } : {}}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {!item.isRead && (
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: 'var(--color-primary)' }}
                    />
                  )}
                  <p className="font-semibold text-gray-900 text-sm truncate">{item.subject}</p>
                </div>
                <p className="text-gray-500 text-sm leading-relaxed">{item.preview}</p>
                {item.action && (
                  <a
                    href={item.action.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block mt-2 text-xs font-medium hover:underline"
                    style={{ color: 'var(--color-primary)' }}
                  >
                    {item.action.label} →
                  </a>
                )}
              </div>
              <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                <span
                  className={`text-xs px-2 py-0.5 rounded ${
                    PRIORITY_STYLES[item.priority] ?? PRIORITY_STYLES.normal
                  }`}
                >
                  {TYPE_LABELS[item.type] ?? item.type}
                </span>
                {item.expiresAt && new Date(item.expiresAt) > new Date() && (
                  <span className="text-xs text-orange-500">t/m {formatDate(item.expiresAt)}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 mt-3 text-xs text-gray-400">
              <span>{item.sender.name}</span>
              <span>·</span>
              <span>{formatDate(item.publishedAt)}</span>
            </div>
          </article>
        ))}
      </div>
    );
  }

  function renderProfiel() {
    const LOA_LABELS: Record<string, string> = {
      basis: 'Basis',
      midden: 'Midden',
      substantieel: 'Substantieel',
      hoog: 'Hoog',
    };

    const handleFetchOnboarding = async () => {
      if (!employeeIdInput.trim()) return;
      await loadProfiel(employeeIdInput.trim());
    };

    return (
      <div className="max-w-2xl space-y-4">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
            Persoonlijke gegevens
          </h2>
          <dl className="space-y-3">
            {(
              [
                { label: 'Naam', value: user?.name },
                { label: 'Gebruikersnaam', value: user?.preferred_username },
                { label: 'Medewerker-ID', value: user?.employeeId },
                { label: 'Gemeente', value: tenantConfig?.displayName ?? user?.municipality },
                {
                  label: 'Beveiligingsniveau',
                  value: user?.loa ? (LOA_LABELS[user.loa] ?? user.loa) : undefined,
                },
                {
                  label: 'Rollen',
                  value: user?.roles?.length ? user.roles.join(', ') : undefined,
                },
              ] as { label: string; value: string | undefined }[]
            )
              .filter((f) => Boolean(f.value))
              .map(({ label, value }) => (
                <div key={label} className="flex gap-4">
                  <dt className="w-44 text-sm text-gray-400 flex-shrink-0">{label}</dt>
                  <dd className="text-sm text-gray-900 font-medium">{value}</dd>
                </div>
              ))}
          </dl>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Onboardinggegevens
          </h2>

          {profielLoading && (
            <div className="animate-pulse space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex gap-4">
                  <div className="h-3 bg-gray-200 rounded w-1/4" />
                  <div className="h-3 bg-gray-200 rounded w-1/3" />
                </div>
              ))}
            </div>
          )}

          {!profielLoading && profielError && (
            <p className="text-sm text-red-500">{profielError}</p>
          )}

          {!profielLoading && !user?.employeeId && profielData === undefined && (
            <>
              <p className="text-sm text-gray-400 mb-4">
                Voer uw medewerker-ID in om uw onboardingprofiel op te halen.
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={employeeIdInput}
                  onChange={(e) => setEmployeeIdInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleFetchOnboarding()}
                  placeholder="bijv. emp-001"
                  className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
                <button
                  onClick={handleFetchOnboarding}
                  disabled={!employeeIdInput.trim()}
                  className="px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-40"
                  style={{ backgroundColor: 'var(--color-primary)' }}
                >
                  Ophalen
                </button>
              </div>
            </>
          )}

          {!profielLoading && profielData === null && !profielError && (
            <p className="text-sm text-gray-400">
              Geen onboardingprofiel gevonden.{' '}
              {user?.roles?.includes('hr-medewerker') && (
                <span>
                  Gebruik <strong>Medewerker onboarden</strong> om een profiel aan te maken.
                </span>
              )}
            </p>
          )}

          {!profielLoading && profielData && (
            <dl className="space-y-3">
              <div className="flex justify-end mb-1">
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                  Onboarding voltooid
                </span>
              </div>
              {(
                [
                  { label: 'Voornaam', value: profielData.firstName as string | undefined },
                  { label: 'Achternaam', value: profielData.lastName as string | undefined },
                  { label: 'Afdeling', value: profielData.department as string | undefined },
                  { label: 'Functie', value: profielData.jobFunction as string | undefined },
                  { label: 'Toegangsniveau', value: profielData.accessLevel as string | undefined },
                  {
                    label: 'Toegewezen rollen',
                    value: profielData.assignedRoles as string | undefined,
                  },
                ] as { label: string; value: string | undefined }[]
              )
                .filter((f) => Boolean(f.value))
                .map(({ label, value }) => (
                  <div key={label} className="flex gap-4">
                    <dt className="w-44 text-sm text-gray-400 flex-shrink-0">{label}</dt>
                    <dd className="text-sm text-gray-900 font-medium capitalize">{value}</dd>
                  </div>
                ))}
            </dl>
          )}
        </div>
      </div>
    );
  }

  function renderRollen() {
    const ROLE_DESCRIPTIONS: Record<string, string> = {
      caseworker: 'Behandelen van aanvragen en zaken',
      'hr-medewerker': 'Beheren van medewerker onboarding',
      'rip-verkenner': 'Verkenningsfase van RIP-projecten',
      'rip-planner': 'Planvoorbereiding en contractvorming',
      'rip-inkoop': 'Aanbestedingen en inkoop',
      'rip-contractbeheer': 'Contractbeheersing',
      'rip-projectleider': 'Projectleiding en decharge',
      'rip-toetser': 'Toetsproces',
      'rip-kwaliteit': 'Kwaliteitstoetsing',
      admin: 'Beheerder',
    };

    const ACCESS_LEVEL_DESCRIPTIONS: Record<string, string> = {
      basis: 'Standaard toegang tot eigen taken en zaken',
      uitgebreid: 'Uitgebreide toegang inclusief rapportages',
      admin: 'Volledige toegang tot alle functionaliteiten',
    };

    const jwtRoles = user?.roles ?? [];
    const onboardingRoles = profielData?.assignedRoles
      ? (profielData.assignedRoles as string).split(',').map((r) => r.trim())
      : null;
    const accessLevel = profielData?.accessLevel as string | undefined;

    return (
      <div className="max-w-2xl space-y-4">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
            Toegewezen rollen
          </h2>

          {profielLoading && (
            <div className="animate-pulse space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="h-10 bg-gray-100 rounded-lg" />
              ))}
            </div>
          )}

          {!profielLoading && (
            <ul className="space-y-2">
              {(onboardingRoles ?? jwtRoles).map((role) => (
                <li
                  key={role}
                  className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 border border-gray-100"
                >
                  <span
                    className="mt-0.5 w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: 'var(--color-primary)' }}
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{role}</p>
                    {ROLE_DESCRIPTIONS[role] && (
                      <p className="text-xs text-gray-400 mt-0.5">{ROLE_DESCRIPTIONS[role]}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {!profielLoading && accessLevel && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Toegangsniveau
            </h2>
            <div className="flex items-center gap-3">
              <span
                className="text-sm font-semibold capitalize px-3 py-1 rounded-full text-white"
                style={{ backgroundColor: 'var(--color-primary)' }}
              >
                {accessLevel}
              </span>
              {ACCESS_LEVEL_DESCRIPTIONS[accessLevel] && (
                <p className="text-sm text-gray-500">{ACCESS_LEVEL_DESCRIPTIONS[accessLevel]}</p>
              )}
            </div>
          </div>
        )}

        {!profielLoading && !profielData && !user?.employeeId && (
          <p className="text-sm text-gray-400 px-1">
            Koppel uw medewerker-ID via <strong>Profiel</strong> om gedetailleerde rolinformatie te
            zien.
          </p>
        )}
      </div>
    );
  }

  function renderHrOnboarding() {
    const isHrMedewerker = user?.roles?.includes('hr-medewerker');

    if (!isHrMedewerker) {
      return (
        <div className="max-w-lg">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
            <p className="text-3xl mb-4 text-gray-300">🔒</p>
            <h2 className="text-lg font-bold text-gray-800 mb-2">Toegang beperkt</h2>
            <p className="text-gray-400 text-sm">
              Alleen HR-medewerkers kunnen onboardingsprocessen starten.
            </p>
          </div>
        </div>
      );
    }

    if (onboardingStarted) {
      return (
        <div className="max-w-lg">
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <p className="text-3xl mb-4">✅</p>
            <h2 className="text-lg font-bold text-gray-800 mb-2">Onboardingsproces gestart</h2>
            <p className="text-gray-500 text-sm mb-5">
              De taak staat klaar in de wachtrij. Ga naar <strong>Projecten → Taken</strong> om de
              gegevens in te vullen.
            </p>
            <button
              onClick={() => setOnboardingStarted(false)}
              className="text-sm font-medium hover:underline"
              style={{ color: 'var(--color-primary)' }}
            >
              Nieuw onboardingsproces starten
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="max-w-2xl">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-800 mb-1">Medewerker onboarden</h2>
          <p className="text-sm text-gray-500 mb-6 leading-relaxed">
            Start een onboardingsproces voor een nieuwe medewerker. Na het starten verschijnt de
            taak in de wachtrij waar u de medewerkergegevens kunt invullen.
          </p>
          <button
            onClick={async () => {
              try {
                const res = await businessApi.process.start('HrOnboardingProcess', {});
                if (res.success) {
                  setOnboardingStarted(true);
                } else {
                  setActionMessage({
                    type: 'error',
                    text: 'Onboardingsproces kon niet worden gestart.',
                  });
                }
              } catch {
                setActionMessage({
                  type: 'error',
                  text: 'Onboardingsproces kon niet worden gestart.',
                });
              }
            }}
            className="px-5 py-2.5 text-sm font-medium text-white rounded-lg transition-opacity hover:opacity-90"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            Onboardingsproces starten
          </button>
        </div>
      </div>
    );
  }

  function renderOnboardingArchief() {
    const isHrMedewerker = user?.roles?.includes('hr-medewerker');

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

    if (onboardingArchiefLoading) {
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

    if (onboardingArchiefError) {
      return (
        <div className="max-w-2xl bg-red-50 border border-red-200 rounded-xl p-5 text-red-700 text-sm">
          {onboardingArchiefError}
          <button onClick={loadOnboardingArchief} className="ml-3 underline">
            Opnieuw proberen
          </button>
        </div>
      );
    }

    if (onboardingArchief.length === 0) {
      return (
        <div className="max-w-2xl bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">
          Geen afgeronde onboardingen gevonden.
        </div>
      );
    }

    return (
      <div className="max-w-2xl space-y-3">
        {onboardingArchief.map((record) => (
          <div
            key={record.id}
            className="bg-white rounded-xl border border-gray-200 overflow-hidden"
          >
            <button
              onClick={() =>
                setSelectedOnboarding(selectedOnboarding === record.id ? null : record.id)
              }
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
              <span className="text-gray-400 text-lg">
                {selectedOnboarding === record.id ? '▲' : '▼'}
              </span>
            </button>

            {selectedOnboarding === record.id && (
              <div className="border-t border-gray-100 p-5">
                <DecisionViewer processInstanceId={record.id} showFallback={false} />
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  function renderContent() {
    if (!isAuthenticated && !isSectionPublic(activeSection)) {
      return renderLoginPrompt();
    }

    if (!activeSection) return null;

    switch (activeSection) {
      case 'taken':
        return renderTaskQueue();
      case 'nieuws':
        return renderNieuws();
      case 'berichten':
        return renderBerichten();
      case 'regelcatalogus':
        return <RegelCatalogus />;
      case 'profiel':
        return renderProfiel();
      case 'hr-onboarding':
        return renderHrOnboarding();
      case 'onboarding-archief':
        return renderOnboardingArchief();
      case 'rollen':
        return renderRollen();
      default: {
        const sectionLabel =
          leftPanelSections.find((s) => s.id === activeSection)?.label ?? activeSection;
        return (
          <div className="max-w-lg">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
              <p className="text-3xl mb-4 text-gray-300">◻</p>
              <h2 className="text-lg font-bold text-gray-800 mb-2">{sectionLabel}</h2>
              <p className="text-gray-400 text-sm">Deze sectie is in ontwikkeling.</p>
            </div>
          </div>
        );
      }
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* ── Top navigation bar ── */}
      <header
        className="text-white shadow-lg flex-shrink-0"
        style={{ backgroundColor: 'var(--color-primary, #154273)' }}
      >
        <div className="px-4 sm:px-6 lg:px-8 py-3 flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold leading-tight">MijnOmgeving</h1>
            {isAuthenticated && user?.municipality && (
              <p className="text-xs opacity-80 capitalize mt-0.5">
                {tenantConfig?.displayName ?? `Gemeente ${user.municipality}`}
              </p>
            )}
          </div>

          <div className="flex items-center gap-3">
            {isAuthenticated ? (
              <div className="text-right">
                <p className="text-sm font-medium">{user?.preferred_username ?? 'Ingelogd'}</p>
                <div className="flex items-center gap-1 text-xs opacity-80 mt-0.5 justify-end flex-wrap">
                  {user?.loa && (
                    <span
                      className="px-2 py-0.5 rounded"
                      style={{ backgroundColor: 'var(--color-primary-dark, #0d2f4f)' }}
                    >
                      LoA: {user.loa}
                    </span>
                  )}
                  {(user?.roles ?? []).map((role) => (
                    <span
                      key={role}
                      className="px-2 py-0.5 rounded"
                      style={{ backgroundColor: 'var(--color-primary-dark, #0d2f4f)' }}
                    >
                      {role}
                    </span>
                  ))}
                </div>
                <button onClick={handleLogout} className="mt-1 text-xs underline hover:opacity-80">
                  Uitloggen
                </button>
              </div>
            ) : (
              <button
                onClick={handleLogin}
                className="flex items-center gap-2 px-4 py-2 bg-white/15 hover:bg-white/25 rounded-lg text-sm font-semibold transition-colors border border-white/30"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M6 6V5a3 3 0 013-3h2a3 3 0 013 3v1h2a2 2 0 012 2v3.57A22.952 22.952 0 0110 13a22.95 22.95 0 01-8-1.43V8a2 2 0 012-2h2zm2-1a1 1 0 011-1h2a1 1 0 011 1v1H8V5zm1 5a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1z"
                    clipRule="evenodd"
                  />
                  <path d="M2 13.692V16a2 2 0 002 2h12a2 2 0 002-2v-2.308A24.974 24.974 0 0110 15c-2.796 0-5.487-.46-8-1.308z" />
                </svg>
                Inloggen als medewerker
              </button>
            )}

            {/* Changelog button */}
            <button
              onClick={() => setChangelogOpen(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-white/15 hover:bg-white/25 rounded-lg border border-white/30 transition-colors"
              aria-label="Open changelog"
            >
              <span>📋</span>
              <span className="hidden sm:inline">Changelog</span>
            </button>
          </div>
        </div>

        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex gap-1">
            {TOP_NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTopNavPage(item.id)}
                className={`px-5 py-2.5 text-sm font-medium transition-colors border-b-2 ${
                  activeTopNavPage === item.id
                    ? 'border-white text-white'
                    : 'border-transparent text-white/70 hover:text-white hover:border-white/50'
                }`}
              >
                {item.label}
                {isAuthenticated &&
                  tasks.length > 0 &&
                  tenantConfig?.leftPanelSections?.[item.id]?.some((s) => s.id === 'taken') && (
                    <span className="ml-2 bg-white/20 text-white text-xs px-1.5 py-0.5 rounded-full">
                      {tasks.length}
                    </span>
                  )}
              </button>
            ))}
          </div>
        </div>
      </header>

      <ChangelogPanel isOpen={changelogOpen} onClose={() => setChangelogOpen(false)} />

      {/* ── Body: left panel + content ── */}
      <div className="flex flex-1">
        {/* ── Left panel ── */}
        <aside className="w-56 flex-shrink-0 bg-white border-r border-gray-200">
          {leftPanelSections.length > 0 ? (
            <nav className="p-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-2 mb-2">
                {TOP_NAV_ITEMS.find((i) => i.id === activeTopNavPage)?.label}
              </p>
              <ul className="space-y-0.5">
                {leftPanelSections.map((section) => {
                  const isActive = activeSection === section.id;
                  return (
                    <li key={section.id}>
                      <button
                        onClick={() => setActiveSection(section.id)}
                        className="w-full text-left px-3 py-2 text-sm rounded-md transition-colors"
                        style={
                          isActive
                            ? {
                                backgroundColor: 'var(--color-primary, #154273)',
                                color: '#ffffff',
                                fontWeight: 500,
                              }
                            : {}
                        }
                        onMouseEnter={(e) => {
                          if (!isActive) {
                            (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                              'var(--color-primary-light, #e5e7eb)';
                            (e.currentTarget as HTMLButtonElement).style.color = '#111827';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isActive) {
                            (e.currentTarget as HTMLButtonElement).style.backgroundColor = '';
                            (e.currentTarget as HTMLButtonElement).style.color = '';
                          }
                        }}
                      >
                        {section.label}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </nav>
          ) : (
            <div className="p-4">
              <p className="text-xs text-gray-400 leading-relaxed mt-2">
                Log in om uw persoonlijke navigatie te zien.
              </p>
            </div>
          )}
        </aside>

        {/* ── Main content area ── */}
        <main className="flex-1 p-6 overflow-auto">{renderContent()}</main>
      </div>
    </div>
  );
}
