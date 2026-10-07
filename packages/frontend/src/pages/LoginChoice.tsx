import { useEffect, useState } from 'react';

import ChangelogPanel from './ChangelogPanel';
import { BOARDS } from './login-choice/boards.config';
import { useLandingLogin } from './login-choice/landing-login';
import BoardCard from '../components/LoginChoice/BoardCard';
import SingleBoardLanding from '../components/LoginChoice/SingleBoardLanding';
import { FLEVOLAND_IDP } from '../services/identity-providers';
import {
  applyTenantTheme,
  loadTenantConfigs,
  resolveLandingTenant,
  type TenantConfig,
} from '../services/tenant';
import './login-choice/login-portal.css';

/**
 * The tenant the page is for, once tenants.json has answered. null means none
 * could be resolved, which shows the Flevoland grid as before.
 */
function useLandingTenant(): { resolved: boolean; tenant: TenantConfig | null } {
  const [state, setState] = useState<{ resolved: boolean; tenant: TenantConfig | null }>({
    resolved: false,
    tenant: null,
  });

  useEffect(() => {
    let live = true;
    loadTenantConfigs().then((registry) => {
      if (!live) return;
      // A failed load returns {} but keeps any earlier cache; resolve only from a fresh one.
      const tenant = Object.keys(registry).length
        ? resolveLandingTenant(window.location.search)
        : null;
      if (tenant) applyTenantTheme(tenant.theme);
      setState({ resolved: true, tenant });
    });
    return () => {
      live = false;
    };
  }, []);

  return state;
}

export default function LoginChoice() {
  const [changelogOpen, setChangelogOpen] = useState(false);
  const { startMedewerkerLogin, startIdpLogin } = useLandingLogin();
  const { resolved, tenant } = useLandingTenant();

  // Without ?tenant= the page is Flevoland's grid, which renders at once. With
  // it, wait for tenants.json rather than flash Flevoland at another tenant.
  if (!resolved && new URLSearchParams(window.location.search).has('tenant')) return null;

  // A tenant without "boards" has all of them, so Flevoland keeps its grid.
  const boardIds = tenant?.boards;
  const tenantBoards = boardIds ? BOARDS.filter((board) => boardIds.includes(board.id)) : BOARDS;
  if (tenant && tenantBoards.length === 1) {
    return <SingleBoardLanding tenant={tenant} board={tenantBoards[0]} />;
  }

  return (
    <div className="lcp">
      <header className="topbar">
        <span className="brand">
          <span className="word">
            ronl<b>.</b>
          </span>
          <span className="sub">WERKOMGEVING</span>
        </span>
        <button
          type="button"
          className="login-link"
          onClick={() => startMedewerkerLogin(undefined, 'test-caseworker-flevoland')}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
            <polyline points="10 17 15 12 10 7" />
            <line x1="15" y1="12" x2="3" y2="12" />
          </svg>
          Inloggen
        </button>
        <button
          type="button"
          className="citizen-link"
          onClick={() => startIdpLogin('digid', 'test-citizen-flevoland')}
        >
          Inwoner? Log in met DigiD
        </button>
        <span className="tenant">
          Provincie
          <br />
          Flevoland
        </span>
      </header>

      <main className="wrap">
        <section className="hero">
          <p className="eyebrow">Eén werkomgeving · Provincie Flevoland</p>
          <h1>Vier borden voor het werk van de provincie.</h1>
          <p>
            ronl. brengt het dagelijkse werk samen in overzichtelijke borden — van zaakbehandeling
            tot bestuurlijke afstemming, projectsturing en Woo-verantwoording. Log in met uw
            medewerkersaccount om het bord te openen dat bij uw rol hoort.
          </p>
          <div className="hero-actions">
            <button
              type="button"
              className="btn-primary"
              onClick={() => startIdpLogin(FLEVOLAND_IDP)}
            >
              Inloggen met uw Flevoland-account
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </button>
            <a className="btn-secondary" href="#boards">
              Bekijk de borden
            </a>
            <span className="hero-note">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              Met het account waarmee u op uw werkplek bent aangemeld
            </span>
          </div>
        </section>

        <div className="section-head" id="boards">
          <h2>Beschikbare borden</h2>
          <span className="count">{BOARDS.length} borden · allemaal beschikbaar</span>
        </div>

        <section className="boards">
          {BOARDS.map((board) => (
            <BoardCard
              key={board.id}
              board={board}
              onOpen={() => startMedewerkerLogin(board.route, board.testUser)}
            />
          ))}
        </section>

        <div className="access">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <span>
            <b>Toegang op rol.</b> Welke borden u ziet na inloggen hangt af van uw rol en
            machtigingen binnen de provincie. Heeft u nog geen toegang? Neem contact op met uw
            functioneel beheerder.
          </span>
        </div>

        <footer>
          <span>© Provincie Flevoland · ronl. werkomgeving</span>
          <button type="button" className="changelog-link" onClick={() => setChangelogOpen(true)}>
            Changelog
          </button>
        </footer>
      </main>

      <ChangelogPanel isOpen={changelogOpen} onClose={() => setChangelogOpen(false)} />
    </div>
  );
}
