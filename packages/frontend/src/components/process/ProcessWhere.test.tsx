// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { PhaseSet, PhaseSwimlaneModel } from '@ronl/shared';
import { AWB_SET } from '../../test/kapvergunningFixtures';
import type { ProcessContext } from './processContext';
import ProcessWhere from './ProcessWhere';

const model = (key: string, name: string): PhaseSwimlaneModel => ({
  phaseCode: key,
  processKey: key,
  processName: name,
  lanes: [{ key: 'Lane_Behandelaar', label: 'Behandelaar' }],
  nodes: [],
  edges: [],
});

const ctx = (over: Partial<ProcessContext> = {}): ProcessContext => ({
  models: {
    AwbShellProcess: model('AwbShellProcess', 'Awb Generiek proces'),
    TreeFellingPermitSubProcess: model(
      'TreeFellingPermitSubProcess',
      'Kapvergunning - Behandeling en besluit'
    ),
  },
  history: [],
  statusByProcess: {},
  current: { processKey: 'TreeFellingPermitSubProcess', nodeId: 'Sub_CaseReview' },
  phase: '4+5',
  phaseSet: AWB_SET,
  chain: [
    { instanceId: 'p', processKey: 'AwbShellProcess' },
    {
      instanceId: 'c',
      processKey: 'TreeFellingPermitSubProcess',
      calledFrom: 'Task_Phase45_Process',
    },
  ],
  hasLanes: true,
  ...over,
});

describe('ProcessWhere', () => {
  it('renders nothing for a process without phases', () => {
    const { container } = render(
      <ProcessWhere ctx={ctx({ phase: null, phaseSet: null })} onOpen={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('says which of the eight Awb phases the task is in', () => {
    render(<ProcessWhere ctx={ctx()} onOpen={vi.fn()} />);
    expect(screen.getByText('Waar sta ik · Awb-fase 4+5 · stap 4 van 8')).toBeTruthy();
  });

  it.each([
    ['6', 'Waar sta ik · Awb-fase 6 · stap 5 van 8'],
    ['1', 'Waar sta ik · Awb-fase 1 · stap 1 van 8'],
    ['archivering', 'Waar sta ik · Awb-fase Archivering · stap 8 van 8'],
  ] as const)('names phase %s by its Awb number and its step on the stepper', (phase, text) => {
    render(<ProcessWhere ctx={ctx({ phase })} onOpen={vi.fn()} />);
    expect(screen.getByText(text)).toBeTruthy();
  });

  it('marks earlier phases done and the current one active, each dot a named button', () => {
    const { container } = render(<ProcessWhere ctx={ctx()} onOpen={vi.fn()} />);
    const steps = [...container.querySelectorAll('.pb-stepper.cwp-stepper-compact .pb-step')];
    expect(steps).toHaveLength(8);
    expect(steps.slice(0, 3).every((s) => s.classList.contains('done'))).toBe(true);
    expect(steps[3].classList.contains('active')).toBe(true);
    expect(steps[4].classList.contains('done') || steps[4].classList.contains('active')).toBe(
      false
    );
    expect(screen.getByRole('button', { name: 'Fase 4+5 · Behandeling en besluit' })).toBeTruthy();
    // Archiving is named after its law, not numbered.
    expect(screen.getByRole('button', { name: 'Archiefwet · Archivering' })).toBeTruthy();
  });

  it('names the subprocess and the decision deadline in the caption when they apply', () => {
    const { container } = render(
      <ProcessWhere ctx={ctx()} deadline="2026-09-10T00:00:00Z" onOpen={vi.fn()} />
    );
    const cap = container.querySelector('.cwp-where-cap')!;
    expect(cap.querySelector('b')!.textContent).toBe('Fase 4+5 · Behandeling en besluit');
    expect(cap.textContent).toContain('in deelproces Kapvergunning - Behandeling en besluit');
    expect(cap.textContent).toContain('beslistermijn tot 10 sep');
  });

  it('leaves both clauses out for a task in the main process without a deadline', () => {
    const { container } = render(
      <ProcessWhere
        ctx={ctx({
          phase: '6',
          current: { processKey: 'AwbShellProcess', nodeId: 'Task_Phase6_Notify' },
          chain: [{ instanceId: 'p', processKey: 'AwbShellProcess' }],
        })}
        onOpen={vi.fn()}
      />
    );
    const cap = container.querySelector('.cwp-where-cap')!;
    expect(cap.textContent).toBe('Fase 6 · Bekendmaking');
  });

  it('opens the process at the chosen phase from a dot, and at the current one from the link', () => {
    const onOpen = vi.fn();
    render(<ProcessWhere ctx={ctx()} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: 'Fase 2 · Ontvangst' }));
    expect(onOpen).toHaveBeenLastCalledWith('2');
    fireEvent.click(screen.getByRole('button', { name: 'Bekijk proces →' }));
    expect(onOpen).toHaveBeenLastCalledWith('4+5');
  });

  describe('with phases the process declared itself', () => {
    const CLAIM: PhaseSet = {
      scheme: 'bpmn',
      label: 'Fase',
      phases: [
        { code: 'intake', name: 'Intake', codeLabel: 'Fase 1' },
        { code: 'claim', name: 'Claim opstellen', codeLabel: 'Fase 2' },
        { code: 'besluit', name: 'Directiebesluit', codeLabel: 'Fase 3' },
      ],
    };
    const claimCtx = () =>
      ctx({
        models: { Claim: model('Claim', 'Beheer capaciteitsclaim') },
        current: { processKey: 'Claim', nodeId: 'Task_PrepareStaffingClaim' },
        chain: [{ instanceId: 'p', processKey: 'Claim' }],
        phase: 'claim',
        phaseSet: CLAIM,
      });

    it("numbers the phase by its position, under the set's own label", () => {
      render(<ProcessWhere ctx={claimCtx()} onOpen={vi.fn()} />);
      expect(screen.getByText('Waar sta ik · Fase 2 · stap 2 van 3')).toBeTruthy();
    });

    it('draws one step per declared phase, and captions the current one', () => {
      const { container } = render(<ProcessWhere ctx={claimCtx()} onOpen={vi.fn()} />);
      expect(container.querySelectorAll('.pb-step')).toHaveLength(3);
      expect(container.querySelector('.cwp-where-cap b')!.textContent).toBe(
        'Fase 2 · Claim opstellen'
      );
    });

    it('opens the process at a declared phase by its code', () => {
      const onOpen = vi.fn();
      render(<ProcessWhere ctx={claimCtx()} onOpen={onOpen} />);
      fireEvent.click(screen.getByRole('button', { name: 'Fase 3 · Directiebesluit' }));
      expect(onOpen).toHaveBeenLastCalledWith('besluit');
    });
  });
});
