import { Fragment, useEffect, useState } from 'react';
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
  getMockPhaseInstanceDetail,
  getMockWipRows,
  getMockGereedRows,
} from '../../pages/infra-board/infra-board.data';
import {
  combinePhaseCounts,
  getKlaarCounts,
  normalizeLiveCounts,
} from '../../pages/infra-board/rip-phase-counts';
import {
  useDeployedProcessKeys,
  useLivePhaseCounts,
  useActivePhase1,
  usePhase1Completed,
} from '../../services/infra.api';
import { businessApi } from '../../services/api';
import {
  getWipStepInfo,
  getDocProgress,
  countReworkLoops,
  HEALTH,
  type HealthKey,
  type WipStepInfo,
  type DocProgress,
} from '../../pages/infra-board/rip-model';
import RipFase1WipViewer from '../CaseworkerDashboard/RipFase1WipViewer';

interface Props {
  phaseCode: string;
  onBack: () => void;
}

interface StartError {
  cause?: string;
  instance?: string;
}

/** groen/geel/rood heuristic — illustrative only, no per-step norm
 *  exists in the catalogue at this granularity (see design spec §1). */
function computeHealth(blocked: string | null, daysInStep: number): HealthKey {
  if (daysInStep > 28 || (blocked && daysInStep > 14)) return 'rood';
  if (blocked || daysInStep > 14) return 'geel';
  return 'groen';
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
  const [openDossier, setOpenDossier] = useState<string | null>(null);

  const {
    data: activeInstances,
    loading: wipLoading,
    error: wipError,
    reload: reloadWip,
  } = useActivePhase1();
  const {
    data: completedInstances,
    loading: gereedLoading,
    error: gereedError,
    reload: reloadGereed,
  } = usePhase1Completed();

  const [wipDerived, setWipDerived] = useState<
    Record<string, { info: WipStepInfo | null; docs: DocProgress }>
  >({});
  const [gereedDerived, setGereedDerived] = useState<Record<string, { loops: number }>>({});

  useEffect(() => {
    if (phaseCode !== 'R2.1' || !activeInstances) return;
    let alive = true;
    Promise.all(
      activeInstances.map(async (inst) => {
        const histRes = await businessApi.process.activityHistory(inst.id);
        const history = histRes.success && histRes.data ? histRes.data : [];
        return [inst.id, { info: getWipStepInfo(history), docs: getDocProgress(history) }] as const;
      })
    ).then((entries) => {
      if (alive) setWipDerived(Object.fromEntries(entries));
    });
    return () => {
      alive = false;
    };
  }, [phaseCode, activeInstances]);

  useEffect(() => {
    if (phaseCode !== 'R2.1' || !completedInstances) return;
    let alive = true;
    Promise.all(
      completedInstances.map(async (inst) => {
        const histRes = await businessApi.process.activityHistory(inst.id);
        const history = histRes.success && histRes.data ? histRes.data : [];
        return [inst.id, { loops: countReworkLoops(history) }] as const;
      })
    ).then((entries) => {
      if (alive) setGereedDerived(Object.fromEntries(entries));
    });
    return () => {
      alive = false;
    };
  }, [phaseCode, completedInstances]);

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
      reloadWip();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleFallbackStart() {
    setSubmitting(true);
    setFallbackError(null);
    try {
      const res = await businessApi.process.start('RipPhase1Process', {});
      if (res.success) {
        setFallbackStarted(true);
        reloadWip();
      } else {
        setFallbackError({ cause: res.error?.details, instance: res.error?.instance });
      }
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

  const isR21 = phaseCode === 'R2.1';
  const liveActive = isR21 ? (activeInstances ?? []) : [];
  const liveCompleted = isR21 ? (completedInstances ?? []) : [];
  const showWipLoading = isR21 && wipLoading && !activeInstances;
  const showWipError = isR21 && wipError;
  const showGereedLoading = isR21 && gereedLoading && !completedInstances;
  const showGereedError = isR21 && gereedError;

  const mockWipRows = getMockWipRows(phase);
  const mockGereedRows = getMockGereedRows(phase);

  // Gereed summary line stats — combines live + mock rows into one set
  // of arithmetic, same "never two parallel totals" merge convention as
  // everywhere else in this file.
  const liveGereedStats = liveCompleted.map((inst) => ({
    weeks: Math.round(
      (new Date(inst.endTime).getTime() - new Date(inst.startTime).getTime()) /
        (1000 * 60 * 60 * 24 * 7)
    ),
    loops: gereedDerived[inst.id]?.loops ?? 0,
  }));
  const mockGereedStats = mockGereedRows.map((p) => {
    const detail = getMockPhaseInstanceDetail(p, phase);
    return { weeks: detail.actualWeeks ?? phase.weeks, loops: detail.loops };
  });
  const allGereedStats = [...liveGereedStats, ...mockGereedStats];
  const totalAfgerond = allGereedStats.length;
  const avgWeeks = totalAfgerond
    ? Math.round(allGereedStats.reduce((sum, r) => sum + r.weeks, 0) / totalAfgerond)
    : 0;
  const metLoop = allGereedStats.filter((r) => r.loops > 0).length;

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
        <>
          {showWipError && (
            <div className="pb-banner pb-banner-error">
              Live WIP-gegevens konden niet worden geladen.{' '}
              <button type="button" className="v2-btn v2-btn-ghost v2-btn-sm" onClick={reloadWip}>
                Opnieuw proberen
              </button>
            </div>
          )}
          {showWipLoading ? (
            <p className="pb-placeholder">Bezig met laden…</p>
          ) : liveActive.length + mockWipRows.length === 0 ? (
            <p className="pb-placeholder">Geen projecten in uitvoering voor {phase.code}.</p>
          ) : (
            <table className="pb-instance-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Huidige stap</th>
                  <th>Rol</th>
                  <th>Dagen</th>
                  <th>Producten</th>
                  <th>Blokkade</th>
                  <th>Gezondheid</th>
                </tr>
              </thead>
              <tbody>
                {liveActive.map((inst) => {
                  const derived = wipDerived[inst.id];
                  const info = derived?.info ?? null;
                  const health = info ? computeHealth(info.blocked, info.daysInStep) : null;
                  return (
                    <tr key={inst.id}>
                      <td>
                        <span className="pb-proj-nr">
                          {inst.projectNumber || inst.id.slice(0, 8)}
                        </span>{' '}
                        {inst.projectName || 'RIP Fase 1 project'}
                        <span className="pb-live-badge">LIVE</span>
                      </td>
                      <td>{info?.step ?? '—'}</td>
                      <td>{info?.stepRole ?? '—'}</td>
                      <td>{info ? `${info.daysInStep}d` : '—'}</td>
                      <td>
                        {derived ? `${derived.docs.docsDone}/${derived.docs.docsTotal}` : '—'}
                      </td>
                      <td>{info?.blocked ?? '—'}</td>
                      <td>
                        {health ? (
                          <>
                            <span
                              className="pb-health-dot"
                              style={{ background: HEALTH[health].color }}
                            />{' '}
                            {HEALTH[health].label}
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  );
                })}
                {mockWipRows.map((p) => {
                  const detail = getMockPhaseInstanceDetail(p, phase);
                  const health = computeHealth(detail.blocked, detail.daysInStep);
                  return (
                    <tr key={p.id}>
                      <td>
                        <span className="pb-proj-nr">{p.nr}</span> {p.naam}
                      </td>
                      <td>{detail.step}</td>
                      <td>{detail.stepRole}</td>
                      <td>{detail.daysInStep}d</td>
                      <td>
                        {detail.docsDone}/{detail.docsTotal}
                      </td>
                      <td>{detail.blocked ?? '—'}</td>
                      <td>
                        <span
                          className="pb-health-dot"
                          style={{ background: HEALTH[health].color }}
                        />{' '}
                        {HEALTH[health].label}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </>
      )}
      {tab === 'gereed' && (
        <>
          {showGereedError && (
            <div className="pb-banner pb-banner-error">
              Live Gereed-gegevens konden niet worden geladen.{' '}
              <button
                type="button"
                className="v2-btn v2-btn-ghost v2-btn-sm"
                onClick={reloadGereed}
              >
                Opnieuw proberen
              </button>
            </div>
          )}
          {showGereedLoading ? (
            <p className="pb-placeholder">Bezig met laden…</p>
          ) : totalAfgerond === 0 ? (
            <p className="pb-placeholder">Nog geen afgeronde projecten voor {phase.code}.</p>
          ) : (
            <>
              <p className="pb-gereed-summary">
                {totalAfgerond} afgerond · Gemiddelde doorlooptijd {avgWeeks} wk · norm{' '}
                {phase.weeks} wk · {metLoop} met review-loop
              </p>
              <table className="pb-instance-table">
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>Afgerond</th>
                    <th>Geaccordeerd door</th>
                    <th>Doorlooptijd</th>
                    <th>Loops</th>
                    <th>Producten</th>
                    <th>Dossier</th>
                  </tr>
                </thead>
                <tbody>
                  {liveCompleted.map((inst) => {
                    const weeks = Math.round(
                      (new Date(inst.endTime).getTime() - new Date(inst.startTime).getTime()) /
                        (1000 * 60 * 60 * 24 * 7)
                    );
                    const loops = gereedDerived[inst.id]?.loops ?? 0;
                    return (
                      <Fragment key={inst.id}>
                        <tr>
                          <td>
                            <span className="pb-proj-nr">
                              {inst.projectNumber || inst.id.slice(0, 8)}
                            </span>{' '}
                            {inst.projectName || 'RIP Fase 1 project'}
                            <span className="pb-live-badge">LIVE</span>
                          </td>
                          <td>{new Date(inst.endTime).toLocaleDateString('nl-NL')}</td>
                          {/* Geaccordeerd door: Operaton only returns a raw assignee
                            UUID and there's no user-directory lookup anywhere in
                            this app to resolve it to a name — a dash beats a raw
                            UUID here (see design spec §2, deliberate simplification). */}
                          <td>—</td>
                          <td>
                            {weeks} wk / {phase.weeks} wk
                          </td>
                          <td>{loops}</td>
                          <td>—</td>
                          <td>
                            <button
                              type="button"
                              className="v2-btn v2-btn-ghost v2-btn-sm"
                              onClick={() =>
                                setOpenDossier(openDossier === inst.id ? null : inst.id)
                              }
                            >
                              Openen
                            </button>
                          </td>
                        </tr>
                        {openDossier === inst.id && (
                          <tr>
                            <td colSpan={7}>
                              <RipFase1WipViewer instanceId={inst.id} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                  {mockGereedRows.map((p) => {
                    const detail = getMockPhaseInstanceDetail(p, phase);
                    return (
                      <tr key={p.id}>
                        <td>
                          <span className="pb-proj-nr">{p.nr}</span> {p.naam}
                        </td>
                        <td>{detail.doneDate}</td>
                        <td>{detail.doneBy}</td>
                        <td>
                          {detail.actualWeeks} wk / {detail.plannedWeeks} wk
                        </td>
                        <td>{detail.loops}</td>
                        <td>
                          {detail.docsDone}/{detail.docsTotal}
                        </td>
                        <td>—</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
        </>
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
