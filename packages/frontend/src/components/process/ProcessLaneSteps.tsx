import { useState, type CSSProperties } from 'react';
import { phaseRef } from './phaseSet';
import type { ProcessContext } from './processContext';
import {
  KIND_TAG,
  buildTrail,
  collapseFrom,
  currentGroupIndex,
  groupByLane,
  laneMeta,
  myLaneKeys,
  transitionLabel,
  type TrailStep,
} from './laneSteps';
import { edgeLabelText } from './swimlaneText';
import './caseworker-process.css';

const fmt = (d: string) =>
  new Date(d).toLocaleString('nl-NL', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

/** The phase of the call activity that runs a called process, for its "deelproces" tag: "4+5". */
function calledPhase(ctx: ProcessContext, processKey: string): string | undefined {
  for (const model of Object.values(ctx.models)) {
    const call = model.nodes.find((n) => n.kind === 'call' && n.calls === processKey);
    if (call?.phase && model.phaseSet) return phaseRef(model.phaseSet, call.phase);
  }
  return undefined;
}

function StepMeta({ step }: { step: TrailStep }) {
  let text;
  if (step.state === 'next') {
    text = step.branches ? `Hierna · splitst: ${step.branches.join(' / ')}` : 'Hierna';
  } else if (step.state === 'running') {
    text = (
      <>
        {step.start ? `${fmt(step.start)} · ` : ''}
        <b>
          {step.isMine
            ? 'Jouw taak — loopt nog'
            : step.kind === 'call'
              ? 'Deelproces loopt'
              : 'Loopt nog'}
        </b>
      </>
    );
  } else {
    const at = step.end ?? step.start;
    text = `${at ? `${fmt(at)} · ` : ''}${step.canceled ? 'Afgebroken' : 'Afgerond'}`;
  }
  return (
    <span className="cwp-st-meta">
      <span>{text}</span>
      {step.dmn && <span className="cwp-doc">DMN {step.dmn}</span>}
      {step.doc && <span className="cwp-doc">{step.doc}</span>}
    </span>
  );
}

/**
 * Processtappen per rol: the task's history and what comes next, grouped by
 * lane, with the handovers between lanes and in and out of a subprocess.
 * By default only the two groups before the current one are shown. The
 * parent keys this component by task, so the collapse resets per task.
 */
export default function ProcessLaneSteps({
  ctx,
  roles,
  onOpen,
}: {
  ctx: ProcessContext;
  roles: readonly string[];
  onOpen: (phase?: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const groups = groupByLane(buildTrail(ctx), ctx);
  const current = currentGroupIndex(groups);
  const from = collapseFrom(groups, expanded);
  const hiddenSteps = groups.slice(0, from).reduce((n, g) => n + g.steps.length, 0);

  return (
    <div className="cwp-lanesteps">
      {from > 0 && (
        <button type="button" className="cwp-more" onClick={() => setExpanded(true)}>
          ▸ {hiddenSteps} eerdere stappen tonen
        </button>
      )}
      {groups.map((g, gi) => {
        if (gi < from) return null;
        const model = ctx.models[g.processKey];
        const lane = model.lanes.find((l) => l.key === g.laneKey) ?? {
          key: g.laneKey,
          label: g.laneKey,
        };
        const meta = laneMeta(lane);
        const mine = myLaneKeys(model, roles).has(g.laneKey);
        const phase = g.sub ? calledPhase(ctx, g.processKey) : undefined;
        const prev = groups[gi - 1];
        return (
          <div key={gi} className="cwp-lg-wrap">
            {gi > from && (
              <div className={`cwp-handover${prev.processKey !== g.processKey ? ' proc' : ''}`}>
                {transitionLabel(prev, g, ctx)}
              </div>
            )}
            <section
              className={[
                'cwp-lg',
                mine ? 'mine' : '',
                gi === current ? 'current' : '',
                g.future ? 'future' : '',
                g.sub ? 'sub' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              style={{ '--lane': meta.colour } as CSSProperties}
            >
              <header className="cwp-lg-head">
                <span className="cwp-lane-chip">{meta.short}</span>
                <span className="cwp-lg-name">{lane.label}</span>
                {g.sub && <span className="cwp-lg-proc">deelproces{phase ? ` ${phase}` : ''}</span>}
                {mine && <span className="cwp-jij">jouw rol</span>}
              </header>
              <ol>
                {g.steps.map((s, si) => (
                  <li
                    key={si}
                    className={[
                      'cwp-st',
                      s.state,
                      s.kind,
                      s.isMine ? 'me' : '',
                      s.canceled ? 'canceled' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <span className="cwp-st-dot" aria-hidden="true" />
                    <span className="cwp-st-body">
                      <span className="cwp-st-name">
                        {s.outcome ? `${s.label} → ${edgeLabelText(s.outcome)}` : s.label}
                      </span>
                      <StepMeta step={s} />
                    </span>
                    <span className="cwp-st-type">{KIND_TAG[s.kind] ?? ''}</span>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        );
      })}
      <button
        type="button"
        className="cwp-link cwp-lanesteps-foot"
        onClick={() => onOpen(ctx.phase ?? undefined)}
      >
        Hele proces als swimlane bekijken →
      </button>
    </div>
  );
}
