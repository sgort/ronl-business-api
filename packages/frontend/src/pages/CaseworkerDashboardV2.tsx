/**
 * CaseworkerDashboardV2 — new shell for the caseworker portal.
 *
 * Layout:
 *
 *   ┌────────────────────────────────────────────────────────────┐
 *   │ Top bar (logo · ⌘K search · user)                          │
 *   ├────────────────────────────────────────────────────────────┤
 *   │ Werk · Zoeken · Beheer                              [tenant]│
 *   ├──────────┬─────────────────────────────────┬───────────────┤
 *   │ Rail     │ Main (section content)          │ Assistant ▶   │
 *   │ (mode-   │                                 │ (toggleable)  │
 *   │  scoped) │                                 │               │
 *   └──────────┴─────────────────────────────────┴───────────────┘
 *
 * What's intentionally inherited from V1:
 *   - keycloak auth + role guards
 *   - tenant theme application via initializeTenantTheme(...)
 *   - all section components and their network calls (via SectionRouter)
 *
 * What's new:
 *   - 3-mode information architecture (replaces 25-item nav)
 *   - ⌘K command palette (any section reachable in 2 keystrokes)
 *   - Right-side assistant dock (replaces full-screen chat tab)
 *   - Flevoland skin: editorial serif heads, magenta accent, white logo card
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import keycloak, { getUser } from '../services/keycloak';
import {
  initializeTenantTheme,
  loadTenantConfigs,
  getTenantConfig,
  getDefaultTenantConfig,
} from '../services/tenant';
import type { TenantConfig } from '../services/tenant';
import type { KeycloakUser } from '@ronl/shared';

import {
  MODES,
  findModeForSection,
  isRailItemVisible,
  tenantSectionIdsFrom,
  type ModeId,
  type OrgTypeGate,
} from './caseworker-v2/modes.config';
import SectionRouter from '../components/CaseworkerDashboardV2/SectionRouter';
import SectionErrorBoundary from '../components/CaseworkerDashboardV2/SectionErrorBoundary';
import CommandPalette from '../components/CaseworkerDashboardV2/CommandPalette';
import AssistantDock from '../components/CaseworkerDashboardV2/AssistantDock';
import ChangelogPanel from './ChangelogPanel';
import SessionExpiryWarning from '../components/SessionExpiryWarning';

import './caseworker-v2/dashboard-v2.css';

const STORAGE_KEY_DOCK = 'cwdV2.dock.open';

export default function CaseworkerDashboardV2() {
  const navigate = useNavigate();
  // Auth lifecycle is owned by AuthCallback (it runs keycloak.init).
  // This page just observes keycloak.authenticated synchronously. If we
  // land here without a session, the gate page below will show "Inloggen
  // als medewerker", which routes through /auth.
  const [isAuthenticated] = useState<boolean>(() => !!keycloak.authenticated);
  const [user, setUser] = useState<KeycloakUser | null>(null);
  const [tenantConfig, setTenantConfig] = useState<TenantConfig | null>(null);

  const [mode, setMode] = useState<ModeId>('werk');
  const [activeSection, setActiveSection] = useState<string>('taken');

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [dockOpen, setDockOpen] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(STORAGE_KEY_DOCK) === '1';
    } catch {
      return false;
    }
  });

  const [taskCount, setTaskCount] = useState<number>(0);
  const [iouCount, setIouCount] = useState<number>(0);

  const [changelogOpen, setChangelogOpen] = useState(false);

  // ── Tenant theme + user once we know auth state ─────────
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
        return;
      }
    }
    loadTenantConfigs().then(() => {
      setTenantConfig(getDefaultTenantConfig());
    });
  }, [isAuthenticated]);

  // Persist dock open state
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY_DOCK, dockOpen ? '1' : '0');
    } catch {
      /* non-fatal */
    }
  }, [dockOpen]);

  // ── ⌘K / Ctrl+K to open palette ──────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((p) => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const currentMode = MODES.find((m) => m.id === mode)!;

  // When switching modes, jump to that mode's default section if the current
  // section doesn't belong to it. This keeps the rail consistent with the
  // selected tab.
  useEffect(() => {
    const owner = findModeForSection(activeSection);
    if (owner !== mode) {
      setActiveSection(currentMode.defaultSectionId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const isAuth = !!user;

  // Build the gate context once, share with rail + palette so what's hidden
  // is hidden everywhere.
  const gateContext = useMemo(
    () => ({
      isAuthenticated: isAuth,
      userRoles: user?.roles ?? [],
      userOrgType: (user?.organisation_type ?? null) as OrgTypeGate | null,
      tenantSectionIds: tenantSectionIdsFrom(tenantConfig?.leftPanelSections),
    }),
    [isAuth, user, tenantConfig]
  );

  // Filter rail items by auth + tenant + role + org-type gates. Empty
  // groups are dropped so the rail doesn't show ghost headers.
  const visibleGroups = useMemo(() => {
    return currentMode.groups
      .map((g) => ({
        ...g,
        items: g.items.filter((i) => isRailItemVisible(i, gateContext)),
      }))
      .filter((g) => g.items.length > 0);
  }, [currentMode, gateContext]);

  // Login goes through the LoginChoice → AuthCallback flow that the rest of
  // the app uses. We can't call keycloak.login() directly here because
  // keycloak.init() must run first, and AuthCallback is the place that does
  // it with the right idpHint / loginHint per IdP.
  const handleLogin = (idp: 'digid' | 'eherkenning' | 'eidas' | 'medewerker' = 'medewerker') => {
    sessionStorage.setItem('selected_idp', idp);
    sessionStorage.setItem('post_login_redirect', '/dashboard/caseworker');
    navigate('/auth');
  };
  const handleLogout = () => {
    if (keycloak.authenticated) {
      keycloak.logout({ redirectUri: window.location.origin + '/dashboard/caseworker' });
    } else {
      navigate('/dashboard/caseworker');
    }
  };

  return (
    <div className="cwd-v2">
      <SessionExpiryWarning />
      {/* ── Top bar ── */}
      <header className="v2-topbar">
        <div className="v2-logo" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
          <span className="v2-logo-box">
            <span className="v2-logo-mark">
              ronl<em>.</em>
            </span>
            <span className="v2-logo-sub">CASEWORKER · V2</span>
          </span>
        </div>

        <button
          type="button"
          className="v2-search"
          onClick={() => setPaletteOpen(true)}
          aria-label="Snel navigeren"
        >
          <span>🔍</span>
          <span style={{ flex: 1, textAlign: 'left' }}>Spring naar een sectie…</span>
          <span className="v2-key">⌘K</span>
        </button>

        <div className="v2-user">
          {isAuth ? (
            <>
              {user?.loa && <span className="v2-loa">LOA {user.loa}</span>}
              <span className="v2-username">
                {user?.name ?? user?.preferred_username ?? 'Medewerker'}
              </span>
              <button type="button" className="v2-avatar" onClick={handleLogout} title="Uitloggen">
                {(user?.name ?? 'U')
                  .split(' ')
                  .slice(0, 2)
                  .map((s) => s[0])
                  .join('')
                  .toUpperCase()}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="v2-login-btn"
              onClick={() => handleLogin('medewerker')}
            >
              Inloggen
            </button>
          )}
          <button
            type="button"
            className="v2-changelog-btn"
            onClick={() => setChangelogOpen(true)}
            aria-label="Open changelog"
            title="Changelog"
          >
            <span aria-hidden="true">📋</span>
          </button>
        </div>
      </header>

      <ChangelogPanel isOpen={changelogOpen} onClose={() => setChangelogOpen(false)} />

      {/* ── Mode tabs ── */}
      <nav className="v2-tabs" aria-label="Werkmodus">
        {MODES.map((m) => {
          const count = m.id === 'werk' && isAuth && taskCount > 0 ? taskCount : null;
          return (
            <button
              key={m.id}
              type="button"
              className={`v2-tab ${m.id === mode ? 'active' : ''}`}
              onClick={() => setMode(m.id)}
            >
              {m.label}
              {count !== null && <span className="v2-tab-count">{count}</span>}
            </button>
          );
        })}
        <div className="v2-tabs-spacer" />
        {tenantConfig && <span className="v2-tenant-label">{tenantConfig.displayName}</span>}
      </nav>

      {/* ── Body ── */}
      <div className={`v2-body ${dockOpen ? 'v2-with-dock' : ''}`}>
        {/* Rail */}
        <aside className="v2-rail" aria-label="Sectienavigatie">
          <div className="v2-rail-card">{currentMode.label}</div>
          {visibleGroups.map((g, i) => (
            <div key={g.label ?? i} className="v2-rail-group">
              {g.label && <div className="v2-rail-group-label">{g.label}</div>}
              <ul className="v2-rail-list">
                {g.items.map((it) => {
                  let badge: number | null = null;
                  if (it.badgeKey === 'taskCount' && taskCount > 0) badge = taskCount;
                  if (it.badgeKey === 'iouCount' && iouCount > 0) badge = iouCount;
                  return (
                    <li key={it.id}>
                      <button
                        type="button"
                        className={[
                          'v2-rail-item',
                          activeSection === it.id ? 'active' : '',
                          it.variant === 'overdue' ? 'overdue' : '',
                        ].join(' ')}
                        onClick={() => setActiveSection(it.id)}
                      >
                        <span>{it.label}</span>
                        {badge !== null && <span className="v2-rail-count">{badge}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </aside>

        {/* Main */}
        <main className="v2-main">
          {!isAuth && mode !== 'zoeken' ? (
            <div className="v2-main-pad">
              <div className="v2-crumb">{currentMode.label.toUpperCase()}</div>
              <h1 className="v2-page-title">Inloggen vereist</h1>
              <p style={{ color: '#4b5563', maxWidth: '52ch', margin: '14px 0 22px' }}>
                Deze omgeving bevat persoonlijke werkgegevens. Log in als medewerker om je taken,
                zaken en profielinformatie te bekijken.
              </p>
              <div style={{ display: 'flex', gap: 12 }}>
                <button type="button" className="v2-btn" onClick={() => handleLogin('medewerker')}>
                  Inloggen als medewerker
                </button>
                <button
                  type="button"
                  className="v2-btn v2-btn-ghost"
                  onClick={() => setMode('zoeken')}
                >
                  Verken openbare bibliotheek
                </button>
              </div>
            </div>
          ) : (
            <div
              className="v2-main-pad"
              style={
                activeSection === 'taken' || activeSection.startsWith('filter-')
                  ? { padding: 0, height: '100%' }
                  : {}
              }
            >
              <SectionErrorBoundary sectionId={activeSection}>
                <SectionRouter
                  sectionId={activeSection}
                  user={user}
                  tenantConfig={tenantConfig}
                  onTaskCountChange={setTaskCount}
                  onIouCountChange={setIouCount}
                  onNavigate={setActiveSection}
                />
              </SectionErrorBoundary>
            </div>
          )}
        </main>

        {/* Assistant dock */}
        {dockOpen && <AssistantDock user={user} onClose={() => setDockOpen(false)} />}
      </div>

      {/* Floating dock toggle (only when dock is closed and no overlay panel is open) */}
      {!dockOpen && !changelogOpen && (
        <button type="button" className="v2-dock-toggle" onClick={() => setDockOpen(true)}>
          Vraag de assistent
        </button>
      )}

      {/* Command palette */}
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        gateContext={gateContext}
        onSelect={(m, sectionId) => {
          setMode(m);
          setActiveSection(sectionId);
        }}
      />
    </div>
  );
}
