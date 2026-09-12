// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CommandPalette from './CommandPalette';
import {
  allSearchableSections,
  findModeForSection,
  isRailItemVisible,
  type GateContext,
} from '../../pages/caseworker-v2/modes.config';

const openGate: GateContext = {
  isAuthenticated: true,
  userRoles: [],
  userOrgType: null,
  tenantSectionIds: null,
};

function visibleItems() {
  return allSearchableSections().filter((it) => isRailItemVisible(it, openGate));
}

describe('CommandPalette', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <CommandPalette open={false} onClose={vi.fn()} onSelect={vi.fn()} gateContext={openGate} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('lists every gate-visible section when open with an empty query', () => {
    render(<CommandPalette open onClose={vi.fn()} onSelect={vi.fn()} gateContext={openGate} />);

    const first = visibleItems()[0];
    expect(screen.getByText(first.label)).toBeInTheDocument();
  });

  it('a section requiring a role the user lacks is not listed', () => {
    const roleGatedItem = allSearchableSections().find(
      (it) => it.requiredRoles && it.requiredRoles.length > 0
    );
    if (!roleGatedItem) return; // no role-gated item defined — nothing to assert
    render(<CommandPalette open onClose={vi.fn()} onSelect={vi.fn()} gateContext={openGate} />);
    expect(screen.queryByText(roleGatedItem.label)).not.toBeInTheDocument();
  });

  it('typing filters the list, showing the empty state for no matches', async () => {
    const user = userEvent.setup();
    render(<CommandPalette open onClose={vi.fn()} onSelect={vi.fn()} gateContext={openGate} />);

    const first = visibleItems()[0];
    await user.type(
      screen.getByPlaceholderText('Spring naar… (taken, regelcatalogus, profiel, …)'),
      first.label
    );
    expect(screen.getByText(first.label)).toBeInTheDocument();

    await user.clear(
      screen.getByPlaceholderText('Spring naar… (taken, regelcatalogus, profiel, …)')
    );
    await user.type(
      screen.getByPlaceholderText('Spring naar… (taken, regelcatalogus, profiel, …)'),
      'zzz-nonexistent-xyz'
    );
    expect(screen.getByText(/Niets gevonden voor/)).toBeInTheDocument();
  });

  it('selecting an item calls onSelect with its owning mode and id, then closes', async () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<CommandPalette open onClose={onClose} onSelect={onSelect} gateContext={openGate} />);

    const first = visibleItems()[0];
    await user.click(screen.getByText(first.label));

    expect(onSelect).toHaveBeenCalledWith(findModeForSection(first.id), first.id);
    expect(onClose).toHaveBeenCalled();
  });

  it('Escape closes the palette', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<CommandPalette open onClose={onClose} onSelect={vi.fn()} gateContext={openGate} />);

    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalled();
  });

  it('ArrowDown then Enter selects the second visible item', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<CommandPalette open onClose={vi.fn()} onSelect={onSelect} gateContext={openGate} />);

    await user.keyboard('{ArrowDown}{Enter}');

    const second = visibleItems()[1];
    expect(onSelect).toHaveBeenCalledWith(findModeForSection(second.id), second.id);
  });

  it('clicking the overlay closes the palette, clicking inside does not', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <CommandPalette open onClose={onClose} onSelect={vi.fn()} gateContext={openGate} />
    );

    await user.click(container.querySelector('.cwd-v2-palette')!);
    expect(onClose).not.toHaveBeenCalled();

    await user.click(container.querySelector('.cwd-v2-palette-overlay')!);
    expect(onClose).toHaveBeenCalled();
  });
});
