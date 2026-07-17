/**
 * WooDashboard — shell for the Woo-dashboard (Wet open overheid).
 * Gate: woo-coordinatie realm role.
 * Login target: test-woo-flevoland → /dashboard/woo
 *
 * PATCHED (feat/woo-dashboard follow-up):
 *   · Rail filters are now functional (state + wooFilterRows) and drive the
 *     Verzoekenregister; changing any filter auto-lands on the register.
 *   · Rail shows the live filtered count + a "Wissen" reset.
 *   · A subtle shell-level footnote states the charts are fixed illustrative
 *     aggregates and that filters act on the register (hidden on the register).
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
import { WOO_TABS, WOO_GATE_ROLE, type WooTabId } from './woo/modes.config';
import {
  WOO_FILTERS,
  WOO_REGISTER,
  wooDefaultFilters,
  wooAnyActive,
  wooFilterRows,
  type WooFilters,
} from './woo/woo.data';
import WooSectionRouter from '../components/WooDashboard/WooSectionRouter';
import WooCommandPalette from '../components/WooDashboard/WooCommandPalette';
import WooDock from '../components/WooDashboard/WooDock';
import WooNoAccessPanel from '../components/WooDashboard/WooNoAccessPanel';
import SessionExpiryWarning from '../components/SessionExpiryWarning';
import ChangelogPanel from './ChangelogPanel';
import './woo/dashboard-woo.css';

export default function WooDashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState<KeycloakUser | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_tenantConfig, setTenantConfig] = useState<TenantConfig | null>(null);

  const [tab, setTab] = useState<WooTabId>('overzicht');
  const [registerOpen, setRegisterOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [dockOpen, setDockOpen] = useState(false);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [filters, setFilters] = useState<WooFilters>(wooDefaultFilters);

  const accent = '#e70077';

  // Changing any filter lands the user on the (filtered) register — no modal.
  const setFilter = (id: string, val: string) => {
    setFilters((prev) => ({ ...prev, [id]: val }));
    setRegisterOpen(true);
  };
  const resetFilters = () => setFilters(wooDefaultFilters());

  const filteredRows = useMemo(() => wooFilterRows(WOO_REGISTER, filters), [filters]);
  const filtersActive = wooAnyActive(filters);

  useEffect(() => {
    if (keycloak.authenticated) {
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
  }, []);

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

  const isAuth = !!keycloak.authenticated;
  const hasGateRole = (user?.roles ?? []).includes(WOO_GATE_ROLE);

  const initials = (user?.name ?? 'U')
    .split(' ')
    .slice(0, 2)
    .map((s) => s[0])
    .join('')
    .toUpperCase();

  const handleLogin = () => {
    sessionStorage.setItem('selected_idp', 'medewerker');
    sessionStorage.setItem('post_login_redirect', '/dashboard/woo');
    navigate('/auth');
  };

  const handleLogout = () => {
    keycloak.logout({ redirectUri: window.location.origin + '/' });
  };

  return (
    <div
      className="cwd-v2 wood"
      style={{ ['--v2-accent' as string]: accent, ['--color-secondary' as string]: accent }}
    >
      <SessionExpiryWarning />

      <header className="v2-topbar">
        <div className="v2-logo" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
          <span className="v2-logo-box">
            <span className="v2-logo-mark">
              ronl<em>.</em>
            </span>
            <span className="v2-logo-sub">WOO-DASHBOARD</span>
          </span>
        </div>
        <button type="button" className="v2-search" onClick={() => setPaletteOpen(true)}>
          <span>🔍</span>
          <span style={{ flex: 1, textAlign: 'left' }}>Spring naar weergave of verzoek…</span>
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
        {WOO_TABS.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`v2-tab ${m.id === tab && !registerOpen ? 'active' : ''}`}
            onClick={() => {
              setRegisterOpen(false);
              setTab(m.id);
            }}
          >
            {m.label}
          </button>
        ))}
        <div className="v2-tabs-spacer" />
        <span className="v2-tenant-label">Provincie Flevoland · Woo-coördinatie</span>
      </nav>

      <div className={`v2-body ${dockOpen ? 'v2-with-dock' : ''}`}>
        <aside className="v2-rail" aria-label="Filters en register">
          <div className="v2-rail-card">
            Woo-dashboard
            <span className="w-rail-sub">Beheer &amp; verantwoording · Provincie Flevoland</span>
          </div>

          <div className="v2-rail-group">
            <div className="v2-rail-group-label">
              Filters
              {filtersActive && (
                <button type="button" className="w-rail-clear" onClick={resetFilters}>
                  Wissen
                </button>
              )}
            </div>
            <div className="w-rail-filter">
              {WOO_FILTERS.map((f) => (
                <div className="w-rail-field" key={f.id}>
                  <label htmlFor={`wf-${f.id}`}>{f.label}</label>
                  <select
                    id={`wf-${f.id}`}
                    value={filters[f.id]}
                    onChange={(e) => setFilter(f.id, e.target.value)}
                    className={filters[f.id] !== f.opts[0] ? 'on' : ''}
                  >
                    {f.opts.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                </div>
              ))}
              <p className="w-rail-hint">
                Filters bepalen het Verzoekenregister
                {filtersActive ? ` · ${filteredRows.length} van 218` : ''}.
              </p>
            </div>
          </div>

          <div className="v2-rail-group">
            <div className="v2-rail-group-label">Stand van zaken</div>
            <div className="w-rail-stats">
              <div className="w-rail-stat">
                <span>Open verzoeken</span>
                <b>34</b>
              </div>
              <div className="w-rail-stat">
                <span>
                  <span className="w-led rood" />
                  Over termijn
                </span>
                <b>8</b>
              </div>
              <div className="w-rail-stat">
                <span>
                  <span className="w-led geel" />
                  Op tijd
                </span>
                <b>87%</b>
              </div>
              <div className="w-rail-stat">
                <span>Bezwaren aanhangig</span>
                <b>9</b>
              </div>
            </div>
          </div>

          <div className="v2-rail-group">
            <div className="v2-rail-group-label">Register</div>
            <ul className="v2-rail-list">
              <li>
                <button
                  type="button"
                  className={`v2-rail-item ${registerOpen ? 'active' : ''}`}
                  onClick={() => setRegisterOpen(true)}
                >
                  <span>Verzoekenregister</span>
                  <span className="v2-rail-count">{filtersActive ? filteredRows.length : 218}</span>
                </button>
              </li>
            </ul>
          </div>
        </aside>

        <main className="v2-main">
          {!isAuth ? (
            <div className="v2-main-pad">
              <div className="v2-crumb">WOO-DASHBOARD</div>
              <h1 className="v2-page-title">Inloggen vereist</h1>
              <p style={{ color: '#4b5563', maxWidth: '52ch', margin: '14px 0 22px' }}>
                Log in als Woo-coördinator om verzoeken, tijdigheid en publicaties te bekijken.
              </p>
              <button type="button" className="v2-btn" onClick={handleLogin}>
                Inloggen als medewerker
              </button>
            </div>
          ) : !hasGateRole ? (
            <WooNoAccessPanel />
          ) : (
            <>
              <WooSectionRouter
                tab={tab}
                registerOpen={registerOpen}
                filters={filters}
                onResetFilters={resetFilters}
              />
              {!registerOpen && (
                <div className="w-datanote">
                  <span className="ic" aria-hidden="true">
                    i
                  </span>
                  <span>
                    Illustratieve cijfers — de grafieken tonen vaste aggregaten voor het boekjaar.
                    De filters in de linkerkolom werken op het{' '}
                    <button type="button" onClick={() => setRegisterOpen(true)}>
                      Verzoekenregister
                    </button>
                    .
                  </span>
                </div>
              )}
            </>
          )}
        </main>

        {dockOpen && <WooDock onClose={() => setDockOpen(false)} />}
      </div>

      {!dockOpen && (
        <button type="button" className="v2-dock-toggle" onClick={() => setDockOpen(true)}>
          Vraag de assistent
        </button>
      )}

      <WooCommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onSelectTab={(id) => {
          setRegisterOpen(false);
          setTab(id);
        }}
        onOpenRegister={() => setRegisterOpen(true)}
      />
    </div>
  );
}
