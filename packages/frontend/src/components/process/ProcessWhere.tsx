import PhaseStepper from './PhaseStepper';
import { phaseRef, phaseStepClass, phaseStepTitle, stepperPhases } from './phaseSet';
import type { ProcessContext } from './processContext';
import './caseworker-process.css';

/**
 * "Waar sta ik": the compact phase stepper under the task header -- the Awb
 * phases, or the phases the process declares itself. Hidden for a process
 * whose BPMN carries no phase markers.
 */
export default function ProcessWhere({
  ctx,
  deadline,
  onOpen,
}: {
  ctx: ProcessContext;
  /** awbDeadlineDate, when the process has set one. */
  deadline?: string | null;
  onOpen: (phase: string) => void;
}) {
  const { phase, phaseSet: set } = ctx;
  if (!phase || !set) return null;
  const at = set.phases.findIndex((p) => p.code === phase);
  if (at < 0) return null;
  const current = set.phases[at];
  const top = ctx.chain[0]?.processKey;
  const inSub = !!top && ctx.current.processKey !== top;
  const subName = ctx.models[ctx.current.processKey]?.processName ?? ctx.current.processKey;

  return (
    <div className="cwp-where pbd">
      <div className="cwp-where-head">
        <span className="cwp-eyebrow">
          {/* The phase's own reference, then the position on the stepper: Awb
              4+5 is one step, so from Fase 6 on the two differ. */}
          Waar sta ik · {set.label} {phaseRef(set, phase)} · stap {at + 1} van {set.phases.length}
        </span>
        <button type="button" className="cwp-link" onClick={() => onOpen(phase)}>
          Bekijk proces →
        </button>
      </div>
      <PhaseStepper
        phases={stepperPhases(set)}
        stepClass={phaseStepClass(set, phase)}
        variant="compact"
        stepTitle={phaseStepTitle}
        onSelect={onOpen}
      />
      <p className="cwp-where-cap">
        <b>{phaseStepTitle(current)}</b>
        {inSub && (
          <>
            {' · in deelproces '}
            <i>{subName}</i>
          </>
        )}
        {deadline && (
          <>
            {' · beslistermijn tot '}
            {new Date(deadline).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
          </>
        )}
      </p>
    </div>
  );
}
