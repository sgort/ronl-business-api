import { useEffect } from 'react';
import type { KeycloakUser } from '@ronl/shared';
import { useProfielData } from '../../hooks/useProfielData';

/**
 * Describes the roles a signed-in user can hold, keyed by Keycloak role name.
 * Purely a lookup: an unmatched role renders without a description, and an
 * unused entry costs nothing.
 *
 * That asymmetry decides how this map is maintained: entries are ADDED and not
 * removed for being absent from any one list, because this component renders
 * TWO different lists.
 *
 * `(onboardingRoles ?? jwtRoles)` below prefers the HR onboarding record over
 * the token, falling back to the token only when the user has no profile. So
 * the keys arriving here come from either:
 *
 *   - `assignedRoles` on the onboarding profile, produced by the
 *     EmployeeRoleAssignment DMN. On ACC that is
 *     "caseworker,rip-verkenner,rip-planner,rip-contractbeheer" -- none of
 *     which is a Keycloak role anywhere. They are DMN output strings.
 *   - the caller's Keycloak realm roles, when there is no profile.
 *
 * A first pass at this map removed rip-verkenner, rip-planner, rip-inkoop,
 * rip-contractbeheer and rip-toetser for being absent from
 * config/keycloak/ronl-realm.json. They are absent from every realm -- and
 * still rendered on ACC every day, from the onboarding record.
 *
 * A candidate group in the RIP models is a third thing again: who a task is
 * addressed to. It happens to coincide with the realm roles now that both
 * carry the same 34, but the two are maintained separately. See
 * docs/RIP-ROLE-VOCABULARIES.md.
 */
const ROLE_DESCRIPTIONS: Record<string, string> = {
  caseworker: 'Behandelen van aanvragen en zaken',
  'hr-medewerker': 'Beheren van medewerker onboarding',
  admin: 'Beheerder',

  // Granted on ACC but absent from the local seed realm. Kept deliberately.
  'rip-verkenner': 'Verkenningsfase van RIP-projecten',
  'rip-planner': 'Planvoorbereiding en contractvorming',
  'rip-inkoop': 'Aanbestedingen en inkoop',
  'rip-contractbeheer': 'Contractbeheersing',
  'rip-toetser': 'Toetsproces',

  // The RIP ladder's roles, R2.1 through R6.1.
  'rip-aandrager': 'Aandrager: levert projectplan en intakeformulier aan',
  'rip-adviseur': 'Adviseur',
  'rip-adviseur-veiligheid-gezondheid': 'Adviseur veiligheid & gezondheid',
  'rip-ao': 'Ambtelijk opdrachtgever',
  'rip-beheerder': 'Beheerder',
  'rip-beheerder-assetmanagement': 'Beheerder assetmanagement',
  'rip-communicatieadviseur': 'Communicatieadviseur',
  'rip-concerndirecteur': 'Concerndirecteur',
  'rip-databeheerder': 'Databeheerder',
  'rip-deelnemers-evaluatie': 'Deelnemer evaluatie',
  'rip-deelnemers-psu': 'Deelnemer project start-up (PSU)',
  'rip-directievoerder': 'Directievoerder',
  'rip-financien': 'Financiën',
  'rip-infra-overleg': 'Infra-overleg',
  'rip-inkoopadviseur': 'Inkoopadviseur',
  'rip-inkoopadviseur-werken': 'Inkoopadviseur werken',
  'rip-kosten-contractdeskundige': 'Kosten- en contractdeskundige',
  'rip-kostenadviseur': 'Kostenadviseur',
  'rip-kwaliteit': 'Kwaliteitstoetsing',
  'rip-manager-financien': 'Manager financiën',
  'rip-manager-pb': 'Manager planvoorbereiding',
  'rip-omgevingsmanager': 'Omgevingsmanager',
  'rip-ondersteuner': 'Ondersteuner',
  'rip-ontwerper': 'Ontwerper',
  'rip-opdrachtnemer': 'Opdrachtnemer (externe partij)',
  'rip-pkt': 'Projectkwaliteitsteam (PKT)',
  'rip-projectbeheersing': 'Projectbeheersing',
  'rip-projectleider': 'Projectleiding en decharge',
  'rip-projectondersteuner': 'Projectondersteuner',
  'rip-team': 'RIP-team',
  'rip-technisch-administratief-medewerker': 'Technisch-administratief medewerker',
  'rip-technisch-adviseur': 'Technisch adviseur',
  'rip-toezichthouder': 'Toezichthouder',
  'rip-vestigingsmanager': 'Vestigingsmanager',
};

const ACCESS_LEVEL_DESCRIPTIONS: Record<string, string> = {
  basis: 'Standaard toegang tot eigen taken en zaken',
  uitgebreid: 'Uitgebreide toegang inclusief rapportages',
  admin: 'Volledige toegang tot alle functionaliteiten',
};

interface Props {
  user: KeycloakUser | null;
}

export default function RollenSection({ user }: Props) {
  const { data: profielData, loading, load } = useProfielData(user?.employeeId);

  useEffect(() => {
    if (user?.employeeId) load(user.employeeId);
  }, [user?.employeeId, load]);

  const jwtRoles = user?.roles ?? [];
  const onboardingRoles = profielData?.assignedRoles
    ? (profielData.assignedRoles as string).split(',').map((r) => r.trim())
    : null;
  const accessLevel = profielData?.accessLevel as string | undefined;

  return (
    <div className="max-w-2xl space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
          Toegewezen rollen
        </h2>

        {loading && (
          <div className="animate-pulse space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-10 bg-gray-100 rounded-lg" />
            ))}
          </div>
        )}

        {!loading && (
          <ul className="space-y-2">
            {(onboardingRoles ?? jwtRoles).map((role) => (
              <li
                key={role}
                className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 border border-gray-100"
              >
                <span
                  className="mt-0.5 w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: 'var(--color-primary)' }}
                />
                <div>
                  <p className="text-sm font-medium text-gray-900">{role}</p>
                  {ROLE_DESCRIPTIONS[role] && (
                    <p className="text-xs text-gray-400 mt-0.5">{ROLE_DESCRIPTIONS[role]}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!loading && accessLevel && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Toegangsniveau
          </h2>
          <div className="flex items-center gap-3">
            <span
              className="text-sm font-semibold capitalize px-3 py-1 rounded-full text-white"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              {accessLevel}
            </span>
            {ACCESS_LEVEL_DESCRIPTIONS[accessLevel] && (
              <p className="text-sm text-gray-500">{ACCESS_LEVEL_DESCRIPTIONS[accessLevel]}</p>
            )}
          </div>
        </div>
      )}

      {!loading && !profielData && !user?.employeeId && (
        <p className="text-sm text-gray-400 px-1">
          Koppel uw medewerker-ID via <strong>Profiel</strong> om gedetailleerde rolinformatie te
          zien.
        </p>
      )}
    </div>
  );
}
