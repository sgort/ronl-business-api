import './process-view.css';

export interface StepperPhase {
  code: string;
  name: string;
  /** Text under the name; the code itself when absent (the Infra-board's RIP codes). */
  codeLabel?: string;
}

/**
 * The phase stepper shared by the Infra-board (RIP phases) and the caseworker
 * procesweergave (Awb phases). The markup is the Infra-board's `.pb-stepper`
 * unchanged; `variant` only adds a class and an explicit grid, so the default
 * renders exactly what ProjectDetail rendered inline before.
 */
export default function PhaseStepper({
  phases,
  stepClass,
  selected = null,
  onSelect,
  variant = 'default',
  stepTitle,
}: {
  phases: StepperPhase[];
  /** State classes for a phase, e.g. 'done', 'active', 'risk', or ''. */
  stepClass: (code: string) => string;
  selected?: string | null;
  onSelect?: (code: string) => void;
  /** default = Infra-board; compact = "Waar sta ik"; full = the procesweergave overlay. */
  variant?: 'default' | 'compact' | 'full';
  /** Accessible name and tooltip per step, e.g. "Fase 4+5 · Behandeling en besluit". */
  stepTitle?: (phase: StepperPhase) => string;
}) {
  const variantClass =
    variant === 'compact' ? ' cwp-stepper-compact' : variant === 'full' ? ' cwp-stepper-full' : '';
  return (
    <div
      className={`pb-stepper${variantClass}`}
      style={
        variant === 'default'
          ? undefined
          : { gridTemplateColumns: `repeat(${phases.length}, minmax(0, 1fr))` }
      }
    >
      {phases.map((p, i) => {
        const base = stepClass(p.code);
        const title = stepTitle?.(p);
        return (
          <button
            type="button"
            key={p.code}
            className={`pb-step ${base} ${p.code === selected ? 'selected' : ''}`}
            onClick={() => onSelect?.(p.code)}
            {...(title ? { 'aria-label': title, title } : {})}
          >
            <span className="pb-step-dot">{base.includes('done') ? '✓' : i + 1}</span>
            <span className="pb-step-name">
              {p.name}
              <span className="pb-step-code">{p.codeLabel ?? p.code}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
