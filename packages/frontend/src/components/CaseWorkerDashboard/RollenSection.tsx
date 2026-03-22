import { useEffect } from 'react';
import type { KeycloakUser } from '@ronl/shared';
import { useProfielData } from '../../hooks/useProfielData';

const ROLE_DESCRIPTIONS: Record<string, string> = {
  caseworker: 'Behandelen van aanvragen en zaken',
  'hr-medewerker': 'Beheren van medewerker onboarding',
  'rip-verkenner': 'Verkenningsfase van RIP-projecten',
  'rip-planner': 'Planvoorbereiding en contractvorming',
  'rip-inkoop': 'Aanbestedingen en inkoop',
  'rip-contractbeheer': 'Contractbeheersing',
  'rip-projectleider': 'Projectleiding en decharge',
  'rip-toetser': 'Toetsproces',
  'rip-kwaliteit': 'Kwaliteitstoetsing',
  admin: 'Beheerder',
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
