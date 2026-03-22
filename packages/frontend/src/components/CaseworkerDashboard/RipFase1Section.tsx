import { useState } from 'react';
import { businessApi } from '../../services/api';
import type { KeycloakUser } from '@ronl/shared';

interface Props {
  user: KeycloakUser | null;
}

export default function RipFase1Section({ user }: Props) {
  const [started, setStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isInfraTeam = user?.roles?.includes('infra-projectteam');

  if (!isInfraTeam) {
    return (
      <div className="max-w-lg">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
          <p className="text-3xl mb-4 text-gray-300">🔒</p>
          <h2 className="text-lg font-bold text-gray-800 mb-2">Toegang beperkt</h2>
          <p className="text-gray-400 text-sm">
            Alleen leden van het infra-projectteam kunnen een RIP Fase 1 starten.
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
          <h2 className="text-lg font-bold text-gray-800 mb-2">RIP Fase 1 gestart</h2>
          <p className="text-gray-500 text-sm mb-5">
            De intake taak staat klaar in de wachtrij. Ga naar <strong>Projecten → Taken</strong> om
            het intakeformulier in te vullen.
          </p>
          <button
            onClick={() => setStarted(false)}
            className="text-sm font-medium hover:underline"
            style={{ color: 'var(--color-primary)' }}
          >
            Nieuw RIP Fase 1 proces starten
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-800 mb-1">
          RIP Fase 1 — Projectdefinitie
        </h2>
        <p className="text-sm text-gray-500 mb-6 leading-relaxed">
          Start het RIP Fase 1 proces voor een nieuw infrastructuurproject. Na het starten
          verschijnt het intakeformulier in de wachtrij.
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
              const res = await businessApi.process.start('RipPhase1Process', {});
              if (res.success) {
                setStarted(true);
              } else {
                setError('RIP Fase 1 proces kon niet worden gestart.');
              }
            } catch {
              setError('RIP Fase 1 proces kon niet worden gestart.');
            }
          }}
          className="px-5 py-2.5 text-sm font-medium text-white rounded-lg transition-opacity hover:opacity-90"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          RIP Fase 1 starten
        </button>
      </div>
    </div>
  );
}
