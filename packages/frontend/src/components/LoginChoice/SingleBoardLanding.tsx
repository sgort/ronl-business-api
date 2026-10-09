import { useState } from 'react';

import ChangelogPanel from '../../pages/ChangelogPanel';
import type { BoardEntry } from '../../pages/login-choice/boards.config';
import { useLandingLogin } from '../../pages/login-choice/landing-login';
import {
  SINGLE_BOARD_COPY,
  type SingleBoardCopy,
} from '../../pages/login-choice/single-board.copy';
import type { TenantConfig } from '../../services/tenant';
import './single-board.css';

interface Props {
  tenant: TenantConfig;
  board: BoardEntry;
}

function LockIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function TenantMark({ tenant }: { tenant: TenantConfig }) {
  if (!tenant.logo) {
    // No logo supplied yet: the first word of the name, the rest underneath.
    const [first, ...rest] = tenant.displayName.split(' ');
    const sub = rest.length ? `${rest.join(' ')} · medewerkers` : 'medewerkers';
    return (
      <span className="tword">
        {first}
        <small>{sub}</small>
      </span>
    );
  }

  const square = tenant.logo.shape === 'square';
  return (
    <>
      <img src={tenant.logo.src} alt={tenant.displayName} className={square ? 'sq' : undefined} />
      {square && (
        <span className="tname">
          {tenant.displayName}
          <span>Werkomgeving medewerkers</span>
        </span>
      )}
    </>
  );
}

/** An enlarged Caseworker board in the tenant's colours. Illustrative text only. */
function BoardShot({
  displayName,
  preview,
}: {
  displayName: string;
  preview: SingleBoardCopy['preview'];
}) {
  return (
    <div className="shot" aria-hidden="true">
      <div className="shot-bar">
        <span className="dots">
          <i />
          <i />
          <i />
        </span>
        <span className="sb-t">Caseworker</span>
        <span className="sb-u">{displayName}</span>
      </div>
      <div className="shot-body">
        <div className="shot-nav">
          <span className="grp">Werk</span>
          <span className="on">Taken</span>
          <span>{preview.nav2}</span>
          <span>Archief</span>
          <span className="grp">Ik</span>
          <span>Profiel</span>
        </div>
        <div className="shot-main">
          <div className="sm-head">
            <b>Mijn werkvoorraad</b>
            <span>vandaag</span>
          </div>
          <div className="kpis">
            {preview.kpis.map(([n, label, warn]) => (
              <div key={label} className={warn ? 'kpi warn' : 'kpi'}>
                <div className="n">{n}</div>
                <div className="l">{label}</div>
              </div>
            ))}
          </div>
          <div className="rows">
            {preview.rows.map(([title, code, chip, kind, due]) => (
              <div key={code} className="row">
                <span className="t">
                  {title}
                  <small>{code}</small>
                </span>
                <span className={kind ? `chip ${kind}` : 'chip'}>{chip}</span>
                <span className="due">{due}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The landing page for a tenant with one board: tenant-first branding, one
 * medewerker login straight into that board, and the ronl. mark only in the
 * footer. No Entra login here — that exists only for Flevoland.
 */
export default function SingleBoardLanding({ tenant, board }: Props) {
  const [changelogOpen, setChangelogOpen] = useState(false);
  const { startMedewerkerLogin, startIdpLogin } = useLandingLogin();
  // Province tenants have no single-board copy; municipality is the closest register.
  const copy =
    SINGLE_BOARD_COPY[
      tenant.organisationType === 'province' ? 'municipality' : tenant.organisationType
    ];

  const caseworkerHint = `test-caseworker-${tenant.id}`;
  const loginToBoard = () => startMedewerkerLogin(board.route, caseworkerHint);

  return (
    <div className="lcp-single">
      <header className="topbar">
        <div className="tlogo" style={{ height: tenant.logo?.height ?? 44 }}>
          <TenantMark tenant={tenant} />
        </div>
        <div className="tb-right">
          <button
            type="button"
            className="citizen-link"
            onClick={() => startIdpLogin('digid', `test-citizen-${tenant.id}`)}
          >
            Inwoner? Log in met DigiD
          </button>
          {/* No board target: whoever signs in lands on the dashboard their role grants. */}
          <button
            type="button"
            className="login-link"
            onClick={() => startMedewerkerLogin(undefined, caseworkerHint)}
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
              aria-hidden="true"
            >
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
              <polyline points="10 17 15 12 10 7" />
              <line x1="15" y1="12" x2="3" y2="12" />
            </svg>
            Inloggen
          </button>
        </div>
      </header>

      <main className="wrap">
        <section className="hero">
          <div>
            <p className="eyebrow">Werkomgeving · {tenant.displayName}</p>
            <h1>{copy.title}</h1>
            <p className="lede">{copy.lede}</p>
            <div className="actions">
              <button type="button" className="btn-primary" onClick={loginToBoard}>
                Inloggen als medewerker
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </button>
              <div className="alt">
                <span className="note">
                  <LockIcon />
                  <span>{copy.note}</span>
                </span>
              </div>
            </div>
          </div>
          <BoardShot displayName={tenant.displayName} preview={copy.preview} />
        </section>

        <section className="points">
          {copy.points.map(([title, body], i) => (
            <div key={title} className="pt">
              <span className="k">0{i + 1}</span>
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
          ))}
        </section>

        <footer>
          <span>© {tenant.displayName} · Werkomgeving medewerkers</span>
          <span className="foot-right">
            <button type="button" className="changelog-link" onClick={() => setChangelogOpen(true)}>
              Changelog
            </button>
            <span className="ronl">
              Werkomgeving op{' '}
              <b>
                ronl<i>.</i>
              </b>
            </span>
          </span>
        </footer>
      </main>

      <ChangelogPanel isOpen={changelogOpen} onClose={() => setChangelogOpen(false)} />
    </div>
  );
}
