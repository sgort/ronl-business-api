import { useState } from 'react';
import { businessApi } from '../../services/api';
import type { KeycloakUser } from '@ronl/shared';

interface Props {
  user: KeycloakUser | null;
}

/**
 * Starts "Besluitvorming onder gedelegeerde bevoegdheid": a process a
 * medewerker begins from the dashboard, unlike the citizen-initiated
 * requests (Kapvergunning, Thuisbatterij) that arrive from outside it.
 */
export default function BesluitStartSection({ user }: Props) {
  const [started, setStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user?.roles?.includes('besluit-indiener')) {
    return (
      <div className="max-w-lg">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
          <h2 className="text-lg font-bold text-gray-800 mb-2">Geen toegang</h2>
          <p className="text-gray-400 text-sm">
            Alleen een indiener kan een besluit onder gedelegeerde bevoegdheid voorbereiden.
          </p>
        </div>
      </div>
    );
  }

  if (started) {
    return (
      <div className="max-w-lg">
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <h2 className="text-lg font-bold text-gray-800 mb-2">Besluit in voorbereiding</h2>
          <p className="text-gray-500 text-sm mb-5">
            De eerste taak, <strong>Kies de juiste beslissingssjabloon</strong>, staat in je
            takenlijst.
          </p>
          <button
            onClick={() => setStarted(false)}
            className="text-sm font-medium hover:underline"
            style={{ color: 'var(--color-primary)' }}
          >
            Nog een besluit voorbereiden
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-800 mb-1">
          Besluitvorming onder gedelegeerde bevoegdheid
        </h2>
        <p className="text-sm text-gray-500 mb-6 leading-relaxed">
          Bereid een besluit voor, laat het toetsen door Juridische Zaken en dien het in ter
          ondertekening. Valt het besluit buiten de gedelegeerde bevoegdheid, dan escaleer je naar
          de bevoegde bestuursautoriteit.
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
              const res = await businessApi.process.start('GedelegeerdBesluitProcess', {});
              if (res.success) setStarted(true);
              else setError('Het besluit kon niet worden gestart.');
            } catch {
              setError('Het besluit kon niet worden gestart.');
            }
          }}
          className="px-5 py-2.5 text-sm font-medium text-white rounded-lg transition-opacity hover:opacity-90"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          Besluit voorbereiden
        </button>
      </div>
    </div>
  );
}
