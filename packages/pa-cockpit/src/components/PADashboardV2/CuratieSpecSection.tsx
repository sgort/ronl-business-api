/**
 * CuratieSpecSection — Beheer › Monitoring › "Curatiepijplijn".
 *
 * Read-only explainer of the signal-curation pipeline, sibling of
 * KompasSpecSection: header + the shared CuratiePijplijnFlow diagram + footnotes.
 * PaSectionsRouter — this package's own router, not the host's
 * PASectionRouter — already wraps Beheer content in a <div>, so this returns
 * a bare fragment. That wrapper supplies no padding; see the note beside it
 * for why its `v2-main-pad` class is inert under `.pac` and where the padding
 * actually comes from.
 *
 * Static by design. The same <CuratiePijplijnFlow /> is embedded in Monitoring's
 * inline "Hoe werkt de curatiepijplijn?" explainer — one diagram, two homes.
 */

import { useState } from 'react';
import CuratiePijplijnFlow from './CuratiePijplijnFlow';
import { triggerCurationCycle } from '../../services/pa.api';

type RunState = 'idle' | 'running' | 'done' | 'error';

export default function CuratieSpecSection() {
  const [runState, setRunState] = useState<RunState>('idle');
  const [lastRun, setLastRun] = useState<string | null>(null);

  async function handleRun() {
    if (runState === 'running') return;
    setRunState('running');
    try {
      await triggerCurationCycle();
      setRunState('done');
      setLastRun(
        new Date().toLocaleTimeString('nl-NL', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
      setTimeout(() => setRunState('idle'), 6000);
    } catch {
      setRunState('error');
      setTimeout(() => setRunState('idle'), 6000);
    }
  }

  return (
    <div className="pac-cspec">
      <div className="pac-spec-eyebrow">Monitoring · werkwijze</div>
      <h1 className="pac-page-title" style={{ marginBottom: 8 }}>
        De curatiepijplijn
      </h1>
      <p className="pac-spec-intro" style={{ marginBottom: 12 }}>
        Van rauwe bron tot gecureerd signaal in de cockpit. De cron doet het zware werk — ophalen,
        filteren, scoren — maar een mens beslist altijd. Twee handmatige acties geven de curator
        directe grip: de <b>blanco zoekbalk</b> en <b>Naar inbox</b> (beide op{' '}
        <b>Monitoring → een signaalbron</b>).
      </p>

      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <button
            className={`pac-btn pac-btn-sm${runState === 'done' ? ' done' : ''}`}
            onClick={handleRun}
            disabled={runState === 'running'}
          >
            {runState === 'running' ? '⏳ Bezig…' : 'Curatie nu uitvoeren'}
          </button>
          <span className="pac-spec-intro" style={{ margin: 0, fontSize: 12 }}>
            Start de curation cycle direct — handig na een deployment of voor diagnose.
          </span>
        </div>
        {runState === 'done' && (
          <p
            style={{
              fontSize: 12,
              color: 'var(--pac-green-d)',
              margin: 0,
              fontFamily: 'var(--pac-mono)',
            }}
          >
            ✓ Cycle gestart om {lastRun} — loopt op de achtergrond, duurt ca. 30 s. Ververs
            Monitoring daarna.
          </p>
        )}
        {runState === 'error' && (
          <p style={{ fontSize: 12, color: '#dc2626', margin: 0, fontFamily: 'var(--pac-mono)' }}>
            ✗ Kon de cycle niet starten. Controleer of je bent ingelogd als public-affairs
            gebruiker.
          </p>
        )}
        {runState === 'idle' && lastRun && (
          <p
            style={{
              fontSize: 12,
              color: 'var(--pac-ink-3)',
              margin: 0,
              fontFamily: 'var(--pac-mono)',
            }}
          >
            Laatste handmatige start: {lastRun}
          </p>
        )}
      </div>

      <CuratiePijplijnFlow />

      <div className="pac-cspec-notes">
        <div className="note">
          <div className="num">1</div>
          <p>
            <b>De cron leest alléén teambron-zoekvragen.</b> Een persoonlijke zoekopdracht telt pas
            mee ná <code>↗ team</code> (scope wordt <code>tenant</code>).
          </p>
        </div>
        <div className="note man">
          <div className="num">2</div>
          <p>
            <b>Naar inbox slaat de drempel over.</b> <code>promoteToInbox</code> vloert de
            relevantie op ≥ 5 — een mens vond het immers al de moeite waard — en zet 'm als
            kandidaat in dezelfde inbox.
          </p>
        </div>
        <div className="note">
          <div className="num">3</div>
          <p>
            <b>Elke bevestiging is een interventie.</b> De beslissing wordt vastgelegd als{' '}
            <code>AI adviseerde · mens besloot</code> in het interventie-log.
          </p>
        </div>
      </div>
    </div>
  );
}
