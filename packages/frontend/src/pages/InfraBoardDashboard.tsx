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
  phaseSectionId,
  type InfraModeId,
} from './infra-board/modes.config';
import InfraSectionRouter from '../components/InfraBoardDashboard/InfraSectionRouter';
import InfraCommandPalette from '../components/InfraBoardDashboard/InfraCommandPalette';
import InfraDock from '../components/InfraBoardDashboard/InfraDock';
import InfraNoAccessPanel from '../components/InfraBoardDashboard/InfraNoAccessPanel';
import { RipActiveAcrossPhasesProvider } from '../components/InfraBoardDashboard/RipActiveAcrossPhasesProvider';
import SessionExpiryWarning from '../components/SessionExpiryWarning';
import ChangelogPanel from './ChangelogPanel';
import {
  useOpenTasks,
  useRipActiveAcrossPhases,
  useDeployedProcessKeys,
  useLivePhaseCounts,
} from '../services/infra.api';
import {
  getMockPortfolio,
  getMockTodos,
  getMockPhaseCounts,
  makeLivePhaseRow,
  type PortfolioProject,
} from './infra-board/infra-board.data';
import { RIP_PHASES } from './infra-board/rip-phases.catalog';
import { combinePhaseCounts, normalizeLiveCounts } from './infra-board/rip-phase-counts';
import {
  mijnDagRailStats,
  portfolioRailStageGroups,
  portfolioRailTransitions,
  portfolioRailHealth,
  beheerRailSubtitle,
  beheerRailPhaseGroups,
} from './infra-board/rail-stats';

import './infra-board/dashboard-infra.css';

const STORAGE_KEY_DOCK = 'infraBoard.dock.open';

/** A project selection: live Fase-1 instance (instanceId) or a mock row (nr). */
export interface ProjectRef {
  nr: string;
  instanceId?: string;
}

/**
 * Wraps the actual dashboard in `RipActiveAcrossPhasesProvider` so its one
 * fetch of active RIP instances is shared by the page itself and everything
 * it renders — Portfolio, InfraCommandPalette and ProjectDetail all call
 * `useRipActiveAcrossPhases()` too, and without a shared provider each would
 * fire its own request. The provider has to sit above `InfraBoardDashboardContent`
 * rather than inside it, since that component's own call to the hook needs
 * the context already in scope.
 */
export default function InfraBoardDashboard() {
  return (
    <RipActiveAcrossPhasesProvider>
      <InfraBoardDashboardContent />
    </RipActiveAcrossPhasesProvider>
  );
}

function InfraBoardDashboardContent() {
  const navigate = useNavigate();
  const [isAuthenticated] = useState<boolean>(() => !!keycloak.authenticated);
  const [user, setUser] = useState<KeycloakUser | null>(null);
  const [tenantConfig, setTenantConfig] = useState<TenantConfig | null>(null);

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

  // Live data for the rail stats panels. Unconditional, like every other
  // Infra-board component's hook calls — cheap, and consistent with how
  // Portfolio.tsx/FaseladderOverview.tsx already source their own live data
  // rather than lifting it here and threading it down as props.
  const { data: liveTasks } = useOpenTasks();
  const { data: liveInstances } = useRipActiveAcrossPhases();
  const { data: deployment } = useDeployedProcessKeys();
  const { data: liveCountsRaw } = useLivePhaseCounts();

  const liveRows: PortfolioProject[] = (liveInstances ?? []).map((i) =>
    makeLivePhaseRow(i, i.phaseCode)
  );
  const liveNrs = new Set(liveRows.map((r) => r.nr));
  const allProjects = [...liveRows, ...getMockPortfolio().filter((p) => !liveNrs.has(p.nr))];

  const deployedKeys = new Set(deployment?.deployedKeys ?? []);
  const combinedCounts = combinePhaseCounts(
    getMockPhaseCounts(),
    normalizeLiveCounts(liveCountsRaw?.counts ?? {}, RIP_PHASES)
  );

  const mijnDagStats = mijnDagRailStats(liveTasks, getMockTodos(), allProjects);
  const portfolioStageGroups = portfolioRailStageGroups(allProjects);
  const portfolioTransitions = portfolioRailTransitions(allProjects);
  const portfolioHealth = portfolioRailHealth(allProjects);
  const beheerSubtitle = beheerRailSubtitle(combinedCounts);

  const beheerPhaseGroups = beheerRailPhaseGroups(combinedCounts, deployedKeys);

  // Shared renderer for every plain (non-badge) rail group — Account, IOU,
  // Hulpmiddelen, and (for mijn-dag/portfolio's own unaffected paths)
  // whatever they still pass through here. Beheer's Faseladder/phase/
  // Archief section is hand-rendered separately below, spliced between
  // visibleGroups[0] (Account) and visibleGroups.slice(1) (IOU,
  // Hulpmiddelen) — see the JSX.
  const renderNavGroup = (g: (typeof visibleGroups)[number], key: string | number) => (
    <div key={key} className="v2-rail-group">
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
  );

  const goToProject = (ref: ProjectRef) => setOpenProject(ref);
  const initials = (user?.name ?? 'U')
    .split(' ')
    .slice(0, 2)
    .map((s) => s[0])
    .join('')
    .toUpperCase();

  const [changelogOpen, setChangelogOpen] = useState(false);

  const handleLogin = () => {
    sessionStorage.setItem('selected_idp', 'medewerker');
    sessionStorage.setItem('post_login_redirect', '/dashboard/infra-board');
    navigate('/auth');
  };

  const handleLogout = () => {
    keycloak.logout({ redirectUri: window.location.origin + '/' });
  };

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
          {isAuth ? (
            <>
              {user?.loa && <span className="v2-loa">LOA {user.loa}</span>}
              <span className="v2-username">
                {user?.name ?? user?.preferred_username ?? 'Medewerker'}
              </span>
              <button type="button" className="v2-avatar" onClick={handleLogout} title="Uitloggen">
                {initials}
              </button>
            </>
          ) : (
            <button type="button" className="v2-login-btn" onClick={handleLogin}>
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
            {mode === 'mijn-dag' && isAuth && (
              <span className="pb-rail-sub">
                Persoonlijk · {user?.name ?? user?.preferred_username}
              </span>
            )}
            {mode === 'portfolio' && isAuth && (
              <span className="pb-rail-sub">
                {allProjects.length} projecten · venster 2022–2027
              </span>
            )}
            {mode === 'beheer' && isAuth && <span className="pb-rail-sub">{beheerSubtitle}</span>}
          </div>

          {mode === 'mijn-dag' && isAuth && (
            <div className="pb-rail-stats">
              {mijnDagStats.map((s) => (
                <div className="pb-rail-stat" key={s.label}>
                  <span>
                    {s.dotColor && <span className="dot" style={{ background: s.dotColor }} />}
                    {s.label}
                  </span>
                  <b>{s.value}</b>
                </div>
              ))}
            </div>
          )}

          {mode === 'portfolio' && isAuth && (
            <>
              {portfolioStageGroups.map(({ stage, phases }) => (
                <div className="v2-rail-group" key={stage.code}>
                  <div className="v2-rail-group-label">
                    <span className="pb-stage-dot" style={{ background: stage.color }} />
                    {stage.code} · {stage.name}
                  </div>
                  <div className="pb-rail-stats">
                    {phases.map(({ phase, count }) => (
                      <div className="pb-rail-stat" key={phase.code}>
                        <span>
                          <span className="pb-rail-code">{phase.code}</span>
                          {phase.name}
                        </span>
                        <b>{count}</b>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <div className="v2-rail-group">
                <div className="v2-rail-group-label">Overgangen</div>
                <div className="pb-rail-stats">
                  {portfolioTransitions.map((s) => (
                    <div className="pb-rail-stat" key={s.label}>
                      <span>
                        {s.dotColor && <span className="dot" style={{ background: s.dotColor }} />}
                        {s.label}
                      </span>
                      <b>{s.value}</b>
                    </div>
                  ))}
                </div>
              </div>
              <div className="v2-rail-group">
                <div className="v2-rail-group-label">Gezondheid</div>
                <div className="pb-rail-stats">
                  {portfolioHealth.map((s) => (
                    <div className="pb-rail-stat" key={s.label}>
                      <span>
                        {s.dotColor && <span className="dot" style={{ background: s.dotColor }} />}
                        {s.label}
                      </span>
                      <b>{s.value}</b>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {mode === 'beheer' ? (
            <>
              {/* visibleGroups[0] is always the Account group in beheer
                  mode — Account/IOU/Hulpmiddelen all gate on authRequired
                  only (no role checks), so filtering never drops or
                  reorders one without the others. */}
              {visibleGroups[0] && renderNavGroup(visibleGroups[0], visibleGroups[0].label ?? 0)}

              {isAuth && (
                <div className="v2-rail-group">
                  <ul className="v2-rail-list">
                    <li>
                      <button
                        type="button"
                        className={`v2-rail-item ${activeSection === 'faseladder' && !openProject ? 'active' : ''}`}
                        onClick={() => {
                          setOpenProject(null);
                          setActiveSection('faseladder');
                        }}
                      >
                        <span>Faseladder</span>
                      </button>
                    </li>
                  </ul>
                </div>
              )}

              {hasGateRole &&
                beheerPhaseGroups.map(({ stage, phases }) => (
                  <div className="v2-rail-group" key={stage.code}>
                    <div className="v2-rail-group-label">
                      <span className="pb-stage-dot" style={{ background: stage.color }} />
                      {stage.code} · {stage.name}
                    </div>
                    <ul className="v2-rail-list">
                      {phases.map(({ phase, count, muted }) => {
                        const sectionId = phaseSectionId(phase.code);
                        return (
                          <li key={phase.code}>
                            <button
                              type="button"
                              className={`v2-rail-item ${activeSection === sectionId && !openProject ? 'active' : ''} ${muted ? 'muted' : ''}`}
                              onClick={() => {
                                setOpenProject(null);
                                setActiveSection(sectionId);
                              }}
                            >
                              <span>
                                <span className="pb-rail-code">{phase.code}</span>
                                {phase.name}
                              </span>
                              {count > 0 && <span className="pb-rail-badge">{count}</span>}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}

              {isAuth && (
                <div className="v2-rail-group">
                  <ul className="v2-rail-list">
                    <li>
                      <button
                        type="button"
                        className={`v2-rail-item ${activeSection === 'archief' && !openProject ? 'active' : ''}`}
                        onClick={() => {
                          setOpenProject(null);
                          setActiveSection('archief');
                        }}
                      >
                        <span>Archief</span>
                      </button>
                    </li>
                  </ul>
                </div>
              )}

              {visibleGroups.slice(1).map((g, i) => renderNavGroup(g, g.label ?? i + 1))}
            </>
          ) : (
            visibleGroups.map((g, i) => renderNavGroup(g, g.label ?? i))
          )}
        </aside>

        <main className="v2-main">
          {!isAuth ? (
            <div className="v2-main-pad">
              <div className="v2-crumb">INFRA-BOARD</div>
              <h1 className="v2-page-title">Inloggen vereist</h1>
              <p style={{ color: '#4b5563', maxWidth: '52ch', margin: '14px 0 22px' }}>
                Log in als medewerker van het infra-projectteam om je dag, portfolio en
                RIP-projecten te bekijken.
              </p>
              <button type="button" className="v2-btn" onClick={handleLogin}>
                Inloggen als medewerker
              </button>
            </div>
          ) : !hasGateRole ? (
            <InfraNoAccessPanel />
          ) : (
            <InfraSectionRouter
              mode={mode}
              section={activeSection}
              openProject={openProject}
              user={user}
              tenantConfig={tenantConfig}
              onOpenProject={goToProject}
              onBack={() => setOpenProject(null)}
              onGotoPortfolio={() => {
                setOpenProject(null);
                setMode('portfolio');
              }}
              onOpenPhase={(code) => setActiveSection(phaseSectionId(code))}
              onBackToFaseladder={() => setActiveSection('faseladder')}
            />
          )}
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
          Controls: accent (setAccent), density (setDensity). */}
    </div>
  );
}
