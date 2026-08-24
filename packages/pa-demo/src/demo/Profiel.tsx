/**
 * Beheer › Profiel — the PA cockpit's own account page.
 *
 * Written fresh rather than vendored: the caseworker original (ProfielSection)
 * fetches HR data through useProfielData(employeeId), a caseworker component
 * that would not become part of the future @ronl/pa-cockpit extraction. plato
 * has no HR backend to call, so block two below is a static stand-in for that
 * fetch rather than a live call.
 *
 * This is the page on the whole site most likely to be mistaken for a real
 * person's record, so it says plainly, near the top, that the data is
 * fictional demonstration data.
 */
import '../vendor/pages/public-affairs-v2/dossierbeheer.css';
import { getUser } from './shims/keycloak';
import { getTenantConfig } from './shims/tenant';

export default function Profiel() {
  const user = getUser();
  const tenant = getTenantConfig();

  return (
    <div>
      <div className="pac-spec-eyebrow">Beheer · Profiel</div>
      <h1 className="pac-beheer-title">Profiel</h1>
      <p className="pac-spec-intro">
        Dit is fictieve demonstratiedata voor plato — geen echt account en geen echte medewerker.
      </p>

      <h2 className="pac-section-title" style={{ marginTop: 20 }}>
        Account
      </h2>
      <table className="pac-spec-table">
        <tbody>
          <tr>
            <td>Naam</td>
            <td>{user.name}</td>
          </tr>
          <tr>
            <td>Gebruikersnaam</td>
            <td>{user.preferred_username}</td>
          </tr>
          <tr>
            <td>Medewerker-ID</td>
            <td>{user.employeeId}</td>
          </tr>
          <tr>
            <td>Gemeente</td>
            <td>{tenant.displayName}</td>
          </tr>
          <tr>
            <td>Beveiligingsniveau</td>
            <td>{user.loa}</td>
          </tr>
          <tr>
            <td>Rollen</td>
            <td>{user.roles.join(', ')}</td>
          </tr>
        </tbody>
      </table>

      <h2 className="pac-section-title" style={{ marginTop: 28 }}>
        HR-gegevens
      </h2>
      <table className="pac-spec-table">
        <tbody>
          <tr>
            <td>Voornaam</td>
            <td>Marieke</td>
          </tr>
          <tr>
            <td>Achternaam</td>
            <td>de Vries</td>
          </tr>
          <tr>
            <td>Afdeling</td>
            <td>Bestuur &amp; Concern</td>
          </tr>
          <tr>
            <td>Functie</td>
            <td>Strategisch adviseur Public Affairs</td>
          </tr>
          <tr>
            <td>Toegangsniveau</td>
            <td>uitgebreid</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
