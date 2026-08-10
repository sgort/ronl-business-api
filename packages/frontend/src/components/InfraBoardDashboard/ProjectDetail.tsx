import { useState, useEffect } from 'react';
import {
  FASE1_NODES,
  FASE1_DOCS,
  HEALTH,
  nodeStatusFromHistory,
  type StatusKey,
} from '../../pages/infra-board/rip-model';
import { RIP_PHASES, ripPhaseByCode } from '../../pages/infra-board/rip-phases.catalog';
import { getMockPortfolio, type PortfolioProject } from '../../pages/infra-board/infra-board.data';
import { useActivityHistory, usePhase1Documents, useOpenTasks } from '../../services/infra.api';
import { businessApi } from '../../services/api';
import type { Task } from '@ronl/shared';
import Fase1Swimlane from './Fase1Swimlane';
import TaskFormViewer from '../CaseworkerDashboard/TaskFormViewer';
import ProcessVarsSection from '../CaseworkerDashboard/ProcessVarsSection';
import type { ProjectRef } from '../../pages/InfraBoardDashboard';

interface Props {
  projectRef: ProjectRef;
  onBack: () => void;
}

/** Derive a node-status map for a MOCK project (no live instance). */
function deriveMockStatus(project: PortfolioProject | undefined): Record<string, StatusKey> {
  const out: Record<string, StatusKey> = {};
  const curIdx = project ? RIP_PHASES.findIndex((p) => p.code === project.ripPhaseCode) : -1;
  const isOnR21 = curIdx === 0;
  // A mock project can never be 'wachtend' AT R2.1 (the ladder's first
  // rung — there's no predecessor to await), so when isOnR21 is true
  // this is always the illustrative wip-status the mock model gives it.
  const flag = isOnR21 ? project!.segments[0].status : undefined;
  const reached = !project
    ? 0
    : !isOnR21
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
        isOnR21 && flag && (['risk', 'overdue', 'action'] as StatusKey[]).includes(flag)
          ? flag
          : 'active';
    else out[n.id] = !isOnR21 && project ? 'done' : 'todo';
  }
  return out;
}

/** Inline claim + complete panel for a single Operaton task. */
function TaskWorkPanel({ task, onDone }: { task: Task; onDone: () => void }) {
  const [claiming, setClaiming] = useState(false);
  const [isClaimed, setIsClaimed] = useState(!!task.assignee);
  const [variables, setVariables] = useState<Record<string, unknown> | null>(null);
  const [detailLoading, setDetailLoading] = useState(true);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Always fetch process variables on mount so they're visible before claiming.
  useEffect(() => {
    setDetailLoading(true);
    businessApi.task.variables(task.id).then((res) => {
      if (res.success) setVariables(res.data as Record<string, unknown>);
      setDetailLoading(false);
    });
  }, [task.id]);

  const claim = async () => {
    setClaiming(true);
    setMsg(null);
    const res = await businessApi.task.claim(task.id);
    setClaiming(false);
    if (res.success) {
      setIsClaimed(true);
    } else {
      setMsg({ type: 'err', text: 'Claimen mislukt.' });
    }
  };

  return (
    <div className="pb-task-panel">
      <div className="pb-task-panel-head">
        <span className="pb-task-name">{task.name}</span>
        <span className={`v2-taken-pill ${isClaimed ? 'claimed' : 'open'}`}>
          {isClaimed ? 'Geclaimd' : 'Open'}
        </span>
      </div>

      <dl className="v2-taken-meta">
        <div>
          <dt>Aangemaakt</dt>
          <dd>{new Date(task.created).toLocaleString('nl-NL')}</dd>
        </div>
        {task.due && (
          <div>
            <dt>Deadline</dt>
            <dd className={new Date(task.due).getTime() < Date.now() ? 'v2-taken-overdue' : ''}>
              {new Date(task.due).toLocaleString('nl-NL')}
            </dd>
          </div>
        )}
        <div>
          <dt>Status</dt>
          <dd>{isClaimed ? 'Geclaimd' : 'Openstaand'}</dd>
        </div>
        <div>
          <dt>Taak ID</dt>
          <dd className="v2-taken-mono">{task.id}</dd>
        </div>
      </dl>

      <section className="v2-taken-section">
        <h3>Procesgegevens</h3>
        <ProcessVarsSection variables={variables} loading={detailLoading} />
      </section>

      {msg && (
        <div className={`v2-taken-msg v2-taken-msg-${msg.type === 'ok' ? 'success' : 'error'}`}>
          {msg.text}
        </div>
      )}

      <section className="v2-taken-section">
        <h3>Acties</h3>
        {!isClaimed ? (
          <button type="button" className="v2-btn" onClick={claim} disabled={claiming}>
            {claiming ? 'Claimen…' : 'Taak claimen'}
          </button>
        ) : (
          <TaskFormViewer
            taskId={task.id}
            variables={variables}
            onCompleted={() => {
              setMsg({ type: 'ok', text: 'Taak voltooid.' });
              onDone();
            }}
            onError={() => setMsg({ type: 'err', text: 'Opslaan mislukt.' })}
          />
        )}
      </section>
    </div>
  );
}

export default function ProjectDetail({ projectRef, onBack }: Props) {
  const mock = getMockPortfolio().find((p) => p.nr === projectRef.nr);
  const isLive = !!projectRef.instanceId;

  const { data: history, reload: reloadHistory } = useActivityHistory(
    projectRef.instanceId ?? null
  );
  const { data: docs } = usePhase1Documents(projectRef.instanceId ?? null);
  const { data: allTasks, reload: reloadTasks } = useOpenTasks();

  // Tasks belonging to this process instance.
  const instanceTasks: Task[] = isLive
    ? (allTasks ?? []).filter((t) => t.processInstanceId === projectRef.instanceId)
    : [];
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const selectedTask = instanceTasks.find((t) => t.id === selectedTaskId) ?? null;

  // live instances are always in Fase 1 (R2.1); mock rows carry their own phase.
  const currentPhaseCode = isLive ? 'R2.1' : (mock?.ripPhaseCode ?? 'R2.1');
  const [selPhase, setSelPhase] = useState(currentPhaseCode);
  useEffect(() => {
    setSelPhase(currentPhaseCode);
  }, [projectRef.nr, projectRef.instanceId, currentPhaseCode]);

  const statusById: Record<string, StatusKey> =
    isLive && history ? nodeStatusFromHistory(history) : deriveMockStatus(mock);

  // Active tasks (open or claimed) → highlight matching swimlane nodes.
  const activeNodeIds = new Set(
    instanceTasks.flatMap((t) =>
      FASE1_NODES.filter((n) => n.bpmnId === t.taskDefinitionKey).map((n) => n.id)
    )
  );

  const naam = mock?.naam ?? (docs?.variables?.projectName as string) ?? `Project ${projectRef.nr}`;
  const health = mock?.health ?? 'groen';
  const budget = mock?.budget ?? (docs?.variables?.confirmedBudget as string) ?? '—';
  const milestone = mock?.milestone ?? 'Lopende processtap';
  const startYear = mock?.startYear ?? new Date().getFullYear();

  const stepClass = (code: string) => {
    const idx = RIP_PHASES.findIndex((p) => p.code === code);
    const curIdx = RIP_PHASES.findIndex((p) => p.code === currentPhaseCode);
    if (idx < curIdx) return 'done';
    if (idx === curIdx) {
      const f = mock?.segments[idx]?.status;
      return f && (['risk', 'overdue', 'action'] as StatusKey[]).includes(f)
        ? `active ${f}`
        : 'active';
    }
    return 'todo';
  };

  const docOk = (produceNode: string) => statusById[produceNode] === 'done';
  const phaseInfo = ripPhaseByCode(selPhase)!;
  const curInfo = ripPhaseByCode(currentPhaseCode)!;

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
            {curInfo.name}
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
        {RIP_PHASES.map((p, i) => {
          const base = stepClass(p.code);
          return (
            <button
              type="button"
              key={p.code}
              className={`pb-step ${base} ${p.code === selPhase ? 'selected' : ''}`}
              onClick={() => setSelPhase(p.code)}
            >
              <span className="pb-step-dot">{base.includes('done') ? '✓' : i + 1}</span>
              <span className="pb-step-name">
                {p.name}
                <span className="pb-step-code">{p.code}</span>
              </span>
            </button>
          );
        })}
      </div>

      {selPhase === 'R2.1' ? (
        <>
          <div className="pb-phase-titlebar">
            <h3>
              {phaseInfo.name} <span className="rcode">{phaseInfo.code}</span>
            </h3>
            <span className="meta">
              Processtappen &amp; rollen — RIP Fase 1 procesmodel{isLive ? ' (live)' : ''}
            </span>
          </div>
          <Fase1Swimlane statusById={statusById} claimedNodeIds={activeNodeIds} />
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
            {phaseInfo.name} <span className="rcode">{phaseInfo.code}</span>
          </h3>
          <p>
            Het processtappen-model voor deze fase is nog niet gemodelleerd. Alleen{' '}
            <b>
              {RIP_PHASES[0].name} ({RIP_PHASES[0].code})
            </b>{' '}
            is volledig uitgewerkt — selecteer {RIP_PHASES[0].code} hierboven voor de swimlane met
            rollen, taken en deliverables.
          </p>
        </div>
      )}

      {/* Live task work surface — only shown for live instances with open tasks. */}
      {isLive && instanceTasks.length > 0 && (
        <div className="pb-taken-section">
          <div className="pb-taken-head">
            <h3>Open taken ({instanceTasks.length})</h3>
          </div>
          <div className="pb-taken-list">
            {instanceTasks.map((t) => (
              <button
                type="button"
                key={t.id}
                className={`pb-taken-item ${selectedTaskId === t.id ? 'active' : ''}`}
                onClick={() => setSelectedTaskId((prev) => (prev === t.id ? null : t.id))}
              >
                <span className="pb-taken-item-name">{t.name}</span>
                <span className={`v2-taken-pill ${t.assignee ? 'claimed' : 'open'}`}>
                  {t.assignee ? 'Geclaimd' : 'Open'}
                </span>
              </button>
            ))}
          </div>
          {selectedTask && (
            <TaskWorkPanel
              key={selectedTask.id}
              task={selectedTask}
              onDone={() => {
                setSelectedTaskId(null);
                reloadTasks();
                reloadHistory();
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
