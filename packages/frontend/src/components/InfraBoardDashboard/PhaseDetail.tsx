import { useState } from 'react';
import {
  RIP_PHASES,
  RIP_STAGES,
  RIP_DEPLOY_META,
  getPhaseDeployStatus,
  ripPhaseByCode,
} from '../../pages/infra-board/rip-phases.catalog';
import {
  getMockPhaseCounts,
  getReadyProjects,
  getOutOfSequenceProjects,
} from '../../pages/infra-board/infra-board.data';
import {
  combinePhaseCounts,
  getKlaarCounts,
  normalizeLiveCounts,
} from '../../pages/infra-board/rip-phase-counts';
import { useDeployedProcessKeys, useLivePhaseCounts } from '../../services/infra.api';
import { businessApi } from '../../services/api';

interface Props {
  phaseCode: string;
  onBack: () => void;
}

interface StartError {
  cause?: string;
  instance?: string;
}

export default function PhaseDetail({ phaseCode, onBack }: Props) {
  const phase = ripPhaseByCode(phaseCode);
  const { data: deployment } = useDeployedProcessKeys();
  const { data: liveCountsRaw } = useLivePhaseCounts();
  const [tab, setTab] = useState<'starten' | 'wip' | 'gereed'>('starten');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [showOutOfSequence, setShowOutOfSequence] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [justStarted, setJustStarted] = useState(0);
  const [fallbackStarted, setFallbackStarted] = useState(false);
  const [fallbackError, setFallbackError] = useState<StartError | null>(null);

  if (!phase) return null;

  const deployedKeys = new Set(deployment?.deployedKeys ?? []);
  const mockCounts = getMockPhaseCounts();
  const liveCounts = normalizeLiveCounts(liveCountsRaw?.counts ?? {}, RIP_PHASES);
  const combined = combinePhaseCounts(mockCounts, liveCounts);
  const c = combined[phase.code] ?? {
    wip: 0,
    gereed: 0,
    geparkeerd: 0,
    liveWip: 0,
    liveGereed: 0,
    liveGeparkeerd: 0,
  };
  const klaarCombined = getKlaarCounts(RIP_PHASES, combined);
  const klaar = klaarCombined[phase.code];
  const status = getPhaseDeployStatus(phase, deployedKeys);
  const meta = RIP_DEPLOY_META[status];
  const stage = RIP_STAGES.find((s) => s.code === phase.stage);
  const isFirstPhase = RIP_PHASES[0].code === phase.code;
  const canStart = status === 'gedeployed';

  const header = (
    <>
      <button type="button" className="pb-back-link" onClick={onBack}>
        ← Faseladder
      </button>
      <p className="pb-eyebrow">
        BEHEER · {stage?.code} {stage?.name.toUpperCase()}
      </p>
      <h1 className="pb-h1">
        <span className="pb-phase-chip">{phase.code}</span> {phase.name}{' '}
        <span className="pb-deploy-pill" style={{ color: meta.color, borderColor: meta.color }}>
          {meta.label}
        </span>
      </h1>
      <div className="pb-meta-strip">
        <div>
          <span className="l">Start bij</span>
          <span className="v">{phase.entry}</span>
        </div>
        <div>
          <span className="l">Sluit met</span>
          <span className="v">{phase.exit}</span>
        </div>
        <div>
          <span className="l">Trekker</span>
          <span className="v">{phase.lead}</span>
        </div>
        <div>
          <span className="l">Betrokken rollen</span>
          <span className="v">{phase.roles.length}</span>
        </div>
      </div>
    </>
  );

  if (phase.beyond) {
    return (
      <div className="pb-view">
        {header}
        <div className="pb-banner">
          Niet gemodelleerd — {phase.name} is alleen benoemd als vervolgstap. Er is nog geen
          overzichtsplaat en dus geen procesmodel.
        </div>
      </div>
    );
  }

  async function handleStartSelected() {
    setSubmitting(true);
    try {
      const nrs = [...selected];
      await Promise.all(nrs.map(() => businessApi.process.start(phase!.processDefinitionKey!, {})));
      setSelected(new Set());
      setReasons({});
      setJustStarted(nrs.length);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleFallbackStart() {
    setSubmitting(true);
    setFallbackError(null);
    try {
      const res = await businessApi.process.start('RipPhase1Process', {});
      if (res.success) setFallbackStarted(true);
      else setFallbackError({ cause: res.error?.details, instance: res.error?.instance });
    } catch {
      setFallbackError({});
    } finally {
      setSubmitting(false);
    }
  }

  const readyProjects = getReadyProjects(phase.code);
  const outOfSequenceProjects = getOutOfSequenceProjects(phase.code);

  function toggleReady(nr: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(nr)) next.delete(nr);
      else next.add(nr);
      return next;
    });
  }

  function setReason(nr: string, value: string) {
    setReasons((r) => ({ ...r, [nr]: value }));
    if (value.trim().length < 4) {
      setSelected((s) => {
        if (!s.has(nr)) return s;
        const next = new Set(s);
        next.delete(nr);
        return next;
      });
    }
  }

  return (
    <div className="pb-view">
      {header}

      <div className="pb-tabs">
        <button
          type="button"
          className={tab === 'starten' ? 'active' : ''}
          onClick={() => setTab('starten')}
        >
          Starten <span className="pb-tab-badge">{klaar ?? 0}</span>
        </button>
        <button
          type="button"
          className={tab === 'wip' ? 'active' : ''}
          onClick={() => setTab('wip')}
        >
          WIP <span className="pb-tab-badge">{c.wip}</span>
        </button>
        <button
          type="button"
          className={tab === 'gereed' ? 'active' : ''}
          onClick={() => setTab('gereed')}
        >
          Gereed <span className="pb-tab-badge">{c.gereed}</span>
        </button>
      </div>

      {tab === 'wip' && (
        <p className="pb-placeholder">WIP-overzicht wordt gebouwd in een volgend deelproject.</p>
      )}
      {tab === 'gereed' && (
        <p className="pb-placeholder">Gereed-overzicht wordt gebouwd in een volgend deelproject.</p>
      )}

      {tab === 'starten' && (
        <div className="pb-starten-layout">
          <div className="pb-starten-main">
            {!canStart && (
              <div className="pb-banner">
                {meta.label} — {meta.note} Er staan wel {readyProjects.length} projecten klaar voor
                deze fase.
              </div>
            )}

            {justStarted > 0 && (
              <div className="pb-banner pb-banner-success">{justStarted} proces(sen) gestart.</div>
            )}

            <h2>
              Projecten die {phase.code} kunnen starten <span>{readyProjects.length}</span>
            </h2>

            {isFirstPhase && readyProjects.length === 0 ? (
              fallbackStarted ? (
                <div className="pb-banner pb-banner-success">
                  {phase.code} gestart. De intake taak staat klaar in de wachtrij.
                </div>
              ) : (
                <>
                  <p>Geen enkel project heeft {phase.code} als eerstvolgende fase.</p>
                  {fallbackError && (
                    <div className="pb-banner pb-banner-error">
                      <p>{phase.code} proces kon niet worden gestart.</p>
                      {fallbackError.cause && <p>{fallbackError.cause}</p>}
                    </div>
                  )}
                  <button
                    type="button"
                    className="v2-btn"
                    disabled={submitting}
                    onClick={handleFallbackStart}
                  >
                    {phase.code} starten
                  </button>
                </>
              )
            ) : (
              <>
                <ul className="pb-ready-list">
                  {readyProjects.map((p) => (
                    <li key={p.id}>
                      <input
                        type="checkbox"
                        disabled={!canStart}
                        checked={selected.has(p.nr)}
                        onChange={() => toggleReady(p.nr)}
                      />
                      <span className="pb-proj-nr">{p.nr}</span> {p.naam}
                      <span className="pb-badge-klaar">KLAAR</span>
                      <div className="sub">Vorige fase afgerond · {p.role}</div>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="v2-btn"
                  disabled={!canStart || selected.size === 0 || submitting}
                  onClick={handleStartSelected}
                >
                  {phase.code} starten
                </button>{' '}
                {outOfSequenceProjects.length > 0 && !showOutOfSequence && (
                  <button
                    type="button"
                    className="v2-btn v2-btn-ghost"
                    onClick={() => setShowOutOfSequence(true)}
                  >
                    Toon {outOfSequenceProjects.length} projecten die nog niet aan beurt zijn
                  </button>
                )}
                {showOutOfSequence && (
                  <ul className="pb-ready-list">
                    {outOfSequenceProjects.map((p) => {
                      const reason = reasons[p.nr] ?? '';
                      return (
                        <li key={p.id}>
                          <input
                            type="checkbox"
                            disabled={!canStart || reason.trim().length < 4}
                            checked={selected.has(p.nr)}
                            onChange={() => toggleReady(p.nr)}
                          />
                          <span className="pb-proj-nr">{p.nr}</span> {p.naam}
                          <span className="pb-badge-afwijking">AFWIJKING</span>
                          <div className="sub">
                            <label htmlFor={`reden-${p.nr}`}>Afwijkingsreden</label>
                            <textarea
                              id={`reden-${p.nr}`}
                              aria-label="Afwijkingsreden"
                              value={reason}
                              onChange={(e) => setReason(p.nr, e.target.value)}
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            )}
          </div>

          <div className="pb-side-panel">
            <h3>Wat er gebeurt bij starten</h3>
            <ol>
              <li>Procesinstantie van {phase.code} wordt aangemaakt per project.</li>
              <li>Eerste taak verschijnt in de wachtrij van {phase.lead}.</li>
              <li>{phase.docs.length} producten worden als op te leveren gezet.</li>
              <li>Fase sluit op {phase.exit}.</li>
            </ol>
            <dl>
              <div>
                <dt>Doorlooptijd (norm)</dt>
                <dd>{phase.weeks} weken</dd>
              </div>
              <div>
                <dt>Review-loops</dt>
                <dd>{phase.gates.length}</dd>
              </div>
              <div>
                <dt>Kredietbesluit</dt>
                <dd>{phase.krediet ? `Ja — ${phase.kredietBeslisser}` : 'Nee'}</dd>
              </div>
            </dl>
            <p className="pb-bron">{phase.bron}</p>
          </div>
        </div>
      )}
    </div>
  );
}
