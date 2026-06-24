/**
 * Monitoring — Scherm 3, curated signals per source.
 * Live mode: fetches from /v1/pa/signals (confirmed) and inbox (candidates).
 * Mock mode: uses static fixtures from pa.api.ts.
 * Europa/Media tabs show an honest empty-state (no connector yet).
 */

import { useState, useEffect, useCallback } from 'react';
import {
  fetchSignals,
  fetchInbox,
  paTabConnected,
  paTabBronnen,
  signalTag,
  signalTagLabel,
} from '../../services/pa.api';
import { usePaData } from './PaDataProvider';
import { MONITORING_TABS, type MonitoringTabId } from './pa.data';
import type { Signal } from '@ronl/shared';

interface Props {
  activeTab?: MonitoringTabId;
  onOpenDossier: (id: string) => void;
}

function BronBadge({ bron }: { bron: string | null }) {
  if (!bron) return null;
  return (
    <span className={`pac-bron pac-bron-${bron}`}>
      {bron === 'tk' ? 'Tweede Kamer' : 'Off. Bekendmakingen'}
    </span>
  );
}

function SignalCard({
  s,
  onOpenDossier,
  dossierNaam,
  justConfirmed,
}: {
  s: Signal;
  onOpenDossier: (id: string) => void;
  dossierNaam: (id: string | null) => string;
  justConfirmed: boolean;
}) {
  return (
    <div className={`pac-signal ${justConfirmed ? 'pac-signal-fresh' : ''}`}>
      <div className="pac-signal-rel">
        <div className="pac-signal-rel-num">{s.rel}</div>
        <div className="pac-signal-rel-lbl">relevantie</div>
      </div>
      <div className="pac-signal-body">
        <div
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            marginBottom: 6,
            flexWrap: 'wrap',
          }}
        >
          <span className={`pac-tag ${signalTag(s.tab)}`}>{signalTagLabel(s.tab)}</span>
          {s.dossierId && (
            <button
              type="button"
              className="pac-tag"
              style={{ cursor: 'pointer' }}
              onClick={() => onOpenDossier(s.dossierId!)}
            >
              {dossierNaam(s.dossierId)}
            </button>
          )}
          <BronBadge bron={s.bron} />
        </div>
        <div className="pac-signal-title">{s.title}</div>
        <div className="pac-signal-src">
          {s.src}
          {s.ref && (
            <a className="pac-prov" href={s.ref.url} target="_blank" rel="noopener noreferrer">
              {s.ref.nr} ↗
            </a>
          )}
        </div>
        {s.duiding && (
          <div className="pac-signal-duiding">
            <span className="lbl">Duiding</span>
            {s.duiding}
          </div>
        )}
        {s.confirmedBy && !justConfirmed && (
          <div className="pac-confirmed-by">
            ✓ Bevestigd door {s.confirmedBy} · {s.confirmedAt}
          </div>
        )}
        {justConfirmed && (
          <div className="pac-confirmed-by">
            ✓ Zojuist bevestigd · vastgelegd in interventie-log (AI adviseerde · mens besloot)
          </div>
        )}
      </div>
      <div className="pac-signal-impact">
        {s.impact && <span className={`pac-impact ${s.impact}`}>{s.impactLabel}</span>}
        {s.dossierId && (
          <button
            type="button"
            className="pac-section-link"
            onClick={() => onOpenDossier(s.dossierId!)}
          >
            Naar dossier
          </button>
        )}
      </div>
    </div>
  );
}

function InboxCard({
  s,
  dossierNaam,
  onConfirm,
  onDismiss,
}: {
  s: Signal;
  dossierNaam: (id: string | null) => string;
  onConfirm: (s: Signal) => void;
  onDismiss: (id: string) => void;
}) {
  const isAi = s.status === 'ai_drafted';
  return (
    <div className="pac-signal pac-signal-inbox">
      <div className="pac-signal-rel">
        <div className="pac-signal-rel-num">{s.rel}</div>
        <div className="pac-signal-rel-lbl">{isAi ? 'AI-rel.' : 'regel-rel.'}</div>
      </div>
      <div className="pac-signal-body">
        <div
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            marginBottom: 6,
            flexWrap: 'wrap',
          }}
        >
          <span className={`pac-sigstatus ${isAi ? 'ai' : 'cand'}`}>
            {isAi ? '✦ AI-concept' : 'Regel-kandidaat'}
          </span>
          {s.dossierId && <span className="pac-tag">{dossierNaam(s.dossierId)}</span>}
          <BronBadge bron={s.bron} />
        </div>
        <div className="pac-signal-title">{s.title}</div>
        <div className="pac-signal-src">
          {s.src}
          {s.ref && (
            <a className="pac-prov" href={s.ref.url} target="_blank" rel="noopener noreferrer">
              {s.ref.nr} ↗
            </a>
          )}
        </div>
        {isAi && s.duiding ? (
          <div className="pac-signal-duiding ai">
            <span className="lbl">AI-duiding · concept</span>
            {s.duiding}
          </div>
        ) : (
          <div className="pac-duiding-empty">
            Door regels geselecteerd op relevantie. <b>Handmatige duiding nodig</b> — of zet
            AI-duiding aan in Tweaks.
          </div>
        )}
      </div>
      <div className="pac-signal-impact">
        {isAi && s.impact && <span className={`pac-impact ${s.impact}`}>{s.impactLabel}</span>}
        <div className="pac-inbox-actions">
          <button type="button" className="pac-btn pac-btn-sm" onClick={() => onConfirm(s)}>
            Bevestigen
          </button>
          <button
            type="button"
            className="pac-btn pac-btn-sm pac-btn-ghost"
            onClick={() => onDismiss(s.id)}
          >
            Negeren
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Monitoring({ activeTab = 'politiek', onOpenDossier }: Props) {
  const { confirmSignal, dossiers } = usePaData();
  const tab = MONITORING_TABS.find((t) => t.id === activeTab) ?? MONITORING_TABS[0];
  const connected = paTabConnected(tab.id);

  const [view, setView] = useState<'gecureerd' | 'inbox'>('gecureerd');
  const [signals, setSignals] = useState<Signal[]>([]);
  const [inbox, setInbox] = useState<Signal[]>([]);
  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(new Set());
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [sigs, inb] = await Promise.all([
      fetchSignals({ tab: tab.id }),
      fetchInbox({ tab: tab.id }),
    ]);
    setSignals(sigs);
    setInbox(inb);
    setLoading(false);
  }, [tab.id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Reset view when tab changes
  useEffect(() => {
    setView('gecureerd');
  }, [tab.id]);

  const dossierNaam = (id: string | null) => {
    if (!id) return '';
    return dossiers.data.find((d) => d.id === id)?.naam ?? id;
  };

  const handleConfirm = async (s: Signal) => {
    try {
      const patch = s.aiDraft
        ? {
            duiding: s.aiDraft.duiding ?? undefined,
            impact: (s.aiDraft.impact as Signal['impact']) ?? undefined,
            impactLabel: s.aiDraft.impactLabel ?? undefined,
            rel: s.aiDraft.rel ?? undefined,
          }
        : undefined;
      await confirmSignal(s.id, patch);
      setConfirmedIds((prev) => new Set([...prev, s.id]));
      setSignals((prev) =>
        [...prev, { ...s, status: 'confirmed' as const }].sort((a, b) => b.rel - a.rel)
      );
    } catch {
      // keep item in inbox on error
    }
  };

  const handleDismiss = (id: string) => {
    setDismissedIds((prev) => new Set([...prev, id]));
  };

  const visibleInbox = inbox.filter((s) => !confirmedIds.has(s.id) && !dismissedIds.has(s.id));

  return (
    <div>
      <div className="pac-crumb">Monitoring · {tab.label}</div>
      <div className="pac-page-head" style={{ marginBottom: 14 }}>
        <div>
          <h1 className="pac-page-title">{tab.label}</h1>
          <p className="pac-page-sub">
            Gecureerde signalen — geselecteerd op PA-relevantie, met duiding en mogelijke impact op
            kans of risico. Geen ruis, alleen wat ertoe doet.
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
          {connected ? (
            <span className="pac-coverage">bron: {paTabBronnen(tab.id).join(' · ')}</span>
          ) : (
            <span className="pac-coverage off">nog geen bron gekoppeld</span>
          )}
        </div>
      </div>

      {/* Segmented control — only for connected tabs */}
      {connected && (
        <div className="pac-seg" role="tablist">
          <button
            type="button"
            className={`pac-seg-btn ${view === 'gecureerd' ? 'active' : ''}`}
            onClick={() => setView('gecureerd')}
          >
            Gecureerd <span className="pac-seg-count">{signals.length}</span>
          </button>
          <button
            type="button"
            className={`pac-seg-btn ${view === 'inbox' ? 'active' : ''}`}
            onClick={() => setView('inbox')}
          >
            Inbox <span className="pac-seg-count">{visibleInbox.length}</span>
          </button>
        </div>
      )}

      {/* Empty-state for unconnected tabs (Europa, Media) */}
      {!connected ? (
        <div className="pac-empty">
          <div className="pac-empty-mark">⊘</div>
          <h3 className="pac-empty-title">Nog geen bron gekoppeld</h3>
          <p className="pac-empty-body">
            {tab.id === 'europa'
              ? 'Voor Europese signalen is nog geen connector aangesloten. De TK- en OB-bronnen dekken nationaal en regionaal; een EU-bron volgt in een latere cyclus.'
              : 'Media- en omgevingssignalen vergen een aparte connector (bijv. Polpo). Die landt in cyclus 2 — achter dezelfde curatiepijplijn, zonder schermwijziging.'}
          </p>
          <p className="pac-empty-foot">
            PlatO-integratie dekt nu: <b>Politiek (NL)</b> via Tweede Kamer · <b>Regionaal</b> via
            Officiële Bekendmakingen.
          </p>
        </div>
      ) : loading ? (
        <p className="pac-page-sub">Signalen ophalen…</p>
      ) : view === 'inbox' ? (
        <>
          <div className="pac-pipeline-note">
            <b>Curatiepijplijn</b> · opgehaald via opgeslagen zoekvraag → regels filteren &amp;
            scoren → AI stelt duiding voor → u bevestigt. Bevestigen legt de beslissing vast als{' '}
            <span style={{ fontFamily: 'var(--pac-mono)' }}>AI adviseerde · mens besloot</span>.
          </div>
          {visibleInbox.length ? (
            <div className="pac-cards">
              {visibleInbox.map((s) => (
                <InboxCard
                  key={s.id}
                  s={s}
                  dossierNaam={dossierNaam}
                  onConfirm={(x) => void handleConfirm(x)}
                  onDismiss={handleDismiss}
                />
              ))}
            </div>
          ) : (
            <p className="pac-page-sub">
              Inbox leeg — alle kandidaten in deze categorie zijn afgehandeld.
            </p>
          )}
        </>
      ) : signals.length ? (
        <div className="pac-cards">
          {signals.map((s) => (
            <SignalCard
              key={s.id}
              s={s}
              onOpenDossier={onOpenDossier}
              dossierNaam={dossierNaam}
              justConfirmed={confirmedIds.has(s.id)}
            />
          ))}
        </div>
      ) : (
        <p className="pac-page-sub">Geen gecureerde signalen in deze categorie vandaag.</p>
      )}
    </div>
  );
}
