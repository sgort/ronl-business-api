import { useState, useEffect } from 'react';
import {
  FASE1_DOCS,
  HEALTH,
  nodeStatusFromHistory,
  type StatusKey,
} from '../../pages/infra-board/rip-model';
import { RIP_PHASES, ripPhaseByCode } from '../../pages/infra-board/rip-phases.catalog';
import { getMockPortfolio, type PortfolioProject } from '../../pages/infra-board/infra-board.data';
import {
  useActivityHistory,
  useInstanceDocuments,
  useOpenTasks,
  useRipActiveAcrossPhases,
  usePhaseSwimlane,
} from '../../services/infra.api';
import { businessApi } from '../../services/api';
import type { SignatureSpec } from '../../services/api';
import type { SwimNode, Task } from '@ronl/shared';
import PhaseSwimlane from './PhaseSwimlane';
import TaskFormViewer from '../CaseworkerDashboard/TaskFormViewer';
import ProcessVarsSection from '../CaseworkerDashboard/ProcessVarsSection';
import SigningPanel from './SigningPanel';
import type { ProjectRef } from '../../pages/InfraBoardDashboard';

interface Props {
  projectRef: ProjectRef;
  onBack: () => void;
}

/** Derive a node-status map for a MOCK project (no live instance), from the
 *  derived model's own nodes for whichever phase is currently on screen —
 *  keyed by `bpmnId` like every other status map, now that a swimlane node's
 *  `id` and `bpmnId` are the same value. */
function deriveMockStatus(
  project: PortfolioProject | undefined,
  nodes: SwimNode[]
): Record<string, StatusKey> {
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
  for (const n of nodes) {
    if (n.col < reached) out[n.bpmnId] = 'done';
    else if (n.col === reached)
      out[n.bpmnId] =
        isOnR21 && flag && (['risk', 'overdue', 'action'] as StatusKey[]).includes(flag)
          ? flag
          : 'active';
    else out[n.bpmnId] = !isOnR21 && project ? 'done' : 'todo';
  }
  return out;
}

/** Inline claim + complete panel for a single Operaton task. */
function TaskWorkPanel({ task, onDone }: { task: Task; onDone: (completed: Task) => void }) {
  const [claiming, setClaiming] = useState(false);
  const [isClaimed, setIsClaimed] = useState(!!task.assignee);
  const [variables, setVariables] = useState<Record<string, unknown> | null>(null);
  const [sig, setSig] = useState<SignatureSpec | null>(null);
  const [detailLoading, setDetailLoading] = useState(true);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Always fetch process variables AND the signing spec on mount so they're
  // visible before claiming — one extra request per OPENED task, never per
  // listed task. allSettled, not all: a blip in the (new) signature spec
  // endpoint must not blank the (long-working) variables display for every
  // ordinary, non-signing task — each result degrades independently, so a
  // failed spec fetch just falls back to "no signature required" instead of
  // discarding variables that already came back fine.
  useEffect(() => {
    setDetailLoading(true);
    Promise.allSettled([
      businessApi.task.variables(task.id),
      businessApi.validsign.taskSpec(task.id),
    ])
      .then(([varsResult, sigResult]) => {
        if (varsResult.status === 'fulfilled' && varsResult.value.success) {
          setVariables(varsResult.value.data as Record<string, unknown>);
        }
        if (sigResult.status === 'fulfilled' && sigResult.value.success && sigResult.value.data) {
          setSig(sigResult.value.data);
        }
      })
      .finally(() => setDetailLoading(false));
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
        ) : sig?.required ? (
          // No completion message here either, for the same reason as below:
          // onDone unmounts this panel, so anything set alongside it dies in
          // the same tick and never paints. The parent owns the confirmation.
          <SigningPanel taskId={task.id} spec={sig} onCompleted={() => onDone(task)} />
        ) : (
          <TaskFormViewer
            taskId={task.id}
            variables={variables}
            // No success message here: onDone unmounts this panel, so anything
            // set alongside it is destroyed in the same tick and never paints.
            // The parent owns the confirmation instead, because it survives.
            onCompleted={() => onDone(task)}
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
  const { data: docs } = useInstanceDocuments(projectRef.instanceId ?? null);
  const { data: allTasks, reload: reloadTasks } = useOpenTasks();

  // Tasks belonging to this process instance.
  const instanceTasks: Task[] = isLive
    ? (allTasks ?? []).filter((t) => t.processInstanceId === projectRef.instanceId)
    : [];
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  /** Last completed task, kept so the confirmation outlives the panel. */
  const [justCompleted, setJustCompleted] = useState<string | null>(null);
  const selectedTask = instanceTasks.find((t) => t.id === selectedTaskId) ?? null;

  // A live instance's phase is the phase whose process it is an instance OF,
  // so it has to be looked up rather than assumed: this used to hard-code
  // 'R2.1', which was true only while R2.1 was the sole deployed process.
  // Once R2.2…R6.1 were deployed, a project sitting in (say) R2.2 still
  // reported R2.1 here — wrong phase in the meta strip, no rung marked done,
  // and R2.1's swimlane rendered against an instance that has none of its
  // activity ids.
  //
  // Resolved from the live instance list rather than threaded through
  // ProjectRef: MijnDag also opens live projects (from a task, which carries
  // no phase), so a prop would arrive undefined on that path.
  const { data: liveInstances } = useRipActiveAcrossPhases();
  const livePhaseCode = isLive
    ? (liveInstances ?? []).find((i) => i.id === projectRef.instanceId)?.phaseCode
    : undefined;
  const currentPhaseCode = isLive ? (livePhaseCode ?? 'R2.1') : (mock?.ripPhaseCode ?? 'R2.1');
  const [selPhase, setSelPhase] = useState(currentPhaseCode);
  useEffect(() => {
    setSelPhase(currentPhaseCode);
  }, [projectRef.nr, projectRef.instanceId, currentPhaseCode]);

  const { data: phaseModel } = usePhaseSwimlane(selPhase);

  const statusById: Record<string, StatusKey> =
    isLive && history
      ? nodeStatusFromHistory(history)
      : deriveMockStatus(mock, phaseModel?.nodes ?? []);

  // Active tasks (open or claimed) → highlight matching swimlane nodes. A
  // node's id IS its bpmnId in a derived model, so a task's taskDefinitionKey
  // needs no translation through the model to become a node id.
  const activeNodeIds = new Set(instanceTasks.map((t) => t.taskDefinitionKey));

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

      {phaseModel ? (
        <>
          <div className="pb-phase-titlebar">
            <h3>
              {phaseInfo.name} <span className="rcode">{phaseInfo.code}</span>
            </h3>
            <span className="meta">
              Processtappen &amp; rollen — procesmodel{isLive ? ' (live)' : ''}
            </span>
          </div>
          <PhaseSwimlane
            model={phaseModel}
            statusById={statusById}
            claimedNodeIds={activeNodeIds}
          />
          {selPhase === 'R2.1' && (
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
          )}
        </>
      ) : (
        <div className="pb-phase-empty">
          <h3>
            {phaseInfo.name} <span className="rcode">{phaseInfo.code}</span>
          </h3>
          <p>
            Het processtappen-model voor deze fase is nog niet gemodelleerd, of kon niet worden
            opgehaald. Probeer het later opnieuw.
          </p>
        </div>
      )}

      {/* Live task work surface — only shown for live instances with open tasks. */}
      {isLive && instanceTasks.length > 0 && (
        <div className="pb-taken-section">
          <div className="pb-taken-head">
            <h3>Open taken ({instanceTasks.length})</h3>
          </div>
          {justCompleted && (
            <div className="v2-taken-msg v2-taken-msg-success" role="status">
              Taak voltooid: {justCompleted}
            </div>
          )}
          <div className="pb-taken-list">
            {instanceTasks.map((t) => (
              <button
                type="button"
                key={t.id}
                className={`pb-taken-item ${selectedTaskId === t.id ? 'active' : ''}`}
                onClick={() => {
                  setJustCompleted(null);
                  setSelectedTaskId((prev) => (prev === t.id ? null : t.id));
                }}
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
              onDone={(completed) => {
                setJustCompleted(completed.name);
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
