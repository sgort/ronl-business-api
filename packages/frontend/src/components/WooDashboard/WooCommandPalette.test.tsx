// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WooCommandPalette from './WooCommandPalette';
import { WOO_TABS } from '../../pages/woo/modes.config';

describe('WooCommandPalette', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <WooCommandPalette
        open={false}
        onClose={vi.fn()}
        onSelectTab={vi.fn()}
        onOpenRegister={vi.fn()}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('lists every view tab plus the register entry when open with an empty query', () => {
    render(
      <WooCommandPalette open onClose={vi.fn()} onSelectTab={vi.fn()} onOpenRegister={vi.fn()} />
    );

    for (const tab of WOO_TABS) {
      expect(screen.getByText(tab.label)).toBeInTheDocument();
    }
    expect(screen.getByText('Verzoekenregister')).toBeInTheDocument();
  });

  it('typing filters the list, and shows "Niets gevonden" when nothing matches', async () => {
    const user = userEvent.setup();
    render(
      <WooCommandPalette open onClose={vi.fn()} onSelectTab={vi.fn()} onOpenRegister={vi.fn()} />
    );

    await user.type(
      screen.getByPlaceholderText('Spring naar weergave of verzoek (ID, onderwerp)…'),
      WOO_TABS[0].label
    );
    expect(screen.getByText(WOO_TABS[0].label)).toBeInTheDocument();
    expect(screen.queryByText(WOO_TABS[1].label)).not.toBeInTheDocument();

    await user.clear(
      screen.getByPlaceholderText('Spring naar weergave of verzoek (ID, onderwerp)…')
    );
    await user.type(
      screen.getByPlaceholderText('Spring naar weergave of verzoek (ID, onderwerp)…'),
      'zzz-nonexistent'
    );
    expect(screen.getByText(/Niets gevonden voor/)).toBeInTheDocument();
  });

  it('clicking a view item selects that tab and closes the palette', async () => {
    const onSelectTab = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <WooCommandPalette
        open
        onClose={onClose}
        onSelectTab={onSelectTab}
        onOpenRegister={vi.fn()}
      />
    );

    await user.click(screen.getByText(WOO_TABS[0].label));

    expect(onSelectTab).toHaveBeenCalledWith(WOO_TABS[0].id);
    expect(onClose).toHaveBeenCalled();
  });

  it('clicking the register entry opens the register and closes the palette', async () => {
    const onOpenRegister = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <WooCommandPalette
        open
        onClose={onClose}
        onSelectTab={vi.fn()}
        onOpenRegister={onOpenRegister}
      />
    );

    await user.click(screen.getByText('Verzoekenregister'));

    expect(onOpenRegister).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('Escape closes the palette', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <WooCommandPalette open onClose={onClose} onSelectTab={vi.fn()} onOpenRegister={vi.fn()} />
    );

    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalled();
  });

  it('ArrowDown then Enter selects the second item', async () => {
    const onSelectTab = vi.fn();
    const user = userEvent.setup();
    render(
      <WooCommandPalette
        open
        onClose={vi.fn()}
        onSelectTab={onSelectTab}
        onOpenRegister={vi.fn()}
      />
    );

    await user.keyboard('{ArrowDown}{Enter}');

    expect(onSelectTab).toHaveBeenCalledWith(WOO_TABS[1].id);
  });

  it('clicking the overlay background closes the palette, clicking inside does not', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <WooCommandPalette open onClose={onClose} onSelectTab={vi.fn()} onOpenRegister={vi.fn()} />
    );

    await user.click(container.querySelector('.cwd-v2-palette')!);
    expect(onClose).not.toHaveBeenCalled();

    await user.click(container.querySelector('.cwd-v2-palette-overlay')!);
    expect(onClose).toHaveBeenCalled();
  });
});
