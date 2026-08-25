/**
 * Beheer › Rollen & rechten — the PA cockpit's own permission model.
 *
 * Written fresh rather than vendored: the caseworker original
 * (RollenSection) describes caseworker / hr-medewerker / seven rip-* roles
 * and names no pa-* role at all, so it documents a different product. This
 * page is built on the same DB_ROLES / DB_CAPS the vendored Dossierbeheer
 * role bar reads (dossierbeheer.data.ts) — never a hand-written table — so
 * it cannot drift from the real permission model.
 *
 * Unlike Dossierbeheer's role bar (rendered `disabled`, because a real user
 * cannot grant themselves rights), the buttons here are this demo's actual
 * role switcher: clicking one drives useDemoRole().setRoleId, which rewrites
 * the synthetic Keycloak token every other section reads — including
 * Dossierbeheer's own capability chips.
 */
import '../vendor/pages/public-affairs-v2/dossierbeheer.css';
import { DB_ROLES, DB_CAPS } from '../vendor/pages/public-affairs-v2/dossierbeheer.data';
import { DEMO_ROLE_OPTIONS, useDemoRole } from './DemoRoleContext';

export default function RollenRechten() {
  const { roleId, setRoleId, role } = useDemoRole();

  return (
    <div>
      <div className="pac-spec-eyebrow">Beheer · Rollen &amp; rechten</div>
      <h1 className="pac-beheer-title">Rollen &amp; rechten</h1>
      <p className="pac-spec-intro">
        plato laat je elke rol van de PA-cockpit zelf uitproberen. Kies hieronder een rol om te zien
        welke rechten die geeft in Dossierbeheer — de knoppen daar volgen automatisch mee.
      </p>

      {/* data-testid, not just the shared .pac-db-roleseg class: Dossierbeheer's
          own (disabled, reflective) role bar renders the identical
          .pac-db-roleseg > .pac-db-roleseg-btn structure, and plain-class
          selectors can't tell the two apart. This is the E2E hook that lets
          the demo's actual switcher be targeted unambiguously — see
          plato-demo.spec.ts's rollenRechtenRole(). */}
      <span className="pac-db-roleseg" data-testid="rollen-roleseg">
        {DEMO_ROLE_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            className={`pac-db-roleseg-btn ${roleId === opt.id ? 'active' : ''}`}
            onClick={() => setRoleId(opt.id)}
            // dossierbeheer.css sets cursor: default on this class for the
            // vendored (deliberately disabled) role bar. Here the buttons
            // are the demo's actual clickable switcher, so this overrides
            // it locally rather than editing the vendored stylesheet.
            style={{ cursor: 'pointer' }}
          >
            {opt.label}
          </button>
        ))}
      </span>

      <p className="pac-spec-intro" style={{ marginTop: 12 }}>
        Actieve rol: <b>{role.label}</b> · Keycloak: {role.keycloak}
      </p>
      <p className="pac-spec-intro">{role.note}</p>

      <span className="pac-db-caps">
        {DB_CAPS.map((c) => (
          <span
            key={c.key}
            className={`pac-db-cap ${role.can[c.key] ? 'on' : 'off'}`}
            data-testid={'cap-' + c.key}
            data-on={String(role.can[c.key])}
          >
            {c.label}
          </span>
        ))}
      </span>

      <h2 className="pac-section-title" style={{ marginTop: 28 }}>
        De drie dossierrollen
      </h2>
      <table className="pac-spec-table">
        <thead>
          <tr>
            <th>Rol</th>
            <th>Keycloak</th>
            <th>Toelichting</th>
          </tr>
        </thead>
        <tbody>
          {DB_ROLES.map((r) => (
            <tr key={r.id}>
              <td>{r.label}</td>
              <td>{r.keycloak}</td>
              <td>{r.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
