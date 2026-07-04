import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import ChangelogPanel from './ChangelogPanel';
import { BOARDS } from './login-choice/boards.config';
import BoardCard from '../components/LoginChoice/BoardCard';
import './login-choice/login-portal.css';

const POST_LOGIN_KEY = 'post_login_redirect';

export default function LoginChoice() {
  const navigate = useNavigate();
  const [changelogOpen, setChangelogOpen] = useState(false);

  function startMedewerkerLogin(target?: string, usernameHint?: string) {
    try {
      if (target) sessionStorage.setItem(POST_LOGIN_KEY, target);
      if (usernameHint) sessionStorage.setItem('username_hint', usernameHint);
      sessionStorage.setItem('selected_idp', 'medewerker');
    } catch {
      /* sessionStorage unavailable — AuthCallback still defaults sensibly */
    }
    navigate('/auth');
  }

  function startCitizenLogin(idp: 'digid' | 'eherkenning' | 'eidas') {
    try {
      sessionStorage.setItem('selected_idp', idp);
    } catch {
      /* non-fatal */
    }
    navigate('/auth');
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
        <button type="button" className="login-link" onClick={() => startMedewerkerLogin()}>
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
        <button type="button" className="citizen-link" onClick={() => startCitizenLogin('digid')}>
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
            <a className="btn-primary" href="#boards">
              Bekijk de borden
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
              Inloggen vereist via medewerkersaccount
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
