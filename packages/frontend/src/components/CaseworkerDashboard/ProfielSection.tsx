import { useEffect, useState } from 'react';
import type { KeycloakUser } from '@ronl/shared';
import type { PaTenantConfig } from '@ronl/pa-cockpit';
import { useProfielData } from '../../hooks/useProfielData';

const LOA_LABELS: Record<string, string> = {
  basis: 'Basis',
  midden: 'Midden',
  substantieel: 'Substantieel',
  hoog: 'Hoog',
};

interface Props {
  user: KeycloakUser | null;
  tenantConfig: PaTenantConfig | null;
  showManualFetch?: boolean;
}

export default function ProfielSection({ user, tenantConfig, showManualFetch = true }: Props) {
  const { data: profielData, loading, error, load } = useProfielData(user?.employeeId);
  const [employeeIdInput, setEmployeeIdInput] = useState('');

  useEffect(() => {
    if (user?.employeeId) load(user.employeeId);
  }, [user?.employeeId, load]);

  const handleFetchOnboarding = async () => {
    if (!employeeIdInput.trim()) return;
    await load(employeeIdInput.trim());
  };

  return (
    <div className="max-w-2xl space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
          Persoonlijke gegevens
        </h2>
        <dl className="space-y-3">
          {(
            [
              { label: 'Naam', value: user?.name },
              { label: 'Gebruikersnaam', value: user?.preferred_username },
              { label: 'Medewerker-ID', value: user?.employeeId },
              { label: 'Gemeente', value: tenantConfig?.displayName ?? user?.municipality },
              {
                label: 'Beveiligingsniveau',
                value: user?.loa ? (LOA_LABELS[user.loa] ?? user.loa) : undefined,
              },
              {
                label: 'Rollen',
                value: user?.roles?.length ? user.roles.join(', ') : undefined,
              },
            ] as { label: string; value: string | undefined }[]
          )
            .filter((f) => Boolean(f.value))
            .map(({ label, value }) => (
              <div key={label} className="flex gap-4">
                <dt className="w-44 text-sm text-gray-400 flex-shrink-0">{label}</dt>
                <dd className="text-sm text-gray-900 font-medium">{value}</dd>
              </div>
            ))}
        </dl>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Onboardinggegevens
        </h2>

        {loading && (
          <div className="animate-pulse space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex gap-4">
                <div className="h-3 bg-gray-200 rounded w-1/4" />
                <div className="h-3 bg-gray-200 rounded w-1/3" />
              </div>
            ))}
          </div>
        )}

        {!loading && error && <p className="text-sm text-red-500">{error}</p>}

        {!loading &&
          !user?.employeeId &&
          profielData === undefined &&
          (showManualFetch ? (
            <>
              <p className="text-sm text-gray-400 mb-4">
                Voer uw medewerker-ID in om uw onboardingprofiel op te halen.
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={employeeIdInput}
                  onChange={(e) => setEmployeeIdInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleFetchOnboarding()}
                  placeholder="bijv. emp-001"
                  className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
                <button
                  onClick={handleFetchOnboarding}
                  disabled={!employeeIdInput.trim()}
                  className="px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-40"
                  style={{ backgroundColor: 'var(--color-primary)' }}
                >
                  Ophalen
                </button>
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-400">Geen onboardingprofiel gevonden.</p>
          ))}

        {!loading && profielData === null && !error && (
          <p className="text-sm text-gray-400">
            Geen onboardingprofiel gevonden.{' '}
            {user?.roles?.includes('hr-medewerker') && (
              <span>
                Gebruik <strong>Medewerker onboarden</strong> om een profiel aan te maken.
              </span>
            )}
          </p>
        )}

        {!loading && profielData && (
          <dl className="space-y-3">
            <div className="flex justify-end mb-1">
              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                Onboarding voltooid
              </span>
            </div>
            {(
              [
                { label: 'Voornaam', value: profielData.firstName as string | undefined },
                { label: 'Achternaam', value: profielData.lastName as string | undefined },
                { label: 'Afdeling', value: profielData.department as string | undefined },
                { label: 'Functie', value: profielData.jobFunction as string | undefined },
                { label: 'Toegangsniveau', value: profielData.accessLevel as string | undefined },
                {
                  label: 'Toegewezen rollen',
                  value: profielData.assignedRoles as string | undefined,
                },
              ] as { label: string; value: string | undefined }[]
            )
              .filter((f) => Boolean(f.value))
              .map(({ label, value }) => (
                <div key={label} className="flex gap-4">
                  <dt className="w-44 text-sm text-gray-400 flex-shrink-0">{label}</dt>
                  <dd className="text-sm text-gray-900 font-medium capitalize">{value}</dd>
                </div>
              ))}
          </dl>
        )}
      </div>
    </div>
  );
}
