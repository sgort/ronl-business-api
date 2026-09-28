import type { StartFailure } from './ProcessStartFormViewer';

/**
 * The failure notice under a citizen start form (#171).
 *
 * The headline is the same on every tier: it is the right register for an
 * applicant, and raw engine text ("no decision definition deployed with key
 * …") means nothing to one. Below it, outside production, the backend's own
 * cause and the engine it targeted — the whole diagnosis, which used to be
 * thrown away one line before it could be shown. ProcessStartFormViewer logs
 * the same detail to the console on every tier, production included.
 *
 * "Production" is the Vite build mode: build:prod builds with --mode
 * production, build:acc (ACC and its PR previews) with --mode acceptance, and
 * the dev server runs as development. So only the PROD build hides the cause.
 */
export default function StartFailureNotice({ failure }: { failure: StartFailure }) {
  const showCause = import.meta.env.MODE !== 'production' && !!failure.cause;

  return (
    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
      <p>De aanvraag kon niet worden ingediend. Probeer het opnieuw.</p>
      {showCause && (
        <dl className="mt-2 text-xs text-red-800 space-y-1 break-words">
          <div>
            <dt className="inline font-semibold">Oorzaak: </dt>
            <dd className="inline">{failure.cause}</dd>
          </div>
          {failure.instance && (
            <div>
              <dt className="inline font-semibold">Operaton: </dt>
              <dd className="inline">{failure.instance}</dd>
            </div>
          )}
        </dl>
      )}
    </div>
  );
}
