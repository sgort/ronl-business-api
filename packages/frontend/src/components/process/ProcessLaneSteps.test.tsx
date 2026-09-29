// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ProcessLaneSteps from './ProcessLaneSteps';
import { NOTIFY, REVIEW } from '../../test/kapvergunningFixtures';

const groupsIn = (c: HTMLElement) => [...c.querySelectorAll('section.cwp-lg')];

describe('ProcessLaneSteps', () => {
  it('shows only the two groups before the current one, with a button for the rest', () => {
    // REVIEW groups: main SYS, main BEH, sub SYS, sub BEH (current), sub SYS (future).
    const { container } = render(
      <ProcessLaneSteps ctx={REVIEW} roles={['caseworker']} onOpen={vi.fn()} />
    );
    expect(groupsIn(container)).toHaveLength(4);
    // The hidden group holds Identity, Completeness and the gateway: 3 steps.
    fireEvent.click(screen.getByRole('button', { name: '▸ 3 eerdere stappen tonen' }));
    expect(groupsIn(container)).toHaveLength(5);
    expect(screen.queryByRole('button', { name: /eerdere stappen tonen/ })).toBeNull();
  });

  it('collapses again when it is remounted for another task', () => {
    const { container, rerender } = render(
      <ProcessLaneSteps key="t1" ctx={REVIEW} roles={[]} onOpen={vi.fn()} />
    );
    fireEvent.click(screen.getByRole('button', { name: /eerdere stappen tonen/ }));
    rerender(<ProcessLaneSteps key="t2" ctx={REVIEW} roles={[]} onOpen={vi.fn()} />);
    expect(groupsIn(container)).toHaveLength(4);
  });

  it('marks the caseworker’s lanes "jouw rol" and tints them, and nobody else’s', () => {
    const { container, rerender } = render(
      <ProcessLaneSteps ctx={REVIEW} roles={['caseworker']} onOpen={vi.fn()} />
    );
    const mine = groupsIn(container).filter((g) => g.classList.contains('mine'));
    expect(mine.length).toBeGreaterThan(0);
    for (const g of mine) expect(g.querySelector('.cwp-jij')!.textContent).toBe('jouw rol');
    rerender(<ProcessLaneSteps ctx={REVIEW} roles={['citizen']} onOpen={vi.fn()} />);
    expect(container.querySelector('.cwp-jij')).toBeNull();
  });

  it('heads each group with its lane chip, colour and name, and tags subprocess groups', () => {
    const { container } = render(<ProcessLaneSteps ctx={REVIEW} roles={[]} onOpen={vi.fn()} />);
    const current = container.querySelector('section.cwp-lg.current') as HTMLElement;
    expect(current.querySelector('.cwp-lane-chip')!.textContent).toBe('BEH');
    expect(current.querySelector('.cwp-lg-name')!.textContent).toBe('Behandelaar');
    expect(current.style.getPropertyValue('--lane')).toBe('#0046ad');
    expect(current.classList.contains('sub')).toBe(true);
    expect(current.querySelector('.cwp-lg-proc')!.textContent).toBe('deelproces 4+5');
  });

  it('writes the handovers between groups', () => {
    const { container } = render(<ProcessLaneSteps ctx={REVIEW} roles={[]} onOpen={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /eerdere stappen tonen/ }));
    const lines = [...container.querySelectorAll('.cwp-handover')].map((l) => l.textContent);
    expect(lines).toEqual([
      '↓ Behandelaar',
      '↘ deelproces Kapvergunning - Behandeling en besluit',
      '↓ Behandelaar',
      '↓ daarna: Systeem',
    ]);
    expect(container.querySelectorAll('.cwp-handover.proc')).toHaveLength(1);
  });

  it('shows the user’s own running task, and what comes next up to the gateway', () => {
    const { container } = render(<ProcessLaneSteps ctx={REVIEW} roles={[]} onOpen={vi.fn()} />);
    const me = container.querySelector('li.cwp-st.me')!;
    expect(me.querySelector('.cwp-st-name')!.textContent).toBe('Beoordeling behandelaar');
    expect(me.querySelector('.cwp-st-meta')!.textContent).toContain('Jouw taak — loopt nog');
    expect(me.querySelector('.cwp-st-type')!.textContent).toBe('GEBRUIKERSTAAK');
    const next = [...container.querySelectorAll('li.cwp-st.next .cwp-st-meta')].map(
      (m) => m.textContent
    );
    expect(next).toEqual(['Hierna', 'Hierna · splitst: verleend / geweigerd']);
  });

  it('shows a gateway with its taken branch, and a running call activity as a running subprocess', () => {
    const { container } = render(<ProcessLaneSteps ctx={REVIEW} roles={[]} onOpen={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /eerdere stappen tonen/ }));
    const names = [...container.querySelectorAll('.cwp-st-name')].map((n) => n.textContent);
    expect(names).toContain('Aanvraag volledig? → ja');
    const call = [...container.querySelectorAll('li.cwp-st.call')][0];
    expect(call.querySelector('.cwp-st-meta')!.textContent).toContain('Deelproces loopt');
    expect(call.querySelector('.cwp-st-type')!.textContent).toBe('CALLACTIVITY');
  });

  it('writes a done step’s end time with "Afgerond", and shows its decision or document', () => {
    const { container } = render(<ProcessLaneSteps ctx={NOTIFY} roles={[]} onOpen={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /eerdere stappen tonen/ }));
    const completeness = [...container.querySelectorAll('li.cwp-st')].find(
      (li) => li.querySelector('.cwp-st-name')!.textContent === 'Fase 3: Ontvankelijkheidstoets'
    )!;
    expect(completeness.querySelector('.cwp-st-meta')!.textContent).toMatch(/· Afgerond/);
    expect(completeness.querySelector('.cwp-doc')!.textContent).toBe('DMN AwbCompletenessCheck');
    const notify = container.querySelector('li.cwp-st.me')!;
    expect(notify.querySelector('.cwp-doc')!.textContent).toBe('Beschikking kapvergunning');
    expect([...container.querySelectorAll('.cwp-handover')].map((l) => l.textContent)).toContain(
      '↗ terug in hoofdproces · Behandelaar'
    );
  });

  it('shows "Loopt nog" for a running step that is not the user’s', () => {
    const ctx = {
      ...REVIEW,
      current: { processKey: REVIEW.current.processKey, nodeId: 'Somebody_Else' },
    };
    const { container } = render(<ProcessLaneSteps ctx={ctx} roles={[]} onOpen={vi.fn()} />);
    const running = [...container.querySelectorAll('li.cwp-st.running .cwp-st-meta')].map(
      (m) => m.textContent
    );
    expect(running.some((t) => t!.includes('Loopt nog'))).toBe(true);
  });

  it('opens the whole process from the footer link', () => {
    const onOpen = vi.fn();
    render(<ProcessLaneSteps ctx={REVIEW} roles={[]} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: 'Hele proces als swimlane bekijken →' }));
    expect(onOpen).toHaveBeenCalled();
  });

  it('shows a cancelled step as "Afgebroken", never as "Afgerond"', () => {
    const ctx = {
      ...REVIEW,
      history: REVIEW.history.map((e) =>
        e.activityId === 'Sub_AssessPermit' ? { ...e, canceled: true } : e
      ),
    };
    const { container } = render(<ProcessLaneSteps ctx={ctx} roles={[]} onOpen={vi.fn()} />);
    const row = [...container.querySelectorAll('li.cwp-st')].find(
      (li) => li.querySelector('.cwp-st-name')!.textContent === 'Kapvergunning beoordelen (APV)'
    )!;
    expect(row.querySelector('.cwp-st-meta')!.textContent).toMatch(/Afgebroken/);
    expect(row.querySelector('.cwp-st-meta')!.textContent).not.toMatch(/Afgerond/);
    expect(row.classList.contains('canceled')).toBe(true);
  });

  it('does not announce every lane group as a separate landmark', () => {
    render(<ProcessLaneSteps ctx={REVIEW} roles={[]} onOpen={vi.fn()} />);
    expect(screen.queryAllByRole('region')).toHaveLength(0);
  });
});
