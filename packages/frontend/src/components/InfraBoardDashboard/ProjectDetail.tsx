import { useState, useEffect } from 'react';
import {
  PHASES,
  FASE1_NODES,
  FASE1_DOCS,
  HEALTH,
  nodeStatusFromHistory,
  type StatusKey,
} from '../../pages/infra-board/rip-model';
import { getMockPortfolio, type PortfolioProject } from '../../pages/infra-board/infra-board.data';
import { useActivityHistory, usePhase1Documents } from '../../services/infra.api';
import Fase1Swimlane from './Fase1Swimlane';
import type { ProjectRef } from '../../pages/InfraBoardDashboard';

interface Props {
  projectRef: ProjectRef;
  phaseLabels: string[];
  onBack: () => void;
}

/** Derive a node-status map for a MOCK project (no live instance). */
function deriveMockStatus(project: PortfolioProject | undefined): Record<string, StatusKey> {
  const out: Record<string, StatusKey> = {};
  const flag = project?.phaseStatuses[0];
  const reached = !project
    ? 0
    : project.phase > 1
      ? 99
      : flag === 'active'
        ? 5
        : flag === 'action'
          ? 10
          : 14;
  for (const n of FASE1_NODES) {
    if (n.col < reached) out[n.id] = 'done';
    else if (n.col === reached)
      out[n.id] =
        project &&
        project.phase === 1 &&
        flag &&
        (['risk', 'overdue', 'action'] as StatusKey[]).includes(flag)
          ? flag
          : 'active';
    else out[n.id] = project && project.phase > 1 ? 'done' : 'todo';
  }
  return out;
}

export default function ProjectDetail({ projectRef, phaseLabels, onBack }: Props) {
  const mock = getMockPortfolio().find((p) => p.nr === projectRef.nr);
  const isLive = !!projectRef.instanceId;

  const { data: history } = useActivityHistory(projectRef.instanceId ?? null);
  const { data: docs } = usePhase1Documents(projectRef.instanceId ?? null);

  // live instances are always in Fase 1 (R2.1); mock rows carry their own phase.
  const currentPhase = isLive ? 1 : (mock?.phase ?? 1);
  const [selPhase, setSelPhase] = useState(currentPhase);
  useEffect(() => {
    setSelPhase(currentPhase);
  }, [projectRef.nr, projectRef.instanceId, currentPhase]);

  const statusById: Record<string, StatusKey> =
    isLive && history ? nodeStatusFromHistory(history) : deriveMockStatus(mock);

  const naam = mock?.naam ?? (docs?.variables?.projectName as string) ?? `Project ${projectRef.nr}`;
  const health = mock?.health ?? 'groen';
  const budget = mock?.budget ?? (docs?.variables?.confirmedBudget as string) ?? '—';
  const milestone = mock?.milestone ?? 'Lopende processtap';
  const startYear = mock?.startYear ?? new Date().getFullYear();

  const stepClass = (n: number) => {
    if (n < currentPhase) return 'done';
    if (n === currentPhase) {
      const f = mock?.phaseStatuses[n - 1];
      return f && (['risk', 'overdue', 'action'] as StatusKey[]).includes(f)
        ? `active ${f}`
        : 'active';
    }
    return 'todo';
  };

  const docOk = (produceNode: string) => statusById[produceNode] === 'done';
  const phaseInfo = PHASES.find((p) => p.n === selPhase)!;
  const curInfo = PHASES.find((p) => p.n === currentPhase)!;

  return (
    <div className="pb-view">
      <button type="button" className="pb-back" onClick={onBack}>
        ← Terug naar portfolio
      </button>

      <div className="pb-proj-head">
        <div>
          <p className="pb-eyebrow">
            <span className={`pb-health ${health}`} />
            Project {projectRef.nr} · {HEALTH[health].label}
            {isLive ? ' · live instantie' : ''}
          </p>
          <h1 className="pb-h1">{naam}</h1>
        </div>
      </div>

      <div className="pb-proj-meta-strip">
        <div>
          <dt>Huidige fase</dt>
          <dd>
            F{currentPhase} · {curInfo.name}
            <span className="rcode">{curInfo.code}</span>
          </dd>
        </div>
        <div>
          <dt>Eerstvolgende mijlpaal</dt>
          <dd>{milestone}</dd>
        </div>
        <div>
          <dt>Projectbudget</dt>
          <dd className="mono">{budget}</dd>
        </div>
        <div>
          <dt>Startjaar</dt>
          <dd className="mono">{startYear}</dd>
        </div>
      </div>

      <div className="pb-stepper">
        {PHASES.map((p) => {
          const base = stepClass(p.n);
          return (
            <button
              type="button"
              key={p.n}
              className={`pb-step ${base} ${p.n === selPhase ? 'selected' : ''}`}
              onClick={() => setSelPhase(p.n)}
            >
              <span className="pb-step-dot">{base.includes('done') ? '✓' : p.n}</span>
              <span className="pb-step-name">
                {phaseLabels[p.n - 1]}
                <span className="pb-step-code">{p.code}</span>
              </span>
            </button>
          );
        })}
      </div>

      {selPhase === 1 ? (
        <>
          <div className="pb-phase-titlebar">
            <h3>
              Fase 1 · {phaseInfo.name} <span className="rcode">{phaseInfo.code}</span>
            </h3>
            <span className="meta">
              Processtappen &amp; rollen — RIP Fase 1 procesmodel{isLive ? ' (live)' : ''}
            </span>
          </div>
          <Fase1Swimlane statusById={statusById} />
          <div className="pb-deliverables">
            <div className="pb-deliverables-head">Projectplan — onderdelen</div>
            <div className="pb-docrow">
              {FASE1_DOCS.map((d) => {
                const ok = docOk(d.produceNode);
                return (
                  <div className={`pb-doc4 ${ok ? 'ok' : 'na'}`} key={d.key}>
                    <span className="num">{d.nr}</span>
                    <span className="info">
                      <span className="nm">{d.label}</span>
                      <span className="st">{ok ? 'Beschikbaar' : 'Nog niet'}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      ) : (
        <div className="pb-phase-empty">
          <h3>
            Fase {selPhase} · {phaseInfo.name} <span className="rcode">{phaseInfo.code}</span>
          </h3>
          <p>
            Het processtappen-model voor deze fase is nog niet gemodelleerd. Alleen{' '}
            <b>Fase 1 ({PHASES[0].code})</b> is volledig uitgewerkt — selecteer Fase 1 hierboven
            voor de swimlane met rollen, taken en deliverables.
          </p>
        </div>
      )}
    </div>
  );
}
