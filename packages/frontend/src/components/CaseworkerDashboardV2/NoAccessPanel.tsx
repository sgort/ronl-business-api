/**
 * NoAccessPanel — defence-in-depth fallback when the user reaches a gated
 * section by URL paste or a stale link, despite the rail/palette filters.
 *
 * In V2's design, this should be unreachable through normal navigation —
 * if it appears, it means a gated section was reached out-of-band.
 */

interface Props {
  requiredRoles?: string[];
  requiredOrgTypes?: string[];
}

export default function NoAccessPanel({ requiredRoles, requiredOrgTypes }: Props) {
  return (
    <div className="v2-no-access" role="alert">
      <h2 className="v2-no-access-title">Geen toegang</h2>
      <p className="v2-no-access-body">
        Deze sectie is niet beschikbaar met je huidige rollen of organisatie.
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
