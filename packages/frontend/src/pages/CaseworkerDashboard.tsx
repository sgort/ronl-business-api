import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import keycloak, { getUser } from '../services/keycloak';
import {
  initializeTenantTheme,
  loadTenantConfigs,
  getTenantConfig,
  getDefaultTenantConfig,
} from '../services/tenant';
import type { TenantConfig, LeftPanelSection } from '../services/tenant';
import type { KeycloakUser } from '@ronl/shared';
import RegelCatalogus from '../components/CaseworkerDashboard/RegelCatalogus';
import ChangelogPanel from './ChangelogPanel';
import SessionExpiryWarning from '../components/SessionExpiryWarning';
import NieuwsSection from '../components/CaseworkerDashboard/NieuwsSection';
import BerichtenSection from '../components/CaseworkerDashboard/BerichtenSection';
import ArchiefSection from '../components/CaseworkerDashboard/ArchiefSection';
import OnboardingArchiefSection from '../components/CaseworkerDashboard/OnboardingArchiefSection';
import RipFase1WipSection from '../components/CaseworkerDashboard/RipFase1WipSection';
import RipFase1GereedSection from '../components/CaseworkerDashboard/RipFase1GereedSection';
import GereedschapSection from '../components/CaseworkerDashboard/GereedschapSection';
import TakenSection from '../components/CaseworkerDashboard/TakenSection';
import HrOnboardingSection from '../components/CaseworkerDashboard/HrOnboardingSection';
import RipFase1Section from '../components/CaseworkerDashboard/RipFase1Section';
import ProfielSection from '../components/CaseworkerDashboard/ProfielSection';
import RollenSection from '../components/CaseworkerDashboard/RollenSection';
import AuditSection from '../components/CaseworkerDashboard/AuditSection';

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
      case 'rollen':
        return <RollenSection user={user} />;
      case 'hr-onboarding':
        return <HrOnboardingSection user={user} />;
      case 'onboarding-archief':
        return <OnboardingArchiefSection user={user} />;
      case 'rip-fase1':
        return <RipFase1Section user={user} />;
      case 'rip-fase1-wip':
        return <RipFase1WipSection user={user} />;
      case 'rip-fase1-gereed':
        return <RipFase1GereedSection user={user} />;
      case 'audit-overzicht':
      case 'audit-details':
        return (
          <AuditSection
            activeTab={activeSection as 'audit-overzicht' | 'audit-details'}
            user={user}
          />
        );
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
