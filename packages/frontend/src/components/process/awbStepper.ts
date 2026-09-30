import { AWB_PHASES, type AwbPhaseCode } from '@ronl/shared';
import type { StepperPhase } from './PhaseStepper';

/** The Awb phases as stepper phases: the position is the dot, "Fase <code>" (or Archiefwet) the code line. */
export const AWB_STEPPER_PHASES: StepperPhase[] = AWB_PHASES.map((p) => ({
  code: p.code,
  name: p.name,
  codeLabel: p.code === 'archivering' ? 'Archiefwet' : `Fase ${p.code}`,
}));

export const awbStepTitle = (p: StepperPhase) => `Fase ${p.code} · ${p.name}`;

/** done before the current phase, active on it, nothing after. */
export const awbStepClass = (current: AwbPhaseCode) => {
  const at = AWB_PHASES.findIndex((p) => p.code === current);
  return (code: string) => {
    const i = AWB_PHASES.findIndex((p) => p.code === code);
    return i < at ? 'done' : i === at ? 'active' : '';
  };
};
