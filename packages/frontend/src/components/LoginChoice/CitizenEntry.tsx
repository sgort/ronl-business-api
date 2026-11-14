import { Fragment, useId, type ReactNode } from 'react';
import { useLandingLogin } from '../../pages/login-choice/landing-login';
import type { TenantCitizenEntry } from '../../services/tenant';

// The service icons from the landing mock, as inline SVG paths.
const ICONS: Record<TenantCitizenEntry['services'][number]['icon'], ReactNode> = {
  doc: (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="9" y1="13" x2="15" y2="13" />
      <line x1="9" y1="17" x2="13" y2="17" />
    </>
  ),
  pin: (
    <>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" />
      <circle cx="12" cy="10" r="3" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15.5 14" />
    </>
  ),
};

interface Props {
  tenantId: string;
  citizen: TenantCitizenEntry;
}

/**
 * The resident section of a single-board landing page: its own DigiD login,
 * under the hero. Every value comes from tenants.json and is rendered as text.
 */
export default function CitizenEntry({ tenantId, citizen }: Props) {
  const { startIdpLogin } = useLandingLogin();
  const titleId = useId();

  return (
    <section className="citizen" aria-labelledby={titleId}>
      <div>
        <p className="eyebrow">
          {citizen.eyebrow}
          {citizen.greetings?.map((g) => (
            <Fragment key={g.lang + g.text}>
              {' · '}
              <span lang={g.lang}>{g.text}</span>
            </Fragment>
          ))}
        </p>
        <h2 id={titleId}>{citizen.title}</h2>
        <p className="lede">{citizen.lede}</p>
        {citizen.islands && citizen.islands.length > 0 && (
          <ul className="isle-list" aria-label="Eilanden">
            {citizen.islands.map((island) => (
              <li key={island.name}>
                <img src={island.flag} alt="" />
                {island.name}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <ul className="svc">
          {citizen.services.map((service) => (
            <li key={service.title}>
              <span className="ic">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  {ICONS[service.icon]}
                </svg>
              </span>
              <span>
                <b>{service.title}</b>
                <span>{service.body}</span>
              </span>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="btn-citizen"
          onClick={() => startIdpLogin('digid', `test-citizen-${tenantId}`)}
        >
          {citizen.cta}
        </button>
        <p className="c-note">
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
          <span>{citizen.note}</span>
        </p>
      </div>
    </section>
  );
}
