import { useState } from 'react';
import { businessApi } from '../../services/api';
import type { KeycloakUser } from '@ronl/shared';

interface Props {
  user: KeycloakUser | null;
}

export default function HrOnboardingSection({ user }: Props) {
  const [started, setStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isHrMedewerker = user?.roles?.includes('hr-medewerker');

  if (!isHrMedewerker) {
    return (
      <div className="max-w-lg">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
          <p className="text-3xl mb-4 text-gray-300">🔒</p>
          <h2 className="text-lg font-bold text-gray-800 mb-2">Toegang beperkt</h2>
          <p className="text-gray-400 text-sm">
            Alleen HR-medewerkers kunnen onboardingsprocessen starten.
          </p>
        </div>
      </div>
    );
  }

  if (started) {
    return (
      <div className="max-w-lg">
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-3xl mb-4">✅</p>
          <h2 className="text-lg font-bold text-gray-800 mb-2">Onboardingsproces gestart</h2>
          <p className="text-gray-500 text-sm mb-5">
            De taak staat klaar in de wachtrij. Ga naar <strong>Projecten → Taken</strong> om de
            gegevens in te vullen.
          </p>
          <button
            onClick={() => setStarted(false)}
            className="text-sm font-medium hover:underline"
            style={{ color: 'var(--color-primary)' }}
          >
            Nieuw onboardingsproces starten
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-800 mb-1">Medewerker onboarden</h2>
        <p className="text-sm text-gray-500 mb-6 leading-relaxed">
          Start een onboardingsproces voor een nieuwe medewerker. Na het starten verschijnt de taak
          in de wachtrij waar u de medewerkergegevens kunt invullen.
        </p>
        {error && (
          <div className="mb-4 p-3 rounded-lg text-sm bg-red-50 text-red-700 border border-red-200">
            {error}
          </div>
        )}
        <button
          onClick={async () => {
            setError(null);
            try {
              const res = await businessApi.process.start('HrOnboardingProcess', {});
              if (res.success) {
                setStarted(true);
              } else {
                setError('Onboardingsproces kon niet worden gestart.');
              }
            } catch {
              setError('Onboardingsproces kon niet worden gestart.');
            }
          }}
          className="px-5 py-2.5 text-sm font-medium text-white rounded-lg transition-opacity hover:opacity-90"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          Onboardingsproces starten
        </button>
      </div>
    </div>
  );
}
