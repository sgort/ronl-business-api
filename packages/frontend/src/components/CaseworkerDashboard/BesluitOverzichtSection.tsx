import { useCallback, useEffect, useState } from 'react';
import { businessApi, type BesluitListItem } from '../../services/api';
import type { KeycloakUser } from '@ronl/shared';
import { formatDate } from '../../utils/formatDate';
import { BESLUIT_ROLES } from '../../pages/caseworker-v2/modes.config';

const euro = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' });

interface Props {
  user: KeycloakUser | null;
  /** Running besluiten, or completed ones. */
  state: 'lopend' | 'afgerond';
}

/**
 * The running or completed "Besluitvorming onder gedelegeerde bevoegdheid"
 * besluiten of the tenant. A running one shows its current step, a completed
 * one its outcome; opening one shows the details it was decided on. Every
 * besluit role may see it, as every capacity role may see that archive.
 */
export default function BesluitOverzichtSection({ user, state }: Props) {
  const [records, setRecords] = useState<BesluitListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const isAuthorised = user?.roles?.some((r) => BESLUIT_ROLES.includes(r)) ?? false;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res =
        state === 'lopend'
          ? await businessApi.besluitvorming.active()
          : await businessApi.besluitvorming.completed();
      if (res.success && res.data) setRecords(res.data);
      else setError('De besluiten konden niet worden geladen.');
    } catch {
      setError('De besluiten konden niet worden geladen.');
    } finally {
      setLoading(false);
    }
  }, [state]);

  useEffect(() => {
    if (isAuthorised) load();
  }, [isAuthorised, load]);

  if (!isAuthorised) {
    return (
      <div className="max-w-lg">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
          <h2 className="text-lg font-bold text-gray-800 mb-2">Geen toegang</h2>
          <p className="text-gray-400 text-sm">
            Alleen deelnemers aan de besluitvorming kunnen de besluiten inzien.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-2xl space-y-3">
        {[1, 2, 3].map((n) => (
          <div key={n} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-1/2 mb-2" />
            <div className="h-3 bg-gray-100 rounded w-1/3" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl bg-red-50 border border-red-200 rounded-xl p-5 text-red-700 text-sm">
        {error}
        <button onClick={load} className="ml-3 underline">
          Opnieuw proberen
        </button>
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="max-w-2xl bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">
        {state === 'lopend' ? 'Geen lopende besluiten.' : 'Geen afgeronde besluiten.'}
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-3">
      {records.map((record) => {
        const isOpen = selectedId === record.id;
        const badge = state === 'lopend' ? record.huidigeStap : record.uitkomst;
        const badgeTone =
          state === 'lopend'
            ? 'bg-blue-50 text-blue-700 border-blue-200'
            : record.uitkomst === 'geëscaleerd — afgewezen'
              ? 'bg-red-50 text-red-700 border-red-200'
              : record.uitkomst
                ? 'bg-green-50 text-green-700 border-green-200'
                : 'bg-gray-50 text-gray-500 border-gray-200';
        const meta = [
          record.businessKey,
          record.besluitType,
          record.financieleGevolgen !== null ? euro.format(record.financieleGevolgen) : null,
        ].filter(Boolean);
        const details: [string, string | null][] = [
          ['Kenmerk', record.kenmerk],
          ['Zaaknummer', record.zaaknummer],
          ['Voorgesteld besluit', record.voorgesteldBesluit],
          ['Motivering', record.motivering],
          ['Reden escalatie', record.escalatieReden],
        ];
        const shown = details.filter(([, value]) => value);
        return (
          <div
            key={record.id}
            className="bg-white rounded-xl border border-gray-200 overflow-hidden"
          >
            <button
              onClick={() => setSelectedId(isOpen ? null : record.id)}
              aria-expanded={isOpen}
              className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left hover:bg-gray-50 transition-colors"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-800">
                  {record.onderwerp ?? 'Besluit'}
                </p>
                {meta.length > 0 && (
                  <p className="text-xs text-gray-500 mt-0.5">{meta.join(' · ')}</p>
                )}
                <p className="text-xs text-gray-400 mt-0.5">
                  {state === 'lopend'
                    ? `Gestart ${formatDate(record.startTime)}`
                    : `Afgerond ${formatDate(record.endTime ?? '')}`}
                </p>
              </div>
              {badge && (
                <span
                  className={`shrink-0 px-2 py-0.5 text-xs font-medium rounded border ${badgeTone}`}
                >
                  {badge}
                </span>
              )}
            </button>
            {isOpen && (
              <div className="border-t border-gray-100 px-5 py-4">
                {shown.length === 0 ? (
                  <p className="text-sm text-gray-400">Nog geen gegevens vastgelegd.</p>
                ) : (
                  <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
                    {shown.map(([label, value]) => (
                      <div key={label} className="contents">
                        <dt className="text-gray-500">{label}</dt>
                        <dd className="text-gray-800 whitespace-pre-line">{value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
