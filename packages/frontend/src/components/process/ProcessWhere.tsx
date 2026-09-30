import { AWB_PHASES, type AwbPhaseCode } from '@ronl/shared';
import PhaseStepper from './PhaseStepper';
import { AWB_STEPPER_PHASES, awbStepClass, awbStepTitle } from './awbStepper';
import type { ProcessContext } from './processContext';
import './caseworker-process.css';

/**
 * "Waar sta ik": the compact Awb-fase stepper under the task header. Hidden
 * for a process whose BPMN carries no ronl:awbPhase markers.
 */
export default function ProcessWhere({
  ctx,
  deadline,
  onOpen,
}: {
  ctx: ProcessContext;
  /** awbDeadlineDate, when the process has set one. */
  deadline?: string | null;
  onOpen: (phase: AwbPhaseCode) => void;
}) {
  const phase = ctx.awbPhase;
  if (!phase) return null;
  const at = AWB_PHASES.findIndex((p) => p.code === phase);
  const top = ctx.chain[0]?.processKey;
  const inSub = !!top && ctx.current.processKey !== top;
  const subName = ctx.models[ctx.current.processKey]?.processName ?? ctx.current.processKey;

  return (
    <div className="cwp-where pbd">
      <div className="cwp-where-head">
        <span className="cwp-eyebrow">
          {/* The legal phase number, then the position on the stepper: 4+5 is
              one step, so from Fase 6 on the two differ. */}
          Waar sta ik · Awb-fase {phase === 'archivering' ? AWB_PHASES[at].name : phase} · stap{' '}
          {at + 1} van {AWB_PHASES.length}
        </span>
        <button type="button" className="cwp-link" onClick={() => onOpen(phase)}>
          Bekijk proces →
        </button>
      </div>
      <PhaseStepper
        phases={AWB_STEPPER_PHASES}
        stepClass={awbStepClass(phase)}
        variant="compact"
        stepTitle={awbStepTitle}
        onSelect={(code) => onOpen(code as AwbPhaseCode)}
      />
      <p className="cwp-where-cap">
        <b>
          Fase {phase} · {AWB_PHASES[at].name}
        </b>
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
