// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Task } from '@ronl/shared';
import ProcessOverlay from './ProcessOverlay';
import { A, NOTIFY, REVIEW, S } from '../../test/kapvergunningFixtures';

const task = { id: 'task-1', name: 'Beoordeling behandelaar' } as Task;

const open = (props: Partial<Parameters<typeof ProcessOverlay>[0]> = {}) =>
  render(
    <ProcessOverlay task={task} ctx={REVIEW} roles={['caseworker']} onClose={vi.fn()} {...props} />
  );

const title = (c: HTMLElement) => c.querySelector('.pb-phase-titlebar .rcode')!.textContent;

describe('ProcessOverlay', () => {
  it('is a modal dialog named by its heading', () => {
    open();
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(screen.getByRole('dialog', { name: 'Beoordeling behandelaar' })).toBe(dialog);
  });

  it('closes on Esc and on a backdrop click, not on a click inside the panel', () => {
    const onClose = vi.fn();
    const { container } = open({ onClose });
    fireEvent.click(container.querySelector('.cwp-ov-panel')!);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('focuses the close button, keeps Tab inside the panel, and gives focus back on close', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    const { unmount } = open();
    const close = screen.getByRole('button', { name: /Sluiten/ });
    expect(document.activeElement).toBe(close);

    const focusables = [...screen.getByRole('dialog').querySelectorAll<HTMLElement>('button')];
    const last = focusables[focusables.length - 1];
    // Shift+Tab from the first wraps to the last, Tab from the last to the first.
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(focusables[0]);

    unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it('opens on the task’s own process, with its node marked "jouw taak" and its lane "jouw rol"', () => {
    const { container } = open();
    expect(title(container)).toBe(S);
    const claimed = container.querySelector('.pb-swim-node-claimed')!;
    expect(claimed.querySelector('.pb-swim-inprogress')!.textContent).toBe('jouw taak');
    expect(container.querySelector('.pb-swim-lane-label.cwp-mine')!.textContent).toContain(
      'jouw rol'
    );
  });

  it('switches between main process and subprocess by breadcrumb and by "open ↘"', () => {
    const { container } = open();
    fireEvent.click(screen.getByRole('button', { name: 'Hoofdproces' }));
    expect(title(container)).toBe(A);
    // On the main process the task's node is not drawn, so nothing is "jouw taak".
    expect(container.querySelector('.pb-swim-node-claimed')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^open deelproces/ }));
    expect(title(container)).toBe(S);
    fireEvent.click(screen.getByRole('button', { name: 'Hoofdproces' }));
    fireEvent.click(screen.getByRole('button', { name: 'Deelproces fase 4+5' }));
    expect(title(container)).toBe(S);
  });

  it('picks the model from the phase: 4+5 is the subprocess, any other phase the main process', () => {
    const { container } = open();
    fireEvent.click(screen.getByRole('button', { name: 'Fase 6 · Bekendmaking' }));
    expect(title(container)).toBe(A);
    fireEvent.click(screen.getByRole('button', { name: 'Fase 4+5 · Behandeling en besluit' }));
    expect(title(container)).toBe(S);
  });

  it('opens at a requested phase', () => {
    const { container } = open({ initialPhase: '3' });
    expect(title(container)).toBe(A);
    expect(container.querySelector('.pb-step.selected')!.getAttribute('aria-label')).toBe(
      'Fase 3 · Ontvankelijkheid'
    );
  });

  it('shows the legend with its text, not colour alone', () => {
    const { container } = open();
    const legend = container.querySelector('.cwp-legend')!.textContent;
    for (const t of [
      'Afgerond',
      'Loopt',
      'Jouw taak',
      'Jouw rol (caseworker)',
      'Automatisch (script / DMN)',
      'Nog niet / niet doorlopen',
    ])
      expect(legend).toContain(t);
  });

  it('names the dossier and the process in the eyebrow', () => {
    const { container } = open({ dossierRef: 'AWB-2026-164544' });
    expect(container.querySelector('.cwp-ov-head .cwp-eyebrow')!.textContent).toBe(
      `AWB-2026-164544 · ${S}`
    );
  });

  it('has no breadcrumb for a process that calls no subprocess', () => {
    const { container } = open({
      ctx: {
        ...NOTIFY,
        models: {
          [A]: {
            ...NOTIFY.models[A],
            nodes: NOTIFY.models[A].nodes.filter((n) => n.kind !== 'call'),
          },
        },
      },
    });
    expect(container.querySelector('.cwp-crumbs')).toBeNull();
  });

  it('keeps keyboard control after "open ↘" removes the focused button', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    open({ onClose });
    await user.click(screen.getByRole('button', { name: 'Hoofdproces' }));
    screen.getByRole('button', { name: /^open deelproces/ }).focus();
    await user.keyboard('{Enter}');
    // The subprocess has no call node: the button is gone, focus must not be.
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Esc and pulls Tab back into the panel even when focus has left it', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    open({ onClose });
    (document.activeElement as HTMLElement).blur();
    expect(document.activeElement).toBe(document.body);
    await user.keyboard('{Tab}');
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
    (document.activeElement as HTMLElement).blur();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('returns focus to the fallback when whatever opened it is gone (the ⌘K palette)', () => {
    const fallback = document.createElement('h2');
    fallback.tabIndex = -1;
    document.body.appendChild(fallback);
    (document.activeElement as HTMLElement | null)?.blur();
    const { unmount } = open({ returnFocus: () => fallback });
    unmount();
    expect(document.activeElement).toBe(fallback);
    fallback.remove();
  });
});
