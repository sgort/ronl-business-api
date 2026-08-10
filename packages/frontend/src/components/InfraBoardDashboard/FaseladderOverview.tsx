import { Fragment } from 'react';
import {
  RIP_PHASES,
  RIP_STAGES,
  RIP_DEPLOY_META,
  getPhaseDeployStatus,
} from '../../pages/infra-board/rip-phases.catalog';
import { getMockPhaseCounts } from '../../pages/infra-board/infra-board.data';
import {
  combinePhaseCounts,
  getKlaarCounts,
  normalizeLiveCounts,
  type AnnotatedPhaseCounts,
} from '../../pages/infra-board/rip-phase-counts';
import { useDeployedProcessKeys, useLivePhaseCounts } from '../../services/infra.api';

function Metric({ combined, live }: { combined: number; live: number }) {
  return (
    <span>
      {combined}
      {live > 0 && <span className="pb-live-badge">{live} live</span>}
    </span>
  );
}

export default function FaseladderOverview() {
  const { data: deployment } = useDeployedProcessKeys();
  const { data: liveCountsRaw } = useLivePhaseCounts();

  const deployedKeys = new Set(deployment?.deployedKeys ?? []);
  const mockCounts = getMockPhaseCounts();
  const liveCounts = normalizeLiveCounts(liveCountsRaw?.counts ?? {}, RIP_PHASES);
  const combined: Record<string, AnnotatedPhaseCounts> = combinePhaseCounts(mockCounts, liveCounts);
  const klaarCombined = getKlaarCounts(RIP_PHASES, combined);
  const klaarLive = getKlaarCounts(RIP_PHASES, liveCounts);

  const deployedPhases = RIP_PHASES.filter(
    (p) => getPhaseDeployStatus(p, deployedKeys) === 'gedeployed'
  );
  // Total active projects portfolio-wide, not a phase-count — a phase-count
  // is capped at 9 and can never read e.g. "27".
  const fasenInUitvoering = RIP_PHASES.reduce((sum, p) => sum + (combined[p.code]?.wip ?? 0), 0);
  const fasenInUitvoeringLive = RIP_PHASES.reduce(
    (sum, p) => sum + (combined[p.code]?.liveWip ?? 0),
    0
  );
  // "Klaar om te starten" is the total Klaar across every phase that has a
  // Starten concept at all (i.e. not `beyond`) — not filtered to deployed
  // phases. "Wacht op deployment" is the same total restricted to the
  // undeployed subset; together they partition the non-beyond phases.
  const startablePhases = RIP_PHASES.filter((p) => !p.beyond);
  const klaarOmTeStarten = startablePhases.reduce(
    (sum, p) => sum + (klaarCombined[p.code] ?? 0),
    0
  );
  const klaarOmTeStartenLive = startablePhases.reduce(
    (sum, p) => sum + (klaarLive[p.code] ?? 0),
    0
  );
  const nietDeployedPhases = startablePhases.filter((p) => !deployedPhases.includes(p));
  const wachtOpDeployment = nietDeployedPhases.reduce(
    (sum, p) => sum + (klaarCombined[p.code] ?? 0),
    0
  );
  const wachtOpDeploymentLive = nietDeployedPhases.reduce(
    (sum, p) => sum + (klaarLive[p.code] ?? 0),
    0
  );

  return (
    <div className="pb-view">
      <p className="pb-eyebrow">Beheer · Provincie Flevoland</p>
      <h1 className="pb-h1">Faseladder</h1>

      <div className="pb-kpi-row">
        <div className="pb-kpi">
          <span className="v">
            <Metric combined={fasenInUitvoering} live={fasenInUitvoeringLive} />
          </span>
          <span className="l">Fasen in uitvoering</span>
        </div>
        <div className="pb-kpi">
          <span className="v">
            {deployedPhases.length} / {RIP_PHASES.length}
          </span>
          <span className="l">Deelprocessen inzetbaar</span>
        </div>
        <div className="pb-kpi">
          <span className="v">
            <Metric combined={klaarOmTeStarten} live={klaarOmTeStartenLive} />
          </span>
          <span className="l">Klaar om te starten</span>
        </div>
        <div className="pb-kpi">
          <span className="v">
            <Metric combined={wachtOpDeployment} live={wachtOpDeploymentLive} />
          </span>
          <span className="l">Wacht op deployment</span>
        </div>
      </div>

      <table className="pb-faseladder-table">
        <thead>
          <tr>
            <th>Fase</th>
            <th>Status</th>
            <th>Trekker</th>
            <th>Sluit met</th>
            <th>Klaar</th>
            <th>WIP / Geparkeerd</th>
            <th>Gereed</th>
          </tr>
        </thead>
        <tbody>
          {RIP_STAGES.map((stage) => (
            <Fragment key={stage.code}>
              <tr className="pb-stage-row">
                <th colSpan={7}>{stage.name}</th>
              </tr>
              {RIP_PHASES.filter((p) => p.stage === stage.code).map((phase) => {
                const c = combined[phase.code] ?? {
                  wip: 0,
                  gereed: 0,
                  geparkeerd: 0,
                  liveWip: 0,
                  liveGereed: 0,
                  liveGeparkeerd: 0,
                };
                const status = getPhaseDeployStatus(phase, deployedKeys);
                const meta = RIP_DEPLOY_META[status];
                const klaar = klaarCombined[phase.code];
                const klaarL = klaarLive[phase.code] ?? 0;
                return (
                  <tr key={phase.code}>
                    <td>
                      {phase.code} · {phase.name}
                    </td>
                    <td>
                      <span
                        className="pb-deploy-pill"
                        style={{ color: meta.color, borderColor: meta.color }}
                      >
                        {meta.label}
                      </span>
                    </td>
                    <td>{phase.lead}</td>
                    <td>{phase.exit}</td>
                    <td>
                      {klaar === undefined || klaar === 0 ? (
                        '—'
                      ) : (
                        <Metric combined={klaar} live={klaarL} />
                      )}
                    </td>
                    <td>
                      {phase.beyond ? (
                        <Metric combined={c.geparkeerd} live={c.liveGeparkeerd} />
                      ) : (
                        <Metric combined={c.wip} live={c.liveWip} />
                      )}
                    </td>
                    <td>
                      <Metric combined={c.gereed} live={c.liveGereed} />
                    </td>
                  </tr>
                );
              })}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
