/**
 * PANoAccessPanel — defence-in-depth fallback for users who reach the PA
 * cockpit without the `public-affairs` role / `province` org-type. Mirrors
 * the caseworker NoAccessPanel and shares part of its styles: what both
 * panels have in common is in packages/shared/styles/v2-chrome.css (#374
 * item 4), and PA's own, diverged declarations are in dashboard-pa.css's
 * "No-access panel (defence-in-depth)" block.
 */

interface Props {
  requiredRoles?: string[];
  requiredOrgTypes?: string[];
}

export default function PANoAccessPanel({ requiredRoles, requiredOrgTypes }: Props) {
  return (
    <div className="v2-no-access" role="alert">
      <h2 className="v2-no-access-title">Geen toegang</h2>
      <p className="v2-no-access-body">
        De PA-Cockpit is beschikbaar voor Public Affairs-medewerkers van de provincie. Je huidige
        rollen of organisatie geven geen toegang.
      </p>
      {requiredRoles && requiredRoles.length > 0 && (
        <p className="v2-no-access-meta">
          Vereiste rol{requiredRoles.length === 1 ? '' : 'len'}:{' '}
          <code>{requiredRoles.join(', ')}</code>
        </p>
      )}
      {requiredOrgTypes && requiredOrgTypes.length > 0 && (
        <p className="v2-no-access-meta">
          Vereiste organisatietype{requiredOrgTypes.length === 1 ? '' : 'n'}:{' '}
          <code>{requiredOrgTypes.join(', ')}</code>
        </p>
      )}
    </div>
  );
}
