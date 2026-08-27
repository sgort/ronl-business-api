import { useEffect, useRef, useState } from 'react';
import { businessApi } from '../../services/api';
import type { SignatureSpec } from '../../services/api';
import { resolveSigningUrl } from './resolveSigningUrl';

type PanelState = 'idle' | 'preparing' | 'ceremony' | 'sent' | 'declined' | 'error';

interface Props {
  taskId: string;
  spec: SignatureSpec;
  onCompleted: () => void;
}

/** A distinct errorCode (see the error-state render below) for a poll that
 *  kept failing rather than a create-package failure -- so the retry button
 *  is suppressed the same way it is for MISSING_SIGNER_EMAIL: retrying
 *  cannot fix "the status endpoint is unreachable" either, only a fresh page
 *  load (which re-fetches spec and resumes polling) can. */
const POLL_FAILED_ERROR_CODE = 'STATUS_POLL_FAILED';

/** How many consecutive failed status polls (network error, or a
 *  success:false response) the panel tolerates before surfacing an error
 *  instead of continuing to poll silently. A single blip must not flip the
 *  panel to an error state, but a persistent failure must not spin forever
 *  in silence either -- that silence is exactly what let the runtime/history
 *  bug this fixes go unnoticed. */
const POLL_FAILURE_LIMIT = 3;

/** Resume a package already in flight (e.g. the panel was reopened after a
 *  page reload) instead of always restarting at idle — a fresh package
 *  must never be offered while one already exists (in-flight or done), and
 *  the backend does not itself guard against a duplicate create. Only
 *  'none' (and the unmodelled 'failed') fall through to idle. A 'sent'
 *  package without a signingUrl (the email route) still resumes into
 *  'sent' rather than 'ceremony' — GET /spec never returns the recipient
 *  address for that path, so the panel shows a generic in-flight message
 *  instead of naming them; 'completed' resumes the same way and is
 *  reconciled by the very next status poll, which calls onCompleted. */
function initialState(spec: SignatureSpec): PanelState {
  if (spec.status === 'declined') return 'declined';
  if (spec.status === 'sent' || spec.status === 'completed') {
    return spec.signingUrl ? 'ceremony' : 'sent';
  }
  return 'idle';
}

/** Signing panel for a task whose phase-approval document requires a
 *  ValidSign signature. Sets NO completion message of its own: onCompleted
 *  unmounts this panel, so anything set alongside it is destroyed in the
 *  same tick and never paints. The parent owns the confirmation. */
export default function SigningPanel({ taskId, spec, onCompleted }: Props) {
  const [state, setState] = useState<PanelState>(() => initialState(spec));
  const [signingUrl, setSigningUrl] = useState<string | undefined>(spec.signingUrl);
  const [recipient, setRecipient] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  // Held in a ref, not a dependency: ProjectDetail passes a fresh closure on
  // every render, and including it in the poll effect's deps below would
  // re-run (and re-fire the immediate poll) on any unrelated parent
  // re-render, not just on entering ceremony/sent.
  const onCompletedRef = useRef(onCompleted);
  useEffect(() => {
    onCompletedRef.current = onCompleted;
  }, [onCompleted]);

  const start = async (delivery: 'embedded' | 'email') => {
    setState('preparing');
    setError(null);
    setErrorCode(null);
    try {
      const res = await businessApi.validsign.createPackage(taskId, delivery);
      if (!res.success || !res.data) {
        const code = res.error?.code ?? null;
        setErrorCode(code);
        if (code === 'MISSING_SIGNER_EMAIL') {
          // Not fixable by retrying: the signed-in user's Keycloak token
          // carries no email claim, so no package can ever be addressed to
          // them. Only an administrator can add one.
          setError(
            'Uw account heeft geen e-mailadres geregistreerd. Dit moet eerst door een beheerder worden aangevuld — opnieuw proberen lost dit niet op.'
          );
        } else if (code === 'INVALID_DELIVERY') {
          setError(res.error?.message ?? 'Het verzoek was ongeldig.');
        } else {
          setError('Aanmaken van het ondertekenverzoek is mislukt.');
        }
        setState('error');
        return;
      }
      if (delivery === 'embedded') {
        setSigningUrl(res.data.signingUrl);
        setState('ceremony');
      } else {
        setRecipient(res.data.sentTo);
        setState('sent');
      }
    } catch {
      setErrorCode(null);
      setError('Aanmaken van het ondertekenverzoek is mislukt.');
      setState('error');
    }
  };

  // Poll every 3s, cleared on unmount and suspended while the tab is
  // hidden. The limiter is global and IP-keyed: with TRUST_PROXY=false
  // every client behind one proxy shares ONE bucket, which is how the PA
  // cockpit produced 429s. An immediate check on entry means a freshly
  // created (or resumed) package doesn't sit for a full interval before
  // its first read; onCompleted comes from the ref above so this effect
  // only re-runs when `state` or `taskId` actually change, i.e. only on
  // entering the polling state — not on every unrelated parent re-render.
  useEffect(() => {
    if (state !== 'ceremony' && state !== 'sent') return;
    let cancelled = false;
    // Consecutive-failure count, not React state: it must not itself trigger
    // a re-render (only crossing the limit does, via setState below), and it
    // resets implicitly every time this effect re-runs (a fresh poll cycle).
    let failureCount = 0;
    const reportPersistentFailure = () => {
      failureCount += 1;
      if (failureCount < POLL_FAILURE_LIMIT) return;
      // Repeated failure, not silence: a poll that never succeeds again must
      // eventually surface, or this looks identical to "still waiting" --
      // which is what let the runtime/history bug this handles go unnoticed
      // until a live test caught it. No retry button (see the error-state
      // render below): retrying cannot fix an unreachable status endpoint,
      // only a fresh page load can.
      setErrorCode(POLL_FAILED_ERROR_CODE);
      setError(
        'De status van de ondertekening kon niet worden opgehaald. Ververs deze pagina om het opnieuw te proberen.'
      );
      setState('error');
    };
    const poll = () => {
      if (document.visibilityState === 'hidden') return;
      void Promise.resolve(businessApi.validsign.status(taskId))
        .then((res) => {
          if (cancelled) return;
          if (!res || !res.success || !res.data) {
            reportPersistentFailure();
            return;
          }
          failureCount = 0;
          if (res.data.status === 'completed') onCompletedRef.current();
          if (res.data.status === 'declined') setState('declined');
        })
        .catch(() => {
          if (cancelled) return;
          reportPersistentFailure();
        });
    };
    poll();
    const id = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [state, taskId]);

  if (state === 'idle') {
    return (
      <div className="pb-sign-panel">
        <p className="pb-sign-intro">Deze taak vereist een digitale handtekening.</p>
        <div className="pb-sign-actions">
          <button type="button" className="v2-btn" onClick={() => start('embedded')}>
            Onderteken nu
          </button>
          <button
            type="button"
            className="v2-btn pb-sign-btn-secondary"
            onClick={() => start('email')}
          >
            Stuur per e-mail
          </button>
        </div>
      </div>
    );
  }

  if (state === 'preparing') {
    return (
      <div className="pb-sign-panel">
        <p>Ondertekenverzoek wordt voorbereid…</p>
      </div>
    );
  }

  if (state === 'ceremony') {
    const frameSrc = signingUrl
      ? resolveSigningUrl(signingUrl, businessApi.getBaseUrl())
      : undefined;
    return (
      <div className="pb-sign-panel">
        <iframe className="pb-sign-frame" src={frameSrc} title="ValidSign ondertekenen" />
      </div>
    );
  }

  if (state === 'sent') {
    return (
      <div className="pb-sign-panel">
        <p>
          {recipient ? (
            <>
              Het ondertekenverzoek is per e-mail verstuurd naar <strong>{recipient}</strong>.
            </>
          ) : (
            'Er staat al een ondertekenverzoek uit voor deze taak.'
          )}
        </p>
        <p>Deze taak wordt automatisch afgerond zodra er getekend is.</p>
      </div>
    );
  }

  if (state === 'declined') {
    // An outcome, not an error: the task completes with approvalStatus =
    // rejected and the process loops back. Do not style this as a failure.
    return (
      <div className="pb-sign-panel pb-sign-declined">
        <p>De ondertekenaar is niet akkoord gegaan met dit document.</p>
      </div>
    );
  }

  // error — MISSING_SIGNER_EMAIL and a persistently failing status poll both
  // get no retry button: retrying can fix neither a token with no email
  // claim (only an administrator can) nor an unreachable status endpoint
  // (only a fresh page load, which resumes polling, can).
  return (
    <div className="v2-taken-msg v2-taken-msg-error">
      <p>{error ?? 'Er ging iets mis bij het ondertekenverzoek.'}</p>
      {errorCode !== 'MISSING_SIGNER_EMAIL' && errorCode !== POLL_FAILED_ERROR_CODE && (
        <button type="button" className="v2-btn" onClick={() => setState('idle')}>
          Opnieuw proberen
        </button>
      )}
    </div>
  );
}
