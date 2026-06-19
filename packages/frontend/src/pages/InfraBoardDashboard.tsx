/**
 * InfraBoardDashboard — shell for the infra project-board portal.
 *
 * Sibling of CaseworkerDashboardV2 / PADashboardV2. Reuses keycloak auth,
 * tenant theme, the ⌘K palette pattern and the assistant dock. Scoped under
 * `.pbd` (layered on the shared `.cwd-v2` chrome from dashboard-v2.css).
 *
 * Login target: test-infra-flevoland → /dashboard/infra-board
 * Gate: infra-projectteam realm role.
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
  INFRA_MODES,
  INFRA_GATE_ROLE,
  findModeForSection,
  isRailItemVisible,
  type InfraModeId,
} from './infra-board/modes.config';
import { PHASES } from './infra-board/rip-model';
import InfraSectionRouter from '../components/InfraBoardDashboard/InfraSectionRouter';
import InfraCommandPalette from '../components/InfraBoardDashboard/InfraCommandPalette';
import InfraDock from '../components/InfraBoardDashboard/InfraDock';
import InfraNoAccessPanel from '../components/InfraBoardDashboard/InfraNoAccessPanel';
import SessionExpiryWarning from '../components/SessionExpiryWarning';

import './infra-board/dashboard-infra.css';

const STORAGE_KEY_DOCK = 'infraBoard.dock.open';

/** A project selection: live Fase-1 instance (instanceId) or a mock row (nr). */
export interface ProjectRef {
  nr: string;
  instanceId?: string;
}

export default function InfraBoardDashboard() {
  const navigate = useNavigate();
  const [isAuthenticated] = useState<boolean>(() => !!keycloak.authenticated);
  const [user, setUser] = useState<KeycloakUser | null>(null);
  const [, setTenantConfig] = useState<TenantConfig | null>(null);

  const [mode, setMode] = useState<InfraModeId>('mijn-dag');
  const [activeSection, setActiveSection] = useState<string>('overzicht');
  const [openProject, setOpenProject] = useState<ProjectRef | null>(null);

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [dockOpen, setDockOpen] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(STORAGE_KEY_DOCK) === '1';
    } catch {
      return false;
    }
  });

  // Tweaks
  const [accent, _setAccent] = useState('#e70077');
  const [density, _setDensity] = useState<'comfortable' | 'compact'>('comfortable');
  const [phaseLabels, _setPhaseLabels] = useState<string[]>(PHASES.map((p) => p.name));

  useEffect(() => {
    if (isAuthenticated) {
      const u = getUser();
      setUser(u);
      if (u?.municipality) {
        initializeTenantTheme(u.municipality).then(() =>
          loadTenantConfigs().then(() => setTenantConfig(getTenantConfig(u.municipality!)))
        );
        return;
      }
    }
    loadTenantConfigs().then(() => setTenantConfig(getDefaultTenantConfig()));
  }, [isAuthenticated]);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY_DOCK, dockOpen ? '1' : '0');
    } catch {
      /* */
    }
  }, [dockOpen]);

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

  const currentMode = INFRA_MODES.find((m) => m.id === mode)!;
  useEffect(() => {
    const owner = findModeForSection(activeSection);
    if (owner !== mode) setActiveSection(currentMode.defaultSectionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const isAuth = !!user;
  const gateContext = useMemo(
    () => ({ isAuthenticated: isAuth, userRoles: user?.roles ?? [] }),
    [isAuth, user]
  );
  const hasGateRole = (user?.roles ?? []).includes(INFRA_GATE_ROLE);

  const visibleGroups = useMemo(
    () =>
      currentMode.groups
        .map((g) => ({ ...g, items: g.items.filter((i) => isRailItemVisible(i, gateContext)) }))
        .filter((g) => g.items.length > 0),
    [currentMode, gateContext]
  );

  const goToProject = (ref: ProjectRef) => setOpenProject(ref);
  const initials =
    (user?.name || user?.preferred_username || 'IF')
      .split(/[\s-]+/)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase())
      .join('') || 'IF';

  const handleLogin = () => {
    sessionStorage.setItem('selected_idp', 'medewerker');
    sessionStorage.setItem('post_login_redirect', '/dashboard/infra-board');
    navigate('/auth');
  };

  // Auth/role gates
  if (!isAuth) {
    return (
      <div className="cwd-v2 pbd">
        <div className="v2-empty" style={{ margin: '64px auto' }}>
          <h2>Infra-board</h2>
          <p>
            Log in als medewerker van het infra-projectteam om je dag, portfolio en RIP-projecten te
            zien.
          </p>
          <button type="button" className="v2-btn" onClick={handleLogin}>
            Inloggen als medewerker
          </button>
        </div>
      </div>
    );
  }
  if (!hasGateRole)
    return (
      <div className="cwd-v2 pbd">
        <InfraNoAccessPanel />
      </div>
    );

  return (
    <div
      className={`cwd-v2 pbd density-${density}`}
      style={{ ['--v2-accent' as string]: accent, ['--color-secondary' as string]: accent }}
    >
      <SessionExpiryWarning />

      <header className="v2-topbar">
        <div className="v2-logo" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
          <span className="v2-logo-box">
            <span className="v2-logo-mark">
              ronl<em>.</em>
            </span>
            <span className="v2-logo-sub">INFRA-BOARD</span>
          </span>
        </div>
        <button type="button" className="v2-search" onClick={() => setPaletteOpen(true)}>
          <span>🔍</span>
          <span style={{ flex: 1, textAlign: 'left' }}>Spring naar weergave of project…</span>
          <span className="v2-key">⌘K</span>
        </button>
        <div className="v2-user">
          {user.loa && <span className="v2-loa">LOA {user.loa}</span>}
          <span className="v2-username">{user.name || user.preferred_username}</span>
          <button type="button" className="v2-avatar" title="Account">
            {initials}
          </button>
        </div>
      </header>

      <nav className="v2-tabs" aria-label="Weergave">
        {INFRA_MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`v2-tab ${m.id === mode && !openProject ? 'active' : ''}`}
            onClick={() => {
              setOpenProject(null);
              setMode(m.id);
            }}
          >
            {m.label}
          </button>
        ))}
        <div className="v2-tabs-spacer" />
        <span className="v2-tenant-label">Provincie Flevoland</span>
      </nav>

      <div className={`v2-body ${dockOpen ? 'v2-with-dock' : ''}`}>
        <aside className="v2-rail" aria-label="Sectienavigatie">
          <div className="v2-rail-card">
            {currentMode.label}
            {mode === 'mijn-dag' && (
              <span className="pb-rail-sub">
                Persoonlijk · {user.name || user.preferred_username}
              </span>
            )}
          </div>
          {visibleGroups.map((g, i) => (
            <div key={g.label || i} className="v2-rail-group">
              {g.label && <div className="v2-rail-group-label">{g.label}</div>}
              <ul className="v2-rail-list">
                {g.items.map((it) => (
                  <li key={it.id}>
                    <button
                      type="button"
                      className={`v2-rail-item ${activeSection === it.id && !openProject ? 'active' : ''}`}
                      onClick={() => {
                        setOpenProject(null);
                        setActiveSection(it.id);
                      }}
                    >
                      <span>{it.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </aside>

        <main className="v2-main">
          <InfraSectionRouter
            mode={mode}
            section={activeSection}
            openProject={openProject}
            user={user}
            phaseLabels={phaseLabels}
            onOpenProject={goToProject}
            onBack={() => setOpenProject(null)}
            onGotoPortfolio={() => {
              setOpenProject(null);
              setMode('portfolio');
            }}
          />
        </main>

        {dockOpen && <InfraDock user={user} onClose={() => setDockOpen(false)} />}
      </div>

      {!dockOpen && (
        <button type="button" className="v2-dock-toggle" onClick={() => setDockOpen(true)}>
          Vraag de assistent
        </button>
      )}

      <InfraCommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onSelectView={(m) => {
          setOpenProject(null);
          setMode(m);
        }}
        onSelectProject={(ref) => goToProject(ref)}
      />

      {/* Tweaks panel — wire to your host Tweaks protocol or a toolbar button.
          Controls: accent (setAccent), density (setDensity), phaseLabels (setPhaseLabels). */}
    </div>
  );
}
