import { useState } from 'react';
import type { KeycloakUser } from '@ronl/shared';
import ProcessStartFormViewer from '../ProcessStartFormViewer';

const PROCESS_KEY = 'DvtpToestemmingGevenProcess';

interface Props {
  user: KeycloakUser | null;
  onNavigateToTasks: () => void;
}

export default function DvtpStartSection({ onNavigateToTasks }: Props) {
  const [started, setStarted] = useState(false);
  const [error, setError] = useState(false);

  if (started) {
    return (
      <div className="max-w-lg">
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-3xl mb-4">✅</p>
          <h2 className="text-lg font-bold text-gray-800 mb-2">Procedure gestart</h2>
          <p className="text-gray-500 text-sm mb-5">
            De toestemmingsprocedure is gestart. Ga naar <strong>Mijn taken</strong> om verder te
            gaan.
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={onNavigateToTasks}
              className="px-5 py-2 text-white rounded-lg text-sm font-medium"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              Ga naar Mijn taken →
            </button>
            <button
              onClick={() => {
                setStarted(false);
                setError(false);
              }}
              className="px-5 py-2 text-gray-600 rounded-lg text-sm font-medium border border-gray-300 hover:bg-gray-50"
            >
              Nieuwe procedure starten
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-800 mb-1">Toestemming geven — DvTP</h2>
        <p className="text-sm text-gray-500 mb-6 leading-relaxed">
          Doorloop de toestemmingsprocedure voor een private dienstverlener. Vul onderstaande
          gegevens in om de procedure te starten.
        </p>
        {error && (
          <div className="mb-4 p-3 rounded-lg text-sm bg-red-50 text-red-700 border border-red-200">
            De procedure kon niet worden gestart. Probeer het opnieuw.
          </div>
        )}
        <ProcessStartFormViewer
          processKey={PROCESS_KEY}
          onStarted={() => {
            setStarted(true);
            setError(false);
          }}
          onError={() => setError(true)}
        />
      </div>
    </div>
  );
}
