import type { PhaseSet } from '@ronl/shared';
import type { StepperPhase } from './PhaseStepper';

/** A model's phases as stepper phases: the position is the dot, the codeLabel the line under the name. */
export const stepperPhases = (set: PhaseSet): StepperPhase[] =>
  set.phases.map((p) => ({ code: p.code, name: p.name, codeLabel: p.codeLabel }));

/** "Fase 4+5 · Behandeling en besluit": the step's tooltip and the caption under the stepper. */
export const phaseStepTitle = (p: StepperPhase) => `${p.codeLabel ?? p.code} · ${p.name}`;

/** done before the current phase, active on it, nothing after. */
export const phaseStepClass = (set: PhaseSet, current: string) => {
  const at = set.phases.findIndex((p) => p.code === current);
  return (code: string) => {
    const i = set.phases.findIndex((p) => p.code === code);
    return i < at ? 'done' : i === at ? 'active' : '';
  };
};

/**
 * The short form after the set's label, "Awb-fase 4+5" or "Fase 2": the legal
 * phase number for Awb (archiving by name, it has none), the position for a
 * set the process declared itself, whose codes are identifiers, not numbers.
 */
export const phaseRef = (set: PhaseSet, code: string): string => {
  const i = set.phases.findIndex((p) => p.code === code);
  if (i < 0) return code;
  if (set.scheme === 'bpmn') return String(i + 1);
  return code === 'archivering' ? set.phases[i].name : code;
};
