/**
 * PADashboardV2 — Public Affairs cockpit shell for Provincie Flevoland.
 *
 * Sibling to CaseworkerDashboardV2: same chrome (top bar · mode tabs · rail ·
 * main · assistant dock), same tenant theme, same ⌘K palette. Scoped under
 * `.pac` so it can't collide with the caseworker app (`.cwd-v2`).
 *
 * Modes:  Vandaag · Dossiers · Monitoring · Voortgang
 *
 * Access: gated on the `public-affairs` realm role AND `province` org-type.
 * The rail/palette only surface what the user may see; PASectionRouter is
 * the section dispatcher. Tenant theme flows from initializeTenantTheme(),
 * exactly as the caseworker shell does — no PA-specific colours hardcoded.
 *
 * What's intentionally inherited:
 *   - auth + getUser(), now via the host's registered PaCockpitAuth
 *   - tenant theme via initializeTenantTheme(user.municipality)
 *   - McpChatSection (via the host's Dock) for the IOU assistant
 *
 * What's new:
 *   - 4-mode PA information architecture (dossier-centric)
 *   - Kompas radar + 0–2 scorecard, signal duiding, lobby-canon timeline
 *
 * Host seams: this shell owns all five of them. Two are *services* read
 * through ../host (auth, tenant); three are *React* seams supplied on the
 * required `host` prop (the section router, the assistant dock, the session
 * warning and the changelog panel), plus the mode set itself. Nothing here
 * reaches for packages/frontend any more — see ../host for why the split runs
 * along the service/React line rather than putting everything in one place.
 */

import { useEffect, useMemo, useState } from 'react';
import type { ComponentType } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPaCockpitAuth, getPaCockpitTenant, type PaTenantConfig } from '../host';
import { PaModesProvider, usePaModes } from '../modes/PaModesContext';
import type { KeycloakUser } from '@ronl/shared';

import {
  SORT_SECTION_IDS,
  isPaItemVisible,
  type PaGateContext,
  type PaModeId,
  type OrgTypeGate,
  type PaModeConfig,
} from './public-affairs-v2/modes.config';
import { kompasTotal } from './public-affairs-v2/pa.data';
import { PaDataProvider, usePaData } from './public-affairs-v2/PaDataProvider';
import { Trend } from './public-affairs-v2/Kompas';
import type { Prioritering } from './public-affairs-v2/Vandaag';
import type { KompasViz } from './public-affairs-v2/Kompas';

import PACommandPalette from '../components/PADashboardV2/PACommandPalette';
import PANoAccessPanel from '../components/PADashboardV2/PANoAccessPanel';
import NotificationsPanel from './public-affairs-v2/NotificationsPanel';

// No direct dashboard-pa.css import here: every host imports the aggregated
// '@ronl/pa-cockpit/styles.css' (which pulls this in, plus dossierbeheer.css)
// before rendering PADashboardV2 — see packages/frontend/src/App.tsx and, from
// Task 11, packages/pa-demo/src/App.tsx. A second, partial import here would
// only be redundant for those hosts and would leave a future host that forgets
// the styles.css import with a half-styled cockpit and no error to say why.

/** Props the host's section dispatcher receives from the shell. */
export interface PaSectionRouterProps {
  sectionId: string;
  prioritering: Prioritering;
  kompasViz: KompasViz;
  user: KeycloakUser | null;
  tenantConfig: PaTenantConfig | null;
  onOpenDossier: (id: string) => void;
  onNavigate?: (mode: PaModeId, sectionId: string) => void;
}

/** Props the host's assistant dock receives from the shell. */
export interface PaDockProps {
  user: KeycloakUser | null;
  onClose: () => void;
}

/** Props the host's changelog slide-over receives from the shell. */
export interface PaChangelogPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * The React half of the host contract. `modes` is required rather than
 * defaulted to PA_MODES on purpose: a public, unauthenticated host must be
 * able to narrow the set, and a default would let it forget to.
 */
export interface PaCockpitHost {
  modes: PaModeConfig[];
  SectionRouter: ComponentType<PaSectionRouterProps>;
  Dock: ComponentType<PaDockProps>;
  SessionExpiryWarning: ComponentType;
  ChangelogPanel: ComponentType<PaChangelogPanelProps>;

  /**
   * Begin a login. Absent means this host offers no login, and no login control
   * renders — see the render rules in
   * docs/superpowers/specs/2026-08-27-cockpit-session-seam-design.md §4.
   */
  onLogin?: () => void;

  /**
   * End the session. Absent means this host has no session to end; the avatar
   * still renders as an identity display, but not as a button.
   */
  onLogout?: () => void;
}

function SignalCountBadge({ tabId }: { tabId: string }) {
  const { signals, inboxCounts } = usePaData();
  const count = signals.data.filter((s) => s.tab === tabId).length;
  const inboxCount = inboxCounts[tabId] ?? 0;
  return (
    <span className="pac-rail-score">
      {count}
      {inboxCount > 0 && <span className="pac-rail-inbox">{inboxCount}</span>}
    </span>
  );
}

/** Trigger only — same shape as the changelog button (opens the slide-over, never toggles). */
function NotificationBellButton({ onOpen }: { onOpen: () => void }) {
  const { notifications } = usePaData();
  const { unseenCount } = notifications.data;

  return (
    <button
      type="button"
      className="v2-changelog-btn"
      onClick={onOpen}
      aria-label="Open meldingen"
      title="Meldingen — nieuwe signalen op uw gevolgde zoekcriteria en dossiers"
    >
      <span aria-hidden="true">🔔</span>
      {unseenCount > 0 && <span className="pac-rail-inbox">{unseenCount}</span>}
    </button>
  );
}

function AgendaCountBadge() {
  const { agenda } = usePaData();
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = agenda.data.filter((a) => a.iso >= today && a.status !== 'geannuleerd').length;
  const live = agenda.data.some((a) => a.live === 'live');
  return (
    <span className="pac-rail-score">
      {upcoming}
      {live && <span className="pac-rail-live" title="Nu in de zaal" />}
    </span>
  );
}

function VandaagDossierRail({ onGoToDossier }: { onGoToDossier: (id: string) => void }) {
  const { dossiers } = usePaData();
  return (
    <div className="pac-rail-group">
      <div className="pac-rail-group-label">Snel naar dossier</div>
      <ul className="pac-rail-list">
        {dossiers.data
          .filter((d) => d.status === 'actief')
          .map((d) => (
            <li key={d.id}>
              <button type="button" className="pac-rail-item" onClick={() => onGoToDossier(d.id)}>
                <span className="pac-rail-label">{d.naam}</span>
                <span className="pac-rail-score">
                  {kompasTotal(d.kompas)}
                  <Trend dir={d.momentum} />
                </span>
              </button>
            </li>
          ))}
      </ul>
    </div>
  );
}

function DossiersModeRail({
  activeSection,
  onSelectDossier,
}: {
  activeSection: string;
  onSelectDossier: (id: string) => void;
}) {
  const { dossiers } = usePaData();
  const activeDossiers = dossiers.data.filter((d) => d.status === 'actief');
  const sluimerend = dossiers.data.filter((d) => d.status === 'sluimerend');
  const railItem = (d: (typeof dossiers.data)[number]) => (
    <li key={d.id}>
      <button
        type="button"
        className={`pac-rail-item ${activeSection === d.id ? 'active' : ''}`}
        onClick={() => onSelectDossier(d.id)}
      >
        <span className="pac-rail-label">{d.naam}</span>
        <span className="pac-rail-score">
          {kompasTotal(d.kompas)}
          <Trend dir={d.momentum} />
        </span>
      </button>
    </li>
  );
  return (
    <>
      <div className="pac-rail-group">
        <div className="pac-rail-group-label">Actief</div>
        <ul className="pac-rail-list">{activeDossiers.map(railItem)}</ul>
      </div>
      {sluimerend.length > 0 && (
        <div className="pac-rail-group">
          <div className="pac-rail-group-label">Sluimerend</div>
          <ul className="pac-rail-list">{sluimerend.map(railItem)}</ul>
        </div>
      )}
    </>
  );
}

/**
 * Keeps the dossier selection valid against the live list. Seeds the pointer at
 * startup, and — crucially — corrects it when the selected dossier is deleted or
 * archived out of the cockpit (e.g. from Beheer → Dossierbeheer), so navigating
 * back to Dossiers glides to a neighbour instead of a dangling section.
 */
function DossierSelectionSyncer({
  dossierId,
  activeSection,
  mode,
  setDossierId,
  setActiveSection,
}: {
  dossierId: string;
  activeSection: string;
  mode: PaModeId;
  setDossierId: (id: string) => void;
  setActiveSection: (id: string) => void;
}) {
  const { dossiers } = usePaData();
  useEffect(() => {
    if (dossiers.status !== 'ok') return;
    const validIds = new Set(dossiers.data.map((d) => d.id));
    const fallback = dossiers.data.find((d) => d.status === 'actief') ?? dossiers.data[0];
    const fallbackId = fallback?.id ?? '';
    // Pointer: fill when empty, correct when the selected dossier disappeared.
    if (!dossierId || !validIds.has(dossierId)) setDossierId(fallbackId);
    // In dossiers mode the active section IS a dossier id; if the one being
    // viewed vanished, move to the fallback rather than showing a placeholder.
    if (mode === 'dossiers' && activeSection && !validIds.has(activeSection)) {
      setActiveSection(fallbackId);
    }
  }, [
    dossiers.status,
    dossiers.data,
    dossierId,
    activeSection,
    mode,
    setDossierId,
    setActiveSection,
  ]);
  return null;
}

const STORAGE_KEY_DOCK = 'paV2.dock.open';
const REQUIRED_ROLES = ['public-affairs'];
const REQUIRED_ORG_TYPES: OrgTypeGate[] = ['province'];

/**
 * The shell body. Split out from the default export because it calls
 * usePaModes(), and a component cannot useContext a provider it renders
 * itself — the hook would run above the provider in the tree and throw.
 */
function PADashboardV2Inner({ host }: { host: PaCockpitHost }) {
  // Capitalised locals: JSX treats a lowercase tag as a literal HTML element,
  // so `<host.SectionRouter />` written as a lowercase binding would silently
  // render an unknown element instead of the host's component.
  const { SectionRouter, Dock, SessionExpiryWarning, ChangelogPanel } = host;
  const { modes } = usePaModes();

  const navigate = useNavigate();
  const [isAuthenticated] = useState<boolean>(() => !!getPaCockpitAuth().authenticated);
  const [user, setUser] = useState<KeycloakUser | null>(null);
  const [tenantConfig, setTenantConfig] = useState<PaTenantConfig | null>(null);

  // Seeded from the host's set, not from a hardcoded 'vandaag'. A host is free
  // to drop whole modes — that is what `modes` being required is *for* — and a
  // hardcoded seed would leave `mode` pointing outside the supplied set on the
  // very first render. For the full PA_MODES this is byte-identical: modes[0]
  // is 'vandaag' and its defaultSectionId is 'vandaag'.
  // PaModesProvider guarantees the set is non-empty, so modes[0] is safe here.
  const [mode, setMode] = useState<PaModeId>(() => modes[0].id);
  const [activeSection, setActiveSection] = useState<string>(() => modes[0].defaultSectionId);
  const [lastSection, setLastSection] = useState<Partial<Record<PaModeId, string>>>({});
  const [dossierId, setDossierId] = useState<string>('');
  // Seeded to '' at mount; DossierSelectionSyncer picks the first actief dossier
  // once dossiers.status becomes 'ok', and re-points it if the current selection
  // is later deleted/archived. A still-valid user selection is never overwritten.

  // Tweakable axes (rail-driven). Kept in shell state so they survive nav.
  const [prioritering, setPrioritering] = useState<Prioritering>('kompas');
  const [kompasViz] = useState<KompasViz>('radar');

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [dockOpen, setDockOpen] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(STORAGE_KEY_DOCK) === '1';
    } catch {
      return false;
    }
  });

  // ── Tenant theme + user once we know auth state ─────────
  useEffect(() => {
    // Resolved inside the effect, never at module scope: a module-scope read
    // would run at import time, before any host has called configurePaCockpit.
    const tenant = getPaCockpitTenant();
    if (isAuthenticated) {
      const currentUser = getPaCockpitAuth().getUser();
      setUser(currentUser);
      if (currentUser?.municipality) {
        tenant.initializeTenantTheme(currentUser.municipality).then(() => {
          tenant.loadTenantConfigs().then(() => {
            setTenantConfig(tenant.getTenantConfig(currentUser.municipality!));
          });
        });
        return;
      }
    }
    tenant.loadTenantConfigs().then(() => {
      setTenantConfig(tenant.getDefaultTenantConfig());
    });
  }, [isAuthenticated]);

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

  const isAuth = !!user;

  const gateContext: PaGateContext = useMemo(
    () => ({
      isAuthenticated: isAuth,
      userRoles: user?.roles ?? [],
      userOrgType: (user?.organisation_type ?? null) as OrgTypeGate | null,
    }),
    [isAuth, user]
  );

  // Shell-level access gate. The cockpit is for PA staff of the province.
  const orgType = gateContext.userOrgType;
  const hasAccess =
    isAuth &&
    REQUIRED_ROLES.some((r) => gateContext.userRoles.includes(r)) &&
    !!orgType &&
    REQUIRED_ORG_TYPES.includes(orgType);

  // Track the last visited section per mode so switching back restores it.
  useEffect(() => {
    setLastSection((prev) => ({ ...prev, [mode]: activeSection }));
  }, [mode, activeSection]);

  // When switching modes, restore the last visited section or fall back to default.
  const switchMode = (m: PaModeId) => {
    setMode(m);
    const restore = lastSection[m];
    if (restore) setActiveSection(restore);
    else if (m === 'vandaag') setActiveSection('vandaag');
    else if (m === 'dossiers') setActiveSection(dossierId);
    else if (m === 'monitoring') setActiveSection('politiek');
    else if (m === 'voortgang') setActiveSection('voortgang');
    else if (m === 'beheer') setActiveSection('profiel');
  };

  const goToDossier = (id: string) => {
    setMode('dossiers');
    setDossierId(id);
    setActiveSection(id);
  };

  // Total, not `!`. `mode` can be set to something outside the host's set from
  // three directions: goToDossier hardcodes 'dossiers', the host's SectionRouter
  // calls onNavigate with a mode of its choosing, and the palette's onSelect.
  // Under the old `!` any of those landing on a mode the host did not supply
  // *and* not handled by the vandaag/dossiers rail branches crashed on
  // `currentMode.label` below. Degrade to the first supplied mode instead.
  const currentMode = modes.find((m) => m.id === mode) ?? modes[0];

  const handleLogin = () => {
    sessionStorage.setItem('selected_idp', 'medewerker');
    sessionStorage.setItem('post_login_redirect', '/dashboard/public-affairs');
    navigate('/auth');
  };
  const handleLogout = () => {
    const auth = getPaCockpitAuth();
    if (auth.authenticated) {
      auth.logout({ redirectUri: window.location.origin + '/' });
    } else {
      navigate('/dashboard/public-affairs');
    }
  };

  // ── Rail content per mode ──
  const renderRail = () => {
    if (mode === 'vandaag') {
      return (
        <>
          <div className="pac-rail-card">
            <small>PA-Cockpit</small>
            Vandaag
          </div>
          <div className="pac-rail-group">
            <div className="pac-rail-group-label">Sortering top-issues</div>
            <ul className="pac-rail-list">
              {(
                [
                  ['kompas', 'Kompas-prioriteit'],
                  ['momentum', 'Momentum-prioriteit'],
                ] as const
              ).map(([id, label]) => (
                <li key={id}>
                  <button
                    type="button"
                    className={`pac-rail-item ${prioritering === id ? 'active' : ''}`}
                    onClick={() => {
                      setPrioritering(id);
                      setActiveSection('vandaag');
                    }}
                  >
                    <span className="pac-rail-label">{label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <VandaagDossierRail onGoToDossier={goToDossier} />
        </>
      );
    }

    if (mode === 'dossiers') {
      return (
        <>
          <div className="pac-rail-card">
            <small>PA-Cockpit</small>
            Dossiers
          </div>
          <DossiersModeRail
            activeSection={activeSection}
            onSelectDossier={(id) => {
              setDossierId(id);
              setActiveSection(id);
            }}
          />
        </>
      );
    }

    // monitoring + voortgang: static groups from config, filtered by gate.
    return (
      <>
        <div className="pac-rail-card">
          <small>PA-Cockpit</small>
          {currentMode.label}
        </div>
        {currentMode.groups.map((g, gi) => {
          const items = g.items.filter(
            (i) => isPaItemVisible(i, gateContext) && !SORT_SECTION_IDS.has(i.id)
          );
          if (items.length === 0) return null;
          return (
            <div key={g.label ?? gi} className="pac-rail-group">
              {g.label && <div className="pac-rail-group-label">{g.label}</div>}
              <ul className="pac-rail-list">
                {items.map((it) => {
                  return (
                    <li key={it.id}>
                      <button
                        type="button"
                        className={`pac-rail-item ${activeSection === it.id ? 'active' : ''}`}
                        onClick={() => setActiveSection(it.id)}
                      >
                        <span className="pac-rail-label">{it.label}</span>
                        {it.badgeKey === 'signalCount' && <SignalCountBadge tabId={it.id} />}
                        {it.badgeKey === 'agendaCount' && <AgendaCountBadge />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </>
    );
  };

  const initials = (user?.name ?? 'U')
    .split(' ')
    .slice(0, 2)
    .map((s) => s[0])
    .join('')
    .toUpperCase();

  return (
    <div className="pac">
      <PaDataProvider>
        <SessionExpiryWarning />
        <ChangelogPanel isOpen={changelogOpen} onClose={() => setChangelogOpen(false)} />
        <NotificationsPanel
          isOpen={notificationsOpen}
          onClose={() => setNotificationsOpen(false)}
        />

        {/* ── Top bar ── */}
        <header className="pac-topbar">
          <div className="pac-logo" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
            <span className="pac-logo-box">
              <span className="pac-logo-mark">
                ronl<em>.</em>
              </span>
              <span className="pac-logo-sub">PA-COCKPIT</span>
            </span>
          </div>

          <button
            type="button"
            className="pac-search"
            onClick={() => setPaletteOpen(true)}
            aria-label="Snel navigeren"
          >
            <span>🔍</span>
            <span style={{ flex: 1, textAlign: 'left' }}>Spring naar een dossier of sectie…</span>
            <span className="pac-key">⌘K</span>
          </button>

          <div className="pac-user">
            {isAuth ? (
              <>
                {user?.loa && <span className="pac-loa">LOA {user.loa}</span>}
                <span className="pac-username">
                  {user?.name ?? user?.preferred_username ?? 'Medewerker'}
                </span>
                <button
                  type="button"
                  className="pac-avatar"
                  onClick={handleLogout}
                  title="Uitloggen"
                >
                  {initials}
                </button>
                <NotificationBellButton onOpen={() => setNotificationsOpen(true)} />
                <button
                  type="button"
                  className="v2-changelog-btn"
                  onClick={() => setChangelogOpen(true)}
                  aria-label="Open changelog"
                  title="Changelog"
                >
                  <span aria-hidden="true">📋</span>
                </button>
              </>
            ) : (
              <button type="button" className="pac-btn pac-btn-sm" onClick={handleLogin}>
                Inloggen
              </button>
            )}
          </div>
        </header>

        {/* ── Mode tabs ── */}
        <nav className="pac-tabs" aria-label="Werkmodus">
          {modes.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`pac-tab ${m.id === mode ? 'active' : ''}`}
              onClick={() => switchMode(m.id)}
            >
              {m.label}
            </button>
          ))}
          <div className="pac-tabs-spacer" />
          {tenantConfig && <span className="pac-tenant-label">{tenantConfig.displayName}</span>}
        </nav>

        {/* ── Body ── */}
        <DossierSelectionSyncer
          dossierId={dossierId}
          activeSection={activeSection}
          mode={mode}
          setDossierId={setDossierId}
          setActiveSection={setActiveSection}
        />
        <div className="pac-body">
          <aside className="pac-rail" aria-label="Sectienavigatie">
            {renderRail()}
          </aside>

          <main className="pac-main">
            <div className="pac-main-pad">
              {!isAuth ? (
                <div>
                  <div className="pac-crumb">PA-Cockpit</div>
                  <h1 className="pac-page-title">Inloggen vereist</h1>
                  <p style={{ color: 'var(--pac-ink-2)', maxWidth: '54ch', margin: '14px 0 22px' }}>
                    De PA-Cockpit bevat strategische dossierinformatie. Log in als medewerker om
                    verder te gaan.
                  </p>
                  <button type="button" className="pac-btn" onClick={handleLogin}>
                    Inloggen als medewerker
                  </button>
                </div>
              ) : !hasAccess ? (
                <PANoAccessPanel
                  requiredRoles={REQUIRED_ROLES}
                  requiredOrgTypes={REQUIRED_ORG_TYPES}
                />
              ) : (
                <SectionRouter
                  sectionId={activeSection}
                  prioritering={prioritering}
                  kompasViz={kompasViz}
                  user={user}
                  tenantConfig={tenantConfig}
                  onOpenDossier={goToDossier}
                  onNavigate={(m, s) => {
                    setMode(m);
                    setActiveSection(s);
                  }}
                />
              )}
            </div>
          </main>

          {hasAccess && dockOpen && <Dock user={user} onClose={() => setDockOpen(false)} />}
        </div>

        {hasAccess && !dockOpen && (
          <button type="button" className="pac-dock-toggle" onClick={() => setDockOpen(true)}>
            Vraag de assistent
          </button>
        )}

        <PACommandPalette
          open={paletteOpen}
          onClose={() => setPaletteOpen(false)}
          onSelect={(m, sectionId) => {
            setMode(m);
            if (m === 'dossiers') setDossierId(sectionId);
            setActiveSection(sectionId);
          }}
        />
      </PaDataProvider>
    </div>
  );
}

/**
 * The cockpit shell. `host` is required — it carries the mode set plus the
 * four components the shell renders but does not own. The provider is
 * rendered here rather than inside the body so the body can consume it.
 */
export default function PADashboardV2({ host }: { host: PaCockpitHost }) {
  return (
    <PaModesProvider modes={host.modes}>
      <PADashboardV2Inner host={host} />
    </PaModesProvider>
  );
}
