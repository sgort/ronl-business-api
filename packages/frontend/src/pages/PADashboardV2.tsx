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
 *   - keycloak auth + getUser()
 *   - tenant theme via initializeTenantTheme(user.municipality)
 *   - McpChatSection (via PADock) for the IOU assistant
 *
 * What's new:
 *   - 4-mode PA information architecture (dossier-centric)
 *   - Kompas radar + 0–2 scorecard, signal duiding, lobby-canon timeline
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
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
  PA_MODES,
  SORT_SECTION_IDS,
  isPaItemVisible,
  type PaGateContext,
  type PaModeId,
  type OrgTypeGate,
} from './public-affairs-v2/modes.config';
import { paTabConnected, SIGNALS_MOCK } from '../services/pa.api';
import { kompasTotal } from './public-affairs-v2/pa.data';
import { PaDataProvider, usePaData } from './public-affairs-v2/PaDataProvider';
import { Trend } from './public-affairs-v2/Kompas';
import type { Prioritering } from './public-affairs-v2/Vandaag';
import type { KompasViz } from './public-affairs-v2/Kompas';

import PASectionRouter from '../components/PADashboardV2/PASectionRouter';
import PACommandPalette from '../components/PADashboardV2/PACommandPalette';
import PADock from '../components/PADashboardV2/PADock';
import PANoAccessPanel from '../components/PADashboardV2/PANoAccessPanel';
import SessionExpiryWarning from '../components/SessionExpiryWarning';
import ChangelogPanel from './ChangelogPanel';

import './public-affairs-v2/dashboard-pa.css';

function SignalCountBadge({ tabId }: { tabId: string }) {
  const { signals, inboxCounts } = usePaData();
  const connected = paTabConnected(tabId);
  const count = signals.data.filter((s) => s.tab === tabId).length;
  const inboxCount = inboxCounts[tabId] ?? 0;
  return (
    <span className="pac-rail-score">
      {!SIGNALS_MOCK && !connected ? <span className="pac-rail-dim">—</span> : count}
      {inboxCount > 0 && <span className="pac-rail-inbox">{inboxCount}</span>}
    </span>
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

function DossierIdSyncer({ onReady }: { onReady: (id: string) => void }) {
  const { dossiers } = usePaData();
  useEffect(() => {
    if (dossiers.status !== 'ok') return;
    const first = dossiers.data.find((d) => d.status === 'actief') ?? dossiers.data[0];
    if (first) onReady(first.id);
  }, [dossiers.status, dossiers.data, onReady]);
  return null;
}

const STORAGE_KEY_DOCK = 'paV2.dock.open';
const REQUIRED_ROLES = ['public-affairs'];
const REQUIRED_ORG_TYPES: OrgTypeGate[] = ['province'];

export default function PADashboardV2() {
  const navigate = useNavigate();
  const [isAuthenticated] = useState<boolean>(() => !!keycloak.authenticated);
  const [user, setUser] = useState<KeycloakUser | null>(null);
  const [tenantConfig, setTenantConfig] = useState<TenantConfig | null>(null);

  const [mode, setMode] = useState<PaModeId>('vandaag');
  const [activeSection, setActiveSection] = useState<string>('vandaag');
  const [dossierId, setDossierId] = useState<string>('');
  // Seeded to '' at mount; DossierIdSyncer picks the first actief dossier once
  // the provider's dossiers.status becomes 'ok'. Using prev || id ensures
  // a user-selected id is never overwritten by a late-arriving init.
  const initDossierId = useCallback((id: string) => {
    setDossierId((prev) => prev || id);
  }, []);

  // Tweakable axes (rail-driven). Kept in shell state so they survive nav.
  const [prioritering, setPrioritering] = useState<Prioritering>('kompas');
  const [kompasViz] = useState<KompasViz>('radar');

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [dockOpen, setDockOpen] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(STORAGE_KEY_DOCK) === '1';
    } catch {
      return false;
    }
  });

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

  // When switching modes, jump to that mode's default section.
  const switchMode = (m: PaModeId) => {
    setMode(m);
    if (m === 'vandaag') setActiveSection('vandaag');
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

  const currentMode = PA_MODES.find((m) => m.id === mode)!;

  const handleLogin = () => {
    sessionStorage.setItem('selected_idp', 'medewerker');
    sessionStorage.setItem('post_login_redirect', '/dashboard/public-affairs');
    navigate('/auth');
  };
  const handleLogout = () => {
    if (keycloak.authenticated) {
      keycloak.logout({ redirectUri: window.location.origin + '/' });
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
      <SessionExpiryWarning />
      <ChangelogPanel isOpen={changelogOpen} onClose={() => setChangelogOpen(false)} />

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
              <button type="button" className="pac-avatar" onClick={handleLogout} title="Uitloggen">
                {initials}
              </button>
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
        {PA_MODES.map((m) => (
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
      <PaDataProvider>
        <DossierIdSyncer onReady={initDossierId} />
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
                <PASectionRouter
                  sectionId={activeSection}
                  prioritering={prioritering}
                  kompasViz={kompasViz}
                  user={user}
                  tenantConfig={tenantConfig}
                  onOpenDossier={goToDossier}
                />
              )}
            </div>
          </main>

          {hasAccess && dockOpen && <PADock user={user} onClose={() => setDockOpen(false)} />}
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
