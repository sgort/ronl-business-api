// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import PhaseStepper, { type StepperPhase } from './PhaseStepper';

const PHASES: StepperPhase[] = [
  { code: '1', name: 'Rechtsbetrekking' },
  { code: '4+5', name: 'Behandeling en besluit', codeLabel: 'Fase 4+5' },
  { code: 'archivering', name: 'Archivering', codeLabel: 'Archiefwet' },
];
const classes: Record<string, string> = { '1': 'done', '4+5': 'active', archivering: '' };

describe('PhaseStepper', () => {
  it('renders one button per phase, in the Infra-board markup', () => {
    const { container } = render(<PhaseStepper phases={PHASES} stepClass={(c) => classes[c]} />);
    const steps = container.querySelectorAll('.pb-stepper > button.pb-step');
    expect(steps).toHaveLength(3);
    expect(steps[0].className).toContain('done');
    expect(steps[1].className).toContain('active');
    // A done step shows a tick; the others their 1-based position.
    expect([...steps].map((s) => s.querySelector('.pb-step-dot')?.textContent)).toEqual([
      '✓',
      '2',
      '3',
    ]);
    // codeLabel when given, the code otherwise.
    expect([...steps].map((s) => s.querySelector('.pb-step-code')?.textContent)).toEqual([
      '1',
      'Fase 4+5',
      'Archiefwet',
    ]);
  });

  it('keeps the Infra-board grid by adding neither a variant class nor an inline grid', () => {
    const { container } = render(<PhaseStepper phases={PHASES} stepClass={() => ''} />);
    const root = container.querySelector('.pb-stepper') as HTMLElement;
    expect(root.className).toBe('pb-stepper');
    expect(root.style.gridTemplateColumns).toBe('');
  });

  it.each([
    ['compact', 'cwp-stepper-compact'],
    ['full', 'cwp-stepper-full'],
  ] as const)('%s adds its class and one grid column per phase', (variant, cls) => {
    const { container } = render(
      <PhaseStepper phases={PHASES} stepClass={() => ''} variant={variant} />
    );
    const root = container.querySelector('.pb-stepper') as HTMLElement;
    expect(root.classList.contains(cls)).toBe(true);
    expect(root.style.gridTemplateColumns).toBe('repeat(3, minmax(0, 1fr))');
  });

  it('marks the selected phase and reports a click with its code', () => {
    const onSelect = vi.fn();
    const { container } = render(
      <PhaseStepper phases={PHASES} stepClass={() => ''} selected="4+5" onSelect={onSelect} />
    );
    const steps = container.querySelectorAll('button.pb-step');
    expect(steps[1].classList.contains('selected')).toBe(true);
    expect(steps[0].classList.contains('selected')).toBe(false);
    fireEvent.click(steps[2]);
    expect(onSelect).toHaveBeenCalledWith('archivering');
  });

  it('gives each step an accessible name and tooltip when stepTitle is set', () => {
    const { container } = render(
      <PhaseStepper
        phases={PHASES}
        stepClass={() => ''}
        stepTitle={(p) => `Fase ${p.code} · ${p.name}`}
      />
    );
    const step = container.querySelectorAll('button.pb-step')[1];
    expect(step.getAttribute('aria-label')).toBe('Fase 4+5 · Behandeling en besluit');
    expect(step.getAttribute('title')).toBe('Fase 4+5 · Behandeling en besluit');
  });

  it('sets no aria-label or title without stepTitle', () => {
    const { container } = render(<PhaseStepper phases={PHASES} stepClass={() => ''} />);
    const step = container.querySelector('button.pb-step') as HTMLElement;
    expect(step.hasAttribute('aria-label')).toBe(false);
    expect(step.hasAttribute('title')).toBe(false);
  });
});
