import { useEffect, useState } from 'react';
import { businessApi } from '../../services/api';
import ProcessStartFormViewer, { type StartFailure } from '../ProcessStartFormViewer';
import StartFailureNotice from '../StartFailureNotice';

interface StartableProcess {
  key: string;
  name: string;
  hasStartForm: boolean;
}

/**
 * "Proces starten": every process the signed-in caseworker may start, by the
 * candidate starter groups its model declares. No process key is known here;
 * the backend decides what is listed.
 *
 * A process without a start form starts at once, like HR onboarding: the first
 * task then appears under Taken. One with a start form shows it first, and the
 * form's submit starts the process.
 */
export default function ProcesStartenSection() {
  const [processes, setProcesses] = useState<StartableProcess[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [chosen, setChosen] = useState<StartableProcess | null>(null);
  const [starting, setStarting] = useState<string | null>(null);
  const [started, setStarted] = useState<{ name: string; dossier: string } | null>(null);
  const [failure, setFailure] = useState<StartFailure | null>(null);

  useEffect(() => {
    let cancelled = false;
    businessApi.process
      .startable()
      .then((res) => {
        if (!cancelled) setProcesses(res.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const startDirectly = async (p: StartableProcess) => {
    setStarting(p.key);
    try {
      const res = await businessApi.process.start(p.key, {});
      if (res.success) {
        const data = res.data as { businessKey?: string; processInstanceId?: string } | undefined;
        setStarted({ name: p.name, dossier: data?.businessKey ?? data?.processInstanceId ?? '—' });
      } else {
        setFailure({
          cause: res.error?.details ?? res.error?.message,
          instance: res.error?.instance,
        });
      }
    } catch (err: unknown) {
      setFailure({ cause: err instanceof Error ? err.message : undefined });
    } finally {
      setStarting(null);
    }
  };

  if (loadFailed) {
    return (
      <p className="text-sm text-red-600">
        De processen die u kunt starten konden niet worden geladen.
      </p>
    );
  }
  if (processes === null) {
    return <p className="text-sm text-gray-500">Processen laden…</p>;
  }

  if (chosen) {
    return (
      <div className="max-w-3xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-800">{chosen.name}</h2>
          <button
            type="button"
            className="text-sm text-gray-500 hover:underline"
            onClick={() => {
              setChosen(null);
              setFailure(null);
            }}
          >
            Terug naar de lijst
          </button>
        </div>
        {failure && <StartFailureNotice failure={failure} />}
        <ProcessStartFormViewer
          processKey={chosen.key}
          onStarted={(dossier) => {
            // The viewer keeps the latest callback in a ref, so an inline one is fine.
            setStarted({ name: chosen.name, dossier });
            setChosen(null);
            setFailure(null);
          }}
          onError={setFailure}
        />
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-4">
      <h2 className="text-lg font-bold text-gray-800">Proces starten</h2>
      {started && (
        <div
          role="status"
          className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800"
        >
          <strong>{started.name}</strong> is gestart als dossier <strong>{started.dossier}</strong>.
          De eerste taak staat onder Taken.
        </div>
      )}
      {failure && <StartFailureNotice failure={failure} />}
      {processes.length === 0 ? (
        <p className="text-sm text-gray-500">Er zijn geen processen die u kunt starten.</p>
      ) : (
        <ul className="divide-y divide-gray-200 rounded-xl border border-gray-200 bg-white">
          {processes.map((p) => {
            const label = starting === p.key ? 'Bezig…' : 'Start proces';
            return (
              <li key={p.key} className="flex items-center justify-between gap-4 px-5 py-4">
                <span className="text-sm font-medium text-gray-800">{p.name}</span>
                {/* Every row reads the same; the accessible name adds which process.
                  It starts with the visible text, "Bezig…" included (WCAG 2.5.3). */}
                <button
                  type="button"
                  aria-label={`${label}: ${p.name}`}
                  disabled={starting !== null}
                  className="shrink-0 px-4 py-2 text-sm font-medium text-white rounded-lg transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{ backgroundColor: 'var(--color-primary)' }}
                  onClick={() => {
                    setStarted(null);
                    setFailure(null);
                    if (p.hasStartForm) setChosen(p);
                    else void startDirectly(p);
                  }}
                >
                  {label}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
