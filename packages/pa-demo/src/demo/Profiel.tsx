/**
 * Beheer › Profiel — the PA cockpit's own account page.
 *
 * Written fresh rather than reused: the caseworker original (ProfielSection)
 * fetches HR data through useProfielData(employeeId), a caseworker component
 * that stayed in packages/frontend rather than moving into @ronl/pa-cockpit.
 * plato has no HR backend to call, so block two below is a static stand-in for
 * that fetch rather than a live call.
 *
 * This is the page on the whole site most likely to be mistaken for a real
 * person's record, so it says plainly, near the top, that the data is
 * fictional demonstration data.
 */
// No stylesheet import here: the .pac-* classes below come from the cockpit's
// dossierbeheer.css, which '@ronl/pa-cockpit/styles.css' aggregates and
// App.tsx imports once for the whole app.
import { getUser } from './shims/keycloak';
import { getTenantConfig } from './shims/tenant';

/**
 * The tenant row's label follows organisationType rather than being
 * hardcoded "Gemeente": the shim's tenant is a province
 * (organisationType: 'province', displayName: 'Provincie Flevoland'), and a
 * "Gemeente" (municipality) label next to a provincial name is exactly the
 * kind of mismatch a Dutch government audience notices immediately. This
 * also means the label stays correct if the shim's tenant ever changes.
 */
function tenantLabel(organisationType: string): string {
  switch (organisationType) {
    case 'province':
      return 'Provincie';
    case 'municipality':
      return 'Gemeente';
    default:
      return 'Organisatie';
  }
}

export default function Profiel() {
  const user = getUser();
  const tenant = getTenantConfig();

  return (
    <div>
      <div className="pac-spec-eyebrow">Beheer · Profiel</div>
      <h1 className="pac-beheer-title">Profiel</h1>
      <div className="pac-db-flag mock" style={{ marginBottom: 18 }}>
        <span className="pac-db-flag-icon">⚑</span>
        <span>
          <strong>Fictieve data</strong> — dit is demonstratiedata voor plato: geen echt account en
          geen echte medewerker.
        </span>
      </div>

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
            <td>{tenantLabel(tenant.organisationType)}</td>
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
