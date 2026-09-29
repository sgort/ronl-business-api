// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PaletteActionsProvider } from './PaletteActions';
import { usePaletteAction, usePaletteActions } from './paletteActionsContext';
import CommandPalette from './CommandPalette';
import type { GateContext } from '../../pages/caseworker-v2/modes.config';

const gate: GateContext = {
  isAuthenticated: true,
  userRoles: [],
  userOrgType: null,
  tenantSectionIds: null,
};

function Registers({ on, run }: { on: boolean; run: () => void }) {
  usePaletteAction(on ? { id: 'x', label: 'Proces van deze taak bekijken', run } : null);
  return null;
}

function Lists() {
  const actions = usePaletteActions();
  return (
    <ul>
      {actions.map((a) => (
        <li key={a.id}>{a.label}</li>
      ))}
    </ul>
  );
}

describe('palette actions', () => {
  it('registers an action while asked to, and removes it when no longer', () => {
    const { rerender } = render(
      <PaletteActionsProvider>
        <Registers on run={vi.fn()} />
        <Lists />
      </PaletteActionsProvider>
    );
    expect(screen.getByText('Proces van deze taak bekijken')).toBeTruthy();
    rerender(
      <PaletteActionsProvider>
        <Registers on={false} run={vi.fn()} />
        <Lists />
      </PaletteActionsProvider>
    );
    expect(screen.queryByText('Proces van deze taak bekijken')).toBeNull();
  });

  it('removes the action when its owner unmounts', () => {
    const { rerender } = render(
      <PaletteActionsProvider>
        <Registers on run={vi.fn()} />
        <Lists />
      </PaletteActionsProvider>
    );
    rerender(
      <PaletteActionsProvider>
        <Lists />
      </PaletteActionsProvider>
    );
    expect(screen.queryByText('Proces van deze taak bekijken')).toBeNull();
  });

  it('is a harmless no-op outside a provider', () => {
    render(
      <>
        <Registers on run={vi.fn()} />
        <Lists />
      </>
    );
    expect(screen.queryByText('Proces van deze taak bekijken')).toBeNull();
  });

  it('shows a registered action first in the palette, and runs the latest callback', async () => {
    const user = userEvent.setup();
    const first = vi.fn();
    const latest = vi.fn();
    const onClose = vi.fn();
    const onSelect = vi.fn();
    const tree = (run: () => void) => (
      <PaletteActionsProvider>
        <Registers on run={run} />
        <CommandPalette open onClose={onClose} onSelect={onSelect} gateContext={gate} />
      </PaletteActionsProvider>
    );
    const { rerender } = render(tree(first));
    rerender(tree(latest));
    const items = screen.getAllByRole('listitem');
    expect(items[0].textContent).toContain('Proces van deze taak bekijken');
    await user.click(items[0]);
    expect(latest).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('finds the action by query and runs it with Enter', async () => {
    const user = userEvent.setup();
    const run = vi.fn();
    render(
      <PaletteActionsProvider>
        <Registers on run={run} />
        <CommandPalette open onClose={vi.fn()} onSelect={vi.fn()} gateContext={gate} />
      </PaletteActionsProvider>
    );
    await user.keyboard('proces van');
    await user.keyboard('{Enter}');
    expect(run).toHaveBeenCalled();
  });
});
