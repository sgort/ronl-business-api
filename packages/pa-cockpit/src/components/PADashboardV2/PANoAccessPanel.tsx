/**
 * PANoAccessPanel — defence-in-depth fallback for users who reach the PA
 * cockpit without the `public-affairs` role / `province` org-type. Mirrors
 * the caseworker NoAccessPanel, but not its styles: packages/frontend's
 * `.v2-no-access` rules are scoped to `.cwd-v2` (dashboard-v2.css:457,464,
 * 472,478), so this package ships its own `.pac`-scoped copy instead, in
 * dashboard-pa.css's "No-access panel (defence-in-depth)" block, already
 * diverged from the caseworker rules.
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
