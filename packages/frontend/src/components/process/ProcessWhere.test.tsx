// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { PhaseSwimlaneModel } from '@ronl/shared';
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
  awbPhase: '4+5',
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
  it('renders nothing for a process without Awb phases', () => {
    const { container } = render(<ProcessWhere ctx={ctx({ awbPhase: null })} onOpen={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('says which of the eight Awb phases the task is in', () => {
    render(<ProcessWhere ctx={ctx()} onOpen={vi.fn()} />);
    expect(screen.getByText('Waar sta ik · Awb-fase 4 van 8')).toBeTruthy();
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
    expect(screen.getByRole('button', { name: 'Fase archivering · Archivering' })).toBeTruthy();
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
          awbPhase: '6',
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
});
