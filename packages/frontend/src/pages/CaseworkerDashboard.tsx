/* eslint-disable @typescript-eslint/no-unused-vars */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import keycloak, { getUser } from '../services/keycloak';
import { businessApi } from '../services/api';
import type { AuditLogRecord } from '../services/api';
import {
  initializeTenantTheme,
  loadTenantConfigs,
  getTenantConfig,
  getDefaultTenantConfig,
} from '../services/tenant';
import type { TenantConfig, LeftPanelSection } from '../services/tenant';
import type { KeycloakUser, Task } from '@ronl/shared';
import TaskFormViewer from '../components/CaseWorkerDashboard/TaskFormViewer';
import RipFase1WipViewer from '../components/CaseWorkerDashboard/RipFase1WipViewer';
import RegelCatalogus from '../components/CaseWorkerDashboard/RegelCatalogus';
import ChangelogPanel from './ChangelogPanel';
import SessionExpiryWarning from '../components/SessionExpiryWarning';
import NieuwsSection from '../components/CaseWorkerDashboard/NieuwsSection';
import BerichtenSection from '../components/CaseWorkerDashboard/BerichtenSection';
import ArchiefSection from '../components/CaseWorkerDashboard/ArchiefSection';
import OnboardingArchiefSection from '../components/CaseWorkerDashboard/OnboardingArchiefSection';
import RipFase1WipSection from '../components/CaseWorkerDashboard/RipFase1WipSection';

type TopNavPage = 'home' | 'personal-info' | 'projects' | 'audit-log' | 'gereedschap';

const TOP_NAV_ITEMS: { id: TopNavPage; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'personal-info', label: 'Persoonlijke info' },
  { id: 'projects', label: 'Projecten' },
  { id: 'audit-log', label: 'Audit log' },
  { id: 'gereedschap', label: 'Gereedschap' },
];

const AUDIT_LOG_SECTIONS: LeftPanelSection[] = [
  { id: 'audit-overzicht', label: 'Overzicht' },
  { id: 'audit-details', label: 'Details' },
];

const GEREEDSCHAP_SECTIONS: LeftPanelSection[] = [
  { id: 'gereedschap-overzicht', label: 'Overzicht' },
];

interface PlatformTool {
  id: string;
  label: string;
  description: string;
  url: string | null; // null = placeholder, not yet available
  icon: string;
  roles: string[]; // [] = any authenticated user; non-empty = user must have at least one of these roles
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
    url: 'https://open-regels.triply.cc/stevengort/RONL/graphs',
    icon: '🗄️',
    roles: [],
    statusWidget: true,
  },
  {
    id: 'lde',
    label: 'Linked Data Explorer',
    description: 'Verken de RONL kennisgraaf: diensten, organisaties, concepten en regels.',
    url: 'https://acc.linkeddata.open-regels.nl/',
    icon: '🔍',
    roles: [],
    statusWidget: true,
  },
  {
    id: 'operaton',
    label: 'Operaton Cockpit',
    description: 'Monitor en beheer BPMN-procesinstanties en DMN-beslissingen.',
    url: 'https://operaton.open-regels.nl/operaton/app/welcome/default/#!/welcome',
    icon: '⚙️',
    roles: ['admin'],
    statusWidget: true,
  },
  {
    id: 'edocs',
    label: 'eDOCS',
    description: 'OpenText eDOCS documentbeheersysteem voor zaakdossiers.',
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

export default function CaseworkerDashboard() {
  const navigate = useNavigate();

  const [isAuthenticated] = useState(() => !!keycloak.authenticated);
  const [user, setUser] = useState<KeycloakUser | null>(null);
  const [tenantConfig, setTenantConfig] = useState<TenantConfig | null>(null);

  const [activeTopNavPage, setActiveTopNavPage] = useState<TopNavPage>('home');
  const [activeSection, setActiveSection] = useState<string | null>(null);
  // Remembers last selected section per top-nav page
  const [sectionMemory, setSectionMemory] = useState<Record<string, string>>({});

  // Wrap setActiveSection so every explicit user click also saves to memory
  function selectSection(id: string) {
    setActiveSection(id);
    setSectionMemory((prev) => ({ ...prev, [activeTopNavPage]: id }));
  }

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
  const [processDataOpen, setProcessDataOpen] = useState(false);

  // Audit log
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditOffset, setAuditOffset] = useState(0);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditHasMore, setAuditHasMore] = useState(false);

  // Gereedschap — eDOCS status widget
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

  // Profiel onboarding enrichment
  const [onboardingStarted, setOnboardingStarted] = useState(false);
  const [ripPhase1Started, setRipPhase1Started] = useState(false);
  const [ripFase1Gereed, setRipFase1Gereed] = useState<
    Array<{
      id: string;
      startTime: string;
      endTime: string;
      projectNumber: string;
      projectName: string;
      edocsWorkspaceId: string;
    }>
  >([]);
  const [ripFase1GereedLoading, setRipFase1GereedLoading] = useState(false);
  const [ripFase1GereedError, setRipFase1GereedError] = useState<string | null>(null);
  const [selectedRipGereedInstance, setSelectedRipGereedInstance] = useState<string | null>(null);
  const [profielData, setProfielData] = useState<Record<string, unknown> | null | undefined>(
    undefined
  );
  const [profielLoading, setProfielLoading] = useState(false);
  const [profielError, setProfielError] = useState<string | null>(null);
  const [employeeIdInput, setEmployeeIdInput] = useState('');

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
    const sections =
      activeTopNavPage === 'audit-log'
        ? AUDIT_LOG_SECTIONS
        : activeTopNavPage === 'gereedschap'
          ? GEREEDSCHAP_SECTIONS
          : (tenantConfig?.leftPanelSections?.[activeTopNavPage] ?? []);

    if (!tenantConfig && activeTopNavPage !== 'audit-log' && activeTopNavPage !== 'gereedschap')
      return;

    const remembered = sectionMemory[activeTopNavPage];
    if (remembered && sections.some((s) => s.id === remembered)) {
      setActiveSection(remembered);
      return;
    }

    if (isAuthenticated) {
      setActiveSection(sections.length > 0 ? sections[0].id : null);
    } else {
      const firstPublic = sections.find((s) => s.isPublic !== false);
      setActiveSection(firstPublic?.id ?? sections[0]?.id ?? null);
    }
  }, [activeTopNavPage, tenantConfig, isAuthenticated, sectionMemory]);

  useEffect(() => {
    if (activeSection !== 'gereedschap-overzicht' || !isAuthenticated) return;

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
  }, [activeSection, isAuthenticated]);

  // Load section data when activeSection changes
  useEffect(() => {
    if (activeSection === 'taken' && isAuthenticated) loadTasks();
    if (activeSection === 'rip-fase1-gereed' && isAuthenticated) loadRipFase1Gereed();
    if (activeSection === 'regelcatalogus') {
      /* data fetched inside component */
    }
    if (
      (activeSection === 'profiel' || activeSection === 'rollen') &&
      isAuthenticated &&
      profielData === undefined &&
      !profielLoading &&
      user?.employeeId
    )
      loadProfiel(user.employeeId);
    if (
      (activeSection === 'audit-overzicht' || activeSection === 'audit-details') &&
      isAuthenticated
    )
      loadAuditLogs(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection, isAuthenticated, profielData, profielLoading, user?.employeeId]);

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

  const loadRipFase1Gereed = async () => {
    setRipFase1GereedLoading(true);
    setRipFase1GereedError(null);
    try {
      const res = await businessApi.rip.phase1Completed();
      if (res.success && res.data) setRipFase1Gereed(res.data);
      else setRipFase1GereedError('Projecten konden niet worden geladen.');
    } catch {
      setRipFase1GereedError('Projecten konden niet worden geladen.');
    } finally {
      setRipFase1GereedLoading(false);
    }
  };

  const loadAuditLogs = async (offset = 0) => {
    setAuditLoading(true);
    setAuditError(null);
    try {
      const res = await businessApi.admin.auditLogs(50, offset);
      if (res.success && res.data) {
        setAuditLogs((prev) => (offset === 0 ? res.data!.items : [...prev, ...res.data!.items]));
        setAuditOffset(offset);
        setAuditTotal(res.data.pagination.total);
        setAuditHasMore(res.data.pagination.hasMore);
      } else {
        setAuditError('Auditlog kon niet worden geladen.');
      }
    } catch {
      setAuditError('Auditlog kon niet worden geladen.');
    } finally {
      setAuditLoading(false);
    }
  };

  // ── Task actions ──────────────────────────────────────────────────────────

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
    activeTopNavPage === 'audit-log'
      ? AUDIT_LOG_SECTIONS
      : activeTopNavPage === 'gereedschap'
        ? GEREEDSCHAP_SECTIONS
        : (tenantConfig?.leftPanelSections?.[activeTopNavPage] ?? []);

  function isSectionPublic(sectionId: string | null): boolean {
    if (!sectionId) return true;
    const section = leftPanelSections.find((s) => s.id === sectionId);
    return section?.isPublic !== false;
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
          {!tasksLoading &&
            tasks.length > 0 &&
            (() => {
              // Group by processDefinitionKey, sort tasks within each group descending
              const grouped = tasks
                .slice()
                .sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime())
                .reduce<Record<string, typeof tasks>>((acc, task) => {
                  const key = task.processDefinitionKey ?? task.processDefinitionId;
                  if (!acc[key]) acc[key] = [];
                  acc[key].push(task);
                  return acc;
                }, {});

              // Sort groups by their most recent task descending
              const sortedGroups = Object.entries(grouped).sort(
                ([, a], [, b]) =>
                  new Date(b[0].created).getTime() - new Date(a[0].created).getTime()
              );

              return (
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
                              selectedTask?.id === task.id
                                ? { borderColor: 'var(--color-primary)' }
                                : {}
                            }
                          >
                            <p className="font-medium text-gray-800 truncate text-sm">
                              {task.name}
                            </p>
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
              );
            })()}
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
                    setProcessDataOpen(false);
                    setTaskVariables(null);
                    setActionMessage(null);
                  }}
                  className="text-gray-400 hover:text-gray-600 text-xl leading-none"
                ></button>
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
                        .filter(
                          ([key]) =>
                            !['municipality', 'initiator', 'assuranceLevel', 'roleResult'].includes(
                              key
                            )
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

  function renderRipPhase1() {
    const isInfraTeam = user?.roles?.includes('infra-projectteam');

    if (!isInfraTeam) {
      return (
        <div className="max-w-lg">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
            <p className="text-3xl mb-4 text-gray-300">🔒</p>
            <h2 className="text-lg font-bold text-gray-800 mb-2">Toegang beperkt</h2>
            <p className="text-gray-400 text-sm">
              Alleen leden van het infra-projectteam kunnen een RIP Fase 1 starten.
            </p>
          </div>
        </div>
      );
    }

    if (ripPhase1Started) {
      return (
        <div className="max-w-lg">
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <p className="text-3xl mb-4">✅</p>
            <h2 className="text-lg font-bold text-gray-800 mb-2">RIP Fase 1 gestart</h2>
            <p className="text-gray-500 text-sm mb-5">
              De intake taak staat klaar in de wachtrij. Ga naar <strong>Projecten → Taken</strong>{' '}
              om het intakeformulier in te vullen.
            </p>
            <button
              onClick={() => setRipPhase1Started(false)}
              className="text-sm font-medium hover:underline"
              style={{ color: 'var(--color-primary)' }}
            >
              Nieuw RIP Fase 1 proces starten
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="max-w-2xl">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-800 mb-1">
            RIP Fase 1 — Projectdefinitie
          </h2>
          <p className="text-sm text-gray-500 mb-6 leading-relaxed">
            Start het RIP Fase 1 proces voor een nieuw infrastructuurproject. Na het starten
            verschijnt het intakeformulier in de wachtrij.
          </p>
          <button
            onClick={async () => {
              try {
                const res = await businessApi.process.start('RipPhase1Process', {});
                if (res.success) {
                  setRipPhase1Started(true);
                } else {
                  setActionMessage({
                    type: 'error',
                    text: 'RIP Fase 1 proces kon niet worden gestart.',
                  });
                }
              } catch {
                setActionMessage({
                  type: 'error',
                  text: 'RIP Fase 1 proces kon niet worden gestart.',
                });
              }
            }}
            className="px-5 py-2.5 text-sm font-medium text-white rounded-lg transition-opacity hover:opacity-90"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            RIP Fase 1 starten
          </button>
        </div>
      </div>
    );
  }

  function renderRipFase1Gereed() {
    const isInfraTeam = user?.roles?.includes('infra-projectteam');

    if (!isInfraTeam) {
      return (
        <div className="max-w-lg">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
            <p className="text-3xl mb-4 text-gray-300">🔒</p>
            <h2 className="text-lg font-bold text-gray-800 mb-2">Toegang beperkt</h2>
            <p className="text-gray-400 text-sm">
              Alleen leden van het infra-projectteam kunnen afgeronde RIP Fase 1 projecten inzien.
            </p>
          </div>
        </div>
      );
    }

    if (ripFase1GereedLoading) {
      return (
        <div className="max-w-2xl space-y-3">
          {[1, 2].map((n) => (
            <div key={n} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-1/2 mb-2" />
              <div className="h-3 bg-gray-100 rounded w-1/3" />
            </div>
          ))}
        </div>
      );
    }

    if (ripFase1GereedError) {
      return (
        <div className="max-w-2xl bg-red-50 border border-red-200 rounded-xl p-5 text-red-700 text-sm">
          {ripFase1GereedError}
          <button onClick={loadRipFase1Gereed} className="ml-3 underline">
            Opnieuw proberen
          </button>
        </div>
      );
    }

    if (ripFase1Gereed.length === 0) {
      return (
        <div className="max-w-2xl bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">
          Geen afgeronde RIP Fase 1 projecten gevonden.
        </div>
      );
    }

    return (
      <div className="max-w-2xl space-y-3">
        {ripFase1Gereed.map((project) => (
          <div
            key={project.id}
            className="bg-white rounded-xl border border-gray-200 overflow-hidden"
          >
            <button
              onClick={() =>
                setSelectedRipGereedInstance(
                  selectedRipGereedInstance === project.id ? null : project.id
                )
              }
              className="w-full text-left p-5 flex items-center justify-between hover:bg-gray-50 transition-colors"
            >
              <div>
                <p className="font-medium text-gray-800 text-sm">
                  {project.projectName !== '—' ? project.projectName : 'Naamloos project'}
                  <span className="ml-2 text-gray-400 font-normal">{project.projectNumber}</span>
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Werkruimte: {project.edocsWorkspaceId} · Afgerond op{' '}
                  {new Date(project.endTime).toLocaleDateString('nl-NL')}
                </p>
              </div>
              <span className="text-gray-400 text-lg">
                {selectedRipGereedInstance === project.id ? '▲' : '▼'}
              </span>
            </button>
            {selectedRipGereedInstance === project.id && (
              <div className="border-t border-gray-100">
                <RipFase1WipViewer instanceId={project.id} />
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  function renderAuditAccessDenied() {
    return (
      <div className="max-w-lg">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
          <p className="text-3xl mb-4 text-gray-300">🔒</p>
          <h2 className="text-lg font-bold text-gray-800 mb-2">Toegang beperkt</h2>
          <p className="text-gray-400 text-sm">Alleen beheerders kunnen het auditlog inzien.</p>
        </div>
      </div>
    );
  }

  function renderAuditShell(children: React.ReactNode) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-400">{auditTotal} records in totaal</p>
          <button
            onClick={() => loadAuditLogs(0)}
            className="text-xs underline"
            style={{ color: 'var(--color-primary)' }}
          >
            Vernieuwen
          </button>
        </div>
        {auditError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
            {auditError}
            <button onClick={() => loadAuditLogs(0)} className="ml-3 underline">
              Opnieuw proberen
            </button>
          </div>
        )}
        {auditLoading && auditLogs.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm animate-pulse">
            Auditlog laden…
          </div>
        ) : (
          <>
            {children}
            {auditHasMore && (
              <button
                onClick={() => loadAuditLogs(auditOffset + 50)}
                disabled={auditLoading}
                className="w-full py-2 text-sm font-medium rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                {auditLoading ? 'Laden…' : 'Meer laden'}
              </button>
            )}
          </>
        )}
      </div>
    );
  }

  function renderAuditOverzicht() {
    if (!user?.roles?.includes('admin')) return renderAuditAccessDenied();

    const RESULT_STYLES: Record<string, string> = {
      success: 'bg-green-100 text-green-700',
      failure: 'bg-yellow-100 text-yellow-700',
      error: 'bg-red-100 text-red-700',
    };

    return renderAuditShell(
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-400 uppercase tracking-wider">
              <th className="text-left px-4 py-3 font-medium">Tijdstip</th>
              <th className="text-left px-4 py-3 font-medium">Tenant</th>
              <th className="text-left px-4 py-3 font-medium">Gebruiker</th>
              <th className="text-left px-4 py-3 font-medium">Actie</th>
              <th className="text-left px-4 py-3 font-medium">Resultaat</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {auditLogs.map((row) => (
              <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap font-mono text-xs">
                  {new Date(row.timestamp).toLocaleString('nl-NL')}
                </td>
                <td className="px-4 py-2.5 text-gray-700">{row.tenant_id}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-gray-400">
                  {row.user_id.slice(0, 8)}…
                </td>
                <td className="px-4 py-2.5 text-gray-800 font-mono text-xs max-w-xs truncate">
                  {row.action}
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${RESULT_STYLES[row.result] ?? ''}`}
                  >
                    {row.result}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  function renderAuditDetails() {
    if (!user?.roles?.includes('admin')) return renderAuditAccessDenied();

    const RESULT_STYLES: Record<string, string> = {
      success: 'bg-green-100 text-green-700',
      failure: 'bg-yellow-100 text-yellow-700',
      error: 'bg-red-100 text-red-700',
    };

    return renderAuditShell(
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-400 uppercase tracking-wider">
              <th className="text-left px-4 py-3 font-medium">Actie</th>
              <th className="text-left px-4 py-3 font-medium">Resultaat</th>
              <th className="text-left px-4 py-3 font-medium">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {auditLogs.map((row) => (
              <tr key={row.id} className="hover:bg-gray-50 transition-colors align-top">
                <td className="px-4 py-2.5 font-mono text-xs text-gray-800 max-w-xs whitespace-normal break-all">
                  {row.action}
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${RESULT_STYLES[row.result] ?? ''}`}
                  >
                    {row.result}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  {row.details ? (
                    <dl className="space-y-0.5">
                      {Object.entries(row.details).map(([k, v]) => (
                        <div key={k} className="flex gap-2 text-xs">
                          <dt className="text-gray-400 flex-shrink-0">{k}</dt>
                          <dd className="text-gray-700 font-mono break-all">
                            {typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <span className="text-gray-300 text-xs">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  function renderGereedschap() {
    if (!isAuthenticated) return renderLoginPrompt();

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
                {/* Header */}
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

                {/* Description */}
                <p className="text-xs text-gray-500 leading-relaxed flex-1">{tool.description}</p>

                {/* eDOCS live status widget */}
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
                            <span className="text-xs text-gray-400">
                              {edocsStatus.latencyMs} ms
                            </span>
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
                            <span className="text-xs text-gray-400">
                              {operatonStatus.latency} ms
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">Status niet beschikbaar</span>
                      ))}
                    {tool.id === 'cprmv' || tool.id === 'triplydb' || tool.id === 'lde'
                      ? (() => {
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
                        })()
                      : null}
                  </div>
                )}

                {/* Open button — active tools only */}
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

  function renderContent() {
    if (!isAuthenticated && !isSectionPublic(activeSection)) {
      return renderLoginPrompt();
    }

    if (!activeSection) return null;

    switch (activeSection) {
      case 'taken':
        return renderTaskQueue();
      case 'archief':
        return <ArchiefSection />;
      case 'nieuws':
        return <NieuwsSection />;
      case 'berichten':
        return <BerichtenSection />;
      case 'regelcatalogus':
        return <RegelCatalogus />;
      case 'profiel':
        return renderProfiel();
      case 'hr-onboarding':
        return renderHrOnboarding();
      case 'onboarding-archief':
        return <OnboardingArchiefSection user={user} />;
      case 'rollen':
        return renderRollen();
      case 'rip-fase1':
        return renderRipPhase1();
      case 'rip-fase1-wip':
        return <RipFase1WipSection user={user} />;
      case 'rip-fase1-gereed':
        return renderRipFase1Gereed();
      case 'audit-overzicht':
        return renderAuditOverzicht();
      case 'audit-details':
        return renderAuditDetails();
      case 'gereedschap-overzicht':
        return renderGereedschap();
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
      <SessionExpiryWarning />
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
                        onClick={() => selectSection(section.id)}
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
