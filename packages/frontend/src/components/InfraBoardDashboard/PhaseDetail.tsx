import { useEffect, useState } from 'react';
import {
  RIP_PHASES,
  RIP_STAGES,
  RIP_DEPLOY_META,
  getPhaseDeployStatus,
  ripPhaseByCode,
  type RipPhase,
} from '../../pages/infra-board/rip-phases.catalog';
import {
  getMockPhaseCounts,
  getReadyProjects,
  getOutOfSequenceProjects,
  getMockPhaseInstanceDetail,
  getMockPortfolio,
} from '../../pages/infra-board/infra-board.data';
import {
  combinePhaseCounts,
  getKlaarCounts,
  normalizeLiveCounts,
} from '../../pages/infra-board/rip-phase-counts';
import { useDeployedProcessKeys, useLivePhaseCounts } from '../../services/infra.api';
import { businessApi } from '../../services/api';
import {
  getWipStepInfo,
  countReworkLoops,
  HEALTH,
  type HealthKey,
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

function getMockPortfolioWipRows(phase: RipPhase) {
  return getMockPortfolio().filter(
    (p) => p.ripPhaseCode === phase.code && p.ripPhaseState === 'wip'
  );
}

function getMockPortfolioGereedRows(phase: RipPhase) {
  const idx = RIP_PHASES.findIndex((p) => p.code === phase.code);
  return getMockPortfolio().filter(
    (p) => RIP_PHASES.findIndex((rp) => rp.code === p.ripPhaseCode) > idx
  );
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
  const [liveWip, setLiveWip] = useState<
    Array<{ id: string; nr: string; naam: string; info: ReturnType<typeof getWipStepInfo> }>
  >([]);
  const [liveGereed, setLiveGereed] = useState<
    Array<{
      id: string;
      nr: string;
      naam: string;
      startTime: string;
      endTime: string;
      loops: number;
    }>
  >([]);
  const [openDossier, setOpenDossier] = useState<string | null>(null);

  useEffect(() => {
    if (phaseCode !== 'R2.1') return;
    let alive = true;
    businessApi.rip.phase1Active().then(async (res) => {
      if (!res.success || !res.data || !alive) return;
      const rows = await Promise.all(
        res.data.map(async (inst) => {
          const histRes = await businessApi.process.activityHistory(inst.id);
          const info = histRes.success && histRes.data ? getWipStepInfo(histRes.data) : null;
          return {
            id: inst.id,
            nr: inst.projectNumber || inst.id.slice(0, 8),
            naam: inst.projectName || 'RIP Fase 1 project',
            info,
          };
        })
      );
      if (alive) setLiveWip(rows);
    });
    return () => {
      alive = false;
    };
  }, [phaseCode]);

  useEffect(() => {
    if (phaseCode !== 'R2.1') return;
    let alive = true;
    businessApi.rip.phase1Completed().then(async (res) => {
      if (!res.success || !res.data || !alive) return;
      const rows = await Promise.all(
        res.data.map(async (inst) => {
          const histRes = await businessApi.process.activityHistory(inst.id);
          const loops = histRes.success && histRes.data ? countReworkLoops(histRes.data) : 0;
          return {
            id: inst.id,
            nr: inst.projectNumber || inst.id.slice(0, 8),
            naam: inst.projectName || 'RIP Fase 1 project',
            startTime: inst.startTime,
            endTime: inst.endTime,
            loops,
          };
        })
      );
      if (alive) setLiveGereed(rows);
    });
    return () => {
      alive = false;
    };
  }, [phaseCode]);

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
            {liveWip.map((row) => {
              const health = computeHealth(row.info?.blocked ?? null, row.info?.daysInStep ?? 0);
              return (
                <tr key={row.id}>
                  <td>
                    <span className="pb-proj-nr">{row.nr}</span> {row.naam}
                    <span className="pb-live-badge">LIVE</span>
                  </td>
                  <td>{row.info?.step ?? '—'}</td>
                  <td>{row.info?.stepRole ?? '—'}</td>
                  <td>{row.info ? `${row.info.daysInStep}d` : '—'}</td>
                  <td>—</td>
                  <td>{row.info?.blocked ?? '—'}</td>
                  <td>
                    <span className="pb-health-dot" style={{ background: HEALTH[health].color }} />{' '}
                    {HEALTH[health].label}
                  </td>
                </tr>
              );
            })}
            {getMockPortfolioWipRows(phase).map((p) => {
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
                    <span className="pb-health-dot" style={{ background: HEALTH[health].color }} />{' '}
                    {HEALTH[health].label}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {tab === 'gereed' && (
        <>
          <p className="pb-gereed-summary">
            {liveGereed.length + getMockPortfolioGereedRows(phase).length} afgerond
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
              {liveGereed.map((row) => {
                const weeks = Math.round(
                  (new Date(row.endTime).getTime() - new Date(row.startTime).getTime()) /
                    (1000 * 60 * 60 * 24 * 7)
                );
                return (
                  <>
                    <tr key={row.id}>
                      <td>
                        <span className="pb-proj-nr">{row.nr}</span> {row.naam}
                        <span className="pb-live-badge">LIVE</span>
                      </td>
                      <td>{new Date(row.endTime).toLocaleDateString('nl-NL')}</td>
                      {/* Geaccordeerd door: Operaton only returns a raw assignee
                        UUID and there's no user-directory lookup anywhere in
                        this app to resolve it to a name — a dash beats a raw
                        UUID here (see design spec §2, deliberate simplification). */}
                      <td>—</td>
                      <td>
                        {weeks} wk / {phase.weeks} wk
                      </td>
                      <td>{row.loops}</td>
                      <td>—</td>
                      <td>
                        <button
                          type="button"
                          className="v2-btn v2-btn-ghost v2-btn-sm"
                          onClick={() => setOpenDossier(openDossier === row.id ? null : row.id)}
                        >
                          Openen
                        </button>
                      </td>
                    </tr>
                    {openDossier === row.id && (
                      <tr key={`${row.id}-dossier`}>
                        <td colSpan={7}>
                          <RipFase1WipViewer instanceId={row.id} />
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
              {getMockPortfolioGereedRows(phase).map((p) => {
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
