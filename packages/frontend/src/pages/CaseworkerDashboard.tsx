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
import type { KeycloakUser } from '@ronl/shared';
import RegelCatalogus from '../components/CaseWorkerDashboard/RegelCatalogus';
import ChangelogPanel from './ChangelogPanel';
import SessionExpiryWarning from '../components/SessionExpiryWarning';
import NieuwsSection from '../components/CaseWorkerDashboard/NieuwsSection';
import BerichtenSection from '../components/CaseWorkerDashboard/BerichtenSection';
import ArchiefSection from '../components/CaseWorkerDashboard/ArchiefSection';
import OnboardingArchiefSection from '../components/CaseWorkerDashboard/OnboardingArchiefSection';
import RipFase1WipSection from '../components/CaseWorkerDashboard/RipFase1WipSection';
import RipFase1GereedSection from '../components/CaseWorkerDashboard/RipFase1GereedSection';
import GereedschapSection from '../components/CaseWorkerDashboard/GereedschapSection';
import TakenSection from '../components/CaseWorkerDashboard/TakenSection';
import HrOnboardingSection from '../components/CaseWorkerDashboard/HrOnboardingSection';
import RipFase1Section from '../components/CaseWorkerDashboard/RipFase1Section';
import ProfielSection from '../components/CaseWorkerDashboard/ProfielSection';
import RollenSection from '../components/CaseWorkerDashboard/RollenSection';

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

  // Task counter
  const [taskCount, setTaskCount] = useState(0);

  // Audit log
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditOffset, setAuditOffset] = useState(0);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditHasMore, setAuditHasMore] = useState(false);

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

  // Load section data when activeSection changes
  useEffect(() => {
    if (activeSection === 'regelcatalogus') {
      /* data fetched inside component */
    }
    if (
      (activeSection === 'audit-overzicht' || activeSection === 'audit-details') &&
      isAuthenticated
    )
      loadAuditLogs(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection, isAuthenticated, user?.employeeId]);

  // ── Data fetchers ─────────────────────────────────────────────────────────

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

  function renderContent() {
    if (!isAuthenticated && !isSectionPublic(activeSection)) {
      return renderLoginPrompt();
    }

    if (!activeSection) return null;

    switch (activeSection) {
      case 'taken':
        return <TakenSection user={user} onCountChange={setTaskCount} />;
      case 'archief':
        return <ArchiefSection />;
      case 'nieuws':
        return <NieuwsSection />;
      case 'berichten':
        return <BerichtenSection />;
      case 'regelcatalogus':
        return <RegelCatalogus />;
      case 'profiel':
        return <ProfielSection user={user} tenantConfig={tenantConfig} />;
      case 'hr-onboarding':
        return <HrOnboardingSection user={user} />;
      case 'onboarding-archief':
        return <OnboardingArchiefSection user={user} />;
      case 'rollen':
        return <RollenSection user={user} />;
      case 'rip-fase1':
        return <RipFase1Section user={user} />;
      case 'rip-fase1-wip':
        return <RipFase1WipSection user={user} />;
      case 'rip-fase1-gereed':
        return <RipFase1GereedSection user={user} />;
      case 'audit-overzicht':
        return renderAuditOverzicht();
      case 'audit-details':
        return renderAuditDetails();
      case 'gereedschap-overzicht':
        return <GereedschapSection user={user} />;
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
                  taskCount > 0 &&
                  tenantConfig?.leftPanelSections?.[item.id]?.some((s) => s.id === 'taken') && (
                    <span className="ml-2 bg-white/20 text-white text-xs px-1.5 py-0.5 rounded-full">
                      {taskCount}
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
